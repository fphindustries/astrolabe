# Milestone 1 — The Golden Session

**Done when** [`golden-session.md`](golden-session.md) runs start to finish against a real campaign, real rules data, and real AI narration, played solo by one user controlling three characters.

Nothing outside that scope ships in this milestone. When something feels missing, check whether the golden session needs it. If it doesn't, it waits.

---

## In scope

Campaign setup (truths, sector as a location list, inciting incident) · concept-first character creation · the play screen · relevant-moves panel · move resolution at the Automated level for the moves the golden session exercises (D-59) · server-authoritative animated dice · oracle rolls and oracle-grounded generation from declared recipes (D-65) · AI narration with latitude and length scaling, via the provider interface and the Claude implementation (D-60) · suggested actions on request · clocks, vows, and progress tracks · NPC and location tracking · the event log · void-and-redo · manual overrides · narration corrections · session recap, start, and end · token counter.

**Automated moves (D-59).** Begin a Session, End a Session, Gather Information, Secure an Advantage, Face Danger, Pay the Price, Endure Harm, Ask the Oracle, Swear an Iron Vow, Reach a Milestone. Aid Your Ally is a flag on an invocation rather than its own spec (D-62). Every other move runs at Reference.

## Out of scope

Multiplayer and real-time sync · authentication · the OpenAI provider implementation (D-60) · AI-proposed scene transitions (D-71) · automation for any move the golden session does not exercise, including the Threshold moves (D-59) · combat, exploration, recovery, connection, legacy, and scene-challenge automation · the visual starmap · portraits · lines and veils · mobile and tablet layouts · asset automation beyond the Guided level · entity amendment and void-reinstatement (D-86) · mutable ship state (D-87).

---

## Acceptance criteria

Each maps to a beat of the golden session.

| # | Criterion | Beat |
|---|---|---|
| A1 | Opening a campaign shows an AI recap built from the event log, plus location, vow, and every character's meters, with no scrolling | 1 |
| A2 | The AI frames a scene grounded in oracle rolls, and the rolls appear as chips under the narration | 2 |
| A3 | A player picks a move from the relevant-moves panel, describes the action, and reaches a result in three interactions or fewer | 3 |
| A4 | A result card leads with the outcome; the dice math opens on click | 3 |
| A5 | A weak-hit complication can be written by the player or chosen from AI-offered options | 3 |
| A6 | "What now?" returns suggested actions anchored in current state, and the AI never nudges unasked | 4 |
| A7 | One user can act as any of three characters, and Aid Your Ally applies the move's benefits to the aided character | 5 |
| A8 | The app offers to burn momentum when it would improve an outcome, showing the cost | 5 |
| A9 | An oracle result that doesn't fit is rerolled visibly, and the discarded chip stays struck through | 6 |
| A10 | An AI-created NPC appears as a tracked entity badged as AI-established | 6 |
| A11 | A roll can be voided and redone; the voided roll stays in the log | 7 |
| A12 | A miss offers Pay the Price with the table roll highlighted and chains into the suffer move | 7 |
| A13 | The AI proposes a harm amount and the player can adjust it before it applies | 7 |
| A14 | The AI ticks a clock with a visible reason | 8 |
| A15 | A narration passage can be corrected in one action, and the correction is logged | 9 |
| A16 | Any meter, track, or clock can be edited manually, logged and visually distinct from automated changes | 9 |
| A17 | Ending a session produces a summary and open threads that feed the next session's recap | 10 |
| A18 | Narration begins streaming within 5 seconds, and dice and state changes never wait on the AI | all |
| A19 | A player who describes an action without picking a move gets an AI suggestion: the move, the verbatim trigger text it relies on, a stated reason, and a confidence. The player can open it to see why, and it never blocks picking a move directly (D-14, D-120) | 3 |
| A20 | When a chosen move's trigger doesn't fit the described action, the AI notes it on the beat, with the trigger text, a reason and a confidence, without blocking or delaying the roll (D-37, D-121) | none (D-121) |
| A21 | Narration never gives a player character an action beyond what the player declared, or a thought, emotion, intent, motivation, or claim that reaches beyond the beat (disposition, history, values, characteristic response), at any latitude. A passage that does is withdrawn unmistakably, with the reason in words and a logged event, then rewritten; a second failure pauses play with Retry (D-127–D-130) | 3, 7, 9 |

---

## Task breakdown

Issue-sized. Each task should land in one sitting and leave the build working.

**Order (D-88, D-94, D-57 as amended).** Task numbers are stable, so references to them keep
resolving; the order they are *worked* in is:

> 1 · 2 · **3.1, 3.5** · **5.0, 5.1, 5.2** · 3.2, 3.4 · 4 · 5.3–5.7 · 6 · **7.1, 7.2, 7.4, 7.5** (with 7.6–7.11) · 3.3 · 3.6 · **7.16, 7.14, 7.15** · 4.6 · 7.12, 7.13 · 8 · 9 · 10

The play-screen shell comes before the creation and campaign-setup UI because
those have no React app to live in — `web` is a bare Vite scaffold. The
server-side halves of groups 3 and 4 stay ahead of it, since they need no UI
at all.

The provider core (7.1, 7.2, 7.4, 7.5) comes before every task that needs a
working AI provider: 3.3, 4.6 (4.4's AI-proposal half, D-126), 7.12, 7.13, and groups 8 and
9 (D-57 as amended). 7.6–7.11 landed in the same commit as the core, so the
remaining group 7 work, 7.12 and 7.13, follows 3.3 and 4.6. 7.3 (OpenAI) stays in
Milestone 2 (D-60).

7.14–7.16 come before everything else that generates prose (4.6, 7.12, 7.13, groups
8 and 9). 3.3's live pass found narration breaking the authority model, and every
later AI feature would inherit that. 7.16 goes first because it changes the beat
facts that 7.14's segments cite.

### 1. Rules package

- [x] 1.1 Monorepo scaffold: `rules`, `server`, `web`, `shared`; TypeScript, linting, test runner
- [x] 1.2 Define the internal rules schema: moves, outcomes, stats, assets, oracle tables, stable IDs
- [x] 1.3 Datasworn adapter: import Starforged moves, assets, and oracles into the schema
- [x] 1.4 Dice: action roll, progress roll, oracle roll; seedable for tests
- [x] 1.5 Outcome resolution: strong hit, weak hit, miss, match detection
- [x] 1.6 Momentum: gain, loss, reset, burn, and when burning changes an outcome
- [x] 1.7 Move automation for the Automated-level moves listed under In scope (D-59): effects with no choice, inline choices, chained moves
- [x] 1.8 Move relevance rules driven by situation state; Milestone 1 uses category-only relevance with zero flags (D-66)
- [x] 1.9 Unit tests across 1.4–1.8, including matches and chained Pay the Price → suffer moves
- [x] 1.10 Attribution screen content for Datasworn's CC BY licence

### 2. Event log and state

Design: [`design-event-log.md`](design-event-log.md). Two changes to the order below,
made deliberately rather than silently. **2.2 now precedes 2.1**: the events table is
`jsonb`, so the payload types drive the DDL, the validation and the projector. **2.4 is
split**, because the projector is pure and testable without a database while the
narrative log is a second read model with its own paged query.

- [x] 2.2 Event envelope and payload schemas in `shared`: the 18 spine event types, the zod union, `EVENT_TYPE_META`, and the payload-version upcaster scaffolding
- [x] 2.1 Postgres schema: campaigns, commands, events; migration runner; the INSERT-only trigger
- [x] 2.4a State projection, pure: characters, scene, trackers, entities, canon — no I/O, plus the lint rule that keeps it that way
- [x] 2.3 Append-only event writer with actor and timestamp: per-campaign sequence, idempotent commands, server-assigned causality
- [x] 2.4b Narrative log read model and its paged query
- [x] 2.5 Void-and-redo: cascade over causation, referential containment, reproject, keep it visible (D-83, D-84)
- [x] 2.6 Manual override and narration-correction events, distinguishable from automated changes
- [x] 2.7 CLI harness that plays a scripted sequence and prints projected state

### 3. Character creation

- [x] 3.1 Character data model: stats, meters, momentum, impacts, assets, vows
- [x] 3.2 Manual creation UI with rule validation on every field
- [x] 3.3 Concept-first flow: prompt, AI proposal, review, accept or edit per field (D-123–D-126). Built on the stub provider, then run against live Claude: concept names split by a callsign and wrong stat arrays were found and fixed (see "Implementation notes (task 3.3)")
- [x] 3.4 Asset selection with rule constraints
- [x] 3.5 Creation writes character-created events
- [x] 3.6 Pronouns stored on the character: a creation input, the concept-first proposal (only when the concept states them), and a context line that says when none are recorded (D-131). No golden-session beat exercises it. Verified in the browser on the stub; not yet run against live Claude

### 4. Campaign setup

- [x] 4.1 Campaign model and creation
- [x] 4.2 Truths: pick, roll, or write, per question
- [x] 4.3 Sector as a location list with routes
- [x] 4.4 Inciting incident: AI proposals or player-written; becomes the first vow — player-written path only (D-101)
- [x] 4.5 Campaign settings: narration latitude, narration length, reroll cap
- [ ] 4.6 AI-proposed inciting incidents, grounded in the incident oracle and the characters' backgrounds, on 3.3's proposal plumbing; the player picks, edits or writes their own (D-34, D-101, D-126)

### 5. Play screen shell

- [x] 5.0 HTTP read API: list campaigns, campaign state, narrative log page (D-94)
- [x] 5.1 Layout: top bar, left rail, centre, right rail, composer
- [x] 5.2 Crew mini-cards (callsign, health, momentum) and the character drawer
- [x] 5.3 Scene header bound to scene state
- [x] 5.4 Narrative log rendering events in order
- [x] 5.5 Pressure rail: clocks, vows, progress tracks, with detail popovers
- [x] 5.6 NPC and location cards with provenance badges
- [x] 5.7 Drawers and popovers for moves, assets, NPCs, and trackers

### 6. Move flow

- [x] 6.1 Relevant-moves panel driven by situation state, with the full list one click away
- [x] 6.2 Move selection and freeform action input
- [x] 6.3 Modifier and asset-ability surfacing at the Guided level
- [x] 6.4 Animated dice, skippable
- [x] 6.5 Result card: outcome first, math on click
- [x] 6.6 Choice prompts for moves that offer them
- [x] 6.7 Momentum-burn offer when it would change the outcome
- [x] 6.8 Pay the Price flow, and the chained suffer move with an adjustable proposed amount
- [x] 6.9 Aid Your Ally
- [x] 6.10 Void-and-redo in the UI

### 7. AI provider and narration

- [x] 7.1 Provider interface: streaming, structured output, token accounting
- [x] 7.2 Claude implementation — built and tested against a faked SDK client, then run against the live API in round 20 (streaming, structured output and prompt caching all worked)
- [ ] ~~7.3 OpenAI implementation~~ — moved to Milestone 2 (D-60)
- [x] 7.4 Context assembly from projected state, not raw transcript
- [x] 7.5 Structured response schema and validation, with retry on failure
- [x] 7.6 Narration latitude (Minimal, Color, Full voice) enforced in the prompt
- [x] 7.7 Narration length scaled to the weight of the moment
- [x] 7.8 Streaming into the narrative log within the 5-second target — measured against live Claude in round 20: first text after 2.6 s (section 7 notes). That pass found the authority violations 7.14–7.16 address
- [x] 7.9 Narration correction: flag, rewrite, log
- [x] 7.10 Token counter in the UI
- [x] 7.11 Graceful stop when the provider is unavailable, with state intact
- [ ] 7.12 AI move suggestion when an action is described without a move: move and roll option, verbatim trigger text, reason and confidence, inspectable, never blocking a direct pick (D-14, D-120, A19). Open before it starts: rules clauses keep their link markup (`[Lose Momentum](id:…)`), so the verbatim quote `isVerbatimClause` checks and the text a player should read differ, and D-120 doesn't yet say which the suggestion stores
- [ ] 7.13 Trigger-mismatch note on a beat whose move doesn't fit the described action, with the same traceability, never blocking or delaying the roll (D-37, D-121, A20). No golden-session beat exercises it
- [x] 7.14 Segmented narration: fact keys and kinds, segments tagged and cited as they stream, checks that need no AI, D-115's routine cap for beats with no declared action (D-127, A21). Verified live at all three latitudes (see "Implementation notes (task 7.14)")
- [ ] 7.15 Authority check: shared rubric in the narrator prompt and a second-model checker; provisional streaming, unmistakable logged withdrawal, one re-ask, pause on a second failure; recorded-violation regression tests, keyed eval, live matrix across all three latitudes. Sign-off also checks that no passage gives a pronoun to a character whose pronouns aren't recorded (D-128, D-129, D-131, A21)
- [x] 7.16 Established injury: the harm proposal's injury carried into narration at the committed severity, with the committed amount linked to its proposal (D-130, A13). Verified live in two passes (see "Implementation notes (task 7.16)")

### 8. Oracle-grounded generation

- [ ] 8.1 Oracle roll API the AI calls instead of inventing results, including declared recipes per entity type (D-65)
- [ ] 8.2 Oracle chips under narration, linked to the passage they informed
- [ ] 8.3 Visible reroll with the discarded chip struck through, capped per campaign settings
- [ ] 8.4 AI-set odds on yes/no world questions
- [ ] 8.5 Entity creation from oracle results: NPCs, locations, factions
- [ ] 8.6 Clock creation and ticks by the AI, with a stated reason
- [ ] 8.7 Complication options on request for weak hits with no menu

### 9. Session lifecycle

- [ ] 9.1 Begin a session, with a recap generated from the event log
- [ ] ~~9.2 Scene proposals: inline, one click to accept, editable title~~ — moved out of M1 (D-71). The scene model and header binding stay, under 5.3
- [ ] 9.3 "What now?" suggested actions
- [ ] 9.4 End a session: summary and open threads
- [ ] 9.5 Resume a campaign from committed state

### 10. Polish and packaging

- [ ] 10.1 Visual design pass: dark surfaces, amber accents, Starforged typographic rhythm
- [ ] 10.2 Purpose-built treatments for progress tracks, clocks, meters, and momentum
- [ ] 10.3 Keyboard navigation and focus states
- [ ] 10.4 Golden session as an automated end-to-end test with a stubbed AI provider, a seeded RNG, and the session-1 fixture event log (D-72), from the shared fixture mechanism (D-122)
- [ ] 10.5 Docker Compose packaging for the Linux home server

---

## Implementation notes (section 1, `rules` package)

Section 1 (tasks 1.1–1.10) is done: 199 tests, all passing, across the schema,
the Datasworn adapter, dice, outcome resolution, momentum, move automation,
relevance, and attribution. This section records what the rest of the
milestone needs to know about how it's built — not a restatement of the code,
which speaks for itself, but the decisions and conventions that weren't
visible from the task list alone.

### Deviations from the task list

No task was skipped, reordered, or expanded beyond its own line. Three things
grew the schema past what task 1.2 originally anticipated, each forced by
something task 1.3 or later found in the real data rather than chosen upfront:

- **`RollOption` gained three variants** (`asset_control`, `custom`,
  `legacy_track`) after enumerating every `using` value Datasworn's move
  triggers actually use — task 1.2's original union only covered `stat`,
  `condition_meter`, and `progress_track`. Without the extra variants the
  adapter would have had to drop trigger data for 20+ moves outside the
  golden session's set.
- **`Provenance` gained a `url` field** during task 1.10 — the adapter was
  discarding Datasworn's source URL, and a real attribution needs to link to
  the source, not just name it.
- **`RawActionRoll`/`RawProgressRoll` were split out of `ActionRollResult`/
  `ProgressRollResult`** during task 1.4. Task 1.2's original types bundled
  `tier`/`isMatch` in as required fields, which doesn't work once dice (1.4)
  and outcome resolution (1.5) are separate steps that don't share a
  constructor — 1.4 now produces the Raw* types, and 1.5's `resolveActionRoll`
  /`resolveProgressRoll` complete them.

Within task 1.7's already-narrowed move set (D-59), three further
simplifications surfaced while writing the specs against the real move text.
Each is now D-80–D-82 in the design record: Face Danger's weak-hit suffer
move is left for the player to pick rather than auto-chained (the text
doesn't say which suffer move applies); Endure Harm's miss-branch
health-already-zero compounding requirement is deferred; and Ask the
Oracle's "pick two" is folded into its five odds-tier options rather than
modelled as its own flow. D-78 and D-79 record two gaps D-74's momentum
formula left open (the fixed −6 floor, and flooring the impact-reduced
maximum/reset at 0) that the code needed an answer to before it could be
written.

### Schema shape (`packages/rules/src/schema/`)

The schema is two layers, and the split is load-bearing, not stylistic:
Datasworn ships move and oracle **text**, never structured effects — there is
no `{ momentum: +1 }` anywhere in the data, and a chain like Pay the Price's
"You are harmed" leading to Endure Harm exists only in prose. So:

- **The imported layer** (`moves.ts`, `oracles.ts`, `assets.ts`,
  `game-rules.ts`) is a faithful, verbatim projection of Datasworn. Outcome
  text is typed but never parsed for meaning.
- **The automation layer** (`automation.ts`) is hand-authored, keyed to
  Astrolabe's own IDs, entirely separate from the imported layer. Every
  effect it declares carries the exact clause of imported text it implements
  (`TracedEffect.clause`), checked against the real text by
  `isVerbatimClause` (`traceability.ts`) — this is what makes "every
  automated rule behaviour is traceable" a build check instead of a
  convention nobody enforces.

IDs are Astrolabe's own (`move:`, `oracle:`, `asset:`, `impact:` prefixes),
minted by the adapter rather than borrowed from Datasworn, so a Datasworn
version bump only touches the adapter's mapping (D-21, D-63). Two things
verified before choosing the ID shape: move slugs collide across categories
(`face_danger` exists under both `adventure` and `scene_challenge`, so the
category segment stays in the ID), and oracle leaf names collide far more
(`feature` alone appears 29 times, so the full collection path stays).

Campaign-scoped instances — a character, a track — are **not** rule content
and get opaque branded IDs (`CharacterId`, `TrackId`) instead of the `move:`/
`oracle:` scheme; the event log (section 2) is what actually issues them.

Dice, outcomes, and momentum are three separate modules on purpose:
`dice/` only ever returns a `RawActionRoll`/`RawProgressRoll` (the numbers,
nothing about what they mean); `outcomes/resolveTier` turns a score and two
challenge dice into a tier, shared by both roll types; `momentum/` reuses
`resolveTier` a second time, speculatively, to compute whether burning would
help. `automation/resolveActionMove` is the one place that composes all
three plus a `MoveAutomation` spec into a single result.

### Datasworn adapter (`packages/rules/src/adapter/`, `scripts/generate-datasworn.ts`)

The adapter runs as a **build step**, not at runtime. `scripts/
generate-datasworn.ts` is the only file in the `rules` package allowed to
touch the filesystem — it reads the real `@datasworn/starforged` package,
runs it through the pure `adaptStarforged` function, and writes the result to
`src/generated/starforged.json`, which is **committed to git** and loaded by
`src/generated/index.ts` via a plain JSON import
(`import data from './starforged.json' with { type: 'json' }`). That import
form was verified to work identically under `tsc`/`tsx` (Node) and under
Vite (the `web` package's bundler) before it was chosen over a hand-written
`fs` reader — the reader would have broken the moment `web` tried to import
`@astrolabe/rules` into a browser bundle.

**Regenerating**: `npm run generate --workspace @astrolabe/rules`, then
review the JSON diff like any other generated-but-committed artifact (a
migration, a lockfile). Regenerate deliberately — on a Datasworn version
bump, or an adapter change — never as part of the normal build.

Three things the real 0.0.10 data didn't behave the way the schema initially
assumed, worth knowing before anyone touches the adapter again:

- **`@datasworn/core`'s own type for oracle leaves omits `column_text`**,
  even though 66 real tables use it. The adapter declares its own minimal
  raw shape for oracle leaves rather than fighting the upstream gap.
- **A markdown link can target a whole oracle collection**, not just a leaf
  table (about a fifth of the links in the data), spelled two ways
  (`starforged/collections/oracles/...` or with "collections" dropped).
  Astrolabe doesn't model collections as addressable entities yet, so these
  resolve to an ID nothing in the imported set answers to — a known,
  tested gap (`index.test.ts`), not a bug.
- **Three links in the Faction Name template point at oracle tables that
  don't exist under any spelling** — a genuine upstream Datasworn defect,
  not an adapter bug. `index.test.ts` asserts this exact, named set, so a
  future Datasworn version either fixing it or adding a new broken link
  shows up as a test change.

### Library and tooling choices

- **Zero runtime dependencies in `rules`**, as planned. `@datasworn/core` and
  `@datasworn/starforged` are devDependencies only — consumed by the
  build-time adapter, never imported by anything that ships.
- **Seeded dice use mulberry32** (`dice/rng.ts`), a ~10-line PRNG written
  in-repo rather than a dependency — `crypto` isn't seedable, and this is
  game dice, not security. `eslint.config.js` still bans `Math.random` and
  node built-ins inside `packages/rules/src/**`, so nothing can quietly
  reintroduce non-seedable entropy.
- **ESM throughout, with `.js` extensions on relative imports** (required by
  `NodeNext` module resolution) even though the source files are `.ts`.
  `verbatimModuleSyntax` is on, so a type-only import must say
  `import type { … }` — mixing a type and a value from the same module needs
  two import statements or an inline `type` modifier.
- **`resolveJsonModule` plus import attributes** (`with { type: 'json' }`)
  is how the frozen Datasworn artifact loads — see the adapter section
  above. Any future package that needs to import a static JSON asset can
  use the same pattern.

### Conventions the rest of the milestone should follow

- **Import `@astrolabe/rules`'s public surface, not its internal modules.**
  `STARFORGED` (the whole adapted ruleset), `ATTRIBUTION` (precomputed
  attribution content), and every schema type and resolver function are
  exported from the package root. Tests reach into `adapter/`, `dice/`, etc.
  directly by relative path; application code (`server`, `web`) shouldn't
  need to.
- **`RandomSource` is the only source of entropy dice will accept.** The
  golden-session test and all of section 1's own tests use
  `createSeededRandomSource`; the server (task 7.x onward) needs its own
  non-seeded implementation of the same one-method interface for real play.
- **`EffectTarget` ('actor' | 'aided_ally') is resolved by
  `resolveEffectTarget`, not by the caller inspecting `MoveInvocation`
  directly.** Aid Your Ally is a flag (`aidingAllyId`) on the invocation, not
  its own move (D-62) — `resolveEffectTarget` is what turns "this effect
  targets 'actor'" plus "the actor is aiding someone" plus "this was a hit"
  into a concrete `CharacterId`. Whoever builds the move-resolution endpoint
  (task 6.x) should call it rather than re-deriving the redirect rule.
- **A move's `preRoll` is read directly off its `MoveAutomation`, not
  returned by `resolveActionMove`.** Endure Harm's harm-intake step precedes
  and is independent of whether a roll even happens, so it isn't
  round-tripped through the roll resolver's return value.
- **Any new `MoveAutomation` spec (Milestone 2's combat, or extending
  Milestone 1's Reference-level moves later) must give every effect a
  `clause` that is a verbatim substring of the move text it implements.**
  `traceability.test.ts` checks this for every spec in
  `MOVE_AUTOMATION_SPECS`; a new spec file needs to be added to that map to
  be covered, and the test will fail loudly if a clause doesn't match —
  that's the mechanism working as intended, not a bug to work around.
- **Tests in `rules` run against the real `@datasworn/starforged` package
  and the real generated `STARFORGED` artifact wherever feasible, not
  hand-rolled fixtures.** This caught real issues during section 1 (the
  `column_text` type gap, the three broken Faction Name links, oracle rows
  with no rollable range) that a fixture would have hidden. Later packages'
  tests should default to the same habit where a real dependency is
  available rather than reaching for a mock first.

---

## Implementation notes (section 2, the event log)

Section 2 (tasks 2.1–2.7) is done: 458 tests with a database, 381 without.
Design: [`design-event-log.md`](design-event-log.md), decisions D-83…D-87.
This records what the rest of the milestone needs to know — the things that
were not visible from the task list or the design document alone.

### Deviations from the design

Three, each forced by building the thing rather than chosen up front:

- **`Delta` has no `progress` kind.** The design called it "a resolved
  `Effect`", but that gave two paths to the same state: a progress delta
  inside `state.changed`, and `track.advanced`. Track movement now goes
  through `track.advanced` only, so every tick on a vow or clock is one
  event type however it was caused, and Beat 8's "who ticked it and why" has
  one place to look. `Delta` is therefore "a change to one character's
  sheet", which is tighter than the design's phrasing. An outcome that moves
  a meter *and* marks progress writes two events in its command.
- **`causedBy` is per-command, not per-event.** Events inside a command
  already share a `commandId`, which is the minimum unit a void operates on,
  so causality only needs recording when it crosses commands.
- **Appending a void has no incremental projection step.** A void suppresses
  events already folded in, so `canApplyIncrementally` returns false for it
  and the caller rebuilds. The design assumed incremental application worked
  for everything.

### Shape

`projection/` is pure and tested with no database at all; `db/` is the only
module that does I/O. The split is enforced by seven lint rules over
`projection/**` — no `STARFORGED`, `Date`, `crypto`, `Math.random`,
`process`, `postgres` or provider SDK — each verified to reject a violation
before being trusted.

Two read models over one log, and they are deliberately different shapes:
`CampaignState` is bounded and rebuilt whole; `NarrativeLog` is unbounded and
paged. Where the projector *skips* a voided event, the log *keeps* it, struck
through. Both ask `EVENT_TYPE_META.voidable` the same question, so they
cannot disagree about what a cascade suppressed.

### Conventions the rest of the milestone should follow

- **Write through a command, not through `appendCommand` directly.** The
  store writes whatever validates against a schema; whether a character
  exists, whether a value is in range, and whether a target is the right kind
  of event are questions about *state*, asked against a projection in
  `db/amend-commands.ts` and `db/void-command.ts`. New writes belong in that
  layer, not in a route handler.
- **Never accept `causedBy` from a client.** A client able to supply it could
  forge causality and steer what a void cascades over.
- **Refusals are returned, not thrown, when the player is choosing.**
  `planVoid` returns a refusal because the player is shown what a void would
  remove before confirming; `voidEvent` throws once they have.
- **`EVENT_TYPE_META` is the place to declare what an event type means.** Its
  `introduces`/`references` hooks are what make D-83's containment check
  possible, `voidable` is what makes D-85's exemption work in both read
  models, and `mutatesState` is checked against the projector per type. A new
  event type that gets these wrong fails a test, not a review.
- **The store returns `occurredAt` as an ISO string.** `toTimestamp` does
  that at the row-mapping boundary, because the projector is banned from
  touching `Date`.

### Things the database corrected

Worth knowing before writing more SQL:

- `sql.json(null)` writes an SQL NULL, not the JSON document `null`.
  Pre-stringifying is not the fix either — the driver JSON-encodes for a
  `jsonb` target, so a stringified value arrives double-encoded. The working
  form is `coalesce(sql.json(v), 'null'::jsonb)`.
- Columns are mapped by hand rather than with the driver's camel-case
  transform, which would rewrite keys inside `payload` too.
- `pg_advisory_lock` is session-scoped and the connection is pooled, so a
  lock taken on one connection can be released on another. Migrations use
  `pg_advisory_xact_lock` inside the transaction instead.
- `TRUNCATE` bypasses row-level triggers, so the append-only guarantee needs
  a second, statement-level trigger.

### Running it

`npm run harness` plays the golden session's mechanical beats through the
real store and prints the projected state and the narrative log. That is the
end-to-end check section 2 has no UI for, and `harness/golden-beats.ts` is
the seed of D-72's committed session fixture.

---

## Implementation notes (section 3, character creation)

3.1–3.5 are done. 3.3 (concept-first) waited on the AI
provider and landed after group 7; see "Implementation notes (task 3.3)" below. It reuses this session’s form rather than replacing it.
Decisions: D-89 to D-93, D-105.

- **The background vow is written atomically with the character** (D-105):
  `createCharacter` (`server/src/db/character-commands.ts`) pushes
  `character.created` and, when `backgroundVow` is given, `track.created`
  into the same command. The manual creation screen exercises this via its
  own "swear a background vow now" checkbox — not spec'd as a group-3 task
  in its own right, but built now since concept-first (3.3) will need the
  same write path once it proposes one.

### Where the creation rules live

- `rules/characters/creation-rules.ts` — `CHARACTER_CREATION`, the slot spec.
  Data keyed to asset category ids, not a check in a form.
- `rules/characters/creation.ts` — `validateCharacterDraft`, `startingMeters`,
  `grantedAssets`, and the hand-authored constants (D-92).
- Both pure. The client validates as fields are edited; `createCharacter`
  revalidates on write (D-90).

### How a constraint is traced

Each rule carries a verbatim `clause` from the imported asset-collection
description, and `assetCreationTraceProblems` checks it against the real
text — the same guarantee `isVerbatimClause` gives move automation. The slot
count carries a `citation` instead, because Rulebook pp. 104–110 are outside
the CC-BY subset: **cite, never quote.** A slot with neither fails the check.

Adding a constraint: write the clause, run the test. If no imported text
states the rule, use a citation and say where it came from.

The rules the collection descriptions carry are invisible unless the adapter
imports them — it discarded them until D-89. `assetCategories`, and assets'
`categoryId` / `attachments` / `shared` / `requirement`, all arrived then.
Changing the adapter means regenerating `starforged.json` (section 1's note).

A module's attachment prerequisite needs **no creation check**: modules
attach to the starship, the starship is always granted, so a module is
always a legal pick. Don't go looking for validation code here — there
isn't any, on purpose.

### The manual creation UI and picker (3.2, 3.4)

`web/src/characters/`: `CharacterCreationScreen.tsx` (the route,
`/campaigns/:id/characters/new`, D-100) and `AssetPicker.tsx` (one picker per
`CHARACTER_CREATION` slot, grouped by `STARFORGED.assetCategories`).
`creation-form.ts` holds the pure view-model helpers, kept out of JSX and
unit tested with no DOM — same split as `play/crew/crew.ts`:

- `emptyDraft()`/`assignStat()` keep the five stats a valid permutation of
  the starting array at every step, by **swapping** two stats' values
  rather than overwriting one. This makes `stat_array_mismatch` unreachable
  through the UI rather than a message the player has to clear.
- `slotOptionGroups()` is the one place that reads `asset.categoryId` and
  `CreationSlot.allows` to build a slot's grouped options; `asset.requirement`
  is rendered under the select as text and never disables an option (D-91).
- `grantedAssetViews(STARFORGED, grantedAssets(STARFORGED))` shows the
  starship as granted, not chosen, outside the slot count.
- The screen calls `validateCharacterDraft` on every change and groups
  problems by `field` (`problemsByField`) for inline display — it never
  recounts slots itself.
- No `grantCommandVehicle` toggle: manual creation always grants the
  starship. Only wire one if concept-first (3.3) wants to offer "no ship of
  your own" — ownership is narrative and unmodelled (D-89).

### The character-creation command endpoint

`POST /api/campaigns/:id/characters` (`server/src/http/app.ts`) is the first
command endpoint task 5.0 left for later. It parses the body against
`CreateCharacterRequestBodySchema` (`shared/src/api.ts`), then calls
`createCharacter` unchanged. Two things worth knowing:

- **The actor is never taken from the request.** The route always builds
  `{ kind: 'player', playerId: LOCAL_PLAYER_ID }` itself — Milestone 1 has no
  auth (D-52), and a client-supplied actor would be exactly the kind of
  thing section 2 already refuses for `causedBy`.
- **`CharacterRejectedError` becomes a 422 carrying `problems`**, the same
  `CharacterProblem[]` shape the client already renders inline. This is the
  belt-and-suspenders path: the client blocks submission on the identical
  `validateCharacterDraft` call first, so a 422 means the two sides
  disagreed, not the expected case.

`commandId` is minted client-side (`crypto.randomUUID()` in
`api/characters.ts`'s `useCreateCharacter`) — it's the idempotency key
section 2's store already expects, not something a server route invents.

**Verification gap, narrower this time:** this session's sandbox had no
Docker/Postgres either, same as section 5's. The new route's tests in
`http/app.test.ts` typecheck and collect but were not run against a real
database. Run `npm run db:up && npm run migrate && npm test` before trusting
3.2's server half fully. The screen itself **was** exercised in a live
`npm run dev` + browser pass, unlike 5.1/5.2 — worth knowing what that
caught:

- **A stale Vite dependency-optimizer cache blanked the whole app**,
  every route, with no console error at all. `web` had never had a
  browser-side (non-type) import of `@astrolabe/shared`'s runtime code
  before this task's `ChallengeRankSchema` import — every prior import was
  `type`-only and erased at compile time. That first real import made Vite
  discover `zod` as a new browser dependency mid-session and re-optimize,
  and the already-loaded page kept referencing the stale pre-bundle,
  silently. A dev-server restart (or just not having one already running
  from a previous session) resolves it; nothing to fix in the app itself,
  but worth knowing this class of "blank page, zero errors" isn't
  necessarily a code bug.
- **`global.css`'s `html, body, #root { overflow: hidden }` (task 5.1)
  blanked out scrolling on every screen, not just the play screen it was
  written for.** This form is taller than 720px, so its background-vow
  section and submit button were unreachable — a real bug, now fixed by
  moving the `overflow: hidden` off `#root` and giving `#root` its own
  `overflow: auto` instead. The play screen still gets its single internal
  scroll region (`.log`, D-40): `PlayLayout` fills `#root` exactly, so
  `#root` never actually overflows there. An ordinary full page (campaign
  list, character creation, D-100) now scrolls like a normal page when its
  content runs long. Worth re-checking if 5.3–5.7 assumed the old
  no-scroll-anywhere behavior.

### Conventions for groups 4 and 5

- A new rules-derived constraint follows D-89's shape: data in `rules`, a
  clause where imported text states it, a citation where only the book does.
- Write through a command in `server/src/db/*-commands.ts`, never
  `appendCommand` directly (section 2's note).
- A constraint that depends on **campaign state** — "a truth can only be set
  once", "this vow is already sworn" — belongs in the command, not in
  `rules`. `rules` sees no campaign state and must stay that way.

### Gap the next session hits first — resolved by D-94

There was no HTTP API task in this list: Fastify was a dependency imported
nowhere, and the commands in `server/src/db/*-commands.ts` plus the two read
models were callable in-process only. Task **5.0** closes this with
read-only endpoints (list campaigns, campaign state, narrative log page);
D-95 moves the read-model interfaces into `shared` so `web` can import them.
Command endpoints are not part of 5.0 — each lands with the first task that
writes through it (3.2, then 6.x). (8.1's oracle interface for the AI and
4.3's sector routes remain non-HTTP, in-process interfaces.)

---

## Implementation notes (section 5, play screen shell)

Section 5 (tasks 5.0–5.7) is done. 5.0–5.2 (the HTTP read API, the
four-zone layout, crew mini-cards and the character drawer) landed first,
once 3.2, 3.4 and group 4 had used the app shell (D-88); 5.3–5.7 (the scene
header, narrative log, pressure rail, NPC/location cards, and the
remaining drawers/popovers) landed in a later session. Decisions:
D-94–D-100 for 5.0–5.2, D-104 for 5.3–5.7. This session set the frontend
conventions the rest of the milestone follows — recorded here rather than
in the design record, since these are build conventions, not product
decisions.

### App structure

`packages/web/src/` is organised by feature (`play/`, `campaigns/`), with
`app/` for routing and providers, `api/` for the HTTP layer, and `ui/` for
primitives used by more than one feature (`Drawer`, `Meter`, `Signed`,
`ErrorBoundary`). One component per file, styles in a sibling
`.module.css`, display logic kept out of JSX in a plain `.ts` file next to
its component (`play/crew/crew.ts`'s `toCrewCard`/`toCharacterSheet`, unit
tested with no DOM).

### Routing

`app/router.ts` is a pure `matchRoute(pathname) → Route`, unit tested;
`app/location.ts` holds the History API glue (`navigate`, `subscribeToLocation`)
that touches `location`/`history`/`addEventListener` — split out so
`router.ts` stays free of DOM globals, which matters because
`tsconfig.test.json` carries no `dom` lib. `app/routes.tsx` adds the
React-facing `useRoute` hook and `<Link>`. No router dependency (D-96):
five routes, one param shape.

### Server state → UI

Two query families mirror the two read models rather than merging them
(`api/campaigns.ts`): `useCampaignState` (bounded, `staleTime: Infinity`,
invalidated explicitly after a command — none exist yet) and
`useCampaignLog` (`useInfiniteQuery` keyed to `NarrativeLog.nextCursor`,
the same cursor `buildNarrativeLog` already hands back). `useCampaignState`
takes a `select` so a component subscribes to a slice — `CrewRail` doesn't
re-render when a clock ticks. `api/http.ts` is a ~30-line fetch wrapper;
response types are `shared`'s read-model and `api.ts` envelope types,
unparsed on the client since the server is the trusted producer.

### Styling

CSS Modules plus custom-property tokens (`styles/tokens.css`), no CSS
library (D-96). Values are structural placeholders; 10.1/10.2 pick the
final visual design and purpose-built meter/clock treatments — nothing in
5.1/5.2 should be mistaken for the finished look. Every tone token is
written to pair with a text label, never to carry meaning alone (§10).

### The four zones

`play/PlayLayout.tsx` is pure layout (props in, no data access), a CSS
grid with `minmax(0, 1fr)` and `min-height: 0` on every region — without
both, a grid child grows to its content and the whole page scrolls, which
is what D-40 rules out. `.log` is the shell's one `overflow-y: auto`,
verified by injecting long content and checking `document.documentElement`
never grows. D-97 sets the minimum viewport (1280×720) and the left rail's
per-card height budget for six crew.

### Drawers

`ui/Drawer.tsx` wraps native `<dialog>` (`showModal()`) rather than a
component library dependency: focus trap, Esc, backdrop click, and
top-layer stacking all come from the platform. `play/play-ui.tsx` holds
which drawer is open in a `useReducer` + context pair — the only client
state `zustand` would have held, which is why D-96 drops it.
`DrawerState`'s union grew four variants in 5.6/5.7 (`entity`, `track`,
`asset`, `moves`) exactly as its own comment anticipated, each with a
matching `open*Drawer` action.

### Tasks 5.3–5.7: binding the remaining zones

All four are read-only: they bind the placeholder zones 5.1 left
(`SceneHeader`, `NarrativeLog`, `PressureRail`) and two new rail sections
(`EntityRail` in the left rail, `PressureRail`'s three sections in the
right) to `CampaignState`/`NarrativeLog` as already served by 5.0's GET
routes. No event schema changed, no command endpoint was added — see
D-104's own note for the one place a new UI entry point (the top bar's
"Moves" button) was added instead of building a trigger that had no
natural home yet.

- **The scene header stays bound to `SceneState` as it exists today**
  (`title`, `locationId` resolved against `state.entities`) — no
  `scene.header_updated` event, no `stakes` field. A1 only needs location,
  vow and meters; Beat 2's stakes land in scene-opening narration prose
  (rendered by 5.4), not the header, and nothing writes a header-authored
  field until the AI provider (group 7) exists to write it.
- **The narrative log's per-event-type rendering (`play/log/entries.ts`)
  is a `switch` over `NarrativeEntry.event.type`** with an `unknown`
  fallback, not a hand-maintained allowlist — the server already filters
  to `EVENT_TYPE_META[type].narrative` before this code ever sees an
  event, so the client's job is only rendering, and a future narrative
  type that isn't in the switch yet shows up as its raw type name instead
  of vanishing.
- **`useCampaignLog` pages backward** (`before`/`nextCursor`, newest page
  first, each page's own beats oldest-first) — `orderedBeats` (`entries.ts`)
  reverses the page array before flattening to get reading order. Loading
  an older page prepends above the current view; `NarrativeLog.tsx`
  captures `scrollHeight` before the fetch and restores the offset by the
  delta afterward so the viewport doesn't jump, and lands at the bottom on
  first load. The scrollable element is `PlayLayout`'s own `.log` div
  (D-40's one scroll region) — `NarrativeLog` doesn't render a second
  scroll container, it reaches its parent via `ref.current.parentElement`
  to read and restore scroll position and to attach the scroll listener.
- **No `Popover.tsx` existed before 5.5.** It wraps the native Popover API
  in `auto` mode (outside-click/Escape dismissal for free, same convention
  as `Drawer.tsx`'s `<dialog>`), positioned from the trigger's own
  `getBoundingClientRect()` rather than CSS anchor positioning, which
  isn't universally supported yet. A pressure-rail row's popover is local
  component state, not `play-ui.tsx` state — only drawers go through that
  reducer; a lightweight, single-row popover doesn't need cross-component
  coordination.
- **D-97's "+N more opens a drawer" is wired for the pressure rail
  (`TrackerDrawer`, scoped to one `TrackKind`) but stays static text for
  crew and for present entities (`EntityRail`)**, matching `CrewRail`'s
  own precedent: Milestone 1's golden session never has enough crew or
  entities to overflow six visible, so for those two rails it is headroom
  rather than something exercised, and a drawer that can never open is not
  worth wiring. The pressure rail gets a real one because task 5.7 names
  "trackers" as one of its four drawer targets regardless.
- **NPC and location cards share one view-model and component**
  (`entities/entities.ts`'s `entityCards`, filtered to `kind: 'npc' |
  'location'`) — factions and the ship entity are deliberately excluded,
  since no task asks for either and the visual starmap stays out of scope.
- **The moves reference browser (`play/moves/`) is D-104's new decision**:
  built now rather than waiting for task 6.1's relevant-moves panel, since
  moves had no other trigger surface yet. It groups `STARFORGED.moves` by
  category (rulebook order) and drills into one move's trigger/outcome
  text; outcome and trigger prose render as the verbatim imported text,
  including Datasworn's own `__emphasis__`/`[link](id:...)` markup
  unrendered — no markdown renderer exists anywhere in the app yet, and
  adding one for this alone would be scope beyond the task.
- **The asset chip in `CharacterDrawer` is now a button**, opening
  `play/assets/AssetDrawer.tsx` (full name/category/requirement/ability
  text from `STARFORGED.assets`) — the one edit to an already-"done" 5.2
  file, needed because 5.7 names assets as one of its four drawer targets
  and the chip was the only existing surface that could trigger it.
- **No manual-override editing UI.** `CharacterDrawer.tsx`'s own comment
  used to flag this as maybe landing in 5.7; it doesn't — none of 5.3–5.7's
  task wording asks for it, and A16's editing needs a command endpoint
  group 5 has no reason to add.

### What the next session needs to know

- **`CharacterId`, `CampaignId`, etc. stay branded through the client**
  where they index projected state (`Record<CharacterId, CharacterState>`);
  a route param is plain `string` until it's used to index something, since
  branding a URL segment buys nothing.
- **No component test tooling yet.** Logic worth testing is kept in plain
  `.ts` functions (`crew.ts`) covered by the existing vitest glob; jsdom and
  testing-library are a task 10.4 decision, not assumed here.
- **The bundle ships the whole `STARFORGED` JSON** (character drawer needs
  asset/impact names). ~840 KB / 178 KB gzip today. Accepted for a desktop
  home-server app; revisit only if load time shows it.
- **Verification gap for 5.0–5.2:** that session's sandbox had no
  Docker/Postgres, so `http/app.test.ts`'s database-backed tests and the
  harness-seeded golden-campaign walkthrough were written and typechecked
  but not run against a real database.
- **5.3–5.7 closed that gap.** This session's sandbox had Docker/Postgres
  already running: `npm run db:up && npm run migrate && npm test` passes
  619 tests (0 skipped) against the real database, and `npm run harness`
  plus a live `npm run dev` (server and web) pass in the browser exercised
  every one of 5.3–5.7 against the golden session's own fixture data —
  scene header, ordered log with the struck-through void/reroll and the
  correction disclosure, the clock's popover reason, the AI-established
  NPC card and drawer, and the moves browser. Console was clean throughout.

---

## Implementation notes (section 4, campaign setup)

4.1–4.5 are done. Decisions: D-101–D-103. This section's server half landed
first, then the web wizard; the shape of both is set out here rather than
restated in code comments.

### The two deferrals, and why they don't just show up as missing features

D-32 and D-34 both describe generation the AI grounds in oracle rolls, but
the AI provider (group 7) and the oracle-recipe API (task 8.1) both run
*after* group 4 in the work order (`milestone-1.md`'s order line). Rather
than block all of group 4 on groups 7–8, or silently build something
narrower than the design record without saying so, this session asked and
recorded the answer as new decisions:

- **4.4** builds the player pick/edit/write path and the vow it produces.
  No AI-proposed incidents yet (D-101) — same treatment as 3.3.
- **4.3** builds a manual location-and-routes editor: the player writes a
  location's name and description directly, no roll (D-102). No `location`
  `OracleRecipe` is declared anywhere yet — that's task 8.1's job, not
  4.3's — so there was nothing to ground a roll in even if the AI existed.

Both are additive later: the AI-proposal half of each lands on top of the
same forms this session built, not as a replacement for them.

### What was already there versus what this session added

`campaign.created` (with `CampaignSettingsSchema` embedded — 4.1 and 4.5
are one command, not two) and the `createCampaign` option on
`appendCommand` already existed from section 2. Genuinely new: the
`campaign-commands.ts` functions that call them (`createCampaign`,
`setTruth`, `addSectorLocation`, `addSectorRoute`, `swearIncitingVow`), the
four new `POST /api/campaigns/*` routes, two new event types
(`truth.set`, `sector.route_added` — the shared/events/index.ts comment's
"land with the features that write them" plan, exercised for the first
time), two new `CampaignState` slices (`truths`, `sector`), and the
projector cases for both.

### `campaignId` is client-minted, unlike every other server-minted ID

`createCampaign` is the one command where minting the id server-side
(`uuidv7()`, as `characterId` does) would be unsafe rather than merely
redundant: `campaignId` is also `campaigns.id`'s own primary key and the
first half of `appendCommand`'s idempotency key. A fresh id on every call
defeats replay detection entirely — the `campaigns` insert never collides,
so a retry silently writes a second full campaign. The fix, once traced
through: the client mints `campaignId` the same way it already mints
`commandId`, so a retry reuses both and collides on `campaigns.id` instead
— a thrown error, not a silent duplicate. `campaign-commands.ts`'s comment
on `createCampaign` has the full trace, including the one thing this
didn't fix: the collision surfaces as a raw `campaigns_pkey` violation, not
`appendCommand`'s usual replay-with-the-original-response path, because the
`campaigns` insert runs before the `commands` insert `isCommandReplay`
watches. Making the first command of a campaign fully replay-safe is a
change to `appendCommand` itself (section 2's code), out of this group's
scope. Worth knowing: `createCharacter` has a related but harmless version
of the same shape — it returns the locally-minted `characterId` on a
replay rather than the one `result.response` actually stored — harmless
there only because `characterId` isn't a partition key, so nothing
double-writes.

### Truths reuse `OracleTable`, not a new schema

Datasworn's `TruthOption` carries its own `min`/`max` d100 range per
option — the same shape as an `OracleRow`. So `rules/src/adapter/truths.ts`
adapts each of the 14 truths straight into an `OracleTable`
(`packages/rules/src/schema/oracles.ts`'s existing type), reusing
`rollOracle` unchanged rather than inventing a `TruthQuestion` type or a
`truth:`-prefixed ID. `oracleIdFromSource`'s `'truths'` marker
(`id-mapping.ts`, anticipated since task 1.3) already produces the right
`oracle:` id from a truth's Datasworn source id — e.g.
`starforged/truths/cataclysm` → `oracle:cataclysm` — so `truth.set`'s
payload just carries an `OracleId`, validated by the schema everything else
already uses.

**Deliberately not imported**: each option's `quest_starter` text (no use
until AI-proposed incidents exist, D-101) and the nested per-option
elaboration table some options embed via `{{table:...}}` (e.g. Cataclysm's
"what caused it" sub-roll) — importing those would mean minting ids for
tables Datasworn itself doesn't `_id`, for a feature nothing in Milestone 1
reads. The `{{table:...}}` markup is stripped from the option text at
adapt time rather than left to render as literal templating syntax; the
adapter test (`truths.test.ts`) asserts both the count (14) and the strip.

**The server rolls, never the client.** `setTruth`'s `'rolled'` request
carries no die result at all — the command calls `rollOracle` itself,
against `cryptoRandomSource()` (`server/src/random-source.ts`, new: the
first non-seeded `RandomSource` in the codebase, since no move-resolution
endpoint has needed real dice yet). A `'picked'` request names a row by
index rather than sending text, for the same reason: trusting client-sent
text as "picked from the book" would let a compromised client write
arbitrary text under that provenance. Only `'written'` text comes from the
client verbatim.

### Sector locations reuse `entity.established`; only routes are new

`entity.established` already had `kind: 'location'` and a
`provenance.establishedBy: 'player' | 'ai'` field from section 2 — a
manually-added sector location is exactly this event with
`establishedBy: 'player'`, `groundedIn: []`, no `recipeId`. Routes are the
one relation `entity.established`'s per-entity `fields: Record<string,
string>` bag can't hold well (D-103), so `sector.route_added` is new; its
`EVENT_TYPE_META.references` names both endpoints, which is what will let
D-83's containment check refuse deleting a location a route still points
at, once void-and-redo UI (6.10) reaches this far.

### The inciting incident is assembly, not new machinery

`swearIncitingVow` writes exactly the `track.created(kind: 'vow')` shape
`character-commands.ts`'s background vow already writes — no `characterId`
by default, since the golden session's own inciting vow ("recover the
flight recorder of *Meridian's Hope*") belongs to the crew, not to one
character (`harness/golden-beats.ts` writes it the same way). Nothing here
calls `resolveActionMove` — `automation/specs/swear-an-iron-vow.ts`'s own
comment already says the vow's rank and text are player input gathered at
setup, upstream of what that move's automation resolves.

### The web wizard

`CampaignCreationScreen.tsx` is a four-step wizard kept as component state
(`Step = 'settings' | 'truths' | 'sector' | 'incident'`), not four routes:
every step after the first writes against the campaign step one just
created, and nothing else needed a URL of its own. `campaigns/campaign-
setup.ts` holds the pure view-model helpers (`unansweredTruths`,
`sectorLocations`, `sectorRouteViews`) in the same out-of-JSX,
DOM-free-tested style as `characters/creation-form.ts` and
`play/crew/crew.ts`. The truths step does not gate "Next" on every question
being answered — it tracks progress, not completeness, since nothing in
the golden session's fixture needs every truth answered, only that the
flow can produce one.

`harness/golden-beats.ts` was deliberately **not** rewired through
`createCampaign` — it already builds its campaign+crew opening as one raw
`appendCommand` call, consistent with how it constructs `character.created`
payloads directly rather than calling `createCharacter`; the harness stays
a low-level, direct-to-event-store check by design, not a caller of the
command layer.

### Verification gap

Same as every prior section: this sandbox has no Docker/Postgres, so
`campaign-commands.test.ts` and the four new blocks in `http/app.test.ts`
are written, typecheck (`npm run typecheck`, which covers test files too —
use this rather than a bare `tsc --build`), and pass everything vitest can
run without a database, but the database-backed cases themselves were not
run. `CampaignCreationScreen`'s settings step **was** exercised in a live
`npm run dev` + browser pass (form fill, submit, error path rendered
correctly on the expected network failure with no backend running); the
truths/sector/incident steps were not, since they need a real API to do
anything. Run `npm run db:up && npm run migrate && npm test` before
trusting the rest.

---

## Implementation notes (section 6, the move flow)

6.1–6.10 are done. Decisions: D-106–D-109. This section had no read/write
API of its own in the task list — group 6 is the first real caller of
`resolveActionMove`/`resolveMethodOption`/`resolveEffectTarget`/
`resolvePayThePriceChain`, so building the write API these tasks need was
foundational work folded in alongside 6.2, the same way D-94 covered
group 5's read API.

### What's new versus what group 6 reused

Reused unchanged: every `rules/automation` resolver, `MOVE_AUTOMATION_SPECS`,
`relevantMoves`, the server's command pattern (`db/*-commands.ts`),
`cryptoRandomSource()`, `previewVoid`/`voidEvent` (written in section 2,
never routed until now), `play-ui.tsx`'s drawer-reducer pattern, `play/moves/`
(`moves.ts`, `MoveDrawer.tsx`), `crew/crew.ts`'s view-model split,
`Drawer`/`Popover`, and both API-layer conventions (`useCampaignState`'s
`select`, `useCreateCharacter`'s client-minted `commandId` + invalidate).

New: `rules/automation/condition.ts` (`evaluateCondition`, D-109); five
event types (`move.choice_made`, `move.method_chosen`, `move.chained`,
`oracle.rolled`, `amount.committed`) plus a `preroll_effect` `ChangeCause`
kind; `server/src/db/move-commands.ts` (`invokeMove`, `applyMoveChoice`,
`burnMomentum`, `resolvePayThePriceMethod`) and six new HTTP routes
(four for the move flow, two for void); narrative-log rendering for all
five new event types; and, in `web`, a `move-flow.tsx` reducer+context
sibling to `play-ui.tsx`, the whole `play/moves/` UI (`MoveComposer`,
`ResultCard`, `ChoicePrompt`, `BurnOfferPopover`, `PayThePriceFlow`,
`AidAllyPicker`, `DiceAnimation`, `RelevantMovesPanel`), `api/moves.ts`,
and `play/log/VoidControl.tsx`.

### The write API's shape (D-106)

One command per player decision, following `design-event-log.md` §1's own
worked example almost verbatim: `move.invoked`, `dice.rolled` and (when the
tier has no pending choice) `state.changed` land together in one
`POST /campaigns/:id/moves`. A tier that offers a `Choice` leaves its
choice-dependent effects for `applyMoveChoice` — the player hasn't decided
yet. Endure Harm's harm intake is bundled into `invokeMove`'s own command
rather than split into its own step (D-107): the harm precedes the roll
it's part of, and it's one player decision, not two.

The one real design wrinkle: `chainedFromCommandId`. A client following an
offered or auto chain (Face Danger's miss → Pay the Price; Pay the Price's
table result → Endure Harm) needs to prove it's taking a real offer, not
forging one. The natural id to check against — the event that declared the
chain — doesn't exist yet at the point a *same-command* payload would need
to embed it (ids are minted at append time). The client already has the
right id in scope, though: the `commandId` it minted for the call that
produced the offer. So the follow-up call names that commandId, and the
server looks for a `move.chained` event with a matching envelope
`commandId` naming the requested move before accepting it as `causedBy`.

### `oracle.rolled` and the Condition evaluator (D-108, D-109)

`oracle.rolled` was designed in section 2 but had no caller until Pay the
Price's table method (Beat 7) — introduced now, narrower than group 8's
eventual use, reused unchanged when 8.x rolls NPC/location/faction recipes.

`evaluateCondition` (`rules/automation/condition.ts`) handles the whole
`Condition` union even though Milestone 1 only exercises Endure Harm's
`not: hasImpact` — a partial evaluator would silently fall through on a
guard nobody's tested yet. It takes facts (`hasImpact`, `meterValue`) as
parameters, the same shape `resolveActionMove` already takes
`markedImpacts: number` in — `rules` still never reads campaign state.

### Web conventions this section set

- **`move-flow.tsx` is a sibling to `play-ui.tsx`, not folded into it.** A
  roll is a multi-step decision (`idle → composing → result →
  pay-the-price → pay-the-price-result`); a drawer is a single overlay
  choice. Once a step's component has its data, further refinements
  (a choice pick, a burn accept, the Aid Your Ally note) are that
  component's own local state, not more reducer actions — they don't
  change *which* panel is showing.
- **D-98 lands here, not in group 5.** `CrewCard`'s `isActing` prop existed
  since section 5 as a placeholder; `Composer.tsx` now owns the acting-
  character `<select>`, lifted into `PlayScreenContent` as plain
  `useState` (not the move-flow reducer) since it outlives any one move.
- **The Guided level (6.3) surfaces text, never parses it.** An asset
  ability's `enhances: readonly MoveId[]` (built in section 1, unused
  until now) filters which abilities to show next to a plain label+amount
  "adds" input; the player decides whether it applies and types the
  number. The base stat/meter add itself is computed server-side from
  `using` — the trust boundary is exactly `setTruth`'s: name *which* stat,
  never its value.
- **`DiceAnimation` wraps already-settled data.** The roll is final before
  the animation starts (§10/A18); skipping just reveals the children
  early, never triggers a re-roll.
- **Void's HTTP half was a pure routing gap.** `previewVoid`/`voidEvent`
  existed since section 2; `VoidControl.tsx` is a `Popover` built from a
  one-shot `fetchVoidPreview` call, not a live query. "Redo" has no
  mechanism of its own (D-27) — it's the same move-flow, reopened.

### Verification

`npm run typecheck`, `npm run db:up && npm run migrate && npm test` — 669
tests passing (1 skipped: `db:migrate.test.ts`'s own no-op case) against a
real Postgres, including a `move-commands.test.ts` cascade test that voids
a Face-Danger miss and confirms the whole chain it caused (Pay the Price's
table roll, the auto-chain, Endure Harm's harm and roll) disappears —
Beat 7's exact shape, three commands deep. A live `npm run dev` + browser
pass exercised Beats 3, 5 and 7 end to end against a fresh campaign: Face
Danger miss → Pay the Price (table, landing on "You are harmed") → Endure
Harm (harm committed, then a weak-hit choice applied, health and momentum
both updating live) — and, separately, Secure an Advantage aiding an
ally, confirming the redirect note and the strong-hit momentum landing on
the aided character rather than the actor. The void control's *refusal*
path (D-84, no active session on a fresh campaign) was exercised live;
its success path is what the cascade test above covers, since no HTTP
route begins a session yet (task 9.1) for a live campaign to have one.

---

## Implementation notes (section 7, the AI provider and narration)

7.1, 7.2 and 7.4–7.11 are done (7.3 moved to Milestone 2, D-60). 7.12 and
7.13 were added in round 18 (D-120, D-121) and are still open; they follow 3.3
in the work order. Decisions: D-110–D-119. Group 7's own visible output is `role: 'beat'` narration after a
move flow, the narration correction, the token counter and the pause.
Complications (8.7), AI oracle rolls and chips (8.1–8.5), the recap (9.1), the
summary (9.4) and "What now?" (9.3) run through the same engine but are not
built here, and `narration.written.groundedIn` is always `[]` until 8.x.

### Shape

- **`server/src/ai/`** holds the provider layer. `provider.ts` defines the
  two-operation interface (D-112). `claude.ts` and `stub.ts` implement it.
  `respond.ts` owns validation, the single re-ask, and turning an outcome
  into accounting events, so the two providers can't disagree about what a
  usable answer is. `status.ts` is the in-memory availability tracker.
- **`server/src/ai/context/`** is pure prompt assembly: `beat-scope.ts`,
  `describe-beat.ts`, `render-state.ts`, `latitude.ts`, `length.ts` and
  `prompt.ts`. A new lint fence, modelled on `projection/`'s, bans I/O, the
  clock, the provider SDK and the concrete providers. It was checked by
  rejecting six seeded violations. Unlike projection, it *may* read
  `STARFORGED`: move names and choice labels are what the AI needs to hear,
  and nothing here is folded into state.
- **`server/src/db/narration-commands.ts`** holds the three AI commands.
  Streaming ones split into `prepare*` and `run*`, so every refusal is a 422
  before the stream opens. A provider failure is an outcome that gets
  committed, never a thrown error.
- **`server/src/http/ai-routes.ts`** holds the new routes. The param
  helpers moved out of `app.ts` into `params.ts` so both files share them.
  `buildApp` now takes `{ sql, ai }`, and `serve.ts` builds the provider
  from the environment.
- **Web.** `api/narration.ts` and `api/ndjson.ts` are the HTTP layer.
  `play/narration/` holds `frames.ts` (pure) and `narration-stream.tsx`, a
  context alongside `move-flow.tsx` and `play-ui.tsx`.
  `play/log/CorrectionControl.tsx` and `play/overrides/OverrideControl.tsx`
  are the new controls, and `play/tokens.ts` formats the counter.

### Deviations from the approved plan

- **The harm-proposal route is `POST /campaigns/:id/amount-proposals`**,
  not `/moves/harm-proposal`. It proposes for any move whose `preRoll`
  declares a `proposed_amount` and writes `amount.proposed`, so it is named
  for the fact rather than for Endure Harm.
- **Override provenance gained `FieldProvenance.manual`.** The plan used
  `actorKind === 'player'` for A16's "edited" marker, which the live pass
  proved wrong: a player also *creates* characters and swears vows, so a
  brand-new vow read as edited. `applyOverride` now sets `manual: true`,
  and only that marks a field as edited. `design-event-log.md` §3 still
  describes `actorKind` as the badge source, and that stays right for
  player/AI/system provenance. It just can't separate "created" from
  "overridden".
- **Pause replaces the composer only when no move flow is open.** A flow
  already under way can finish, so its already-committed mechanics are
  never stranded behind the banner. A new move cannot start while paused.
  If the harm proposal fails mid-composer, the player sets the amount by
  hand.
- **Before the proposal arrives, the harm amount starts at the range's
  mildest end** (−1), not D-107's midpoint. A player who rolls before the
  proposal lands never commits more harm than they chose.
- **`TokenUsage` gained `cacheRead` and `cacheWrite`**, required rather
  than optional, so the counter can never silently drop cached tokens. That
  changed five `toEqual` expectations across the projection and harness
  tests.

### How a chain is narrated (D-110)

`resolveBeatScope` walks `causedBy` from the named command up to the root
move, then takes the root's causal subtree. That subtree comes from
`causalCommands`, factored out of `cascade.ts`, the same walk a void uses,
so "what one passage covers" and "what a void removes" can't drift apart.
The passage's `causedBy` is the last live event of the chain, which is why
voiding Face Danger's roll also voids the passage.
`narration-commands.test.ts` asserts exactly that.

`describeBeat` deliberately **omits `amount.proposed`**. The passage follows
the amount the player committed (Beat 7). Naming the AI's −2 "serious burn"
would invite prose that contradicts the −1 the player chose.

### Accounting (D-113)

Every attempt writes its own event. An attempt that returned, valid or not,
writes `ai.completed`. A failed call closes with `ai.failed`, which carries
tokens only when a thrown attempt reported partial usage, so a rejected
attempt is never counted twice. Both are exempt from void (D-85), and the
meta test now lists three exempt types. A command writes its accounting and
its content together, so tokens and the text they bought can't be separated.

### Things worth knowing before 8.x and 9.x use this

- **Everything is on the beta messages surface**, because that's where
  `fallbacks: "default"` lives (D-119). A mid-stream fallback continues from
  the partial text, so concatenated text deltas are still one passage.
  `@anthropic-ai/sdk` went from 0.68 to 0.125 for `output_config` and
  `effort`. 0.68 had neither.
- **Structured output uses `create` plus `betaZodOutputFormat`, not
  `parse`.** The SDK's `parse` throws on a schema failure and loses the
  usage the call still spent. JSON-schema range constraints may be dropped
  in conversion, so bounds such as the harm range are enforced by our own
  zod check, and a violation is re-asked.
- **Adaptive thinking stays on.** `max_tokens` is a generous 16k ceiling,
  because thinking tokens count against it. Length is asked for in the
  prompt (D-115); a `max_tokens` stop is treated as a failed attempt, not
  committed.
- **The cache breakpoint sits after the latitude block.** The system prompt
  is byte-stable per campaign, and everything per-call is in the user turn.
  The rules and latitude blocks together may be under Opus 5's minimum
  cacheable prefix. If `cacheReadTokens` stays at 0 on real calls, that's
  why, not a silent invalidator.
- **`ASTROLABE_AI_PROVIDER=stub`** runs the app with no key. Its dev
  fallback answers every text call and `harm_proposal`. Any new structured
  purpose (8.7's complications, 9.3's suggestions) needs a stub answer
  added in `create-provider.ts`, or play pauses on it locally.
- **Availability is in-memory** (`AiStatus`). It resets on restart, and a
  server with no credential starts unavailable. "Configured" means
  `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN` or `ANTHROPIC_PROFILE` is set.
- **Two known gaps, both acceptable for single-user Milestone 1.** Two
  narration requests for the same chain with *different* commandIds, sent
  concurrently, can both commit; the UI's one-at-a-time queue prevents it.
  The correction popover also sits low and shows a small inner scrollbar at
  1568px, which 10.1 can pick up.

### Verification

`npm run typecheck`, `npm run lint` and
`npm run db:up && npm run migrate && npm test` all pass: 740 tests with 1
skipped, against real Postgres, and `npm run build --workspace
@astrolabe/web` also passes. The database tests skip silently unless
`DATABASE_URL` is exported
(`postgres://astrolabe:astrolabe@localhost:5433/astrolabe`), which is how an
earlier run showed 161 skipped.

A live `npm run harness` plus a browser pass on the golden campaign, against
the **stub** provider, covered:

- a Gather Information flow reaching Done, with the passage streaming,
  committing and rendering with Flag/Void controls;
- the token counter rising and surviving a reload;
- a correction (flag, note, then Rewrite) committing behind "Corrected";
- Endure Harm opening with "The Guide proposes -1: …" and the proposal
  logged;
- Juno's momentum overridden from +5 to +6, showing "edited", updating the
  crew card, and logged as "Override: 5 → 6";
- a server with no API key starting paused, with the banner, a disabled
  Flag, "Guide unavailable" in the top bar, and state intact.

The console stayed clean. **Not verified live:** real Claude narration, the
five-second first-token target (A18), `cacheReadTokens > 0`, and Retry
recovering from a mid-session outage in the browser. That last path is
covered by `ai-routes.test.ts`. No API key was available in that session.
Run the live pass with `ANTHROPIC_API_KEY` set and read `firstTokenMs` off
the `ai.completed` events.

For that live pass:

- **Start with one harm proposal.** It is the only call that combines `create`,
  `output_config.format`, the structured-outputs beta header and `fallbacks`.
  If it fails with `rejected`, the request shape is wrong: read
  `ai.failed.message`. Then run one beat for the streaming path.
- **If Opus 5 at effort `low` misses A18's five seconds,** remember that the
  first text token arrives only after the thinking pass. The next lever is the
  model (`ASTROLABE_CLAUDE_MODEL=claude-sonnet-5`), not the UI.

**Post-review fixes:**

- **Reload lockout.** A server-reported failure that this client never saw
  used to pause play, and nothing could clear it: no AI call could run while
  paused, so play stayed locked until a restart. Now only a missing credential
  pauses from the status alone. The indicator still shows other failures, and
  the next call checks the provider again.
- **Rejected requests.** A 400/404/422 from the provider now records
  `errorKind: 'rejected'` (added to D-113) rather than reading as an outage.
- **Double-charged retries.** If the same commandId is retried while its first
  call is still running, both calls spend tokens but only one set of
  `ai.completed` events survives. The second is rolled back by the uniqueness
  check, so the counter under-reports that spend (D-75). The UI queue prevents
  this.

---

## Implementation notes (dev fixtures and reset, D-122)

These were built ahead of 10.4, because the dev database and 10.4 need the
same thing: a campaign in a known state that can be thrown away and rebuilt.

### Shape

- **`server/src/fixtures/`** holds the fixture code.
  - `session-one.ts` plays D-72's `session-1` through the real commands:
    campaign, three truths, a three-location sector with routes, the crew
    (validated by `createCharacter`), the formidable vow, and four session-1
    moves. Each move is narrated through `runBeatNarration` with a scripted
    `StubProvider`, and the session ends with a summary and three open
    threads. It lands on the golden session's Setup: momentum Vesna +7,
    Rook +2, Juno +3.
  - `session-two-open.ts` plays the same session 1 under its own campaign
    id, then opens session 2 at Varga Relay. `session-1` has no open
    session, and nothing in the app can open one until 9.1. Without this
    fixture, a reset would leave nothing to play, and moves would attach to
    the ended session 1. Once 9.1 lands, retire it.
  - `ids.ts` derives version-8 uuids from the fixture name and a key. It
    covers the campaign, every command, and the session and scene.
  - `loaded-dice.ts` is a `RandomSource` that lands on scripted faces and
    throws if the rules draw more dice than were scripted. The rules engine
    still scores each roll, and the fixture checks the tier it expected.
  - `index.ts` is the registry: `FIXTURES` and `seedFixture`, which skips a
    campaign that is already present.
- **`server/src/db/reset.ts`** has `resetSchema`, which drops and recreates
  the connection's current schema, and `summariseCampaigns`.
- **Scripts:**
  - `npm run db:seed [-- name…]` adds fixtures that aren't present yet.
  - `npm run db:reset -- --yes` drops, migrates and seeds. Without `--yes`
    it lists the campaigns it would drop; under `NODE_ENV=production` it
    refuses.
- **`npm run harness`** now plays into a throwaway schema and drops it. Every
  earlier run had added another "Lantern Wake" to the dev database. If a run
  crashes before cleanup, it leaves a `test_harness_*` schema behind. That's
  harmless, and `db:reset` doesn't remove it because it only drops `public`.
- **`resetSchema` changes `public`'s owner** from `pg_database_owner` to the
  connecting role. That doesn't matter for a single-user local database.

### Known limits

- **Only the ids the fixture chooses are stable.** Event, character, track
  and entity ids are still minted by the commands, and timestamps are real.
  `fixtures.test.ts` therefore compares replays by event shape and by crew
  values keyed by callsign. If 10.4 needs byte-identical logs, the commands
  will need an injectable id source.
- **Fixture rolls are recorded as `rng: { source: 'crypto' }`.** `invokeMove`
  hard-codes that value, including when a test overrides the RNG. It's
  existing behaviour, left as is.
- **`session.began` and `session.ended` are appended directly** until 9.1
  and 9.4 build their commands.
- **The vow has no progress.** Reach a Milestone has no effects yet (see its
  spec), and faking ticks with an override would mark the vow as manually
  edited.
- **The harness's `golden-beats.ts` used move ids the rules data doesn't
  define** (`gather_information` rather than `gather-information`), which
  the UI couldn't resolve. It now uses the real ids. Unit tests elsewhere
  still use underscore ids as opaque strings; nothing resolves them there.
- **For 10.4:** seed `session-1` into a test schema, then play session 2
  through the HTTP routes. Narration should come from a scripted stub queue
  and dice from loaded dice, so the provider path is exercised rather than
  bypassed.

---

## Implementation notes (task 3.3, concept-first creation)

3.3 is done. Decisions: D-123 to D-126. It came after group 7 because it needs the provider (D-57 as amended). 4.6, the AI-proposed inciting incidents, comes next on the same machinery.

### Shape

- **`server/src/db/proposal-commands.ts`** holds the shared proposal machinery, and 4.6 is its second caller. `runProposal`:
  - rolls the requested oracle tables, minting each roll's event id up front with `NewEvent.id`, so the proposal can cite them;
  - builds the request and calls `generateValidated` with a rules check;
  - writes one command: the rolls, the accounting, then the proposal on success or `ai.failed` on failure.

  Rolls are written even when the call fails, because dice that were rolled stay rolled. A replay rebuilds the answer from the stored events. `proposeCharacter` is the 3.3 caller.
- **`server/src/ai/context/creation.ts`** is pure and sits inside the context lint fence. It holds:
  - `CHARACTER_PROPOSAL_ROLLS`: given name, family name, callsign, and two backstory prompts;
  - the system prompt, `CREATION_RULES`, plus a cached asset catalogue of 79 lines of `id | name | category | first ability, cut to 160 chars`, instead of about 115KB of full ability text;
  - `characterProposalSchema`: asset ids limited to the selectable set, and roll citations as an enum of roll keys;
  - `checkCharacterProposal`: runs `validateCharacterDraft`, and requires the name, callsign and every hook to cite a roll. A name or callsign that already appears in the concept is exempt.
- **`generateValidated`** gained an optional `check`. The re-ask now carries the problem ("Your previous answer was rejected: …") rather than repeating the identical request. Beat narration and the harm proposal are unaffected.
- **Accepting** goes through the ordinary `createCharacter` path, which gained `hooks` and `proposalCommandId`. The server resolves the proposal and sets it as the character's `causedBy`. An unknown proposal id throws `UnknownProposalError`, which the route returns as 422.
- **Log and tokens.** A proposal command belongs to no session or scene. `readNarrativeEvents` skips its events by command kind (`PROPOSAL_COMMAND_KINDS`), so the rolls never show up as unexplained oracle beats. `CampaignState.tokenUsage` counts every AI call, and the session counter still counts calls made while a session is open (D-125).
- **Routes.**
  - `POST /api/campaigns/:id/character-proposals {commandId, concept}` returns 201 with the proposal and rolls, or with `{ok:false, errorKind, message, rolls}`.
  - `POST /characters` accepts `hooks` and `proposalCommandId`.
- **Web.**
  - `characters/proposal.ts` has the pure helpers: `slotsFromAssets`, `applyProposal`, `guideNotes`, `rollChip` and `hooksToSend`.
  - The creation screen now keeps one `CreationForm` object instead of separate state per field. It adds a concept box and a "Guide" marker with its reason and roll chips under each proposed field. Editing a field switches the marker to "Edited" with a restore link, and re-proposing over edits asks for confirmation inline. It also adds a hooks section, which manual creation can use too.
  - The character drawer shows backstory hooks, and the top bar's tooltip carries the campaign total.
- **Stub.** `ASTROLABE_AI_PROVIDER=stub` answers `character_proposal` with a valid build that cites every roll.

### Verification

`npm run typecheck`, `npm run lint` and `npm test` pass against Postgres, and `npm run build --workspace @astrolabe/web` succeeds. A browser pass on the stub provider, against a scratch database seeded with `session-2-open` and dropped afterwards, covered:

- proposing from a concept: the form filled, markers and roll chips showed, and the campaign counter rose from 480 to 600;
- editing the callsign, which switched the marker to "Edited" with a restore link;
- creating the character: `character.created` carried the proposal as its `causedBy` and stored the hooks, and the drawer's Backstory section listed them;
- the proposal's rolls staying out of the narrative log.

That pass caught three bugs, now fixed: a duplicate React key when two reasons had the same text, the "Edited" marker using the AI provenance colour, and proposal rolls appearing in the session log.

**Live pass (round 20).** Claude accepted the schema, including the 79-value enum. Two failure modes turned up and were fixed:

- **Player-written names.** A name the player wrote around a callsign (`Tomas "Rust" Abara`) failed the concept test, which pushed the AI to rename the character. The test now matches word by word.
- **Stat array.** The AI kept giving a third stat a 2. The prompt now states the counts.

After the fixes, three concepts proposed cleanly on the first try.

**Latency.** Proposals take 13–27 s, and effort `low` was no faster. The form stays usable while one runs, and A18 doesn't apply here.

## Implementation notes (task 7.16, established injury)

7.16 is done (D-130). It comes first of 7.14–7.16 because it changes the beat facts that 7.14's segments will cite.

### Shape

- **Proposal.** `harmProposalSchema` answers `amount`, `injury` and `reason`:
  - `injury` is one sentence of what physically happens and where, with no severity words;
  - `reason` is a short phrase for the severity.

  `amount.proposed` stores `injury` as an optional field, so pre-D-130 events still parse. The prompt says the injury happens *to* the character and describes nothing they do.
- **Commitment.** `invokeMove` accepts `proposalEventId`, and `requireLiveProposal` refuses:
  - a missing id, or one that isn't an `amount.proposed`;
  - a proposal for a different move, character or meter;
  - a voided proposal;
  - a proposal on a move with no amount.

  `amount.committed` records the id. It is not `causedBy`, for the reason D-130 gives.
- **Facts.** `describeBeat(scope, state, log)` now takes the whole log, because a standalone suffer move's proposal is outside the beat's causal scope. When the committed amount names a live proposal with an injury, it adds:
  - "The injury, as the Guide established it: …";
  - when the amounts differ, "The player judged it milder/more severe than the Guide's proposed N: narrate that injury at the severity the player set."

  The proposal's amount and `reason` still never reach narration.
- **Web.** The composer sends the proposal's event id with the committed amount, and `play/moves/harm-proposal.ts` formats "The Guide proposes −2: *injury* (*reason*)". The log entry shows the injury too.

### Verification

`npm run typecheck`, `npm run lint`, `npm test` (793 tests) and the web build pass. The new tests cover:

- injury lines on a chained beat and on a standalone one;
- no adjustment line when the amounts match;
- a voided proposal establishing nothing;
- `requireLiveProposal`'s refusals;
- the stored injury on the proposal and on the route.

**Live pass.** Two harm proposals, one after a Face Danger miss and one standalone, were each committed one milder than proposed, then narrated. Both passages narrated the established wound at the milder severity ("The armor took most of it. What's left is a bad bruise and a shallow cut"), and neither used a pronoun for Rook.

### Recorded violations, for 7.15's corpus

Both live passages still broke D-129, as the round-20 passage did. They are recorded here verbatim (claude-opus-5, Color latitude, 2026-09-13) so 7.15's regression tests and eval use real outputs.

1. **Round 20, standalone Endure Harm with no declared action, strong hit with a match, dramatic budget** (the failure that led to D-127–D-130):
   > The hatch wins something back before it surrenders. A spur of sheared track catches Rook under the arm where the plating thins, and the servo's own strength drives it home — a bright hot line that goes through the undersuit and keeps going. Rook feels the suit clamp down around the wound, sealant frothing cold into the gap, the readout in the helmet blooming amber at the edge of vision. Rook stands there a moment in the widening bar of sunlight, hand braced on the frame, breathing through it. Counts one breath. Counts a second. The pain does not go away so much as get put somewhere, folded and stowed the way everything has been folded and stowed for thirty years of doing this. The arm still moves. The hand still closes. That is the whole of what matters. Rook pulls it free, flicks the wet from the gauntlet, and steps sideways through the gap into Varga Relay. Inside, the corridor is cold and utterly still — and down at the far end, where the one lit row of windows should be, something has already stopped moving, as though it heard the hatch open a long time ago.

   Its harm proposal, standalone (before D-130 split out the injury): "A pressure-warped bulkhead gives way as Rook forces the relay's inner hatch, and the shearing edge of ancient hull plate bites through armor into the meat of his shoulder." It gives Rook an undeclared action and a guessed pronoun.
2. **7.16 live pass, Endure Harm after a Face Danger miss, routine budget:**
   > The bulkhead's stressed edge lets go with a sound like a struck bell, snapping back into Rook's shoulder and driving down the forearm. The armor seam splits. The arm is pinned to the frame, metal biting through the gap in the plating, and cold station air whistles in past the tear.
   >
   > Rook does not waste breath on it. Braced boots, a shove with the good shoulder, and the edge peels back enough for the arm to come free. Blood wells along the seam, slow and dark, already tacky in the cold.
   >
   > The armor took most of it. What's left is a bad bruise and a shallow cut, and Rook rolls the shoulder once to prove the joint still works, then keeps moving down the corridor toward the lit windows.

   It contains a disposition ("does not waste breath on it"), undeclared actions ("a shove with the good shoulder", "rolls the shoulder once"), and undeclared movement ("keeps moving down the corridor").
3. **7.16 live pass, standalone Endure Harm, routine budget:**
   > Ten meters on, the deck lies to Rook. A plate that looks solid gives under the weight, buckling with a groan, and the leg drops through to the knee. The torn edge rakes down the shin, catching armor first, then skin where the greave ends. It is not much. A scrape, a line of heat in the cold.
   >
   > Rook plants the other boot, hauls the leg out of the hole, and shakes the grit loose from the plating. The wound seeps a little and stops. Somewhere below, dislodged metal falls a long way and does not land.
   >
   > The lit windows are still ahead, unchanged, and Rook walks on with the same steady tread.

   It contains undeclared movement ("Ten meters on", "walks on"), undeclared actions ("plants the other boot, hauls the leg out"), and a characteristic response ("the same steady tread").

The clean counterpart is round 20's Face Danger weak hit with a declared action ("Rook plants both boots on the collar's scorched rim…"). Passages 2 and 3 break the rules even at routine length, so D-115's cap narrows the problem but doesn't fix it.

## Implementation notes (task 7.14, segmented narration)

7.14 is done (D-127, D-115 amended). Beat narration is now a list of checked segments. D-129's rubric and D-128's checker are 7.15.

### The streaming spike, before any code

Three runs of claude-opus-5 on the Beat 7 facts, 2026-09-13 (low effort, adaptive thinking):

- **Format.** Structured output over `messages.stream` put the keys in schema order (`about`, `character`, `basis`, `text`) in all 3 runs. Tags therefore arrive before text, as D-127 needs. First segment *text* came at 1.7–2.9 s, with 6.1–8.3 s in total. The first JSON delta arrives at about 1.3 s, but it is scaffolding, not prose, so A18 is measured at the first checked text. Tagged text over `streamText` was faster to first text (1.0–1.4 s) but was never needed: the structured path holds A18, so D-127's fallback is moot.
- **Labels are not honest by default.** With plain segment definitions, all 5 runs (3 structured, 2 tagged) put undeclared actions inside `character_undergoes`: "Rook braces against the housing, breathes through it", "Rook shakes the arm out, rolls the shoulder once to test it". Some also added claims that reach beyond the beat ("no worse than a hundred other bad mornings", "Rook has been carved on before, and the body knows the drill"). No run used `character_does`.
- **Tightened definitions.** Two changes together gave 4 clean runs out of 4: a `character_undergoes` definition that names the verbs it excludes ("no verb where the character moves, braces, breathes deliberately, tests, shakes, holds, decides or reacts"), and D-129's rules in the prompt (tagged format). They were clean of undeclared action, disposition and history. None of those runs used `character_does` either, because nothing was declared, so honest labelling was still untested.
- **Declared action.** On a beat with a declared action, `character_does` appeared in 4 runs out of 4, each time citing the declared-action fact. So when the label is allowed, the model uses it honestly. Whether it labels an *undeclared* action honestly is still unshown: no run wrote one. D-128's checker remains the guarantee for mislabelled segments.

### Shape

- **Facts.** `describeBeat` gives every fact a key (`F1`…), a kind, the player character it concerns and its source event. The kinds are D-127's five (declared action, effect, roll, choice, injury) plus `move`, for which move was made and what it chained into. An oracle result is a `roll`, and a momentum burn is an `effect`. Rolls and choices belong to the move being resolved, so they carry that move's actor. The injury lines cite the `amount.committed` event, never the proposal. `declaredAction` drives D-115's routine cap in `beatWeight`.
- **Schema** (`ai/context/segments.ts`). `basis` is an enum of this beat's fact keys and `character` an enum of the campaign's callsigns. Constrained decoding therefore enforces "every cited key exists"; the check still runs, because the stub isn't constrained. `character_does` and `character_says` are offered at every latitude. That is D-127's argument for keeping `character_does` in the schema, applied to speech as well: removing the label would relabel the violation rather than reject it.
- **Prompt.** Facts are rendered as `[F2] (declared action, Rook) …`. The segment definitions are the tested wording, and the `world` definition excludes a player character's body, gear and blood. The prompt says "No action was declared" when that is the case. These instructions sit in the user turn, as tested, so the system blocks stay byte-stable.
- **Checks** (`checkSegmentTags`, `checkSegmentText`). The tag checks are:
  - `character_does` must cite a declared action by that same character;
  - `character_undergoes` must cite a fact about that character;
  - `character_says` is refused below Full voice;
  - every cited key must exist;
  - a `world` segment must carry no character, and a character segment must name one.

  The text checks are:
  - a `world` segment must not name a player character (callsign or name word, case-sensitive, whole word);
  - below Full voice, a character segment must not contain quotation marks.

  The problems are written in words for the re-ask, and 7.15's withdrawal will reuse them.
- **Streaming.** A new provider operation, `streamStructured`, forwards the JSON text as it arrives. `json-stream.ts` reads it character by character. `SegmentGate` holds each segment's text until its tags have passed, then releases text up to the last word boundary once the text checks pass on everything so far. A name or a quotation mark is caught before any of it is shown. The first failure stops all further text. The attempt is rejected with a `reset` frame and re-asked once with the problem, and a second failure is `ai.failed` (`invalid_output`), as before. The finished value is validated again in full.
- **Stored.** `narration.written.text` is the segments joined into one paragraph. An optional `segments` field holds `{ about, characterId, basis: eventId[], text }`.
- **Not segmented.** The 7.9 rewrite still streams as plain prose; D-128's checker covers rewrites in 7.15. The frames are unchanged: the client still receives `delta` text.
- **Dev fixtures (D-122).** The session-1 passages are now scripted as segments. Rewriting them showed that the old text broke D-129: it gave Juno a disposition ("a salvager's patience") and voiced Rook's and Juno's opinions at Color. Those parts were removed.

### Verification

`npm run typecheck`, `npm run lint` and `npm test` (817 tests) pass. The new tests cover:

- fact keys, kinds and characters;
- the routine cap;
- each tag and text check, plus the documented blind spot (an undeclared action mislabelled as undergoing passes);
- the schema's enums;
- the JSON reader;
- the gate at chunk sizes from 1 to 200 (no letter of a named character is ever released);
- a streamed undeclared action that never reaches the sink and is re-asked with its problem;
- a second failure ending in `ai.failed`;
- `streamStructured` on the Claude provider.

**Live pass** (claude-opus-5, 2026-09-14, without 7.15's rubric). Beat 7 with its declared action, and a standalone Endure Harm with none, were each run once at each latitude. The API accepted the per-beat enum schema. All 6 passages committed on the first attempt. First checked text reached the player at 1.3–3.0 s, and the full passage took 4.9–9.8 s. Every declared action was labelled `character_does` and cited its fact. No passage used a pronoun for Rook.

### Recorded violations the checks that need no AI passed, for 7.15's corpus

4. **Standalone Endure Harm, Color, labelled `character_undergoes`:** "The pain crests and fades fast, leaving Rook steady on the deck, unshaken by it." "Unshaken" is a player-owned interior.
5. **Beat 7, Full voice, labelled `character_says`:** "A hiss escapes through Rook's teeth, then flattens into something steadier, almost dismissive, as the arm comes back up to the plate." The outward expression is allowed at Full voice. "The arm comes back up to the plate" is an undeclared action.
