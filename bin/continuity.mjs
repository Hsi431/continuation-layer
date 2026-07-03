#!/usr/bin/env node
import {
  completeTask,
  initAgent,
  loadAgentState,
  setOvernightMode,
  startNewTask,
  statusAgent,
  writeMechanicalSnapshot,
} from '../src/core/agent-state.mjs';
import { resolveRepoRoot } from '../src/core/git.mjs';
import { runInteractiveShell } from '../src/interactive/shell-session.mjs';
import { getProviderAdapter } from '../src/providers/adapter.mjs';
import {
  continueManagedSession,
  resumeManagedSession,
  startManagedSession,
  watchManagedSession,
} from '../src/supervisor/supervisor.mjs';

function parseArgs(argv) {
  const args = [...argv];
  const command = args.shift() ?? 'help';
  const options = {
    json: false,
    dryRun: false,
    allowEarly: false,
    yes: false,
    requireRepo: false,
    promptParts: [],
  };

  while (args.length > 0) {
    const arg = args.shift();
    if (arg === '--json') {
      options.json = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--allow-early') {
      options.allowEarly = true;
    } else if (arg === '--yes') {
      options.yes = true;
    } else if (arg === '--require-repo') {
      options.requireRepo = true;
    } else if (arg === '--task-id') {
      options.taskId = args.shift();
    } else if (arg === '--provider') {
      options.provider = args.shift();
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown argument: ${arg}`);
    } else {
      options.promptParts.push(arg);
    }
  }

  options.prompt = options.promptParts.join(' ');
  return { command, options };
}

function isInteractiveCodexCommand(command) {
  return command === 'codex' || command === 'shell';
}

function printHelp() {
  console.log(`Usage: continuity <command> [options]

Commands:
  init                 Initialize .agent in the current git repo
  status [--json]      Show current durable state
  snapshot             Write .agent/AUTO_SNAPSHOT.md
  codex [prompt]       Start Codex interactive TUI under Continuation Layer wrapper
  shell [prompt]       Alias for codex
  watch [prompt]       Start provider CLI under long-lived cooldown watchdog
  start [prompt]       Manual one-shot provider run under supervisor
  resume               Resume a cooling_down task under supervisor
  continue             Write handoff, then start child continuation after confirmation
  overnight enable     Enable overnight auto-continuation
  overnight disable    Disable overnight auto-continuation
  complete             Mark current task complete and archive handoff state
  new-task             Archive current state and start a fresh task

Options:
  --task-id <id>       Task id for init
  --provider <name>    Provider for init; default codex
  --json               Machine-readable status output
  --dry-run            Print provider command without executing start/watch/codex/shell/resume/continue
  --require-repo       For codex/shell, fail outside git instead of using Global Shell Mode
  --allow-early        Resume before next_resume_at
  --yes                Confirm child continuation startup

Continuation Layer can only monitor provider processes started by continuity start, continuity watch, or continuity codex.
If you run codex directly, cooldown events cannot be captured or resumed automatically.
`);
}

function printStatus(status) {
  console.log(`task id: ${status.taskId}`);
  console.log(`provider: ${status.provider}`);
  console.log(`status: ${status.status}`);
  console.log(`mode: ${status.mode}`);
  console.log(`current session: ${status.currentSession ?? 'none'}`);
  console.log(`parent session: ${status.parentSession ?? 'none'}`);
  console.log(`current handoff: ${status.currentHandoff}`);
  console.log(`next action: ${status.nextAction ?? 'none'}`);
  console.log(`next resume at: ${status.nextResumeAt ?? 'none'}`);
  console.log(`cooldown detected at: ${status.cooldownDetectedAt ?? 'none'}`);
  console.log(`usage window started at: ${status.usageWindowStartedAt ?? 'none'}`);
  console.log(`reset time provenance: ${status.resetTimeProvenance ?? 'none'}`);
  console.log(`watch started at: ${status.watchStartedAt ?? 'none'}`);
  console.log(`watch resume count: ${status.watchResumeCount}`);
  console.log(`last watch event: ${status.lastWatchEvent ?? 'none'}`);
  console.log(`overnight mode: ${status.overnightMode}`);
  console.log(`auto continue after handoff: ${status.autoContinueAfterHandoff}`);
  console.log(`cooldown countdown seconds: ${status.cooldownSeconds ?? 'none'}`);
  console.log(
    `watchdog running: ${
      status.watchdogRunning === 'unknown_no_lock'
        ? 'unknown (no lock/pid tracking)'
        : status.watchdogRunning
    }`,
  );
}

function printCommandSpec(commandSpec) {
  console.log(JSON.stringify(commandSpec, null, 2));
}

function printCommandLine(commandSpec) {
  console.log([commandSpec.command, ...commandSpec.args].map(shellQuote).join(' '));
}

function shellQuote(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(text)) {
    return text;
  }

  return `'${text.replaceAll("'", "'\\''")}'`;
}

function printSupervisorResult(result) {
  console.log(
    JSON.stringify(
      {
        status: result.status,
        exitCode: result.result?.exitCode ?? null,
        logPath: result.result?.logPath ?? null,
        nextResumeAt: result.nextResumeAt ?? null,
        resetTimeProvenance: result.resetTimeProvenance ?? null,
        waiting: result.waiting ?? false,
        watchStopped: result.watchStopped ?? false,
        limitReached: result.limitReached ?? false,
        aborted: result.aborted ?? false,
        confirmationRequired: result.confirmationRequired ?? false,
        continuationStarted: result.continuationStarted ?? false,
        autoContinued: result.autoContinued ?? false,
        recoveryOk: result.recovery?.ok ?? null,
        recoveryFailures: result.recovery?.failures ?? [],
      },
      null,
      2,
    ),
  );
}

function printWatchEvent(event) {
  if (event.type === 'cooldown_detected') {
    console.log('Cooldown detected.');
    console.log(`Reset provenance: ${event.resetTimeProvenance ?? 'unknown'}`);
    console.log(`Next resume at: ${event.nextResumeAt ?? 'unknown'}`);
    console.log(`Waiting: ${formatDuration(event.waitMs ?? 0)}`);
  } else if (event.type === 'heartbeat') {
    console.log(`Waiting: ${formatDuration(event.remainingMs ?? 0)} remaining`);
  } else if (event.type === 'watch_resuming') {
    console.log(`Resuming same session: ${event.sessionId}`);
  }
}

function formatDuration(milliseconds) {
  const totalMinutes = Math.ceil(Math.max(0, milliseconds) / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function makeAbortSignal() {
  const controller = new AbortController();
  const onSigint = () => controller.abort();
  process.once('SIGINT', onSigint);

  return {
    signal: controller.signal,
    dispose() {
      process.removeListener('SIGINT', onSigint);
    },
  };
}

function printAbortGuidance(result) {
  if (!result.aborted) {
    return;
  }

  console.log('Watchdog aborted. State was preserved.');
  console.log('You can resume later with:');
  console.log('  continuity resume');
  console.log('or restart the watchdog with:');
  console.log('  continuity watch');
}

function printOvernightResult(result) {
  console.log(`overnight mode: ${result.config.overnight_mode}`);
  console.log(`auto continue after handoff: ${result.config.auto_continue_after_handoff}`);
}

function printArchiveResult(label, result) {
  console.log(`${label}: ${result.state.task_id}`);
  console.log(`archived handoff: ${result.archive.handoff}`);
  console.log(`archived snapshot: ${result.archive.snapshot}`);
}

function dryRunCommand(kind, prompt, { requireRepo = false, cwd = process.cwd() } = {}) {
  let repoRoot = null;
  try {
    repoRoot = resolveRepoRoot(cwd);
  } catch (error) {
    if (isInteractiveCodexCommand(kind) && !requireRepo) {
      const adapter = getProviderAdapter('codex');
      return adapter.startSessionCommand({ repoRoot: cwd, prompt, nonInteractive: false });
    }

    if (kind === 'watch') {
      throw new Error(watchRequiresRepoMessage());
    }

    throw error;
  }

  const { config, state } = loadAgentState(repoRoot);
  const adapter = getProviderAdapter(config.provider);

  if (kind === 'start' || kind === 'watch') {
    return adapter.startSessionCommand({ repoRoot, prompt, nonInteractive: true });
  }

  if (isInteractiveCodexCommand(kind)) {
    return adapter.startSessionCommand({ repoRoot, prompt, nonInteractive: false });
  }

  if (kind === 'continue') {
    return adapter.startContinuationSessionCommand({
      repoRoot,
      sessionId: state.current_session_id,
      prompt: adapter.makeContinuationPrompt({ state }),
    });
  }

  return adapter.resumeSessionCommand({
    repoRoot,
    sessionId: state.current_session_id,
    prompt: adapter.makeResumePrompt({ state, snapshotPath: state.last_snapshot_path }),
    nonInteractive: true,
  });
}

function watchRequiresRepoMessage() {
  return [
    'continuity watch requires a git repository because it writes .agent state and uses git recovery.',
    'Use continuity codex for global interactive mode.',
  ].join('\n');
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));

  if (command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  if (command === 'init') {
    const result = initAgent({
      provider: options.provider ?? 'codex',
      taskId: options.taskId ?? null,
    });
    console.log(
      result.created
        ? `initialized: ${result.repoRoot}`
        : `already initialized: ${result.repoRoot}`,
    );
    return;
  }

  if (command === 'status') {
    const status = statusAgent();
    if (options.json) {
      console.log(JSON.stringify(status, null, 2));
    } else {
      printStatus(status);
    }
    return;
  }

  if (command === 'snapshot') {
    const result = writeMechanicalSnapshot();
    console.log(`snapshot written: ${result.snapshotPath}`);
    return;
  }

  if (command === 'overnight') {
    const action = options.promptParts[0] ?? 'status';
    if (action === 'enable' || action === 'on') {
      printOvernightResult(setOvernightMode({ enabled: true }));
      return;
    }

    if (action === 'disable' || action === 'off') {
      printOvernightResult(setOvernightMode({ enabled: false }));
      return;
    }

    throw new Error(`Unknown overnight action: ${action}`);
  }

  if (command === 'complete') {
    printArchiveResult('completed task', completeTask());
    return;
  }

  if (command === 'new-task') {
    printArchiveResult(
      'new task',
      startNewTask({
        taskId: options.taskId ?? null,
        provider: options.provider ?? null,
      }),
    );
    return;
  }

  if (command === 'start') {
    if (options.dryRun) {
      printCommandSpec(dryRunCommand('start', options.prompt));
      return;
    }

    printSupervisorResult(await startManagedSession({ prompt: options.prompt }));
    return;
  }

  if (command === 'watch') {
    if (options.dryRun) {
      printCommandSpec(dryRunCommand('watch', options.prompt));
      return;
    }

    const abort = makeAbortSignal();
    try {
      const result = await watchManagedSession({
        prompt: options.prompt,
        signal: abort.signal,
        onEvent: printWatchEvent,
      });
      printAbortGuidance(result);
      printSupervisorResult(result);
    } finally {
      abort.dispose();
    }
    return;
  }

  if (isInteractiveCodexCommand(command)) {
    if (options.dryRun) {
      printCommandLine(
        dryRunCommand(command, options.prompt, { requireRepo: options.requireRepo }),
      );
      return;
    }

    const result = await runInteractiveShell({
      prompt: options.prompt,
      requireRepo: options.requireRepo,
    });
    process.exitCode = result.exitCode ?? 0;
    return;
  }

  if (command === 'resume') {
    if (options.dryRun) {
      printCommandSpec(dryRunCommand('resume', options.prompt));
      return;
    }

    printSupervisorResult(await resumeManagedSession({ allowEarly: options.allowEarly }));
    return;
  }

  if (command === 'continue') {
    if (options.dryRun) {
      printCommandSpec(dryRunCommand('continue', options.prompt));
      return;
    }

    printSupervisorResult(
      await continueManagedSession({
        confirmed: options.yes,
        prompt: options.prompt,
      }),
    );
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
