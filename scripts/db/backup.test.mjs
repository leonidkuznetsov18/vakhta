// Behaviour of scripts/db/backup.sh with fake pg_dump, psql and aws (no database, no network).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('./backup.sh', import.meta.url));

function tool(dir, name, body) {
  const file = path.join(dir, name);
  writeFileSync(file, `#!/usr/bin/env bash\n${body}\n`);
  chmodSync(file, 0o755);
}

/** Runs backup.sh with fakes; `databases` is what psql lists, `failFor` names a database whose dump fails. */
function runBackup({ databases = [], failFor = '', env = {} } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'vakhta-backup-'));
  const log = path.join(dir, 'calls.log');
  tool(
    dir,
    'pg_dump',
    `if [ "$1" = "--version" ]; then echo "pg_dump (fake) 18"; exit 0; fi
url="\${@: -1}"; file=""
while [ $# -gt 0 ]; do [ "$1" = "--file" ] && file="$2"; shift; done
echo "pg_dump $url" >>"${log}"
case "$url" in *"/${failFor || 'none-fails'}"*) exit 3;; esac
head -c 4096 /dev/zero >"$file"`,
  );
  tool(
    dir,
    'psql',
    `echo "psql $*" >>"${log}"; printf '%s\\n' ${databases.map((d) => `'${d}'`).join(' ')}`,
  );
  tool(dir, 'aws', `echo "aws $*" >>"${log}"`);
  const result = spawnSync('bash', [SCRIPT], {
    encoding: 'utf8',
    env: {
      PATH: `${dir}:${process.env.PATH}`,
      DATABASE_URL: 'postgres://u:p%2Fw@db.example:5432/railway?sslmode=require',
      BACKUP_DIR: path.join(dir, 'out'),
      BACKUP_S3_BUCKET: 'vakhta-backups',
      ...env,
    },
  });
  let calls = [];
  try {
    calls = readFileSync(log, 'utf8').trim().split('\n');
  } catch {
    calls = [];
  }
  return { ...result, calls };
}

test('dumps the pilot under its historical key and every platform database separately', () => {
  const r = runBackup({ databases: ['vakhta_control', 'vakhta_t_zavoda'] });
  assert.equal(r.status, 0, r.stderr);
  const dumps = r.calls.filter((c) => c.startsWith('pg_dump'));
  assert.deepEqual(dumps, [
    'pg_dump postgres://u:p%2Fw@db.example:5432/railway?sslmode=require',
    'pg_dump postgres://u:p%2Fw@db.example:5432/vakhta_control?sslmode=require',
    'pg_dump postgres://u:p%2Fw@db.example:5432/vakhta_t_zavoda?sslmode=require',
  ]);
  const uploads = r.calls.filter((c) => c.startsWith('aws')).map((c) => c.match(/s3:\/\/\S+/)?.[0]);
  assert.match(uploads[0], /^s3:\/\/vakhta-backups\/postgres\/vakhta-\d{8}T\d{6}Z\.dump$/);
  assert.match(
    uploads[1],
    /^s3:\/\/vakhta-backups\/postgres\/vakhta_control\/vakhta_control-\d{8}T\d{6}Z\.dump$/,
  );
  assert.match(
    uploads[2],
    /^s3:\/\/vakhta-backups\/postgres\/vakhta_t_zavoda\/vakhta_t_zavoda-\d{8}T\d{6}Z\.dump$/,
  );
  assert.match(r.stdout, /platform databases: 2, failed: 0/);
});

test('a failed tenant dump does not stop the others and fails the job at the end', () => {
  const r = runBackup({
    databases: ['vakhta_t_alpha', 'vakhta_t_bravo', 'vakhta_t_charlie'],
    failFor: 'vakhta_t_bravo',
  });
  assert.notEqual(r.status, 0);
  const dumped = r.calls.filter((c) => c.startsWith('pg_dump')).length;
  assert.equal(dumped, 4);
  const uploaded = r.calls.filter((c) => c.startsWith('aws')).length;
  assert.equal(uploaded, 3);
  assert.match(r.stderr, /failed databases: vakhta_t_bravo/);
});

test('BACKUP_ALL_DATABASES=false keeps the single pilot dump', () => {
  const r = runBackup({ databases: ['vakhta_t_zavoda'], env: { BACKUP_ALL_DATABASES: 'false' } });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.calls.filter((c) => c.startsWith('pg_dump')).length, 1);
  assert.equal(r.calls.filter((c) => c.startsWith('psql')).length, 0);
});

test('refuses unexpected names and URLs without a database path', () => {
  const odd = runBackup({ databases: ['vakhta_t_bad name'] });
  assert.notEqual(odd.status, 0);
  assert.match(odd.stderr, /unexpected database name/);
  const noPath = runBackup({
    databases: ['vakhta_t_zavoda'],
    env: { DATABASE_URL: 'postgres://u:p@db.example:5432' },
  });
  assert.notEqual(noPath.status, 0);
  assert.match(noPath.stderr, /has no database path/);
  assert.equal(noPath.calls.filter((c) => c.startsWith('pg_dump')).length, 1);
});
