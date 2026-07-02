import {
  DEFAULT_CONFIG,
  EVENT_VALUES,
  MODE_VALUES,
  PROVIDER_VALUES,
  RESET_TIME_PROVENANCE_VALUES,
  STATUS_VALUES,
} from './constants.mjs';

const INTERACTIVE_SHELL_STATUS_VALUES = Object.freeze([
  'idle',
  'running',
  'cooling_down',
  'waiting_for_resume',
  'resuming',
  'exited',
  'aborted',
  'failed',
]);

const INTERACTIVE_RESUME_TARGET_PROVENANCE_VALUES = Object.freeze([
  'explicit_session_id',
  'codex_last',
  'unknown',
]);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isIsoDate(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function pushTypeError(errors, objectName, key, expected) {
  errors.push(`${objectName}.${key} must be ${expected}`);
}

export function validateConfig(config) {
  const errors = [];

  if (!isPlainObject(config)) {
    return ['config must be an object'];
  }

  for (const key of Object.keys(DEFAULT_CONFIG)) {
    if (!(key in config)) {
      errors.push(`config.${key} is required`);
    }
  }

  if (!PROVIDER_VALUES.includes(config.provider)) {
    errors.push(`config.provider must be one of: ${PROVIDER_VALUES.join(', ')}`);
  }

  for (const key of [
    'overnight_mode',
    'auto_continue_after_handoff',
    'block_auto_compact',
    'handoff_required_before_continuation',
    'require_clean_recovery_check',
  ]) {
    if (typeof config[key] !== 'boolean') {
      pushTypeError(errors, 'config', key, 'a boolean');
    }
  }

  for (const key of [
    'cooldown_default_seconds',
    'cooldown_buffer_seconds',
    'max_handoff_age_minutes',
    'log_retention_days',
    'max_cooldown_resumes',
    'max_watch_hours',
    'watch_heartbeat_minutes',
  ]) {
    if (!Number.isInteger(config[key]) || config[key] < 0) {
      pushTypeError(errors, 'config', key, 'a non-negative integer');
    }
  }

  if (typeof config.checkpoint_policy !== 'string' || config.checkpoint_policy.length === 0) {
    pushTypeError(errors, 'config', 'checkpoint_policy', 'a non-empty string');
  }

  return errors;
}

export function validateState(state) {
  const errors = [];

  if (!isPlainObject(state)) {
    return ['state must be an object'];
  }

  const requiredStringFields = [
    'task_id',
    'provider',
    'repo_path',
    'status',
    'mode',
    'current_handoff_path',
    'last_snapshot_path',
    'last_event',
    'created_at',
    'updated_at',
  ];

  for (const key of requiredStringFields) {
    if (typeof state[key] !== 'string' || state[key].length === 0) {
      pushTypeError(errors, 'state', key, 'a non-empty string');
    }
  }

  if (!PROVIDER_VALUES.includes(state.provider)) {
    errors.push(`state.provider must be one of: ${PROVIDER_VALUES.join(', ')}`);
  }

  if (!STATUS_VALUES.includes(state.status)) {
    errors.push(`state.status must be one of: ${STATUS_VALUES.join(', ')}`);
  }

  if (!MODE_VALUES.includes(state.mode)) {
    errors.push(`state.mode must be one of: ${MODE_VALUES.join(', ')}`);
  }

  if (!EVENT_VALUES.includes(state.last_event)) {
    errors.push(`state.last_event must be one of: ${EVENT_VALUES.join(', ')}`);
  }

  for (const key of ['overnight_mode', 'auto_continue_after_handoff']) {
    if (typeof state[key] !== 'boolean') {
      pushTypeError(errors, 'state', key, 'a boolean');
    }
  }

  for (const key of [
    'current_session_id',
    'parent_session_id',
    'next_resume_at',
    'cooldown_reason',
    'usage_window_started_at',
    'cooldown_detected_at',
    'reset_time_provenance',
    'watch_started_at',
    'last_watch_event',
  ]) {
    if (state[key] !== null && typeof state[key] !== 'string') {
      pushTypeError(errors, 'state', key, 'a string or null');
    }
  }

  for (const key of [
    'interactive_shell_started_at',
    'interactive_shell_pid',
    'interactive_shell_status',
    'interactive_resume_target',
    'interactive_resume_target_provenance',
    'last_tty_event',
    'last_detected_cooldown_text_hash',
  ]) {
    if (state[key] !== undefined && state[key] !== null && typeof state[key] !== 'string') {
      pushTypeError(errors, 'state', key, 'a string or null');
    }
  }

  if (!Number.isInteger(state.watch_resume_count) || state.watch_resume_count < 0) {
    pushTypeError(errors, 'state', 'watch_resume_count', 'a non-negative integer');
  }

  if (!isIsoDate(state.created_at)) {
    pushTypeError(errors, 'state', 'created_at', 'an ISO timestamp');
  }

  if (!isIsoDate(state.updated_at)) {
    pushTypeError(errors, 'state', 'updated_at', 'an ISO timestamp');
  }

  if (state.next_resume_at !== null && !isIsoDate(state.next_resume_at)) {
    pushTypeError(errors, 'state', 'next_resume_at', 'an ISO timestamp or null');
  }

  for (const key of [
    'usage_window_started_at',
    'cooldown_detected_at',
    'watch_started_at',
    'interactive_shell_started_at',
  ]) {
    if (state[key] !== undefined && state[key] !== null && !isIsoDate(state[key])) {
      pushTypeError(errors, 'state', key, 'an ISO timestamp or null');
    }
  }

  if (
    state.reset_time_provenance !== null &&
    !RESET_TIME_PROVENANCE_VALUES.includes(state.reset_time_provenance)
  ) {
    errors.push(
      `state.reset_time_provenance must be one of: ${RESET_TIME_PROVENANCE_VALUES.join(', ')}`,
    );
  }

  if (state.last_watch_event !== null && !EVENT_VALUES.includes(state.last_watch_event)) {
    errors.push(`state.last_watch_event must be one of: ${EVENT_VALUES.join(', ')}`);
  }

  if (
    state.interactive_shell_status !== undefined &&
    state.interactive_shell_status !== null &&
    !INTERACTIVE_SHELL_STATUS_VALUES.includes(state.interactive_shell_status)
  ) {
    errors.push(
      `state.interactive_shell_status must be one of: ${INTERACTIVE_SHELL_STATUS_VALUES.join(', ')}`,
    );
  }

  if (
    state.interactive_resume_target_provenance !== undefined &&
    state.interactive_resume_target_provenance !== null &&
    !INTERACTIVE_RESUME_TARGET_PROVENANCE_VALUES.includes(
      state.interactive_resume_target_provenance,
    )
  ) {
    errors.push(
      `state.interactive_resume_target_provenance must be one of: ${INTERACTIVE_RESUME_TARGET_PROVENANCE_VALUES.join(', ')}`,
    );
  }

  return errors;
}

export function assertValidConfig(config) {
  const errors = validateConfig(config);
  if (errors.length > 0) {
    throw new Error(`Invalid config:\n- ${errors.join('\n- ')}`);
  }
}

export function assertValidState(state) {
  const errors = validateState(state);
  if (errors.length > 0) {
    throw new Error(`Invalid state:\n- ${errors.join('\n- ')}`);
  }
}
