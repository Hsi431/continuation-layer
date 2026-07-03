import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { DEFAULT_CONFIG } from '../core/constants.mjs';
import { appendJsonLine, writeJsonFile } from '../core/files.mjs';
import { calculateNextResumePlan } from '../supervisor/supervisor.mjs';

export const GLOBAL_SHELL_STATE_FILE = 'global-shell-state.json';
export const GLOBAL_SHELL_SESSIONS_FILE = 'global-shell-sessions.jsonl';

export function resolveGlobalShellStateDir({ env = process.env, homeDir = homedir() } = {}) {
  const xdgStateHome = env.XDG_STATE_HOME?.trim();
  if (xdgStateHome) {
    return join(xdgStateHome, 'continuation-layer');
  }

  return join(homeDir, '.local', 'state', 'continuation-layer');
}

export function globalShellPaths({ stateDir = null } = {}) {
  const dir = stateDir ?? resolveGlobalShellStateDir();
  return {
    dir,
    state: join(dir, GLOBAL_SHELL_STATE_FILE),
    sessions: join(dir, GLOBAL_SHELL_SESSIONS_FILE),
  };
}

export function makeInitialGlobalShellState({
  cwd,
  provider = DEFAULT_CONFIG.provider,
  timestamp = new Date().toISOString(),
} = {}) {
  return {
    schema_version: 1,
    mode: 'global_shell',
    cwd,
    provider,
    status: 'idle',
    current_session_id: null,
    next_resume_at: null,
    usage_window_started_at: null,
    cooldown_detected_at: null,
    reset_time_provenance: null,
    interactive_shell_status: null,
    interactive_resume_target: null,
    interactive_resume_target_provenance: null,
    last_tty_event: null,
    updated_at: timestamp,
  };
}

export function readGlobalShellState({ stateDir = null, cwd = process.cwd() } = {}) {
  const filePaths = globalShellPaths({ stateDir });
  if (!existsSync(filePaths.state)) {
    return makeInitialGlobalShellState({ cwd });
  }

  const state = JSON.parse(readFileSync(filePaths.state, 'utf8'));
  return {
    ...makeInitialGlobalShellState({
      cwd: state.cwd ?? cwd,
      provider: state.provider ?? DEFAULT_CONFIG.provider,
      timestamp: state.updated_at ?? new Date().toISOString(),
    }),
    ...state,
    schema_version: 1,
    mode: 'global_shell',
  };
}

export function writeGlobalShellState({
  stateDir = null,
  state,
  event = null,
  reason = null,
  timestamp = new Date().toISOString(),
  metadata = null,
} = {}) {
  const filePaths = globalShellPaths({ stateDir });
  const nextState = {
    ...state,
    schema_version: 1,
    mode: 'global_shell',
    updated_at: timestamp,
  };

  writeJsonFile(filePaths.state, nextState);
  if (event) {
    appendJsonLine(filePaths.sessions, {
      timestamp,
      mode: 'global_shell',
      cwd: nextState.cwd,
      provider: nextState.provider,
      session_id: nextState.current_session_id,
      event,
      reason,
      next_resume_at: nextState.next_resume_at,
      reset_time_provenance: nextState.reset_time_provenance,
      interactive_resume_target: nextState.interactive_resume_target,
      interactive_resume_target_provenance: nextState.interactive_resume_target_provenance,
      interactive_shell_status: nextState.interactive_shell_status,
      last_tty_event: nextState.last_tty_event,
      ...(metadata && typeof metadata === 'object' ? metadata : {}),
    });
  }

  return nextState;
}

export function recordGlobalInteractiveCooldown({
  cwd,
  stateDir = null,
  adapter,
  cooldown,
  text,
  now = new Date(),
} = {}) {
  const existing = readGlobalShellState({ stateDir, cwd });
  const cooldownDetectedAt = now.toISOString();
  const resumePlan = calculateNextResumePlan({
    adapter,
    text,
    now,
    defaultSeconds: DEFAULT_CONFIG.cooldown_default_seconds,
    bufferSeconds: DEFAULT_CONFIG.cooldown_buffer_seconds,
    usageWindowStartedAt: existing.usage_window_started_at,
    cooldownDetectedAt,
  });
  const nextResumeAt = resumePlan.nextResumeAt.toISOString();
  const sessionId = adapter.extractSessionId(text);
  const reason = cooldown?.reason ?? 'global interactive cooldown detected';
  const state = writeGlobalShellState({
    stateDir,
    state: {
      ...makeInitialGlobalShellState({
        cwd,
        provider: adapter.name ?? DEFAULT_CONFIG.provider,
        timestamp: cooldownDetectedAt,
      }),
      ...(existing.cwd === cwd ? existing : {}),
      cwd,
      provider: adapter.name ?? existing.provider ?? DEFAULT_CONFIG.provider,
      status: 'cooling_down',
      current_session_id: sessionId,
      next_resume_at: nextResumeAt,
      cooldown_detected_at: cooldownDetectedAt,
      reset_time_provenance: resumePlan.resetTimeProvenance,
      interactive_shell_status: 'cooling_down',
      interactive_resume_target: null,
      interactive_resume_target_provenance: null,
      last_tty_event: 'interactive_cooldown_detected',
    },
    event: 'interactive_cooldown_detected',
    reason,
    timestamp: cooldownDetectedAt,
    metadata: {
      source: 'global_shell',
      cooldown_detected_at: cooldownDetectedAt,
      next_resume_at: nextResumeAt,
      reset_time_provenance: resumePlan.resetTimeProvenance,
    },
  });

  return {
    status: 'cooling_down',
    state,
    snapshotPath: null,
    cooldownDetectedAt,
    nextResumeAt,
    resetTimeProvenance: resumePlan.resetTimeProvenance,
  };
}
