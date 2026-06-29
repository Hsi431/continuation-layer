import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function runCommand(commandSpec, { logPath = null } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(commandSpec.command, commandSpec.args, {
      cwd: commandSpec.cwd,
      env: { ...process.env, ...commandSpec.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let log = null;

    if (logPath) {
      mkdirSync(dirname(logPath), { recursive: true });
      log = createWriteStream(logPath, { flags: 'a' });
      log.write(`$ ${[commandSpec.command, ...commandSpec.args].join(' ')}\n`);
    }

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      log?.write(text);
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      log?.write(text);
    });

    child.on('error', (error) => {
      log?.end();
      reject(error);
    });

    child.on('close', (exitCode, signal) => {
      const result = {
        exitCode,
        signal,
        stdout,
        stderr,
        logPath,
      };

      if (log) {
        log.end(() => resolve(result));
      } else {
        resolve(result);
      }
    });
  });
}
