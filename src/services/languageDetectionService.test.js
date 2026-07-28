import assert from 'node:assert/strict';
import test from 'node:test';
import {
  browserLanguageFallback,
  detectLanguageFromLocation,
  languageForCountry,
} from './languageDetectionService.js';

test('uses Spanish for Spain and Latin America, and English elsewhere', () => {
  assert.equal(languageForCountry('ES'), 'es');
  assert.equal(languageForCountry('MX'), 'es');
  assert.equal(languageForCountry('BR'), 'es');
  assert.equal(languageForCountry('GB'), 'en');
  assert.equal(languageForCountry('JP'), 'en');
  assert.equal(languageForCountry(''), null);
});

test('uses the browser language only when country detection is unavailable', async () => {
  assert.equal(browserLanguageFallback({ languages: ['es-AR'] }), 'es');
  assert.equal(browserLanguageFallback({ language: 'fr-FR' }), 'en');

  const fromWorker = await detectLanguageFromLocation({
    apiBase: 'https://worker.example',
    fallback: 'en',
    fetchImpl: async () => new Response(JSON.stringify({ country: 'CO' }), { status: 200 }),
  });
  const fallback = await detectLanguageFromLocation({
    apiBase: '',
    fallback: 'es',
  });

  assert.equal(fromWorker, 'es');
  assert.equal(fallback, 'es');
});
