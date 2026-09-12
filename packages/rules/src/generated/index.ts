/**
 * The frozen Datasworn artifact (scripts/generate-datasworn.ts). A plain
 * JSON import, not a filesystem read: `rules` has no runtime dependencies
 * and no I/O, and Vite bundles a JSON import for the browser the same way
 * Node resolves it natively — verified for both before choosing this over
 * a hand-written loader.
 *
 * This file only asserts the shape; it trusts the generator to have
 * produced it. Do not hand-edit starforged.json — regenerate it instead.
 */
import type { AdaptedRuleset } from '../adapter/index.js';
import data from './starforged.json' with { type: 'json' };

export const STARFORGED: AdaptedRuleset = data as unknown as AdaptedRuleset;
