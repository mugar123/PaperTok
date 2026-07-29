import test from 'node:test';
import assert from 'node:assert/strict';
import { getInstitutionAuthorsFromCrossref } from './crossrefInstitutionService.js';

test('builds a searchable institution author fallback from Crossref works', async () => {
  let requestedUrl = '';
  const request = async (url) => {
    requestedUrl = url;
    return new Response(JSON.stringify({
      message: {
        items: [
          {
            'is-referenced-by-count': 12,
            author: [
              { given: 'Ada', family: 'Lovelace', ORCID: 'https://orcid.org/0000-0001-0000-0001' },
              { given: 'Grace', family: 'Hopper' },
            ],
          },
          {
            'is-referenced-by-count': 8,
            author: [
              { given: 'Ada', family: 'Lovelace', ORCID: 'https://orcid.org/0000-0001-0000-0001' },
            ],
          },
        ],
      },
    }), { status: 200 });
  };

  const result = await getInstitutionAuthorsFromCrossref(
    'University of Salamanca',
    1,
    'Ada',
    request,
  );

  assert.match(requestedUrl, /query\.affiliation=University\+of\+Salamanca/);
  assert.match(requestedUrl, /query\.author=Ada/);
  assert.equal(result.source, 'crossref');
  assert.equal(result.authors.length, 1);
  assert.equal(result.authors[0].display_name, 'Ada Lovelace');
  assert.equal(result.authors[0].works_count, 2);
  assert.equal(result.authors[0].cited_by_count, 20);
});

test('does not pretend that the Crossref author fallback has further pages', async () => {
  const result = await getInstitutionAuthorsFromCrossref(
    'University of Salamanca',
    2,
    '',
    async () => {
      throw new Error('The second page should not request Crossref');
    },
  );

  assert.deepEqual(result, { authors: [], total: 0, source: 'crossref' });
});
