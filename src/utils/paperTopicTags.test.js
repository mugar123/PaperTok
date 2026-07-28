import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPaperTopicTags } from './paperTopicTags.js';

test('keeps original arXiv categories ahead of later OpenAlex concepts', () => {
  const basePaper = {
    primaryCategory: 'astro-ph.CO',
    categories: ['astro-ph.CO', 'gr-qc', 'hep-ph'],
  };
  const before = buildPaperTopicTags(basePaper);
  const after = buildPaperTopicTags({
    ...basePaper,
    concepts: [
      { id: 'C1', display_name: 'Cosmology' },
      { id: 'C2', display_name: 'Dark matter' },
    ],
  });

  assert.deepEqual(after.slice(0, before.length), before);
  assert.deepEqual(after.map(tag => tag.label), [
    'Relatividad General',
    'Altas Energías (Fenomenología)',
    'Cosmology',
    'Dark matter',
  ]);
});

test('deduplicates concepts that repeat a visible category label', () => {
  const tags = buildPaperTopicTags({
    primaryCategory: 'astro-ph.CO',
    categories: ['astro-ph.CO', 'physics.optics'],
    concepts: [
      { id: 'C1', display_name: 'Óptica' },
      { id: 'C2', display_name: 'Photonics' },
    ],
  });

  assert.deepEqual(tags.map(tag => tag.label), ['Óptica', 'Photonics']);
});

test('hides PACS classification codes from visible paper topics', () => {
  const tags = buildPaperTopicTags({
    primaryCategory: 'gr-qc',
    categories: ['gr-qc', '11.25.Tq', '03.65.Ud'],
    concepts: [
      { id: 'ads:pacs', display_name: '04.70.Dy' },
      { id: 'C1', display_name: 'Quantum gravity' },
    ],
  }, 4, 'en');

  assert.deepEqual(tags.map(tag => tag.label), ['Quantum gravity']);
});
