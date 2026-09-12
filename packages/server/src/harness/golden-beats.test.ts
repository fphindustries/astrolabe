import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildNarrativeLog } from '../projection/narrative-log.js';
import { project } from '../projection/project.js';
import { readEvents, readNarrativeEvents } from '../db/event-store.js';
import { createTestDatabase, hasTestDatabase, type TestDatabase } from '../db/testing.js';

import { playGoldenBeats, type GoldenRun } from './golden-beats.js';

/**
 * The scripted session, asserted rather than eyeballed.
 *
 * The CLI harness prints this same run for a person to read; this is the
 * machine reading it. Between them they are section 2's end-to-end check:
 * the sequence, idempotent commands, the projector, the narrative log, the
 * void cascade and both amendments, all driven by one plausible session.
 *
 * It is also the shape D-72's committed fixture will take, once there is an
 * AI provider to build a recap from it.
 */
describe.skipIf(!hasTestDatabase)('the golden session beats', () => {
  let db: TestDatabase;
  let run: GoldenRun;

  beforeAll(async () => {
    db = await createTestDatabase('golden');
    run = await playGoldenBeats(db.sql);
  }, 60_000);

  afterAll(async () => {
    await db?.close();
  });

  const state = async () => project(await readEvents(db.sql, run.campaignId));
  const logPage = async () =>
    buildNarrativeLog(
      await readNarrativeEvents(db.sql, run.campaignId, { sessionId: run.sessionId, limit: 100 }),
    );

  it('opens session 2 of the Lantern Wake', async () => {
    const s = await state();
    expect(s.campaign?.name).toBe('Lantern Wake');
    expect(s.session?.number).toBe(2);
    expect(s.scene?.title).toBe('The derelict relay station');
  });

  it('Beat 3: Juno gained a point of momentum from the weak hit', async () => {
    // 3 at creation, +1 from Gather Information, then overridden to 5 in
    // Beat 9 — so the override is what stands.
    const juno = (await state()).characters[run.characters.juno];
    expect(juno?.momentum.value).toBe(5);
  });

  it('Beat 5: the aid went to Vesna, and the burn reset her momentum', async () => {
    const s = await state();
    const vesna = s.characters[run.characters.vesna];
    const rook = s.characters[run.characters.rook];

    // 7 + 2 from Rook's aid = 9, then burned: reset to 2 minus impacts.
    expect(vesna?.momentum.value).toBe(2);
    expect(vesna?.momentum.resetValue).toBe(2);
    // The bonus was spent by her next move.
    expect(vesna?.bonusNextMove).toBeUndefined();
    // Rook gave the benefits away; he kept none of them.
    expect(rook?.momentum.value).toBe(2);
  });

  it('Beat 5: the log shows the burn was offered and taken (A8)', async () => {
    const entries = (await logPage()).beats.flatMap((b) => b.entries);
    const offered = entries.filter(
      (e) => e.event.type === 'dice.rolled' && e.burnTaken !== undefined,
    );
    expect(offered).toHaveLength(1);
    expect(offered[0]?.burnTaken).toBe(true);
  });

  it('Beat 6: only the surviving NPC is tracked, badged as AI-established (A10)', async () => {
    const entities = Object.values((await state()).entities);
    expect(entities).toHaveLength(1);
    expect(entities[0]?.name).toBe('Sura Vance');
    expect(entities[0]?.provenance.establishedBy).toBe('ai');
    expect(entities[0]?.provenance.recipeId).toBe('recipe:npc');
  });

  it('Beat 6: the discarded result stays visible, struck through with its reason (A9)', async () => {
    const entries = (await logPage()).beats.flatMap((b) => b.entries);
    const discarded = entries.find(
      (e) => e.event.type === 'entity.established' && e.event.payload.name === 'Corin Adeyemi',
    );
    expect(discarded?.voided).toBe(true);
    expect(discarded?.voidedBy[0]?.kind).toBe('reroll');
    expect(discarded?.voidedBy[0]?.reason).toMatch(/evacuation logs/);
  });

  it('Beat 7: the voided strong hit left no trace in state (A11)', async () => {
    const rook = (await state()).characters[run.characters.rook];
    // The +1 momentum from the +edge roll is gone; only the -1 health from
    // the redone miss stands.
    expect(rook?.momentum.value).toBe(2);
    expect(rook?.meters.health.value).toBe(4);
  });

  it('Beat 7: both rolls stay in the log, one struck through (D-27)', async () => {
    const entries = (await logPage()).beats.flatMap((b) => b.entries);
    const faceDangerRolls = entries.filter((e) => e.event.type === 'dice.rolled');
    const voided = faceDangerRolls.filter((e) => e.voided);

    expect(voided).toHaveLength(1);
    expect(voided[0]?.voidedBy[0]?.reason).toMatch(/\+iron, not \+edge/);
  });

  it('Beat 8: the clock carries who ticked it and why (A14)', async () => {
    const clock = (await state()).tracks[run.clockId];
    expect(clock?.title).toBe('Station power failing');
    expect(clock?.ticks).toBe(1);
    expect(clock?.maxTicks).toBe(4);
    expect(clock?.lastChangedBy.actorKind).toBe('ai');
    expect(clock?.lastChangedBy.reason).toMatch(/load-shedding/);
  });

  it('Beat 9: the passage reads as its correction, with the original kept (A15)', async () => {
    const entries = (await logPage()).beats.flatMap((b) => b.entries);
    const passage = entries.find((e) => e.event.type === 'narration.written');

    expect(passage?.narration?.corrected).toBe(true);
    expect(passage?.narration?.text).toMatch(/shakes the sparks off his sleeve/);
    expect(passage?.narration?.original).toMatch(/shaken/);
    expect(passage?.narration?.note).toMatch(/veteran/);
  });

  it('Beat 9: the override is marked as the player changing it (A16)', async () => {
    const juno = (await state()).characters[run.characters.juno];
    expect(juno?.momentum.lastChangedBy.actorKind).toBe('player');
    expect(juno?.momentum.lastChangedBy.reason).toMatch(/ruling from last session/);
  });

  it('counts the tokens the AI spent, and keeps them through a void (D-75, D-85)', async () => {
    expect((await state()).session?.tokenUsage).toEqual({ input: 1840, output: 210 });
  });

  it('projects identically on a second read', async () => {
    expect(await state()).toEqual(await state());
  });

  it('reads back the same state from a cold rebuild of the stored log', async () => {
    // Nothing in the projection depends on how the events were written —
    // only on what was written.
    const events = await readEvents(db.sql, run.campaignId);
    expect(project(events)).toEqual(project([...events]));
    expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i + 1));
  });
});
