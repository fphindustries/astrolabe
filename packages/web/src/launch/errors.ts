import { ApiError } from '../api/http.js';

/**
 * What a failed launch command says on screen (task 4.2).
 *
 * The server refuses in three distinguishable ways and the difference matters
 * to the reader: a 400 means the form sent something the schema does not
 * accept, a 422 means the command looked at the campaign and said no, and a
 * transport failure means neither. Where the server supplied its own `problem`
 * sentence, that sentence is shown — it knows more about the refusal than any
 * message written here.
 */

export interface LaunchErrorSummary {
  readonly title: string;
  readonly details: readonly string[];
  /** A 422 `not_ready` means what the reader was shown is out of date. */
  readonly staleWorkspace: boolean;
}

/** The `{ problem, reason }` body every refused launch command returns. */
interface Refusal {
  readonly problem?: string;
  readonly reason?: string;
}

const REASON_TITLES: Readonly<Record<string, string>> = {
  not_ready:
    'The server rechecked readiness and this campaign is not ready. The problems below are the current ones.',
  campaign_active: 'This campaign has already launched. Later changes are amendments.',
  campaign_in_play: 'This campaign is already in play; Campaign Launch is closed for it.',
};

export function launchErrorSummary(error: unknown): LaunchErrorSummary {
  if (!(error instanceof ApiError)) {
    return { title: 'Couldn’t reach the server.', details: [], staleWorkspace: false };
  }
  const refusal = refusalOf(error.body);
  const problem = refusal.problem?.trim();
  const details = problem ? [problem] : [];

  if (error.status === 404) {
    return { title: 'That campaign no longer exists.', details, staleWorkspace: false };
  }
  if (error.status === 400) {
    return { title: 'The server rejected that form.', details, staleWorkspace: false };
  }
  if (error.status === 422) {
    const reason = refusal.reason;
    return {
      title:
        (reason !== undefined ? REASON_TITLES[reason] : undefined) ??
        problem ??
        'The server refused that change.',
      // The title already carries the server's sentence in the fallback case;
      // repeating it underneath would just say the same thing twice.
      details: reason !== undefined && REASON_TITLES[reason] !== undefined ? details : [],
      staleWorkspace: reason === 'not_ready',
    };
  }
  return { title: 'Couldn’t reach the server.', details, staleWorkspace: false };
}

function refusalOf(body: unknown): Refusal {
  if (typeof body !== 'object' || body === null) return {};
  const { problem, reason } = body as Record<string, unknown>;
  return {
    ...(typeof problem === 'string' ? { problem } : {}),
    ...(typeof reason === 'string' ? { reason } : {}),
  };
}
