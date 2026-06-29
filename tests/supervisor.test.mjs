import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { initAgent } from '../src/core/agent-state.mjs';
import { codexAdapter } from '../src/providers/codex.mjs';
import { runCommand } from '../src/supervisor/process-runner.mjs';
import {
  continueManagedSession,
  resumeManagedSession,
  startManagedSession,
} from '../src/supervisor/supervisor.mjs';

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'continuity-supervisor-'));
  execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
  initAgent({ cwd: dir, taskId: 'task-supervisor' });
  return dir;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

test('process runner captures stdout, stderr, exit code, and logs', async () => {
  const repo = makeRepo();
  const logPath = join(repo, '.agent', 'logs', 'runner.log');

  const result = await runCommand({
    command: '/bin/sh',
    args: ['-c', 'echo out; echo err >&2; exit 3'],
    cwd: repo,
  }, { logPath });

  assert.equal(result.exitCode, 3);
  assert.equal(result.stdout.trim(), 'out');
  assert.equal(result.stderr.trim(), 'err');
  assert.equal(existsSync(logPath), true);
  assert.match(readFileSync(logPath, 'utf8'), /out/);
  assert.match(readFileSync(logPath, 'utf8'), /err/);
});

test('supervisor transitions simulated cooldown into cooling_down state', async () => {
  const repo = makeRepo();
  const now = new Date('2026-06-29T00:00:00.000Z');
  const runner = async () => ({
    exitCode: 1,
    signal: null,
    stdout: 'session_id: sess-1\n429 rate limit reached; try again in 2 minutes\n',
    stderr: '',
    logPath: join(repo, '.agent', 'logs', 'fake.log'),
  });

  const result = await startManagedSession({
    cwd: repo,
    prompt: 'work',
    adapter: codexAdapter,
    runner,
    now,
  });
  const state = readJson(join(repo, '.agent', 'state.json'));

  assert.equal(result.status, 'cooling_down');
  assert.equal(state.status, 'cooling_down');
  assert.equal(state.mode, 'cooldown_resume');
  assert.equal(state.current_session_id, 'sess-1');
  assert.equal(state.next_resume_at, '2026-06-29T00:07:00.000Z');
  assert.equal(state.last_event, 'cooldown_detected');
  assert.match(readFileSync(join(repo, '.agent', 'AUTO_SNAPSHOT.md'), 'utf8'), /cooldown_detected/);
});

test('supervisor start uses non-interactive codex exec command', async () => {
  const repo = makeRepo();
  let commandSpec = null;

  await startManagedSession({
    cwd: repo,
    adapter: codexAdapter,
    prompt: 'work',
    runner: async (spec) => {
      commandSpec = spec;
      return { exitCode: 0, signal: null, stdout: '', stderr: '', logPath: null };
    },
  });

  assert.deepEqual(commandSpec.args, ['exec', '-C', repo, 'work']);
});

test('supervisor records failed state and snapshot when runner throws', async () => {
  const repo = makeRepo();

  const result = await startManagedSession({
    cwd: repo,
    adapter: codexAdapter,
    runner: async () => {
      throw new Error('spawn failed');
    },
  });
  const state = readJson(join(repo, '.agent', 'state.json'));
  const snapshot = readFileSync(join(repo, '.agent', 'AUTO_SNAPSHOT.md'), 'utf8');

  assert.equal(result.status, 'failed');
  assert.equal(state.status, 'failed');
  assert.equal(state.last_event, 'task_failed');
  assert.match(snapshot, /task_failed/);
  assert.match(snapshot, /spawn failed/);
});

test('supervisor uses fallback cooldown when reset time is missing', async () => {
  const repo = makeRepo();
  const now = new Date('2026-06-29T00:00:00.000Z');
  const runner = async () => ({
    exitCode: 1,
    signal: null,
    stdout: 'usage limit reached\n',
    stderr: '',
    logPath: null,
  });

  await startManagedSession({ cwd: repo, adapter: codexAdapter, runner, now });

  assert.equal(
    readJson(join(repo, '.agent', 'state.json')).next_resume_at,
    '2026-06-29T05:05:00.000Z',
  );
});

test('resume waits until cooldown deadline unless allowEarly is set', async () => {
  const repo = makeRepo();
  const now = new Date('2026-06-29T00:00:00.000Z');
  await startManagedSession({
    cwd: repo,
    adapter: codexAdapter,
    now,
    runner: async () => ({
      exitCode: 1,
      signal: null,
      stdout: '429 rate limit reached; try again in 2 minutes\n',
      stderr: '',
      logPath: null,
    }),
  });

  let called = false;
  const result = await resumeManagedSession({
    cwd: repo,
    adapter: codexAdapter,
    now: new Date('2026-06-29T00:01:00.000Z'),
    runner: async () => {
      called = true;
      return { exitCode: 0, signal: null, stdout: '', stderr: '', logPath: null };
    },
  });

  assert.equal(result.waiting, true);
  assert.equal(called, false);
});

test('resume invokes same-session command after cooldown and clears cooldown state', async () => {
  const repo = makeRepo();
  const now = new Date('2026-06-29T00:00:00.000Z');
  await startManagedSession({
    cwd: repo,
    adapter: codexAdapter,
    now,
    runner: async () => ({
      exitCode: 1,
      signal: null,
      stdout: 'session_id: sess-2\n429 rate limit reached; try again in 1 minute\n',
      stderr: '',
      logPath: null,
    }),
  });

  let commandSpec = null;
  const result = await resumeManagedSession({
    cwd: repo,
    adapter: codexAdapter,
    now: new Date('2026-06-29T00:07:00.000Z'),
    runner: async (spec) => {
      commandSpec = spec;
      return {
        exitCode: 0,
        signal: null,
        stdout: 'session_id: sess-2\n',
        stderr: '',
        logPath: null,
      };
    },
  });
  const state = readJson(join(repo, '.agent', 'state.json'));

  assert.deepEqual(commandSpec.args.slice(0, 5), ['exec', '-C', repo, 'resume', 'sess-2']);
  assert.equal(result.resumed, true);
  assert.equal(state.status, 'checkpointed');
  assert.equal(state.mode, 'normal');
  assert.equal(state.next_resume_at, null);
  assert.equal(state.cooldown_reason, null);
  assert.equal(state.last_event, 'cooldown_resumed');
});

test('continuation writes handoff and waits for confirmation by default', async () => {
  const repo = makeRepo();
  let called = false;

  const result = await continueManagedSession({
    cwd: repo,
    adapter: codexAdapter,
    now: new Date('2026-06-29T00:00:00.000Z'),
    runner: async () => {
      called = true;
      return { exitCode: 0, signal: null, stdout: '', stderr: '', logPath: null };
    },
  });
  const state = readJson(join(repo, '.agent', 'state.json'));
  const handoff = readFileSync(join(repo, '.agent', 'HANDOFF.md'), 'utf8');

  assert.equal(called, false);
  assert.equal(result.confirmationRequired, true);
  assert.equal(result.continuationStarted, false);
  assert.equal(state.status, 'waiting_for_user');
  assert.equal(state.mode, 'context_handoff');
  assert.equal(state.last_event, 'handoff_written');
  assert.match(handoff, /Context handoff written before continuation/);
  assert.match(handoff, /git status --short/);
  assert.match(handoff, /git diff --no-color/);
});

test('confirmed continuation runs recovery and starts Codex fork child session', async () => {
  const repo = makeRepo();
  await startManagedSession({
    cwd: repo,
    adapter: codexAdapter,
    runner: async () => ({
      exitCode: 0,
      signal: null,
      stdout: 'session_id: sess-parent\n',
      stderr: '',
      logPath: null,
    }),
  });

  let commandSpec = null;
  const result = await continueManagedSession({
    cwd: repo,
    adapter: codexAdapter,
    confirmed: true,
    now: new Date('2026-06-29T00:00:00.000Z'),
    runner: async (spec) => {
      commandSpec = spec;
      return {
        exitCode: 0,
        signal: null,
        stdout: 'session_id: sess-child\n',
        stderr: '',
        logPath: null,
      };
    },
  });
  const state = readJson(join(repo, '.agent', 'state.json'));

  assert.deepEqual(commandSpec.args.slice(0, 4), ['fork', '-C', repo, 'sess-parent']);
  assert.match(commandSpec.args.at(-1), /Read \.agent\/HANDOFF\.md/);
  assert.match(commandSpec.args.at(-1), /git status --short/);
  assert.match(commandSpec.args.at(-1), /git diff --no-color/);
  assert.equal(result.continuationStarted, true);
  assert.equal(result.recovery.ok, true);
  assert.equal(state.current_session_id, 'sess-child');
  assert.equal(state.parent_session_id, 'sess-parent');
});

test('recovery check failure aborts continuation before provider command', async () => {
  const repo = makeRepo();
  let called = false;

  const result = await continueManagedSession({
    cwd: repo,
    adapter: codexAdapter,
    confirmed: true,
    now: new Date('2026-06-29T00:00:00.000Z'),
    recoveryCheck: () => ({
      ok: false,
      failures: ['git status failed'],
      handoff: '',
      gitStatus: '',
      gitDiff: '',
    }),
    runner: async () => {
      called = true;
      return { exitCode: 0, signal: null, stdout: '', stderr: '', logPath: null };
    },
  });
  const state = readJson(join(repo, '.agent', 'state.json'));

  assert.equal(called, false);
  assert.equal(result.status, 'failed');
  assert.equal(result.continuationStarted, false);
  assert.deepEqual(result.recovery.failures, ['git status failed']);
  assert.equal(state.status, 'failed');
  assert.equal(state.last_event, 'continuation_aborted');
  assert.match(state.cooldown_reason, /recovery check failed/);
});
