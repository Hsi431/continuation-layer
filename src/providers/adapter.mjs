import { codexAdapter } from './codex.mjs';

const ADAPTERS = Object.freeze({
  codex: codexAdapter,
});

const REQUIRED_METHODS = Object.freeze([
  'startSessionCommand',
  'resumeSessionCommand',
  'startContinuationSessionCommand',
  'detectCooldownError',
  'parseResetTime',
  'extractSessionId',
  'makeResumePrompt',
  'makeContinuationPrompt',
]);

export function getProviderAdapter(provider) {
  const adapter = ADAPTERS[provider];
  if (!adapter) {
    throw new Error(`Unsupported provider adapter: ${provider}`);
  }

  assertProviderAdapter(adapter);
  return adapter;
}

export function assertProviderAdapter(adapter) {
  for (const method of REQUIRED_METHODS) {
    if (typeof adapter[method] !== 'function') {
      throw new Error(`Provider adapter is missing ${method}`);
    }
  }
}
