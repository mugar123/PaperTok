export const DEFAULT_READING_PREFERENCES = Object.freeze({
  aiExplanationLevel: 'university',
  language: 'es',
});

const AI_EXPLANATION_LEVEL_IDS = new Set(['beginner', 'university', 'researcher']);
const LANGUAGE_IDS = new Set(['es', 'en']);

export function normalizeReadingPreferences(value = {}) {
  const aiExplanationLevel = AI_EXPLANATION_LEVEL_IDS.has(value?.aiExplanationLevel)
    ? value.aiExplanationLevel
    : DEFAULT_READING_PREFERENCES.aiExplanationLevel;
  const language = LANGUAGE_IDS.has(value?.language)
    ? value.language
    : DEFAULT_READING_PREFERENCES.language;

  return { aiExplanationLevel, language };
}
