import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFollowReasonLabel, orderFollowingFeedPapers } from './followingFeed.js';

test('names the followed entity behind a paper', () => {
  assert.equal(
    buildFollowReasonLabel([{ type: 'author', displayName: 'Haim Goldberg' }]),
    'Porque sigues a Haim Goldberg',
  );
  assert.equal(
    buildFollowReasonLabel([{ type: 'topic', displayName: 'Cosmología' }]),
    'Porque sigues Cosmología',
  );
  assert.equal(
    buildFollowReasonLabel([{ type: 'institution', displayName: 'Leiden University' }]),
    'Porque sigues Leiden University',
  );
  assert.equal(
    buildFollowReasonLabel([{ type: 'project', displayName: 'NuBSM' }]),
    'Porque sigues el proyecto NuBSM',
  );
});

test('joins two reasons and collapses three or more', () => {
  assert.equal(
    buildFollowReasonLabel([
      { type: 'author', displayName: 'Ada Lovelace' },
      { type: 'topic', displayName: 'Computación' },
    ]),
    'Porque sigues a Ada Lovelace y Computación',
  );
  assert.equal(
    buildFollowReasonLabel([
      { type: 'author', displayName: 'A' },
      { type: 'topic', displayName: 'B' },
      { type: 'project', displayName: 'C' },
    ]),
    'Coincide con varios de tus seguimientos',
  );
  assert.equal(buildFollowReasonLabel([]), '');
  assert.equal(buildFollowReasonLabel([{ type: 'author' }]), '');
});

test('orders unseen papers before seen ones, newest first within each group', () => {
  const items = [
    { id: 'seen-new', doi: '10.1/a', published: '2026-07-26', citationCount: 0 },
    { id: 'unseen-old', doi: '10.1/b', published: '2026-07-01', citationCount: 3 },
    { id: 'unseen-new', doi: '10.1/c', published: '2026-07-25', citationCount: 0 },
    { id: 'seen-old', doi: '10.1/d', published: '2026-06-10', citationCount: 9 },
  ];
  const seen = new Set(['doi:10.1/a', 'doi:10.1/d']);

  const ordered = orderFollowingFeedPapers(items, seen).map(paper => paper.id);
  assert.deepEqual(ordered, ['unseen-new', 'unseen-old', 'seen-new', 'seen-old']);
});

test('breaks publication-date ties with citations and tolerates empty input', () => {
  const items = [
    { id: 'low', doi: '10.2/a', published: '2026-07-20', citationCount: 1 },
    { id: 'high', doi: '10.2/b', published: '2026-07-20', citationCount: 40 },
  ];
  const ordered = orderFollowingFeedPapers(items, new Set()).map(paper => paper.id);
  assert.deepEqual(ordered, ['high', 'low']);
  assert.deepEqual(orderFollowingFeedPapers(undefined, undefined), []);
});
