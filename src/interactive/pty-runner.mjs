export const TTY_REQUIRED_MESSAGE =
  'continuity codex requires an interactive TTY.\nUse continuity watch for non-interactive tasks.';

export async function runPtyCommand(commandSpec, options = {}) {
  const {
    stdin = process.stdin,
    stdout = process.stdout,
    stderr = process.stderr,
    env = process.env,
    signal: abortSignal = null,
    ptyFactory = null,
    resizeEmitter = process,
    onData = null,
    onInput: onInputHook = null,
  } = options;

  assertInteractiveTty({ stdin, stdout });

  const factory = ptyFactory ?? (await loadNodePty());
  const size = terminalSize(stdout);
  let child = null;
  let restored = false;
  let finished = false;
  let dataSubscription = null;
  let exitSubscription = null;

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      if (restored) {
        return;
      }
      restored = true;
      stdin.removeListener?.('data', handleInput);
      resizeEmitter.removeListener?.('SIGWINCH', onResize);
      abortSignal?.removeEventListener?.('abort', onAbort);
      dataSubscription?.dispose?.();
      exitSubscription?.dispose?.();
      restoreRawMode(stdin, previousRawMode);
    };

    const finish = (result) => {
      if (finished) {
        return;
      }
      finished = true;
      cleanup();
      resolve({
        ...result,
        exitCode: result?.exitCode ?? 0,
        signal: result?.signal ?? null,
      });
    };

    const fail = (error) => {
      if (finished) {
        return;
      }
      finished = true;
      cleanup();
      reject(error);
    };

    const handleInput = (chunk) => {
      const text = String(chunk);
      const shouldPass = onInputHook?.(text, { child, finish }) !== false;
      if (shouldPass) {
        child?.write(text);
      }
    };

    const onResize = () => {
      const nextSize = terminalSize(stdout);
      child?.resize?.(nextSize.columns, nextSize.rows);
    };

    const onAbort = () => {
      child?.kill?.('SIGINT');
    };

    const previousRawMode = stdin.isRaw;

    try {
      child = factory.spawn(commandSpec.command, commandSpec.args, {
        name: env.TERM ?? 'xterm-256color',
        cols: size.columns,
        rows: size.rows,
        cwd: commandSpec.cwd,
        env: { ...env, ...commandSpec.env },
      });

      enableRawMode(stdin);
      stdin.resume?.();
      stdin.on?.('data', handleInput);
      resizeEmitter.on?.('SIGWINCH', onResize);
      abortSignal?.addEventListener?.('abort', onAbort, { once: true });

      dataSubscription = child.onData((data) => {
        stdout.write(String(data));
        onData?.(String(data));
      });
      exitSubscription = child.onExit(finish);

      if (abortSignal?.aborted) {
        onAbort();
      }
    } catch (error) {
      try {
        child?.kill?.('SIGINT');
      } catch {
        // Ignore cleanup failures while surfacing the original error.
      }
      fail(error);
    }
  });
}

export function assertInteractiveTty({ stdin = process.stdin, stdout = process.stdout } = {}) {
  if (!stdin?.isTTY || !stdout?.isTTY) {
    throw new Error(TTY_REQUIRED_MESSAGE);
  }
}

async function loadNodePty() {
  try {
    return await import('node-pty');
  } catch (error) {
    throw new Error(
      `Unable to load node-pty for continuity codex.\nRun npm install, then try again.\n${error.message}`,
    );
  }
}

function enableRawMode(stdin) {
  if (typeof stdin.setRawMode === 'function') {
    stdin.setRawMode(true);
  }
}

function restoreRawMode(stdin, previousRawMode) {
  if (typeof stdin.setRawMode === 'function') {
    stdin.setRawMode(Boolean(previousRawMode));
  }
}

function terminalSize(stdout) {
  return {
    columns: Number(stdout?.columns) > 0 ? Number(stdout.columns) : 80,
    rows: Number(stdout?.rows) > 0 ? Number(stdout.rows) : 24,
  };
}
