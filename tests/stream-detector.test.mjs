import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createCooldownStreamDetector,
  normalizeForDetection,
  stripAnsiForDetection,
} from '../src/interactive/stream-detector.mjs';

test('stream detector detects plain cooldown text', () => {
  const detector = createCooldownStreamDetector();
  const event = detector.push('429 rate limit reached; try again in 1 hour');

  assert.equal(event.matched, true);
  assert.match(event.reason, /429 rate limit reached/i);
  assert.equal(detector.hasDetected, true);
});

test('stream detector detects ANSI-colored cooldown text', () => {
  const detector = createCooldownStreamDetector();
  const event = detector.push('\x1b[31musage limit reached\x1b[0m\r\ntry again in 20 minutes');

  assert.equal(event.matched, true);
  assert.match(event.normalizedText, /usage limit reached/);
  assert.doesNotMatch(event.normalizedText, /\x1b/);
});

test('stream detector detects chunked cooldown text across writes', () => {
  const detector = createCooldownStreamDetector();

  assert.equal(detector.push('rate '), null);
  const event = detector.push('limit reached; try again in 3 minutes');

  assert.equal(event.matched, true);
  assert.match(event.normalizedText, /rate limit reached/);
});

test('stream detector avoids existing provider false positives', () => {
  const detector = createCooldownStreamDetector();

  assert.equal(detector.push('context limit reached\nfile size limit exceeded'), null);
  assert.equal(detector.hasDetected, false);
});

test('stream detector emits one cooldown event per episode', () => {
  const events = [];
  const detector = createCooldownStreamDetector({
    onCooldown: (event) => events.push(event),
  });

  assert.equal(detector.push('usage limit reached').matched, true);
  assert.equal(detector.push('429 rate limit reached'), null);
  assert.equal(events.length, 1);

  detector.reset();
  assert.equal(detector.push('429 rate limit reached').matched, true);
  assert.equal(events.length, 2);
});

test('stream detector caps the rolling buffer', () => {
  const detector = createCooldownStreamDetector({ maxBufferChars: 10 });

  detector.push('abcdefghijklmnop');

  assert.equal(detector.getRawBuffer(), 'ghijklmnop');
});

test('ANSI stripping and whitespace normalization are stable for detection', () => {
  const stripped = stripAnsiForDetection('\x1b[33mrate\x1b[0m\r\n\tlimit');
  const normalized = normalizeForDetection(stripped);

  assert.equal(normalized, 'rate\nlimit');
});
