import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_CONFIG } from '../src/core/constants.mjs';
import { initAgent } from '../src/core/agent-state.mjs';
import { runRecoveryCheck } from '../src/core/recovery.mjs';

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'continuity-recovery-'));
  execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
  initAgent({ cwd: dir, taskId: 'task-recovery' });
  return dir;
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
