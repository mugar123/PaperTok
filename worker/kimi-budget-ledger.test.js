import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateKimiUsageMicros,
  estimateKimiReservationMicros,
  getMonthlyBudgetReset,
  microsToUsd,
  usdToMicros,
} from './kimi-budget-ledger.js';

test('reserves a conservative Kimi maximum before sending a request', () => {
  assert.equal(estimateKimiReservationMicros({
    promptBytes: 10_000,
    maxOutputTokens: 4_000,
    promptUsdPerMillion: 3,
    outputUsdPerMillion: 15,
  }), 153_072);
});

test('prices cached, completion and reasoning tokens conservatively', () => {
  const costMicros = calculateKimiUsageMicros({
    prompt_tokens: 1_000,
    prompt_tokens_details: { cached_tokens: 200 },
    completion_tokens: 500,
    completion_tokens_details: { reasoning_tokens: 200 },
  });
  assert.equal(costMicros, 12_960);
  assert.equal(microsToUsd(costMicros), 0.01296);
});

test('converts dollar caps without losing sub-cent precision', () => {
  assert.equal(usdToMicros(27), 27_000_000);
  assert.equal(microsToUsd(27_000_000), 27);
});

test('resets the Kimi safety budget at the next UTC month', () => {
  assert.deepEqual(getMonthlyBudgetReset(Date.parse('2026-07-28T12:00:00.000Z')), {
    resetAt: '2026-08-01T00:00:00.000Z',
    retryAfterSeconds: 302_400,
  });
});
