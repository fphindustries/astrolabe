import type { Datasworn } from '@datasworn/core';

import type { OracleId } from '../schema/ids.js';
import type { OracleKind, OracleRow, OracleTable } from '../schema/oracles.js';

import { oracleIdFromSource } from './id-mapping.js';
import { mapProvenance } from './provenance.js';
import { embeddedOraclesFromText, rewriteLinks } from './text.js';

/**
 * @datasworn/core 0.0.10's own `OracleTableRollable` type (used for
 * `OracleTablesCollection.contents`) is `OracleTableText | OracleTableText2
 * | OracleTableText3` — it omits `OracleColumnText`, even though
 * `column_text` leaves are real and common in the actual Starforged data
 * (66 of them, verified directly against the JSON). Rather than fight an
 * upstream type gap, this adapter declares its own minimal raw shape,
 * matching exactly the fields it reads and the three `oracle_type` values
 * actually present (table_text ×191, table_text2 ×5, column_text ×66 —
 * table_text3/column_text2/column_text3 never occur in this ruleset).
 */
interface RawOracleRow {
  readonly min: number | null;
  readonly max: number | null;
  readonly text: string;
  readonly text2?: string | null;
  readonly oracle_rolls?: readonly { readonly oracle: string | null }[];
}

interface RawOracleTableLeaf {
  readonly type: 'oracle_rollable';
  readonly _id: string;
  readonly name: string;
  readonly oracle_type: string;
  readonly dice: string;
  readonly rows: readonly RawOracleRow[];
  readonly suggestions?: { readonly oracles?: readonly string[] };
  /** Absent on 66 leaves in the real data — see walkCollection for why that's fine. */
  readonly _source?: Datasworn.SourceInfo;
}

interface RawOracleCollectionNode {
  readonly type: string;
  readonly contents?: Record<string, RawOracleTableLeaf | RawOracleCollectionNode>;
  readonly collections?: Record<string, RawOracleCollectionNode>;
  readonly _source?: Datasworn.SourceInfo;
}

function mapOracleKind(oracleType: string): OracleKind {
  switch (oracleType) {
    case 'table_text':
      return 'text';
    case 'table_text2':
      return 'text2';
    case 'column_text':
      return 'column_text';
    default:
      throw new Error(`Unhandled oracle_type "${oracleType}"`);
  }
}

/**
 * A row with `min`/`max` of `null` is unrollable — Datasworn's own words are
 * "included only for rendering purposes" — and 59 of them exist in the
 * Starforged data as grouping labels or cross-references (e.g. "Multiple
 * settlements", or a link to a themed sub-collection). They carry no
 * rollable game content, so the adapter drops them rather than modelling a
 * row the dice engine could never land on.
 */
function mapOracleRow(raw: RawOracleRow): OracleRow | undefined {
  if (raw.min === null || raw.max === null) {
    return undefined;
  }

  const fromRollsField = (raw.oracle_rolls ?? [])
    .map((r) => r.oracle)
    .filter((o): o is string => o !== null)
    .map(oracleIdFromSource)
    .filter((id): id is OracleId => id !== undefined);
  const fromEmbeds = embeddedOraclesFromText(raw.text);
  const embeddedOracles = [...new Set([...fromRollsField, ...fromEmbeds])];

  return {
    min: raw.min,
    max: raw.max,
    text: rewriteLinks(raw.text),
    ...(raw.text2 !== undefined && raw.text2 !== null && { text2: rewriteLinks(raw.text2) }),
    ...(embeddedOracles.length > 0 && { embeddedOracles }),
  };
}

function requireOracleId(sourceId: string) {
  const id = oracleIdFromSource(sourceId);
  if (id === undefined) {
    throw new Error(`Could not derive an oracle ID from "${sourceId}"`);
  }
  return id;
}

function mapOracleTable(
  raw: RawOracleTableLeaf,
  version: string,
  source: Datasworn.SourceInfo,
): OracleTable {
  const rows = raw.rows.map(mapOracleRow).filter((row): row is OracleRow => row !== undefined);
  const suggests = (raw.suggestions?.oracles ?? [])
    .map(oracleIdFromSource)
    .filter((id): id is OracleId => id !== undefined);

  return {
    id: requireOracleId(raw._id),
    name: raw.name,
    dice: raw.dice,
    kind: mapOracleKind(raw.oracle_type),
    rows,
    suggests,
    source: mapProvenance(raw._id, version, source),
  };
}

function isLeaf(node: RawOracleTableLeaf | RawOracleCollectionNode): node is RawOracleTableLeaf {
  return node.type === 'oracle_rollable';
}

/**
 * 66 leaf tables in the Starforged data (e.g. the character name
 * generators under Characters > Name) have no `_source` of their own —
 * verified directly — and are meant to inherit it from the nearest
 * ancestor collection that declares one. So the walk carries the closest
 * known source downward instead of requiring every leaf to repeat it.
 */
function walkCollection(
  node: RawOracleCollectionNode,
  version: string,
  inheritedSource: Datasworn.SourceInfo,
): readonly OracleTable[] {
  const source = node._source ?? inheritedSource;
  const tables: OracleTable[] = [];

  for (const child of Object.values(node.contents ?? {})) {
    if (isLeaf(child)) {
      tables.push(mapOracleTable(child, version, child._source ?? source));
    } else {
      tables.push(...walkCollection(child, version, source));
    }
  }
  for (const child of Object.values(node.collections ?? {})) {
    tables.push(...walkCollection(child, version, source));
  }

  return tables;
}

function requireSource(node: RawOracleCollectionNode, sourceId: string): Datasworn.SourceInfo {
  if (node._source === undefined) {
    throw new Error(`Top-level oracle collection "${sourceId}" has no _source to inherit from`);
  }
  return node._source;
}

/** Walks one top-level oracle collection to every leaf table it contains, however deeply nested. */
export function mapOracleCollection(
  raw: RawOracleCollectionNode,
  version: string,
  sourceId = '(unknown)',
): readonly OracleTable[] {
  return walkCollection(raw, version, requireSource(raw, sourceId));
}

/** Maps every oracle in the ruleset, across all top-level collections. */
export function mapOracles(
  raw: Record<string, RawOracleCollectionNode>,
  version: string,
): readonly OracleTable[] {
  return Object.entries(raw).flatMap(([key, collection]) =>
    mapOracleCollection(collection, version, key),
  );
}
