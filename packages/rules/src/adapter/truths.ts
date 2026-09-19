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
 * The quest starter and the nested elaboration table *are* imported (D-172):
 * Campaign Launch reads both, and leaving them out was the Milestone 1
 * omission D-162 reverses.
 *
 * **`text` is the option's summary** (D-183). It used to be the cleaned
 * description, which made `row.text` do two jobs at once — the short label a
 * chip and an overview line want, and the full option a player reads before
 * choosing. They are different strings, Datasworn supplies both, and every
 * consumer now names the one it means. `rollOracle` returns `row.text`, so a
 * rolled truth's oracle chip reads the way a chip should.
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
  const summary = raw.summary ?? description.split('\n')[0] ?? description;
  return {
    min: raw.min,
    max: raw.max,
    // D-183: the summary, not the description. See the note above.
    text: summary,
    description,
    summary,
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
