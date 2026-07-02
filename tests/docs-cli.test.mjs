import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

test('CLI help documents watch mode and direct Codex limitation', () => {
  const helpSource = readFileSync(new URL('../bin/continuity.mjs', import.meta.url), 'utf8');

  assert.match(
    helpSource,
    /shell \[prompt\]\s+Start Codex interactive TUI under Continuation Layer wrapper/,
  );
  assert.match(
    helpSource,
    /watch \[prompt\]\s+Start provider CLI under long-lived cooldown watchdog/,
  );
  assert.match(helpSource, /start \[prompt\]\s+Manual one-shot provider run under supervisor/);
  assert.match(helpSource, /If you run codex directly, cooldown events cannot be captured/);
});

test('README recommends watch mode and labels start as manual mode', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

  assert.match(readme, /Watch mode is the recommended entry point for long-running tasks/);
  assert.match(readme, /continuity watch "finish the auth refactor safely"/);
  assert.match(readme, /## Manual mode/);
  assert.match(readme, /continuity start "finish this task"/);
  assert.match(readme, /It does \*\*not\*\* wait through the reset window/);
  assert.match(readme, /Continuation Layer can only monitor provider processes it starts/);
});

test('cooldown watchdog docs state current gaps and target behavior', () => {
  const docs = readFileSync(new URL('../docs/COOLDOWN_WATCHDOG.md', import.meta.url), 'utf8');

  assert.match(docs, /start.*records cooldown.*does not keep a supervisor alive/is);
  assert.match(docs, /cooldown path.*mechanical snapshot.*semantic handoff/is);
  assert.match(docs, /If you run `codex` directly/i);
  assert.match(docs, /usage_window_started_at \+ 5h \+ buffer/);
  assert.match(docs, /continuity watch "task"/);
});

test('shell dry-run uses the interactive provider command path', () => {
  const helpSource = readFileSync(new URL('../bin/continuity.mjs', import.meta.url), 'utf8');

  assert.match(helpSource, /kind === 'shell'/);
  assert.match(
    helpSource,
    /adapter\.startSessionCommand\(\{ repoRoot, prompt, nonInteractive: false \}\)/,
  );
  assert.match(helpSource, /printCommandLine\(dryRunCommand\('shell', options\.prompt\)\)/);
  assert.match(helpSource, /runInteractiveShell\(\{ prompt: options\.prompt \}\)/);
});
