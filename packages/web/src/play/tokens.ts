import type { TokenUsage } from '@astrolabe/shared';

/** Every token spent: uncached input, output, and both halves of the prompt cache. */
export function totalTokens(tokens: TokenUsage): number {
  return tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite;
}

/**
 * Task 7.10 / D-51: every token the session spent as one compact number.
 * The split is the counter's tooltip; the total is what "visible per
 * session" means.
 */
export function formatTokens(tokens: TokenUsage): string {
  const total = totalTokens(tokens);
  if (total < 1000) {
    return String(total);
  }
  return `${(total / 1000).toFixed(total < 10_000 ? 1 : 0)}k`;
}

function split(tokens: TokenUsage): string {
  return `uncached input ${tokens.input.toLocaleString()}, output ${tokens.output.toLocaleString()}, cache read ${tokens.cacheRead.toLocaleString()}, cache write ${tokens.cacheWrite.toLocaleString()}`;
}

/**
 * The top bar's counter (D-125). A session's count leads, with the
 * campaign total — which includes calls made before any session, such as
 * character proposals — in the tooltip. With no session open, the campaign
 * total is the counter.
 */
export function tokenCounter(
  session: TokenUsage | undefined,
  campaign: TokenUsage | undefined,
): { readonly label: string; readonly title: string } | undefined {
  if (session !== undefined) {
    return {
      label: `${formatTokens(session)} tokens this session`,
      title:
        `This session: ${split(session)}.` +
        (campaign !== undefined ? ` This campaign: ${formatTokens(campaign)} tokens in all.` : ''),
    };
  }
  if (campaign !== undefined && totalTokens(campaign) > 0) {
    return {
      label: `${formatTokens(campaign)} tokens this campaign`,
      title: `This campaign, before any session: ${split(campaign)}.`,
    };
  }
  return undefined;
}
