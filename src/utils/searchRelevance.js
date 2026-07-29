const DEFAULT_SECTION_ORDER = ['papers', 'topics', 'authors', 'institutions', 'projects'];

export function normalizeSearchText(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function scoreSearchMatch(query, values = []) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return 0;

  const queryTokens = normalizedQuery.split(' ').filter(Boolean);
  let bestScore = 0;

  values.forEach((value) => {
    const normalizedValue = normalizeSearchText(value);
    if (!normalizedValue) return;
    if (normalizedValue === normalizedQuery) {
      bestScore = Math.max(bestScore, 100);
      return;
    }
    if (normalizedValue.startsWith(`${normalizedQuery} `)) {
      bestScore = Math.max(bestScore, 94);
      return;
    }
    if (normalizedValue.includes(normalizedQuery)) {
      bestScore = Math.max(bestScore, 88);
      return;
    }

    const valueTokens = new Set(normalizedValue.split(' ').filter(Boolean));
    const matchedTokens = queryTokens.filter(token => valueTokens.has(token)).length;
    const coverage = matchedTokens / queryTokens.length;
    bestScore = Math.max(bestScore, Math.round(coverage * 70));
  });

  return bestScore;
}

export function filterRelevantSearchResults(
  query,
  results,
  getValues,
  { minimumScore = 55 } = {},
) {
  return (results || [])
    .map(result => ({
      result,
      score: scoreSearchMatch(query, getValues(result)),
    }))
    .filter(match => match.score >= minimumScore)
    .sort((a, b) => b.score - a.score)
    .map(match => match.result);
}

export function resolvePreferredSearchSection({
  query,
  hint,
  sectionValues = {},
}) {
  const availableSections = new Set(
    Object.entries(sectionValues)
      .filter(([, values]) => Array.isArray(values) && values.length > 0)
      .map(([section]) => section),
  );
  if (hint && availableSections.has(hint)) return hint;

  const normalizedQuery = normalizeSearchText(query);
  const exactPriority = ['topics', 'authors', 'institutions', 'projects', 'papers'];
  const exactSection = exactPriority.find(section => (
    availableSections.has(section)
    && sectionValues[section].some(value => normalizeSearchText(value) === normalizedQuery)
  ));
  if (exactSection) return exactSection;

  if (
    availableSections.has('institutions')
    && /\b(university|universidad|college|institute|instituto|hospital|laboratory|laboratorio)\b/.test(normalizedQuery)
  ) {
    return 'institutions';
  }
  if (
    availableSections.has('projects')
    && /\b(project|proyecto|grant|horizon|erc)\b/.test(normalizedQuery)
  ) {
    return 'projects';
  }

  return DEFAULT_SECTION_ORDER.find(section => availableSections.has(section)) || null;
}

export function getSearchSectionOrder(section, preferredSection) {
  if (section === preferredSection) return 1;
  const defaultIndex = DEFAULT_SECTION_ORDER.indexOf(section);
  return defaultIndex === -1 ? 99 : 10 + defaultIndex;
}
