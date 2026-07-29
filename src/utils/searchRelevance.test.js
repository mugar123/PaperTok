import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterRelevantSearchResults,
  getSearchSectionOrder,
  resolvePreferredSearchSection,
  scoreSearchMatch,
} from './searchRelevance.js';

test('keeps exact and complete institution matches ahead of fuzzy noise', () => {
  const results = [
    { name: 'Malaria No More' },
    { name: 'University of Salamanca' },
    { name: 'Pontifical University of Salamanca' },
    { name: 'Salamanca City Council' },
  ];

  const filtered = filterRelevantSearchResults(
    'University of Salamanca',
    results,
    result => [result.name],
  );

  assert.deepEqual(filtered.map(result => result.name), [
    'University of Salamanca',
    'Pontifical University of Salamanca',
  ]);
});

test('rejects partial person-name matches masquerading as institutions', () => {
  assert.equal(scoreSearchMatch('Geoffrey Hinton', ['Hinton Area Foundation']), 35);
  assert.deepEqual(
    filterRelevantSearchResults(
      'Geoffrey Hinton',
      [{ name: 'Hinton Area Foundation' }, { name: 'Geoffrey Beene Foundation' }],
      result => [result.name],
    ),
    [],
  );
});

test('promotes the exact topic or the intent of a suggested search', () => {
  const sectionValues = {
    papers: ['A paper about cosmology'],
    topics: ['Cosmology'],
    institutions: ['Astroparticle and Cosmology Laboratory'],
    projects: ['Cosmology survey'],
  };

  assert.equal(resolvePreferredSearchSection({
    query: 'Cosmology',
    sectionValues,
  }), 'topics');
  assert.equal(resolvePreferredSearchSection({
    query: 'Cosmology',
    hint: 'projects',
    sectionValues,
  }), 'projects');
  assert.ok(
    getSearchSectionOrder('topics', 'topics')
      < getSearchSectionOrder('institutions', 'topics'),
  );
});

test('defaults a general scientific query to papers', () => {
  assert.equal(resolvePreferredSearchSection({
    query: 'CRISPR Cas9',
    sectionValues: {
      papers: ['CRISPR-Cas9 genome editing'],
      projects: ['CRISPR programme'],
    },
  }), 'papers');
});
