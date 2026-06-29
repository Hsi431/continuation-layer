import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  initAgent,
  statusAgent,
  writeMechanicalSnapshot,
} from '../src/core/agent-state.mjs';

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'continuity-layer-'));
  execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
  return dir;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

test('init creates durable .agent state and does not overwrite it', () => {
  const repo = makeRepo();
  const first = initAgent({ cwd: repo, taskId: 'task-a' });

  assert.equal(first.created, true);
  assert.equal(existsSync(join(repo, '.agent', 'config.json')), true);
  assert.equal(existsSync(join(repo, '.agent', 'state.json')), true);
  assert.equal(existsSync(join(repo, '.agent', 'HANDOFF.md')), true);
  assert.equal(existsSync(join(repo, '.agent', 'NEXT.md')), true);
  assert.equal(existsSync(join(repo, '.agent', 'DECISIONS.md')), true);
  assert.equal(existsSync(join(repo, '.agent', 'AUTO_SNAPSHOT.md')), true);

  const state = readJson(join(repo, '.agent', 'state.json'));
  assert.equal(state.task_id, 'task-a');
  assert.equal(state.status, 'idle');

  writeFileSync(join(repo, '.agent', 'NEXT.md'), '# Next\n\ncustom\n');
  const second = initAgent({ cwd: repo, taskId: 'task-b' });
  assert.equal(second.created, false);
  assert.equal(readFileSync(join(repo, '.agent', 'NEXT.md'), 'utf8'), '# Next\n\ncustom\n');
});

test('init refuses partial .agent state', () => {
  const repo = makeRepo();
  mkdirSync(join(repo, '.agent'));
  writeFileSync(join(repo, '.agent', 'config.json'), '{}\n');

  assert.throws(
    () => initAgent({ cwd: repo, taskId: 'task-partial' }),
    /partial .*\.agent/,
  );
});

test('init refuses existing config/state when required handoff files are missing', () => {
  const repo = makeRepo();
  initAgent({ cwd: repo, taskId: 'task-incomplete-existing' });
  unlinkSync(join(repo, '.agent', 'HANDOFF.md'));

  assert.throws(
    () => initAgent({ cwd: repo, taskId: 'task-new' }),
    /Incomplete \.agent state/,
  );
});

test('status rejects config and state drift', () => {
  const repo = makeRepo();
  initAgent({ cwd: repo, taskId: 'task-drift' });
  const configPath = join(repo, '.agent', 'config.json');
  const config = readJson(configPath);

  for (const [key, value] of [
    ['provider', 'claude-code'],
    ['overnight_mode', true],
    ['auto_continue_after_handoff', true],
  ]) {
    writeJson(configPath, { ...config, [key]: value });
    assert.throws(
      () => statusAgent({ cwd: repo }),
      new RegExp(`Config/state mismatch: ${key}`),
    );
  }
});

test('snapshot rejects config and state drift', () => {
  const repo = makeRepo();
  initAgent({ cwd: repo, taskId: 'task-snapshot-drift' });
  const configPath = join(repo, '.agent', 'config.json');
  const config = readJson(configPath);

  for (const [key, value] of [
    ['provider', 'claude-code'],
    ['overnight_mode', true],
    ['auto_continue_after_handoff', true],
  ]) {
    writeJson(configPath, { ...config, [key]: value });
    assert.throws(
      () => writeMechanicalSnapshot({ cwd: repo, reason: 'drift snapshot' }),
      new RegExp(`Config/state mismatch: ${key}`),
    );
  }
});

test('init refuses non-git directories', () => {
  const dir = mkdtempSync(join(tmpdir(), 'continuity-layer-no-git-'));

  assert.throws(
    () => initAgent({ cwd: dir, taskId: 'task-no-git' }),
    /git repository/,
  );
});

test('status reads next action and core state', () => {
  const repo = makeRepo();
  initAgent({ cwd: repo, taskId: 'task-status' });

  const status = statusAgent({ cwd: repo });

  assert.equal(status.taskId, 'task-status');
  assert.equal(status.provider, 'codex');
  assert.equal(status.status, 'idle');
  assert.equal(status.currentHandoff, '.agent/HANDOFF.md');
  assert.equal(status.overnightMode, false);
  assert.equal(status.nextAction, 'Define the next action for this task.');
});

test('mechanical snapshot records git state and updates checkpoint event', () => {
  const repo = makeRepo();
  initAgent({ cwd: repo, taskId: 'task-snapshot' });
  writeFileSync(join(repo, 'work.txt'), 'hello\n');

  const result = writeMechanicalSnapshot({ cwd: repo, reason: 'test snapshot' });
  const snapshot = readFileSync(result.snapshotPath, 'utf8');
  const state = readJson(join(repo, '.agent', 'state.json'));
  const sessions = readFileSync(join(repo, '.agent', 'sessions.jsonl'), 'utf8').trim().split('\n');

  assert.match(snapshot, /work\.txt/);
  assert.equal(state.last_event, 'checkpoint_written');
  assert.equal(sessions.length, 2);
  assert.equal(JSON.parse(sessions[1]).event, 'checkpoint_written');
});
