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
    languagePreferenceSet: false,
  });
  assert.deepEqual(normalizeReadingPreferences({ aiExplanationLevel: 'unknown' }), {
    aiExplanationLevel: DEFAULT_READING_PREFERENCES.aiExplanationLevel,
    language: 'es',
    languagePreferenceSet: false,
  });
});

test('normalizes the interface language', () => {
  assert.deepEqual(normalizeReadingPreferences({ language: 'en' }), {
    aiExplanationLevel: DEFAULT_READING_PREFERENCES.aiExplanationLevel,
    language: 'en',
    languagePreferenceSet: false,
  });
  assert.equal(normalizeReadingPreferences({ language: 'fr' }).language, 'es');
});

test('keeps track of whether the language was selected manually', () => {
  assert.equal(normalizeReadingPreferences({ language: 'en' }).languagePreferenceSet, false);
  assert.equal(normalizeReadingPreferences({ language: 'en', languagePreferenceSet: true }).languagePreferenceSet, true);
});
