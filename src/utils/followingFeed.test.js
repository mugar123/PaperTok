import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFollowReasonLabel,
  getFollowingFeedRelevanceScore,
  orderFollowingFeedPapers,
} from './followingFeed.js';

const NOW = Date.parse('2026-07-28T12:00:00Z');

function followedPaper(id, followId, overrides = {}) {
  return {
    id,
    title: `Paper ${id}`,
    published: '2026-07-20',
    citationCount: 2,
    _followedEntityMatches: [{
      type: 'institution',
      canonicalId: followId,
      displayName: followId,
    }],
    ...overrides,
  };
}

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

test('localizes followed taxonomy topics without changing stored follow data', () => {
  const galacticAstrophysics = {
    type: 'topic',
    canonicalId: 'astro-ph.GA',
    displayName: 'Astrofísica Galáctica',
  };

  assert.equal(
    buildFollowReasonLabel([galacticAstrophysics], 'en'),
    'Because you follow Astrophysics of Galaxies',
  );
  assert.equal(
    buildFollowReasonLabel([galacticAstrophysics], 'es'),
    'Porque sigues Astrofísica Galáctica',
  );
  assert.equal(galacticAstrophysics.displayName, 'Astrofísica Galáctica');
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

test('uses seen state as a novelty signal without hiding a much stronger paper', () => {
  const items = [
    followedPaper('seen-relevant', 'MIT', { doi: '10.1/a', published: '2026-07-27', citationCount: 20 }),
    followedPaper('unseen-stale', 'MIT', { doi: '10.1/b', published: '2026-02-01', citationCount: 0 }),
  ];
  const seen = new Set(['doi:10.1/a']);

  const ordered = orderFollowingFeedPapers(items, seen, { now: NOW }).map(paper => paper.id);
  assert.deepEqual(ordered, ['seen-relevant', 'unseen-stale']);
});

test('rewards papers that match several followed entities', () => {
  const singleMatch = followedPaper('single', 'MIT');
  const multipleMatches = {
    ...followedPaper('multiple', 'MIT'),
    _followedEntityMatches: [
      ...singleMatch._followedEntityMatches,
      { type: 'topic', canonicalId: 'T1', displayName: 'Quantum Physics' },
    ],
  };

  assert.ok(
    getFollowingFeedRelevanceScore(multipleMatches, new Set(), NOW)
      > getFollowingFeedRelevanceScore(singleMatch, new Set(), NOW),
  );
});

test('mixes similarly relevant follows instead of preserving five-paper source blocks', () => {
  const items = [
    ...Array.from({ length: 5 }, (_, index) => followedPaper(`mit-${index}`, 'MIT')),
    ...Array.from({ length: 5 }, (_, index) => followedPaper(`leiden-${index}`, 'Leiden')),
  ];
  const ordered = orderFollowingFeedPapers(items, new Set(), { now: NOW });
  const followIds = ordered.map(paper => paper._followedEntityMatches[0].canonicalId);
  let longestRun = 1;
  let currentRun = 1;
  for (let index = 1; index < followIds.length; index += 1) {
    currentRun = followIds[index] === followIds[index - 1] ? currentRun + 1 : 1;
    longestRun = Math.max(longestRun, currentRun);
  }

  assert.ok(followIds.slice(0, 4).includes('MIT'));
  assert.ok(followIds.slice(0, 4).includes('Leiden'));
  assert.ok(longestRun <= 2);
});

test('breaks otherwise equal relevance with citations and tolerates empty input', () => {
  const items = [
    followedPaper('low', 'MIT', { doi: '10.2/a', citationCount: 1 }),
    followedPaper('high', 'Leiden', { doi: '10.2/b', citationCount: 40 }),
  ];
  const ordered = orderFollowingFeedPapers(items, new Set(), { now: NOW }).map(paper => paper.id);
  assert.deepEqual(ordered, ['high', 'low']);
  assert.deepEqual(orderFollowingFeedPapers(undefined, undefined), []);
});
