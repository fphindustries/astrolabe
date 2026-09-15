import type { CampaignState, NarrativeEntry } from '@astrolabe/shared';

import { buildNarrativeLog } from '../projection/narrative-log.js';
import { project } from '../projection/project.js';
import { databaseUrlFromEnv } from '../db/client.js';
import { readEvents, readNarrativeEvents } from '../db/event-store.js';
import { createTestDatabase } from '../db/testing.js';

import { playGoldenSession } from '../fixtures/golden-session.js';

/**
 * `npm run harness` — play the golden session (the `golden-session` fixture,
 * D-152) and print what it projected to.
 *
 * The end-to-end test asserts the same run; this is for a person to read:
 * the numbers below should match the golden session's (D-61 aside), and the
 * log below should read like the beats it describes.
 *
 * It plays into a throwaway schema that is dropped afterwards (D-122).
 * Writing into the dev database left one more "Lantern Wake" behind on every
 * run; a campaign to open in the browser comes from `npm run db:seed`.
 */
async function main(): Promise<void> {
  databaseUrlFromEnv(); // Fail with the helpful message before anything else.
  const db = await createTestDatabase('harness');
  const { sql } = db;
  try {
    const run = await playGoldenSession(sql);

    const events = await readEvents(sql, run.campaignId);
    const state = project(events);
    const page = buildNarrativeLog(
      await readNarrativeEvents(sql, run.campaignId, { sessionId: run.sessionTwoId, limit: 200 }),
    );

    print(state, events.length);
    printLog(page.beats);
  } finally {
    await db.close();
  }
}

function print(state: CampaignState, eventCount: number): void {
  const out: string[] = [];
  out.push('');
  out.push(
    heading(`${state.campaign?.name ?? 'Campaign'} — session ${state.session?.number ?? '?'}`),
  );

  out.push('');
  out.push(heading('Crew'));
  for (const character of Object.values(state.characters)) {
    const momentum = character.momentum;
    out.push(
      `  ${pad(character.callsign, 8)} health ${character.meters.health.value}/${character.meters.health.max}` +
        `   momentum ${signed(momentum.value)}/${momentum.max}` +
        `   (reset ${momentum.resetValue}, impacts ${character.markedImpacts})` +
        `   ${provenance(momentum.lastChangedBy.actorKind, momentum.lastChangedBy.reason)}`,
    );
  }

  out.push('');
  out.push(heading('Trackers'));
  for (const track of Object.values(state.tracks)) {
    out.push(
      `  ${pad(track.kind, 6)} ${pad(track.title, 46)} ${track.ticks}/${track.maxTicks}` +
        `   ${provenance(track.lastChangedBy.actorKind, track.lastChangedBy.reason)}`,
    );
  }

  out.push('');
  out.push(heading('Entities'));
  for (const entity of Object.values(state.entities)) {
    const badge = entity.provenance.establishedBy === 'ai' ? '[AI-established]' : '[player]';
    const fields = Object.entries(entity.fields)
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');
    out.push(`  ${pad(entity.name, 22)} ${pad(entity.kind, 10)} ${badge}  ${fields}`);
  }

  out.push('');
  out.push(heading('Session'));
  out.push(`  scene      ${state.scene?.title ?? '—'}`);
  out.push(
    `  tokens     ${state.session?.tokenUsage.input ?? 0} in / ${state.session?.tokenUsage.output ?? 0} out`,
  );
  out.push(`  events     ${eventCount} in the log`);

  console.log(out.join('\n'));
}

function printLog(beats: readonly { seq: number; entries: readonly NarrativeEntry[] }[]): void {
  const out: string[] = ['', heading('Narrative log'), ''];
  for (const beat of beats) {
    for (const entry of beat.entries) {
      out.push(`  ${pad(String(beat.seq), 4)} ${describe(entry)}`);
      for (const mark of entry.voidedBy) {
        out.push(`       ${mark.kind === 'reroll' ? 'rerolled' : 'voided'}: ${mark.reason}`);
      }
    }
  }
  console.log(out.join('\n'));
}

/** One line per entry, struck through when the event was voided. */
function describe(entry: NarrativeEntry): string {
  const body = summarise(entry);
  return entry.voided ? strike(body) : body;
}

function summarise(entry: NarrativeEntry): string {
  const event = entry.event;
  switch (event.type) {
    case 'scene.started':
      return `scene: ${event.payload.title}`;
    case 'move.invoked':
      return `move: ${short(event.payload.moveId)}${
        event.payload.aidingAllyId === undefined ? '' : ' (aiding an ally)'
      } — ${event.payload.actionText ?? ''}`;
    case 'dice.rolled': {
      const offer =
        event.payload.kind === 'action' && event.payload.burnOffer !== undefined
          ? entry.burnTaken === true
            ? '  [burned momentum]'
            : '  [burn offered]'
          : '';
      return `roll: ${event.payload.tier.replace('_', ' ')}${offer}`;
    }
    case 'momentum.burned':
      return `burn: ${event.payload.tierBefore.replace('_', ' ')} → ${event.payload.tierAfter.replace('_', ' ')}`;
    case 'track.created':
      return `track: "${event.payload.title}" created`;
    case 'track.advanced':
      return `track: +${event.payload.ticks}`;
    case 'entity.established':
      return `entity: ${event.payload.name}`;
    case 'narration.written':
      return `narration: ${entry.narration?.text ?? event.payload.text}${
        entry.narration?.corrected === true ? '   [corrected]' : ''
      }`;
    case 'state.overridden':
      return `override: ${event.payload.from} → ${event.payload.to} (${event.payload.reason ?? 'no reason given'})`;
    case 'event.voided':
      return `void: ${event.payload.cascaded.length} event(s)`;
    case 'session.ended':
      return 'session ended';
    default:
      return event.type;
  }
}

const heading = (text: string) => `${text}\n${'─'.repeat(text.length)}`;
const pad = (text: string, width: number) =>
  text.padEnd(width).slice(0, Math.max(width, text.length));
const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
const short = (moveId: string) => moveId.replace(/^move:[^/]+\//, '');
const provenance = (actor: string, reason?: string) =>
  `by ${actor}${reason === undefined ? '' : ` — ${reason}`}`;

/** Combining long stroke, so a voided line reads as struck through in a terminal. */
const strike = (text: string) => [...text].map((char) => `${char}̶`).join('');

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
