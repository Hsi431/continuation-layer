import { codexAdapter } from '../providers/codex.mjs';

export const DEFAULT_STREAM_BUFFER_CHARS = 32 * 1024;

export function createCooldownStreamDetector({
  adapter = codexAdapter,
  maxBufferChars = DEFAULT_STREAM_BUFFER_CHARS,
  onCooldown = null,
} = {}) {
  let rawBuffer = '';
  let detected = false;

  return {
    push(chunk) {
      rawBuffer = trimBuffer(rawBuffer + String(chunk ?? ''), maxBufferChars);
      if (detected) {
        return null;
      }

      const normalizedText = normalizeForDetection(stripAnsiForDetection(rawBuffer));
      const cooldown = adapter.detectCooldownError(normalizedText);
      if (!cooldown.matched) {
        return null;
      }

      detected = true;
      const event = {
        matched: true,
        reason: cooldown.reason,
        matchedPattern: cooldown.matchedPattern ?? null,
        matchedTextExcerpt: cooldown.matchedTextExcerpt ?? null,
        normalizedText,
      };
      onCooldown?.(event);
      return event;
    },

    reset() {
      rawBuffer = '';
      detected = false;
    },

    getRawBuffer() {
      return rawBuffer;
    },

    get hasDetected() {
      return detected;
    },
  };
}

export function stripAnsiForDetection(text) {
  return String(text ?? '')
    .replace(/\x1B\][\s\S]*?(?:\x07|\x1B\\)/g, '')
    .replace(/\x1B[PX^_][\s\S]*?\x1B\\/g, '')
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1B[@-Z\\-_]/g, '');
}

export function normalizeForDetection(text) {
  return String(text ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function trimBuffer(buffer, maxBufferChars) {
  const limit = Math.max(1, Number(maxBufferChars) || DEFAULT_STREAM_BUFFER_CHARS);
  return buffer.length > limit ? buffer.slice(-limit) : buffer;
}
