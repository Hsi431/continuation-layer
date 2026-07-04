import test from 'node:test';
import assert from 'node:assert/strict';

import {
  codexAdapter,
  nextResumeAt,
  parseResetTime,
  parseResetTimeDetails,
} from '../src/providers/codex.mjs';

test('codex adapter builds start, resume, and fork commands', () => {
  assert.deepEqual(
    codexAdapter.startSessionCommand({ repoRoot: '/repo', prompt: 'work', nonInteractive: true }),
    { command: 'codex', args: ['exec', '-C', '/repo', 'work'], cwd: '/repo' },
  );

  assert.deepEqual(
    codexAdapter.resumeSessionCommand({ repoRoot: '/repo', sessionId: 'abc', prompt: 'resume' }),
    { command: 'codex', args: ['exec', '-C', '/repo', 'resume', 'abc', 'resume'], cwd: '/repo' },
  );

  assert.deepEqual(
    codexAdapter.startContinuationSessionCommand({
      repoRoot: '/repo',
      sessionId: 'abc',
      prompt: 'continue',
    }),
    { command: 'codex', args: ['fork', '-C', '/repo', 'abc', 'continue'], cwd: '/repo' },
  );
});

test('codex continuation prompt requires handoff and git recovery reads', () => {
  const prompt = codexAdapter.makeContinuationPrompt({
    state: {
      task_id: 'task-codex',
      current_session_id: 'parent-session',
      current_handoff_path: '.agent/HANDOFF.md',
    },
  });

  assert.match(prompt, /Read \.agent\/HANDOFF\.md/);
  assert.match(prompt, /git status --short/);
  assert.match(prompt, /git diff --no-color/);
});

test('codex adapter detects cooldown text and extracts session ids', () => {
  const text = 'session_id: sess-123\n429 rate limit reached; try again in 1 hour';
  const cooldown = codexAdapter.detectCooldownError(text);

  assert.equal(cooldown.matched, true);
  assert.equal(cooldown.matchedPattern, 'http_429');
  assert.match(cooldown.matchedTextExcerpt, /429 rate limit reached/i);
  assert.equal(codexAdapter.extractSessionId(text), 'sess-123');
});

test('codex adapter avoids generic try-again false positives', () => {
  assert.equal(codexAdapter.detectCooldownError('try again in the morning').matched, false);
  assert.equal(codexAdapter.detectCooldownError('try again in 12 minutes').matched, true);
});

test('codex adapter avoids non-cooldown limit false positives', () => {
  for (const text of [
    'context limit reached',
    'token limit exceeded',
    'file size limit exceeded',
    'Usage window resets in 5h',
    'Next reset at 2026-07-04T00:21:45Z',
    'You have 1 usage limit reset available. Run /usage to use one.',
  ]) {
    assert.equal(codexAdapter.detectCooldownError(text).matched, false);
  }
});

test('reset parser handles iso, epoch, and relative reset times', () => {
  const now = new Date('2026-06-29T00:00:00.000Z');

  assert.equal(
    parseResetTime('reset at 2026-06-29T01:02:03Z', now).toISOString(),
    '2026-06-29T01:02:03.000Z',
  );
  assert.equal(
    parseResetTime('{"resets_at": 1782694800}', now).toISOString(),
    '2026-06-29T01:00:00.000Z',
  );
  assert.equal(
    parseResetTime('try again in 2 hours 3 minutes', now).toISOString(),
    '2026-06-29T02:03:00.000Z',
  );
});

test('reset parser reports reset provenance', () => {
  const now = new Date('2026-06-29T00:00:00.000Z');

  assert.equal(
    parseResetTimeDetails('try again at 2026-06-29T01:02:03Z', now).provenance,
    'provider_reset_at',
  );
  assert.equal(
    parseResetTimeDetails('{"resets_at": 1782694800}', now).provenance,
    'provider_epoch',
  );
  assert.equal(
    parseResetTimeDetails('retry after 37 minutes', now).provenance,
    'provider_relative',
  );
});

test('next resume uses parsed reset plus buffer or fallback plus buffer', () => {
  const now = new Date('2026-06-29T00:00:00.000Z');

  assert.equal(
    nextResumeAt({
      text: 'try again in 10 minutes',
      now,
      defaultSeconds: 18000,
      bufferSeconds: 300,
    }).toISOString(),
    '2026-06-29T00:15:00.000Z',
  );
  assert.equal(
    nextResumeAt({
      text: 'usage limit reached',
      now,
      defaultSeconds: 18000,
      bufferSeconds: 300,
    }).toISOString(),
    '2026-06-29T05:05:00.000Z',
  );
});
