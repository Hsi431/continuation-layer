import { loadAgentState, transitionState, writeSnapshotForState } from '../core/agent-state.mjs';
import { calculateNextResumePlan } from '../supervisor/supervisor.mjs';

export function recordInteractiveCooldown({
  repoRoot,
  adapter,
  cooldown,
  text,
  now = new Date(),
  logPath = null,
} = {}) {
  const { config, state } = loadAgentState(repoRoot);
  const cooldownDetectedAt = now.toISOString();
  const resumePlan = calculateNextResumePlan({
    adapter,
    text,
    now,
    defaultSeconds: config.cooldown_default_seconds,
    bufferSeconds: config.cooldown_buffer_seconds,
    usageWindowStartedAt: state.usage_window_started_at,
    cooldownDetectedAt,
  });
  const nextResumeAt = resumePlan.nextResumeAt.toISOString();
  const sessionId = adapter.extractSessionId(text) ?? state.current_session_id;
  const reason = cooldown?.reason ?? 'interactive cooldown detected';
  const nextState = transitionState(
    repoRoot,
    {
      status: 'cooling_down',
      mode: 'cooldown_resume',
      current_session_id: sessionId,
      next_resume_at: nextResumeAt,
      cooldown_reason: reason,
      cooldown_detected_at: cooldownDetectedAt,
      reset_time_provenance: resumePlan.resetTimeProvenance,
    },
    'interactive_cooldown_detected',
    reason,
    cooldownDetectedAt,
    {
      source: 'interactive_shell',
      cooldown_detected_at: cooldownDetectedAt,
      next_resume_at: nextResumeAt,
      reset_time_provenance: resumePlan.resetTimeProvenance,
    },
  );
  const snapshotPath = writeSnapshotForState(repoRoot, nextState, cooldownDetectedAt, {
    logPath,
  });

  return {
    status: 'cooling_down',
    state: nextState,
    snapshotPath,
    cooldownDetectedAt,
    nextResumeAt,
    resetTimeProvenance: resumePlan.resetTimeProvenance,
  };
}
