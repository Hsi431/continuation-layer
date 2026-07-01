import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { initAgent, setOvernightMode } from '../src/core/agent-state.mjs';
import { codexAdapter } from '../src/providers/codex.mjs';
import { runCommand } from '../src/supervisor/process-runner.mjs';
import {
  calculateNextResumePlan,
  continueManagedSession,
  resumeManagedSession,
  startManagedSession,
  watchManagedSession,
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

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function okRecovery() {
  return {
    ok: true,
    failures: [],
    handoff: '',
    gitStatus: '',
    gitDiff: '',
  };
}

test('process runner captures stdout, stderr, exit code, and logs', async () => {
  const repo = makeRepo();
  const logPath = join(repo, '.agent', 'logs', 'runner.log');

  const result = await runCommand(
    {
      command: '/bin/sh',
      args: ['-c', 'echo out; echo err >&2; exit 3'],
      cwd: repo,
    },
    { logPath },
  );

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
  assert.equal(state.cooldown_detected_at, '2026-06-29T00:00:00.000Z');
  assert.equal(state.reset_time_provenance, 'provider_relative');
  assert.equal(state.last_event, 'cooldown_detected');
  const snapshot = readFileSync(join(repo, '.agent', 'AUTO_SNAPSHOT.md'), 'utf8');
  assert.match(snapshot, /cooldown_detected/);
  assert.match(
    snapshot,
    new RegExp(
      `log path: ${join(repo, '.agent', 'logs', 'fake.log').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
    ),
  );
  assert.match(snapshot, /reset time provenance: provider_relative/);
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
  assert.equal(
    readJson(join(repo, '.agent', 'state.json')).reset_time_provenance,
    'cooldown_detected_fallback',
  );
});

test('reset plan uses provider epoch before local anchors', () => {
  const now = new Date('2026-06-29T00:00:00.000Z');

  const plan = calculateNextResumePlan({
    adapter: codexAdapter,
    text: '{"resets_at": 1782694800}',
    now,
    defaultSeconds: 18000,
    bufferSeconds: 300,
    usageWindowStartedAt: '2026-06-28T20:00:00.000Z',
    cooldownDetectedAt: now.toISOString(),
  });

  assert.equal(plan.nextResumeAt.toISOString(), '2026-06-29T01:05:00.000Z');
  assert.equal(plan.resetTimeProvenance, 'provider_epoch');
});

test('reset plan uses usage window anchor when provider gives no reset', () => {
  const now = new Date('2026-06-29T01:00:00.000Z');

  const plan = calculateNextResumePlan({
    adapter: codexAdapter,
    text: 'usage limit reached',
    now,
    defaultSeconds: 18000,
    bufferSeconds: 300,
    usageWindowStartedAt: '2026-06-29T00:00:00.000Z',
    cooldownDetectedAt: now.toISOString(),
  });

  assert.equal(plan.nextResumeAt.toISOString(), '2026-06-29T05:05:00.000Z');
  assert.equal(plan.resetTimeProvenance, 'usage_window_anchor');
});

test('watch waits through cooldown and resumes the same session automatically', async () => {
  const repo = makeRepo();
  let currentMs = Date.parse('2026-06-29T00:00:00.000Z');
  const sleeps = [];
  const commands = [];
  const runner = async (spec) => {
    commands.push(spec);
    if (commands.length === 1) {
      return {
        exitCode: 1,
        signal: null,
        stdout: 'session_id: sess-watch\n429 rate limit reached; try again in 2 minutes\n',
        stderr: '',
        logPath: join(repo, '.agent', 'logs', 'cooldown.log'),
      };
    }

    return {
      exitCode: 0,
      signal: null,
      stdout: 'session_id: sess-watch\n',
      stderr: '',
      logPath: join(repo, '.agent', 'logs', 'resume.log'),
    };
  };

  const result = await watchManagedSession({
    cwd: repo,
    adapter: codexAdapter,
    runner,
    clock: () => new Date(currentMs),
    sleep: async (ms) => {
      sleeps.push(ms);
      currentMs += ms;
    },
    recoveryCheck: okRecovery,
  });
  const state = readJson(join(repo, '.agent', 'state.json'));
  const sessions = readFileSync(join(repo, '.agent', 'sessions.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map(JSON.parse);

  assert.equal(result.status, 'checkpointed');
  assert.equal(commands.length, 2);
  assert.deepEqual(commands[1].args.slice(0, 5), ['exec', '-C', repo, 'resume', 'sess-watch']);
  assert.deepEqual(sleeps, [7 * 60 * 1000]);
  assert.equal(state.status, 'checkpointed');
  assert.equal(state.watch_resume_count, 1);
  assert.equal(state.last_watch_event, 'watch_stopped');
  assert.equal(state.usage_window_started_at, '2026-06-29T00:00:00.000Z');
  assert.equal(
    sessions.some((event) => event.event === 'watch_sleeping'),
    true,
  );
  assert.equal(
    sessions.some((event) => event.event === 'watch_resuming'),
    true,
  );
});

test('watch immediately resumes when next_resume_at is already past', async () => {
  const repo = makeRepo();
  const currentMs = Date.parse('2026-06-29T00:10:00.000Z');
  let calls = 0;
  let slept = false;

  await watchManagedSession({
    cwd: repo,
    adapter: codexAdapter,
    clock: () => new Date(currentMs),
    sleep: async () => {
      slept = true;
    },
    recoveryCheck: okRecovery,
    runner: async () => {
      calls += 1;
      return calls === 1
        ? {
            exitCode: 1,
            signal: null,
            stdout: 'session_id: sess-past\ntry again at 2026-06-29T00:00:00Z\n',
            stderr: '',
            logPath: null,
          }
        : {
            exitCode: 0,
            signal: null,
            stdout: 'session_id: sess-past\n',
            stderr: '',
            logPath: null,
          };
    },
  });

  assert.equal(calls, 2);
  assert.equal(slept, false);
});

test('watch repeats when automatic resume hits another cooldown', async () => {
  const repo = makeRepo();
  let currentMs = Date.parse('2026-06-29T00:00:00.000Z');
  let calls = 0;

  const result = await watchManagedSession({
    cwd: repo,
    adapter: codexAdapter,
    clock: () => new Date(currentMs),
    sleep: async (ms) => {
      currentMs += ms;
    },
    recoveryCheck: okRecovery,
    runner: async () => {
      calls += 1;
      if (calls < 3) {
        return {
          exitCode: 1,
          signal: null,
          stdout: 'session_id: sess-repeat\n429 rate limit reached; try again in 1 minute\n',
          stderr: '',
          logPath: null,
        };
      }

      return {
        exitCode: 0,
        signal: null,
        stdout: 'session_id: sess-repeat\n',
        stderr: '',
        logPath: null,
      };
    },
  });
  const state = readJson(join(repo, '.agent', 'state.json'));

  assert.equal(result.status, 'checkpointed');
  assert.equal(calls, 3);
  assert.equal(state.watch_resume_count, 2);
});

test('watch stops when max cooldown resumes is reached', async () => {
  const repo = makeRepo();
  const configPath = join(repo, '.agent', 'config.json');
  writeJson(configPath, { ...readJson(configPath), max_cooldown_resumes: 1 });
  let currentMs = Date.parse('2026-06-29T00:00:00.000Z');
  let calls = 0;

  const result = await watchManagedSession({
    cwd: repo,
    adapter: codexAdapter,
    clock: () => new Date(currentMs),
    sleep: async (ms) => {
      currentMs += ms;
    },
    recoveryCheck: okRecovery,
    runner: async () => {
      calls += 1;
      return {
        exitCode: 1,
        signal: null,
        stdout: 'session_id: sess-limit\n429 rate limit reached; try again in 1 minute\n',
        stderr: '',
        logPath: null,
      };
    },
  });
  const state = readJson(join(repo, '.agent', 'state.json'));

  assert.equal(result.status, 'watch_limit_reached');
  assert.equal(calls, 2);
  assert.equal(state.status, 'cooling_down');
  assert.equal(state.last_watch_event, 'watch_limit_reached');
});

test('watch stops when max watch hours is exceeded', async () => {
  const repo = makeRepo();
  const configPath = join(repo, '.agent', 'config.json');
  writeJson(configPath, { ...readJson(configPath), max_watch_hours: 1 });
  let currentMs = Date.parse('2026-06-29T00:00:00.000Z');
  let calls = 0;

  const result = await watchManagedSession({
    cwd: repo,
    adapter: codexAdapter,
    clock: () => new Date(currentMs),
    sleep: async (ms) => {
      currentMs += ms;
    },
    recoveryCheck: okRecovery,
    runner: async () => {
      calls += 1;
      return {
        exitCode: 1,
        signal: null,
        stdout: 'session_id: sess-hours\n429 rate limit reached; try again in 2 hours\n',
        stderr: '',
        logPath: null,
      };
    },
  });

  assert.equal(result.status, 'watch_limit_reached');
  assert.equal(calls, 1);
});

test('watch aborts when cooldown has no session id for same-session resume', async () => {
  const repo = makeRepo();
  let calls = 0;

  const result = await watchManagedSession({
    cwd: repo,
    adapter: codexAdapter,
    clock: () => new Date('2026-06-29T00:00:00.000Z'),
    recoveryCheck: okRecovery,
    runner: async () => {
      calls += 1;
      return {
        exitCode: 1,
        signal: null,
        stdout: '429 rate limit reached; try again in 1 minute\n',
        stderr: '',
        logPath: null,
      };
    },
  });
  const state = readJson(join(repo, '.agent', 'state.json'));

  assert.equal(result.status, 'watch_aborted');
  assert.equal(calls, 1);
  assert.equal(state.status, 'cooling_down');
  assert.equal(state.last_watch_event, 'watch_aborted');
});

test('watch abort preserves cooldown state without marking failed', async () => {
  const repo = makeRepo();
  let currentMs = Date.parse('2026-06-29T00:00:00.000Z');
  const controller = new AbortController();

  const result = await watchManagedSession({
    cwd: repo,
    adapter: codexAdapter,
    signal: controller.signal,
    clock: () => new Date(currentMs),
    sleep: async () => {
      controller.abort();
    },
    recoveryCheck: okRecovery,
    runner: async () => ({
      exitCode: 1,
      signal: null,
      stdout: 'session_id: sess-abort\n429 rate limit reached; try again in 1 hour\n',
      stderr: '',
      logPath: null,
    }),
  });
  const state = readJson(join(repo, '.agent', 'state.json'));

  assert.equal(result.status, 'watch_aborted');
  assert.equal(state.status, 'cooling_down');
  assert.equal(state.last_watch_event, 'watch_aborted');
  assert.notEqual(state.status, 'failed');
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

test('overnight mode auto-starts continuation after handoff and traces session chain', async () => {
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
  setOvernightMode({
    cwd: repo,
    enabled: true,
    timestamp: '2026-06-29T00:00:00.000Z',
  });

  let commandSpec = null;
  const result = await continueManagedSession({
    cwd: repo,
    adapter: codexAdapter,
    now: new Date('2026-06-29T00:01:00.000Z'),
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
  const sessions = readFileSync(join(repo, '.agent', 'sessions.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map(JSON.parse);

  assert.deepEqual(commandSpec.args.slice(0, 4), ['fork', '-C', repo, 'sess-parent']);
  assert.equal(result.confirmationRequired, false);
  assert.equal(result.continuationStarted, true);
  assert.equal(result.autoContinued, true);
  assert.equal(state.current_session_id, 'sess-child');
  assert.equal(state.parent_session_id, 'sess-parent');
  assert.equal(sessions.at(-2).event, 'continuation_started');
  assert.equal(sessions.at(-2).session_id, 'sess-parent');
  assert.equal(sessions.at(-1).event, 'checkpoint_written');
  assert.equal(sessions.at(-1).session_id, 'sess-child');
  assert.equal(sessions.at(-1).parent_session_id, 'sess-parent');
});

test('overnight mode without auto-continue still waits for confirmation', async () => {
  const repo = makeRepo();
  setOvernightMode({
    cwd: repo,
    enabled: true,
    autoContinueAfterHandoff: false,
    timestamp: '2026-06-29T00:00:00.000Z',
  });
  let called = false;

  const result = await continueManagedSession({
    cwd: repo,
    adapter: codexAdapter,
    runner: async () => {
      called = true;
      return { exitCode: 0, signal: null, stdout: '', stderr: '', logPath: null };
    },
  });

  assert.equal(called, false);
  assert.equal(result.confirmationRequired, true);
  assert.equal(result.continuationStarted, false);
  assert.equal(result.autoContinued, false);
});

test('overnight auto-continuation aborts when parent session is unknown', async () => {
  const repo = makeRepo();
  setOvernightMode({
    cwd: repo,
    enabled: true,
    timestamp: '2026-06-29T00:00:00.000Z',
  });
  let called = false;

  const result = await continueManagedSession({
    cwd: repo,
    adapter: codexAdapter,
    now: new Date('2026-06-29T00:01:00.000Z'),
    runner: async () => {
      called = true;
      return { exitCode: 0, signal: null, stdout: '', stderr: '', logPath: null };
    },
  });
  const state = readJson(join(repo, '.agent', 'state.json'));

  assert.equal(called, false);
  assert.equal(result.status, 'failed');
  assert.equal(result.autoContinued, true);
  assert.equal(result.continuationStarted, false);
  assert.match(result.recovery.failures.join('\n'), /missing parent session id/);
  assert.equal(state.last_event, 'continuation_aborted');
  assert.equal(state.parent_session_id, null);
  assert.match(state.cooldown_reason, /missing parent session id/);
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

test('overnight recovery failure aborts automation before provider command', async () => {
  const repo = makeRepo();
  setOvernightMode({
    cwd: repo,
    enabled: true,
    timestamp: '2026-06-29T00:00:00.000Z',
  });
  let called = false;

  const result = await continueManagedSession({
    cwd: repo,
    adapter: codexAdapter,
    now: new Date('2026-06-29T00:01:00.000Z'),
    recoveryCheck: () => ({
      ok: false,
      failures: ['.agent/HANDOFF.md is incomplete'],
      handoff: '# Handoff\n',
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
  assert.equal(result.autoContinued, true);
  assert.equal(result.continuationStarted, false);
  assert.equal(result.status, 'failed');
  assert.equal(state.last_event, 'continuation_aborted');
  assert.match(state.cooldown_reason, /HANDOFF\.md is incomplete/);
});
