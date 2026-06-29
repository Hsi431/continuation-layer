import {
  DEFAULT_CONFIG,
  EVENT_VALUES,
  MODE_VALUES,
  PROVIDER_VALUES,
  STATUS_VALUES,
} from './constants.mjs';

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

  for (const key of ['current_session_id', 'parent_session_id', 'next_resume_at', 'cooldown_reason']) {
    if (state[key] !== null && typeof state[key] !== 'string') {
      pushTypeError(errors, 'state', key, 'a string or null');
    }
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
