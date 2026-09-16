# Astrolabe — Event Log and State Projection (v1.1, Approved)

The detailed design behind §9 of the [design record](design-record.md): every state
change is an appended event, and current state is a projection over the log. Recaps,
AI grounding, void-and-redo, correction history and — later — multiplayer sync all
come out of that one mechanism.

Decided in design round 11: D-83 (void cascade and containment), D-84 (void bounded to
the session), D-85 (token accounting exempt from void), D-86 (entity amendment and
reinstatement deferred), D-87 (the ship is display-only in Milestone 1). Campaign
Launch extends this design through D-159–D-170, especially D-161's draft, proposal,
revision, and amendment semantics.

The original build tasks live in [`milestone-1.md`](milestone-1.md) §2. Campaign Launch
tasks live in [`milestone-2.md`](milestone-2.md) §2–3.

---

## 1. What counts as one event

**An event records one decision by one authority, or one fact the server committed.**
The authority table in §3 of the design record is the seam.

This sits between "one event per move resolution" and "one event per micro-step," and
three things rule out the coarse option rather than merely disfavouring it:

- **Dice and state never wait on the AI** (§10). Narration arrives after mechanics
  resolve, so narration is always its own event — a combined `move.resolved` could
  never be written until the provider returned.
- **Beat 7 is two authorities in one moment.** The AI proposes −2 harm; the player
  commits −1 (A13, D-16). Two decisions, two events. Beat 3's complication options have
  the same shape.
- **Corrections target a passage, not a move** (A15). A correction needs a stable event
  id to point at.

A single move resolution is therefore a short sequence sharing one command id:

```
move.invoked      player   Face Danger, Rook, +iron, "forces the bulkhead"
dice.rolled       system   action die 3, adds [iron 2], score 5, challenge [8,4] → miss
state.changed     system   the deltas from the miss outcome spec
move.chained      system   Pay the Price (mode: auto, reason: miss)
narration.written ai       arrives later, its own command, caused by the roll
```

### Event granularity is not request granularity

One `POST /campaigns/:id/moves` writes `move.invoked`, `dice.rolled` and `state.changed`
in a single transaction and returns the resolved result card. Fine granularity costs no
extra round trips and no extra latency against §10's targets. It buys precise void
targets, precise correction targets, and a log that records exactly what happened.

Legibility comes from grouping, not from coarseness: every event carries a `commandId`
(same request) and a `causedBy` (cross-request causal parent), and the narrative log
renders a command group as one beat rather than five rows.

Micro-events — one per effect — buy nothing. The effects of a single outcome are
atomic, share one traceability clause, and always void together.

---

## 2. Determinism

Projection is `fold(events) → CampaignState`: no RNG, no clock, no I/O, no reads of
versioned rules content. Every source of non-determinism is closed at write time.

| Source | Closed by |
|---|---|
| Dice | `dice.rolled` stores the action die, adds, action score, challenge dice, **and the resolved `tier` and `isMatch`**. The redundancy is deliberate: a future fix to `resolveTier` must not retroactively rewrite an old campaign's outcomes. |
| RNG provenance | `rng: { source: 'crypto' \| 'seeded', seed?, draw? }`, stored for audit, never used to re-roll. |
| Oracle rolls | `oracle.rolled` stores the roll value **and the row text**, so regenerating Datasworn cannot change what an old campaign's oracle said. |
| AI output | Every call appends `ai.completed` with its token counts (D-75); the content lands in `narration.written`, `amount.proposed` or `complication.offered`. Projection never calls a provider. |
| Wall clock | `occurredAt` is assigned once at write. Projection never reads `now()`. |
| Identity | Every campaign-scoped id — `CharacterId`, `TrackId`, entity ids — is minted at write time and stored in the payload. Projection never generates one. |
| **Rules content** | The versioned input that is easy to forget. Which effects a weak hit of Gather Information produces comes from `MoveAutomation`, which changes on a Datasworn regeneration or a spec edit. So the **resolved effect list is stored** in `state.changed` and never recomputed at read time. |

### The line that makes this workable

> **Projection may call pure functions from `rules`. It may never read versioned rules
> content.**

`applyMomentumDelta`, `momentumMax` and `momentumResetValue` are code, and calling them
is fine. `STARFORGED` — moves, oracles, automation specs, `gameRules` — is data, and
reading it during projection is not.

Two consequences:

- **Meter bounds are content.** `ConditionMeterDef.min/max` lives in
  `STARFORGED.gameRules`, so `character.created` snapshots each meter's bounds onto the
  character and projection clamps against the stored per-character values. This is also
  the right shape for later assets that raise max supply.
- **Enforcement is a lint rule, not a convention.** `eslint.config.js` already bans
  `Math.random` and node built-ins inside `packages/rules/src/**`. The same mechanism
  bans, inside `packages/server/src/projection/**`: `STARFORGED`, `Date`, `crypto`,
  `RandomSource`, the database client and the AI provider.

---

## 3. Envelope and storage

| Field | Type | Note |
|---|---|---|
| `campaignId` | uuid | |
| `seq` | bigint | per-campaign, gapless, server-assigned (§8) |
| `id` | uuid v7 | globally unique, time-ordered |
| `commandId` | uuid | the request that wrote it — idempotency key, beat group, and minimum void unit |
| `causedBy` | uuid \| null | causal parent **event** id. **Server-assigned only.** A client that could supply it could forge causality and steer what a void cascades over. |
| `sessionId` | uuid \| null | null for campaign setup, which precedes session 1 |
| `sceneId` | uuid \| null | one scene per session in Milestone 1 (D-71) |
| `actor` | `{ kind: 'player' \| 'ai' \| 'system', playerId?, characterId? }` | §9 requires an actor from day one |
| `subjectCharacterId` | CharacterId \| null | which character this concerns |
| `type` | text | §4 |
| `version` | int | payload schema version, per type |
| `visibility` | `'table'` | single-valued in Milestone 1; the field exists so multiplayer adds values, not a column |
| `payload` | jsonb | |
| `occurredAt` | timestamptz | |

`actor.kind` is what A16 needs: `system` means the rules engine applied it, `player`
means a human typed it, `ai` means the Guide owns it. That one discriminator carries
through to projected state (§7) as the badge source.

Milestone 1 has no auth (D-52), so `playerId` is a fixed local constant. Multiplayer
changes where the id comes from, not the shape.

### Schema

```sql
create table campaigns (
  id uuid primary key,
  name text not null,
  created_at timestamptz not null default now(),
  next_seq bigint not null default 1
);

create table commands (
  campaign_id uuid not null references campaigns(id),
  id uuid not null,                  -- client-generated request id
  kind text not null,
  actor jsonb not null,
  received_at timestamptz not null default now(),
  first_seq bigint not null,
  last_seq bigint not null,
  response jsonb not null,
  primary key (campaign_id, id)
);

create table events (
  campaign_id uuid not null references campaigns(id),
  seq bigint not null,
  id uuid not null unique,
  command_id uuid not null,
  caused_by uuid null,
  session_id uuid null,
  scene_id uuid null,
  actor jsonb not null,
  subject_character_id text null,
  type text not null,
  version int not null,
  visibility text not null default 'table',
  payload jsonb not null,
  occurred_at timestamptz not null,
  primary key (campaign_id, seq)
);

create index events_by_command on events (campaign_id, command_id);
create index events_by_session on events (campaign_id, session_id, seq);
```

Two indexes beyond the primary key, and no GIN index on `payload` — at a few thousand
events per campaign nothing needs one, and adding it later is a one-line migration.

**The events table is INSERT-only, enforced by the database.** A
`before update or delete on events` trigger raises. Nothing in the log is ever mutated:
voids, corrections and overrides are all new events. (Revoking `update` and `delete`
from the application role is the alternative; the trigger is preferred because it works
regardless of how roles are provisioned and is visible in the schema dump.)

### Validation

One zod discriminated union in `@astrolabe/shared`, used by the server on write and by
the client to narrow when rendering.

- **On write, always.** The append function parses before inserting. A payload that
  doesn't validate is a bug that must not reach storage.
- **On read, yes at this scale.** Parsing a few thousand small objects costs
  single-digit milliseconds and catches upcaster and migration mistakes while they're
  still cheap. Revisit against the threshold in §6.
- **Fail closed.** An unknown type, or a version the upcaster chain doesn't cover,
  throws. Silently skipping an event silently produces wrong state.

### Payload versioning

A per-type integer `version` in the envelope, plus a pure upcaster chain:
`upcast(type, version, payload) → latestPayload`. Projection only ever sees
latest-version payloads.

- **Stored events are never rewritten.** There are no "migrate the log" scripts.
- Upcasters are pure functions in `shared`, tested against committed fixtures of
  old-version payloads.
- **Upcasting must be total.** If a change genuinely loses information and cannot be
  upcast, the old projection branch has to stay — which is the signal that the change
  was designed wrong, and that the right move was a new event type rather than a
  reshaped one.

The everyday rule: *adding an optional field is non-breaking and doesn't bump the
version; removing, renaming or changing the meaning of a field bumps it and adds an
upcaster; a genuinely different fact is a new type, not a new version.*

---

## 4. Event types

About thirty types across Milestone 1. The spine — the eighteen types the projector and
the section 2 harness need — is built with the event log itself; the rest arrive with
the features that write them, so their payloads are shaped by a real caller rather than
guessed at in advance. An exhaustive `switch` over eighteen members is still
exhaustive: a type added later fails the compile at the switch, which is the behaviour
we want.

**The spine (built in section 2).** `campaign.created`, `character.created`,
`session.began`, `session.ended`, `scene.started`, `move.invoked`, `dice.rolled`,
`momentum.burned`, `state.changed`, `state.overridden`, `track.created`,
`track.advanced`, `entity.established`, `narration.written`,
`narration.correction_requested`, `narration.revised`, `event.voided`, `ai.completed`.

**The rest, with their features.**

| Type | Lands with |
|---|---|
| `campaign.settings_changed`, `truth.decided`, `location.added`, `route.added` | campaign setup (§4 of the task list) |
| `character.asset_added`, `vow.sworn` | character creation; Swear an Iron Vow |
| `move.choice_made`, `move.method_chosen`, `move.chained` | the move flow |
| `amount.proposed`, `amount.committed` | the chained suffer move (A13) |
| `complication.offered`, `complication.set` | weak-hit complications (A5) |
| `oracle.rolled` | oracle-grounded generation |
| `scene.header_updated` | the scene header |
| `ai.failed` | provider outage handling |
| `entity.amended`, `event.reinstated` | deferred past Milestone 1 (D-86) |

Three shaping decisions worth stating:

**One narration type, not five.**
`narration.written { role: 'recap' | 'scene_frame' | 'beat' | 'summary', text, groundedIn: eventId[] }`.
The recap (Beat 1), the scene frame (Beat 2), beat narration and the session summary
(Beat 10) differ by role, not by shape, and the log renders them identically.
`groundedIn` is how oracle chips attach to the passage they informed — the AI declares
which rolls it used.

**`ai.completed` is separate from its content event.** Some calls produce no narration
at all — "What now?" suggestions, complication options, the harm proposal — so per-call
accounting needs its own uniform type. D-75's token counter is then a sum over one type.

**`state.changed` mirrors the rules layer.**
`{ cause: { kind, moveId?, tier?, clause? }, changes: Delta[] }`, where `Delta` is a
discriminated union parallel to the rules package's `Effect` but **resolved**: a
concrete `CharacterId` in place of an `EffectTarget`, concrete numbers in place of
ranges. `resolveEffectTarget` is the bridge — D-62's Aid Your Ally redirect is applied
once, at write time, not re-derived by every reader. `cause.clause` carries the verbatim
rule text forward, so "every automated rule behaviour is traceable" survives into the
log and not just into the rules package.

### Campaign Launch event catalogue

Campaign Launch adds the following types. Names are part of the approved design; the
Zod schemas may factor shared value objects, but they must preserve the domain-specific
discriminants listed here.

| Type | Payload responsibility |
|---|---|
| `launch.draft_saved` | `{ section, snapshot }`, where `section` discriminates a closed union of Foundation, Truths, Crew, Starship, Sector, Connection/Troubles, and Incident/Launch snapshot schemas. It is resumable setup, not canon. |
| `creation.proposed` | `{ targetKind, targetId, proposal, rationale, groundedIn }`; `targetKind` selects a closed schema for truth, character, starship, settlement, sector, connection, trouble, or incident. Oracle rolls and the AI accounting event remain separate and are referenced by id. |
| `campaign.foundation_set` | Accepted premise and launch settings, with provenance and optional `supersedesEventId`. |
| `truth.decided` | Truth id, `resolution: selected | rolled | custom | leave_open`, resolved option/subchoice or custom text, quest-starter reference, grounding, and optional `supersedesEventId`. |
| `character.created` | The complete accepted launch character snapshot, including appearance, backstory state, background vow, gear, rules-derived starting state, assets, and provenance. Existing v1 events upcast with explicit absent/default launch fields; readiness still reports what must be completed. |
| `character.revised` | Complete replacement snapshot plus `characterId`, `supersedesEventId`, and provenance. |
| `character.removed` | `characterId`, `supersedesEventId`, and reason; valid only before activation and only when no retained launch fact references that character. |
| `starship.established` | Shared starship id, details, integrity and bounds, shared Starship asset snapshot, installed module references with owners, and provenance. |
| `starship.revised` | Complete replacement ship snapshot and `supersedesEventId`. |
| `sector.configured` | Sector id, name, region, snapshotted baseline requirements, optional star reference, and provenance. |
| `location.added`, `location.revised`, `location.removed` | Typed settlement, planet, star, or other-location snapshot; revisions/removals name the superseded event and are rejected when retained facts reference the location. |
| `route.added`, `route.revised`, `route.removed` | Passage endpoints, including a typed off-map endpoint; revisions/removals name the superseded event. |
| `sector.layout_changed` | Complete presentation-only node-coordinate map. It changes no fictional distance or rules state. |
| `starting_settlement.selected` | Settlement id and optional `supersedesEventId`. |
| `trouble.established`, `trouble.revised` | Typed `settlement | sector` trouble, owner id, accepted text/structured fields, grounding, and optional supersession. |
| `connection.established`, `connection.revised` | NPC id, role, rank, progress-track id and snapshot, participant character ids, explicit `automaticStrongHit: true`, provenance, and optional supersession. No dice event is fabricated. |
| `incident.accepted`, `incident.revised` | Incident id, accepted wording, cited launch-fact event ids, grounding, proposed vow rank, selected roller/participants, opening-scene draft, and optional supersession. No track or session exists yet. |
| `campaign.activated` | The immutable activation boundary: complete accepted launch-fact event ids, Session 1 id, opening scene id/snapshot, pending incident/vow metadata, and readiness version. |
| `launch.fact_amended` | Post-activation amendment with `subject` as a closed union of launch fact references, a typed replacement value, mandatory reason, and `supersedesEventId`. |

The shared acceptance fields are `{ provenance, groundedIn, supersedesEventId? }`.
`provenance` distinguishes `player_written`, `official_choice`, `oracle_roll`,
`guide_proposal`, and `guide_proposal_edited`. `groundedIn` contains event ids, never
free-form source claims. When an accepted value comes from a proposal, its event is
server-caused by `creation.proposed`; when it comes directly from rolls, it references
the `oracle.rolled` events.

`supersedesEventId` creates a revision chain; projection selects the latest non-voided
member and naturally falls back if that revision is voided. It does not erase the old
fact. Before activation, domain revision events are used. After activation, commands
must write `launch.fact_amended` with a reason rather than masquerading a retcon as a
setup revision.

`campaign.activated` is non-voidable and references every canonical launch fact it
freezes. It is appended atomically with the existing `session.began` and `scene.started`
events. Those events are caused by activation. The pending vow is not a track yet: the
existing move event sequence creates `track.created` and `vow.sworn` only when the
player actually invokes `Swear an Iron Vow`.

Metadata rules for the new catalogue:

- `launch.draft_saved` and `creation.proposed` are non-narrative, non-significant, and
  excluded from ordinary AI context. They remain auditable and `ai.completed` still
  counts proposal token use.
- Accepted/revised launch facts are state-mutating and significant but do not appear as
  session narrative. Their `references` functions include grounding, supersession,
  participant, endpoint, owner, and cited-fact ids as applicable.
- Layout is state-mutating presentation data but non-significant and never enters AI
  context.
- Activation's references make a later void of any frozen setup fact fail containment;
  active campaigns use amendments instead.
- Saved drafts never introduce entities or satisfy readiness. Proposals introduce no
  canonical entities. Only accepted fact events populate the launch projection.

---

## 5. Void and redo

**A void cascades over recorded causation** (D-83). The cascade set is computed and
stored on the void event at write time, previewed before the player confirms, and
refused when something outside it has already been built on.

"Cascade with a warning" and "track causality explicitly" turn out to be the same
design — a cascade is not computable without recorded causality — so the real choice
was against restricting void to events with no dependents. That restriction would pass
Milestone 1, since Beat 7 voids a roll nothing has consumed, and it is a fraction of
the work. It was rejected because its failure mode is the common case: you notice the
mistake *after* the numbers moved and the AI narrated, which is exactly when the
restriction refuses.

### Semantics

1. **Void is an event.**
   `event.voided { targetEventId, reason, kind: 'player_void' | 'reroll', cascaded: eventId[] }`.
   Nothing in the table is updated, and the log keeps who voided, when, and why.
2. **The cascade set is stored, not recomputed.** This keeps the fold pure, makes a
   void auditable — "this removed these six events" — and means a later change to the
   causality model cannot silently alter what an old void did.
3. **The minimum unit is a command.** Voiding `dice.rolled` voids its `move.invoked`
   and `state.changed` too; they were one decision. The cascade then follows `causedBy`
   across commands to reach the narration.
4. **Void does not rewind time.** Voided events keep their `seq` and stay in the log,
   struck through (D-27). The redo appends at the end. Beat 7 reads: +edge roll
   (struck), the void, the +iron roll, the miss.
5. **Void suppresses game state, not accounting.** An `ai.completed` inside a cascade
   still counts toward the session token total — the tokens were spent whatever the
   fiction now says (D-85).
6. **Referential containment.** A void is refused if a non-voided event outside the
   subtree references an entity or track introduced inside it; otherwise projection
   produces a dangling reference, such as a Beat 8 clock hanging off a Beat 6 NPC that
   no longer exists. This is checkable rather than aspirational because every event
   type declares `references(payload) → EntityRef[]` in `EVENT_TYPE_META`, alongside
   its narrative and significance flags.
7. **Void reaches back no further than the current session** (D-84). It bounds the
   cascade, matches how tables play, and keeps §6's snapshot question simple.

### The fold

An event's void state is a **set of active void ids**, not a boolean: `event.voided`
adds its own id to every target in its stored `cascaded` list, and an event is voided
iff its set is non-empty.

Milestone 1 writes no `event.reinstated` (D-86), so the set is never emptied and a
boolean would give the same answer today. It is set-valued anyway because that is the
entire cost of keeping D-86 reversible — reinstatement becomes "remove this void's id
from the targets in its list," with no change to the projector. A boolean would force a
rewrite, because last-writer-wins is wrong: if void A covers {5, 6} and void B covers
{6, 7}, reinstating A must leave 6 voided by B.

### What it forbids

Void forbids un-happening anything the world has since built on.

> **Void is "this shouldn't have happened." Amendment is "this happened, and it was
> wrong."**

You void mechanics you regret before the world moved on. Everything after that is
corrected by the amendments in §6, which never remove anything.

### AI rerolls

An AI reroll (D-18, D-70) is `event.voided` with `kind: 'reroll'` and a stated reason,
not a type of its own: the discarded oracle chip stays visible and struck through
exactly as a voided roll does, and its cascade is empty because nothing has consumed it
yet. Milestone 1 ships this as display only. Reinstating a discarded result is deferred
with entity amendment (D-86) — the two are coupled, since reinstating a roll means
amending the entity built from the surviving result.

---

## 6. Corrections and overrides

No amendment touches an existing row. Two kinds ship in Milestone 1.

### Narration correction (A15, D-73)

```
narration.correction_requested  player  { targetEventId, note: "Rook is a veteran, annoyed not rattled" }
narration.revised               ai      { targetEventId, text }
```

Two events, not one, because the note is player-authored and the rewrite is AI-authored
— the same authority seam as everywhere else. A15's "one action" is a property of the
UI: one click writes the request and triggers the rewrite.

Projection resolves a passage to its **latest non-voided revision** while keeping the
original and the player's note attached, so the rendered log item carries
`{ text, corrected: true, original, note }` — which is what D-73's affordance opens.

### Manual override (A16, D-26)

```
state.overridden  player  { target: { kind: 'momentum', characterId }, from: 3, to: 4, reason }
```

Applied as an **absolute set**, not a delta: the player said "4," and that is a pure
function of their own decision. If an earlier event is later voided, the value before
the override changes and the override still sets 4 — which is semantically right.

`from` is a write-time display value ("+3 → +4"), not an assertion. Projection must not
gate on it: once a void has reprojected the log, a stored `from` is legitimately stale.

### The absolute-vs-delta rule

The crux of the whole design:

> **An event may store an absolute value only when that value is a pure function of the
> event's own decision. If it depends on prior state, store the delta — or the bare
> fact — and let the projector derive the rest.**

| Event | Stores | Why |
|---|---|---|
| `state.overridden` | absolute `to` | the player chose the number |
| `state.changed` | a `delta` per change | depends on prior state, so an upstream void must reproject cleanly |
| `momentum.burned` | the **fact** of burning, and the tier before and after | the reset is `momentumResetValue(markedImpacts)`, which is projected state; a voided impact event would leave a stored reset stale |

`state.changed` may carry a `to` for display, but projection ignores it and no
consistency check fires on it — downstream `to` values are *supposed* to go stale after
a void. Projection folds deltas through `applyMomentumDelta` and the stored
per-character meter bounds, both pure.

---

## 7. Projection strategy

**A full rebuild from the log is the only correctness-bearing path.** A per-campaign
in-memory projection is memoized and appends apply to it incrementally, but it is a
cache that can be dropped at any moment with no consequence beyond a rebuild. That is
what makes incremental application safe: it is never the source of truth, and the test
suite asserts that every prefix of the log projects identically whether built
incrementally or from cold.

The projector carries a `PROJECTOR_VERSION`; any change to projection logic bumps it
and discards caches.

**No snapshot tables in Milestone 1.** One campaign and a few thousand events fold in
single-digit milliseconds, and simplicity wins until it doesn't. Concretely, it stops
winning when a cold rebuild exceeds ~100 ms, when a campaign log passes ~20 000 events,
when the server runs as more than one process (the in-memory cache goes stale — every
write currently flows through one writer), or when arbitrary historical projections
become a per-request need rather than a debugging tool.

There is also a reason specific to this design: **a void rewrites history behind a
snapshot**, so every void invalidates every snapshot at or after the voided seq, and
A11 makes voids routine. When snapshots do arrive they will be
`snapshots(campaign_id, seq, state jsonb, projector_version)`, invalidated wholesale on
a projector bump and truncated at the earliest voided seq.

---

## 8. State shape

Two read models over one log:

- **`CampaignState`** — bounded, whole-campaign, rebuilt in full. What the play screen
  binds to and what AI context assembly reads.
- **`NarrativeLog`** — unbounded, paged, per-session, render-oriented. Deliberately
  *not* part of `CampaignState`, because state is bounded and the log is not.

```ts
interface CampaignState {
  campaign: { id, name, settings: { narrationLatitude, narrationLength, rerollCap }, truths[] };
  launch: LaunchState;
  session?: { id, number, startedAt, endedAt?, tokenUsage: { input, output } }; // absent during launch; D-75
  scene?:   { id, title, stakes, unresolved, locationId };                      // absent during launch; D-71
  characters: Record<CharacterId, CharacterState>;
  tracks:     Record<TrackId, TrackState>;      // vows, clocks, expeditions, legacy
  entities:   Record<EntityId, EntityState>;    // NPCs, locations, factions, the ship
  canon: { truths[], locations[], routes[], lastSessionSummary?, openThreads[] };
}

interface CharacterState {
  id; name; callsign;
  stats: Record<StatId, number>;
  meters: Record<MeterId, { value, min, max, lastChangedBy: Provenance }>;  // bounds snapshotted at creation
  momentum: { value, max, resetValue, lastChangedBy: Provenance };          // value stored; max and reset derived
  impacts: Record<ImpactId, boolean>;
  assets: AssetRef[];
  bonusNextMove?: { amount, excludes?, sourceEventId };                     // Beat 5's +1, consumed by the next roll
  vowTrackIds: TrackId[];
}

interface Provenance { eventId; actorKind: 'player' | 'ai' | 'system'; reason?; at; }

// D-176: the fold only. Section statuses and blockers are rules output and are
// returned beside this by the launch workspace read layer, never folded into it.
interface LaunchState {
  phase: 'draft' | 'ready' | 'active';
  drafts: Partial<Record<LaunchSection, TypedLaunchDraft>>;
  foundation?: CampaignFoundation;
  starship?: SharedStarshipState;
  sector?: StartingSectorState;
  connection?: ConnectionState;
  troubles: TroubleState[];
  incident?: IncidentState;
  activation?: { eventId; sessionId; sceneId; pendingVow: PendingVow };
}
```

**Stored, folded from events:** every meter value, momentum value, track ticks,
impacts, entity fields, the scene, canon.

**Derived, recomputed each projection:** `momentum.max` and `momentum.resetValue`, from
the character's marked impacts via D-74, D-78 and D-79.

The rule behind the split: **store facts, derive bounds.** A momentum *value* was
produced by applying a rule at a moment in history and must not change. A momentum
*maximum* is a current-rules bound and should reflect the current rules. A stored value
that exceeds a newly derived maximum is displayed as it stands; the next delta clamps
it.

**Provenance lives on the field, not only in the log**, because A16 requires a manually
overridden meter to look different from an automated one and Beat 8 requires hovering a
clock to show who ticked it and why. `lastChangedBy` answers both without re-scanning
the log.

```ts
interface EntityState {
  id; kind: 'npc' | 'location' | 'faction' | 'ship'; name; fields: Record<string, unknown>;
  provenance: { establishedBy: 'ai' | 'player', recipeId?, groundedIn: eventId[], eventId };
}
```

`establishedBy` is A10's badge. `groundedIn` lists the oracle roll events — Beat 6's
five rolls, one of them the survivor of a reroll — which is how an NPC card links back
to its chips.

**The ship** remains a display-only entity in Milestone 1 (D-87). Campaign Launch
supersedes that setup representation with `launch.starship`, one shared aggregate with
typed module-owner references (D-164). Compatibility projection must not expose both
the old display entity/per-character command-vehicle grant and the shared ship as
independent mechanical assets.

`launch.phase` is partly derived: before activation it is `ready` exactly when the
server's current launch-readiness function finds no blockers, otherwise `draft`.
`campaign.activated` permanently makes it `active`. Section statuses and blockers are
read-model output, not writable facts — **and under D-176 they are returned beside
`CampaignState`, not inside `LaunchState`**, because deriving them means applying the
launch-readiness rules and projection reads no rules content (task 2.7, D-174). The
launch workspace layer folds the log, feeds the projected facts to the validator, and
returns both. Every other `LaunchState` member is typed to its accepted-fact payload;
an `unknown` or a cast at the read site is the defect D-176 exists to prevent. Draft
snapshots are present only for Campaign Launch resumption endpoints; context assembly
explicitly strips `launch.drafts`.

**Void does not apply to launch facts** (D-177). They are corrected by revision before
activation and by `launch.fact_amended` after it. Every launch event type is
`voidable: false`, which matches what `planVoid` already enforces: a target with a null
`sessionId` is refused under D-84.

---

## 9. Ordering and idempotency

**Sequence.** Per-campaign, gapless, assigned inside the write transaction:

```sql
update campaigns set next_seq = next_seq + $n where id = $1 returning next_seq;
```

The row update serialises writers per campaign; the counter is gapless, unlike a
Postgres sequence, which gaps on rollback; and `$n` covers a multi-event atomic append
in one bump. `primary key (campaign_id, seq)` is the backstop.

**Idempotency.** The client sends a `requestId` with every command. It cannot live on
`events`, since one request writes several, so it lives on `commands` — primary key
`(campaign_id, id)`, inserted in the same transaction. A retry hits the unique
violation, reads the stored `response`, and returns it unchanged.

**One concept doing three jobs.** The command id is the idempotency key, the beat
grouping for the narrative log, *and* the minimum void unit. That is not a coincidence:
a request is exactly "one thing the player did."

**Ordering guarantee.** Readers order by `seq`, never by `occurredAt`. The wall clock is
for display; clock skew must never reorder a log.

---

## 10. Read paths

| Reader | Query shape | Index |
|---|---|---|
| Projection rebuild | `where campaign_id = $1 order by seq` — the only full scan | primary key |
| Narrative log | `where campaign_id = $1 and session_id = $2 and type = any($narrativeTypes) order by seq desc limit 50`, plus a small separate fetch of the campaign's `event.voided` and `narration.revised` events, folded in memory | `events_by_session` |
| Recap (A1, D-72) | the previous session's `session.ended` summary and open threads, plus its significant, non-voided events in `seq` order | `events_by_session` |
| AI context assembly | `CampaignState` — projected state, not a raw transcript — plus a tail of recent `narration.written` and the current command's oracle rolls | in memory, `events_by_command` |
| Oracle chips | `narration.written.groundedIn[]` resolves event ids directly; `commandId` is the fallback grouping | `events_by_command` |
| Token counter (D-75) | summed in the projection over `ai.completed`; no separate query | — |
| Golden session (D-72) | a committed fixture array of session-1 events, loaded and projected | — |

**"Narrative" and "significant" are code, not columns.** A static `EVENT_TYPE_META`
map — `type → { narrative, significant, mutatesState, references }` — keeps a view
concern out of the log and out of migrations, and carries §5's `references` function
for containment checking.

---

## 11. Invariants

The short list. Violating any of these means the design was misunderstood.

- The `events` table is INSERT-only. Voids, corrections and overrides are new events.
- Projection is a pure fold: no RNG, no clock, no I/O, no reads of `STARFORGED`. Pure
  functions from `rules` are fine; rules *data* is not. Enforced by lint.
- Anything non-deterministic is resolved once at write time and stored: dice, oracle
  rows, AI text, generated ids, timestamps, and the resolved effect list.
- Store facts, derive bounds.
- An event stores an absolute value only when that value is a pure function of its own
  decision; otherwise it stores a delta or the bare fact.
- `causedBy` is server-assigned and never accepted from a client.
- Readers order by `seq`, never by `occurredAt`.
- `projection/` is pure and tested without a database; `store/` is the only module that
  does I/O.
