import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  completeTask,
  initAgent,
  setOvernightMode,
  startNewTask,
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

  assert.throws(() => initAgent({ cwd: repo, taskId: 'task-partial' }), /partial .*\.agent/);
});

test('init refuses existing config/state when required handoff files are missing', () => {
  const repo = makeRepo();
  initAgent({ cwd: repo, taskId: 'task-incomplete-existing' });
  unlinkSync(join(repo, '.agent', 'HANDOFF.md'));

  assert.throws(() => initAgent({ cwd: repo, taskId: 'task-new' }), /Incomplete \.agent state/);
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
    assert.throws(() => statusAgent({ cwd: repo }), new RegExp(`Config/state mismatch: ${key}`));
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

  assert.throws(() => initAgent({ cwd: dir, taskId: 'task-no-git' }), /git repository/);
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

test('overnight mode is off by default and can be toggled with config/state sync', () => {
  const repo = makeRepo();
  initAgent({ cwd: repo, taskId: 'task-overnight' });

  assert.equal(statusAgent({ cwd: repo }).overnightMode, false);
  assert.equal(statusAgent({ cwd: repo }).autoContinueAfterHandoff, false);

  const enabled = setOvernightMode({
    cwd: repo,
    enabled: true,
    timestamp: '2026-06-29T00:00:00.000Z',
  });
  const enabledState = readJson(join(repo, '.agent', 'state.json'));
  const enabledConfig = readJson(join(repo, '.agent', 'config.json'));
  assert.equal(enabled.config.overnight_mode, true);
  assert.equal(enabledConfig.overnight_mode, true);
  assert.equal(enabledState.overnight_mode, true);
  assert.equal(enabledState.auto_continue_after_handoff, true);
  assert.equal(enabledState.last_event, 'overnight_enabled');

  setOvernightMode({
    cwd: repo,
    enabled: false,
    timestamp: '2026-06-29T00:01:00.000Z',
  });
  const disabledState = readJson(join(repo, '.agent', 'state.json'));
  const disabledConfig = readJson(join(repo, '.agent', 'config.json'));
  const sessions = readFileSync(join(repo, '.agent', 'sessions.jsonl'), 'utf8')
    .trim()
    .split('\n');

  assert.equal(disabledConfig.overnight_mode, false);
  assert.equal(disabledConfig.auto_continue_after_handoff, false);
  assert.equal(disabledState.overnight_mode, false);
  assert.equal(disabledState.auto_continue_after_handoff, false);
  assert.equal(disabledState.last_event, 'overnight_disabled');
  assert.equal(JSON.parse(sessions.at(-2)).event, 'overnight_enabled');
  assert.equal(JSON.parse(sessions.at(-1)).event, 'overnight_disabled');
});

test('mechanical snapshot records git state and updates checkpoint event', () => {
  const repo = makeRepo();
  initAgent({ cwd: repo, taskId: 'task-snapshot' });
  writeFileSync(join(repo, 'work.txt'), 'hello\n');

  const result = writeMechanicalSnapshot({ cwd: repo, reason: 'test snapshot' });
  const snapshot = readFileSync(result.snapshotPath, 'utf8');
  const state = readJson(join(repo, '.agent', 'state.json'));
  const sessions = readFileSync(join(repo, '.agent', 'sessions.jsonl'), 'utf8')
    .trim()
    .split('\n');

  assert.match(snapshot, /work\.txt/);
  assert.equal(state.last_event, 'checkpoint_written');
  assert.equal(sessions.length, 2);
  assert.equal(JSON.parse(sessions[1]).event, 'checkpoint_written');
});

test('complete marks task complete and archives active handoff and snapshot', () => {
  const repo = makeRepo();
  initAgent({ cwd: repo, taskId: 'task-complete' });
  writeFileSync(join(repo, '.agent', 'HANDOFF.md'), '# Handoff\n\ncustom active handoff\n');
  rmSync(join(repo, '.agent', 'handoffs'), { recursive: true, force: true });
  rmSync(join(repo, '.agent', 'snapshots'), { recursive: true, force: true });

  const result = completeTask({
    cwd: repo,
    reason: 'done',
    timestamp: '2026-06-30T00:00:00.000Z',
  });
  const state = readJson(join(repo, '.agent', 'state.json'));
  const config = readJson(join(repo, '.agent', 'config.json'));
  const sessions = readFileSync(join(repo, '.agent', 'sessions.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map(JSON.parse);

  assert.equal(result.state.status, 'completed');
  assert.equal(state.status, 'completed');
  assert.equal(state.last_event, 'task_completed');
  assert.equal(config.overnight_mode, false);
  assert.equal(config.auto_continue_after_handoff, false);
  assert.equal(existsSync(join(repo, '.agent', 'handoffs')), true);
  assert.equal(existsSync(join(repo, '.agent', 'snapshots')), true);
  assert.match(readFileSync(result.archive.handoff, 'utf8'), /custom active handoff/);
  assert.match(readFileSync(join(repo, '.agent', 'HANDOFF.md'), 'utf8'), /Task completed/);
  assert.equal(sessions.at(-1).event, 'task_completed');
});

test('new task archives old handoff and resets active state without stale pollution', () => {
  const repo = makeRepo();
  initAgent({ cwd: repo, taskId: 'task-old' });
  writeFileSync(join(repo, '.agent', 'HANDOFF.md'), '# Handoff\n\nold active handoff\n');
  setOvernightMode({
    cwd: repo,
    enabled: true,
    timestamp: '2026-06-30T00:00:00.000Z',
  });

  const result = startNewTask({
    cwd: repo,
    taskId: 'task-new',
    timestamp: '2026-06-30T00:01:00.000Z',
  });
  const state = readJson(join(repo, '.agent', 'state.json'));
  const config = readJson(join(repo, '.agent', 'config.json'));
  const activeHandoff = readFileSync(join(repo, '.agent', 'HANDOFF.md'), 'utf8');
  const activeNext = readFileSync(join(repo, '.agent', 'NEXT.md'), 'utf8');
  const sessions = readFileSync(join(repo, '.agent', 'sessions.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map(JSON.parse);

  assert.equal(result.state.task_id, 'task-new');
  assert.equal(state.task_id, 'task-new');
  assert.equal(state.status, 'idle');
  assert.equal(state.current_session_id, null);
  assert.equal(config.overnight_mode, false);
  assert.equal(config.auto_continue_after_handoff, false);
  assert.match(readFileSync(result.archive.handoff, 'utf8'), /old active handoff/);
  assert.match(activeHandoff, /task-new/);
  assert.doesNotMatch(activeHandoff, /old active handoff/);
  assert.match(activeNext, /Define the first action for this new task/);
  assert.equal(sessions.at(-1).event, 'task_created');
});
