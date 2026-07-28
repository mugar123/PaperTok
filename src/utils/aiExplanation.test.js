import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AI_EXPLANATION_LEVELS,
  AIExplanationError,
  buildPaperExplanationPrompt,
  classifyGeminiError,
  classifyKimiError,
  explanationCacheKey,
  getDailyQuotaReset,
  getProviderRetry,
  normalizePaperForExplanation,
  shouldFallbackToKimi,
} from '../../worker/ai-explanation.js';

test('supports the three explanation depths', () => {
  assert.deepEqual(AI_EXPLANATION_LEVELS, ['beginner', 'university', 'researcher']);
});

test('builds a source-aware prompt without silently claiming full-text access', () => {
  const paper = normalizePaperForExplanation({ title: 'A test', abstract: 'Known facts.' });
  const prompt = buildPaperExplanationPrompt(paper, 'university', 'abstract');
  assert.match(prompt, /Solo dispones del abstract/);
  assert.match(prompt, /Known facts/);
  assert.match(prompt, /LaTeX/);
  assert.match(prompt, /\$\.\.\.\$/);
  assert.match(prompt, /nunca escribas ω_b/);
  assert.match(prompt, /keyPoints/);
});

test('builds English-only explanations when the interface language is English', () => {
  const paper = normalizePaperForExplanation({ title: 'A test', abstract: 'Known facts.' });
  const prompt = buildPaperExplanationPrompt(paper, 'university', 'abstract', 'en');
  assert.match(prompt, /faithfully explain a scientific paper in English/);
  assert.match(prompt, /Every explanatory field.*written in English/);
  assert.match(prompt, /You only have the abstract and metadata/);
  assert.match(prompt, /Known facts/);
  assert.doesNotMatch(prompt, /explicar fielmente un paper científico en español/);
});

test('keeps English and Spanish explanations in separate worker caches', async () => {
  const paper = normalizePaperForExplanation({ title: 'A test', abstract: 'Known facts.' });
  const spanishKey = await explanationCacheKey(paper, 'university', 'es', 'gemini', 'test-model');
  const englishKey = await explanationCacheKey(paper, 'university', 'en', 'gemini', 'test-model');

  assert.notEqual(spanishKey.url, englishKey.url);
  assert.match(spanishKey.url, /\/es\/university\//);
  assert.match(englishKey.url, /\/en\/university\//);
});

test('rejects an explanation request without usable paper content', () => {
  assert.throws(
    () => normalizePaperForExplanation({ title: 'No content' }),
    error => error instanceof AIExplanationError && error.code === 'AI_INVALID_PAPER',
  );
});

test('rejects placeholder abstracts and unsupported PDF hosts', () => {
  assert.throws(
    () => normalizePaperForExplanation({
      title: 'No usable content',
      abstract: 'No abstract available.',
      pdfUrl: 'https://example.org/paper.pdf',
    }),
    error => error instanceof AIExplanationError && error.code === 'AI_INVALID_PAPER',
  );
});

test('distinguishes Gemini configuration errors from temporary failures', () => {
  assert.equal(classifyGeminiError(403, { error: { message: 'API key not valid' } }), 'AI_NOT_CONFIGURED');
  assert.equal(classifyGeminiError(503, { error: { message: 'Service unavailable' } }), 'AI_BUSY');
  assert.equal(classifyGeminiError(500, {}), 'AI_UNAVAILABLE');
  assert.equal(classifyGeminiError(429, { error: { message: 'Requests per minute exceeded' } }), 'AI_BUSY');
  assert.equal(classifyGeminiError(429, { error: { message: 'Requests per day exceeded' } }), 'AI_QUOTA_EXHAUSTED');
});

test('only routes to Kimi after Gemini confirms provider quota exhaustion', () => {
  assert.equal(shouldFallbackToKimi(new AIExplanationError(
    'AI_QUOTA_EXHAUSTED',
    429,
    'AI_QUOTA_EXHAUSTED',
    { scope: 'provider' },
  )), true);
  assert.equal(shouldFallbackToKimi(new AIExplanationError(
    'AI_QUOTA_EXHAUSTED',
    429,
    'AI_QUOTA_EXHAUSTED',
    { scope: 'user' },
  )), false);
  assert.equal(shouldFallbackToKimi(new AIExplanationError('AI_BUSY', 429)), false);
});

test('distinguishes Kimi budget failures from transient rate limits', () => {
  assert.equal(classifyKimiError(402, { error: { message: 'Insufficient balance' } }), 'AI_FALLBACK_BUDGET_EXHAUSTED');
  assert.equal(classifyKimiError(429, { error: { message: 'Requests per minute exceeded' } }), 'AI_BUSY');
  assert.equal(classifyKimiError(401, { error: { message: 'Invalid proxy token' } }), 'AI_NOT_CONFIGURED');
});

test('preserves Gemini retry timing for temporary rate limits', () => {
  assert.deepEqual(getProviderRetry({
    error: { details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '12.5s' }] },
  }, '', Date.parse('2026-07-22T12:00:00.000Z')), {
    resetAt: '2026-07-22T12:00:13.000Z',
    retryAfterSeconds: 13,
    scope: 'provider-rate',
  });
});

test('reports the next UTC quota reset without relying on browser time', () => {
  assert.deepEqual(getDailyQuotaReset(Date.parse('2026-07-20T22:15:30.000Z')), {
    resetAt: '2026-07-21T00:00:00.000Z',
    retryAfterSeconds: 6_270,
  });
});
