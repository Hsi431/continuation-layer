import { execFileSync } from 'node:child_process';

export function runGit(args, cwd) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

export function resolveRepoRoot(cwd) {
  const root = runGit(['rev-parse', '--show-toplevel'], cwd);
  if (!root) {
    throw new Error('continuity must run inside a git repository');
  }
  return root;
}

export function readGitSnapshot(repoRoot) {
  const branch = runGit(['branch', '--show-current'], repoRoot) || 'unknown';
  const status = runGit(['status', '--short'], repoRoot);
  const diffStat = runGit(['diff', '--stat', '--no-color'], repoRoot);

  return {
    branch,
    status: status && status.length > 0 ? status : 'clean',
    diffStat: diffStat && diffStat.length > 0 ? diffStat : 'none',
  };
}
