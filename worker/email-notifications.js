const SUBSCRIPTION_PREFIX = 'notification:subscription:';
const UNSUBSCRIBE_PREFIX = 'notification:unsubscribe:';
const RESEND_API = 'https://api.resend.com';
const PAPER_TOK_URL = 'https://mugar123.github.io/papertok/#/following';
const MAX_FOLLOWS = 40;
const MAX_QUERIED_FOLLOWS = 24;
const MAX_PREVIEW_ITEMS = 20;
const DEFAULT_DAILY_SEND_LIMIT = 90;
const SEND_COUNT_PREFIX = 'notification:send-count:';
const TEST_IDEMPOTENCY_WINDOW_MS = 60_000;

export class EmailNotificationError extends Error {
  constructor(code, status = 400, message = code) {
    super(message);
    this.name = 'EmailNotificationError';
    this.code = code;
    this.status = status;
  }
}

function cleanText(value, maxLength = 300) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function escapeHtml(value) {
  return cleanText(value, 5_000)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

function normalizeId(value) {
  return cleanText(value, 300)
    .replace(/^https?:\/\/(?:api\.)?openalex\.org\//i, '')
    .replace(/^https?:\/\/ror\.org\//i, '')
    .replace(/^\/+|\/+$/g, '');
}

function sanitizeFollow(input = {}) {
  const type = input.type === 'concept' ? 'topic' : cleanText(input.type, 20);
  if (!['author', 'topic', 'institution', 'project'].includes(type)) return null;
  const canonicalId = normalizeId(input.canonicalId || input.id);
  const displayName = cleanText(input.displayName || input.name, 200);
  if (!canonicalId || !displayName) return null;
  return {
    type,
    canonicalId,
    displayName,
    externalIds: {
      ...(input.externalIds?.ror ? { ror: normalizeId(input.externalIds.ror) } : {}),
      ...(input.externalIds?.orcid ? { orcid: cleanText(input.externalIds.orcid, 50) } : {}),
    },
    metadata: {
      categoryIds: Array.isArray(input.metadata?.categoryIds)
        ? input.metadata.categoryIds.map(normalizeId).filter(Boolean).slice(0, 12)
        : [],
    },
  };
}

function paperKey(paper = {}) {
  const doi = cleanText(paper.doi, 300).toLowerCase().replace(/^https?:\/\/(?:dx\.)?doi\.org\//, '');
  if (doi) return `doi:${doi}`;
  if (paper.id) return `id:${cleanText(paper.id, 300).toLowerCase()}`;
  return `title:${cleanText(paper.title, 500).toLowerCase().replace(/[^a-z0-9]+/g, '')}`;
}

function sanitizePaper(input = {}) {
  const title = cleanText(input.title, 500);
  if (!title) return null;
  const authors = Array.isArray(input.authors)
    ? input.authors.map(author => cleanText(author?.name || author?.display_name || author, 120)).filter(Boolean).slice(0, 6)
    : [];
  const matches = Array.isArray(input._followedEntityMatches || input.matches)
    ? (input._followedEntityMatches || input.matches).map(sanitizeFollow).filter(Boolean).slice(0, 4)
    : [];
  return {
    id: cleanText(input.id, 300),
    doi: cleanText(input.doi, 300),
    title,
    authors,
    published: cleanText(input.published || input.publishedDate || (input.year ? `${input.year}-01-01` : ''), 40),
    journal: cleanText(input.journal, 200),
    citationCount: Math.max(0, Number(input.citationCount) || 0),
    openAccess: Boolean(input.openAccess),
    url: safeUrl(input.landingPageUrl || input.pdfUrl || (input.doi ? `https://doi.org/${input.doi}` : '')),
    matches,
  };
}

function sanitizePreferences(input = {}) {
  const frequency = input.frequency === 'weekly' ? 'weekly' : 'daily';
  const requestedMax = Number(input.maxPapers);
  const maxPapers = [3, 5, 10].includes(requestedMax) ? requestedMax : 5;
  return {
    enabled: Boolean(input.enabled),
    frequency,
    maxPapers,
  };
}

async function verifyFirebaseIdentity(request, env) {
  const authorization = request.headers.get('authorization') || '';
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new EmailNotificationError('EMAIL_AUTH_REQUIRED', 401);
  if (!env.FIREBASE_WEB_API_KEY) throw new EmailNotificationError('EMAIL_NOT_CONFIGURED', 503);

  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(env.FIREBASE_WEB_API_KEY)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idToken: token }),
  });
  const payload = await response.json().catch(() => ({}));
  const account = payload?.users?.[0];
  if (!response.ok || !account?.localId || !account?.email) {
    throw new EmailNotificationError('EMAIL_AUTH_REQUIRED', 401);
  }
  return {
    uid: account.localId,
    email: cleanText(account.email, 320),
    displayName: cleanText(account.displayName, 160),
  };
}

function publicSubscription(subscription, email) {
  return {
    enabled: Boolean(subscription?.enabled),
    frequency: subscription?.frequency || 'daily',
    maxPapers: subscription?.maxPapers || 5,
    email,
    lastSentAt: subscription?.lastSentAt || null,
    lastTestAt: subscription?.lastTestAt || null,
  };
}

async function deleteSubscription(env, uid, subscription) {
  if (!env.NOTIFICATION_STORE) throw new EmailNotificationError('EMAIL_NOT_CONFIGURED', 503);
  await Promise.all([
    env.NOTIFICATION_STORE.delete(`${SUBSCRIPTION_PREFIX}${uid}`),
    subscription?.unsubscribeToken
      ? env.NOTIFICATION_STORE.delete(`${UNSUBSCRIBE_PREFIX}${subscription.unsubscribeToken}`)
      : Promise.resolve(),
  ]);
}

async function saveSubscription(request, env, identity) {
  if (!env.NOTIFICATION_STORE) throw new EmailNotificationError('EMAIL_NOT_CONFIGURED', 503);
  const body = await request.json().catch(() => null);
  if (!body) throw new EmailNotificationError('EMAIL_INVALID_REQUEST', 400);
  const preferences = sanitizePreferences(body);
  const key = `${SUBSCRIPTION_PREFIX}${identity.uid}`;
  const existing = await env.NOTIFICATION_STORE.get(key, 'json');

  if (!preferences.enabled) {
    await deleteSubscription(env, identity.uid, existing);
    return publicSubscription(null, identity.email);
  }

  const follows = Array.isArray(body.follows)
    ? body.follows.map(sanitizeFollow).filter(Boolean).slice(0, MAX_FOLLOWS)
    : [];
  const previewItems = Array.isArray(body.previewItems)
    ? body.previewItems.map(sanitizePaper).filter(Boolean).slice(0, MAX_PREVIEW_ITEMS)
    : [];
  const unsubscribeToken = existing?.unsubscribeToken || crypto.randomUUID().replace(/-/g, '');
  const now = new Date().toISOString();
  const subscription = {
    ...existing,
    ...preferences,
    uid: identity.uid,
    email: identity.email,
    displayName: identity.displayName,
    follows,
    previewItems,
    unsubscribeToken,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  await Promise.all([
    env.NOTIFICATION_STORE.put(key, JSON.stringify(subscription)),
    env.NOTIFICATION_STORE.put(`${UNSUBSCRIBE_PREFIX}${unsubscribeToken}`, identity.uid),
  ]);
  return publicSubscription(subscription, identity.email);
}

function addOpenAlexCredentials(url, env) {
  url.searchParams.set('mailto', 'app@papertok.io');
  if (env.OPENALEX_API_KEY) url.searchParams.set('api_key', env.OPENALEX_API_KEY);
  return url;
}

function mapOpenAlexPaper(work, follow) {
  const doi = cleanText(work?.doi, 300).replace(/^https?:\/\/doi\.org\//i, '');
  return sanitizePaper({
    id: normalizeId(work?.id) || doi,
    doi,
    title: work?.display_name || work?.title,
    authors: (work?.authorships || []).map(authorship => authorship?.author?.display_name).filter(Boolean),
    published: work?.publication_date,
    journal: work?.primary_location?.source?.display_name,
    citationCount: work?.cited_by_count,
    openAccess: work?.open_access?.is_oa,
    landingPageUrl: work?.best_oa_location?.landing_page_url || work?.primary_location?.landing_page_url,
    _followedEntityMatches: [follow],
  });
}

async function fetchOpenAlexUpdates(follow, env) {
  const id = normalizeId(follow.canonicalId);
  const url = addOpenAlexCredentials(new URL('https://api.openalex.org/works'), env);
  const cutoff = new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  let filter = `from_publication_date:${cutoff}`;

  if (follow.type === 'author' && /^A\d+$/i.test(id)) filter += `,author.id:${id}`;
  else if (follow.type === 'institution') {
    const institutionId = normalizeId(follow.externalIds?.ror || id);
    filter += /^I\d+$/i.test(institutionId)
      ? `,institutions.id:${institutionId}`
      : `,institutions.ror:https://ror.org/${institutionId}`;
  } else if (follow.type === 'topic' && /^T\d+$/i.test(id)) filter += `,topics.id:${id}`;
  else if (follow.type === 'topic' && /^C\d+$/i.test(id)) filter += `,concepts.id:${id}`;
  else url.searchParams.set('search', follow.displayName);

  url.searchParams.set('filter', filter);
  url.searchParams.set('sort', 'publication_date:desc');
  url.searchParams.set('per-page', '6');
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`OpenAlex digest error: ${response.status}`);
  const payload = await response.json();
  return (payload?.results || []).map(work => mapOpenAlexPaper(work, follow)).filter(Boolean);
}

async function fetchProjectUpdates(follow, env) {
  const requestUrl = new URL('https://api.openaire.eu/search/publications');
  requestUrl.searchParams.set('format', 'json');
  requestUrl.searchParams.set('size', '10');
  requestUrl.searchParams.set('page', '1');
  requestUrl.searchParams.set(follow.canonicalId.includes('::') ? 'openaireProjectID' : 'projectID', follow.canonicalId);
  const response = await fetch(requestUrl, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`OpenAIRE digest error: ${response.status}`);
  const payload = await response.json();
  let rows = payload?.response?.results?.result || [];
  if (!Array.isArray(rows)) rows = [rows];
  const dois = rows.flatMap((row) => {
    let pids = row?.metadata?.['oaf:entity']?.['oaf:result']?.pid || [];
    if (!Array.isArray(pids)) pids = [pids];
    return pids
      .filter(pid => ['doi', 'digital object identifier'].includes(cleanText(pid?.['@classname'], 60).toLowerCase()))
      .map(pid => cleanText(pid?.['$'], 300))
      .filter(Boolean);
  }).slice(0, 10);
  if (!dois.length) return [];

  const openAlexUrl = addOpenAlexCredentials(new URL('https://api.openalex.org/works'), env);
  openAlexUrl.searchParams.set('filter', `doi:${dois.map(doi => doi.replace(/^https?:\/\/doi\.org\//i, '')).join('|')}`);
  openAlexUrl.searchParams.set('per-page', '10');
  const openAlexResponse = await fetch(openAlexUrl, { headers: { accept: 'application/json' } });
  if (!openAlexResponse.ok) return [];
  const openAlexPayload = await openAlexResponse.json();
  return (openAlexPayload?.results || []).map(work => mapOpenAlexPaper(work, follow)).filter(Boolean);
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const output = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        output[index] = await mapper(items[index]);
      } catch (error) {
        console.warn('Digest source unavailable', error?.message || error);
        output[index] = [];
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return output.flat();
}

function publicationTime(paper) {
  const value = Date.parse(paper.published || '');
  return Number.isFinite(value) ? value : 0;
}

function mergePapers(papers) {
  const merged = new Map();
  papers.filter(Boolean).forEach((paper) => {
    const key = paperKey(paper);
    const current = merged.get(key);
    if (!current) {
      merged.set(key, paper);
      return;
    }
    const matches = [...(current.matches || []), ...(paper.matches || [])];
    merged.set(key, {
      ...current,
      ...paper,
      citationCount: Math.max(current.citationCount || 0, paper.citationCount || 0),
      matches: matches.filter((match, index) => matches.findIndex(candidate => (
        candidate.type === match.type && candidate.canonicalId === match.canonicalId
      )) === index),
    });
  });
  return [...merged.values()].sort((a, b) => publicationTime(b) - publicationTime(a));
}

async function collectDigestPapers(subscription, env, { test = false } = {}) {
  const follows = (subscription.follows || []).slice(0, MAX_QUERIED_FOLLOWS);
  const fresh = await mapWithConcurrency(follows, 4, follow => (
    follow.type === 'project' ? fetchProjectUpdates(follow, env) : fetchOpenAlexUpdates(follow, env)
  ));
  const combined = mergePapers([...fresh, ...(subscription.previewItems || [])]);
  if (test) return combined.slice(0, subscription.maxPapers || 5);

  const fallbackDays = subscription.frequency === 'weekly' ? 8 : 2;
  const cutoff = subscription.lastSentAt
    ? Date.parse(subscription.lastSentAt) - 60 * 60 * 1000
    : Date.now() - fallbackDays * 24 * 60 * 60 * 1000;
  return combined
    .filter(paper => !publicationTime(paper) || publicationTime(paper) >= cutoff)
    .slice(0, subscription.maxPapers || 5);
}

async function resolveSender(env) {
  if (env.RESEND_FROM_EMAIL) return cleanText(env.RESEND_FROM_EMAIL, 320);
  return 'PaperTok <onboarding@resend.dev>';
}

async function dailySendState(env) {
  if (!env.NOTIFICATION_STORE) throw new EmailNotificationError('EMAIL_NOT_CONFIGURED', 503);
  const configuredLimit = Number(env.EMAIL_DAILY_SEND_LIMIT);
  const limit = Number.isFinite(configuredLimit) && configuredLimit > 0
    ? Math.floor(configuredLimit)
    : DEFAULT_DAILY_SEND_LIMIT;
  const dateKey = new Date().toISOString().slice(0, 10);
  const key = `${SEND_COUNT_PREFIX}${dateKey}`;
  const current = Number(await env.NOTIFICATION_STORE.get(key)) || 0;
  return { current, key, limit };
}

async function assertDailySendAvailable(env) {
  const state = await dailySendState(env);
  if (state.current >= state.limit) throw new EmailNotificationError('EMAIL_PROVIDER_LIMIT', 429);
  return state;
}

async function recordSuccessfulSend(env, state) {
  if (!env.NOTIFICATION_STORE) throw new EmailNotificationError('EMAIL_NOT_CONFIGURED', 503);
  const latest = Number(await env.NOTIFICATION_STORE.get(state.key)) || 0;
  await env.NOTIFICATION_STORE.put(
    state.key,
    String(Math.min(latest + 1, state.limit)),
    { expirationTtl: 172_800 },
  );
}

function buildResendIdempotencyKey(subscription, { test = false, now = Date.now() } = {}) {
  const timestamp = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  const sendWindow = test
    ? Math.floor(timestamp / TEST_IDEMPOTENCY_WINDOW_MS)
    : new Date(timestamp).toISOString().slice(0, 10);
  const uid = cleanText(subscription?.uid, 160).replace(/[^a-zA-Z0-9_-]/g, '') || 'unknown';
  return `${test ? 'test' : 'digest'}-${uid}-${sendWindow}`.slice(0, 256);
}

function resendSendErrorCode(status, payload = {}) {
  const providerMessage = cleanText(`${payload?.name || ''} ${payload?.message || ''}`, 1_000);
  const testRecipientRestricted = status === 403 && (
    /only send testing emails/i.test(providerMessage)
    || /own email address/i.test(providerMessage)
    || /verify a domain/i.test(providerMessage)
    || /resend\.dev/i.test(providerMessage)
  );
  if (testRecipientRestricted) return 'EMAIL_TEST_RECIPIENT_RESTRICTED';
  if (status === 401 || status === 403) return 'EMAIL_PROVIDER_AUTH_FAILED';
  if (status === 429) return 'EMAIL_PROVIDER_LIMIT';
  return 'EMAIL_SEND_FAILED';
}

function paperReason(paper) {
  const names = (paper.matches || []).map(match => match.displayName).filter(Boolean);
  return names.length ? `Porque sigues ${names.slice(0, 2).join(' y ')}` : 'De tus seguimientos en PaperTok';
}

function renderDigest(subscription, papers, unsubscribeUrl, test) {
  const greeting = subscription.displayName ? `Hola, ${subscription.displayName.split(' ')[0]}` : 'Hola';
  const title = test ? 'Tu correo de PaperTok funciona' : `${papers.length} novedades científicas para ti`;
  const paperHtml = papers.length
    ? papers.map(paper => `
      <div style="padding:20px 0;border-bottom:1px solid #2b2933">
        <div style="font-size:12px;color:#a98cf7;margin-bottom:7px">${escapeHtml(paperReason(paper))}</div>
        <a href="${escapeHtml(paper.url || PAPER_TOK_URL)}" style="color:#f6f4fb;text-decoration:none;font-size:18px;font-weight:700;line-height:1.35">${escapeHtml(paper.title)}</a>
        <div style="color:#a7a2b3;font-size:13px;margin-top:8px">${escapeHtml(paper.authors?.slice(0, 3).join(', ') || 'Autoría no disponible')}</div>
        <div style="color:#787381;font-size:12px;margin-top:6px">${escapeHtml([paper.published, paper.journal, paper.citationCount ? `${paper.citationCount} citas` : ''].filter(Boolean).join(' · '))}</div>
      </div>`).join('')
    : '<div style="padding:24px 0;color:#b9b4c3">La conexión está lista. Todavía no hemos encontrado publicaciones recientes entre tus seguimientos.</div>';

  const html = `<!doctype html><html><body style="margin:0;background:#0c0b10;color:#f6f4fb;font-family:Arial,sans-serif">
    <div style="max-width:640px;margin:0 auto;padding:36px 24px">
      <div style="color:#8b5cf6;font-size:12px;font-weight:700;letter-spacing:1px">PAPERTOK · NOVEDADES SEGUIDAS</div>
      <h1 style="font-size:28px;line-height:1.15;margin:14px 0 8px">${escapeHtml(title)}</h1>
      <p style="color:#a7a2b3;margin:0 0 16px">${escapeHtml(greeting)}. Esta es tu selección ${subscription.frequency === 'weekly' ? 'semanal' : 'diaria'}.</p>
      ${paperHtml}
      <a href="${PAPER_TOK_URL}" style="display:inline-block;margin-top:24px;padding:12px 18px;background:#8b5cf6;color:white;text-decoration:none;border-radius:6px;font-weight:700">Abrir mi bandeja</a>
      <p style="color:#676270;font-size:11px;line-height:1.5;margin-top:34px">Recibes este correo porque activaste las novedades por email en PaperTok. <a href="${escapeHtml(unsubscribeUrl)}" style="color:#9b93a8">Darme de baja</a>.</p>
    </div></body></html>`;
  const text = `${title}\n\n${greeting}.\n\n${papers.map(paper => `${paper.title}\n${paperReason(paper)}\n${paper.url || PAPER_TOK_URL}`).join('\n\n')}\n\nAbrir PaperTok: ${PAPER_TOK_URL}\nDarme de baja: ${unsubscribeUrl}`;
  return { html, text, subject: test ? 'PaperTok: correo de prueba' : title };
}

async function sendDigest(subscription, papers, env, { test = false } = {}) {
  if (!env.RESEND_API_KEY) throw new EmailNotificationError('EMAIL_NOT_CONFIGURED', 503);
  const sendState = await assertDailySendAvailable(env);
  const from = await resolveSender(env);
  const workerBase = cleanText(env.WORKER_PUBLIC_URL, 500) || 'https://papertok-report-api.papertok-mugar123.workers.dev';
  const unsubscribeUrl = `${workerBase}/notifications/unsubscribe?token=${encodeURIComponent(subscription.unsubscribeToken)}`;
  const content = renderDigest(subscription, papers, unsubscribeUrl, test);
  const response = await fetch(`${RESEND_API}/emails`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json',
      'user-agent': 'PaperTok/1.0',
      'idempotency-key': buildResendIdempotencyKey(subscription, { test }),
    },
    body: JSON.stringify({
      from,
      to: [subscription.email],
      subject: content.subject,
      html: content.html,
      text: content.text,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('Resend rejected digest', response.status, payload?.message || payload?.name || 'unknown');
    const code = resendSendErrorCode(response.status, payload);
    throw new EmailNotificationError(code, response.status === 429 ? 429 : 502);
  }
  await recordSuccessfulSend(env, sendState);
  return payload?.id || null;
}

async function testSubscription(env, identity) {
  if (!env.NOTIFICATION_STORE) throw new EmailNotificationError('EMAIL_NOT_CONFIGURED', 503);
  const key = `${SUBSCRIPTION_PREFIX}${identity.uid}`;
  const subscription = await env.NOTIFICATION_STORE.get(key, 'json');
  if (!subscription?.enabled) throw new EmailNotificationError('EMAIL_SUBSCRIPTION_REQUIRED', 409);
  const lastTestAt = Date.parse(subscription.lastTestAt || 0);
  if (lastTestAt && Date.now() - lastTestAt < 60_000) {
    throw new EmailNotificationError('EMAIL_TEST_RATE_LIMIT', 429);
  }
  const papers = await collectDigestPapers(subscription, env, { test: true });
  const providerId = await sendDigest(subscription, papers, env, { test: true });
  const updated = { ...subscription, lastTestAt: new Date().toISOString() };
  await env.NOTIFICATION_STORE.put(key, JSON.stringify(updated));
  return {
    ok: true,
    providerId,
    paperCount: papers.length,
    followCount: subscription.follows?.length || 0,
    preferences: publicSubscription(updated, identity.email),
  };
}

export async function handleEmailNotificationRequest(request, env, pathname) {
  const identity = await verifyFirebaseIdentity(request, env);
  if (!env.NOTIFICATION_STORE) throw new EmailNotificationError('EMAIL_NOT_CONFIGURED', 503);
  const key = `${SUBSCRIPTION_PREFIX}${identity.uid}`;

  if (pathname === '/notifications/preferences' && request.method === 'GET') {
    const subscription = await env.NOTIFICATION_STORE.get(key, 'json');
    return { preferences: publicSubscription(subscription, identity.email) };
  }
  if (pathname === '/notifications/preferences' && request.method === 'PUT') {
    return { preferences: await saveSubscription(request, env, identity) };
  }
  if (pathname === '/notifications/test' && request.method === 'POST') {
    return testSubscription(env, identity);
  }
  throw new EmailNotificationError('EMAIL_METHOD_NOT_ALLOWED', 405);
}

export async function handleEmailUnsubscribe(request, env) {
  if (!env.NOTIFICATION_STORE) return new Response('Servicio no disponible', { status: 503 });
  const token = cleanText(new URL(request.url).searchParams.get('token'), 100);
  if (!token) return new Response('Enlace de baja no válido', { status: 400 });
  const uid = await env.NOTIFICATION_STORE.get(`${UNSUBSCRIBE_PREFIX}${token}`);
  if (uid) {
    const subscription = await env.NOTIFICATION_STORE.get(`${SUBSCRIPTION_PREFIX}${uid}`, 'json');
    await deleteSubscription(env, uid, subscription);
  }
  return new Response(`<!doctype html><html><body style="background:#0c0b10;color:#f6f4fb;font-family:Arial,sans-serif;text-align:center;padding:80px 20px"><h1>Correos desactivados</h1><p style="color:#aaa3b6">Ya no recibirás novedades de PaperTok por email.</p><a href="${PAPER_TOK_URL}" style="color:#a98cf7">Volver a PaperTok</a></body></html>`, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export async function checkEmailProviderHealth(env) {
  if (!env.RESEND_API_KEY) return { configured: false, available: false, code: 'EMAIL_NOT_CONFIGURED' };
  try {
    const response = await fetch(`${RESEND_API}/domains?limit=1`, {
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        accept: 'application/json',
        'user-agent': 'PaperTok/1.0',
      },
    });
    if (response.status === 401 || response.status === 403) {
      const errorPayload = await response.json().catch(() => ({}));
      // A "sending access" (restricted) Resend key can send emails but is not
      // allowed to list domains, so this probe comes back as 401 with
      // name "restricted_api_key". That is a VALID credential — the provider is
      // available, just permission-limited — so we must not report it as an
      // auth failure. See https://resend.com/docs/api-reference/errors
      // Status alone is not enough: a bare 401/403 without this marker means a
      // genuinely rejected key (revoked, suspended, blocked) and must fail closed.
      const isRestrictedKey = errorPayload?.name === 'restricted_api_key'
        || /restricted/i.test(errorPayload?.message || '');
      if (isRestrictedKey) {
        return {
          configured: true,
          available: true,
          senderMode: env.RESEND_FROM_EMAIL ? 'verified-domain' : 'resend-test',
          permissionLimited: true,
        };
      }
      console.warn('Resend health probe rejected', response.status, errorPayload?.name || 'unknown');
      return { configured: true, available: false, code: 'EMAIL_PROVIDER_AUTH_FAILED' };
    }
    if (!response.ok) return { configured: true, available: false, code: 'EMAIL_PROVIDER_UNAVAILABLE' };
    const payload = await response.json().catch(() => ({}));
    const verified = (payload?.data || []).some(domain => domain.status === 'verified');
    return { configured: true, available: true, senderMode: env.RESEND_FROM_EMAIL || verified ? 'verified-domain' : 'resend-test' };
  } catch {
    return { configured: true, available: false, code: 'EMAIL_PROVIDER_UNAVAILABLE' };
  }
}

function isSubscriptionDue(subscription, now) {
  if (!subscription?.enabled) return false;
  const lastSent = Date.parse(subscription.lastSentAt || 0);
  if (subscription.frequency === 'weekly') {
    return now.getUTCDay() === 1 && (!lastSent || now.getTime() - lastSent >= 6 * 24 * 60 * 60 * 1000);
  }
  return !lastSent || now.getTime() - lastSent >= 20 * 60 * 60 * 1000;
}

async function processScheduledSubscription(env, key, now) {
  const subscription = await env.NOTIFICATION_STORE.get(key.name, 'json');
  if (!isSubscriptionDue(subscription, now)) return { skipped: true };
  const papers = await collectDigestPapers(subscription, env);
  const checkedAt = now.toISOString();
  if (!papers.length) {
    await env.NOTIFICATION_STORE.put(key.name, JSON.stringify({ ...subscription, lastCheckedAt: checkedAt }));
    return { empty: true };
  }
  await sendDigest(subscription, papers, env);
  await env.NOTIFICATION_STORE.put(key.name, JSON.stringify({
    ...subscription,
    lastCheckedAt: checkedAt,
    lastSentAt: checkedAt,
  }));
  return { sent: true };
}

export async function runEmailNotificationSchedule(env, scheduledTime = Date.now()) {
  if (!env.NOTIFICATION_STORE || !env.RESEND_API_KEY) return { sent: 0, skipped: true };
  const now = new Date(scheduledTime);
  let cursor;
  let sent = 0;
  let failed = 0;
  do {
    const page = await env.NOTIFICATION_STORE.list({ prefix: SUBSCRIPTION_PREFIX, cursor, limit: 100 });
    for (let index = 0; index < page.keys.length; index += 3) {
      const batch = page.keys.slice(index, index + 3);
      const results = await Promise.allSettled(batch.map(key => processScheduledSubscription(env, key, now)));
      sent += results.filter(result => result.status === 'fulfilled' && result.value?.sent).length;
      failed += results.filter(result => result.status === 'rejected').length;
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return { sent, failed };
}

export const emailNotificationInternals = {
  buildResendIdempotencyKey,
  sanitizeFollow,
  sanitizePaper,
  sanitizePreferences,
  mergePapers,
  isSubscriptionDue,
  resendSendErrorCode,
  renderDigest,
};
