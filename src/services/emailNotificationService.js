import { auth } from './firebase.js';

export class EmailNotificationServiceError extends Error {
  constructor(code, status = 0) {
    super(code);
    this.name = 'EmailNotificationServiceError';
    this.code = code;
    this.status = status;
  }
}

function apiBase() {
  const value = import.meta.env.VITE_PAPER_API_BASE_URL?.replace(/\/$/, '');
  if (!value) throw new EmailNotificationServiceError('EMAIL_NOT_CONFIGURED');
  return value;
}

export function serializeFollowForNotifications(follow = {}) {
  return {
    type: follow.type,
    canonicalId: follow.canonicalId,
    displayName: follow.displayName,
    externalIds: {
      ...(follow.externalIds?.ror ? { ror: follow.externalIds.ror } : {}),
      ...(follow.externalIds?.orcid ? { orcid: follow.externalIds.orcid } : {}),
    },
    metadata: {
      categoryIds: Array.isArray(follow.metadata?.categoryIds) ? follow.metadata.categoryIds.slice(0, 12) : [],
    },
  };
}

export function serializeUpdateForNotifications(paper = {}) {
  return {
    id: paper.id,
    doi: paper.doi,
    title: paper.title,
    authors: (paper.authors || []).slice(0, 6).map(author => ({ name: author?.name || author?.display_name || author })),
    published: paper.published || paper.publishedDate,
    journal: paper.journal,
    citationCount: paper.citationCount,
    openAccess: paper.openAccess,
    landingPageUrl: paper.landingPageUrl,
    pdfUrl: paper.pdfUrl,
    matches: (paper._followedEntityMatches || []).slice(0, 4).map(serializeFollowForNotifications),
  };
}

async function authenticatedRequest(path, options = {}) {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new EmailNotificationServiceError('EMAIL_AUTH_REQUIRED', 401);
  const token = await currentUser.getIdToken();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch(`${apiBase()}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${token}`,
        ...(options.body ? { 'content-type': 'application/json' } : {}),
        ...options.headers,
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new EmailNotificationServiceError(payload.code || 'EMAIL_UNAVAILABLE', response.status);
    return payload;
  } catch (error) {
    if (error instanceof EmailNotificationServiceError) throw error;
    throw new EmailNotificationServiceError(error?.name === 'AbortError' ? 'EMAIL_TIMEOUT' : 'EMAIL_UNAVAILABLE');
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function getEmailNotificationPreferences() {
  const payload = await authenticatedRequest('/notifications/preferences');
  return payload.preferences;
}

export async function getEmailNotificationHealth() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${apiBase()}/health/email`, { signal: controller.signal });
    const payload = await response.json().catch(() => ({}));
    return {
      configured: Boolean(payload.configured),
      available: Boolean(payload.available),
      senderMode: payload.senderMode || null,
      permissionLimited: Boolean(payload.permissionLimited),
      code: payload.code || (response.ok ? null : 'EMAIL_PROVIDER_UNAVAILABLE'),
    };
  } catch (error) {
    return {
      configured: false,
      available: false,
      senderMode: null,
      permissionLimited: false,
      code: error?.name === 'AbortError' ? 'EMAIL_TIMEOUT' : 'EMAIL_UNAVAILABLE',
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function saveEmailNotificationPreferences(preferences, follows = [], previewItems = []) {
  const payload = await authenticatedRequest('/notifications/preferences', {
    method: 'PUT',
    body: JSON.stringify({
      enabled: Boolean(preferences.enabled),
      frequency: preferences.frequency === 'weekly' ? 'weekly' : 'daily',
      maxPapers: [3, 5, 10].includes(Number(preferences.maxPapers)) ? Number(preferences.maxPapers) : 5,
      follows: follows.slice(0, 40).map(serializeFollowForNotifications),
      previewItems: previewItems.slice(0, 20).map(serializeUpdateForNotifications),
    }),
  });
  return payload.preferences;
}

export async function sendEmailNotificationTest() {
  return authenticatedRequest('/notifications/test', { method: 'POST' });
}
