import { existsSync } from 'node:fs';

import { loadAgentState, transitionState } from '../core/agent-state.mjs';
import { DEFAULT_CONFIG } from '../core/constants.mjs';
import { paths } from '../core/files.mjs';
import { tryResolveRepoRoot } from '../core/git.mjs';
import { getProviderAdapter } from '../providers/adapter.mjs';
import { recordInteractiveCooldown } from './cooldown-recorder.mjs';
import {
  globalShellPaths,
  makeInitialGlobalShellState,
  readGlobalShellState,
  recordGlobalInteractiveCooldown,
  writeGlobalShellState,
} from './global-shell-state.mjs';
import { runPtyCommand } from './pty-runner.mjs';
import { createCooldownStreamDetector } from './stream-detector.mjs';

export const DEFAULT_INTERACTIVE_PAUSE_GRACE_SECONDS = 10;
export const DEFAULT_UNATTENDED_FORCE_TERMINATION_GRACE_SECONDS = 2;

export async function runInteractiveShell({
  cwd = process.cwd(),
  prompt = '',
  adapter = null,
  ptyRunner = runPtyCommand,
  signal = null,
  stdin = process.stdin,
  stdout = process.stdout,
  stderr = process.stderr,
  onCooldown = null,
  streamDetector = null,
  cooldownRecorder = recordInteractiveCooldown,
  clock = () => new Date(),
  sleep = defaultSleep,
  pauseGraceSleep = sleep,
  onEvent = () => {},
  pauseGraceSeconds = DEFAULT_INTERACTIVE_PAUSE_GRACE_SECONDS,
  forceTerminationGraceSeconds = DEFAULT_UNATTENDED_FORCE_TERMINATION_GRACE_SECONDS,
  requireRepo = false,
  forceGlobal = false,
  unattended = false,
  debug = false,
  globalStateDir = null,
} = {}) {
  if (forceGlobal && requireRepo) {
    throw new Error('Cannot combine --global and --require-repo');
  }

  const repoRoot = tryResolveRepoRoot(cwd);

  if (forceGlobal) {
    return runGlobalInteractiveShell({
      cwd,
      prompt,
      adapter,
      ptyRunner,
      signal,
      stdin,
      stdout,
      stderr,
      onCooldown,
      streamDetector,
      clock,
      sleep,
      pauseGraceSleep,
      onEvent,
      pauseGraceSeconds,
      forceTerminationGraceSeconds,
      unattended,
      debug,
      notice: repoRoot ? 'forced_global' : 'no_git',
      globalStateDir,
    });
  }

  if (!repoRoot) {
    if (requireRepo) {
      throw new Error('continuity must run inside a git repository');
    }

    return runGlobalInteractiveShell({
      cwd,
      prompt,
      adapter,
      ptyRunner,
      signal,
      stdin,
      stdout,
      stderr,
      onCooldown,
      streamDetector,
      clock,
      sleep,
      pauseGraceSleep,
      onEvent,
      pauseGraceSeconds,
      forceTerminationGraceSeconds,
      unattended,
      debug,
      notice: 'no_git',
      globalStateDir,
    });
  }

  if (!existsSync(paths(repoRoot).agentDir)) {
    return runGlobalInteractiveShell({
      cwd,
      prompt,
      adapter,
      ptyRunner,
      signal,
      stdin,
      stdout,
      stderr,
      onCooldown,
      streamDetector,
      clock,
      sleep,
      pauseGraceSleep,
      onEvent,
      pauseGraceSeconds,
      forceTerminationGraceSeconds,
      unattended,
      debug,
      notice: 'uninitialized_repo',
      globalStateDir,
    });
  }

  return runProjectInteractiveShell({
    repoRoot,
    prompt,
    adapter,
    ptyRunner,
    signal,
    stdin,
    stdout,
    stderr,
    onCooldown,
    streamDetector,
    cooldownRecorder,
    clock,
    sleep,
    pauseGraceSleep,
    onEvent,
    pauseGraceSeconds,
    forceTerminationGraceSeconds,
    unattended,
    debug,
  });
}

async function runProjectInteractiveShell({
  repoRoot,
  prompt,
  adapter,
  ptyRunner,
  signal,
  stdin,
  stdout,
  stderr,
  onCooldown,
  streamDetector,
  cooldownRecorder,
  clock,
  sleep,
  pauseGraceSleep,
  onEvent,
  pauseGraceSeconds,
  forceTerminationGraceSeconds,
  unattended,
  debug,
}) {
  const { config, state } = loadAgentState(repoRoot);
  const providerAdapter = adapter ?? getProviderAdapter(config.provider);
  const startedAt = clock().toISOString();
  let activeState = state;
  let adoptingCooldown = false;
  const adoption = assessProjectCooldownAdoption(state);
  if (adoption.found) {
    writeAdoptedCooldownDebug(stderr, state, {
      debug,
      mode: 'project',
      action: adoption.action,
      reason: adoption.reason,
    });

    if (adoption.action === 'adopt') {
      adoptingCooldown = true;
      writeAdoptedCooldownMessage(stderr, state);
    } else if (adoption.action === 'ignore_stale') {
      writeStaleCooldownMessage(stderr, adoption.reason);
      activeState = transitionState(
        repoRoot,
        {
          status: 'checkpointed',
          mode: 'normal',
          next_resume_at: null,
          cooldown_reason: null,
          cooldown_detected_at: null,
          reset_time_provenance: null,
          interactive_shell_status: 'exited',
          interactive_resume_target: null,
          interactive_resume_target_provenance: null,
          last_tty_event: 'interactive_shell_exited',
        },
        'interactive_shell_exited',
        `stale interactive cooldown ignored: ${adoption.reason}`,
        startedAt,
      );
    }
  }

  transitionState(
    repoRoot,
    {
      interactive_shell_started_at: adoptingCooldown
        ? (activeState.interactive_shell_started_at ?? startedAt)
        : startedAt,
      usage_window_started_at: adoptingCooldown
        ? (activeState.usage_window_started_at ?? startedAt)
        : startedAt,
      interactive_shell_status: 'running',
      last_tty_event: 'interactive_shell_started',
    },
    'interactive_shell_started',
    'interactive shell started',
    startedAt,
  );

  const runs = [];
  let interactiveResumes = 0;
  let commandSpec = null;

  if (adoptingCooldown) {
    const resume = await prepareInteractiveResume({
      repoRoot,
      providerAdapter,
      stderr,
      clock,
      sleep,
      onEvent,
    });
    commandSpec = resume.commandSpec;
    interactiveResumes += 1;
  } else {
    commandSpec = providerAdapter.startSessionCommand({
      repoRoot,
      prompt,
      nonInteractive: false,
    });
  }

  while (true) {
    const result = await runInteractivePtyOnce({
      repoRoot,
      providerAdapter,
      commandSpec,
      ptyRunner,
      signal,
      stdin,
      stdout,
      stderr,
      onCooldown,
      streamDetector,
      cooldownRecorder,
      clock,
      sleep,
      pauseGraceSleep,
      pauseGraceSeconds,
      forceTerminationGraceSeconds,
      unattended,
      debug,
      mode: 'project',
      getStateStatusBeforeDetection: () => loadAgentState(repoRoot).state.status,
    });
    runs.push(result);

    if (!result.cooldown) {
      const latest = loadAgentState(repoRoot);
      const clearCooldown = latest.state.status === 'cooling_down' && interactiveResumes > 0;
      transitionState(
        repoRoot,
        {
          ...(clearCooldown
            ? {
                status: 'checkpointed',
                mode: 'normal',
                next_resume_at: null,
                cooldown_reason: null,
                cooldown_detected_at: null,
                reset_time_provenance: null,
              }
            : {}),
          interactive_shell_status: 'exited',
          last_tty_event: 'interactive_shell_exited',
        },
        'interactive_shell_exited',
        'interactive shell exited',
        clock().toISOString(),
      );
      return {
        ...result,
        mode: 'project_shell',
        repoRoot,
        runs,
        interactiveResumes,
        pauseConfirmed: runs.some((run) => run.pauseConfirmed),
        abortRequested: runs.some((run) => run.abortRequested),
      };
    }

    if (result.abortRequested || result.pauseGraceTimedOut || !result.pauseConfirmed) {
      transitionState(
        repoRoot,
        {
          interactive_shell_status: 'aborted',
          last_tty_event: 'interactive_shell_aborted',
        },
        'interactive_shell_aborted',
        pauseAbortReason(result),
        clock().toISOString(),
      );
      return { ...result, mode: 'project_shell', repoRoot, runs, interactiveResumes };
    }

    if (result.unattendedForcedTermination) {
      transitionState(
        repoRoot,
        {
          interactive_shell_status: 'cooldown_child_terminated',
          last_tty_event: 'unattended_pause_forced',
        },
        'unattended_pause_forced',
        'unattended mode forced Codex child termination after cooldown',
        clock().toISOString(),
      );
    }

    const latest = loadAgentState(repoRoot);
    const limitReason = interactiveLimitReason(latest.state, latest.config, clock());
    if (limitReason) {
      const limitedState = transitionState(
        repoRoot,
        {
          interactive_shell_status: 'aborted',
          last_tty_event: 'interactive_shell_aborted',
          cooldown_reason: limitReason,
        },
        'interactive_shell_aborted',
        limitReason,
        clock().toISOString(),
      );
      stderr?.write?.(`[continuity] Interactive watchdog stopped: ${limitReason}\n`);
      return {
        ...result,
        mode: 'project_shell',
        repoRoot,
        state: limitedState,
        runs,
        interactiveResumes,
        limitReached: true,
      };
    }

    const resume = await prepareInteractiveResume({
      repoRoot,
      providerAdapter,
      stderr,
      clock,
      sleep,
      onEvent,
    });
    commandSpec = resume.commandSpec;
    interactiveResumes += 1;
  }
}

async function runGlobalInteractiveShell({
  cwd,
  prompt,
  adapter,
  ptyRunner,
  signal,
  stdin,
  stdout,
  stderr,
  onCooldown,
  streamDetector,
  clock,
  sleep,
  pauseGraceSleep,
  onEvent,
  pauseGraceSeconds,
  forceTerminationGraceSeconds,
  unattended,
  debug,
  notice,
  globalStateDir,
}) {
  const providerAdapter = adapter ?? getProviderAdapter(DEFAULT_CONFIG.provider);
  const filePaths = globalShellPaths({ stateDir: globalStateDir });
  writeGlobalModeNotice(stderr, { notice });

  const loadedState = readGlobalShellState({ stateDir: globalStateDir, cwd });
  const adoptingCooldown = loadedState.status === 'cooling_down' && loadedState.cwd === cwd;
  if (adoptingCooldown) {
    assertAdoptableGlobalCooldown(loadedState);
    writeAdoptedCooldownDebug(stderr, loadedState, {
      debug,
      mode: 'global',
      action: 'adopt',
      reason: null,
    });
    writeAdoptedCooldownMessage(stderr, loadedState);
  }

  const startedAt = clock().toISOString();
  const startState = adoptingCooldown
    ? loadedState
    : makeInitialGlobalShellState({
        cwd,
        provider: providerAdapter.name ?? DEFAULT_CONFIG.provider,
        timestamp: startedAt,
      });
  writeGlobalShellState({
    stateDir: globalStateDir,
    state: {
      ...startState,
      usage_window_started_at: startState.usage_window_started_at ?? startedAt,
      status: adoptingCooldown ? startState.status : 'running',
      interactive_shell_status: adoptingCooldown ? startState.interactive_shell_status : 'running',
      last_tty_event: adoptingCooldown ? startState.last_tty_event : 'interactive_shell_started',
    },
    event: 'interactive_shell_started',
    reason: 'global interactive shell started',
    timestamp: startedAt,
  });

  const runs = [];
  let interactiveResumes = 0;
  let lastResumeTarget = null;
  let commandSpec = null;

  if (adoptingCooldown) {
    const resume = await prepareGlobalInteractiveResume({
      cwd,
      stateDir: globalStateDir,
      providerAdapter,
      stderr,
      clock,
      sleep,
      onEvent,
    });
    commandSpec = resume.commandSpec;
    lastResumeTarget = resume.target;
    interactiveResumes += 1;
  } else {
    commandSpec = providerAdapter.startSessionCommand({
      repoRoot: cwd,
      prompt,
      nonInteractive: false,
    });
  }

  while (true) {
    const result = await runInteractivePtyOnce({
      repoRoot: cwd,
      providerAdapter,
      commandSpec,
      ptyRunner,
      signal,
      stdin,
      stdout,
      stderr,
      onCooldown,
      streamDetector,
      cooldownRecorder: (event) =>
        recordGlobalInteractiveCooldown({
          cwd,
          stateDir: globalStateDir,
          adapter: event.adapter,
          cooldown: event.cooldown,
          text: event.text,
          now: event.now,
        }),
      clock,
      sleep,
      pauseGraceSleep,
      pauseGraceSeconds,
      forceTerminationGraceSeconds,
      unattended,
      debug,
      mode: 'global',
      getStateStatusBeforeDetection: () =>
        readGlobalShellState({ stateDir: globalStateDir, cwd }).status,
    });
    runs.push(result);

    if (!result.cooldown) {
      const latest = readGlobalShellState({ stateDir: globalStateDir, cwd });
      const resumeLastFailed =
        lastResumeTarget?.provenance === 'codex_last' &&
        typeof result.exitCode === 'number' &&
        result.exitCode !== 0;
      if (resumeLastFailed) {
        const failedState = writeGlobalShellState({
          stateDir: globalStateDir,
          state: {
            ...latest,
            status: 'failed',
          },
          event: 'interactive_shell_failed',
          reason: 'codex resume --last failed in global shell mode',
          timestamp: clock().toISOString(),
        });
        stderr?.write?.(
          '[continuity] codex resume --last failed in Global Shell Mode. Aborting best-effort resume.\n',
        );
        return {
          ...result,
          mode: 'global_shell',
          state: failedState,
          globalStatePath: filePaths.state,
          runs,
          interactiveResumes,
          resumeLastFailed: true,
        };
      }

      const exitedState = writeGlobalShellState({
        stateDir: globalStateDir,
        state: {
          ...latest,
          cwd,
          provider: providerAdapter.name ?? latest.provider,
          status: 'idle',
          next_resume_at: null,
          cooldown_detected_at: null,
          reset_time_provenance: null,
          interactive_shell_status: 'exited',
          last_tty_event: 'interactive_shell_exited',
        },
        event: 'interactive_shell_exited',
        reason: 'global interactive shell exited',
        timestamp: clock().toISOString(),
      });
      return {
        ...result,
        mode: 'global_shell',
        state: exitedState,
        globalStatePath: filePaths.state,
        runs,
        interactiveResumes,
        pauseConfirmed: runs.some((run) => run.pauseConfirmed),
        abortRequested: runs.some((run) => run.abortRequested),
      };
    }

    if (result.abortRequested || result.pauseGraceTimedOut || !result.pauseConfirmed) {
      const latest = readGlobalShellState({ stateDir: globalStateDir, cwd });
      const abortedState = writeGlobalShellState({
        stateDir: globalStateDir,
        state: {
          ...latest,
          status: latest.status === 'cooling_down' ? 'cooling_down' : 'aborted',
          interactive_shell_status: 'aborted',
          last_tty_event: 'interactive_shell_aborted',
        },
        event: 'interactive_shell_aborted',
        reason: pauseAbortReason(result),
        timestamp: clock().toISOString(),
      });
      return {
        ...result,
        mode: 'global_shell',
        state: abortedState,
        globalStatePath: filePaths.state,
        runs,
        interactiveResumes,
      };
    }

    if (result.unattendedForcedTermination) {
      const latest = readGlobalShellState({ stateDir: globalStateDir, cwd });
      writeGlobalShellState({
        stateDir: globalStateDir,
        state: {
          ...latest,
          status: 'cooling_down',
          interactive_shell_status: 'cooldown_child_terminated',
          last_tty_event: 'unattended_pause_forced',
        },
        event: 'unattended_pause_forced',
        reason: 'unattended mode forced Codex child termination after cooldown',
        timestamp: clock().toISOString(),
      });
    }

    const resume = await prepareGlobalInteractiveResume({
      cwd,
      stateDir: globalStateDir,
      providerAdapter,
      stderr,
      clock,
      sleep,
      onEvent,
    });
    commandSpec = resume.commandSpec;
    lastResumeTarget = resume.target;
    interactiveResumes += 1;
  }
}

async function runInteractivePtyOnce({
  repoRoot,
  providerAdapter,
  commandSpec,
  ptyRunner,
  signal,
  stdin,
  stdout,
  stderr,
  onCooldown,
  streamDetector,
  cooldownRecorder,
  clock,
  sleep,
  pauseGraceSleep,
  pauseGraceSeconds,
  forceTerminationGraceSeconds,
  unattended,
  debug,
  mode,
  getStateStatusBeforeDetection = null,
}) {
  let cooldownRecord = null;
  let waitingForPauseConfirmation = false;
  let pauseConfirmed = false;
  let abortRequested = false;
  let pauseGraceTimedOut = false;
  let unattendedPauseStarted = false;
  let unattendedForcedTermination = false;
  let ptyFinished = false;
  const detector =
    streamDetector ??
    createCooldownStreamDetector({
      adapter: providerAdapter,
      onCooldown: (event) => {
        const now = clock();
        const stateStatusBeforeDetection = getStateStatusBeforeDetection?.() ?? null;
        cooldownRecord = cooldownRecorder({
          repoRoot,
          adapter: providerAdapter,
          cooldown: event,
          text: event.normalizedText,
          now,
        });
        writeStreamCooldownDebug(stderr, {
          debug,
          mode,
          event,
          record: cooldownRecord,
          adapter: providerAdapter,
          now,
          stateStatusBeforeDetection,
        });
        writeWrapperMessage(stderr, cooldownRecord, { unattended });
        waitingForPauseConfirmation = !unattended;
        onCooldown?.({ ...event, record: cooldownRecord });
      },
    });

  const result = await ptyRunner(commandSpec, {
    signal,
    stdin,
    stdout,
    stderr,
    onData: (chunk, context) => {
      const hadCooldown = Boolean(cooldownRecord);
      detector.push(chunk);
      if (!hadCooldown && cooldownRecord && unattended) {
        unattendedPauseStarted = true;
        pauseConfirmed = true;
        context?.child?.kill?.('SIGINT');
        startUnattendedPauseTimer({
          context,
          stderr,
          sleep: pauseGraceSleep,
          pauseGraceSeconds,
          forceTerminationGraceSeconds,
          isFinished: () => ptyFinished,
          forceTerminated: () => {
            unattendedForcedTermination = true;
          },
        });
      }
    },
    onInput: (chunk, context) => {
      if (!waitingForPauseConfirmation) {
        return true;
      }

      if (chunk.includes('\u0003')) {
        abortRequested = true;
        context.child?.kill?.('SIGINT');
        stderr?.write?.('[continuity] Interactive wrapper aborted. State was preserved.\n');
        return false;
      }

      if (chunk.includes('\r') || chunk.includes('\n')) {
        pauseConfirmed = true;
        waitingForPauseConfirmation = false;
        context.child?.kill?.('SIGINT');
        stderr?.write?.('[continuity] Pausing Codex until the cooldown reset window.\n');
        startPauseGraceTimer({
          context,
          stderr,
          sleep: pauseGraceSleep,
          pauseGraceSeconds,
          isFinished: () => ptyFinished,
          timedOut: () => {
            pauseGraceTimedOut = true;
          },
        });
        return false;
      }

      return false;
    },
  });
  ptyFinished = true;
  const childExitedAfterCooldown = Boolean(
    cooldownRecord &&
    !pauseConfirmed &&
    !abortRequested &&
    !pauseGraceTimedOut &&
    !unattendedPauseStarted,
  );
  return {
    ...result,
    cooldown: cooldownRecord,
    pauseConfirmed: pauseConfirmed || childExitedAfterCooldown,
    childExitedAfterCooldown,
    abortRequested,
    pauseGraceTimedOut,
    unattendedPauseStarted,
    unattendedForcedTermination:
      unattendedForcedTermination || Boolean(result?.unattendedForcedTermination),
  };
}

function writeWrapperMessage(stderr, record, { unattended = false } = {}) {
  stderr?.write?.('[continuity] Cooldown detected from Codex output.\n');
  stderr?.write?.(`[continuity] Next resume at: ${record.nextResumeAt}\n`);
  if (unattended) {
    stderr?.write?.('[continuity] Unattended mode is enabled.\n');
    stderr?.write?.('[continuity] Pausing Codex automatically.\n');
    return;
  }

  stderr?.write?.('[continuity] Press Enter to pause and wait.\n');
  stderr?.write?.('[continuity] Press Ctrl-C to abort wrapper and preserve state.\n');
}

function writeAdoptedCooldownMessage(stderr, state) {
  stderr?.write?.('[continuity] Existing cooldown state found from previous run.\n');
  stderr?.write?.(`[continuity] Next resume at: ${state.next_resume_at}\n`);
  stderr?.write?.(
    '[continuity] Press Ctrl-C to abort and run `continuity status` if this looks stale.\n',
  );
}

function writeStaleCooldownMessage(stderr, reason) {
  stderr?.write?.(`[continuity] Existing cooldown state looks stale: ${reason}.\n`);
  stderr?.write?.('[continuity] Starting a fresh Codex TUI instead.\n');
}

function writeAdoptedCooldownDebug(stderr, state, { debug, mode, action, reason }) {
  if (!debug) {
    return;
  }

  writeDebugJson(stderr, {
    event: 'cooldown_detected',
    source: 'adopted_state',
    matched_text_excerpt: safeDebugExcerpt(state.cooldown_reason),
    matched_pattern: null,
    parsed_reset: state.next_resume_at ?? null,
    provenance: state.reset_time_provenance ?? null,
    mode,
    state_status_before_detection: state.status ?? null,
    session_id: state.current_session_id ?? null,
    adoption_action: action,
    adoption_reason: reason ?? null,
  });
}

function writeStreamCooldownDebug(
  stderr,
  { debug, mode, event, record, adapter, now, stateStatusBeforeDetection },
) {
  if (!debug) {
    return;
  }

  const parsed = adapter.parseResetTimeDetails?.(event.normalizedText, now) ?? null;
  writeDebugJson(stderr, {
    event: 'cooldown_detected',
    source: 'stream_detector',
    matched_text_excerpt: safeDebugExcerpt(event.matchedTextExcerpt ?? event.reason),
    matched_pattern: event.matchedPattern ?? null,
    parsed_reset: parsed?.resetAt?.toISOString?.() ?? null,
    provenance: record.resetTimeProvenance ?? parsed?.provenance ?? null,
    mode,
    state_status_before_detection: stateStatusBeforeDetection,
    session_id: record.state?.current_session_id ?? null,
  });
}

function writeDebugJson(stderr, payload) {
  stderr?.write?.(`${JSON.stringify(payload)}\n`);
}

function safeDebugExcerpt(text, maxChars = 200) {
  const compact = String(text ?? '')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n+/g, ' | ')
    .trim()
    .replace(/\b(?:sk|sess)-[A-Za-z0-9_-]{12,}\b/g, '[redacted]');

  return compact.length > maxChars ? `${compact.slice(0, maxChars - 3)}...` : compact;
}

function startPauseGraceTimer({ context, stderr, sleep, pauseGraceSeconds, isFinished, timedOut }) {
  Promise.resolve()
    .then(() => sleep(pauseGraceSeconds * 1000))
    .then(() => {
      if (isFinished()) {
        return;
      }
      timedOut();
      stderr?.write?.('[continuity] Codex did not exit after pause request.\n');
      stderr?.write?.('[continuity] State remains cooling_down.\n');
      stderr?.write?.('[continuity] Exit Codex manually, then rerun: continuity codex\n');
      context.finish?.({
        exitCode: null,
        signal: 'SIGINT',
        pauseGraceTimedOut: true,
      });
    })
    .catch(() => {
      if (isFinished()) {
        return;
      }
      timedOut();
      context.finish?.({
        exitCode: null,
        signal: 'SIGINT',
        pauseGraceTimedOut: true,
      });
    });
}

function startUnattendedPauseTimer({
  context,
  stderr,
  sleep,
  pauseGraceSeconds,
  forceTerminationGraceSeconds,
  isFinished,
  forceTerminated,
}) {
  Promise.resolve()
    .then(() => sleep(pauseGraceSeconds * 1000))
    .then(() => {
      if (isFinished()) {
        return null;
      }
      forceTerminated();
      stderr?.write?.('[continuity] Codex did not exit after unattended pause request.\n');
      stderr?.write?.('[continuity] Forcing Codex child termination.\n');
      context?.child?.kill?.('SIGTERM');
      return sleep(forceTerminationGraceSeconds * 1000);
    })
    .then((waitedForTerm) => {
      if (waitedForTerm === null || isFinished()) {
        return;
      }
      context?.child?.kill?.('SIGKILL');
      context?.finish?.({
        exitCode: null,
        signal: 'SIGKILL',
        unattendedForcedTermination: true,
      });
    })
    .catch(() => {
      if (isFinished()) {
        return;
      }
      forceTerminated();
      context?.child?.kill?.('SIGKILL');
      context?.finish?.({
        exitCode: null,
        signal: 'SIGKILL',
        unattendedForcedTermination: true,
      });
    });
}

function pauseAbortReason(result) {
  if (result.abortRequested) {
    return 'interactive shell aborted';
  }

  if (result.pauseGraceTimedOut) {
    return 'interactive cooldown pause grace timeout';
  }

  return 'interactive cooldown pause not confirmed';
}

function selectInteractiveResumeTarget(state) {
  if (state.current_session_id) {
    return {
      value: state.current_session_id,
      sessionId: state.current_session_id,
      provenance: 'explicit_session_id',
    };
  }

  return {
    value: '--last',
    sessionId: null,
    provenance: 'codex_last',
  };
}

async function prepareInteractiveResume({
  repoRoot,
  providerAdapter,
  stderr,
  clock,
  sleep,
  onEvent,
}) {
  const latest = loadAgentState(repoRoot);
  const limitReason = interactiveLimitReason(latest.state, latest.config, clock());
  if (limitReason) {
    throw new Error(limitReason);
  }

  await waitUntilTimestamp(latest.state.next_resume_at, {
    clock,
    sleep,
    heartbeatMs: latest.config.watch_heartbeat_minutes * 60 * 1000,
    onHeartbeat: (event) => {
      stderr?.write?.(`[continuity] Waiting: ${formatDuration(event.remainingMs)} remaining\n`);
      onEvent({ type: 'interactive_heartbeat', ...event });
    },
  });

  const afterWait = loadAgentState(repoRoot);
  const target = selectInteractiveResumeTarget(afterWait.state);
  transitionState(
    repoRoot,
    {
      watch_resume_count: afterWait.state.watch_resume_count + 1,
      interactive_shell_status: 'resuming',
      interactive_resume_target: target.value,
      interactive_resume_target_provenance: target.provenance,
      last_tty_event: 'interactive_shell_resuming',
    },
    'interactive_shell_resuming',
    `interactive shell resuming with ${target.value}`,
    clock().toISOString(),
  );
  stderr?.write?.(`[continuity] Resuming Codex session: ${target.value}\n`);
  onEvent({ type: 'interactive_resuming', target: target.value, provenance: target.provenance });

  return {
    target,
    commandSpec: providerAdapter.resumeSessionCommand({
      repoRoot,
      sessionId: target.sessionId,
      nonInteractive: false,
    }),
  };
}

async function prepareGlobalInteractiveResume({
  cwd,
  stateDir,
  providerAdapter,
  stderr,
  clock,
  sleep,
  onEvent,
}) {
  const latest = readGlobalShellState({ stateDir, cwd });
  assertAdoptableGlobalCooldown(latest);

  await waitUntilTimestamp(latest.next_resume_at, {
    clock,
    sleep,
    heartbeatMs: DEFAULT_CONFIG.watch_heartbeat_minutes * 60 * 1000,
    onHeartbeat: (event) => {
      stderr?.write?.(`[continuity] Waiting: ${formatDuration(event.remainingMs)} remaining\n`);
      onEvent({ type: 'interactive_heartbeat', ...event });
    },
  });

  const afterWait = readGlobalShellState({ stateDir, cwd });
  const target = selectInteractiveResumeTarget(afterWait);
  writeGlobalShellState({
    stateDir,
    state: {
      ...afterWait,
      status: 'resuming',
      interactive_shell_status: 'resuming',
      interactive_resume_target: target.value,
      interactive_resume_target_provenance: target.provenance,
      last_tty_event: 'interactive_shell_resuming',
    },
    event: 'interactive_shell_resuming',
    reason: `global interactive shell resuming with ${target.value}`,
    timestamp: clock().toISOString(),
  });

  if (target.provenance === 'codex_last') {
    stderr?.write?.('[continuity] Resuming Codex with codex resume --last (best effort).\n');
  } else {
    stderr?.write?.(`[continuity] Resuming Codex session: ${target.value}\n`);
  }
  onEvent({ type: 'interactive_resuming', target: target.value, provenance: target.provenance });

  return {
    target,
    commandSpec: providerAdapter.resumeSessionCommand({
      repoRoot: cwd,
      sessionId: target.sessionId,
      nonInteractive: false,
    }),
  };
}

function writeGlobalModeNotice(stderr, { notice = 'no_git' } = {}) {
  if (notice === 'uninitialized_repo') {
    stderr?.write?.(
      '[continuity] This git repository is not initialized for project continuity.\n',
    );
  } else if (notice === 'forced_global') {
    stderr?.write?.('[continuity] Global Shell Mode forced by --global.\n');
  } else {
    stderr?.write?.('[continuity] No git repository found.\n');
  }

  stderr?.write?.('[continuity] Starting Global Shell Mode.\n');
  if (notice === 'uninitialized_repo') {
    stderr?.write?.('[continuity] Run:\n');
    stderr?.write?.('[continuity]   continuity init --task-id <task-id>\n');
    stderr?.write?.('[continuity] to enable project continuity.\n');
  }
  stderr?.write?.('[continuity] Project handoff, git recovery, and .agent state are disabled.\n');
  stderr?.write?.('[continuity] Cooldown detection and best-effort Codex resume remain enabled.\n');
}

function assessProjectCooldownAdoption(state) {
  if (state.status !== 'cooling_down') {
    return { found: false, action: 'fresh', reason: null };
  }

  assertAdoptableInteractiveCooldown(state);

  if (!state.current_session_id) {
    return {
      found: true,
      action: 'ignore_stale',
      reason: 'missing current_session_id for project same-session resume',
    };
  }

  return { found: true, action: 'adopt', reason: null };
}

function assertAdoptableInteractiveCooldown(state) {
  if (!state.next_resume_at) {
    throw new Error('Cannot adopt interactive cooldown: missing next_resume_at');
  }

  if (Number.isNaN(Date.parse(state.next_resume_at))) {
    throw new Error(
      `Cannot adopt interactive cooldown: invalid next_resume_at ${state.next_resume_at}`,
    );
  }

  const hasInteractiveMetadata =
    state.last_event?.startsWith('interactive_') ||
    state.last_tty_event?.startsWith('interactive_') ||
    (state.interactive_shell_status !== undefined && state.interactive_shell_status !== null);
  if (!hasInteractiveMetadata) {
    throw new Error(
      'Cannot adopt cooling_down state with continuity codex; use continuity watch or continuity resume',
    );
  }
}

function assertAdoptableGlobalCooldown(state) {
  if (!state.next_resume_at) {
    throw new Error('Cannot adopt global shell cooldown: missing next_resume_at');
  }

  if (Number.isNaN(Date.parse(state.next_resume_at))) {
    throw new Error(
      `Cannot adopt global shell cooldown: invalid next_resume_at ${state.next_resume_at}`,
    );
  }
}

function interactiveLimitReason(state, config, now) {
  if (state.watch_resume_count >= config.max_cooldown_resumes) {
    return `max_cooldown_resumes reached: ${config.max_cooldown_resumes}`;
  }

  const startedMs = state.interactive_shell_started_at
    ? Date.parse(state.interactive_shell_started_at)
    : Number.NaN;
  if (!Number.isNaN(startedMs)) {
    const maxMs = config.max_watch_hours * 60 * 60 * 1000;
    if (now.getTime() - startedMs > maxMs) {
      return `max_watch_hours exceeded: ${config.max_watch_hours}`;
    }
  }

  return null;
}

async function waitUntilTimestamp(timestamp, { clock, sleep, heartbeatMs, onHeartbeat }) {
  const targetMs = Date.parse(timestamp);
  if (Number.isNaN(targetMs)) {
    throw new Error(`Invalid next_resume_at: ${timestamp}`);
  }

  while (targetMs > clock().getTime()) {
    const remainingMs = targetMs - clock().getTime();
    const sleepMs = heartbeatMs > 0 ? Math.min(remainingMs, heartbeatMs) : remainingMs;
    onHeartbeat?.({ nextResumeAt: timestamp, remainingMs });
    await sleep(sleepMs);
  }
}

function defaultSleep(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function formatDuration(milliseconds) {
  const totalMinutes = Math.ceil(Math.max(0, milliseconds) / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}
