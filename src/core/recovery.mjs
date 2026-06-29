import { existsSync, readFileSync, statSync } from 'node:fs';

import { paths } from './files.mjs';
import { runGit } from './git.mjs';

const UNMERGED_STATUS = Object.freeze(['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU']);

export function runRecoveryCheck({ repoRoot, config, now = new Date() }) {
  const filePaths = paths(repoRoot);
  const failures = [];
  const handoff = readRequiredText(filePaths.handoff, 'handoff', failures);
  const next = readRequiredText(filePaths.next, 'next', failures);
  const gitStatus = runGit(['status', '--short'], repoRoot);
  const gitDiff = runGit(['diff', '--no-color'], repoRoot);

  if (gitStatus === null) {
    failures.push('git status failed');
  } else if (hasUnmergedStatus(gitStatus)) {
    failures.push('git status contains unresolved conflicts');
  }

  if (gitDiff === null) {
    failures.push('git diff failed');
  }

  if (!extractNextAction(next)) {
    failures.push('.agent/NEXT.md has no next action');
  }

  if (config?.max_handoff_age_minutes > 0 && existsSync(filePaths.handoff)) {
    const ageMs = now.getTime() - statSync(filePaths.handoff).mtimeMs;
    if (ageMs > config.max_handoff_age_minutes * 60 * 1000) {
      failures.push('.agent/HANDOFF.md is stale');
    }
  }

  return {
    ok: failures.length === 0,
    failures,
    handoff,
    gitStatus: gitStatus ?? '',
    gitDiff: gitDiff ?? '',
  };
}

function readRequiredText(path, label, failures) {
  if (!existsSync(path)) {
    failures.push(`missing ${label} file`);
    return '';
  }

  const text = readFileSync(path, 'utf8');
  if (text.trim().length === 0) {
    failures.push(`empty ${label} file`);
  }

  return text;
}

function extractNextAction(text) {
  const match = String(text).match(/## Next Action\s+([\s\S]*?)(?:\n## |\s*$)/);
  return match?.[1]?.trim() ?? '';
}

function hasUnmergedStatus(status) {
  return String(status)
    .split('\n')
    .some((line) => UNMERGED_STATUS.includes(line.slice(0, 2)));
}
