import type { AiErrorKind, AiStatusResponse } from '@astrolabe/shared';

import type { AiProvider } from './provider.js';

/**
 * Whether the Guide can be reached right now (task 7.11, D-116).
 *
 * In memory, on purpose: availability is a fact about this server process
 * and the provider, not about any campaign — the log already records every
 * failure as `ai.failed`, and a restart with a fixed key should not start
 * paused because of yesterday's outage. A server with no credential starts
 * unavailable; any call's outcome updates it.
 */
export class AiStatus {
  #lastFailure: { readonly errorKind: AiErrorKind; readonly message: string } | undefined;

  constructor(private readonly provider: AiProvider) {
    if (!provider.configured) {
      this.#lastFailure = {
        errorKind: 'not_configured',
        message:
          'No Anthropic API key is configured. Set ANTHROPIC_API_KEY and restart the server.',
      };
    }
  }

  recordSuccess(): void {
    this.#lastFailure = undefined;
  }

  recordFailure(errorKind: AiErrorKind, message: string): void {
    this.#lastFailure = { errorKind, message };
  }

  snapshot(): AiStatusResponse {
    return {
      provider: this.provider.name,
      model: this.provider.model,
      configured: this.provider.configured,
      available: this.provider.configured && this.#lastFailure === undefined,
      ...(this.#lastFailure !== undefined ? { lastFailure: this.#lastFailure } : {}),
    };
  }
}
