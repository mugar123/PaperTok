export function dedupeInteractionPapers(papers = []) {
  const uniquePapers = new Map();

  for (const paper of papers) {
    const paperId = String(paper?.id || '').trim();
    if (!paperId || uniquePapers.has(paperId)) continue;
    uniquePapers.set(paperId, paper);
  }

  return Array.from(uniquePapers.values());
}
