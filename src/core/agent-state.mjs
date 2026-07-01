import { copyFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';

import { DEFAULT_CONFIG, HANDOFF_FILE, SNAPSHOT_FILE } from './constants.mjs';
import {
  appendJsonLine,
  ensureAgentDirectories,
  paths,
  readJsonFile,
  writeJsonFile,
  writeTextFile,
} from './files.mjs';
import { readGitSnapshot, resolveRepoRoot } from './git.mjs';
import {
  formatDecisions,
  formatContextHandoff,
  formatHandoff,
  formatCompletedHandoff,
  formatNewTaskNext,
  formatNext,
  formatSnapshot,
} from './templates.mjs';
import { assertValidConfig, assertValidState } from './validation.mjs';

const REQUIRED_AGENT_FILE_KEYS = Object.freeze([
  'config',
  'state',
  'handoff',
  'next',
  'decisions',
  'snapshot',
  'sessions',
]);

export function nowIso() {
  return new Date().toISOString();
}

export function makeTaskId(repoRoot, timestamp = nowIso()) {
  const repoName = basename(repoRoot).replace(/[^a-zA-Z0-9._-]+/g, '-');
  const suffix = timestamp.replace(/[-:.TZ]/g, '').slice(0, 14);
  return `${repoName}-${suffix}`;
}

export function makeInitialState({ repoRoot, provider, taskId, timestamp }) {
  return {
    task_id: taskId,
    provider,
    repo_path: repoRoot,
    status: 'idle',
    mode: 'normal',
    current_session_id: null,
    parent_session_id: null,
    current_handoff_path: `.agent/${HANDOFF_FILE}`,
    last_snapshot_path: `.agent/${SNAPSHOT_FILE}`,
    overnight_mode: false,
    auto_continue_after_handoff: false,
    next_resume_at: null,
    cooldown_reason: null,
    usage_window_started_at: null,
    cooldown_detected_at: null,
    reset_time_provenance: null,
    watch_started_at: null,
    watch_resume_count: 0,
    last_watch_event: null,
    last_event: 'task_created',
    created_at: timestamp,
    updated_at: timestamp,
  };
}

export function initAgent({ cwd = process.cwd(), provider = 'codex', taskId = null } = {}) {
  const repoRoot = resolveRepoRoot(cwd);
  const filePaths = paths(repoRoot);

  const hasState = existsSync(filePaths.state);
  const hasConfig = existsSync(filePaths.config);

  if (hasState && hasConfig) {
    const agent = loadAgentState(repoRoot);
    return {
      created: false,
      repoRoot,
      reason: 'existing_agent_state',
      state: agent.state,
    };
  }

  if (hasState || hasConfig) {
    throw new Error(`Refusing to initialize over partial ${filePaths.agentDir} state`);
  }

  if (existsSync(filePaths.agentDir) && readdirSync(filePaths.agentDir).length > 0) {
    throw new Error(`Refusing to initialize over non-empty ${filePaths.agentDir}`);
  }

  const timestamp = nowIso();
  const config = { ...DEFAULT_CONFIG, provider };
  const state = makeInitialState({
    repoRoot,
    provider,
    taskId: taskId ?? makeTaskId(repoRoot, timestamp),
    timestamp,
  });

  assertValidConfig(config);
  assertValidState(state);

  ensureAgentDirectories(repoRoot);
  writeJsonFile(filePaths.config, config);
  writeJsonFile(filePaths.state, state);
  writeTextFile(filePaths.handoff, formatHandoff(state, timestamp));
  writeTextFile(filePaths.next, formatNext());
  writeTextFile(filePaths.decisions, formatDecisions(timestamp));
  writeTextFile(filePaths.snapshot, buildSnapshotText(repoRoot, state, timestamp));
  appendEvent(repoRoot, state, 'task_created', 'continuity init');

  return {
    created: true,
    repoRoot,
    state,
  };
}

export function loadConfig(repoRoot) {
  const config = readJsonFile(paths(repoRoot).config);
  assertValidConfig(config);
  return config;
}

export function loadState(repoRoot) {
  const state = readJsonFile(paths(repoRoot).state);
  assertValidState(state);
  return state;
}

export function loadAgentState(repoRoot) {
  const filePaths = paths(repoRoot);
  const missing = missingRequiredAgentFiles(filePaths);
  if (missing.length > 0) {
    throw new Error(`Incomplete .agent state; missing: ${missing.join(', ')}`);
  }

  const config = loadConfig(repoRoot);
  const state = loadState(repoRoot);
  assertConfigStateMatch(config, state);

  return { config, state };
}

export function appendEvent(repoRoot, state, event, reason, timestamp = nowIso(), metadata = null) {
  appendJsonLine(paths(repoRoot).sessions, {
    timestamp,
    task_id: state.task_id,
    provider: state.provider,
    session_id: state.current_session_id,
    parent_session_id: state.parent_session_id,
    event,
    handoff_path: state.current_handoff_path,
    reason,
    ...(metadata && typeof metadata === 'object' ? metadata : {}),
  });
}

export function saveState(repoRoot, state) {
  assertValidState(state);
  writeJsonFile(paths(repoRoot).state, state);
}

export function transitionState(
  repoRoot,
  changes,
  event,
  reason,
  timestamp = nowIso(),
  metadata = null,
) {
  const { state } = loadAgentState(repoRoot);
  const nextState = {
    ...state,
    ...changes,
    last_event: event,
    updated_at: timestamp,
  };

  saveState(repoRoot, nextState);
  appendEvent(repoRoot, nextState, event, reason, timestamp, metadata);
  return nextState;
}

export function writeSnapshotForState(repoRoot, state, timestamp = nowIso(), metadata = null) {
  const filePaths = paths(repoRoot);
  writeTextFile(filePaths.snapshot, buildSnapshotText(repoRoot, state, timestamp, metadata));
  return filePaths.snapshot;
}

export function writeMechanicalSnapshot({ cwd = process.cwd(), reason = 'manual snapshot' } = {}) {
  const repoRoot = resolveRepoRoot(cwd);
  const filePaths = paths(repoRoot);
  const { state } = loadAgentState(repoRoot);
  const timestamp = nowIso();
  const nextState = {
    ...state,
    last_event: 'checkpoint_written',
    updated_at: timestamp,
  };

  assertValidState(nextState);
  writeSnapshotForState(repoRoot, nextState, timestamp);
  saveState(repoRoot, nextState);
  appendEvent(repoRoot, nextState, 'checkpoint_written', reason, timestamp);

  return {
    repoRoot,
    state: nextState,
    snapshotPath: filePaths.snapshot,
  };
}

export function setOvernightMode({
  cwd = process.cwd(),
  enabled,
  autoContinueAfterHandoff = enabled,
  timestamp = nowIso(),
} = {}) {
  if (typeof enabled !== 'boolean') {
    throw new Error('enabled must be a boolean');
  }

  const repoRoot = resolveRepoRoot(cwd);
  const filePaths = paths(repoRoot);
  const { config, state } = loadAgentState(repoRoot);
  const nextConfig = {
    ...config,
    overnight_mode: enabled,
    auto_continue_after_handoff: autoContinueAfterHandoff,
  };
  const nextState = {
    ...state,
    mode: enabled ? 'overnight' : state.mode === 'overnight' ? 'normal' : state.mode,
    overnight_mode: enabled,
    auto_continue_after_handoff: autoContinueAfterHandoff,
    last_event: enabled ? 'overnight_enabled' : 'overnight_disabled',
    updated_at: timestamp,
  };
  const reason = enabled ? 'overnight mode enabled' : 'overnight mode disabled';

  assertValidConfig(nextConfig);
  assertValidState(nextState);
  writeJsonFile(filePaths.config, nextConfig);
  saveState(repoRoot, nextState);
  appendEvent(repoRoot, nextState, nextState.last_event, reason, timestamp);

  return {
    repoRoot,
    config: nextConfig,
    state: nextState,
  };
}

export function completeTask({
  cwd = process.cwd(),
  reason = 'task completed',
  timestamp = nowIso(),
} = {}) {
  const repoRoot = resolveRepoRoot(cwd);
  const filePaths = paths(repoRoot);
  const { config, state } = loadAgentState(repoRoot);
  const archive = archiveCurrentTaskFiles(repoRoot, state.task_id, timestamp);
  const nextConfig = {
    ...config,
    overnight_mode: false,
    auto_continue_after_handoff: false,
  };
  const nextState = {
    ...state,
    status: 'completed',
    mode: 'normal',
    overnight_mode: false,
    auto_continue_after_handoff: false,
    next_resume_at: null,
    cooldown_reason: null,
    last_event: 'task_completed',
    updated_at: timestamp,
  };

  assertValidConfig(nextConfig);
  assertValidState(nextState);
  writeJsonFile(filePaths.config, nextConfig);
  saveState(repoRoot, nextState);
  writeTextFile(filePaths.handoff, formatCompletedHandoff({ state: nextState, timestamp }));
  writeSnapshotForState(repoRoot, nextState, timestamp);
  appendEvent(repoRoot, nextState, 'task_completed', reason, timestamp);

  return {
    repoRoot,
    state: nextState,
    archive,
  };
}

export function startNewTask({
  cwd = process.cwd(),
  provider = null,
  taskId = null,
  timestamp = nowIso(),
} = {}) {
  const repoRoot = resolveRepoRoot(cwd);
  const filePaths = paths(repoRoot);
  const { config, state } = loadAgentState(repoRoot);
  const archive = archiveCurrentTaskFiles(repoRoot, state.task_id, timestamp);
  const nextConfig = {
    ...config,
    provider: provider ?? config.provider,
    overnight_mode: false,
    auto_continue_after_handoff: false,
  };
  const nextState = makeInitialState({
    repoRoot,
    provider: nextConfig.provider,
    taskId: taskId ?? makeTaskId(repoRoot, timestamp),
    timestamp,
  });

  assertValidConfig(nextConfig);
  assertValidState(nextState);
  writeJsonFile(filePaths.config, nextConfig);
  saveState(repoRoot, nextState);
  writeTextFile(filePaths.handoff, formatHandoff(nextState, timestamp));
  writeTextFile(filePaths.next, formatNewTaskNext());
  writeTextFile(filePaths.snapshot, buildSnapshotText(repoRoot, nextState, timestamp));
  appendEvent(repoRoot, nextState, 'task_created', `new task from ${state.task_id}`, timestamp);

  return {
    repoRoot,
    state: nextState,
    archive,
  };
}

export function buildContinuityContext({ cwd = process.cwd(), source = 'session start' } = {}) {
  const repoRoot = resolveRepoRoot(cwd);
  const { state } = loadAgentState(repoRoot);
  const nextAction = readNextAction(paths(repoRoot).next);

  return [
    '# Continuity Context',
    '',
    `source: ${source}`,
    `task id: ${state.task_id}`,
    `provider: ${state.provider}`,
    `status: ${state.status}`,
    `mode: ${state.mode}`,
    `current session: ${state.current_session_id ?? 'none'}`,
    `parent session: ${state.parent_session_id ?? 'none'}`,
    `handoff: ${state.current_handoff_path}`,
    `snapshot: ${state.last_snapshot_path}`,
    `last event: ${state.last_event}`,
    `next action: ${nextAction ?? 'none'}`,
    '',
    'Read .agent/HANDOFF.md, .agent/NEXT.md, .agent/DECISIONS.md, git status, and git diff before editing.',
    'Prefer .agent durable state over compacted transcript summaries.',
  ].join('\n');
}

export function recordContextPressure({ cwd = process.cwd(), trigger = 'unknown' } = {}) {
  const repoRoot = resolveRepoRoot(cwd);
  const timestamp = nowIso();
  const pressureState = transitionState(
    repoRoot,
    {
      status: 'waiting_for_user',
      mode: 'context_handoff',
    },
    'context_pressure_detected',
    `pre-compact hook: ${trigger}`,
    timestamp,
  );
  const state = writeContextHandoffForState({
    repoRoot,
    state: pressureState,
    trigger: `pre-compact hook: ${trigger}`,
    timestamp,
  });

  writeSnapshotForState(repoRoot, state, timestamp);
  return { repoRoot, state };
}

export function writeContextHandoff({
  cwd = process.cwd(),
  trigger = 'manual continuation',
  timestamp = nowIso(),
} = {}) {
  const repoRoot = resolveRepoRoot(cwd);
  const { state } = loadAgentState(repoRoot);
  const handoffState = {
    ...state,
    status: 'waiting_for_user',
    mode: 'context_handoff',
    last_event: 'handoff_written',
    updated_at: timestamp,
  };

  const nextState = writeContextHandoffForState({
    repoRoot,
    state: handoffState,
    trigger,
    timestamp,
  });

  writeSnapshotForState(repoRoot, nextState, timestamp);
  return { repoRoot, state: nextState, handoffPath: paths(repoRoot).handoff };
}

export function recordCompaction({ cwd = process.cwd(), trigger = 'unknown' } = {}) {
  const repoRoot = resolveRepoRoot(cwd);
  const timestamp = nowIso();
  const state = transitionState(
    repoRoot,
    {
      mode: 'context_handoff',
    },
    'compaction_recorded',
    `post-compact hook: ${trigger}; prefer .agent durable state`,
    timestamp,
  );

  writeSnapshotForState(repoRoot, state, timestamp);
  return { repoRoot, state };
}

export function statusAgent({ cwd = process.cwd() } = {}) {
  const repoRoot = resolveRepoRoot(cwd);
  const { config, state } = loadAgentState(repoRoot);
  const nextAction = readNextAction(paths(repoRoot).next);
  const cooldownSeconds = secondsUntil(state.next_resume_at);

  return {
    repoRoot,
    taskId: state.task_id,
    provider: state.provider,
    status: state.status,
    mode: state.mode,
    currentSession: state.current_session_id,
    parentSession: state.parent_session_id,
    currentHandoff: state.current_handoff_path,
    nextAction,
    overnightMode: config.overnight_mode,
    autoContinueAfterHandoff: config.auto_continue_after_handoff,
    nextResumeAt: state.next_resume_at,
    cooldownDetectedAt: state.cooldown_detected_at,
    usageWindowStartedAt: state.usage_window_started_at,
    resetTimeProvenance: state.reset_time_provenance,
    watchStartedAt: state.watch_started_at,
    watchResumeCount: state.watch_resume_count,
    lastWatchEvent: state.last_watch_event,
    cooldownSeconds,
    watchdogRunning: 'unknown_no_lock',
  };
}

function buildSnapshotText(repoRoot, state, timestamp, metadata = null) {
  const git = readGitSnapshot(repoRoot);
  return formatSnapshot({
    timestamp,
    branch: git.branch,
    gitStatus: git.status,
    gitDiffStat: git.diffStat,
    state,
    logPath: metadata?.logPath ?? null,
  });
}

function writeContextHandoffForState({ repoRoot, state, trigger, timestamp }) {
  const git = readGitSnapshot(repoRoot);
  const nextAction = readNextAction(paths(repoRoot).next);
  const nextState = {
    ...state,
    last_event: 'handoff_written',
    updated_at: timestamp,
  };

  saveState(repoRoot, nextState);
  appendEvent(repoRoot, nextState, 'handoff_written', trigger, timestamp);
  writeTextFile(
    paths(repoRoot).handoff,
    formatContextHandoff({
      state: nextState,
      timestamp,
      trigger,
      branch: git.branch,
      gitStatus: git.status,
      gitDiffStat: git.diffStat,
      nextAction,
    }),
  );

  return nextState;
}

function archiveCurrentTaskFiles(repoRoot, taskId, timestamp) {
  ensureAgentDirectories(repoRoot);
  const filePaths = paths(repoRoot);
  const archiveId = `${safeFilePart(timestamp)}-${safeFilePart(taskId)}`;
  const handoffArchive = join(filePaths.handoffsDir, `${archiveId}.md`);
  const snapshotArchive = join(filePaths.snapshotsDir, `${archiveId}.md`);

  if (existsSync(filePaths.handoff)) {
    copyFileSync(filePaths.handoff, handoffArchive);
  }

  if (existsSync(filePaths.snapshot)) {
    copyFileSync(filePaths.snapshot, snapshotArchive);
  }

  return {
    handoff: handoffArchive,
    snapshot: snapshotArchive,
  };
}

function safeFilePart(value) {
  return (
    String(value)
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'unknown'
  );
}

function readNextAction(path) {
  if (!existsSync(path)) {
    return null;
  }

  const text = readFileSync(path, 'utf8');
  const match = text.match(/## Next Action\s+([\s\S]*?)(?:\n## |\s*$)/);
  return match ? match[1].trim() : null;
}

function missingRequiredAgentFiles(filePaths) {
  return REQUIRED_AGENT_FILE_KEYS.filter((key) => !existsSync(filePaths[key])).map(
    (key) => filePaths[key],
  );
}

function assertConfigStateMatch(config, state) {
  const mismatches = [];

  for (const key of ['provider', 'overnight_mode', 'auto_continue_after_handoff']) {
    if (config[key] !== state[key]) {
      mismatches.push(key);
    }
  }

  if (mismatches.length > 0) {
    throw new Error(`Config/state mismatch: ${mismatches.join(', ')}`);
  }
}

function secondsUntil(timestamp) {
  if (!timestamp) {
    return null;
  }

  const value = Date.parse(timestamp);
  if (Number.isNaN(value)) {
    return null;
  }

  return Math.max(0, Math.ceil((value - Date.now()) / 1000));
}
