import type { MoveId } from '../schema/ids.js';
import type { RelevanceRule } from '../schema/relevance.js';

/**
 * D-66: empty. No move the golden session touches needs situation-gating —
 * they all fall back to their category's default (ALWAYS_RELEVANT_CATEGORIES
 * in relevance.ts). The first real entry will be Enter the Fray, in
 * Milestone 2.
 */
export const MOVE_RELEVANCE_RULES: ReadonlyMap<MoveId, RelevanceRule> = new Map();
