import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { resolveSourceVersion } from './resolve-source-version.mjs';

function repository(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'vakhta-release-test-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  git('init', '--quiet');
  git('config', 'user.name', 'Release Test');
  git('config', 'user.email', 'release-test@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  git('config', 'tag.gpgsign', 'false');
  git('config', 'core.hooksPath', '/dev/null');
  const commit = (subject) => {
    git('commit', '--quiet', '--allow-empty', '-m', subject);
    return git('rev-parse', 'HEAD');
  };
  return { cwd, git, commit };
}

test('a rerun uses its semantic-release child and ignores later or unrelated releases', (t) => {
  const { cwd, git, commit } = repository(t);
  commit('initial release');
  git('tag', 'v0.70.8');
  const source = commit('fix: persist required work');
  commit('chore(release): v0.70.9 [skip ci]');
  git('tag', '-a', 'v0.70.9', '-m', 'Release');
  assert.equal(resolveSourceVersion(source, cwd), '0.70.9');
  commit('fix: later change');
  commit('chore(release): v0.70.10 [skip ci]');
  git('tag', 'v0.70.10');
  git('checkout', '--quiet', '--detach', source);
  commit('unrelated child');
  git('tag', 'v9.0.0');
  assert.equal(resolveSourceVersion(source, cwd), '0.70.9');
});

test('direct tags and docs-only descendants retain their source release', (t) => {
  const { cwd, git, commit } = repository(t);
  const source = commit('initial release');
  git('tag', '-a', 'v1.2.3', '-m', 'Release');
  assert.equal(resolveSourceVersion(source, cwd), '1.2.3');
  const docs = commit('docs: explain deployment');
  git('tag', 'v8.0.0-beta.1');
  assert.equal(resolveSourceVersion(docs, cwd), '1.2.3');
});

test('a source without stable release tags returns the explicit initial version', (t) => {
  const { cwd, git, commit } = repository(t);
  const source = commit('initial commit');
  git('tag', 'not-a-release');
  assert.equal(resolveSourceVersion(source, cwd), '0.0.0');
});

test('lightweight tags identify direct releases and semantic-release children', (t) => {
  const { cwd, git, commit } = repository(t);
  const source = commit('fix: original source');
  commit('chore(release): v2.0.1 [skip ci]');
  git('tag', 'v2.0.1');
  assert.equal(resolveSourceVersion(source, cwd), '2.0.1');
  assert.equal(resolveSourceVersion(git('rev-parse', 'HEAD'), cwd), '2.0.1');
});

test('a tagged merge cannot masquerade as the source release child', (t) => {
  const { cwd, git, commit } = repository(t);
  const base = commit('initial release');
  git('tag', 'v1.0.0');
  const source = commit('fix: original source');
  const merge = git(
    'commit-tree',
    git('rev-parse', `${source}^{tree}`),
    '-p',
    source,
    '-p',
    base,
    '-m',
    'chore(release): v9.0.0 [skip ci]',
  );
  git('tag', 'v9.0.0', merge);
  assert.equal(resolveSourceVersion(source, cwd), '1.0.0');
});

test('invalid sources fail rather than deploying a guessed version', (t) => {
  const { cwd, git, commit } = repository(t);
  commit('initial commit');
  git('tag', 'v1.0.0');
  assert.throws(() => resolveSourceVersion('HEAD', cwd));
  assert.throws(() => resolveSourceVersion('f'.repeat(40), cwd));
});
