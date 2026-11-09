import test from 'node:test';
import assert from 'node:assert/strict';
import { extractUsername, computeScores, generateFallbackAI, validateAI, fetchProfile, getAI } from '../src/analyzer.js';

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

async function withFetch(mock, task) {
  const previous = globalThis.fetch;
  globalThis.fetch = mock;
  try { return await task(); } finally { globalThis.fetch = previous; }
}

const repo = (name = 'project') => ({ name, fork: false, stargazers_count: 2, forks_count: 1, pushed_at: '2026-01-01T00:00:00Z', size: 300, description: 'A useful example project', topics: ['demo'] });

for (const [status, message] of [[404, /not found/], [403, /rate limit/], [500, /GitHub API error/]]) {
  test(`GitHub ${status} errors produce understandable messages`, async () => {
    await withFetch(async () => new Response('{}', { status }), async () => assert.rejects(fetchProfile('example'), message));
  });
}

test('repository failure stops analysis instead of showing empty results', async () => {
  await withFetch(async url => url.endsWith('/users/example') ? Response.json({ login: 'example' }) : new Response('{}', { status: 503 }), async () => assert.rejects(fetchProfile('example'), /Could not fetch repositories/));
});

test('malformed repository response is rejected', async () => {
  await withFetch(async () => Response.json({ login: 'example' }), async () => assert.rejects(fetchProfile('example'), /Invalid repository response/));
});

test('detail failures preserve metadata and do not claim an unavailable README is missing', async () => {
  await withFetch(async url => {
    if (url.endsWith('/users/example')) return Response.json({ login: 'example', followers: 0 });
    if (url.includes('/repos?')) return Response.json([repo()]);
    if (url.includes('/events/')) return Response.json([]);
    return new Response('{}', { status: 403 });
  }, async () => {
    const data = await fetchProfile('example');
    assert.equal(data.repoDetails[0].readmeStatus, 'unavailable');
    const scores = computeScores(data);
    assert.match(scores.readmeAnalysis[0].issues[0], /could not be fetched/);
    assert.ok(!scores.redFlags.some(flag => /have no README/.test(flag)));
  });
});

test('successful detail fetching uses raw README and extracts commits and languages', async () => {
  await withFetch(async (url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    assert.ok(options.signal instanceof AbortSignal);
    if (url.endsWith('/users/example')) return Response.json({ login: 'example' });
    if (url.includes('/repos?')) return Response.json([repo()]);
    if (url.endsWith('/readme')) { assert.match(options.headers.Accept, /raw/); return new Response('# Demo\nSetup and usage'); }
    if (url.endsWith('/languages')) return Response.json({ JavaScript: 2000 });
    if (url.includes('/commits?')) return Response.json([{ commit: { message: 'feat: add useful feature' } }]);
    return Response.json([]);
  }, async () => {
    const data = await fetchProfile('example', { VITE_GITHUB_TOKEN: 'test-token' });
    assert.equal(data.repoDetails[0].readmeStatus, 'loaded');
    assert.equal(data.repoDetails[0].languages.JavaScript, 2000);
    assert.deepEqual(data.repoDetails[0].commitMessages, ['feat: add useful feature']);
  });
});

test('all score dimensions stay in range and overall matches weights', () => {
  for (const count of [0, 1, 10, 100]) {
    const data = fixture();
    data.allRepos = data.originalRepos = Array.from({ length: count }, (_, i) => repo(`repo-${i}`));
    data.repoDetails = data.allRepos.slice(0,10).map(r => ({ ...r, languages: { JavaScript: 100000 }, recentCommits: [], commitMessages: [], readmeContent: '# Readme\n'.repeat(300) }));
    const s = computeScores(data);
    for (const key of ['profile', 'documentation', 'activity', 'commitQuality', 'repoOrganization', 'technicalDepth', 'overall']) assert.ok(Number.isFinite(s[key]) && s[key] >= 0 && s[key] <= 100, key);
    assert.equal(s.overall, Math.round(s.profile * .1 + s.documentation * .25 + s.commitQuality * .15 + s.activity * .2 + s.repoOrganization * .15 + s.technicalDepth * .15));
  }
});

const validReview = () => ({ verdict: 'Example verdict', recruiterImpression: 'Example impression', topPriority: 'Improve docs', weeklyPlan: 'Week 1: docs', recommendations: [{ title: 'Docs', detail: 'Add setup', priority: 'high', impact: 'Clear setup' }], reposToPin: ['project'], reposToArchive: [] });

for (const provider of ['gemini', 'groq', 'anthropic']) {
  test(`${provider} successful JSON response is validated`, async () => {
    const config = { [`VITE_${provider.toUpperCase()}_API_KEY`]: 'test-key' };
    await withFetch(async (url, options) => {
      const payload = JSON.parse(options.body);
      assert.equal(options.method, 'POST');
      if (provider === 'gemini') {
        assert.ok(!url.includes('test-key'));
        assert.match(url, /gemini-2.5-flash/);
        assert.equal(options.headers['x-goog-api-key'], 'test-key');
        return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(validReview()) }] } }] });
      }
      if (provider === 'groq') {
        assert.equal(payload.model, 'llama-3.3-70b-versatile');
        return Response.json({ choices: [{ message: { content: JSON.stringify(validReview()) } }] });
      }
      assert.equal(new URL(url).hostname, 'api.anthropic.com');
      return Response.json({ content: [{ text: JSON.stringify(validReview()) }] });
    }, async () => {
      const data = fixture();
      assert.equal((await getAI(data, computeScores(data), config)).source, 'provider');
    });
  });
}

for (const mode of ['http error', 'malformed JSON', 'invalid schema', 'network failure', 'timeout']) {
  test(`AI ${mode} falls back to local feedback`, async () => {
    await withFetch(async () => {
      if (mode === 'network failure') throw new TypeError('Failed to fetch');
      if (mode === 'timeout') throw new DOMException('Timed out', 'TimeoutError');
      if (mode === 'http error') return new Response('{}', { status: 429 });
      return Response.json({ candidates: [{ content: { parts: [{ text: mode === 'malformed JSON' ? 'not JSON' : '{"recommendations":{}}' }] } }] });
    }, async () => {
      const data = fixture();
      const review = await getAI(data, computeScores(data), { VITE_GEMINI_API_KEY: 'test-key' });
      assert.equal(review.source, 'local');
      assert.equal(review.recommendations.length, 5);
    });
  });
}

test('provider fallback order is Gemini then Groq then Anthropic', async () => {
  const hosts = [];
  await withFetch(async url => {
    hosts.push(new URL(url).hostname);
    return new Response('{}', { status: 503 });
  }, async () => {
    const data = fixture();
    assert.equal((await getAI(data, computeScores(data), { VITE_GEMINI_API_KEY: 'x', VITE_GROQ_API_KEY: 'x', VITE_ANTHROPIC_API_KEY: 'x' })).source, 'local');
    assert.deepEqual(hosts, ['generativelanguage.googleapis.com', 'api.groq.com', 'api.anthropic.com']);
  });
});

test('invalid and future activity timestamps do not crash or inflate scores', () => {
  const data = fixture();
  data.events = [{ type: 'PushEvent', created_at: 'invalid' }, { type: 'PushEvent', created_at: '2999-01-01' }];
  const scores = computeScores(data);
  assert.equal(scores.activity, 0);
  assert.equal(scores.stats.maxStreak, 0);
  assert.equal(scores.stats.daysSinceLastActivity, null);
});
