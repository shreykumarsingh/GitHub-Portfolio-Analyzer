import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';

const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}),
});
const baseURL = process.env.TEST_BASE_URL || 'http://127.0.0.1:5173';
const failures = [];
let passed = 0;

async function scenario(name, run) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let mode = 'success';
  let delayedReview;
  const review = (verdict = 'Provider review') => ({ verdict, recruiterImpression: 'Public data summary', topPriority: 'Improve docs', weeklyPlan: 'Week 1: docs', recommendations: [{ title: 'Documentation', detail: 'Add setup steps', priority: 'high', impact: 'Easier setup' }], reposToPin: ['demo-project'], reposToArchive: [] });
  // Force dummy provider configuration; no real credentials or API requests are used.
  await page.route('**/src/analyzer.js*', async route => {
    const response = await route.fetch();
    const body = (await response.text()).replaceAll('config = import.meta.env ?? {}', 'config = { VITE_GEMINI_API_KEY: "browser-test-key" }');
    await route.fulfill({ response, body });
  });
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.route('https://fonts.gstatic.com/**', route => route.abort());
  await page.route('https://generativelanguage.googleapis.com/**', async route => {
    if (mode === 'slow') {
      delayedReview = route;
      return;
    }
    const text = mode === 'malformed' ? '{"recommendations": {}}' : JSON.stringify(review());
    await route.fulfill({ json: { candidates: [{ content: { parts: [{ text }] } }] } });
  });
  await page.route('https://api.github.com/**', async route => {
    const url = new URL(route.request().url());
    if (mode === 'offline') return route.abort('failed');
    if (mode === 'missing' || mode === 'rate') return route.fulfill({ status: mode === 'missing' ? 404 : 403, json: {} });
    if (/\/users\/[^/]+$/.test(url.pathname)) return route.fulfill({ json: { login: url.pathname.split('/').pop(), name: url.pathname.split('/').pop(), followers: 5, bio: 'Example profile biography', public_repos: 1 } });
    if (url.pathname.endsWith('/repos')) return route.fulfill({ json: mode === 'empty' ? [] : [{ name: 'demo-project', fork: false, stargazers_count: 1, forks_count: 0, size: 100, description: 'Example repository', pushed_at: new Date().toISOString(), topics: ['demo'] }] });
    if (url.pathname.endsWith('/readme')) return route.fulfill({ body: '# Example\n## Setup\nnpm install\n## Usage\nA useful project.' });
    if (url.pathname.endsWith('/languages')) return route.fulfill({ json: { JavaScript: 1000 } });
    if (url.pathname.endsWith('/commits')) return route.fulfill({ json: [{ commit: { message: 'feat: implement example' } }] });
    if (url.pathname.includes('/events/')) return route.fulfill({ json: [{ type: 'PushEvent', created_at: new Date().toISOString() }] });
    throw new Error(`Unexpected API path ${url.pathname}`);
  });
  try {
    await page.goto(baseURL);
    await run({ page, setMode: value => { mode = value; }, resolveOld: async () => {
      assert.ok(delayedReview, 'Older provider request was captured');
      await delayedReview.fulfill({ json: { candidates: [{ content: { parts: [{ text: JSON.stringify(review('STALE REVIEW')) }] } }] } });
    } });
    assert.deepEqual(errors, [], 'No browser exceptions');
    passed++;
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push(name);
    console.error(`FAIL ${name}: ${error.message}`);
  } finally { await page.close(); }
}
const analyze = async (page, username = 'example') => {
  await page.getByRole('textbox').fill(username);
  await page.getByRole('button', { name: 'Analyze', exact: true }).click();
};

try {
  await scenario('input validation and keyboard submission', async ({ page }) => {
    await page.getByRole('button', { name: 'Analyze', exact: true }).click();
    await page.getByRole('alert').waitFor();
    await page.getByRole('textbox').fill('https://github.com/user/repo');
    await page.getByRole('textbox').press('Enter');
    assert.match(await page.getByRole('alert').textContent(), /profile URL/);
    await page.getByRole('textbox').fill('https://github.com/example');
    await page.getByRole('textbox').press('Enter');
    await page.getByRole('heading', { name: 'AI Review', exact: true }).waitFor();
  });
  for (const [mode, message] of [['missing', /not found/], ['rate', /rate limit/], ['offline', /fetch/i]]) {
    await scenario(`${mode} error and retry`, async ({ page, setMode }) => {
      setMode(mode);
      await analyze(page);
      await page.getByRole('alert').waitFor();
      assert.match(await page.getByRole('alert').textContent(), message);
      setMode('success');
      await analyze(page);
      await page.getByRole('heading', { name: 'AI Review', exact: true }).waitFor();
    });
  }
  await scenario('empty repository list', async ({ page, setMode }) => {
    setMode('empty');
    await analyze(page);
    await page.getByRole('heading', { name: 'AI Review', exact: true }).waitFor();
    assert.ok(!(await page.locator('body').innerText()).includes('NaN'));
  });
  await scenario('malformed AI response falls back without crashing', async ({ page, setMode }) => {
    setMode('malformed');
    await analyze(page);
    await page.getByRole('heading', { name: 'Built-in Review', exact: true }).waitFor();
  });
  await scenario('mobile and desktop results fit viewport', async ({ page }) => {
    await analyze(page);
    await page.getByRole('heading', { name: 'AI Review', exact: true }).waitFor();
    for (const width of [320, 375, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const fits = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
      assert.ok(fits, `No horizontal overflow at ${width}px`);
    }
  });
  await scenario('sample profile chip starts analysis', async ({ page }) => {
    await page.getByRole('button', { name: '@shadcn', exact: true }).click();
    await page.getByRole('heading', { name: 'AI Review', exact: true }).waitFor();
    assert.equal(await page.getByRole('textbox').inputValue(), 'shadcn');
    await page.getByRole('heading', { name: 'shadcn', exact: true }).waitFor();
  });
  await scenario('copy summary includes all dimensions', async ({ page }) => {
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.copiedSummary = text; } } }));
    await analyze(page);
    await page.getByRole('heading', { name: 'AI Review', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Copy Summary' }).click();
    await page.getByRole('button', { name: 'Copied to clipboard!' }).waitFor();
    const summary = await page.evaluate(() => window.copiedSummary);
    assert.match(summary, /@example/);
    assert.match(summary, /Profile Completeness:/);
  });
  await scenario('denied clipboard shows an error and allows export', async ({ page }) => {
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('Permission denied'); } } }));
    await analyze(page);
    await page.getByRole('heading', { name: 'AI Review', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Copy Summary' }).click();
    await page.getByRole('alert').waitFor();
    assert.match(await page.getByRole('alert').textContent(), /Could not copy/);
    assert.equal(await page.getByRole('button', { name: 'Copied to clipboard!' }).count(), 0);
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export Report (.md)' }).click();
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), 'github-portfolio-report-example.md');
    const text = await readFile(await download.path(), 'utf8');
    assert.match(text, /# GitHub Portfolio Review: @example/);
    assert.match(text, /Profile Completeness:/);
    assert.match(text, /Provider review/);
    assert.ok(!text.includes('undefined'));
  });
  await scenario('older AI response cannot overwrite a newer profile', async ({ page, setMode, resolveOld }) => {
    setMode('slow');
    await analyze(page, 'first-user');
    await page.getByText('AI recruiter is reviewing your profile...').waitFor();
    // Wait for the provider request to be sent, without waiting for its response.
    await page.waitForTimeout(100);
    setMode('success');
    await analyze(page, 'second-user');
    await page.getByRole('heading', { name: 'AI Review', exact: true }).waitFor();
    await resolveOld();
    await page.waitForTimeout(100);
    assert.equal(await page.getByText('STALE REVIEW', { exact: true }).count(), 0);
    await page.getByRole('heading', { name: 'second-user', exact: true }).waitFor();
  });
} finally { await browser.close(); }
console.log(`${passed} passed; ${failures.length} failed`);
if (failures.length) process.exitCode = 1;
