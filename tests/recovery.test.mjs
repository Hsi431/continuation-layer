import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_CONFIG } from '../src/core/constants.mjs';
import { initAgent } from '../src/core/agent-state.mjs';
import { RECOVERY_MODES, runRecoveryCheck } from '../src/core/recovery.mjs';

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'continuity-recovery-'));
  execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
  initAgent({ cwd: dir, taskId: 'task-recovery' });
  return dir;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function stateWithSession(repo, sessionId = 'sess-recovery') {
  return {
    ...readJson(join(repo, '.agent', 'state.json')),
    current_session_id: sessionId,
  };
}

function makeHandoffStale(repo) {
  const old = new Date('2026-06-29T00:00:00.000Z');
  utimesSync(join(repo, '.agent', 'HANDOFF.md'), old, old);
}

test('recovery check reads handoff, git status, and git diff', () => {
  const repo = makeRepo();

  const result = runRecoveryCheck({
    repoRoot: repo,
    config: DEFAULT_CONFIG,
    now: new Date(),
  });

  assert.equal(result.ok, true);
  assert.match(result.handoff, /# Handoff/);
  assert.equal(typeof result.gitStatus, 'string');
  assert.equal(typeof result.gitDiff, 'string');
});

test('recovery check fails when next action is missing', () => {
  const repo = makeRepo();
  writeFileSync(join(repo, '.agent', 'NEXT.md'), '# Next\n');

  const result = runRecoveryCheck({
    repoRoot: repo,
    config: DEFAULT_CONFIG,
    now: new Date(),
  });

  assert.equal(result.ok, false);
  assert.match(result.failures.join('\n'), /\.agent\/NEXT\.md has no next action/);
});

test('recovery check fails when handoff is incomplete', () => {
  const repo = makeRepo();
  writeFileSync(join(repo, '.agent', 'HANDOFF.md'), '# Handoff\n\nmissing sections\n');

  const result = runRecoveryCheck({
    repoRoot: repo,
    config: DEFAULT_CONFIG,
    now: new Date(),
  });

  assert.equal(result.ok, false);
  assert.match(result.failures.join('\n'), /\.agent\/HANDOFF\.md is incomplete/);
});

test('strict continuation fails when handoff is stale', () => {
  const repo = makeRepo();
  makeHandoffStale(repo);

  const result = runRecoveryCheck({
    repoRoot: repo,
    config: DEFAULT_CONFIG,
    now: new Date('2026-06-29T03:00:00.000Z'),
    mode: RECOVERY_MODES.STRICT_CONTINUATION,
  });

  assert.equal(result.ok, false);
  assert.match(result.failures.join('\n'), /\.agent\/HANDOFF\.md is stale/);
  assert.deepEqual(result.warnings, []);
});

test('cooldown resume warns instead of failing when handoff is stale', () => {
  const repo = makeRepo();
  makeHandoffStale(repo);

  const result = runRecoveryCheck({
    repoRoot: repo,
    config: DEFAULT_CONFIG,
    now: new Date('2026-06-29T03:00:00.000Z'),
    mode: RECOVERY_MODES.COOLDOWN_RESUME,
    state: stateWithSession(repo),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.failures, []);
  assert.match(result.warnings.join('\n'), /\.agent\/HANDOFF\.md is stale/);
});

test('cooldown resume warns instead of failing when handoff is missing', () => {
  const repo = makeRepo();
  unlinkSync(join(repo, '.agent', 'HANDOFF.md'));

  const result = runRecoveryCheck({
    repoRoot: repo,
    config: DEFAULT_CONFIG,
    now: new Date('2026-06-29T00:00:00.000Z'),
    mode: RECOVERY_MODES.COOLDOWN_RESUME,
    state: stateWithSession(repo),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.failures, []);
  assert.match(result.warnings.join('\n'), /missing handoff file/);
});

test('cooldown resume fails when session id is missing', () => {
  const repo = makeRepo();

  const result = runRecoveryCheck({
    repoRoot: repo,
    config: DEFAULT_CONFIG,
    now: new Date('2026-06-29T00:00:00.000Z'),
    mode: RECOVERY_MODES.COOLDOWN_RESUME,
    state: stateWithSession(repo, null),
  });

  assert.equal(result.ok, false);
  assert.match(result.failures.join('\n'), /missing session id for cooldown recovery/);
});

test('cooldown resume fails when git has unresolved conflicts', () => {
  const repo = makeRepo();
  writeFileSync(join(repo, 'conflict.txt'), 'base\n');
  execFileSync('git', ['add', 'conflict.txt'], { cwd: repo, stdio: 'ignore' });
  execFileSync(
    'git',
    ['-c', 'user.email=test@example.com', '-c', 'user.name=Test', 'commit', '-m', 'base'],
    { cwd: repo, stdio: 'ignore' },
  );
  execFileSync('git', ['checkout', '-b', 'feature'], { cwd: repo, stdio: 'ignore' });
  writeFileSync(join(repo, 'conflict.txt'), 'feature\n');
  execFileSync('git', ['add', 'conflict.txt'], { cwd: repo, stdio: 'ignore' });
  execFileSync(
    'git',
    ['-c', 'user.email=test@example.com', '-c', 'user.name=Test', 'commit', '-m', 'feature'],
    { cwd: repo, stdio: 'ignore' },
  );
  execFileSync('git', ['checkout', 'master'], { cwd: repo, stdio: 'ignore' });
  writeFileSync(join(repo, 'conflict.txt'), 'master\n');
  execFileSync('git', ['add', 'conflict.txt'], { cwd: repo, stdio: 'ignore' });
  execFileSync(
    'git',
    ['-c', 'user.email=test@example.com', '-c', 'user.name=Test', 'commit', '-m', 'master'],
    { cwd: repo, stdio: 'ignore' },
  );
  try {
    execFileSync('git', ['merge', 'feature'], { cwd: repo, stdio: 'ignore' });
  } catch {
    // Expected conflict.
  }

  const result = runRecoveryCheck({
    repoRoot: repo,
    config: DEFAULT_CONFIG,
    now: new Date('2026-06-29T00:00:00.000Z'),
    mode: RECOVERY_MODES.COOLDOWN_RESUME,
    state: stateWithSession(repo),
  });

  assert.equal(result.ok, false);
  assert.match(result.failures.join('\n'), /git status contains unresolved conflicts/);
});
