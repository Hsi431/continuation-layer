import { loadAgentState } from '../core/agent-state.mjs';
import { resolveRepoRoot } from '../core/git.mjs';
import { getProviderAdapter } from '../providers/adapter.mjs';
import { runPtyCommand } from './pty-runner.mjs';

export async function runInteractiveShell({
  cwd = process.cwd(),
  prompt = '',
  adapter = null,
  ptyRunner = runPtyCommand,
  signal = null,
  stdin = process.stdin,
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  const repoRoot = resolveRepoRoot(cwd);
  const { config } = loadAgentState(repoRoot);
  const providerAdapter = adapter ?? getProviderAdapter(config.provider);
  const commandSpec = providerAdapter.startSessionCommand({
    repoRoot,
    prompt,
    nonInteractive: false,
  });

  return ptyRunner(commandSpec, { signal, stdin, stdout, stderr });
}
