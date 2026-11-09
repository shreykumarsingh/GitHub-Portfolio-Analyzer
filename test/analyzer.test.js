import test from 'node:test';
import assert from 'node:assert/strict';
import { extractUsername, computeScores, generateFallbackAI, validateAI, fetchProfile } from '../src/analyzer.js';

const fixture = () => ({ user: { login: 'example', followers: 0 }, allRepos: [], originalRepos: [], forkedRepos: [], repoDetails: [], events: [] });

test('accepts usernames and profile URLs, rejects misleading hosts and repository paths', () => {
  for (const value of ['octocat', 'https://github.com/octocat/', 'github.com/octocat?tab=repositories']) assert.equal(extractUsername(value), 'octocat');
  for (const value of ['', 'https://evilgithub.com/octocat', 'https://github.com/a/repo', 'a/b', '-name', 'a--b', 'https://github.com@evil.com/a']) assert.throws(() => extractUsername(value));
});

test('empty profiles do not fabricate inactivity durations or README findings', () => {
  const scores = computeScores(fixture());
  assert.equal(scores.stats.daysSinceLastActivity, null);
  assert.ok(Number.isFinite(scores.overall));
  assert.ok(!scores.redFlags.some(flag => /999|screenshots|demo links/.test(flag)));
  const review = generateFallbackAI(fixture(), scores);
  assert.equal(review.recommendations.length, 5);
  assert.equal(new Set(review.recommendations.map(rec => rec.title)).size, 5);
});

test('streaks require consecutive UTC dates', () => {
  const data = fixture();
  data.events = ['2026-01-01', '2026-01-03', '2026-01-04'].map(day => ({ type: 'PushEvent', created_at: `${day}T12:00:00Z` }));
  assert.equal(computeScores(data).stats.maxStreak, 2);
});

test('local feedback preserves README order and AI schema rejects unsafe render shapes', () => {
  const scores = computeScores(fixture());
  scores.readmeAnalysis = [{ repo: 'first', score: 20 }, { repo: 'second', score: 0 }];
  const review = generateFallbackAI(fixture(), scores);
  assert.equal(scores.readmeAnalysis[0].repo, 'first');
  assert.equal(validateAI(review).source, 'provider');
  assert.throws(() => validateAI({ ...review, recommendations: {} }));
  assert.throws(() => validateAI({ ...review, verdict: {} }));
  assert.throws(() => validateAI({ ...review, reposToPin: [null] }));
});

test('GitHub fetching paginates repositories and tolerates unavailable public events', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async url => {
    calls.push(url);
    if (url.endsWith('/users/example')) return Response.json({ login: 'example' });
    if (new URL(url).searchParams.get('page') === '1') return Response.json(Array.from({ length: 100 }, (_, i) => ({ name: `fork-${i}`, fork: true })));
    if (new URL(url).searchParams.get('page') === '2') return Response.json([{ name: 'last-fork', fork: true }]);
    if (url.includes('/events/')) throw new Error('Network unavailable');
    throw new Error(`Unexpected URL ${url}`);
  };
  try {
    const data = await fetchProfile('example');
    assert.equal(data.allRepos.length, 101);
    assert.equal(data.eventsAvailable, false);
    assert.equal(calls.length, 4);
  } finally { globalThis.fetch = originalFetch; }
});
