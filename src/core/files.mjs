import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import {
  AGENT_DIR,
  CONFIG_FILE,
  DECISIONS_FILE,
  HANDOFF_FILE,
  NEXT_FILE,
  SESSIONS_FILE,
  SNAPSHOT_FILE,
  STATE_FILE,
} from './constants.mjs';

export function agentPath(repoRoot, ...parts) {
  return join(repoRoot, AGENT_DIR, ...parts);
}

export function ensureAgentDirectories(repoRoot) {
  for (const path of [
    agentPath(repoRoot),
    agentPath(repoRoot, 'handoffs'),
    agentPath(repoRoot, 'snapshots'),
    agentPath(repoRoot, 'logs'),
  ]) {
    mkdirSync(path, { recursive: true });
  }
}

export function readJsonFile(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function writeJsonFile(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function writeTextFile(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

export function appendJsonLine(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value)}\n`, { flag: 'a' });
}

export function paths(repoRoot) {
  return {
    agentDir: agentPath(repoRoot),
    config: agentPath(repoRoot, CONFIG_FILE),
    state: agentPath(repoRoot, STATE_FILE),
    handoff: agentPath(repoRoot, HANDOFF_FILE),
    next: agentPath(repoRoot, NEXT_FILE),
    decisions: agentPath(repoRoot, DECISIONS_FILE),
    snapshot: agentPath(repoRoot, SNAPSHOT_FILE),
    sessions: agentPath(repoRoot, SESSIONS_FILE),
  };
}
