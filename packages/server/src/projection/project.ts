import {
  applyMomentumDelta,
  momentumMax,
  momentumResetValue,
  STARSHIP_ASSET_ID,
} from '@astrolabe/rules';
import type { CharacterId, ImpactId, MeterId, TrackId } from '@astrolabe/rules';
import type {
  AstrolabeEvent,
  CampaignState,
  CharacterState,
  Delta,
  EntityId,
  FieldProvenance,
  MeterState,
  SupersededCharacter,
  TokenUsage,
  TrackState,
} from '@astrolabe/shared';

import { PROGRESS_TRACK_MAX_TICKS, emptyState } from './state.js';
import { computeVoidState, isSuppressed, type VoidState } from './void-state.js';

/**
 * The projector: `fold(events) → CampaignState`, and nothing else.
 *
 * It is pure by construction and by lint. No RNG, no clock, no I/O, and no
 * reads of versioned rules content — `eslint.config.js` enforces all four
 * for this directory. Pure *functions* from `rules` are fine and used here
 * (`applyMomentumDelta`, `momentumMax`, `momentumResetValue`); the
 * `STARFORGED` dataset is not, because a Datasworn regeneration must never
 * change what an old campaign's numbers were.
 *
 * That is why events carry resolved deltas rather than instructions to
 * recompute them: which effects a weak hit produces is versioned content,
 * decided once at write time.
 */

/**
 * Project a whole log. Two passes, and the order matters: a void appears
 * *after* the events it suppresses, so the void set has to be known before
 * the fold begins.
 */
export function project(events: readonly AstrolabeEvent[]): CampaignState {
  const voids = computeVoidState(events);
  return projectWithVoids(events, voids);
}

function projectWithVoids(events: readonly AstrolabeEvent[], voids: VoidState): CampaignState {
  let state = emptyState();
  for (const event of events) {
    if (isSuppressed(event, voids)) {
      continue;
    }
    state = applyEvent(state, event);
  }
  return state;
}

/**
 * Apply one event to a projected state.
 *
 * This is the incremental path, and it is an optimisation rather than a
 * second source of truth: `project` is the definition, and the memoized
 * state a caller keeps can be dropped at any moment with no consequence
 * beyond a rebuild.
 *
 * **It is only valid for events that suppress nothing.** An `event.voided`
 * retroactively removes the effect of events already folded in, so there is
 * no incremental step for it — `canApplyIncrementally` says so, and a
 * caller that sees `false` must re-run `project`.
 */
export function canApplyIncrementally(event: AstrolabeEvent): boolean {
  return event.type !== 'event.voided';
}

export function applyEvent(state: CampaignState, event: AstrolabeEvent): CampaignState {
  const by = provenanceOf(event);

  switch (event.type) {
    case 'campaign.created':
      return {
        ...state,
        campaign: {
          id: event.campaignId,
          name: event.payload.name,
          settings: event.payload.settings,
        },
      };

    case 'character.created': {
      const { payload } = event;
      const meters = {} as Record<MeterId, MeterState>;
      for (const meter of ['health', 'spirit', 'supply'] as const) {
        const snapshot = payload.meters[meter];
        meters[meter] = {
          value: snapshot.value,
          // Bounds are snapshotted onto the character at creation because
          // ConditionMeterDef lives in STARFORGED, which the projector may
          // not read. This is also the shape a later asset needs when it
          // raises a character's maximum supply above the rulebook default.
          min: snapshot.min,
          max: snapshot.max,
          lastChangedBy: by,
        };
      }
      const character = normaliseCharacter({
        id: payload.characterId,
        name: payload.name,
        callsign: payload.callsign,
        stats: payload.stats,
        meters,
        momentum: { value: payload.momentum, max: 0, resetValue: 0, lastChangedBy: by },
        impacts: {},
        markedImpacts: 0,
        // D-193: a Milestone 1 character's granted Starship is the crew's ship,
        // not one of their assets. The event keeps it forever; the fold moves
        // it to a flag, so readiness, the crew form, the move composer and
        // world context all see one answer.
        assets: payload.assets.filter((asset) => asset !== STARSHIP_ASSET_ID),
        ...(payload.assets.includes(STARSHIP_ASSET_ID)
          ? { legacyStarshipGrant: true as const }
          : {}),
        vowTrackIds: [],
        hooks: payload.hooks ?? [],
        pronouns: payload.pronouns ?? null,
        ...(payload.appearance !== undefined ? { appearance: payload.appearance } : {}),
        ...(payload.backstory !== undefined ? { backstory: payload.backstory } : {}),
        ...(payload.backgroundVow !== undefined ? { backgroundVow: payload.backgroundVow } : {}),
        ...(payload.signatureGear !== undefined ? { signatureGear: payload.signatureGear } : {}),
        // D-184. The log facts are knowable for every character; the two
        // acceptance fields are absent on a Milestone 1 one, which recorded
        // neither.
        eventId: event.id,
        seq: event.seq,
        ...(payload.provenance !== undefined ? { provenance: payload.provenance } : {}),
        ...(payload.groundedIn !== undefined ? { groundedIn: payload.groundedIn } : {}),
      });
      return withCharacter(state, character);
    }

    case 'session.began':
      return {
        ...state,
        session: {
          id: event.payload.sessionId,
          number: event.payload.number,
          startedAt: event.occurredAt,
          tokenUsage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        },
      };

    case 'session.ended': {
      if (state.session === null) {
        return state;
      }
      return {
        ...state,
        session: { ...state.session, endedAt: event.occurredAt },
        canon: {
          ...state.canon,
          sessionSummaries: [
            ...state.canon.sessionSummaries,
            {
              number: state.session.number,
              summary: event.payload.summary,
              openThreads: event.payload.openThreads,
            },
          ],
        },
      };
    }

    case 'scene.started':
      return {
        ...state,
        scene: {
          id: event.payload.sceneId,
          title: event.payload.title,
          ...(event.payload.locationId !== undefined
            ? { locationId: event.payload.locationId }
            : {}),
        },
      };

    case 'move.invoked':
      return consumeBonus(state, event);

    case 'dice.rolled':
    case 'momentum.burned':
    case 'move.choice_made':
    case 'move.method_chosen':
    case 'move.chained':
    case 'oracle.rolled':
    case 'character.proposed':
    case 'incident.proposed':
    case 'move.suggested':
    case 'actions.suggested':
    case 'session.summary_proposed':
    case 'move.trigger_noted':
    case 'complication.offered':
    case 'complication.set':
    case 'amount.proposed':
    case 'amount.committed':
      // None of these change projected state. Rolls, chains, oracle results,
      // choice picks and committed amounts all belong to the beat the player
      // is reading, so they are part of the narrative log read model (task
      // 2.4b), not this bounded one. Whatever mechanical change a choice or
      // a committed amount causes rides in an accompanying `state.changed`,
      // the same split `momentum.burned`/its `momentum_reset` delta already
      // uses.
      return state;

    case 'state.changed': {
      const reason =
        event.payload.cause.kind === 'ai_judgement' ? event.payload.cause.reason : undefined;
      let next = state;
      for (const change of event.payload.changes) {
        next = applyDelta(next, change.delta, {
          ...by,
          ...(reason !== undefined ? { reason } : {}),
        });
      }
      return next;
    }

    case 'state.overridden':
      return applyOverride(state, event, by);

    case 'track.created': {
      const { payload } = event;
      const reason = payload.kind === 'clock' ? payload.cause : undefined;
      const track: TrackState = {
        id: payload.trackId,
        kind: payload.kind,
        title: payload.title,
        ...(payload.kind === 'clock'
          ? { ticks: 0, maxTicks: payload.segments }
          : { rank: payload.rank, ticks: 0, maxTicks: PROGRESS_TRACK_MAX_TICKS }),
        lastChangedBy: {
          ...by,
          ...(reason?.kind === 'ai_judgement' ? { reason: reason.reason } : {}),
        },
      };
      const withTrack = { ...state, tracks: { ...state.tracks, [track.id]: track } };
      // A vow belongs to the character who swore it, so the sheet can list
      // it without scanning every track in the campaign.
      if (payload.kind !== 'vow' || payload.characterId === undefined) {
        return withTrack;
      }
      return updateCharacter(withTrack, payload.characterId, (c) => ({
        ...c,
        vowTrackIds: [...c.vowTrackIds, payload.trackId],
      }));
    }

    case 'track.advanced': {
      const existing = state.tracks[event.payload.trackId];
      if (existing === undefined) {
        return state;
      }
      const reason =
        event.payload.cause.kind === 'ai_judgement' ? event.payload.cause.reason : undefined;
      const advanced: TrackState = {
        ...existing,
        ticks: clamp(existing.ticks + event.payload.ticks, 0, existing.maxTicks),
        lastChangedBy: { ...by, ...(reason !== undefined ? { reason } : {}) },
      };
      return { ...state, tracks: { ...state.tracks, [advanced.id]: advanced } };
    }

    case 'entity.established': {
      const { payload } = event;
      return {
        ...state,
        entities: {
          ...state.entities,
          [payload.entityId]: {
            id: payload.entityId,
            kind: payload.kind,
            name: payload.name,
            fields: payload.fields,
            provenance: {
              establishedBy: payload.provenance.establishedBy,
              ...(payload.provenance.recipeId !== undefined
                ? { recipeId: payload.provenance.recipeId }
                : {}),
              groundedIn: payload.provenance.groundedIn,
              eventId: event.id,
            },
          },
        },
      };
    }

    case 'narration.written':
      // D-141: a scene is framed once; the header offers to frame it until then.
      return event.payload.role === 'scene_frame' &&
        state.scene !== null &&
        event.sceneId === state.scene.id
        ? { ...state, scene: { ...state.scene, framedBy: event.id } }
        : state;
    case 'narration.correction_requested':
    case 'narration.revised':
    case 'narration.withdrawn':
      // Narration and its corrections are the narrative log's business.
      // A15's requirement that a correction change nothing mechanical is
      // this line.
      return state;

    case 'event.voided':
      // Handled in the pass before the fold: a void suppresses events that
      // appear earlier in the log, which a forward pass cannot do.
      return state;

    case 'truth.set': {
      // D-183: one truth representation. No command writes this type any more,
      // but every Milestone 1 campaign has them, so the arm stays and folds
      // into the same read model rather than a second one.
      //
      // Not an upcaster: the versioning rule is explicit that a genuinely
      // different fact is a new type, not a new version. It maps only what the
      // event already stored — there is no option index to recover, and the
      // projector may not read rules content to find one (D-176).
      const { payload } = event;
      return {
        ...state,
        launch: {
          ...state.launch,
          truthDecisions: {
            ...state.launch.truthDecisions,
            [payload.oracleId]: {
              truthId: payload.oracleId,
              resolution:
                payload.source === 'picked'
                  ? 'selected'
                  : payload.source === 'rolled'
                    ? 'rolled'
                    : 'custom',
              text: payload.text,
              provenance:
                payload.source === 'picked'
                  ? 'official_choice'
                  : payload.source === 'rolled'
                    ? 'oracle_roll'
                    : 'player_written',
              groundedIn: [],
              eventId: event.id,
              seq: event.seq,
            },
          },
        },
      };
    }

    case 'sector.route_added': {
      const { payload } = event;
      return {
        ...state,
        sector: {
          routes: [
            ...state.sector.routes,
            { from: payload.fromLocationId, to: payload.toLocationId },
          ],
        },
      };
    }

    case 'launch.draft_saved':
      return {
        ...state,
        launch: {
          ...state.launch,
          // D-182: the snapshot plus where it sits, so a section's form can
          // tell a draft saved after an accepted fact from one saved before it.
          drafts: {
            ...state.launch.drafts,
            [event.payload.section]: { snapshot: event.payload.snapshot, seq: event.seq },
          },
        },
      };
    case 'creation.proposed':
      // Projected so acceptance can resolve a proposal's causality and A41 can
      // link an accepted fact back to the proposal it came from. Still not
      // canon: nothing reads it as an established fact (D-161).
      return {
        ...state,
        launch: {
          ...state.launch,
          proposals: {
            ...state.launch.proposals,
            [event.payload.targetId]: { ...event.payload, eventId: event.id },
          },
        },
      };
    case 'campaign.foundation_set':
      return {
        ...state,
        launch: {
          ...state.launch,
          foundation: { ...event.payload, eventId: event.id, seq: event.seq },
        },
      };
    case 'truth.decided': {
      // A26: the answer this one supersedes stays readable. Projection is
      // latest-wins by design and `truth.decided` never reaches the narrative
      // log, so without keeping the chain here the earlier answer is written
      // and unreadable.
      const superseded = state.launch.truthDecisions[event.payload.truthId];
      const history = state.launch.truthHistory[event.payload.truthId] ?? [];
      return {
        ...state,
        launch: {
          ...state.launch,
          truthDecisions: {
            ...state.launch.truthDecisions,
            [event.payload.truthId]: { ...event.payload, eventId: event.id, seq: event.seq },
          },
          ...(superseded === undefined
            ? {}
            : {
                truthHistory: {
                  ...state.launch.truthHistory,
                  [event.payload.truthId]: [...history, superseded],
                },
              }),
        },
      };
    }
    case 'character.revised': {
      // Read before replacing: `updateCharacter` overwrites in place, so by the
      // time its callback returns the superseded version is gone. Same
      // read-then-push ordering `truth.decided` uses, for the same reason.
      const superseded = state.characters[event.payload.characterId];
      const withHistory =
        superseded === undefined
          ? state
          : {
              ...state,
              launch: {
                ...state.launch,
                crewHistory: {
                  ...state.launch.crewHistory,
                  [event.payload.characterId]: [
                    ...(state.launch.crewHistory[event.payload.characterId] ?? []),
                    supersededCharacter(superseded),
                  ],
                },
              },
            };
      return updateCharacter(withHistory, event.payload.characterId, (current) => ({
        ...current,
        name: event.payload.character.name,
        callsign: event.payload.character.callsign,
        stats: event.payload.character.stats,
        // `...current` keeps a legacy grant's flag; the revision's own assets
        // are filtered the same way, though the launch validator already
        // refuses a character-owned command vehicle (D-171).
        assets: event.payload.character.assets.filter((asset) => asset !== STARSHIP_ASSET_ID),
        hooks: event.payload.character.hooks ?? [],
        pronouns: event.payload.character.pronouns ?? null,
        appearance: event.payload.character.appearance,
        backstory: event.payload.character.backstory,
        backgroundVow: event.payload.character.backgroundVow,
        ...(event.payload.character.signatureGear !== undefined
          ? { signatureGear: event.payload.character.signatureGear }
          : {}),
        // The revision is now the event that accepted this character, so it is
        // what the next revision supersedes and what D-182 compares (D-184).
        eventId: event.id,
        seq: event.seq,
        provenance: event.payload.provenance,
        groundedIn: event.payload.groundedIn,
      }));
    }
    case 'character.removed': {
      const removed = state.characters[event.payload.characterId];
      if (removed === undefined) return state;
      const { [event.payload.characterId]: _dropped, ...characters } = state.characters;
      // The character's own vow tracks go with them (6.0d). Nothing else can
      // drop a track — void is bounded to the current session (D-84) and every
      // pre-launch event has none — so leaving them would strand a vow on a
      // crew member who is not there. A shared vow cannot be caught by this:
      // it is created at activation, after which removal is refused.
      const tracks = Object.fromEntries(
        Object.entries(state.tracks).filter(([id]) => !removed.vowTrackIds.includes(id as TrackId)),
      );
      return {
        ...state,
        characters,
        tracks,
        launch: {
          ...state.launch,
          // What was removed stays answerable (A40): the final version joins
          // the history rather than being orphaned beside it.
          crewHistory: {
            ...state.launch.crewHistory,
            [event.payload.characterId]: [
              ...(state.launch.crewHistory[event.payload.characterId] ?? []),
              supersededCharacter(removed),
            ],
          },
        },
      };
    }
    case 'track.revised':
      // D-188: the words, and only the words. A vow's progress, kind and owner
      // are not what a revision changed.
      return state.tracks[event.payload.trackId] === undefined
        ? state
        : {
            ...state,
            tracks: {
              ...state.tracks,
              [event.payload.trackId]: {
                ...state.tracks[event.payload.trackId]!,
                title: event.payload.title,
                ...(event.payload.rank !== undefined ? { rank: event.payload.rank } : {}),
              },
            },
          };
    case 'starship.established':
      return {
        ...state,
        launch: {
          ...state.launch,
          starship: { ...withoutModules(event.payload), eventId: event.id, seq: event.seq },
        },
      };
    case 'starship.revised':
      return {
        ...state,
        launch: {
          ...state.launch,
          // 7.0f: the version this replaces stays readable, with its own
          // acceptance rather than the revision's.
          starshipHistory:
            state.launch.starship === undefined
              ? state.launch.starshipHistory
              : [...state.launch.starshipHistory, state.launch.starship],
          // The revision nests the ship and keeps its acceptance alongside, so
          // both halves are carried; the projected fact has one shape either way.
          starship: {
            ...withoutModules(event.payload.starship),
            provenance: event.payload.provenance,
            groundedIn: event.payload.groundedIn,
            ...(event.payload.supersedesEventId === undefined
              ? {}
              : { supersedesEventId: event.payload.supersedesEventId }),
            eventId: event.id,
            seq: event.seq,
          },
        },
      };
    case 'sector.configured':
      return {
        ...state,
        launch: {
          ...state.launch,
          // 8.0h: the version this replaces stays readable (A40).
          sectorHistory:
            state.launch.sector === undefined
              ? state.launch.sectorHistory
              : [...state.launch.sectorHistory, state.launch.sector],
          sector: { ...event.payload, eventId: event.id, seq: event.seq },
        },
      };
    case 'location.added':
    case 'location.revised': {
      // Read before replacing, as `truth.decided` does (8.0h, A40).
      const superseded = state.launch.locations[event.payload.id];
      return {
        ...state,
        launch: {
          ...state.launch,
          locations: {
            ...state.launch.locations,
            [event.payload.id]: { ...event.payload, eventId: event.id, seq: event.seq },
          },
          ...(superseded === undefined
            ? {}
            : {
                locationHistory: withHistory(
                  state.launch.locationHistory,
                  event.payload.id,
                  superseded,
                ),
              }),
        },
      };
    }
    case 'location.removed': {
      // Removed means gone from the projection; the log still holds the
      // add and the removal. The tombstone this used to leave behind was
      // shaped like nothing else in `locations`, and every reader had to
      // remember to filter it out by guessing at its fields.
      const { [event.payload.locationId]: removed, ...locations } = state.launch.locations;
      // Its map position goes with it (8.0g). Left behind, the client's next
      // complete-layout write would name a node the command no longer knows,
      // and be refused for a position the player never saw.
      const { [event.payload.locationId]: _placed, ...layout } = state.launch.layout;
      // What was removed stays answerable, as a removed crew member does (8.0h).
      const locationHistory =
        removed === undefined
          ? state.launch.locationHistory
          : withHistory(state.launch.locationHistory, event.payload.locationId, removed);
      return { ...state, launch: { ...state.launch, locations, layout, locationHistory } };
    }
    case 'route.added':
    case 'route.revised':
      return {
        ...state,
        launch: {
          ...state.launch,
          // A revision replaces the route it supersedes. Appending it left two
          // entries for one passage, which counted twice against the region's
          // baseline (A31).
          routes: [
            ...state.launch.routes.filter(
              (route) => route.eventId !== event.payload.supersedesEventId,
            ),
            { ...event.payload, eventId: event.id, seq: event.seq },
          ],
        },
      };
    case 'route.removed':
      return {
        ...state,
        launch: {
          ...state.launch,
          // `supersedesEventId` names the event that *added* the route, so the
          // match is against that route's own `eventId`. It used to compare
          // against the route's acceptance `supersedesEventId`, which is
          // undefined on a freshly added route, so nothing was ever removed —
          // and a tombstone was appended, inflating the passage count instead.
          routes: state.launch.routes.filter(
            (route) => route.eventId !== event.payload.supersedesEventId,
          ),
        },
      };
    case 'sector.layout_changed':
      return { ...state, launch: { ...state.launch, layout: event.payload.coordinates } };
    case 'starting_settlement.selected':
      return {
        ...state,
        launch: {
          ...state.launch,
          startingSettlementId: event.payload.settlementId,
          startingSettlementEventId: event.id,
        },
      };
    case 'trouble.established':
    case 'trouble.revised': {
      const superseded = state.launch.troubles[event.payload.troubleId];
      return {
        ...state,
        launch: {
          ...state.launch,
          troubles: {
            ...state.launch.troubles,
            [event.payload.troubleId]: { ...event.payload, eventId: event.id, seq: event.seq },
          },
          ...(superseded === undefined
            ? {}
            : {
                troubleHistory: withHistory(
                  state.launch.troubleHistory,
                  event.payload.troubleId,
                  superseded,
                ),
              }),
        },
      };
    }
    case 'connection.established':
    case 'connection.revised':
      return {
        ...state,
        launch: {
          ...state.launch,
          connection: { ...event.payload, eventId: event.id, seq: event.seq },
        },
      };
    case 'incident.accepted':
      return {
        ...state,
        launch: {
          ...state.launch,
          incident: { ...event.payload, eventId: event.id, seq: event.seq },
        },
      };
    case 'incident.revised':
      return {
        ...state,
        launch: {
          ...state.launch,
          incident: { ...event.payload, eventId: event.id, seq: event.seq },
        },
      };
    case 'campaign.activated':
      return {
        ...state,
        launch: {
          ...state.launch,
          phase: 'active',
          activation: {
            eventId: event.id,
            sessionId: event.payload.sessionId,
            sceneId: event.payload.sceneId,
            pendingVow: event.payload.pendingVow,
          },
        },
      };
    case 'launch.fact_amended':
      return {
        ...state,
        launch: { ...state.launch, amendments: [...state.launch.amendments, event.payload] },
      };

    case 'ai.completed':
    case 'ai.failed': {
      // D-85: counted even inside a voided cascade. `isSuppressed` never
      // skips these types, because the tokens were spent whatever the
      // fiction now says. A failed call counts whatever it spent before it
      // failed (D-113). The campaign total counts every call; the session
      // counter only the calls made while a session is open (D-125).
      const { payload } = event;
      const cached =
        'cacheReadTokens' in payload || 'cacheWriteTokens' in payload
          ? { read: payload.cacheReadTokens ?? 0, write: payload.cacheWriteTokens ?? 0 }
          : { read: 0, write: 0 };
      const add = (usage: TokenUsage): TokenUsage => ({
        input: usage.input + (payload.inputTokens ?? 0),
        output: usage.output + (payload.outputTokens ?? 0),
        cacheRead: usage.cacheRead + cached.read,
        cacheWrite: usage.cacheWrite + cached.write,
      });
      return {
        ...state,
        tokenUsage: add(state.tokenUsage),
        ...(state.session !== null
          ? { session: { ...state.session, tokenUsage: add(state.session.tokenUsage) } }
          : {}),
      };
    }
  }
}

function provenanceOf(event: AstrolabeEvent): FieldProvenance {
  return { eventId: event.id, actorKind: event.actor.kind, at: event.occurredAt };
}

/**
 * Recompute everything derived from a character's impacts.
 *
 * Every mutation path ends here, so the derivation cannot be forgotten:
 * momentum's maximum and reset value are bounds that track the current
 * rules, not facts that were recorded.
 */
function normaliseCharacter(character: CharacterState): CharacterState {
  const markedImpacts = Object.keys(character.impacts).length;
  return {
    ...character,
    markedImpacts,
    momentum: {
      ...character.momentum,
      max: momentumMax(markedImpacts),
      resetValue: momentumResetValue(markedImpacts),
    },
  };
}

/**
 * The launch-relevant half of a character, for `crewHistory` (6.0c, D-184).
 *
 * Field by field, never by spreading the character: a `CharacterState` also
 * carries meters, momentum, impacts and vow tracks, and a revision changes
 * none of them. Optional fields are omitted rather than set to `undefined`,
 * because `exactOptionalPropertyTypes` treats those as different things and
 * the cold-rebuild comparison does not.
 */
function supersededCharacter(character: CharacterState): SupersededCharacter {
  return {
    name: character.name,
    callsign: character.callsign,
    stats: character.stats,
    assets: character.assets,
    hooks: character.hooks,
    pronouns: character.pronouns,
    eventId: character.eventId,
    seq: character.seq,
    ...(character.appearance !== undefined ? { appearance: character.appearance } : {}),
    ...(character.backstory !== undefined ? { backstory: character.backstory } : {}),
    ...(character.backgroundVow !== undefined ? { backgroundVow: character.backgroundVow } : {}),
    ...(character.signatureGear !== undefined ? { signatureGear: character.signatureGear } : {}),
    ...(character.provenance !== undefined ? { provenance: character.provenance } : {}),
    ...(character.groundedIn !== undefined ? { groundedIn: character.groundedIn } : {}),
  };
}

function withCharacter(state: CampaignState, character: CharacterState): CampaignState {
  return {
    ...state,
    characters: { ...state.characters, [character.id]: normaliseCharacter(character) },
  };
}

function updateCharacter(
  state: CampaignState,
  id: CharacterId,
  update: (character: CharacterState) => CharacterState,
): CampaignState {
  const existing = state.characters[id];
  if (existing === undefined) {
    return state;
  }
  return withCharacter(state, update(existing));
}

function applyDelta(state: CampaignState, delta: Delta, by: FieldProvenance): CampaignState {
  switch (delta.kind) {
    case 'momentum':
      return updateCharacter(state, delta.characterId, (c) => ({
        ...c,
        momentum: {
          ...c.momentum,
          value: applyMomentumDelta(c.momentum.value, delta.delta, c.markedImpacts),
          lastChangedBy: by,
        },
      }));

    case 'momentum_reset':
      return updateCharacter(state, delta.characterId, (c) => ({
        ...c,
        momentum: {
          ...c.momentum,
          // Derived, not stored on the event: a stored reset would go stale
          // the moment an upstream impact event was voided.
          value: momentumResetValue(c.markedImpacts),
          lastChangedBy: by,
        },
      }));

    case 'meter':
      return updateCharacter(state, delta.characterId, (c) => {
        const meter = c.meters[delta.meter];
        return {
          ...c,
          meters: {
            ...c.meters,
            [delta.meter]: {
              ...meter,
              value: clamp(meter.value + delta.delta, meter.min, meter.max),
              lastChangedBy: by,
            },
          },
        };
      });

    case 'bonus_next_move':
      return updateCharacter(state, delta.characterId, (c) => ({
        ...c,
        bonusNextMove: {
          amount: delta.amount,
          ...(delta.excludes !== undefined ? { excludes: delta.excludes } : {}),
          sourceEventId: by.eventId,
        },
      }));

    case 'impact':
      return updateCharacter(state, delta.characterId, (c) => {
        const impacts = { ...c.impacts } as Record<ImpactId, true>;
        if (delta.set) {
          impacts[delta.impact] = true;
        } else {
          delete impacts[delta.impact];
        }
        // A stored momentum value that now exceeds a lowered maximum stays
        // as it is; the next delta clamps it. Bounds move, facts do not.
        return { ...c, impacts };
      });
  }
}

function applyOverride(
  state: CampaignState,
  event: Extract<AstrolabeEvent, { type: 'state.overridden' }>,
  by: FieldProvenance,
): CampaignState {
  const { target, to, reason } = event.payload;
  // `from` is a write-time display value ("+3 → +4"), never an assertion:
  // after a void reprojects the log it is legitimately stale, so nothing
  // here gates on it.
  const provenance: FieldProvenance = {
    ...by,
    ...(reason !== undefined ? { reason } : {}),
    manual: true,
  };

  switch (target.kind) {
    case 'momentum':
      return updateCharacter(state, target.characterId, (c) => ({
        ...c,
        momentum: { ...c.momentum, value: to, lastChangedBy: provenance },
      }));

    case 'meter':
      return updateCharacter(state, target.characterId, (c) => ({
        ...c,
        meters: {
          ...c.meters,
          [target.meter]: { ...c.meters[target.meter], value: to, lastChangedBy: provenance },
        },
      }));

    case 'track': {
      const existing = state.tracks[target.trackId];
      if (existing === undefined) {
        return state;
      }
      return {
        ...state,
        tracks: {
          ...state.tracks,
          [target.trackId]: { ...existing, ticks: to, lastChangedBy: provenance },
        },
      };
    }
  }
}

/**
 * Beat 5's +1 is spent by the aided character's next move — unless the
 * bonus excludes progress moves and this is one, in which case it waits.
 */
function consumeBonus(
  state: CampaignState,
  event: Extract<AstrolabeEvent, { type: 'move.invoked' }>,
): CampaignState {
  return updateCharacter(state, event.payload.actorCharacterId, (c) => {
    if (c.bonusNextMove === undefined) {
      return c;
    }
    const isProgressMove = event.payload.using?.using === 'progress_track';
    if (c.bonusNextMove.excludes === 'progress_moves' && isProgressMove) {
      return c;
    }
    const { bonusNextMove: _spent, ...rest } = c;
    return rest;
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export type { CharacterId, EntityId, TrackId };

/**
 * A ship without the module list events before D-191 carried. Installed
 * modules are derived from the crew, so the stored list is read and dropped
 * rather than projected beside the derived one.
 */
function withoutModules<T extends { readonly modules?: unknown }>(ship: T): Omit<T, 'modules'> {
  const { modules: _stored, ...rest } = ship;
  return rest;
}

/** Append a superseded version to its key's history, oldest first (8.0h, A40). */
function withHistory<K extends string, T>(
  history: Readonly<Record<K, readonly T[]>>,
  key: K,
  superseded: T,
): Readonly<Record<K, readonly T[]>> {
  return { ...history, [key]: [...(history[key] ?? []), superseded] };
}
