import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_CONFIG } from '../src/core/constants.mjs';
import { makeInitialState } from '../src/core/agent-state.mjs';
import { validateConfig, validateState } from '../src/core/validation.mjs';

test('default config validates', () => {
  assert.deepEqual(validateConfig({ ...DEFAULT_CONFIG }), []);
});

test('config validation rejects bad types', () => {
  const errors = validateConfig({
    ...DEFAULT_CONFIG,
    overnight_mode: 'false',
    cooldown_default_seconds: -1,
    max_cooldown_resumes: -1,
  });

  assert.match(errors.join('\n'), /overnight_mode/);
  assert.match(errors.join('\n'), /cooldown_default_seconds/);
  assert.match(errors.join('\n'), /max_cooldown_resumes/);
});

test('initial state validates', () => {
  const state = makeInitialState({
    repoRoot: '/tmp/repo',
    provider: 'codex',
    taskId: 'task-1',
    timestamp: '2026-06-29T08:00:00.000Z',
  });

  assert.deepEqual(validateState(state), []);
});

test('state validation rejects unknown status', () => {
  const state = makeInitialState({
    repoRoot: '/tmp/repo',
    provider: 'codex',
    taskId: 'task-1',
    timestamp: '2026-06-29T08:00:00.000Z',
  });

  assert.match(validateState({ ...state, status: 'paused' }).join('\n'), /state.status/);
});

test('state validation rejects unknown reset provenance', () => {
  const state = makeInitialState({
    repoRoot: '/tmp/repo',
    provider: 'codex',
    taskId: 'task-1',
    timestamp: '2026-06-29T08:00:00.000Z',
  });

  assert.match(
    validateState({ ...state, reset_time_provenance: 'guessed' }).join('\n'),
    /state.reset_time_provenance/,
  );
});
