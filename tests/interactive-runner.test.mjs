import { execFileSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { initAgent } from '../src/core/agent-state.mjs';
import { runInteractiveShell } from '../src/interactive/shell-session.mjs';
import { runPtyCommand, TTY_REQUIRED_MESSAGE } from '../src/interactive/pty-runner.mjs';

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'continuity-interactive-'));
  execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
  initAgent({ cwd: dir, taskId: 'task-interactive' });
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
  assert.match(stderr.text, /\[continuity\] Cooldown detected\./);
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
  assert.match(stderr.text, /Exit Codex manually, then rerun: continuity shell/);
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
  let nowMs = Date.parse('2026-06-29T00:00:00.000Z');
  const sleeps = [];
  const commands = [];

  await runInteractiveShell({
    cwd: repo,
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
    /Cannot adopt cooling_down state with continuity shell/,
  );
  assert.equal(started, false);
});
