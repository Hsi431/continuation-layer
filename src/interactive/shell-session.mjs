import { loadAgentState } from '../core/agent-state.mjs';
import { resolveRepoRoot } from '../core/git.mjs';
import { getProviderAdapter } from '../providers/adapter.mjs';
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
} = {}) {
  const repoRoot = resolveRepoRoot(cwd);
  const { config } = loadAgentState(repoRoot);
  const providerAdapter = adapter ?? getProviderAdapter(config.provider);
  const commandSpec = providerAdapter.startSessionCommand({
    repoRoot,
    prompt,
    nonInteractive: false,
  });
  const detector =
    streamDetector ??
    createCooldownStreamDetector({
      adapter: providerAdapter,
      onCooldown,
    });

  return ptyRunner(commandSpec, {
    signal,
    stdin,
    stdout,
    stderr,
    onData: (chunk) => detector.push(chunk),
  });
}
