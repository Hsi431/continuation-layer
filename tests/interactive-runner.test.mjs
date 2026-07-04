import { execFileSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { initAgent } from '../src/core/agent-state.mjs';
import { runInteractiveShell } from '../src/interactive/shell-session.mjs';
import { runPtyCommand, TTY_REQUIRED_MESSAGE } from '../src/interactive/pty-runner.mjs';
import { codexAdapter } from '../src/providers/codex.mjs';

function makeRepo() {
  const dir = makeGitRepo();
  initAgent({ cwd: dir, taskId: 'task-interactive' });
  return dir;
}

function makeGitRepo(prefix = 'continuity-interactive-') {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
  return dir;
}

function makeDir(prefix = 'continuity-global-shell-') {
  return mkdtempSync(join(tmpdir(), prefix));
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function parseDebugLines(text) {
  return text
    .split('\n')
    .filter((line) => line.trim().startsWith('{'))
    .map((line) => JSON.parse(line));
}

function makeNoResetAdapter() {
  return {
    ...codexAdapter,
    parseResetTime: () => null,
    parseResetTimeDetails: () => null,
  };
}

function setCoolingDownState(repo, changes = {}) {
  const statePath = join(repo, '.agent', 'state.json');
  const state = readJson(statePath);
  writeJson(statePath, {
    ...state,
    status: 'cooling_down',
    mode: 'cooldown_resume',
    current_session_id: 'sess-existing',
    next_resume_at: '2026-06-29T00:05:00.000Z',
    cooldown_reason: 'usage limit reached',
    cooldown_detected_at: '2026-06-29T00:00:00.000Z',
    reset_time_provenance: 'provider_relative',
    last_event: 'interactive_cooldown_detected',
    interactive_shell_status: 'waiting_for_resume',
    last_tty_event: 'interactive_shell_aborted',
    ...changes,
  });
}

class FakeInput extends EventEmitter {
  constructor() {
    super();
    this.isTTY = true;
    this.isRaw = false;
    this.rawModes = [];
    this.resumed = false;
  }

  setRawMode(value) {
    this.isRaw = value;
    this.rawModes.push(value);
  }

  resume() {
    this.resumed = true;
  }
}

class FakeOutput {
  constructor() {
    this.isTTY = true;
    this.columns = 100;
    this.rows = 40;
    this.text = '';
  }

  write(data) {
    this.text += data;
    return true;
  }
}

class FakePtyChild {
  constructor(command, args, options) {
    this.command = command;
    this.args = args;
    this.options = options;
    this.writes = [];
    this.resizes = [];
    this.kills = [];
    this.dataHandlers = new Set();
    this.exitHandlers = new Set();
  }

  write(data) {
    this.writes.push(data);
  }

  resize(columns, rows) {
    this.resizes.push({ columns, rows });
  }

  kill(signal) {
    this.kills.push(signal);
  }

  onData(handler) {
    this.dataHandlers.add(handler);
    return {
      dispose: () => this.dataHandlers.delete(handler),
    };
  }

  onExit(handler) {
    this.exitHandlers.add(handler);
    return {
      dispose: () => this.exitHandlers.delete(handler),
    };
  }

  emitData(data) {
    for (const handler of this.dataHandlers) {
      handler(data);
    }
  }

  exit(result) {
    for (const handler of this.exitHandlers) {
      handler(result);
    }
  }
}

function makePtyFactory() {
  let child = null;
  return {
    factory: {
      spawn(command, args, options) {
        child = new FakePtyChild(command, args, options);
        return child;
      },
    },
    get child() {
      return child;
    },
  };
}

test('pty runner rejects non-interactive terminals clearly', async () => {
  await assert.rejects(
    runPtyCommand(
      { command: 'codex', args: [], cwd: '/repo' },
      {
        stdin: { isTTY: false },
        stdout: { isTTY: true },
        ptyFactory: makePtyFactory().factory,
      },
    ),
    new RegExp(TTY_REQUIRED_MESSAGE.split('\n')[0]),
  );
});

test('pty runner passes input and output through and cleans up terminal state', async () => {
  const stdin = new FakeInput();
  const stdout = new FakeOutput();
  const resizeEmitter = new EventEmitter();
  const pty = makePtyFactory();
  const seen = [];

  const running = runPtyCommand(
    { command: 'codex', args: ['-C', '/repo'], cwd: '/repo' },
    {
      stdin,
      stdout,
      resizeEmitter,
      ptyFactory: pty.factory,
      onData: (chunk) => seen.push(chunk),
      onInput: (chunk) => chunk !== 'blocked',
    },
  );

  pty.child.emitData('screen output');
  stdin.emit('data', Buffer.from('typed'));
  stdin.emit('data', Buffer.from('blocked'));
  stdout.columns = 120;
  stdout.rows = 50;
  resizeEmitter.emit('SIGWINCH');
  pty.child.exit({ exitCode: 0, signal: null });

  const result = await running;

  assert.deepEqual(result, { exitCode: 0, signal: null });
  assert.equal(stdout.text, 'screen output');
  assert.deepEqual(seen, ['screen output']);
  assert.deepEqual(pty.child.writes, ['typed']);
  assert.deepEqual(pty.child.resizes, [{ columns: 120, rows: 50 }]);
  assert.deepEqual(stdin.rawModes, [true, false]);
  assert.equal(stdin.listenerCount('data'), 0);
  assert.equal(resizeEmitter.listenerCount('SIGWINCH'), 0);
  assert.equal(pty.child.dataHandlers.size, 0);
  assert.equal(pty.child.exitHandlers.size, 0);
});

test('interactive shell builds a Codex TUI command through the PTY runner', async () => {
  const repo = makeRepo();
  let commandSpec = null;

  const result = await runInteractiveShell({
    cwd: repo,
    prompt: 'explain repo',
    ptyRunner: async (spec) => {
      commandSpec = spec;
      return { exitCode: 0, signal: null };
    },
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.mode, 'project_shell');
  assert.deepEqual(commandSpec, {
    command: 'codex',
    args: ['-C', repo, 'explain repo'],
    cwd: repo,
  });
  assert.equal(readJson(join(repo, '.agent', 'state.json')).interactive_shell_status, 'exited');
});

test('project interactive shell sets usage_window_started_at on start', async () => {
  const repo = makeRepo();

  await runInteractiveShell({
    cwd: repo,
    clock: () => new Date('2026-06-29T00:00:00.000Z'),
    ptyRunner: async () => ({ exitCode: 0, signal: null }),
  });
  const state = readJson(join(repo, '.agent', 'state.json'));

  assert.equal(state.usage_window_started_at, '2026-06-29T00:00:00.000Z');
  assert.equal(state.interactive_shell_started_at, '2026-06-29T00:00:00.000Z');
});

test('project interactive shell refreshes usage_window_started_at for fresh sessions', async () => {
  const repo = makeRepo();
  const statePath = join(repo, '.agent', 'state.json');
  const oldState = readJson(statePath);
  writeJson(statePath, {
    ...oldState,
    status: 'checkpointed',
    usage_window_started_at: '2026-06-29T00:00:00.000Z',
    interactive_shell_started_at: '2026-06-29T00:00:00.000Z',
  });

  await runInteractiveShell({
    cwd: repo,
    clock: () => new Date('2026-06-30T10:00:00.000Z'),
    ptyRunner: async () => ({ exitCode: 0, signal: null }),
  });
  const state = readJson(statePath);

  assert.equal(state.usage_window_started_at, '2026-06-30T10:00:00.000Z');
  assert.equal(state.interactive_shell_started_at, '2026-06-30T10:00:00.000Z');
});

test('interactive shell outside git enters global mode and spawns Codex in cwd', async () => {
  const cwd = makeDir();
  const stateDir = makeDir('continuity-global-state-');
  const stderr = new FakeOutput();
  let commandSpec = null;

  const result = await runInteractiveShell({
    cwd,
    globalStateDir: stateDir,
    stderr,
    ptyRunner: async (spec) => {
      commandSpec = spec;
      return { exitCode: 0, signal: null };
    },
  });
  const state = readJson(join(stateDir, 'global-shell-state.json'));

  assert.equal(result.mode, 'global_shell');
  assert.deepEqual(commandSpec, {
    command: 'codex',
    args: ['-C', cwd],
    cwd,
  });
  assert.equal(state.mode, 'global_shell');
  assert.equal(state.cwd, cwd);
  assert.equal(state.status, 'idle');
  assert.equal(existsSync(join(cwd, '.agent')), false);
  assert.match(stderr.text, /No git repository found/);
  assert.match(stderr.text, /Starting Global Shell Mode/);
  assert.match(stderr.text, /Project handoff, git recovery, and \.agent state are disabled/);
});

test('git repo without .agent enters Global Shell Mode and does not create .agent', async () => {
  const cwd = makeGitRepo('continuity-uninitialized-repo-');
  const stateDir = makeDir('continuity-global-state-');
  const stderr = new FakeOutput();
  let commandSpec = null;

  const result = await runInteractiveShell({
    cwd,
    globalStateDir: stateDir,
    stderr,
    ptyRunner: async (spec) => {
      commandSpec = spec;
      return { exitCode: 0, signal: null };
    },
  });
  const state = readJson(join(stateDir, 'global-shell-state.json'));

  assert.equal(result.mode, 'global_shell');
  assert.deepEqual(commandSpec, {
    command: 'codex',
    args: ['-C', cwd],
    cwd,
  });
  assert.equal(state.cwd, cwd);
  assert.equal(existsSync(join(cwd, '.agent')), false);
  assert.match(stderr.text, /This git repository is not initialized for project continuity/);
  assert.match(stderr.text, /Starting Global Shell Mode/);
  assert.match(stderr.text, /continuity init --task-id <task-id>/);
});

test('git repo with partial .agent fails loudly and does not fallback to global', async () => {
  const cwd = makeGitRepo('continuity-partial-agent-');
  const stateDir = makeDir('continuity-global-state-');
  mkdirSync(join(cwd, '.agent'));
  let started = false;

  await assert.rejects(
    runInteractiveShell({
      cwd,
      globalStateDir: stateDir,
      ptyRunner: async () => {
        started = true;
        return { exitCode: 0, signal: null };
      },
    }),
    /Incomplete \.agent state/,
  );

  assert.equal(started, false);
  assert.equal(existsSync(join(stateDir, 'global-shell-state.json')), false);
});

test('--global forces Global Shell Mode inside an initialized git repo', async () => {
  const repo = makeRepo();
  const stateDir = makeDir('continuity-global-state-');
  const stderr = new FakeOutput();
  let commandSpec = null;

  const result = await runInteractiveShell({
    cwd: repo,
    forceGlobal: true,
    globalStateDir: stateDir,
    stderr,
    ptyRunner: async (spec) => {
      commandSpec = spec;
      return { exitCode: 0, signal: null };
    },
  });
  const globalState = readJson(join(stateDir, 'global-shell-state.json'));
  const projectState = readJson(join(repo, '.agent', 'state.json'));

  assert.equal(result.mode, 'global_shell');
  assert.deepEqual(commandSpec, {
    command: 'codex',
    args: ['-C', repo],
    cwd: repo,
  });
  assert.equal(globalState.cwd, repo);
  assert.equal(projectState.last_event, 'task_created');
  assert.match(stderr.text, /Global Shell Mode forced by --global/);
});

test('initialized git repo uses repo-local Project Shell Mode', async () => {
  const repo = makeRepo();
  const stateDir = makeDir('continuity-global-state-');
  let commandSpec = null;

  const result = await runInteractiveShell({
    cwd: repo,
    globalStateDir: stateDir,
    ptyRunner: async (spec) => {
      commandSpec = spec;
      return { exitCode: 0, signal: null };
    },
  });
  const state = readJson(join(repo, '.agent', 'state.json'));

  assert.equal(result.mode, 'project_shell');
  assert.deepEqual(commandSpec, {
    command: 'codex',
    args: ['-C', repo],
    cwd: repo,
  });
  assert.equal(state.interactive_shell_status, 'exited');
  assert.equal(existsSync(join(stateDir, 'global-shell-state.json')), false);
});

test('global shell state records usage_window_started_at on start', async () => {
  const cwd = makeDir();
  const stateDir = makeDir('continuity-global-state-');

  await runInteractiveShell({
    cwd,
    globalStateDir: stateDir,
    clock: () => new Date('2026-06-29T00:00:00.000Z'),
    ptyRunner: async () => ({ exitCode: 0, signal: null }),
  });
  const state = readJson(join(stateDir, 'global-shell-state.json'));

  assert.equal(state.mode, 'global_shell');
  assert.equal(state.usage_window_started_at, '2026-06-29T00:00:00.000Z');
  assert.equal(state.status, 'idle');
});

test('interactive shell outside git records cooldown in global state without .agent', async () => {
  const cwd = makeDir();
  const stateDir = makeDir('continuity-global-state-');
  const child = {
    kill() {},
  };

  const result = await runInteractiveShell({
    cwd,
    globalStateDir: stateDir,
    clock: () => new Date('2026-06-29T00:00:00.000Z'),
    ptyRunner: async (_spec, options) => {
      options.onData('usage limit reached; try again in 10 minutes');
      options.onInput('\u0003', { child });
      return { exitCode: null, signal: 'SIGINT' };
    },
  });
  const state = readJson(join(stateDir, 'global-shell-state.json'));
  const sessions = readFileSync(join(stateDir, 'global-shell-sessions.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map(JSON.parse);

  assert.equal(result.mode, 'global_shell');
  assert.equal(state.mode, 'global_shell');
  assert.equal(state.status, 'cooling_down');
  assert.equal(state.cwd, cwd);
  assert.equal(state.next_resume_at, '2026-06-29T00:15:00.000Z');
  assert.equal(state.cooldown_detected_at, '2026-06-29T00:00:00.000Z');
  assert.equal(state.reset_time_provenance, 'provider_relative');
  assert.equal(existsSync(join(cwd, '.agent')), false);
  assert.equal(
    sessions.some(
      (event) =>
        event.event === 'interactive_cooldown_detected' &&
        event.mode === 'global_shell' &&
        event.next_resume_at === '2026-06-29T00:15:00.000Z',
    ),
    true,
  );
});

test('global shell cooldown uses usage window anchor fallback', async () => {
  const cwd = makeDir();
  const stateDir = makeDir('continuity-global-state-');
  const adapter = makeNoResetAdapter();
  const child = {
    kill() {},
  };
  const times = [
    '2026-06-29T00:00:00.000Z',
    '2026-06-29T04:50:00.000Z',
    '2026-06-29T04:50:00.000Z',
  ];
  let timeIndex = 0;

  await runInteractiveShell({
    cwd,
    adapter,
    globalStateDir: stateDir,
    clock: () => new Date(times[Math.min(timeIndex++, times.length - 1)]),
    ptyRunner: async (_spec, options) => {
      options.onData('usage limit reached');
      options.onInput('\u0003', { child });
      return { exitCode: null, signal: 'SIGINT' };
    },
  });
  const state = readJson(join(stateDir, 'global-shell-state.json'));

  assert.equal(state.usage_window_started_at, '2026-06-29T00:00:00.000Z');
  assert.equal(state.cooldown_detected_at, '2026-06-29T04:50:00.000Z');
  assert.equal(state.next_resume_at, '2026-06-29T05:05:00.000Z');
  assert.equal(state.reset_time_provenance, 'usage_window_anchor');
  assert.equal(existsSync(join(cwd, '.agent')), false);
});

test('provider explicit reset still wins over usage window anchor', async () => {
  const cwd = makeDir();
  const stateDir = makeDir('continuity-global-state-');
  const child = {
    kill() {},
  };
  const times = [
    '2026-06-29T00:00:00.000Z',
    '2026-06-29T04:50:00.000Z',
    '2026-06-29T04:50:00.000Z',
  ];
  let timeIndex = 0;

  await runInteractiveShell({
    cwd,
    globalStateDir: stateDir,
    clock: () => new Date(times[Math.min(timeIndex++, times.length - 1)]),
    ptyRunner: async (_spec, options) => {
      options.onData('usage limit reached. reset at 2026-06-29T06:00:00Z');
      options.onInput('\u0003', { child });
      return { exitCode: null, signal: 'SIGINT' };
    },
  });
  const state = readJson(join(stateDir, 'global-shell-state.json'));

  assert.equal(state.usage_window_started_at, '2026-06-29T00:00:00.000Z');
  assert.equal(state.cooldown_detected_at, '2026-06-29T04:50:00.000Z');
  assert.equal(state.next_resume_at, '2026-06-29T06:05:00.000Z');
  assert.equal(state.reset_time_provenance, 'provider_reset_at');
});

test('global shell resumes with codex resume --last when no session id is detected', async () => {
  const cwd = makeDir();
  const stateDir = makeDir('continuity-global-state-');
  let nowMs = Date.parse('2026-06-29T00:00:00.000Z');
  const commands = [];
  const sleeps = [];

  await runInteractiveShell({
    cwd,
    globalStateDir: stateDir,
    clock: () => new Date(nowMs),
    sleep: async (milliseconds) => {
      sleeps.push(milliseconds);
      nowMs += milliseconds;
    },
    ptyRunner: async (spec, options) => {
      commands.push(spec);
      if (commands.length === 1) {
        options.onData('usage limit reached; try again in 10 minutes');
      }
      return { exitCode: 0, signal: null };
    },
  });
  const state = readJson(join(stateDir, 'global-shell-state.json'));

  assert.deepEqual(sleeps, [900000]);
  assert.deepEqual(commands[0].args, ['-C', cwd]);
  assert.deepEqual(commands[1].args, ['resume', '-C', cwd, '--last']);
  assert.equal(state.status, 'idle');
  assert.equal(state.interactive_resume_target, '--last');
  assert.equal(state.interactive_resume_target_provenance, 'codex_last');
  assert.equal(existsSync(join(cwd, '.agent')), false);
});

test('global shell resumes explicit session id when detected', async () => {
  const cwd = makeDir();
  const stateDir = makeDir('continuity-global-state-');
  let nowMs = Date.parse('2026-06-29T00:00:00.000Z');
  const commands = [];

  await runInteractiveShell({
    cwd,
    globalStateDir: stateDir,
    clock: () => new Date(nowMs),
    sleep: async (milliseconds) => {
      nowMs += milliseconds;
    },
    ptyRunner: async (spec, options) => {
      commands.push(spec);
      if (commands.length === 1) {
        options.onData('session_id: sess-global\nusage limit reached; try again in 10 minutes');
      }
      return { exitCode: 0, signal: null };
    },
  });
  const state = readJson(join(stateDir, 'global-shell-state.json'));

  assert.deepEqual(commands[1].args, ['resume', '-C', cwd, 'sess-global']);
  assert.equal(state.interactive_resume_target, 'sess-global');
  assert.equal(state.interactive_resume_target_provenance, 'explicit_session_id');
});

test('global shell marks best-effort resume --last failure clearly', async () => {
  const cwd = makeDir();
  const stateDir = makeDir('continuity-global-state-');
  const stderr = new FakeOutput();
  let nowMs = Date.parse('2026-06-29T00:00:00.000Z');
  const commands = [];

  const result = await runInteractiveShell({
    cwd,
    globalStateDir: stateDir,
    stderr,
    clock: () => new Date(nowMs),
    sleep: async (milliseconds) => {
      nowMs += milliseconds;
    },
    ptyRunner: async (spec, options) => {
      commands.push(spec);
      if (commands.length === 1) {
        options.onData('usage limit reached; try again in 10 minutes');
        return { exitCode: 0, signal: null };
      }

      return { exitCode: 2, signal: null };
    },
  });
  const state = readJson(join(stateDir, 'global-shell-state.json'));

  assert.equal(result.resumeLastFailed, true);
  assert.deepEqual(commands[1].args, ['resume', '-C', cwd, '--last']);
  assert.equal(state.status, 'failed');
  assert.match(stderr.text, /codex resume --last failed in Global Shell Mode/);
});

test('interactive shell require-repo rejects non-git directories', async () => {
  const cwd = makeDir();
  let started = false;

  await assert.rejects(
    runInteractiveShell({
      cwd,
      requireRepo: true,
      ptyRunner: async () => {
        started = true;
        return { exitCode: 0, signal: null };
      },
    }),
    /continuity must run inside a git repository/,
  );
  assert.equal(started, false);
});

test('interactive shell rejects conflicting force-global and require-repo flags', async () => {
  let started = false;

  await assert.rejects(
    runInteractiveShell({
      cwd: makeRepo(),
      forceGlobal: true,
      requireRepo: true,
      ptyRunner: async () => {
        started = true;
        return { exitCode: 0, signal: null };
      },
    }),
    /Cannot combine --global and --require-repo/,
  );
  assert.equal(started, false);
});

test('project interactive cooldown uses usage window anchor fallback', async () => {
  const repo = makeRepo();
  const adapter = makeNoResetAdapter();
  const child = {
    kill() {},
  };
  const times = [
    '2026-06-29T00:00:00.000Z',
    '2026-06-29T04:50:00.000Z',
    '2026-06-29T04:50:00.000Z',
  ];
  let timeIndex = 0;

  await runInteractiveShell({
    cwd: repo,
    adapter,
    clock: () => new Date(times[Math.min(timeIndex++, times.length - 1)]),
    ptyRunner: async (_spec, options) => {
      options.onData('usage limit reached');
      options.onInput('\u0003', { child });
      return { exitCode: null, signal: 'SIGINT' };
    },
  });
  const state = readJson(join(repo, '.agent', 'state.json'));

  assert.equal(state.usage_window_started_at, '2026-06-29T00:00:00.000Z');
  assert.equal(state.cooldown_detected_at, '2026-06-29T04:50:00.000Z');
  assert.equal(state.next_resume_at, '2026-06-29T05:05:00.000Z');
  assert.equal(state.reset_time_provenance, 'usage_window_anchor');
});

test('project interactive cooldown fallback uses refreshed usage window for fresh session', async () => {
  const repo = makeRepo();
  const statePath = join(repo, '.agent', 'state.json');
  const oldState = readJson(statePath);
  writeJson(statePath, {
    ...oldState,
    status: 'checkpointed',
    usage_window_started_at: '2026-06-29T00:00:00.000Z',
    interactive_shell_started_at: '2026-06-29T00:00:00.000Z',
  });
  const adapter = makeNoResetAdapter();
  const child = {
    kill() {},
  };
  const times = [
    '2026-06-30T10:00:00.000Z',
    '2026-06-30T14:50:00.000Z',
    '2026-06-30T14:50:00.000Z',
  ];
  let timeIndex = 0;

  await runInteractiveShell({
    cwd: repo,
    adapter,
    clock: () => new Date(times[Math.min(timeIndex++, times.length - 1)]),
    ptyRunner: async (_spec, options) => {
      options.onData('usage limit reached');
      options.onInput('\u0003', { child });
      return { exitCode: null, signal: 'SIGINT' };
    },
  });
  const state = readJson(statePath);

  assert.equal(state.usage_window_started_at, '2026-06-30T10:00:00.000Z');
  assert.equal(state.cooldown_detected_at, '2026-06-30T14:50:00.000Z');
  assert.equal(state.next_resume_at, '2026-06-30T15:05:00.000Z');
  assert.equal(state.reset_time_provenance, 'usage_window_anchor');
});

test('startup usage text does not trigger cooldown', async () => {
  const repo = makeRepo();
  const stderr = new FakeOutput();
  const commands = [];
  const sleeps = [];

  const result = await runInteractiveShell({
    cwd: repo,
    stderr,
    unattended: true,
    sleep: async (milliseconds) => sleeps.push(milliseconds),
    ptyRunner: async (spec, options) => {
      commands.push(spec);
      options.onData('Usage window resets in 5h');
      return { exitCode: 0, signal: null };
    },
  });
  const state = readJson(join(repo, '.agent', 'state.json'));

  assert.equal(result.cooldown, null);
  assert.equal(result.interactiveResumes, 0);
  assert.equal(commands.length, 1);
  assert.deepEqual(commands[0].args, ['-C', repo]);
  assert.deepEqual(sleeps, []);
  assert.equal(state.status, 'idle');
  assert.equal(state.interactive_shell_status, 'exited');
  assert.doesNotMatch(stderr.text, /Cooldown detected/);
});

test('startup status text with reset timestamp does not trigger cooldown', async () => {
  const repo = makeRepo();
  const stderr = new FakeOutput();
  const commands = [];

  const result = await runInteractiveShell({
    cwd: repo,
    stderr,
    unattended: true,
    ptyRunner: async (spec, options) => {
      commands.push(spec);
      options.onData('Next reset at 2026-07-04T00:21:45Z');
      return { exitCode: 0, signal: null };
    },
  });
  const state = readJson(join(repo, '.agent', 'state.json'));

  assert.equal(result.cooldown, null);
  assert.equal(result.interactiveResumes, 0);
  assert.equal(commands.length, 1);
  assert.equal(state.status, 'idle');
  assert.equal(state.interactive_shell_status, 'exited');
  assert.doesNotMatch(stderr.text, /Cooldown detected/);
});

test('explicit cooldown still triggers from Codex output with debug metadata', async () => {
  const repo = makeRepo();
  const stderr = new FakeOutput();
  const child = {
    kill() {},
  };

  const result = await runInteractiveShell({
    cwd: repo,
    stderr,
    debug: true,
    clock: () => new Date('2026-06-29T00:00:00.000Z'),
    ptyRunner: async (_spec, options) => {
      options.onData('Usage limit reached. Try again at 2026-07-04T00:21:45Z.');
      options.onInput('\u0003', { child });
      return { exitCode: null, signal: 'SIGINT' };
    },
  });
  const debugEvents = parseDebugLines(stderr.text);

  assert.equal(result.cooldown.status, 'cooling_down');
  assert.match(stderr.text, /Cooldown detected from Codex output/);
  assert.equal(debugEvents.length, 1);
  assert.equal(debugEvents[0].event, 'cooldown_detected');
  assert.equal(debugEvents[0].source, 'stream_detector');
  assert.equal(debugEvents[0].matched_pattern, 'provider_limit_reached');
  assert.match(debugEvents[0].matched_text_excerpt, /Usage limit reached/);
  assert.equal(debugEvents[0].parsed_reset, '2026-07-04T00:21:45.000Z');
  assert.equal(debugEvents[0].provenance, 'provider_reset_at');
  assert.equal(debugEvents[0].mode, 'project');
  assert.equal(debugEvents[0].state_status_before_detection, 'idle');
});

test('interactive shell records cooldown state, snapshot, event, and wrapper message', async () => {
  const repo = makeRepo();
  const stderr = new FakeOutput();
  let cooldownEvent = null;
  const child = {
    kill() {},
  };

  const result = await runInteractiveShell({
    cwd: repo,
    stderr,
    clock: () => new Date('2026-06-29T00:00:00.000Z'),
    onCooldown: (event) => {
      cooldownEvent = event;
    },
    ptyRunner: async (_spec, options) => {
      options.onData('session_id: sess-tty\nusage limit reached; try again in 10 minutes');
      options.onInput('\u0003', { child });
      return { exitCode: null, signal: 'SIGINT' };
    },
  });
  const state = readJson(join(repo, '.agent', 'state.json'));
  const snapshot = readFileSync(join(repo, '.agent', 'AUTO_SNAPSHOT.md'), 'utf8');
  const sessions = readFileSync(join(repo, '.agent', 'sessions.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map(JSON.parse);
  const lastEvent = sessions.at(-1);

  assert.equal(result.cooldown.status, 'cooling_down');
  assert.equal(cooldownEvent.matched, true);
  assert.match(cooldownEvent.reason, /usage limit reached/i);
  assert.equal(state.status, 'cooling_down');
  assert.equal(state.mode, 'cooldown_resume');
  assert.equal(state.current_session_id, 'sess-tty');
  assert.equal(state.next_resume_at, '2026-06-29T00:15:00.000Z');
  assert.equal(state.cooldown_detected_at, '2026-06-29T00:00:00.000Z');
  assert.equal(state.reset_time_provenance, 'provider_relative');
  assert.equal(state.last_event, 'interactive_shell_aborted');
  assert.match(snapshot, /status: cooling_down/);
  assert.match(snapshot, /next resume at: 2026-06-29T00:15:00\.000Z/);
  assert.equal(
    sessions.some(
      (event) =>
        event.event === 'interactive_cooldown_detected' &&
        event.source === 'interactive_shell' &&
        event.next_resume_at === '2026-06-29T00:15:00.000Z',
    ),
    true,
  );
  assert.equal(lastEvent.event, 'interactive_shell_aborted');
  assert.match(stderr.text, /\[continuity\] Cooldown detected from Codex output\./);
  assert.match(stderr.text, /\[continuity\] Next resume at: 2026-06-29T00:15:00\.000Z/);
});

test('interactive shell auto-waits when cooldown output is followed by child exit', async () => {
  const repo = makeRepo();
  const stderr = new FakeOutput();
  let nowMs = Date.parse('2026-06-29T00:00:00.000Z');
  const commands = [];
  const sleeps = [];

  const result = await runInteractiveShell({
    cwd: repo,
    stderr,
    clock: () => new Date(nowMs),
    sleep: async (milliseconds) => {
      sleeps.push(milliseconds);
      nowMs += milliseconds;
    },
    ptyRunner: async (spec, options) => {
      commands.push(spec);
      if (commands.length === 1) {
        options.onData('session_id: sess-exit\nusage limit reached; try again in 10 minutes');
      }
      return { exitCode: 0, signal: null };
    },
  });
  const state = readJson(join(repo, '.agent', 'state.json'));
  const sessions = readFileSync(join(repo, '.agent', 'sessions.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map(JSON.parse);

  assert.equal(result.runs[0].childExitedAfterCooldown, true);
  assert.equal(result.pauseConfirmed, true);
  assert.equal(result.interactiveResumes, 1);
  assert.deepEqual(sleeps, [900000]);
  assert.deepEqual(commands[0].args, ['-C', repo]);
  assert.deepEqual(commands[1].args, ['resume', '-C', repo, 'sess-exit']);
  assert.equal(state.status, 'checkpointed');
  assert.equal(state.interactive_resume_target, 'sess-exit');
  assert.equal(state.interactive_resume_target_provenance, 'explicit_session_id');
  assert.equal(
    sessions.some((event) => event.event === 'interactive_shell_aborted'),
    false,
  );
  assert.match(stderr.text, /Resuming Codex session: sess-exit/);
});

test('interactive shell blocks normal input after cooldown and pauses on Enter', async () => {
  const repo = makeRepo();
  const stderr = new FakeOutput();
  let nowMs = Date.parse('2026-06-29T00:00:00.000Z');
  const commands = [];
  const sleeps = [];
  const child = {
    kills: [],
    kill(signal) {
      this.kills.push(signal);
    },
  };

  const result = await runInteractiveShell({
    cwd: repo,
    stderr,
    clock: () => new Date(nowMs),
    sleep: async (milliseconds) => {
      sleeps.push(milliseconds);
      nowMs += milliseconds;
    },
    pauseGraceSleep: () => new Promise(() => {}),
    ptyRunner: async (spec, options) => {
      commands.push(spec);
      if (commands.length === 1) {
        options.onData('session_id: sess-tty\nusage limit reached; try again in 10 minutes');
        assert.equal(options.onInput('typed after cooldown', { child }), false);
        assert.deepEqual(child.kills, []);
        assert.equal(options.onInput('\r', { child }), false);
      }
      return { exitCode: 0, signal: null };
    },
  });
  const state = readJson(join(repo, '.agent', 'state.json'));

  assert.equal(result.pauseConfirmed, true);
  assert.equal(result.abortRequested, false);
  assert.deepEqual(child.kills, ['SIGINT']);
  assert.deepEqual(sleeps, [900000]);
  assert.deepEqual(commands[1].args, ['resume', '-C', repo, 'sess-tty']);
  assert.equal(result.interactiveResumes, 1);
  assert.equal(state.status, 'checkpointed');
  assert.equal(state.watch_resume_count, 1);
  assert.equal(state.interactive_resume_target, 'sess-tty');
  assert.equal(state.interactive_resume_target_provenance, 'explicit_session_id');
  assert.match(stderr.text, /Press Enter to pause and wait/);
  assert.match(stderr.text, /Pausing Codex until the cooldown reset window/);
  assert.match(stderr.text, /Resuming Codex session: sess-tty/);
});

test('default interactive mode asks for Enter and does not auto-pause', async () => {
  const repo = makeRepo();
  const stderr = new FakeOutput();
  let nowMs = Date.parse('2026-06-29T00:00:00.000Z');
  const commands = [];
  const child = {
    kills: [],
    kill(signal) {
      this.kills.push(signal);
    },
  };

  await runInteractiveShell({
    cwd: repo,
    stderr,
    clock: () => new Date(nowMs),
    sleep: async (milliseconds) => {
      nowMs += milliseconds;
    },
    ptyRunner: async (spec, options) => {
      commands.push(spec);
      if (commands.length === 1) {
        options.onData('usage limit reached; try again in 10 minutes', { child });
        assert.deepEqual(child.kills, []);
        return { exitCode: null, signal: null };
      }
      return { exitCode: 0, signal: null };
    },
  });

  assert.match(stderr.text, /Press Enter to pause and wait/);
  assert.doesNotMatch(stderr.text, /Unattended mode is enabled/);
});

test('unattended mode auto-pauses on cooldown and resumes after child exit', async () => {
  const repo = makeRepo();
  const stderr = new FakeOutput();
  let nowMs = Date.parse('2026-06-29T00:00:00.000Z');
  const commands = [];
  const sleeps = [];
  const child = {
    kills: [],
    kill(signal) {
      this.kills.push(signal);
    },
  };

  const result = await runInteractiveShell({
    cwd: repo,
    stderr,
    unattended: true,
    clock: () => new Date(nowMs),
    sleep: async (milliseconds) => {
      sleeps.push(milliseconds);
      nowMs += milliseconds;
    },
    pauseGraceSleep: () => new Promise(() => {}),
    ptyRunner: async (spec, options) => {
      commands.push(spec);
      if (commands.length === 1) {
        options.onData(
          'session_id: sess-unattended\nusage limit reached; try again in 10 minutes',
          {
            child,
          },
        );
        assert.deepEqual(child.kills, ['SIGINT']);
      }
      return { exitCode: 0, signal: null };
    },
  });
  const state = readJson(join(repo, '.agent', 'state.json'));

  assert.equal(result.pauseConfirmed, true);
  assert.equal(result.runs[0].unattendedPauseStarted, true);
  assert.equal(result.interactiveResumes, 1);
  assert.deepEqual(sleeps, [900000]);
  assert.deepEqual(commands[1].args, ['resume', '-C', repo, 'sess-unattended']);
  assert.equal(state.status, 'checkpointed');
  assert.match(stderr.text, /Unattended mode is enabled/);
  assert.match(stderr.text, /Pausing Codex automatically/);
  assert.doesNotMatch(stderr.text, /Press Enter to pause and wait/);
});

test('unattended forced termination keeps cooling_down state while proceeding to resume', async () => {
  const repo = makeRepo();
  const stderr = new FakeOutput();
  let nowMs = Date.parse('2026-06-29T00:00:00.000Z');
  const commands = [];
  const waitSleeps = [];
  const graceSleeps = [];
  const statusesDuringWait = [];
  const child = {
    kills: [],
    kill(signal) {
      this.kills.push(signal);
    },
  };

  const result = await runInteractiveShell({
    cwd: repo,
    stderr,
    unattended: true,
    pauseGraceSeconds: 3,
    forceTerminationGraceSeconds: 1,
    clock: () => new Date(nowMs),
    sleep: async (milliseconds) => {
      waitSleeps.push(milliseconds);
      const state = readJson(join(repo, '.agent', 'state.json'));
      statusesDuringWait.push({
        status: state.status,
        interactiveShellStatus: state.interactive_shell_status,
        lastTtyEvent: state.last_tty_event,
      });
      nowMs += milliseconds;
    },
    pauseGraceSleep: async (milliseconds) => {
      graceSleeps.push(milliseconds);
    },
    ptyRunner: async (spec, options) => {
      commands.push(spec);
      if (commands.length === 1) {
        return new Promise((resolve) => {
          options.onData('session_id: sess-forced\nusage limit reached; try again in 10 minutes', {
            child,
            finish: resolve,
          });
        });
      }
      return { exitCode: 0, signal: null };
    },
  });
  const finalState = readJson(join(repo, '.agent', 'state.json'));

  assert.equal(result.runs[0].unattendedForcedTermination, true);
  assert.deepEqual(child.kills, ['SIGINT', 'SIGTERM', 'SIGKILL']);
  assert.deepEqual(graceSleeps, [3000, 1000]);
  assert.deepEqual(waitSleeps, [900000]);
  assert.deepEqual(statusesDuringWait, [
    {
      status: 'cooling_down',
      interactiveShellStatus: 'cooldown_child_terminated',
      lastTtyEvent: 'unattended_pause_forced',
    },
  ]);
  assert.deepEqual(commands[1].args, ['resume', '-C', repo, 'sess-forced']);
  assert.equal(result.interactiveResumes, 1);
  assert.equal(finalState.status, 'checkpointed');
  assert.match(stderr.text, /Forcing Codex child termination/);
});

test('interactive shell aborts safely when pause SIGINT does not exit child before grace timeout', async () => {
  const repo = makeRepo();
  const stderr = new FakeOutput();
  const commands = [];
  const graceSleeps = [];
  const child = {
    kills: [],
    kill(signal) {
      this.kills.push(signal);
    },
  };

  const result = await runInteractiveShell({
    cwd: repo,
    stderr,
    clock: () => new Date('2026-06-29T00:00:00.000Z'),
    pauseGraceSeconds: 3,
    pauseGraceSleep: async (milliseconds) => {
      graceSleeps.push(milliseconds);
    },
    ptyRunner: async (spec, options) =>
      new Promise((resolve) => {
        commands.push(spec);
        options.onData('session_id: sess-stuck\nusage limit reached; try again in 10 minutes');
        assert.equal(options.onInput('\r', { child, finish: resolve }), false);
      }),
  });
  const state = readJson(join(repo, '.agent', 'state.json'));

  assert.equal(result.pauseGraceTimedOut, true);
  assert.equal(result.pauseConfirmed, true);
  assert.deepEqual(child.kills, ['SIGINT']);
  assert.deepEqual(graceSleeps, [3000]);
  assert.equal(commands.length, 1);
  assert.equal(state.status, 'cooling_down');
  assert.equal(state.interactive_shell_status, 'aborted');
  assert.equal(state.current_session_id, 'sess-stuck');
  assert.match(stderr.text, /Codex did not exit after pause request/);
  assert.match(stderr.text, /State remains cooling_down/);
  assert.match(stderr.text, /Exit Codex manually, then rerun: continuity codex/);
});

test('interactive shell preserves state and aborts wrapper on Ctrl-C after cooldown', async () => {
  const repo = makeRepo();
  const stderr = new FakeOutput();
  const child = {
    kills: [],
    kill(signal) {
      this.kills.push(signal);
    },
  };

  const result = await runInteractiveShell({
    cwd: repo,
    stderr,
    clock: () => new Date('2026-06-29T00:00:00.000Z'),
    ptyRunner: async (_spec, options) => {
      options.onData('usage limit reached; try again in 10 minutes');
      assert.equal(options.onInput('\u0003', { child }), false);
      return { exitCode: null, signal: 'SIGINT' };
    },
  });
  const state = readJson(join(repo, '.agent', 'state.json'));

  assert.equal(result.pauseConfirmed, false);
  assert.equal(result.abortRequested, true);
  assert.deepEqual(child.kills, ['SIGINT']);
  assert.equal(state.status, 'cooling_down');
  assert.match(stderr.text, /Interactive wrapper aborted. State was preserved/);
});

test('interactive shell falls back to codex resume --last without a session id', async () => {
  const repo = makeRepo();
  const stderr = new FakeOutput();
  let nowMs = Date.parse('2026-06-29T00:00:00.000Z');
  const commands = [];
  const child = {
    kill() {},
  };

  await runInteractiveShell({
    cwd: repo,
    stderr,
    clock: () => new Date(nowMs),
    sleep: async (milliseconds) => {
      nowMs += milliseconds;
    },
    pauseGraceSleep: () => new Promise(() => {}),
    ptyRunner: async (spec, options) => {
      commands.push(spec);
      if (commands.length === 1) {
        options.onData('usage limit reached; try again in 10 minutes');
        options.onInput('\r', { child });
      }
      return { exitCode: 0, signal: null };
    },
  });
  const state = readJson(join(repo, '.agent', 'state.json'));

  assert.deepEqual(commands[1].args, ['resume', '-C', repo, '--last']);
  assert.equal(state.interactive_resume_target, '--last');
  assert.equal(state.interactive_resume_target_provenance, 'codex_last');
});

test('interactive shell adopts existing interactive cooling_down state', async () => {
  const repo = makeRepo();
  setCoolingDownState(repo);
  const stderr = new FakeOutput();
  let nowMs = Date.parse('2026-06-29T00:00:00.000Z');
  const sleeps = [];
  const commands = [];

  await runInteractiveShell({
    cwd: repo,
    stderr,
    debug: true,
    clock: () => new Date(nowMs),
    sleep: async (milliseconds) => {
      sleeps.push(milliseconds);
      nowMs += milliseconds;
    },
    ptyRunner: async (spec) => {
      commands.push(spec);
      return { exitCode: 0, signal: null };
    },
  });

  assert.deepEqual(sleeps, [300000]);
  assert.equal(commands.length, 1);
  assert.deepEqual(commands[0].args, ['resume', '-C', repo, 'sess-existing']);
  assert.match(stderr.text, /Existing cooldown state found/);
  assert.doesNotMatch(stderr.text, /Cooldown detected from Codex output/);

  const debugEvents = parseDebugLines(stderr.text);
  assert.equal(debugEvents.length, 1);
  assert.equal(debugEvents[0].source, 'adopted_state');
  assert.equal(debugEvents[0].mode, 'project');
  assert.equal(debugEvents[0].state_status_before_detection, 'cooling_down');
  assert.equal(debugEvents[0].session_id, 'sess-existing');
  assert.equal(debugEvents[0].adoption_action, 'adopt');
});

test('project interactive shell preserves usage_window_started_at when adopting cooling_down', async () => {
  const repo = makeRepo();
  setCoolingDownState(repo, {
    usage_window_started_at: '2026-06-29T00:00:00.000Z',
    interactive_shell_started_at: '2026-06-29T00:00:00.000Z',
    next_resume_at: '2026-06-29T00:00:00.000Z',
  });
  const commands = [];

  await runInteractiveShell({
    cwd: repo,
    clock: () => new Date('2026-06-29T00:00:00.000Z'),
    ptyRunner: async (spec) => {
      commands.push(spec);
      return { exitCode: 0, signal: null };
    },
  });
  const state = readJson(join(repo, '.agent', 'state.json'));

  assert.deepEqual(commands[0].args, ['resume', '-C', repo, 'sess-existing']);
  assert.equal(state.usage_window_started_at, '2026-06-29T00:00:00.000Z');
  assert.equal(state.interactive_shell_started_at, '2026-06-29T00:00:00.000Z');
});

test('interactive shell immediately resumes an expired existing cooldown', async () => {
  const repo = makeRepo();
  setCoolingDownState(repo, {
    next_resume_at: '2026-06-29T00:05:00.000Z',
  });
  const sleeps = [];
  const commands = [];

  await runInteractiveShell({
    cwd: repo,
    clock: () => new Date('2026-06-29T00:06:00.000Z'),
    sleep: async (milliseconds) => sleeps.push(milliseconds),
    ptyRunner: async (spec) => {
      commands.push(spec);
      return { exitCode: 0, signal: null };
    },
  });

  assert.deepEqual(sleeps, []);
  assert.deepEqual(commands[0].args, ['resume', '-C', repo, 'sess-existing']);
});

test('project interactive shell diagnoses stale cooling_down without session id and starts fresh', async () => {
  const repo = makeRepo();
  setCoolingDownState(repo, {
    current_session_id: null,
    next_resume_at: '2026-06-29T00:05:00.000Z',
  });
  const stderr = new FakeOutput();
  let nowMs = Date.parse('2026-06-29T00:00:00.000Z');
  const sleeps = [];
  const commands = [];

  await runInteractiveShell({
    cwd: repo,
    stderr,
    debug: true,
    clock: () => new Date(nowMs),
    sleep: async (milliseconds) => {
      sleeps.push(milliseconds);
      nowMs += milliseconds;
    },
    ptyRunner: async (spec) => {
      commands.push(spec);
      return { exitCode: 0, signal: null };
    },
  });
  const state = readJson(join(repo, '.agent', 'state.json'));
  const debugEvents = parseDebugLines(stderr.text);

  assert.deepEqual(sleeps, []);
  assert.equal(commands.length, 1);
  assert.deepEqual(commands[0].args, ['-C', repo]);
  assert.equal(state.status, 'checkpointed');
  assert.equal(state.next_resume_at, null);
  assert.match(stderr.text, /Existing cooldown state looks stale/);
  assert.match(stderr.text, /Starting a fresh Codex TUI instead/);
  assert.doesNotMatch(stderr.text, /Existing cooldown state found/);
  assert.equal(debugEvents.length, 1);
  assert.equal(debugEvents[0].source, 'adopted_state');
  assert.equal(debugEvents[0].adoption_action, 'ignore_stale');
  assert.equal(debugEvents[0].session_id, null);
});

test('interactive shell rejects broken existing cooling_down state', async () => {
  const repo = makeRepo();
  setCoolingDownState(repo, { next_resume_at: null });
  let started = false;

  await assert.rejects(
    runInteractiveShell({
      cwd: repo,
      ptyRunner: async () => {
        started = true;
        return { exitCode: 0, signal: null };
      },
    }),
    /missing next_resume_at/,
  );
  assert.equal(started, false);
});

test('interactive shell does not adopt non-interactive cooling_down state', async () => {
  const repo = makeRepo();
  setCoolingDownState(repo, {
    last_event: 'cooldown_detected',
    interactive_shell_status: null,
    last_tty_event: null,
  });
  let started = false;

  await assert.rejects(
    runInteractiveShell({
      cwd: repo,
      ptyRunner: async () => {
        started = true;
        return { exitCode: 0, signal: null };
      },
    }),
    /Cannot adopt cooling_down state with continuity codex/,
  );
  assert.equal(started, false);
});
