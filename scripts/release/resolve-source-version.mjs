import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const stableTag = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** Resolve the release of an explicit source commit, including its semantic-release child. */
export function resolveSourceVersion(source, cwd = process.cwd()) {
  if (typeof source !== 'string' || !/^[\da-f]{40}$|^[\da-f]{64}$/i.test(source)) {
    throw new Error('A full source commit SHA is required');
  }
  const git = (...args) =>
    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  const commit = git('rev-parse', '--verify', '--end-of-options', `${source}^{commit}`);
  const tags = git('for-each-ref', '--format=%(refname:strip=2)', 'refs/tags')
    .split('\n')
    .filter((tag) => stableTag.test(tag))
    .sort(compareVersionsDescending);
  const taggedCommits = tags.map((tag) => ({
    tag,
    commit: git('rev-parse', '--verify', `refs/tags/${tag}^{commit}`),
  }));
  const direct = taggedCommits.find((entry) => entry.commit === commit);
  if (direct) return direct.tag.slice(1);
  for (const entry of taggedCommits) {
    const [parents, subject] = git('show', '--no-patch', '--format=%P%n%s', entry.commit).split(
      '\n',
    );
    if (parents === commit && subject === `chore(release): ${entry.tag} [skip ci]`) {
      return entry.tag.slice(1);
    }
  }
  const ancestors = git('tag', '--merged', commit)
    .split('\n')
    .filter((tag) => stableTag.test(tag));
  if (ancestors.length === 0) return '0.0.0';
  return git(
    'describe',
    '--tags',
    '--abbrev=0',
    ...ancestors.flatMap((tag) => ['--match', tag]),
    commit,
  ).slice(1);
}

function compareVersionsDescending(left, right) {
  const a = left.slice(1).split('.').map(BigInt);
  const b = right.slice(1).split('.').map(BigInt);
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] > b[i] ? -1 : 1;
  }
  return 0;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    console.log(resolveSourceVersion(process.argv[2]));
  } catch {
    console.error('Unable to resolve the release version for the source commit');
    process.exitCode = 1;
  }
}
