import type { CampaignId } from './ids.js';
import type { CampaignState, NarrativeLog } from './read-models/index.js';

/**
 * HTTP response envelopes for task 5.0's read API.
 *
 * These wrap the read-model shapes (`read-models/`) for the wire. They are
 * not zod schemas: the server is the trusted producer, and the client reads
 * them as plain data (design record §9 — the client renders state, sends
 * intent). Request bodies, once group 5.0 grows command endpoints, are
 * validated with zod on the server, because the server is authoritative and
 * a client is not (section 2's convention).
 */

export interface CampaignSummary {
  readonly id: CampaignId;
  readonly name: string;
}

export type CampaignListResponse = readonly CampaignSummary[];

/**
 * `headSeq` is the sequence number of the last event folded into `state`.
 * The client uses it to drop an out-of-order response — one command's
 * result arriving after a later one's.
 */
export interface CampaignStateResponse {
  readonly headSeq: number;
  readonly state: CampaignState;
}

export type NarrativeLogResponse = NarrativeLog;
