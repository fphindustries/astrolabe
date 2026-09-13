import type { TokenUsage } from '@astrolabe/shared';

/**
 * Task 7.10 / D-51: every token the session spent — uncached input, output,
 * and both halves of the prompt cache — as one compact number. The split is
 * the counter's tooltip; the total is what "visible per session" means.
 */
export function formatTokens(tokens: TokenUsage): string {
  const total = tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite;
  if (total < 1000) {
    return String(total);
  }
  return `${(total / 1000).toFixed(total < 10_000 ? 1 : 0)}k`;
}
