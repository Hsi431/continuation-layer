import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import {
  loadAgentState,
  transitionState,
  writeContextHandoff,
  writeSnapshotForState,
} from '../core/agent-state.mjs';
import { paths } from '../core/files.mjs';
import { resolveRepoRoot } from '../core/git.mjs';
import { RECOVERY_MODES, runRecoveryCheck } from '../core/recovery.mjs';
import { getProviderAdapter } from '../providers/adapter.mjs';
import { runCommand } from './process-runner.mjs';

export async function startManagedSession({
  cwd = process.cwd(),
  prompt = '',
  adapter = null,
  runner = runCommand,
  now = new Date(),
  signal = null,
  mode = 'normal',
} = {}) {
  const repoRoot = resolveRepoRoot(cwd);
  const { config, state } = loadAgentState(repoRoot);
  const providerAdapter = adapter ?? getProviderAdapter(config.provider);
  const timestamp = now.toISOString();

  const runningState = transitionState(
    repoRoot,
    {
      status: 'running',
      mode,
    },
    'session_started',
    'supervisor start',
    timestamp,
  );

  const commandSpec = providerAdapter.startSessionCommand({
    repoRoot,
    prompt,
    nonInteractive: true,
  });
  const result = await runProviderCommand({
    runner,
    commandSpec,
    logPath: makeLogPath(repoRoot, 'start', timestamp),
    repoRoot,
    state: runningState,
    failureReason: 'provider session failed to start',
    now,
    signal,
  });
  return handleProviderResult({
    repoRoot,
    config,
    state: runningState,
    adapter: providerAdapter,
    result,
    successReason: 'provider session exited successfully',
    failureReason: 'provider session failed',
    now,
  });
}

export async function resumeManagedSession({
  cwd = process.cwd(),
  adapter = null,
  runner = runCommand,
  now = new Date(),
  allowEarly = false,
  signal = null,
} = {}) {
  const repoRoot = resolveRepoRoot(cwd);
  const { config, state } = loadAgentState(repoRoot);
  const providerAdapter = adapter ?? getProviderAdapter(config.provider);

  if (state.status !== 'cooling_down') {
    throw new Error(`Cannot resume cooldown from state: ${state.status}`);
  }

  if (!allowEarly && state.next_resume_at && Date.parse(state.next_resume_at) > now.getTime()) {
    return {
      resumed: false,
      waiting: true,
      nextResumeAt: state.next_resume_at,
    };
  }

  const prompt = providerAdapter.makeResumePrompt({
    state,
    snapshotPath: state.last_snapshot_path,
  });
  const commandSpec = providerAdapter.resumeSessionCommand({
    repoRoot,
    sessionId: state.current_session_id,
    prompt,
    nonInteractive: true,
  });

  const result = await runProviderCommand({
    runner,
    commandSpec,
    logPath: makeLogPath(repoRoot, 'resume', now.toISOString()),
    repoRoot,
    state,
    failureReason: 'cooldown resume failed to start',
    now,
    signal,
  });
  const handled = await handleProviderResult({
    repoRoot,
    config,
    state,
    adapter: providerAdapter,
    result,
    successReason: 'cooldown resumed',
    failureReason: 'cooldown resume failed',
    now,
    successEvent: 'cooldown_resumed',
  });

  return {
    ...handled,
    resumed: true,
    waiting: false,
  };
}

export async function watchManagedSession({
  cwd = process.cwd(),
  prompt = '',
  adapter = null,
  runner = runCommand,
  clock = () => new Date(),
  sleep = defaultSleep,
  onEvent = () => {},
  signal = null,
  recoveryCheck = runRecoveryCheck,
} = {}) {
  const repoRoot = resolveRepoRoot(cwd);
  const { config, state } = loadAgentState(repoRoot);
  const providerAdapter = adapter ?? getProviderAdapter(config.provider);
  const startedAt = clock().toISOString();
  const adoptingCooldown = state.status === 'cooling_down';

  if (!adoptingCooldown && prompt.trim().length === 0) {
    throw new Error('watch requires a prompt unless adopting existing cooling_down state');
  }

  const watchState = transitionState(
    repoRoot,
    {
      mode: 'watch',
      usage_window_started_at: state.usage_window_started_at ?? startedAt,
      watch_started_at: startedAt,
      watch_resume_count: 0,
      last_watch_event: 'watch_started',
    },
    'watch_started',
    'watchdog started',
    startedAt,
  );
  onEvent({ type: 'watch_started', state: watchState });

  let lastRecovery = null;
  let outcome = adoptingCooldown
    ? {
        status: 'cooling_down',
        state: watchState,
        adoptedCooldown: true,
      }
    : await startManagedSession({
        cwd: repoRoot,
        prompt,
        adapter: providerAdapter,
        runner,
        now: clock(),
        signal,
        mode: 'watch',
      });

  if (outcome.status === 'aborted' || signal?.aborted) {
    return abortWatch({
      repoRoot,
      reason: 'watchdog interrupted',
      timestamp: clock().toISOString(),
    });
  }

  while (outcome.status === 'cooling_down') {
    const { config: currentConfig, state: cooldownState } = loadAgentState(repoRoot);
    const limit = watchLimitReason(cooldownState, currentConfig, clock());
    if (limit) {
      return limitWatch({ repoRoot, reason: limit, timestamp: clock().toISOString(), outcome });
    }

    if (!cooldownState.current_session_id) {
      return abortWatch({
        repoRoot,
        reason: 'missing session id for same-session cooldown resume',
        timestamp: clock().toISOString(),
        outcome,
      });
    }

    if (!cooldownState.next_resume_at) {
      return abortWatch({
        repoRoot,
        reason: 'missing next_resume_at for cooldown watchdog',
        timestamp: clock().toISOString(),
        outcome,
      });
    }

    const waitMs = millisecondsUntil(cooldownState.next_resume_at, clock());
    transitionState(
      repoRoot,
      {
        last_watch_event: 'watch_sleeping',
      },
      'watch_sleeping',
      `watchdog waiting until ${cooldownState.next_resume_at}`,
      clock().toISOString(),
      {
        next_resume_at: cooldownState.next_resume_at,
        reset_time_provenance: cooldownState.reset_time_provenance,
        wait_seconds: Math.ceil(waitMs / 1000),
      },
    );
    onEvent({
      type: 'cooldown_detected',
      state: cooldownState,
      nextResumeAt: cooldownState.next_resume_at,
      resetTimeProvenance: cooldownState.reset_time_provenance,
      waitMs,
    });

    try {
      await waitUntil(cooldownState.next_resume_at, {
        clock,
        sleep,
        signal,
        heartbeatMs: currentConfig.watch_heartbeat_minutes * 60 * 1000,
        onHeartbeat: (heartbeat) => onEvent({ type: 'heartbeat', ...heartbeat }),
      });
    } catch (error) {
      if (signal?.aborted) {
        return abortWatch({
          repoRoot,
          reason: 'watchdog interrupted',
          timestamp: clock().toISOString(),
          outcome,
        });
      }
      throw error;
    }

    if (signal?.aborted) {
      return abortWatch({
        repoRoot,
        reason: 'watchdog interrupted',
        timestamp: clock().toISOString(),
        outcome,
      });
    }

    const { config: resumeConfig, state: resumeState } = loadAgentState(repoRoot);
    const resumeLimit = watchLimitReason(resumeState, resumeConfig, clock());
    if (resumeLimit) {
      return limitWatch({
        repoRoot,
        reason: resumeLimit,
        timestamp: clock().toISOString(),
        outcome,
      });
    }

    if (!resumeState.current_session_id) {
      return abortWatch({
        repoRoot,
        reason: 'missing session id for same-session cooldown resume',
        timestamp: clock().toISOString(),
        outcome,
      });
    }

    if (!resumeState.next_resume_at) {
      return abortWatch({
        repoRoot,
        reason: 'missing next_resume_at for cooldown watchdog',
        timestamp: clock().toISOString(),
        outcome,
      });
    }

    const recovery = recoveryCheck({
      repoRoot,
      config: resumeConfig,
      now: clock(),
      mode: RECOVERY_MODES.COOLDOWN_RESUME,
      state: resumeState,
    });
    lastRecovery = recovery;
    if (!recovery.ok) {
      return abortWatch({
        repoRoot,
        reason: `recovery check failed: ${recovery.failures.join('; ')}`,
        timestamp: clock().toISOString(),
        outcome: { ...outcome, recovery },
      });
    }

    const resumeCount = resumeState.watch_resume_count + 1;
    transitionState(
      repoRoot,
      {
        mode: 'watch',
        watch_resume_count: resumeCount,
        last_watch_event: 'watch_resuming',
      },
      'watch_resuming',
      `watchdog automatic resume ${resumeCount}`,
      clock().toISOString(),
      {
        watch_resume_count: resumeCount,
        session_id: resumeState.current_session_id,
      },
    );
    onEvent({
      type: 'watch_resuming',
      resumeCount,
      sessionId: resumeState.current_session_id,
    });

    outcome = {
      ...(await resumeManagedSession({
        cwd: repoRoot,
        adapter: providerAdapter,
        runner,
        now: clock(),
        allowEarly: true,
        signal,
      })),
      adoptedCooldown: adoptingCooldown,
      recovery: lastRecovery,
    };

    if (outcome.status === 'aborted' || signal?.aborted) {
      return abortWatch({
        repoRoot,
        reason: 'watchdog interrupted',
        timestamp: clock().toISOString(),
        outcome,
      });
    }
  }

  return stopWatch({
    repoRoot,
    reason:
      outcome.status === 'checkpointed'
        ? 'watchdog completed provider workflow'
        : 'watchdog stopped after provider failure',
    timestamp: clock().toISOString(),
    outcome,
  });
}

export async function continueManagedSession({
  cwd = process.cwd(),
  adapter = null,
  runner = runCommand,
  now = new Date(),
  confirmed = false,
  prompt = '',
  recoveryCheck = runRecoveryCheck,
} = {}) {
  const repoRoot = resolveRepoRoot(cwd);
  const { config } = loadAgentState(repoRoot);
  const providerAdapter = adapter ?? getProviderAdapter(config.provider);
  const handoff = writeContextHandoff({
    cwd: repoRoot,
    trigger: 'continuation requested',
    timestamp: now.toISOString(),
  });
  const autoContinue = config.overnight_mode && config.auto_continue_after_handoff;
  const autoContinued = !confirmed && autoContinue;

  if (!confirmed && !autoContinue) {
    return {
      status: 'waiting_for_user',
      state: handoff.state,
      confirmationRequired: true,
      continuationStarted: false,
      autoContinued: false,
    };
  }

  const recovery = recoveryCheck({
    repoRoot,
    config,
    now,
    mode: RECOVERY_MODES.STRICT_CONTINUATION,
  });
  if (!recovery.ok) {
    const reason = `recovery check failed: ${recovery.failures.join('; ')}`;
    const failedState = transitionState(
      repoRoot,
      {
        status: 'failed',
        mode: 'context_handoff',
        cooldown_reason: reason,
      },
      'continuation_aborted',
      reason,
      now.toISOString(),
    );
    writeSnapshotForState(repoRoot, failedState, now.toISOString());

    return {
      status: 'failed',
      state: failedState,
      confirmationRequired: false,
      continuationStarted: false,
      autoContinued,
      recovery,
    };
  }

  const { state } = loadAgentState(repoRoot);
  const parentSessionId = state.current_session_id;
  if (autoContinued && !parentSessionId) {
    const reason = 'recovery check failed: missing parent session id for overnight continuation';
    const failedState = transitionState(
      repoRoot,
      {
        status: 'failed',
        mode: 'overnight',
        cooldown_reason: reason,
      },
      'continuation_aborted',
      reason,
      now.toISOString(),
    );
    writeSnapshotForState(repoRoot, failedState, now.toISOString());

    return {
      status: 'failed',
      state: failedState,
      confirmationRequired: false,
      continuationStarted: false,
      autoContinued,
      recovery: {
        ...recovery,
        ok: false,
        failures: [...recovery.failures, 'missing parent session id for overnight continuation'],
      },
    };
  }

  const continuationPrompt = [
    providerAdapter.makeContinuationPrompt({ state }),
    prompt ? `User continuation prompt: ${prompt}` : null,
  ]
    .filter(Boolean)
    .join(' ');
  const commandSpec = providerAdapter.startContinuationSessionCommand({
    repoRoot,
    sessionId: parentSessionId,
    prompt: continuationPrompt,
  });
  const continuingState = transitionState(
    repoRoot,
    {
      status: 'continuing',
      mode: autoContinued ? 'overnight' : 'context_handoff',
      parent_session_id: parentSessionId,
    },
    'continuation_started',
    autoContinued
      ? 'overnight child continuation session started'
      : 'child continuation session started',
    now.toISOString(),
  );

  const result = await runProviderCommand({
    runner,
    commandSpec,
    logPath: makeLogPath(repoRoot, 'continue', now.toISOString()),
    repoRoot,
    state: continuingState,
    failureReason: 'child continuation failed to start',
    now,
  });
  const handled = await handleProviderResult({
    repoRoot,
    config,
    state: continuingState,
    adapter: providerAdapter,
    result,
    successReason: 'child continuation exited successfully',
    failureReason: 'child continuation failed',
    now,
  });

  return {
    ...handled,
    confirmationRequired: false,
    continuationStarted: true,
    autoContinued,
    recovery,
  };
}

export function makeLogPath(repoRoot, kind, timestamp = new Date().toISOString()) {
  const safe = timestamp.replace(/[:.]/g, '-');
  return join(paths(repoRoot).logsDir, `${safe}-${kind}.log`);
}

async function runProviderCommand({
  runner,
  commandSpec,
  logPath,
  repoRoot,
  state,
  failureReason,
  now,
  signal = null,
}) {
  try {
    return await runner(commandSpec, { logPath, signal });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      exitCode: null,
      signal: null,
      stdout: '',
      stderr: message,
      logPath,
      spawnError: error,
      aborted: signal?.aborted === true,
    };
  }
}

async function handleProviderResult({
  repoRoot,
  config,
  state,
  adapter,
  result,
  successReason,
  failureReason,
  now,
  successEvent = 'checkpoint_written',
}) {
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  const sessionId = adapter.extractSessionId(output) ?? state.current_session_id;
  const cooldown = adapter.detectCooldownError(output);

  if (result.aborted) {
    return {
      status: 'aborted',
      state,
      result,
    };
  }

  if (cooldown.matched) {
    const cooldownDetectedAt = now.toISOString();
    const resumePlan = calculateNextResumePlan({
      adapter,
      text: output,
      now,
      defaultSeconds: config.cooldown_default_seconds,
      bufferSeconds: config.cooldown_buffer_seconds,
      usageWindowStartedAt: state.usage_window_started_at,
      cooldownDetectedAt,
    });
    const nextAt = resumePlan.nextResumeAt.toISOString();
    const nextState = transitionState(
      repoRoot,
      {
        status: 'cooling_down',
        mode: 'cooldown_resume',
        current_session_id: sessionId,
        next_resume_at: nextAt,
        cooldown_reason: cooldown.reason,
        cooldown_detected_at: cooldownDetectedAt,
        reset_time_provenance: resumePlan.resetTimeProvenance,
      },
      'cooldown_detected',
      cooldown.reason ?? 'cooldown detected',
      cooldownDetectedAt,
      {
        log_path: result.logPath,
        cooldown_detected_at: cooldownDetectedAt,
        next_resume_at: nextAt,
        reset_time_provenance: resumePlan.resetTimeProvenance,
      },
    );
    writeSnapshotForState(repoRoot, nextState, cooldownDetectedAt, { logPath: result.logPath });

    return {
      status: 'cooling_down',
      state: nextState,
      result,
      nextResumeAt: nextAt,
      resetTimeProvenance: resumePlan.resetTimeProvenance,
    };
  }

  if (result.exitCode === 0) {
    const nextState = transitionState(
      repoRoot,
      {
        status: 'checkpointed',
        mode: 'normal',
        current_session_id: sessionId,
        next_resume_at: null,
        cooldown_reason: null,
        cooldown_detected_at: null,
        reset_time_provenance: null,
      },
      successEvent,
      successReason,
      now.toISOString(),
    );

    return {
      status: 'checkpointed',
      state: nextState,
      result,
    };
  }

  const nextState = transitionState(
    repoRoot,
    {
      status: 'failed',
      mode: 'normal',
      current_session_id: sessionId,
      cooldown_reason: result.stderr || failureReason,
    },
    'task_failed',
    failureReason,
    now.toISOString(),
  );
  writeSnapshotForState(repoRoot, nextState, now.toISOString());

  return {
    status: 'failed',
    state: nextState,
    result,
  };
}

export function calculateNextResumePlan({
  adapter,
  text,
  now,
  defaultSeconds,
  bufferSeconds,
  usageWindowStartedAt = null,
  cooldownDetectedAt = null,
}) {
  const parsed =
    typeof adapter.parseResetTimeDetails === 'function'
      ? adapter.parseResetTimeDetails(text, now)
      : legacyResetDetails(adapter.parseResetTime(text, now));
  const bufferMs = bufferSeconds * 1000;

  if (parsed?.resetAt instanceof Date && !Number.isNaN(parsed.resetAt.getTime())) {
    return {
      nextResumeAt: new Date(parsed.resetAt.getTime() + bufferMs),
      resetTimeProvenance: parsed.provenance ?? 'provider_reset_at',
    };
  }

  const usageWindowMs = usageWindowStartedAt ? Date.parse(usageWindowStartedAt) : Number.NaN;
  if (!Number.isNaN(usageWindowMs)) {
    return {
      nextResumeAt: new Date(usageWindowMs + defaultSeconds * 1000 + bufferMs),
      resetTimeProvenance: 'usage_window_anchor',
    };
  }

  const detectedMs = cooldownDetectedAt ? Date.parse(cooldownDetectedAt) : now.getTime();
  const fallbackMs = Number.isNaN(detectedMs) ? now.getTime() : detectedMs;
  return {
    nextResumeAt: new Date(fallbackMs + defaultSeconds * 1000 + bufferMs),
    resetTimeProvenance: 'cooldown_detected_fallback',
  };
}

function legacyResetDetails(resetAt) {
  if (!(resetAt instanceof Date) || Number.isNaN(resetAt.getTime())) {
    return null;
  }

  return {
    resetAt,
    provenance: 'provider_reset_at',
  };
}

async function waitUntil(
  timestamp,
  { clock, sleep, signal = null, heartbeatMs = 0, onHeartbeat = () => {} },
) {
  const targetMs = Date.parse(timestamp);
  if (Number.isNaN(targetMs)) {
    throw new Error(`Invalid next_resume_at: ${timestamp}`);
  }

  while (targetMs > clock().getTime()) {
    if (signal?.aborted) {
      throw new Error('watchdog aborted');
    }

    const remainingMs = targetMs - clock().getTime();
    const sleepMs = heartbeatMs > 0 ? Math.min(remainingMs, heartbeatMs) : remainingMs;
    onHeartbeat({ nextResumeAt: timestamp, remainingMs });
    await sleep(sleepMs, { signal });
  }
}

function defaultSleep(milliseconds, { signal = null } = {}) {
  return delay(milliseconds, undefined, { signal });
}

function millisecondsUntil(timestamp, now) {
  const targetMs = Date.parse(timestamp);
  if (Number.isNaN(targetMs)) {
    return 0;
  }

  return Math.max(0, targetMs - now.getTime());
}

function watchLimitReason(state, config, now) {
  if (state.watch_resume_count >= config.max_cooldown_resumes) {
    return `max_cooldown_resumes reached: ${config.max_cooldown_resumes}`;
  }

  const startedMs = state.watch_started_at ? Date.parse(state.watch_started_at) : Number.NaN;
  if (!Number.isNaN(startedMs)) {
    const maxWatchMs = config.max_watch_hours * 60 * 60 * 1000;
    if (maxWatchMs > 0 && now.getTime() - startedMs > maxWatchMs) {
      return `max_watch_hours exceeded: ${config.max_watch_hours}`;
    }
  }

  return null;
}

function stopWatch({ repoRoot, reason, timestamp, outcome = {} }) {
  const nextState = transitionState(
    repoRoot,
    {
      last_watch_event: 'watch_stopped',
    },
    'watch_stopped',
    reason,
    timestamp,
  );

  return {
    ...outcome,
    status: outcome.status ?? nextState.status,
    state: nextState,
    watchStopped: true,
  };
}

function limitWatch({ repoRoot, reason, timestamp, outcome = {} }) {
  const nextState = transitionState(
    repoRoot,
    {
      last_watch_event: 'watch_limit_reached',
    },
    'watch_limit_reached',
    reason,
    timestamp,
  );

  return {
    ...outcome,
    status: 'watch_limit_reached',
    state: nextState,
    watchStopped: true,
    limitReached: true,
  };
}

function abortWatch({ repoRoot, reason, timestamp, outcome = {} }) {
  const { state } = loadAgentState(repoRoot);
  const nextStatus =
    state.status === 'cooling_down' || state.status === 'failed'
      ? state.status
      : 'waiting_for_user';
  const nextState = transitionState(
    repoRoot,
    {
      status: nextStatus,
      last_watch_event: 'watch_aborted',
    },
    'watch_aborted',
    reason,
    timestamp,
  );

  return {
    ...outcome,
    status: 'watch_aborted',
    state: nextState,
    watchStopped: true,
    aborted: true,
  };
}
