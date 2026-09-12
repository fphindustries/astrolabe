import type { OracleId } from '../schema/ids.js';

import { oracleIdFromSource, rewriteSourceId } from './id-mapping.js';

const LINK_PATTERN = /\(id:([^)]+)\)/g;
const TABLE_EMBED_PATTERN = /\{\{table:([^}]+)\}\}/g;

/**
 * Rewrites every `[label](id:starforged/...)` link in a piece of imported
 * markdown so it points at the Astrolabe ID instead (schema section 3.6).
 * The label is untouched; only the URL segment changes.
 */
export function rewriteLinks(text: string): string {
  return text.replace(
    LINK_PATTERN,
    (_match, sourceId: string) => `(id:${rewriteSourceId(sourceId)})`,
  );
}

/**
 * Collects the oracle tables a `{{table:starforged/oracles/...}}` embed
 * points at. Unresolvable IDs (none are known to occur) are dropped rather
 * than surfaced as a broken OracleId.
 */
export function embeddedOraclesFromText(text: string): readonly OracleId[] {
  const found: OracleId[] = [];
  for (const match of text.matchAll(TABLE_EMBED_PATTERN)) {
    const sourceId = match[1];
    const oracleId = sourceId === undefined ? undefined : oracleIdFromSource(sourceId);
    if (oracleId !== undefined) {
      found.push(oracleId);
    }
  }
  return found;
}
