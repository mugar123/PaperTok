import test from 'node:test';
import assert from 'node:assert/strict';
import { mapICitePublication, mergeICiteEnrichment } from './iCiteService.js';

test('maps confirmed NIH iCite zero citations separately from unknown metadata', () => {
  const metrics = mapICitePublication({
    pmid: 123456,
    doi: 'https://doi.org/10.1000/Example',
    citation_count: 0,
    relative_citation_ratio: null,
    nih_percentile: 17.5,
    apt: 0.2,
    is_clinical: false,
    provisional: true,
  });

  assert.equal(metrics.pmid, '123456');
  assert.equal(metrics.doi, '10.1000/example');
  assert.equal(metrics.citationCount, 0);
  assert.equal(metrics.citationCountKnown, true);
  assert.equal(metrics.iciteMetrics.relativeCitationRatio, null);
  assert.equal(metrics.iciteMetrics.nihPercentile, 17.5);
});

test('merges iCite metrics only into the matching PubMed paper', () => {
  const papers = [
    { id: 'pmid:1', pmid: '1', title: 'Matched', sources: { primary: 'pubmed', enrichedBy: [] } },
    { id: 'arxiv:1', title: 'Unmatched', sources: { primary: 'arxiv', enrichedBy: [] } },
  ];
  const merged = mergeICiteEnrichment(papers, {
    1: { pmid: '1', citationCount: 9, citationCountKnown: true, iciteMetrics: { nihPercentile: 80 } },
  });

  assert.equal(merged[0].citationCount, 9);
  assert.equal(merged[0].iciteMetrics.nihPercentile, 80);
  assert.ok(merged[0].sources.enrichedBy.includes('icite'));
  assert.equal(merged[1], papers[1]);
});
