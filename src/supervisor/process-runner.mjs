import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function runCommand(commandSpec, { logPath = null, signal: abortSignal = null } = {}) {
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

    const abort = () => {
      child.kill('SIGINT');
    };
    abortSignal?.addEventListener('abort', abort, { once: true });
    if (abortSignal?.aborted) {
      abort();
    }

    child.on('error', (error) => {
      abortSignal?.removeEventListener('abort', abort);
      log?.end();
      reject(error);
    });

    child.on('close', (exitCode, childSignal) => {
      abortSignal?.removeEventListener('abort', abort);
      const result = {
        exitCode,
        signal: childSignal,
        stdout,
        stderr,
        logPath,
        aborted: childSignal === 'SIGINT' && abortSignal?.aborted === true,
      };

      if (log) {
        log.end(() => resolve(result));
      } else {
        resolve(result);
      }
    });
  });
}
