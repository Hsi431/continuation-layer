import { execFileSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync } from 'node:fs';
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

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
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
  assert.deepEqual(commandSpec, {
    command: 'codex',
    args: ['-C', repo, 'explain repo'],
    cwd: repo,
  });
});

test('interactive shell records cooldown state, snapshot, event, and wrapper message', async () => {
  const repo = makeRepo();
  const stderr = new FakeOutput();
  let cooldownEvent = null;

  const result = await runInteractiveShell({
    cwd: repo,
    stderr,
    clock: () => new Date('2026-06-29T00:00:00.000Z'),
    onCooldown: (event) => {
      cooldownEvent = event;
    },
    ptyRunner: async (_spec, options) => {
      options.onData('session_id: sess-tty\nusage limit reached; try again in 10 minutes');
      return { exitCode: 0, signal: null };
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
  assert.equal(state.last_event, 'interactive_cooldown_detected');
  assert.match(snapshot, /status: cooling_down/);
  assert.match(snapshot, /next resume at: 2026-06-29T00:15:00\.000Z/);
  assert.equal(lastEvent.event, 'interactive_cooldown_detected');
  assert.equal(lastEvent.source, 'interactive_shell');
  assert.equal(lastEvent.next_resume_at, '2026-06-29T00:15:00.000Z');
  assert.match(stderr.text, /\[continuity\] Cooldown detected\./);
  assert.match(stderr.text, /\[continuity\] Next resume at: 2026-06-29T00:15:00\.000Z/);
});

test('interactive shell blocks normal input after cooldown and pauses on Enter', async () => {
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
      assert.equal(options.onInput('typed after cooldown', { child }), false);
      assert.deepEqual(child.kills, []);
      assert.equal(options.onInput('\r', { child }), false);
      return { exitCode: 0, signal: null };
    },
  });

  assert.equal(result.pauseConfirmed, true);
  assert.equal(result.abortRequested, false);
  assert.deepEqual(child.kills, ['SIGINT']);
  assert.match(stderr.text, /Press Enter to pause and wait/);
  assert.match(stderr.text, /Pausing Codex until the cooldown reset window/);
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
