import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

test('CLI help documents watch mode and direct Codex limitation', () => {
  const helpSource = readFileSync(new URL('../bin/continuity.mjs', import.meta.url), 'utf8');

  assert.match(
    helpSource,
    /codex \[prompt\]\s+Start Codex interactive TUI under Continuation Layer wrapper[\s\S]*shell \[prompt\]\s+Alias for codex/,
  );
  assert.match(helpSource, /--require-repo\s+For codex\/shell, fail outside git/);
  assert.match(helpSource, /--global\s+For codex\/shell, force Global Shell Mode/);
  assert.match(helpSource, /--unattended\s+For codex\/shell, auto-pause/);
  assert.match(helpSource, /--overnight\s+Alias for --unattended/);
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
  assert.match(readme, /continuity codex/);
  assert.match(readme, /`continuity shell` is an alias for `continuity codex`/);
  assert.match(readme, /Interactive terminal wrapper support is experimental and Linux-first/);
});

test('cooldown watchdog docs state current gaps and target behavior', () => {
  const docs = readFileSync(new URL('../docs/COOLDOWN_WATCHDOG.md', import.meta.url), 'utf8');

  assert.match(docs, /start.*records cooldown.*does not keep a supervisor alive/is);
  assert.match(docs, /cooldown path.*mechanical snapshot.*semantic handoff/is);
  assert.match(docs, /If you run `codex` directly/i);
  assert.match(docs, /usage_window_started_at \+ 5h \+ buffer/);
  assert.match(docs, /continuity watch "task"/);
});

test('interactive smoke docs state Linux-first wrapper limitations', () => {
  const docs = readFileSync(new URL('../docs/SMOKE_INTERACTIVE.md', import.meta.url), 'utf8');

  assert.match(docs, /manual and Linux-first/);
  assert.match(docs, /continuity codex --dry-run/);
  assert.match(docs, /continuity shell --dry-run/);
  assert.match(docs, /Direct already-running Codex sessions cannot be adopted/);
  assert.match(docs, /stty sane/);
});

test('codex and shell dry-run use the same interactive provider command path', () => {
  const helpSource = readFileSync(new URL('../bin/continuity.mjs', import.meta.url), 'utf8');

  assert.match(helpSource, /function isInteractiveCodexCommand\(command\)/);
  assert.match(helpSource, /command === 'codex' \|\| command === 'shell'/);
  assert.match(
    helpSource,
    /adapter\.startSessionCommand\(\{ repoRoot, prompt, nonInteractive: false \}\)/,
  );
  assert.match(helpSource, /dryRunCommand\(command, options\.prompt,\s+\{/);
  assert.match(helpSource, /runInteractiveShell\(\{\s+prompt: options\.prompt,/);
  assert.match(helpSource, /requireRepo: options\.requireRepo/);
  assert.match(helpSource, /forceGlobal: options\.forceGlobal/);
  assert.match(helpSource, /unattended: options\.unattended/);
  assert.match(helpSource, /arg === '--require-repo'/);
  assert.match(helpSource, /arg === '--global'/);
  assert.match(helpSource, /arg === '--unattended' \|\| arg === '--overnight'/);
});

test('codex outside git routes to the global interactive shell path', () => {
  const helpSource = readFileSync(new URL('../bin/continuity.mjs', import.meta.url), 'utf8');

  assert.match(helpSource, /isInteractiveCodexCommand\(kind\) && !requireRepo/);
  assert.match(helpSource, /isInteractiveCodexCommand\(command\)/);
  assert.match(helpSource, /runInteractiveShell\(\{\s+prompt: options\.prompt,/);
});

test('codex require-repo outside git keeps the repo-required failure path', () => {
  const helpSource = readFileSync(new URL('../bin/continuity.mjs', import.meta.url), 'utf8');

  assert.match(helpSource, /if \(isInteractiveCodexCommand\(kind\) && !requireRepo\)/);
  assert.match(helpSource, /throw error/);
});

test('global and require-repo flags conflict clearly', () => {
  const helpSource = readFileSync(new URL('../bin/continuity.mjs', import.meta.url), 'utf8');

  assert.match(helpSource, /options\.forceGlobal && options\.requireRepo/);
  assert.match(helpSource, /Cannot combine --global and --require-repo/);
});
