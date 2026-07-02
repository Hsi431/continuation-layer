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
        onCooldown?.({ ...event, record: cooldownRecord });
      },
    });

  const result = await ptyRunner(commandSpec, {
    signal,
    stdin,
    stdout,
    stderr,
    onData: (chunk) => detector.push(chunk),
  });
  return { ...result, cooldown: cooldownRecord };
}

function writeWrapperMessage(stderr, record) {
  stderr?.write?.('[continuity] Cooldown detected.\n');
  stderr?.write?.(`[continuity] Next resume at: ${record.nextResumeAt}\n`);
}
