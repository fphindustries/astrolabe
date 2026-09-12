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

---

## Task breakdown

Issue-sized. Each task should land in one sitting and leave the build working.

**Order (D-88).** Task numbers are stable, so references to them keep
resolving; the order they are *worked* in is:

> 1 · 2 · **3.1, 3.5** · **5.1, 5.2** · 3.2, 3.4 · 4 · 5.3–5.7 · 6 · 7 · 3.3 · 8 · 9 · 10

The play-screen shell comes before the creation and campaign-setup UI because
those have no React app to live in — `web` is a bare Vite scaffold. The
server-side halves of groups 3 and 4 stay ahead of it, since they need no UI
at all. 3.3 waits on the AI provider in group 7.

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
- [ ] 3.2 Manual creation UI with rule validation on every field — blocked on the React app shell (5.1)
- [ ] 3.3 Concept-first flow: prompt, AI proposal, review, accept or edit per field — blocked on the AI provider (7.1, 7.2)
- [ ] 3.4 Asset selection with rule constraints — the constraints are built and traced (D-89); the picker UI is blocked on the React app shell (5.1)
- [x] 3.5 Creation writes character-created events

### 4. Campaign setup

- [ ] 4.1 Campaign model and creation
- [ ] 4.2 Truths: pick, roll, or write, per question
- [ ] 4.3 Sector as a location list with routes
- [ ] 4.4 Inciting incident: AI proposals or player-written; becomes the first vow
- [ ] 4.5 Campaign settings: narration latitude, narration length, reroll cap

### 5. Play screen shell

- [ ] 5.1 Layout: top bar, left rail, centre, right rail, composer
- [ ] 5.2 Crew mini-cards (callsign, health, momentum) and the character drawer
- [ ] 5.3 Scene header bound to scene state
- [ ] 5.4 Narrative log rendering events in order
- [ ] 5.5 Pressure rail: clocks, vows, progress tracks, with detail popovers
- [ ] 5.6 NPC and location cards with provenance badges
- [ ] 5.7 Drawers and popovers for moves, assets, NPCs, and trackers

### 6. Move flow

- [ ] 6.1 Relevant-moves panel driven by situation state, with the full list one click away
- [ ] 6.2 Move selection and freeform action input
- [ ] 6.3 Modifier and asset-ability surfacing at the Guided level
- [ ] 6.4 Animated dice, skippable
- [ ] 6.5 Result card: outcome first, math on click
- [ ] 6.6 Choice prompts for moves that offer them
- [ ] 6.7 Momentum-burn offer when it would change the outcome
- [ ] 6.8 Pay the Price flow, and the chained suffer move with an adjustable proposed amount
- [ ] 6.9 Aid Your Ally
- [ ] 6.10 Void-and-redo in the UI

### 7. AI provider and narration

- [ ] 7.1 Provider interface: streaming, structured output, token accounting
- [ ] 7.2 Claude implementation
- [ ] ~~7.3 OpenAI implementation~~ — moved to Milestone 2 (D-60)
- [ ] 7.4 Context assembly from projected state, not raw transcript
- [ ] 7.5 Structured response schema and validation, with retry on failure
- [ ] 7.6 Narration latitude (Minimal, Color, Full voice) enforced in the prompt
- [ ] 7.7 Narration length scaled to the weight of the moment
- [ ] 7.8 Streaming into the narrative log within the 5-second target
- [ ] 7.9 Narration correction: flag, rewrite, log
- [ ] 7.10 Token counter in the UI
- [ ] 7.11 Graceful stop when the provider is unavailable, with state intact

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
- [ ] 10.4 Golden session as an automated end-to-end test with a stubbed AI provider, a seeded RNG, and the session-1 fixture event log (D-72)
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
