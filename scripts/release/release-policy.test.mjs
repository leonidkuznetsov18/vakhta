import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';

// Resolve the actual plugins supplied by semantic-release, without a second dependency version.
const require = createRequire(import.meta.resolve('semantic-release'));
const { analyzeCommits } = await import(
  pathToFileURL(require.resolve('@semantic-release/commit-analyzer'))
);
const { generateNotes } = await import(
  pathToFileURL(require.resolve('@semantic-release/release-notes-generator'))
);
const config = JSON.parse(readFileSync(new URL('../../.releaserc.json', import.meta.url), 'utf8'));
const options = (name) => config.plugins.find((plugin) => plugin[0] === name)[1];
const commits = (...messages) =>
  messages.map((message, index) => ({ message, hash: String(index + 1).padStart(40, '0') }));
const context = (messages) => ({
  cwd: process.cwd(),
  commits: commits(...messages),
  logger: { log() {} },
});
const analyze = (...messages) =>
  analyzeCommits(options('@semantic-release/commit-analyzer'), context(messages));

test('every ordinary commit type and an unstructured change produces a patch', async () => {
  for (const type of [
    'fix',
    'perf',
    'refactor',
    'config',
    'infra',
    'docs',
    'ci',
    'chore',
    'test',
    'style',
    'build',
    'revert',
  ]) {
    assert.equal(await analyze(`${type}(panel): improve delivery`), 'patch', type);
  }
  assert.equal(await analyze('Improve delivery'), 'patch');
});

test('breaking changes always win over matching minor and patch rules', async () => {
  assert.equal(await analyze('feat: add calendar'), 'minor');
  for (const type of ['feat', 'fix', 'docs', 'ci', 'chore']) {
    assert.equal(await analyze(`${type}!: replace interface`), 'major', type);
    assert.equal(
      await analyze(`${type}: replace interface\n\nBREAKING CHANGE: remove old interface`),
      'major',
      type,
    );
  }
  assert.equal(await analyze('docs: explain form', 'feat: add calendar'), 'minor');
  assert.equal(await analyze('feat: add calendar', 'fix!: replace interface'), 'major');
  assert.equal(await analyze(), null);
});

test('maintenance-only releases have visible changelog entries', async () => {
  const notes = await generateNotes(options('@semantic-release/release-notes-generator'), {
    ...context([
      'chore: update tooling',
      'style: align controls',
      'build: update bundler',
      'ci: improve delivery',
      'test: cover retry',
    ]),
    options: { repositoryUrl: 'https://github.com/leonidkuznetsov18/vakhta.git' },
    lastRelease: { gitTag: 'v1.0.0' },
    nextRelease: { version: '1.0.1', gitTag: 'v1.0.1' },
  });
  for (const text of [
    'update tooling',
    'align controls',
    'update bundler',
    'improve delivery',
    'cover retry',
  ]) {
    assert.ok(notes.includes(text), text);
  }
});
