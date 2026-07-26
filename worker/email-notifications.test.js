import test from 'node:test';
import assert from 'node:assert/strict';
import { emailNotificationInternals, checkEmailProviderHealth } from './email-notifications.js';

const { sanitizeFollow, sanitizePreferences, mergePapers, isSubscriptionDue, renderDigest } = emailNotificationInternals;

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
