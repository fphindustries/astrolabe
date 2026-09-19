import type { MoveId, OutcomeTier } from '@astrolabe/rules';
import type {
  BeginSessionResponse,
  CampaignId,
  CampaignStateResponse,
  CheckTriggerResponse,
  EndSessionResponse,
  EventId,
  InvokeMoveResponse,
  NarrationFrame,
  OfferComplicationsResponse,
  OverrideResponse,
  ProposeAmountResponse,
  ProposeSessionSummaryResponse,
  ResolvePayThePriceResponse,
  SessionId,
  SetComplicationResponse,
  SuggestActionsResponse,
  SuggestMoveResponse,
  VoidEventResponse,
} from '@astrolabe/shared';
import type { Sql } from 'postgres';

import type { AiRequest } from '../ai/provider.js';

import { action, d100, nothingNew, openScript, segments } from './http-script.js';
import { fixtureUuid } from './ids.js';
import { playSessionOne, type SessionOneRun } from './session-one.js';

/**
 * `golden-session`: the golden session itself, played end to end (10.4, D-152).
 *
 * Session 1 is seeded under this fixture's own campaign id, exactly as
 * `session-1` plays it. Session 2's ten beats are then played the way the
 * browser plays them: through the HTTP routes, in process, with the
 * narrator, checker and planner answering from a script and the dice loaded
 * step by step. Every call a beat makes is one the play screen makes, in the
 * order it makes them, including the world pass the client asks for after
 * each beat's passage and the trigger check after a typed action.
 *
 * The script fails loudly: a route that answers with an error, a scripted
 * outcome the rules score differently, a die left over or one too few, or
 * an AI call nobody scripted all throw, naming the beat. What the beats
 * produced is returned for the test to assert against.
 *
 * Beat 9's correction is about a fact, not a feeling. The golden session's
 * example has the passage call Rook "shaken", but D-129 withdraws a passage
 * that gives a player character an emotion before it ever reaches the log,
 * so the scripted passage overstates his burn instead, and the player
 * corrects that.
 *
 * Where the golden session's illustrative numbers disagree with the rules,
 * the rules win (D-61): Juno's weak hit takes her momentum from +3 to +4, so
 * Beat 9's "one too low" override takes it from +4 to +5.
 */

export const GOLDEN_SESSION = 'golden-session';

export const GOLDEN_SESSION_CAMPAIGN_ID = fixtureUuid<CampaignId>(GOLDEN_SESSION, 'campaign');

const GATHER_INFORMATION = 'move:adventure/gather-information' as MoveId;
const SECURE_AN_ADVANTAGE = 'move:adventure/secure-an-advantage' as MoveId;
const FACE_DANGER = 'move:adventure/face-danger' as MoveId;
const ENDURE_HARM = 'move:suffer/endure-harm' as MoveId;

export interface GoldenSessionRun extends SessionOneRun {
  readonly sessionTwoId: SessionId;
  /** What each beat's calls answered, for the test to assert against. */
  readonly beats: {
    readonly began: BeginSessionResponse;
    readonly recap: readonly NarrationFrame[];
    readonly frame: readonly NarrationFrame[];
    readonly suggestion: SuggestMoveResponse;
    readonly junoScan: InvokeMoveResponse;
    readonly junoTrigger: CheckTriggerResponse;
    readonly options: OfferComplicationsResponse;
    readonly complication: SetComplicationResponse;
    readonly junoPassage: EventId;
    readonly whatNow: SuggestActionsResponse;
    readonly rookAid: InvokeMoveResponse;
    readonly vesnaScan: InvokeMoveResponse;
    readonly burnedTo: OutcomeTier;
    readonly vesnaPassage: EventId;
    readonly firstContact: readonly NarrationFrame[];
    readonly rookEdge: InvokeMoveResponse;
    readonly voided: VoidEventResponse;
    readonly rookIron: InvokeMoveResponse;
    readonly price: ResolvePayThePriceResponse;
    readonly proposal: ProposeAmountResponse;
    readonly endureHarm: InvokeMoveResponse;
    readonly harmPassage: EventId;
    readonly clockPass: readonly NarrationFrame[];
    readonly correction: readonly NarrationFrame[];
    readonly override: OverrideResponse;
    readonly summary: ProposeSessionSummaryResponse;
    readonly ended: EndSessionResponse;
  };
  /** Every request the scripted Guide was sent, in order. */
  readonly requests: readonly AiRequest[];
}

export async function playGoldenSession(sql: Sql): Promise<GoldenSessionRun> {
  const run = await playSessionOne(sql, {
    fixture: GOLDEN_SESSION,
    campaignName: 'Lantern Wake (golden session)',
  });
  const { campaignId } = run;
  const { vesna, rook, juno } = run.characters;
  // The harness every fixture played through HTTP shares (10.1a).
  const script = openScript(sql, { fixture: GOLDEN_SESSION, campaignId });
  const { http, id, rolling, say, move, narrate, worldPass, guide } = script;
  try {
    // --- Beat 1: opening the session ----------------------------------------
    script.at('Beat 1');
    const began = await http.post<BeginSessionResponse>('/sessions', {
      commandId: id('session:2:begin'),
    });
    say(
      'recap',
      segments(
        [
          'world',
          null,
          ['F1'],
          "Last session, the crew of the Lantern Wake pulled the Meridian's Hope distress beacon " +
            'out of the Deepwater Anchorage archive and found it was being repeated.',
        ],
        [
          'world',
          null,
          ['F1'],
          'The signal led to Varga Relay, a derelict station at the edge of the sector, and the ship ' +
            'now holds in its sensor shadow, where one row of windows is still lit.',
        ],
      ),
    );
    const recap = await http.stream('/recaps', { commandId: id('session:2:recap') });
    http.committed(recap);

    // --- Beat 2: framing the scene -------------------------------------------
    script.at('Beat 2');
    say('scene_frame_plan', {
      kind: 'structured',
      value: {
        review: 'Varga Relay is a derelict whose condition is not yet established.',
        recipes: [{ recipe: 'derelict', reason: 'The crew arrives at a derelict station.' }],
        questions: [],
      },
    });
    say(
      'scene_frame',
      segments(
        [
          'world',
          null,
          ['F1', 'F2'],
          'Varga Relay turns slowly against the ice, its docking ring breached in two places and ' +
            'venting a thin, glittering plume.',
        ],
        [
          'world',
          null,
          ['F3'],
          "Its antenna mast still pulses on schedule, sending the Meridian's Hope signal out into the " +
            'dark as it has for years.',
        ],
        [
          'world',
          null,
          ['F4'],
          'Through the breach, the lit corridors show panels hanging open and conduits spilling from ' +
            'the walls. Whatever keeps that signal running is somewhere inside.',
        ],
      ),
    );
    const frame = await rolling(d100(65, 70, 41), () =>
      http.stream('/scene-frames', { commandId: id('scene:2:frame') }),
    );
    http.committed(frame);

    // --- Beat 3: a player decision gets depth --------------------------------
    script.at('Beat 3');
    const junoAction = 'Juno jacks into the docking port and pulls the station logs.';
    // A19: had Christopher typed the action without picking a move, the Guide would suggest one.
    say('move_suggestion', {
      kind: 'structured',
      value: {
        moveId: GATHER_INFORMATION,
        rollOption: 'wits',
        triggerText: 'When you search for clues',
        reason: 'Pulling the station logs is searching for what happened here.',
        confidence: 'high',
      },
    });
    const suggestion = await http.post<SuggestMoveResponse>('/move-suggestions', {
      commandId: id('juno-logs:suggestion'),
      actorCharacterId: juno,
      actionText: junoAction,
    });
    // He picks Gather Information himself.
    const junoScan = await move(
      'juno-logs',
      {
        moveId: GATHER_INFORMATION,
        actorCharacterId: juno,
        using: { using: 'stat', stat: 'wits' },
        actionText: junoAction,
      },
      action(3, [4, 9]),
      'weak_hit',
    );
    say('trigger_check', {
      kind: 'structured',
      value: {
        fits: true,
        triggerText: null,
        reason: 'Pulling logs is gathering information.',
        confidence: 'high',
      },
    });
    const junoTrigger = await http.post<CheckTriggerResponse>('/trigger-checks', {
      commandId: id('juno-logs:trigger'),
      moveCommandId: id('juno-logs:move'),
    });
    say('complication_options', {
      kind: 'structured',
      value: {
        options: [
          {
            text: 'The station was abandoned, yet one life-support circuit is still drawing power.',
            cites: ['O1.action', 'O1.theme'],
          },
          {
            text: 'The logs were wiped on purpose, and the wipe finished only days ago.',
            cites: ['O2.action', 'O2.theme'],
          },
          {
            text: 'Jacking in woke an automated lockdown that is sealing the inner ring.',
            cites: ['O3.action', 'O3.theme'],
          },
        ],
      },
    });
    const options = await rolling(d100(12, 70, 45, 33, 88, 5), () =>
      http.post<OfferComplicationsResponse>('/complication-options', {
        commandId: id('juno-logs:options'),
        moveCommandId: id('juno-logs:move'),
      }),
    );
    if (!options.ok) {
      throw new Error(
        `Fixture ${GOLDEN_SESSION}, ${script.beat}: no complication options — ${options.message}`,
      );
    }
    const complication = await http.post<SetComplicationResponse>('/complications', {
      commandId: id('juno-logs:complication'),
      moveCommandId: id('juno-logs:move'),
      text: options.options[0]!.text,
      offeredEventId: options.eventId,
      optionIndex: 0,
    });
    const junoPassage = await narrate(
      'juno-logs',
      id('juno-logs:move'),
      segments(
        [
          'character_does',
          'Juno',
          ['F2'],
          'Juno jacks into the docking port and pulls the station logs.',
        ],
        [
          'world',
          null,
          ['F3'],
          'They come back in fragments: evacuation orders, a manifest cut off mid-line, a final ' +
            'all-hands call that nobody answered.',
        ],
        [
          'world',
          null,
          ['F5'],
          'The station was abandoned. Yet under the static, one life-support circuit is still drawing ' +
            'power, humming low and steady somewhere deep in the ring.',
        ],
      ),
    );
    say('world_plan', nothingNew('The logs and the circuit are already in the passage.'));
    http.committed(await worldPass('juno-logs', junoPassage));

    // --- Beat 4: the stall and the nudge ---------------------------------------
    script.at('Beat 4');
    say('what_now', {
      kind: 'structured',
      value: {
        suggestions: [
          {
            character: 'Vesna',
            actionText: "Vesna traces the power draw with the Lantern Wake's sensors.",
            moveId: GATHER_INFORMATION,
            reason: 'The live circuit is the one sign of what is still running aboard.',
            anchors: ['A1'],
          },
          {
            character: 'Rook',
            actionText: 'Rook secures the airlock before anyone goes deeper.',
            moveId: SECURE_AN_ADVANTAGE,
            reason: 'The crew is at a breached station with no way to know what is inside.',
            anchors: ['A1'],
          },
          {
            character: 'Juno',
            actionText: 'The crew pushes toward the station core.',
            moveId: 'move:exploration/undertake-an-expedition',
            reason: "The recorder's trail leads deeper into the relay.",
            anchors: ['A1'],
          },
        ],
      },
    });
    const whatNow = await http.post<SuggestActionsResponse>('/action-suggestions', {
      commandId: id('what-now'),
    });

    // --- Beat 5: helping an ally, and a momentum decision ----------------------
    script.at('Beat 5');
    const rookAid = await move(
      'rook-airlock',
      {
        moveId: SECURE_AN_ADVANTAGE,
        actorCharacterId: rook,
        aidingAllyId: vesna,
        using: { using: 'stat', stat: 'iron' },
        actionText: 'Rook covers the airlock while Vesna runs the scan.',
      },
      action(4, [2, 5]),
      'strong_hit',
    );
    const rookPassage = await narrate(
      'rook-airlock',
      id('rook-airlock:move'),
      segments(
        ['character_does', 'Rook', ['F2'], 'Rook covers the airlock.'],
        [
          'world',
          null,
          ['F3'],
          'The outer door holds, and the corridor beyond it stays dark and still.',
        ],
      ),
    );
    say('world_plan', nothingNew('Nothing new enters the world at the airlock.'));
    http.committed(await worldPass('rook-airlock', rookPassage));

    const vesnaAction = "Vesna traces the power draw with the Lantern Wake's sensors.";
    const vesnaScan = await move(
      'vesna-scan',
      {
        moveId: GATHER_INFORMATION,
        actorCharacterId: vesna,
        using: { using: 'stat', stat: 'wits' },
        actionText: vesnaAction,
      },
      action(2, [6, 3]),
      'weak_hit',
    );
    say('trigger_check', {
      kind: 'structured',
      value: {
        fits: true,
        triggerText: null,
        reason: 'A sensor trace is gathering information.',
        confidence: 'high',
      },
    });
    await http.post<CheckTriggerResponse>('/trigger-checks', {
      commandId: id('vesna-scan:trigger'),
      moveCommandId: id('vesna-scan:move'),
    });
    const { tierAfter: burnedTo } = await http.post<{ tierAfter: OutcomeTier }>('/moves/burn', {
      commandId: id('vesna-scan:burn'),
      rollEventId: vesnaScan.rollEventId,
    });

    // --- Beat 6: the world gets a new face --------------------------------------
    script.at('Beat 6');
    const vesnaPassage = await narrate(
      'vesna-scan',
      id('vesna-scan:move'),
      segments(
        [
          'character_does',
          'Vesna',
          ['F2'],
          "Vesna traces the power draw with the Lantern Wake's sensors.",
        ],
        [
          'world',
          null,
          ['F3'],
          'The trace runs past the dead ring to a single sealed compartment, and inside it, a heat ' +
            'signature: someone is alive aboard.',
        ],
      ),
    );
    say('world_plan', {
      kind: 'structured',
      value: {
        review: 'The scan found someone alive aboard, who is not yet established.',
        recipes: [{ recipe: 'npc', reason: 'Someone is alive aboard.' }],
        questions: [],
      },
    });
    const npcFields = (firstLookCite: string) => ({
      instance: 'E1',
      name: 'Valda Thorn',
      nameCites: ['E1.given_name', 'E1.family_name'],
      fields: [
        { slot: 'role', text: 'The technician who kept the relay running.', cites: ['E1.role'] },
        {
          slot: 'goal',
          text: 'Defends the station against anyone who comes aboard.',
          cites: ['E1.goal'],
        },
        {
          slot: 'first_look',
          text: 'Weathered, in a patched station suit.',
          cites: [firstLookCite],
        },
        { slot: 'disposition', text: 'Suspicious of the crew.', cites: ['E1.disposition'] },
      ],
    });
    say(
      'world_interpret',
      {
        kind: 'structured',
        value: {
          rerolls: [
            {
              roll: 'E1.first_look',
              reason: 'The evacuation logs say everyone else left, so she cannot be accompanied.',
            },
          ],
          entities: [],
        },
      },
      { kind: 'structured', value: { rerolls: [], entities: [npcFields('E1.first_lookr1')] } },
    );
    say(
      'world_passage',
      segments([
        'world',
        null,
        ['F1'],
        'The comms crackle open. "Whoever you are, stay off my station," says Valda Thorn, and the ' +
          'channel goes quiet again, though it stays open.',
      ]),
    );
    const firstContact = await worldPass(
      'vesna-scan',
      vesnaPassage,
      d100(89, 21, 4, 45, 91, 8, 88),
    );
    http.committed(firstContact);

    // --- Beat 7: a miss and the price ---------------------------------------------
    script.at('Beat 7');
    const bulkhead = 'Rook forces the sealed bulkhead between the crew and the survivor.';
    const rookEdge = await move(
      'rook-bulkhead-edge',
      {
        moveId: FACE_DANGER,
        actorCharacterId: rook,
        using: { using: 'stat', stat: 'edge' },
        actionText: bulkhead,
      },
      action(5, [3, 4]),
      'strong_hit',
    );
    const voided = await http.post<VoidEventResponse>(
      `/events/${rookEdge.invocationEventId}/void`,
      {
        commandId: id('rook-bulkhead-edge:void'),
        reason: 'Rook is forcing the bulkhead, so it is +iron, not +edge.',
      },
    );
    const rookIron = await move(
      'rook-bulkhead',
      {
        moveId: FACE_DANGER,
        actorCharacterId: rook,
        using: { using: 'stat', stat: 'iron' },
        actionText: bulkhead,
      },
      action(1, [8, 9]),
      'miss',
    );
    const price = await rolling(d100(80), () =>
      http.post<ResolvePayThePriceResponse>('/pay-the-price', {
        commandId: id('rook-bulkhead:price'),
        actorCharacterId: rook,
        optionId: 'table',
        chainedFromCommandId: id('rook-bulkhead:move'),
      }),
    );
    say('harm_proposal', {
      kind: 'structured',
      value: {
        amount: -2,
        injury: "A ruptured conduit sprays sparks across Rook's arm.",
        reason: 'A serious burn.',
      },
    });
    const proposal = await http.post<ProposeAmountResponse>('/amount-proposals', {
      commandId: id('rook-harm:proposal'),
      moveId: ENDURE_HARM,
      actorCharacterId: rook,
      chainedFromCommandId: id('rook-bulkhead:price'),
    });
    if (!proposal.ok) {
      throw new Error(
        `Fixture ${GOLDEN_SESSION}, ${script.beat}: no harm proposal — ${proposal.message}`,
      );
    }
    // Rook's armor took the worst of it.
    const endureHarm = await move(
      'rook-harm',
      {
        moveId: ENDURE_HARM,
        actorCharacterId: rook,
        using: { using: 'stat', stat: 'iron' },
        preRollAmount: -1,
        proposalEventId: proposal.eventId,
        chainedFromCommandId: id('rook-bulkhead:price'),
      },
      action(3, [5, 9]),
      'weak_hit',
    );
    if (endureHarm.pendingChoice !== undefined) {
      await http.post('/moves/choice', {
        commandId: id('rook-harm:choice'),
        rollEventId: endureHarm.pendingChoice.rollEventId,
        choiceId: endureHarm.pendingChoice.choiceId,
        optionIds: [],
      });
    }
    const harmPassage = await narrate(
      'rook-bulkhead',
      id('rook-harm:move'),
      segments(
        [
          'character_does',
          'Rook',
          ['F2'],
          'Rook sets his shoulder to the sealed bulkhead and heaves.',
        ],
        [
          'world',
          null,
          ['F3', 'F7'],
          'It does not give. A conduit behind the panel ruptures instead, and the sparks come in a sheet.',
        ],
        [
          'character_undergoes',
          'Rook',
          ['F11', 'F13'],
          "The sparks spray across Rook's arm, and the worst of it scorches the armor plating.",
        ],
        [
          'character_undergoes',
          'Rook',
          ['F13'],
          "A thin burn opens along Rook's forearm, and the sleeve smoulders.",
        ],
      ),
    );

    // --- Beat 8: pressure builds ------------------------------------------------------
    script.at('Beat 8');
    say('world_plan', {
      kind: 'structured',
      value: {
        review: 'Forcing the bulkhead tripped emergency load-shedding.',
        recipes: [],
        questions: [],
        clocks: {
          create: [
            {
              title: 'Station power failing',
              segments: 4,
              filled: 1,
              reason: 'Forcing the bulkhead tripped emergency load-shedding.',
            },
          ],
          tick: [],
        },
      },
    });
    const clockPass = await worldPass('rook-bulkhead', harmPassage);
    http.committed(clockPass);

    // --- Beat 9: corrections --------------------------------------------------------------
    script.at('Beat 9');
    say('revision', {
      kind: 'text',
      text:
        'Rook sets his shoulder to the sealed bulkhead and heaves. It does not give. A conduit behind ' +
        "the panel ruptures instead, and the sparks come in a sheet across Rook's arm. The armor " +
        'plating takes the worst of it, and the sleeve beneath is scorched.',
    });
    const correction = await http.stream(`/narrations/${harmPassage}/corrections`, {
      commandId: id('rook-bulkhead:correction'),
      note: "Rook's armor took the worst of it: there is no open burn, only a scorched sleeve.",
    });
    http.committed(correction);

    const junoMomentum = (await http.get<CampaignStateResponse>('/state')).state.characters[juno]!
      .momentum.value;
    const override = await http.post<OverrideResponse>('/overrides', {
      commandId: id('juno:override'),
      target: { kind: 'momentum', characterId: juno },
      to: junoMomentum + 1,
      reason: "A ruling from last session left Juno's momentum one too low.",
    });

    // --- Beat 10: ending the session ----------------------------------------------------------
    script.at('Beat 10');
    const summaryText =
      'At Varga Relay, Juno pulled the station logs and found the relay abandoned, with one ' +
      'life-support circuit still drawing power. Vesna traced it to a sealed compartment and a ' +
      'survivor, Valda Thorn, who warned the crew off over comms. Forcing the bulkhead toward her ' +
      "burned Rook's arm and tripped emergency load-shedding, and the station's power is now failing.";
    say('session_summary', {
      kind: 'structured',
      value: {
        summary: summaryText,
        openThreads: [
          "Valda Thorn's intent",
          "The station's failing power",
          "Where the Meridian's Hope flight recorder is",
        ],
      },
    });
    const summary = await http.post<ProposeSessionSummaryResponse>('/session-summaries', {
      commandId: id('session:2:summary'),
    });
    if (!summary.ok) {
      throw new Error(`Fixture ${GOLDEN_SESSION}, ${script.beat}: no summary — ${summary.message}`);
    }
    const ended = await http.post<EndSessionResponse>('/session-ends', {
      commandId: id('session:2:end'),
      proposalEventId: summary.eventId,
      summary: summary.summary,
      openThreads: summary.openThreads,
    });

    script.assertSpent();

    return {
      ...run,
      sessionTwoId: began.sessionId,
      beats: {
        began,
        recap,
        frame,
        suggestion,
        junoScan,
        junoTrigger,
        options,
        complication,
        junoPassage,
        whatNow,
        rookAid,
        vesnaScan,
        burnedTo,
        vesnaPassage,
        firstContact,
        rookEdge,
        voided,
        rookIron,
        price,
        proposal,
        endureHarm,
        harmPassage,
        clockPass,
        correction,
        override,
        summary,
        ended,
      },
      requests: guide.requests,
    };
  } finally {
    await script.close();
  }
}
