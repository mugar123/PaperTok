import test from 'node:test';
import assert from 'node:assert/strict';
import { mapWikipediaSearchResponse } from './wikiService.js';

test('maps a Wikipedia search result in the requested language', () => {
  const result = mapWikipediaSearchResponse({
    query: {
      pages: {
        12: {
          index: 1,
          title: 'General relativity',
          extract: 'General relativity is a theory of gravitation developed by Albert Einstein.',
          fullurl: 'https://en.wikipedia.org/wiki/General_relativity',
          thumbnail: { source: 'https://upload.wikimedia.org/example.jpg' },
        },
      },
    },
  }, 'en');

  assert.deepEqual(result, {
    title: 'General relativity',
    extract: 'General relativity is a theory of gravitation developed by Albert Einstein.',
    thumbnail: 'https://upload.wikimedia.org/example.jpg',
    url: 'https://en.wikipedia.org/wiki/General_relativity',
    language: 'en',
  });
});

test('skips disambiguation and empty Wikipedia results', () => {
  assert.equal(mapWikipediaSearchResponse({
    query: {
      pages: {
        1: {
          index: 1,
          title: 'Relativity',
          extract: 'Relativity may refer to several concepts.',
          pageprops: { disambiguation: '' },
        },
        2: {
          index: 2,
          title: 'Empty result',
          extract: '',
        },
      },
    },
  }, 'en'), null);
});
