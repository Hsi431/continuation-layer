const COOLDOWN_PATTERNS = Object.freeze([
  /429\b/i,
  /rate\s*limit/i,
  /usage\s*limit/i,
  /(?:api|request|usage|rate)\s+limit\s+(?:reached|exceeded)/i,
  /5\s*[- ]?hour\s+(?:wall|limit|window)/i,
  /try\s+again\s+(?:in|after)\s+\d+\s*(?:h|hr|hrs|hour|hours|m|min|mins|minute|minutes|s|sec|secs|second|seconds)\b/i,
  /try\s+again\s+at\s+\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\b/i,
  /too\s+many\s+requests/i,
  /"?resets?_at"?\s*[:=]/i,
]);

export const codexAdapter = Object.freeze({
  name: 'codex',

  startSessionCommand({ repoRoot, prompt = '', nonInteractive = false }) {
    if (nonInteractive) {
      return commandSpec('codex', compactArgs(['exec', '-C', repoRoot, prompt]), repoRoot);
    }

    return commandSpec('codex', compactArgs(['-C', repoRoot, prompt]), repoRoot);
  },

  resumeSessionCommand({ repoRoot, sessionId = null, prompt = '', nonInteractive = true }) {
    if (nonInteractive) {
      return commandSpec(
        'codex',
        compactArgs(['exec', '-C', repoRoot, 'resume', sessionId ?? '--last', prompt]),
        repoRoot,
      );
    }

    return commandSpec(
      'codex',
      compactArgs(['resume', '-C', repoRoot, sessionId ?? '--last', prompt]),
      repoRoot,
    );
  },

  startContinuationSessionCommand({ repoRoot, sessionId = null, prompt = '' }) {
    return commandSpec(
      'codex',
      compactArgs(['fork', '-C', repoRoot, sessionId ?? '--last', prompt]),
      repoRoot,
    );
  },

  detectCooldownError(text) {
    const source = String(text ?? '');
    const matched = COOLDOWN_PATTERNS.find((pattern) => pattern.test(source));
    if (!matched) {
      return { matched: false, reason: null };
    }

    return {
      matched: true,
      reason: firstCooldownLine(source) ?? 'cooldown or rate limit detected',
    };
  },

  parseResetTime(text, now = new Date()) {
    return parseResetTime(text, now);
  },

  parseResetTimeDetails(text, now = new Date()) {
    return parseResetTimeDetails(text, now);
  },

  extractSessionId(text) {
    return extractSessionId(text);
  },

  makeResumePrompt({ state, snapshotPath }) {
    const session = state.current_session_id ?? 'latest available session';
    return [
      `Resume task ${state.task_id}.`,
      `Use session ${session}.`,
      `First read ${state.current_handoff_path}, .agent/NEXT.md, .agent/DECISIONS.md, git status, and git diff.`,
      snapshotPath ? `Also inspect ${snapshotPath}.` : null,
      'Do not redo completed work. Continue from the recorded next exact step.',
    ]
      .filter(Boolean)
      .join(' ');
  },

  makeContinuationPrompt({ state }) {
    return [
      `Start a continuation session for task ${state.task_id}.`,
      `Parent session: ${state.current_session_id ?? 'unknown'}.`,
      `Read ${state.current_handoff_path}, .agent/NEXT.md, and .agent/DECISIONS.md before editing.`,
      'Run git status --short and git diff --no-color before editing.',
      'Run recovery check before continuing.',
    ].join(' ');
  },
});

export function parseResetTime(text, now = new Date()) {
  return parseResetTimeDetails(text, now)?.resetAt ?? null;
}

export function parseResetTimeDetails(text, now = new Date()) {
  const source = String(text ?? '');
  const epoch = parseEpochReset(source);
  if (epoch) {
    return {
      resetAt: epoch,
      provenance: 'provider_epoch',
    };
  }

  const explicit = parseExplicitResetAt(source);
  if (explicit) {
    return {
      resetAt: explicit,
      provenance: 'provider_reset_at',
    };
  }

  const relative = parseRelativeReset(source);
  if (relative !== null) {
    return {
      resetAt: new Date(now.getTime() + relative * 1000),
      provenance: 'provider_relative',
    };
  }

  return null;
}

export function nextResumeAt({ text, now = new Date(), defaultSeconds, bufferSeconds }) {
  const parsed = parseResetTimeDetails(text, now);
  const base = parsed?.resetAt ?? new Date(now.getTime() + defaultSeconds * 1000);
  return new Date(base.getTime() + bufferSeconds * 1000);
}

function commandSpec(command, args, cwd) {
  return { command, args, cwd };
}

function compactArgs(args) {
  return args.filter((arg) => arg !== null && arg !== undefined && String(arg).length > 0);
}

function firstCooldownLine(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => COOLDOWN_PATTERNS.some((pattern) => pattern.test(line)));
}

function parseEpochReset(source) {
  const match = source.match(/"?resets?_at"?\s*[:=]\s*"?(\d{10,13})"?/i);
  if (!match) {
    return null;
  }

  const raw = Number(match[1]);
  const millis = raw > 9_999_999_999 ? raw : raw * 1000;
  return new Date(millis);
}

function parseExplicitResetAt(source) {
  const patterns = [
    /"?resets?_at"?\s*[:=]\s*"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)"/i,
    /(?:reset|resets|try again|retry|available)\s+(?:at|on)\s+(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\b/i,
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match) {
      return new Date(match[1]);
    }
  }

  return null;
}

function parseRelativeReset(source) {
  const patterns = [
    /(?:reset|try again|retry|available)\s+(?:in|after)\s+([^\n.]+)/i,
    /(?:in|after)\s+((?:\d+\s*(?:h|hr|hrs|hour|hours|m|min|mins|minute|minutes|s|sec|secs|second|seconds)\s*)+)/i,
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (!match) {
      continue;
    }

    const seconds = durationToSeconds(match[1]);
    if (seconds !== null) {
      return seconds;
    }
  }

  return null;
}

function durationToSeconds(text) {
  let total = 0;
  let found = false;
  const unitPattern =
    /(\d+)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes|s|sec|secs|second|seconds)\b/gi;
  for (const match of text.matchAll(unitPattern)) {
    found = true;
    const value = Number(match[1]);
    const unit = match[2].toLowerCase();
    if (unit.startsWith('h')) {
      total += value * 3600;
    } else if (unit === 'm' || unit.startsWith('min')) {
      total += value * 60;
    } else {
      total += value;
    }
  }

  return found ? total : null;
}

function extractSessionId(text) {
  const source = String(text ?? '');
  const jsonMatch =
    source.match(/"session_?id"\s*:\s*"([^"]+)"/i) ??
    source.match(/"conversation_?id"\s*:\s*"([^"]+)"/i);
  if (jsonMatch) {
    return jsonMatch[1];
  }

  const lineMatch = source.match(/\bsession(?:_|\s+)?id\b\s*[:=]\s*([A-Za-z0-9._:-]+)/i);
  return lineMatch ? lineMatch[1] : null;
}
