import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildContinuityContext, initAgent, recordCompaction } from '../src/core/agent-state.mjs';
import { runHookCli } from '../plugins/codex-continuity/hooks/codex-continuity-hook.mjs';

const HOOK_SCRIPT = join(
  process.cwd(),
  'plugins',
  'codex-continuity',
  'hooks',
  'codex-continuity-hook.mjs',
);

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'continuity-hooks-'));
  execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
  initAgent({ cwd: dir, taskId: 'task-hooks' });
  return dir;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

test('session start context points Codex at durable state', () => {
  const repo = makeRepo();
  const context = buildContinuityContext({ cwd: repo, source: 'test' });

  assert.match(context, /task id: task-hooks/);
  assert.match(context, /handoff: \.agent\/HANDOFF\.md/);
  assert.match(context, /next action: Define the next action for this task\./);
  assert.match(context, /Prefer \.agent durable state/);
});

test('context pressure records handoff mode without provider cooldown logic', () => {
  const repo = makeRepo();

  const stdout = runHookCli(['pre-compact', '--cwd', repo, '--trigger', 'auto'], {
    PLUGIN_ROOT: join(process.cwd(), 'plugins', 'codex-continuity'),
  });
  const output = JSON.parse(stdout);

  const state = readJson(join(repo, '.agent', 'state.json'));
  const sessions = readFileSync(join(repo, '.agent', 'sessions.jsonl'), 'utf8')
    .trim()
    .split('\n');
  assert.match(output.systemMessage, /continuity handoff requested/);
  assert.equal(state.status, 'waiting_for_user');
  assert.equal(state.mode, 'context_handoff');
  assert.equal(state.last_event, 'handoff_written');
  assert.equal(JSON.parse(sessions.at(-2)).event, 'context_pressure_detected');
  assert.equal(JSON.parse(sessions.at(-1)).event, 'handoff_written');
  assert.match(
    readFileSync(join(repo, '.agent', 'HANDOFF.md'), 'utf8'),
    /Context handoff written before continuation/,
  );
  assert.match(readFileSync(join(repo, '.agent', 'AUTO_SNAPSHOT.md'), 'utf8'), /handoff_written/);
});

test('post compact records compaction and keeps durable state preferred', () => {
  const repo = makeRepo();

  recordCompaction({ cwd: repo, trigger: 'manual' });

  const state = readJson(join(repo, '.agent', 'state.json'));
  const sessions = readFileSync(join(repo, '.agent', 'sessions.jsonl'), 'utf8')
    .trim()
    .split('\n');
  assert.equal(state.mode, 'context_handoff');
  assert.equal(state.last_event, 'compaction_recorded');
  assert.match(JSON.parse(sessions.at(-1)).reason, /prefer \.agent durable state/);
});

test('codex hook commands are short command handlers', () => {
  const hooks = readJson(join(process.cwd(), 'plugins', 'codex-continuity', 'hooks', 'hooks.json'));

  for (const event of ['SessionStart', 'Stop', 'PreCompact', 'PostCompact']) {
    const handler = hooks.hooks[event][0].hooks[0];
    assert.equal(handler.type, 'command');
    assert.match(handler.command, /codex-continuity-hook\.mjs/);
    assert.match(handler.command, /\$\{PLUGIN_ROOT\}/);
    assert.equal(handler.async, undefined);
    assert.ok(handler.timeout <= 10);
    assert.doesNotMatch(handler.command, /sleep|cooldown|rate|429/i);
  }
});

test('codex hook script parses hook payload and emits JSON output', () => {
  const repo = makeRepo();
  const stdout = runHookCli(
    ['session-start'],
    { PLUGIN_ROOT: join(process.cwd(), 'plugins', 'codex-continuity') },
    JSON.stringify({ cwd: repo, matcher: 'startup' }),
  );
  const output = JSON.parse(stdout);
  const context = output.hookSpecificOutput.additionalContext;

  assert.equal(output.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.match(context, /# Continuity Context/);
  assert.match(context, /codex SessionStart startup/);
  assert.match(context, /task id: task-hooks/);
});

test('codex hook stop writes snapshot and emits valid JSON', () => {
  const repo = makeRepo();
  const stdout = runHookCli(['stop', '--cwd', repo], {
    PLUGIN_ROOT: join(process.cwd(), 'plugins', 'codex-continuity'),
  });
  const output = JSON.parse(stdout);
  const state = readJson(join(repo, '.agent', 'state.json'));

  assert.match(output.systemMessage, /continuity snapshot written/);
  assert.equal(state.last_event, 'checkpoint_written');
});

test('codex hook script skips malformed payloads without throwing', () => {
  const stdout = runHookCli(['session-start'], {}, '{not-json');

  assert.equal(stdout, '');
});

test('codex hook script does not block on stdin reads', () => {
  const script = readFileSync(HOOK_SCRIPT, 'utf8');

  assert.doesNotMatch(script, /readFileSync\(0/);
  assert.match(script, /readStdinWithDeadline/);
  assert.match(script, /writeMechanicalSnapshot/);
});
