#!/usr/bin/env node
import {
  initAgent,
  statusAgent,
  writeMechanicalSnapshot,
} from '../src/core/agent-state.mjs';

function parseArgs(argv) {
  const args = [...argv];
  const command = args.shift() ?? 'help';
  const options = { json: false };

  while (args.length > 0) {
    const arg = args.shift();
    if (arg === '--json') {
      options.json = true;
    } else if (arg === '--task-id') {
      options.taskId = args.shift();
    } else if (arg === '--provider') {
      options.provider = args.shift();
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return { command, options };
}

function printHelp() {
  console.log(`Usage: continuity <command> [options]

Commands:
  init                 Initialize .agent in the current git repo
  status [--json]      Show current durable state
  snapshot             Write .agent/AUTO_SNAPSHOT.md

Options:
  --task-id <id>       Task id for init
  --provider <name>    Provider for init; default codex
  --json               Machine-readable status output
`);
}

function printStatus(status) {
  console.log(`task id: ${status.taskId}`);
  console.log(`provider: ${status.provider}`);
  console.log(`status: ${status.status}`);
  console.log(`mode: ${status.mode}`);
  console.log(`current session: ${status.currentSession ?? 'none'}`);
  console.log(`parent session: ${status.parentSession ?? 'none'}`);
  console.log(`current handoff: ${status.currentHandoff}`);
  console.log(`next action: ${status.nextAction ?? 'none'}`);
  console.log(`overnight mode: ${status.overnightMode}`);
  console.log(`auto continue after handoff: ${status.autoContinueAfterHandoff}`);
  console.log(`cooldown countdown seconds: ${status.cooldownSeconds ?? 'none'}`);
}

function main() {
  const { command, options } = parseArgs(process.argv.slice(2));

  if (command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  if (command === 'init') {
    const result = initAgent({
      provider: options.provider ?? 'codex',
      taskId: options.taskId ?? null,
    });
    console.log(result.created ? `initialized: ${result.repoRoot}` : `already initialized: ${result.repoRoot}`);
    return;
  }

  if (command === 'status') {
    const status = statusAgent();
    if (options.json) {
      console.log(JSON.stringify(status, null, 2));
    } else {
      printStatus(status);
    }
    return;
  }

  if (command === 'snapshot') {
    const result = writeMechanicalSnapshot();
    console.log(`snapshot written: ${result.snapshotPath}`);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
