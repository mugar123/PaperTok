const PAPER_API_BASE = import.meta.env?.VITE_PAPER_API_BASE_URL?.replace(/\/$/, '') || '';

// Spain plus the countries and territories commonly grouped as Latin America.
const SPANISH_INTERFACE_COUNTRIES = new Set([
  'AR', 'BO', 'BR', 'BZ', 'CL', 'CO', 'CR', 'CU', 'DO', 'EC', 'ES', 'GF', 'GT',
  'GY', 'HN', 'HT', 'MX', 'NI', 'PA', 'PE', 'PR', 'PY', 'SR', 'SV', 'UY', 'VE',
]);

function normalizeCountry(value) {
  const country = String(value || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(country) ? country : '';
}

export function languageForCountry(value) {
  const country = normalizeCountry(value);
  if (!country) return null;
  return SPANISH_INTERFACE_COUNTRIES.has(country) ? 'es' : 'en';
}

export function browserLanguageFallback(browser = globalThis.navigator) {
  const preferred = browser?.languages?.[0] || browser?.language || '';
  return String(preferred).toLowerCase().startsWith('es') ? 'es' : 'en';
}

export async function detectLanguageFromLocation({
  apiBase = PAPER_API_BASE,
  fetchImpl = globalThis.fetch,
  fallback = browserLanguageFallback(),
  signal,
} = {}) {
  if (!apiBase || typeof fetchImpl !== 'function') return fallback;

  try {
    const response = await fetchImpl(`${apiBase}/locale`, {
      headers: { accept: 'application/json' },
      signal,
    });
    if (!response.ok) return fallback;
    const data = await response.json();
    return languageForCountry(data?.country) || fallback;
  } catch {
    return fallback;
  }
}
