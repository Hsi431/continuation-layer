import { loadAgentState } from '../core/agent-state.mjs';
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
} = {}) {
  const repoRoot = resolveRepoRoot(cwd);
  const { config } = loadAgentState(repoRoot);
  const providerAdapter = adapter ?? getProviderAdapter(config.provider);
  const commandSpec = providerAdapter.startSessionCommand({
    repoRoot,
    prompt,
    nonInteractive: false,
  });
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
