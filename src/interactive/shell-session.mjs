import { loadAgentState, transitionState } from '../core/agent-state.mjs';
import { resolveRepoRoot } from '../core/git.mjs';
import { getProviderAdapter } from '../providers/adapter.mjs';
import { recordInteractiveCooldown } from './cooldown-recorder.mjs';
import { runPtyCommand } from './pty-runner.mjs';
import { createCooldownStreamDetector } from './stream-detector.mjs';

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
  onEvent = () => {},
} = {}) {
  const repoRoot = resolveRepoRoot(cwd);
  const { config, state } = loadAgentState(repoRoot);
  const providerAdapter = adapter ?? getProviderAdapter(config.provider);
  if (state.status === 'cooling_down') {
    assertAdoptableInteractiveCooldown(state);
  }

  const startedAt = clock().toISOString();
  transitionState(
    repoRoot,
    {
      interactive_shell_started_at: state.interactive_shell_started_at ?? startedAt,
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

  if (state.status === 'cooling_down') {
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
        runs,
        interactiveResumes,
        pauseConfirmed: runs.some((run) => run.pauseConfirmed),
        abortRequested: runs.some((run) => run.abortRequested),
      };
    }

    if (result.abortRequested || !result.pauseConfirmed) {
      transitionState(
        repoRoot,
        {
          interactive_shell_status: 'aborted',
          last_tty_event: 'interactive_shell_aborted',
        },
        'interactive_shell_aborted',
        result.abortRequested
          ? 'interactive shell aborted'
          : 'interactive cooldown pause not confirmed',
        clock().toISOString(),
      );
      return { ...result, runs, interactiveResumes };
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
}) {
  let cooldownRecord = null;
  let waitingForPauseConfirmation = false;
  let pauseConfirmed = false;
  let abortRequested = false;
  const detector =
    streamDetector ??
    createCooldownStreamDetector({
      adapter: providerAdapter,
      onCooldown: (event) => {
        cooldownRecord = cooldownRecorder({
          repoRoot,
          adapter: providerAdapter,
          cooldown: event,
          text: event.normalizedText,
          now: clock(),
        });
        writeWrapperMessage(stderr, cooldownRecord);
        waitingForPauseConfirmation = true;
        onCooldown?.({ ...event, record: cooldownRecord });
      },
    });

  const result = await ptyRunner(commandSpec, {
    signal,
    stdin,
    stdout,
    stderr,
    onData: (chunk) => detector.push(chunk),
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
        return false;
      }

      return false;
    },
  });
  return { ...result, cooldown: cooldownRecord, pauseConfirmed, abortRequested };
}

function writeWrapperMessage(stderr, record) {
  stderr?.write?.('[continuity] Cooldown detected.\n');
  stderr?.write?.(`[continuity] Next resume at: ${record.nextResumeAt}\n`);
  stderr?.write?.('[continuity] Press Enter to pause and wait.\n');
  stderr?.write?.('[continuity] Press Ctrl-C to abort wrapper and preserve state.\n');
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

function assertAdoptableInteractiveCooldown(state) {
  if (!state.next_resume_at) {
    throw new Error('Cannot adopt interactive cooldown: missing next_resume_at');
  }

  const hasInteractiveMetadata =
    state.last_event?.startsWith('interactive_') ||
    state.last_tty_event?.startsWith('interactive_') ||
    (state.interactive_shell_status !== undefined && state.interactive_shell_status !== null);
  if (!hasInteractiveMetadata) {
    throw new Error(
      'Cannot adopt cooling_down state with continuity shell; use continuity watch or continuity resume',
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
