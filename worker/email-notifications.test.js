import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emailNotificationInternals,
  checkEmailProviderHealth,
  runEmailNotificationSchedule,
} from './email-notifications.js';

const {
  buildResendIdempotencyKey,
  sanitizeFollow,
  sanitizePreferences,
  mergePapers,
  isSubscriptionDue,
  resendSendErrorCode,
  renderDigest,
} = emailNotificationInternals;

function stubFetch(response) {
  const original = globalThis.fetch;
  globalThis.fetch = async () => response;
  return () => { globalThis.fetch = original; };
}

function jsonResponse(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  };
}

function createMemoryKv(entries = {}) {
  const values = new Map(Object.entries(entries).map(([key, value]) => [
    key,
    typeof value === 'string' ? value : JSON.stringify(value),
  ]));

  return {
    values,
    async get(key, type) {
      const value = values.get(key);
      if (value === undefined) return null;
      return type === 'json' ? JSON.parse(value) : value;
    },
    async put(key, value) {
      values.set(key, String(value));
    },
    async delete(key) {
      values.delete(key);
    },
    async list({ prefix = '' } = {}) {
      return {
        keys: [...values.keys()].filter(key => key.startsWith(prefix)).map(name => ({ name })),
        list_complete: true,
      };
    },
  };
}

test('sanitizes notification preferences and followed entities', () => {
  assert.deepEqual(sanitizePreferences({ enabled: true, frequency: 'weekly', maxPapers: 10 }), {
    enabled: true,
    frequency: 'weekly',
    maxPapers: 10,
  });
  assert.deepEqual(sanitizeFollow({
    type: 'institution',
    canonicalId: 'https://ror.org/02f40zc51',
    displayName: 'Leiden University',
    externalIds: { ror: 'https://ror.org/02f40zc51' },
  }), {
    type: 'institution',
    canonicalId: '02f40zc51',
    displayName: 'Leiden University',
    externalIds: { ror: '02f40zc51' },
    metadata: { categoryIds: [] },
  });
});

test('deduplicates digest papers while preserving every follow reason', () => {
  const papers = mergePapers([
    { id: 'one', doi: '10.1/same', title: 'Paper', matches: [{ type: 'author', canonicalId: 'A1', displayName: 'Ada' }] },
    { id: 'two', doi: 'https://doi.org/10.1/SAME', title: 'Paper', citationCount: 8, matches: [{ type: 'topic', canonicalId: 'T1', displayName: 'Physics' }] },
  ]);
  assert.equal(papers.length, 1);
  assert.equal(papers[0].citationCount, 8);
  assert.deepEqual(papers[0].matches.map(match => match.type), ['author', 'topic']);
});

test('sends daily subscriptions once per day and weekly subscriptions on Monday', () => {
  const monday = new Date('2026-07-27T07:00:00Z');
  const tuesday = new Date('2026-07-28T07:00:00Z');
  assert.equal(isSubscriptionDue({ enabled: true, frequency: 'daily' }, monday), true);
  assert.equal(isSubscriptionDue({ enabled: true, frequency: 'weekly' }, monday), true);
  assert.equal(isSubscriptionDue({ enabled: true, frequency: 'weekly' }, tuesday), false);
});

test('scheduled digest fetches and emails papers from every followed entity type', async () => {
  const now = new Date();
  now.setUTCHours(7, 0, 0, 0);
  const publicationDate = now.toISOString().slice(0, 10);
  const subscriptionKey = 'notification:subscription:user-1';
  const kv = createMemoryKv({
    [subscriptionKey]: {
      uid: 'user-1',
      email: 'reader@example.com',
      displayName: 'Reader',
      enabled: true,
      frequency: 'daily',
      maxPapers: 10,
      unsubscribeToken: 'unsubscribe-token',
      follows: [
        { type: 'author', canonicalId: 'A1', displayName: 'Ada Author', externalIds: {}, metadata: { categoryIds: [] } },
        { type: 'institution', canonicalId: 'I2', displayName: 'Research University', externalIds: {}, metadata: { categoryIds: [] } },
        { type: 'topic', canonicalId: 'T3', displayName: 'Cosmology', externalIds: {}, metadata: { categoryIds: [] } },
        { type: 'project', canonicalId: 'project-4', displayName: 'Discovery Project', externalIds: {}, metadata: { categoryIds: [] } },
      ],
      previewItems: [],
    },
  });
  const requests = [];
  let resendPayload;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input));
    requests.push(url.toString());

    if (url.hostname === 'api.openaire.eu') {
      return jsonResponse(200, {
        response: {
          results: {
            result: [{
              metadata: {
                'oaf:entity': {
                  'oaf:result': {
                    pid: [{ '@classname': 'doi', $: '10.1234/project-paper' }],
                  },
                },
              },
            }],
          },
        },
      });
    }

    if (url.hostname === 'api.openalex.org') {
      const filter = url.searchParams.get('filter') || '';
      const source = filter.includes('author.id:A1')
        ? 'Author'
        : filter.includes('institutions.id:I2')
          ? 'Institution'
          : filter.includes('topics.id:T3')
            ? 'Topic'
            : 'Project';
      return jsonResponse(200, {
        results: [{
          id: `https://openalex.org/W${source.length}`,
          doi: `https://doi.org/10.1234/${source.toLowerCase()}`,
          display_name: `${source} followed paper`,
          publication_date: publicationDate,
          cited_by_count: source.length,
          authorships: [{ author: { display_name: `${source} Researcher` } }],
          primary_location: {
            source: { display_name: 'PaperTok Journal' },
            landing_page_url: `https://example.com/${source.toLowerCase()}`,
          },
          open_access: { is_oa: true },
        }],
      });
    }

    if (url.hostname === 'api.resend.com' && url.pathname === '/emails') {
      resendPayload = JSON.parse(options.body);
      return jsonResponse(200, { id: 'email-provider-id' });
    }

    throw new Error(`Unexpected request: ${url}`);
  };

  try {
    const result = await runEmailNotificationSchedule({
      NOTIFICATION_STORE: kv,
      RESEND_API_KEY: 're_test',
    }, now.getTime());

    assert.deepEqual(result, { sent: 1, failed: 0 });
    assert.deepEqual(resendPayload.to, ['reader@example.com']);
    assert.equal(resendPayload.subject, '4 novedades científicas para ti');
    assert.equal(
      resendPayload.headers['List-Unsubscribe'],
      '<https://papertok-report-api.papertok-mugar123.workers.dev/notifications/unsubscribe?token=unsubscribe-token>',
    );
    ['Author', 'Institution', 'Topic', 'Project'].forEach(source => {
      assert.equal(resendPayload.html.includes(`${source} followed paper`), true);
    });
    assert.equal(requests.filter(url => url.startsWith('https://api.openalex.org/works')).length, 4);
    assert.equal(requests.filter(url => url.startsWith('https://api.openaire.eu/')).length, 1);
    assert.equal(requests.filter(url => url.startsWith('https://api.resend.com/emails')).length, 1);

    const storedSubscription = await kv.get(subscriptionKey, 'json');
    assert.equal(storedSubscription.lastSentAt, now.toISOString());
    assert.equal(storedSubscription.lastCheckedAt, now.toISOString());
    assert.equal(
      [...kv.values.entries()].some(([key, value]) => key.startsWith('notification:send-count:') && value === '1'),
      true,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('uses a fresh idempotency key for each allowed email test window', () => {
  const subscription = { uid: 'user-123' };
  const first = buildResendIdempotencyKey(subscription, { test: true, now: Date.parse('2026-07-27T18:05:10Z') });
  const retry = buildResendIdempotencyKey(subscription, { test: true, now: Date.parse('2026-07-27T18:05:50Z') });
  const nextAttempt = buildResendIdempotencyKey(subscription, { test: true, now: Date.parse('2026-07-27T18:06:11Z') });
  assert.equal(first, retry);
  assert.notEqual(first, nextAttempt);
});

test('keeps scheduled digest idempotency stable for the UTC day', () => {
  const subscription = { uid: 'user-123' };
  const morning = buildResendIdempotencyKey(subscription, { now: Date.parse('2026-07-27T07:00:00Z') });
  const evening = buildResendIdempotencyKey(subscription, { now: Date.parse('2026-07-27T20:00:00Z') });
  assert.equal(morning, evening);
});

test('reports the resend.dev recipient restriction instead of an invalid credential', () => {
  const code = resendSendErrorCode(403, {
    name: 'validation_error',
    message: 'You can only send testing emails to your own email address. Please verify a domain.',
  });
  assert.equal(code, 'EMAIL_TEST_RECIPIENT_RESTRICTED');
  assert.equal(resendSendErrorCode(403, { name: 'forbidden', message: 'Account suspended' }), 'EMAIL_PROVIDER_AUTH_FAILED');
});

test('treats a restricted (send-only) Resend key as available, not an auth failure', async () => {
  const restore = stubFetch(jsonResponse(401, {
    statusCode: 401,
    name: 'restricted_api_key',
    message: 'This API key is restricted to only send emails.',
  }));
  try {
    const health = await checkEmailProviderHealth({ RESEND_API_KEY: 're_restricted_key' });
    assert.equal(health.available, true);
    assert.equal(health.permissionLimited, true);
    assert.equal(health.code, undefined);
    assert.equal(health.senderMode, 'resend-test');
  } finally {
    restore();
  }
});

test('reports verified-domain sender mode for a restricted key with a custom from address', async () => {
  const restore = stubFetch(jsonResponse(401, { name: 'restricted_api_key', message: 'restricted' }));
  try {
    const health = await checkEmailProviderHealth({ RESEND_API_KEY: 're_x', RESEND_FROM_EMAIL: 'PaperTok <hi@papertok.io>' });
    assert.equal(health.available, true);
    assert.equal(health.senderMode, 'verified-domain');
  } finally {
    restore();
  }
});

test('still fails closed for a genuinely invalid Resend key', async () => {
  const restore = stubFetch(jsonResponse(401, {
    statusCode: 401,
    name: 'invalid_api_key',
    message: 'API key is invalid',
  }));
  try {
    const health = await checkEmailProviderHealth({ RESEND_API_KEY: 're_bad_key' });
    assert.equal(health.available, false);
    assert.equal(health.code, 'EMAIL_PROVIDER_AUTH_FAILED');
  } finally {
    restore();
  }
});

test('fails closed for a bare 403 with no restricted marker (blocked or suspended key)', async () => {
  const restore = stubFetch(jsonResponse(403, { name: 'forbidden', message: 'Account suspended' }));
  try {
    const health = await checkEmailProviderHealth({ RESEND_API_KEY: 're_blocked' });
    assert.equal(health.available, false);
    assert.equal(health.code, 'EMAIL_PROVIDER_AUTH_FAILED');
  } finally {
    restore();
  }
});

test('still detects a restricted key when Resend reports it as 403', async () => {
  const restore = stubFetch(jsonResponse(403, { name: 'restricted_api_key', message: 'This API key is restricted to only send emails.' }));
  try {
    const health = await checkEmailProviderHealth({ RESEND_API_KEY: 're_restricted' });
    assert.equal(health.available, true);
    assert.equal(health.permissionLimited, true);
  } finally {
    restore();
  }
});

test('fails closed when a 401 body is not valid JSON', async () => {
  const restore = stubFetch({
    status: 401,
    ok: false,
    json: async () => { throw new Error('not json'); },
  });
  try {
    const health = await checkEmailProviderHealth({ RESEND_API_KEY: 're_weird' });
    assert.equal(health.available, false);
    assert.equal(health.code, 'EMAIL_PROVIDER_AUTH_FAILED');
  } finally {
    restore();
  }
});

test('marks a verified domain as available with a full-access key', async () => {
  const restore = stubFetch(jsonResponse(200, { data: [{ status: 'verified' }] }));
  try {
    const health = await checkEmailProviderHealth({ RESEND_API_KEY: 're_full' });
    assert.equal(health.available, true);
    assert.equal(health.senderMode, 'verified-domain');
  } finally {
    restore();
  }
});

test('is not configured without a Resend API key', async () => {
  const health = await checkEmailProviderHealth({});
  assert.equal(health.configured, false);
  assert.equal(health.available, false);
  assert.equal(health.code, 'EMAIL_NOT_CONFIGURED');
});

test('escapes paper metadata in email HTML', () => {
  const digest = renderDigest({ frequency: 'daily', displayName: '<Nico>' }, [{
    title: '<script>alert(1)</script>',
    authors: ['Ada'],
    matches: [],
  }], 'https://example.com/unsubscribe', true);
  assert.equal(digest.html.includes('<script>alert(1)</script>'), false);
  assert.equal(digest.html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), true);
});
