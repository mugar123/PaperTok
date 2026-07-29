import test from 'node:test';
import assert from 'node:assert/strict';
import { dedupeInteractionPapers } from './feedInteractions.js';

test('deduplicates queued paper interactions while preserving their order', () => {
  const first = { id: 'paper-1', title: 'First' };
  const second = { id: 'paper-2', title: 'Second' };

  assert.deepEqual(
    dedupeInteractionPapers([first, second, { ...first, title: 'Duplicate' }]),
    [first, second],
  );
});

test('ignores interactions without a stable paper id', () => {
  assert.deepEqual(
    dedupeInteractionPapers([null, {}, { id: '  ' }, { id: 'paper-1' }]),
    [{ id: 'paper-1' }],
  );
});
