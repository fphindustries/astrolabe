import type { Datasworn } from '@datasworn/core';

import type { Provenance } from '../schema/ids.js';

/**
 * Datasworn's `license` field is typed `WebUrl | null`; every Starforged
 * entry actually seen sets it to the CC BY 4.0 URL, matching the design
 * record's own statement of the license (CLAUDE.md, Attribution). This is
 * the fallback for the null case Datasworn's type admits, not a guess about
 * an unlicensed entry.
 */
const STARFORGED_LICENSE_FALLBACK = 'https://creativecommons.org/licenses/by/4.0';

export function mapProvenance(
  sourceId: string,
  version: string,
  source: Datasworn.SourceInfo,
): Provenance {
  return {
    sourceId,
    sourceVersion: version,
    book: source.title,
    ...(source.page !== undefined && { page: source.page }),
    authors: source.authors.map((author: Datasworn.AuthorInfo) => author.name),
    license: source.license ?? STARFORGED_LICENSE_FALLBACK,
  };
}
