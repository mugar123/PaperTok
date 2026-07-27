export const DEFAULT_READING_PREFERENCES = Object.freeze({
  aiExplanationLevel: 'university',
});

const AI_EXPLANATION_LEVEL_IDS = new Set(['beginner', 'university', 'researcher']);

export function normalizeReadingPreferences(value = {}) {
  const aiExplanationLevel = AI_EXPLANATION_LEVEL_IDS.has(value?.aiExplanationLevel)
    ? value.aiExplanationLevel
    : DEFAULT_READING_PREFERENCES.aiExplanationLevel;

  return { aiExplanationLevel };
}
