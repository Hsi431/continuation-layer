export const STATUS_VALUES = Object.freeze([
  'idle',
  'running',
  'checkpointed',
  'cooling_down',
  'ready_for_continuation',
  'waiting_for_user',
  'continuing',
  'completed',
  'failed',
]);

export const MODE_VALUES = Object.freeze([
  'normal',
  'cooldown_resume',
  'context_handoff',
  'overnight',
]);

export const EVENT_VALUES = Object.freeze([
  'task_created',
  'session_started',
  'checkpoint_written',
  'cooldown_detected',
  'cooldown_resumed',
  'context_pressure_detected',
  'handoff_written',
  'continuation_requested',
  'continuation_started',
  'continuation_aborted',
  'overnight_enabled',
  'overnight_disabled',
  'task_completed',
  'task_failed',
]);

export const PROVIDER_VALUES = Object.freeze(['codex', 'claude-code']);

export const DEFAULT_CONFIG = Object.freeze({
  provider: 'codex',
  overnight_mode: false,
  auto_continue_after_handoff: false,
  cooldown_default_seconds: 18000,
  cooldown_buffer_seconds: 300,
  block_auto_compact: true,
  handoff_required_before_continuation: true,
  require_clean_recovery_check: true,
  checkpoint_policy: 'stage_boundary',
  max_handoff_age_minutes: 120,
  log_retention_days: 14,
});

export const AGENT_DIR = '.agent';
export const CONFIG_FILE = 'config.json';
export const STATE_FILE = 'state.json';
export const HANDOFF_FILE = 'HANDOFF.md';
export const NEXT_FILE = 'NEXT.md';
export const DECISIONS_FILE = 'DECISIONS.md';
export const SNAPSHOT_FILE = 'AUTO_SNAPSHOT.md';
export const SESSIONS_FILE = 'sessions.jsonl';
