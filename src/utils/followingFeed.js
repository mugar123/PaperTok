import { getFollowingUpdatePaperKey, getPaperPublicationTime } from './followingUpdates.js';

const TYPE_LABELS = {
  author: 'a',
  topic: '',
  institution: '',
  project: 'el proyecto',
};

/**
 * One human sentence explaining why a paper is in the Siguiendo feed.
 * Matches come from followingUpdatesService, which resolves follows through
 * stable identifiers (OpenAlex ids, ROR, project ids) before ever falling back
 * to normalized names, so a match here is a proven relationship.
 *
 * @param {Array<{type: string, displayName: string}>} matches
 * @returns {string}
 */
export function buildFollowReasonLabel(matches = []) {
  const named = matches.filter(match => match?.displayName);
  if (named.length === 0) return '';
  if (named.length > 2) return 'Coincide con varios de tus seguimientos';

  const parts = named.map((match) => {
    const connector = TYPE_LABELS[match.type] ?? '';
    return connector ? `${connector} ${match.displayName}` : match.displayName;
  });
  return `Porque sigues ${parts.join(' y ')}`;
}

/**
 * Orders the Siguiendo feed: unseen papers first, then seen ones, each group
 * newest-first with citations as the tiebreaker. The seen set is captured at
 * call time on purpose — reordering must happen when the list refreshes, never
 * live under the user's thumb while cards are being marked as seen.
 *
 * @param {Array} items - deduplicated papers from FollowingUpdatesContext
 * @param {Set<string>} seenIds - keys already seen by this user
 * @returns {Array}
 */
export function orderFollowingFeedPapers(items = [], seenIds = new Set()) {
  const byRecency = (a, b) => (
    getPaperPublicationTime(b) - getPaperPublicationTime(a)
    || (b.citationCount || 0) - (a.citationCount || 0)
  );
  const unseen = [];
  const seen = [];
  items.forEach((paper) => {
    (seenIds.has(getFollowingUpdatePaperKey(paper)) ? seen : unseen).push(paper);
  });
  return [...unseen.sort(byRecency), ...seen.sort(byRecency)];
}
