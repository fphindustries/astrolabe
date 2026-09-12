/**
 * The Datasworn adapter's build step (design record section 5, schema
 * section 3.6). Reads the Datasworn Starforged data, runs it through the
 * pure adapter in src/adapter/, and writes the result to
 * src/generated/starforged.json — a frozen artifact that
 * src/generated/index.ts loads with a plain JSON import, so `rules` stays
 * free of I/O and free of runtime dependencies (this script, and the
 * @datasworn/* packages it reads from, are devDependencies only).
 *
 * This lives outside src/ deliberately: it is the one place in this
 * package allowed to touch the filesystem. Run it with:
 *
 *   npm run generate --workspace @astrolabe/rules
 *
 * Regenerate deliberately — when the Datasworn pin (D-63) changes, or when
 * the adapter itself changes — and commit the result, so the imported data
 * a build sees is exactly what code review saw.
 */
import type { Datasworn } from '@datasworn/core';
import starforgedRaw from '@datasworn/starforged/json/starforged.json' with { type: 'json' };
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { adaptStarforged } from '../src/adapter/index.js';

const ruleset = starforgedRaw as unknown as Datasworn.Ruleset;
const adapted = adaptStarforged(ruleset);

const outPath = fileURLToPath(new URL('../src/generated/starforged.json', import.meta.url));
writeFileSync(outPath, `${JSON.stringify(adapted, null, 2)}\n`);

console.log(
  `Wrote ${adapted.moves.length} moves, ${adapted.oracles.length} oracles, ` +
    `${adapted.assets.length} assets (Datasworn ${ruleset.datasworn_version}) to ${outPath}`,
);
