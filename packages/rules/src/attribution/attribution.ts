import type { AdaptedRuleset } from '../adapter/index.js';
import type { Provenance } from '../schema/ids.js';

/**
 * One work to credit — usually one sourcebook. Derived from the imported
 * data's own Provenance records rather than hand-written, so a future
 * Datasworn expansion (Sundered Isles, Delve) appears here automatically
 * instead of requiring a prose edit that can drift from what's actually
 * imported.
 */
export interface AttributionEntry {
  readonly title: string;
  readonly authors: readonly string[];
  readonly url: string;
  readonly license: string;
  readonly licenseName: string;
}

const KNOWN_LICENSE_NAMES: Readonly<Record<string, string>> = {
  'https://creativecommons.org/licenses/by/4.0': 'CC BY 4.0',
};

function licenseNameFor(licenseUrl: string): string {
  return KNOWN_LICENSE_NAMES[licenseUrl] ?? licenseUrl;
}

interface AttributionGroup {
  readonly title: string;
  readonly url: string;
  readonly license: string;
  readonly authors: Set<string>;
}

function groupKey(source: Provenance): string {
  return JSON.stringify([source.book, source.url, source.license]);
}

/**
 * Groups every move/oracle/asset's Provenance by (title, url, license) and
 * merges authors, so two sourcebooks by the same author under the same
 * license each still get their own entry, sorted for a stable screen order.
 */
export function collectAttributionEntries(ruleset: AdaptedRuleset): readonly AttributionEntry[] {
  const sources: readonly Provenance[] = [
    ...ruleset.moves.map((m) => m.source),
    ...ruleset.oracles.map((o) => o.source),
    ...ruleset.assets.map((a) => a.source),
  ];

  const byKey = new Map<string, AttributionGroup>();
  for (const source of sources) {
    const key = groupKey(source);
    const existing = byKey.get(key);
    if (existing === undefined) {
      byKey.set(key, {
        title: source.book,
        url: source.url,
        license: source.license,
        authors: new Set(source.authors),
      });
    } else {
      for (const author of source.authors) {
        existing.authors.add(author);
      }
    }
  }

  return [...byKey.values()]
    .map((entry) => ({
      title: entry.title,
      authors: [...entry.authors].sort(),
      url: entry.url,
      license: entry.license,
      licenseName: licenseNameFor(entry.license),
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * CC BY 4.0 requires indicating if changes were made (license section
 * 3(a)(1)(B)) — and Astrolabe does make changes: IDs are re-minted (D-21),
 * markdown links are rewritten, unrollable oracle rows are dropped, and
 * move automation (schema/automation.ts) is Astrolabe's own hand-authored
 * interpretation of what the rules text says, not part of the licensed
 * text itself.
 */
export const ADAPTATION_NOTICE =
  'Astrolabe imports this content through its own adapter: identifiers are ' +
  're-minted, some formatting is adjusted for the app, and the move automation ' +
  '— how a roll’s outcome is applied — is Astrolabe’s own interpretation of the ' +
  'rules text, not part of the original work.';

export const DATASWORN_CREDIT = {
  name: 'Datasworn',
  url: 'https://github.com/rsek/datasworn',
  note: 'Ironsworn: Starforged content is imported in the Datasworn data format, maintained by rsek.',
};

export interface AttributionScreenContent {
  readonly heading: string;
  readonly intro: string;
  readonly entries: readonly AttributionEntry[];
  readonly adaptationNotice: string;
  readonly toolCredit: typeof DATASWORN_CREDIT;
}

export function buildAttributionScreen(ruleset: AdaptedRuleset): AttributionScreenContent {
  return {
    heading: 'Attribution',
    intro:
      'Astrolabe’s rules content is drawn from the following work, used under ' +
      'its Creative Commons license. No art or page layout from the book is reproduced.',
    entries: collectAttributionEntries(ruleset),
    adaptationNotice: ADAPTATION_NOTICE,
    toolCredit: DATASWORN_CREDIT,
  };
}
