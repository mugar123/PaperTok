import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_READING_PREFERENCES,
  normalizeReadingPreferences,
} from './userSettings.js';

test('normalizes the preferred AI explanation level', () => {
  assert.deepEqual(normalizeReadingPreferences({ aiExplanationLevel: 'researcher' }), {
    aiExplanationLevel: 'researcher',
    language: 'es',
  });
  assert.deepEqual(normalizeReadingPreferences({ aiExplanationLevel: 'unknown' }), {
    aiExplanationLevel: DEFAULT_READING_PREFERENCES.aiExplanationLevel,
    language: 'es',
  });
});

test('normalizes the interface language', () => {
  assert.deepEqual(normalizeReadingPreferences({ language: 'en' }), {
    aiExplanationLevel: DEFAULT_READING_PREFERENCES.aiExplanationLevel,
    language: 'en',
  });
  assert.equal(normalizeReadingPreferences({ language: 'fr' }).language, 'es');
});
