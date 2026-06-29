import { join } from 'node:path';

import {
  loadAgentState,
  transitionState,
  writeContextHandoff,
  writeSnapshotForState,
} from '../core/agent-state.mjs';
import { paths } from '../core/files.mjs';
import { resolveRepoRoot } from '../core/git.mjs';
import { runRecoveryCheck } from '../core/recovery.mjs';
import { getProviderAdapter } from '../providers/adapter.mjs';
import { runCommand } from './process-runner.mjs';

export async function startManagedSession({
  cwd = process.cwd(),
  prompt = '',
  adapter = null,
  runner = runCommand,
  now = new Date(),
} = {}) {
  const repoRoot = resolveRepoRoot(cwd);
  const { config, state } = loadAgentState(repoRoot);
  const providerAdapter = adapter ?? getProviderAdapter(config.provider);
  const timestamp = now.toISOString();

  const runningState = transitionState(repoRoot, {
    status: 'running',
    mode: 'normal',
  }, 'session_started', 'supervisor start', timestamp);

  const commandSpec = providerAdapter.startSessionCommand({ repoRoot, prompt, nonInteractive: true });
  const result = await runProviderCommand({
    runner,
    commandSpec,
    logPath: makeLogPath(repoRoot, 'start', timestamp),
    repoRoot,
    state: runningState,
    failureReason: 'provider session failed to start',
    now,
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

  const prompt = providerAdapter.makeResumePrompt({ state, snapshotPath: state.last_snapshot_path });
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

  if (!confirmed) {
    return {
      status: 'waiting_for_user',
      state: handoff.state,
      confirmationRequired: true,
      continuationStarted: false,
    };
  }

  const recovery = recoveryCheck({ repoRoot, config, now });
  if (!recovery.ok) {
    const reason = `recovery check failed: ${recovery.failures.join('; ')}`;
    const failedState = transitionState(repoRoot, {
      status: 'failed',
      mode: 'context_handoff',
      cooldown_reason: reason,
    }, 'continuation_aborted', reason, now.toISOString());
    writeSnapshotForState(repoRoot, failedState, now.toISOString());

    return {
      status: 'failed',
      state: failedState,
      confirmationRequired: false,
      continuationStarted: false,
      recovery,
    };
  }

  const { state } = loadAgentState(repoRoot);
  const parentSessionId = state.current_session_id;
  const continuationPrompt = [
    providerAdapter.makeContinuationPrompt({ state }),
    prompt ? `User continuation prompt: ${prompt}` : null,
  ].filter(Boolean).join(' ');
  const commandSpec = providerAdapter.startContinuationSessionCommand({
    repoRoot,
    sessionId: parentSessionId,
    prompt: continuationPrompt,
  });
  const continuingState = transitionState(repoRoot, {
    status: 'continuing',
    mode: 'context_handoff',
    parent_session_id: parentSessionId,
  }, 'continuation_started', 'child continuation session started', now.toISOString());

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
    recovery,
  };
}

export function makeLogPath(repoRoot, kind, timestamp = new Date().toISOString()) {
  const safe = timestamp.replace(/[:.]/g, '-');
  return join(paths(repoRoot).logsDir, `${safe}-${kind}.log`);
}

async function runProviderCommand({ runner, commandSpec, logPath, repoRoot, state, failureReason, now }) {
  try {
    return await runner(commandSpec, { logPath });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      exitCode: null,
      signal: null,
      stdout: '',
      stderr: message,
      logPath,
      spawnError: error,
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

  if (cooldown.matched) {
    const nextAt = calculateNextResumeAt({
      adapter,
      text: output,
      now,
      defaultSeconds: config.cooldown_default_seconds,
      bufferSeconds: config.cooldown_buffer_seconds,
    }).toISOString();
    const nextState = transitionState(repoRoot, {
      status: 'cooling_down',
      mode: 'cooldown_resume',
      current_session_id: sessionId,
      next_resume_at: nextAt,
      cooldown_reason: cooldown.reason,
    }, 'cooldown_detected', cooldown.reason ?? 'cooldown detected', now.toISOString());
    writeSnapshotForState(repoRoot, nextState, now.toISOString());

    return {
      status: 'cooling_down',
      state: nextState,
      result,
      nextResumeAt: nextAt,
    };
  }

  if (result.exitCode === 0) {
    const nextState = transitionState(repoRoot, {
      status: 'checkpointed',
      mode: 'normal',
      current_session_id: sessionId,
      next_resume_at: null,
      cooldown_reason: null,
    }, successEvent, successReason, now.toISOString());

    return {
      status: 'checkpointed',
      state: nextState,
      result,
    };
  }

  const nextState = transitionState(repoRoot, {
    status: 'failed',
    mode: 'normal',
    current_session_id: sessionId,
    cooldown_reason: result.stderr || failureReason,
  }, 'task_failed', failureReason, now.toISOString());
  writeSnapshotForState(repoRoot, nextState, now.toISOString());

  return {
    status: 'failed',
    state: nextState,
    result,
  };
}

function calculateNextResumeAt({ adapter, text, now, defaultSeconds, bufferSeconds }) {
  const parsed = adapter.parseResetTime(text, now);
  const base = parsed ?? new Date(now.getTime() + defaultSeconds * 1000);
  return new Date(base.getTime() + bufferSeconds * 1000);
}
