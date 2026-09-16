import type { Datasworn } from '@datasworn/core';

import type { OracleKind, OracleRow } from '../schema/oracles.js';
import type { SettingTruth, TruthOption, TruthSubchoiceTable } from '../schema/truths.js';

import { oracleIdFromSource } from './id-mapping.js';
import { mapProvenance } from './provenance.js';
import { rewriteLinks } from './text.js';

/**
 * Setting truths (task 4.2). Each of the 14 truth questions rolls exactly
 * like an oracle table — a d100 partitioned across its options — so this
 * adapts them straight into `OracleTable` rather than a parallel schema: the
 * same `OracleId`/`oracle:` namespace (via `oracleIdFromSource`'s existing
 * `'truths'` marker, anticipated since task 1.3 — see `id-mapping.ts`) and
 * the same `rollOracle` dice function apply unchanged.
 *
 * **Deliberately not imported**: each option's `quest_starter` text (only
 * useful once AI-proposed inciting incidents exist, D-101), and the nested
 * per-option elaboration table some options embed via `{{table:...}}`
 * (e.g. Cataclysm's "what caused it" sub-roll). Neither is read by the pick
 * /roll/write flow 4.2 builds; a truth row's `embeddedOracles` is left
 * unset rather than pointing at a sub-table this adapter never adapts —
 * the same kind of deliberate, tested gap as the collection-link case
 * `id-mapping.ts` already documents.
 */
interface RawTruthOption {
  readonly min?: number;
  readonly max?: number;
  readonly description: string;
  readonly summary?: string;
  readonly quest_starter?: string;
  readonly table?: { readonly dice: string; readonly rows: readonly RawTruthTableRow[] };
}

interface RawTruthTableRow {
  readonly min?: number | null;
  readonly max?: number | null;
  readonly text: string;
}

interface RawTruth {
  readonly _id: string;
  readonly name: string;
  readonly dice: string;
  readonly options: readonly RawTruthOption[];
  readonly _source: Datasworn.SourceInfo;
  readonly your_character?: string;
}

const TRUTH_KIND: OracleKind = 'text';

/**
 * A `{{table:...}}` embed refers to the nested elaboration table this
 * adapter deliberately doesn't import (see the file comment) — left in,
 * the raw templating syntax would show up verbatim in the option text a
 * player reads, so it's stripped here rather than rendered as literal text.
 */
const TABLE_EMBED_PATTERN = /\{\{table:[^}]+\}\}/g;

function mapTruthOption(
  raw: RawTruthOption,
  truthId: string,
  optionIndex: number,
  version: string,
): TruthOption | undefined {
  if (raw.min === undefined || raw.max === undefined) {
    return undefined;
  }
  const description = rewriteLinks(raw.description).replace(TABLE_EMBED_PATTERN, '').trimEnd();
  const subchoice =
    raw.table === undefined
      ? undefined
      : mapSubchoice(raw.table, `${truthId}/${optionIndex}`, version);
  return {
    min: raw.min,
    max: raw.max,
    text: description,
    description,
    summary: raw.summary ?? description.split('\n')[0] ?? description,
    ...(raw.quest_starter === undefined ? {} : { questStarter: raw.quest_starter }),
    ...(subchoice === undefined ? {} : { subchoice }),
  };
}

function mapSubchoice(
  raw: NonNullable<RawTruthOption['table']>,
  sourceId: string,
  version: string,
): TruthSubchoiceTable {
  const rows: OracleRow[] = raw.rows.flatMap((row) =>
    row.min == null || row.max == null
      ? []
      : [{ min: row.min, max: row.max, text: rewriteLinks(row.text) }],
  );
  return {
    id: requireTruthId(sourceId),
    name: 'Elaboration',
    dice: raw.dice,
    kind: TRUTH_KIND,
    rows,
    suggests: [],
    source: {
      sourceId,
      sourceVersion: version,
      book: 'Ironsworn: Starforged Rulebook',
      authors: ['Shawn Tomkin'],
      license: 'https://creativecommons.org/licenses/by/4.0',
      url: 'https://ironswornrpg.com',
    },
  };
}

function requireTruthId(sourceId: string) {
  const id = oracleIdFromSource(sourceId);
  if (id === undefined) {
    throw new Error(`Could not derive an oracle ID from truth "${sourceId}"`);
  }
  return id;
}

function mapTruth(raw: RawTruth, version: string, order: number): SettingTruth {
  const rows = raw.options
    .map((option, index) => mapTruthOption(option, raw._id, index, version))
    .filter((row): row is TruthOption => row !== undefined);

  return {
    id: requireTruthId(raw._id),
    name: raw.name,
    dice: raw.dice,
    kind: TRUTH_KIND,
    rows,
    suggests: [],
    source: mapProvenance(raw._id, version, raw._source),
    order,
    ...(raw.your_character === undefined
      ? {}
      : { characterPrompt: rewriteLinks(raw.your_character) }),
  };
}

/** Every setting truth, in Datasworn's own order. */
export function mapTruths(raw: Record<string, RawTruth>, version: string): readonly SettingTruth[] {
  return Object.values(raw).map((truth, index) => mapTruth(truth, version, index));
}
