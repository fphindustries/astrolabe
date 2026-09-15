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
- [x] 4.6 AI-proposed inciting incidents, grounded in the incident oracle and the characters' backgrounds, on 3.3's proposal plumbing; the player picks, edits or writes their own (D-34, D-101, D-126, D-132–D-134)

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
- [x] 7.12 AI move suggestion when an action is described without a move: move and roll option, verbatim trigger text, reason and confidence, inspectable, never blocking a direct pick (D-14, D-120, D-135, A19)
- [x] 7.13 Trigger-mismatch note on a beat whose move doesn't fit the described action, with the same traceability, never blocking or delaying the roll (D-37, D-121, D-136, A20). No golden-session beat exercises it
- [x] 7.14 Segmented narration: fact keys and kinds, segments tagged and cited as they stream, checks that need no AI, D-115's routine cap for beats with no declared action (D-127, A21). Verified live at all three latitudes (see "Implementation notes (task 7.14)")
- [x] 7.15 Authority check: shared rubric in the narrator prompt and a second-model checker; provisional streaming, unmistakable logged withdrawal, one re-ask, pause on a second failure; recorded-violation regression tests, keyed eval, live matrix across all three latitudes. Sign-off also checks that no passage gives a pronoun to a character whose pronouns aren't recorded (D-128, D-129, D-131, A21). Verified live: 54 checked narrations across all three latitudes; eval at 95% precision, 86% recall (see "Implementation notes (task 7.15)")
- [x] 7.16 Established injury: the harm proposal's injury carried into narration at the committed severity, with the committed amount linked to its proposal (D-130, A13). Verified live in two passes (see "Implementation notes (task 7.16)")

### 8. Oracle-grounded generation

- [x] 8.1 Oracle roll API the AI calls instead of inventing results, including declared recipes per entity type (D-65, D-137–D-139). The world pass runs after the passage (D-138, amended by the step-0 spike). Verified live (see "Implementation notes (task 8.1)")
- [x] 8.2 Oracle chips under narration, linked to the passage they informed; the scene frame is their first passage (D-138, D-141). Also the follow-up passage that narrates what a world pass established. Verified live; with the frame planned on Sonnet 5, first text arrives at a median of 4.3 s (see "Implementation notes (task 8.2)")
- [x] 8.3 Visible reroll with the discarded chip struck through, capped per campaign settings (D-142). In the world pass's interpretation; verified live with a planted contradiction (see "Implementation notes (task 8.3)")
- [x] 8.4 AI-set odds on yes/no world questions, minimal: a world-pass plan field (D-28, D-138). No golden-session beat exercises it. Verified live (see "Implementation notes (task 8.4)")
- [x] 8.5 Entity creation from oracle results: NPCs. Locations and factions deferred (D-144). The drawer shows the NPC's fields and its grounding as chips (see "Implementation notes (task 8.5)")
- [x] 8.6 Clock creation and ticks by the AI, with a stated reason (D-138, D-140, D-145). Verified live (see "Implementation notes (task 8.6)")
- [x] 8.7 Weak-hit complications with no menu: written by the player or picked from AI options on request (editable, re-askable), required before Done (D-15, D-143 as amended). Verified live and in the browser (see "Implementation notes (task 8.7)")

### 9. Session lifecycle

- [x] 9.1 Begin a session, with a recap generated from the event log. A command, not a move; the scene carries forward; the log is per session; no moves outside a session (D-146, D-147). Verified live at all three latitudes and in the browser on the stub (see "Implementation notes (task 9.1)")
- [ ] ~~9.2 Scene proposals: inline, one click to accept, editable title~~ — moved out of M1 (D-71). The scene model and header binding stay, under 5.3
- [x] 9.3 "What now?" suggested actions: three, anchored in state, any move including Reference ones (D-148). Verified live and in the browser on the stub (see "Implementation notes (task 9.3)")
- [x] 9.4 End a session: summary and open threads, proposed, reviewed and committed; Reach a Milestone as a reminder only (D-149). Verified live and in the browser on the stub (see "Implementation notes (task 9.4)")
- [x] 9.5 Resume a campaign from committed state: Begin Session after an ended session, resume in place, Narrate for a chain owed a passage (D-150). Verified in the browser on the stub (see "Implementation notes (task 9.5)")

### 10. Polish and packaging

Worked in the order 10.4 · 10.5 · 10.1 · 10.2 · 10.3 (D-151).


- [ ] 10.1 Visual design pass: dark surfaces, amber accents, Starforged typographic rhythm
- [ ] 10.2 Purpose-built treatments for progress tracks, clocks, meters, and momentum
- [ ] 10.3 Keyboard navigation and focus states
- [x] 10.4 Golden session as an automated end-to-end test with a stubbed AI provider, loaded dice rather than a seeded RNG, and the session-1 fixture event log (D-72), from the shared fixture mechanism (D-122). Played through the HTTP routes; `golden-beats.ts` retired (D-151, D-152; see "Implementation notes (task 10.4)")
- [x] 10.5 Docker Compose packaging for the Linux home server: one app image serving the API and the built client, plus Postgres; production is not seeded (D-154). Built and smoke-tested with `docker compose` (see "Implementation notes (task 10.5)")

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

## Implementation notes (task 7.15, authority check)

7.15 is done (D-128, D-129, D-131, A21). Every beat passage, 7.9 rewrite and harm-proposal injury is checked before it commits. D-128 was amended twice in round 21, before building and again after measuring; the amendments record the decisions made here.

### Shape

- **Rubric** (`ai/context/authority-rubric.ts`). D-129's four rules, in one place. The Guide's standing prompt carries three of them, replacing its old "what the players own" paragraph. The checker carries all four, plus the latitude's voice line. The only examples quoted are the ones D-129 records, from round 20's passage. Nothing from the later corpus is quoted, so the eval can't pass by recognition.
- **Checker** (`ai/context/authority-check.ts`, `ai/checked.ts`).
  - The checker is a separate provider, `ASTROLABE_CHECK_MODEL`. It defaults to `claude-sonnet-5` (see "Choosing the checker").
  - It receives the latitude, the crew, the beat's facts, and the text, plus the tagged segments when there are any.
  - It answers `{ review, violations[] }`. Each violation carries the rule, the character, the segment, a verbatim quote, and why.
  - The server confirms every quote appears verbatim where the checker says. An unverifiable verdict is re-asked once, then the call fails closed.
- **Provider.**
  - `claude.ts` omits thinking and effort for `claude-haiku-4-5`, which rejects both.
  - `createCheckerFromEnv` builds the checker.
  - `buildApp` and the routes now take a `checker`.
  - The stub checker passes anything it isn't scripted to reject.
- **Flow** (`runChecked`).
  - Text streams provisionally.
  - A D-127 segment-check failure, or a checker verdict, is a **withdrawal**. It sends a `withdrawn` frame with the reason in words and the rejected text, records the attempt, and re-asks once with the quoted violations.
  - A `checking` frame marks when the check starts.
  - A second failure ends in `ai.failed` (`invalid_output`), and play pauses under D-116.
  - A checker failure over text already shown is withdrawn with the rule `unchecked`, then `ai.failed` under the checker's own name and error kind.
  - A cut-off or unreadable reply keeps 7.5's silent reset.
- **Record.**
  - `narration.withdrawn { role, targetEventId?, attempt, checker, model?, latitude, rejectedText, violations }` is narrative and voidable.
  - It is written in the same command as the outcome, after every attempt's `ai.completed` (the narrator's and the checker's, purpose `narration_check`).
  - `withdrawalReason` in `shared` gives the words ("Withdrawn: it said what Rook thinks, feels or characteristically does, which is the player's to decide."), so the frame and the log agree.
- **Harm proposals.** The injury is checked before the proposal is written. A failing injury is re-asked and recorded as a withdrawal with `role: 'injury'`. Nothing was on screen to strike.
- **Web.**
  - The pending passage is labelled "not yet checked", then "Checking the passage before it is kept…".
  - Provisional text is italic.
  - A withdrawn attempt stays on screen with its reason and quotes, and "Show what was withdrawn" reveals the struck text.
  - The log renders `narration.withdrawn` the same way, with no correction or void control of its own.
- **Corpus and eval.**
  - `ai/eval/authority-corpus.json` holds 26 entries: 14 that should be withdrawn and 12 clean. 23 are recorded output from rounds 20 and 21 and the 7.14 spike and live pass; 3 are constructed and marked so.
  - `npm run eval:authority [-- --runs N] [--record]` grades the live checker, precision first.
  - `authority-verdicts.json` holds Sonnet 5's recorded run. CI replays each verdict through the stub (`authority-corpus.test.ts`): the schema, quote verification against the real text, and the withdraw-or-pass decision, with the recorded agreement pinned.

### Choosing the checker

Every figure below comes from the 26-entry corpus.

| Checker, prompt | Precision | Recall | Time per check |
|---|---|---|---|
| Haiku 4.5, first prompt | 100% | 36% | ~1–7 s |
| Haiku 4.5, `review` + check procedure | 80% | 86% | 6.0 s avg |
| Sonnet 5 (low effort), first prompt | 92% | 79% | ~3 s |
| **Sonnet 5, `review` + check procedure, 3 runs** | **95%** | **86%** | **3.9 s avg, 5.7 s p90** |

- Haiku's first-prompt run passed "Rook grimaces and mutters, "Not today."" at Color, and every spike passage with an undeclared action.
- Sonnet's two false withdrawals, over 3 runs, were the same borderline line: "It does not slow the hands or dim the eyes".
- Its two repeated misses (spike structured 3 and tagged 1) narrate Rook shaking the arm out and rolling the shoulder. The player's choice, "Shake it off: take +1 health", can be read as covering that.

### Live matrix

The matrix ran 5 beats × 3 latitudes × 3 runs through the real pipeline: claude-opus-5 narrating, claude-sonnet-5 checking, 2026-09-14. The beats were:

- Beat 7's chain;
- a standalone Endure Harm with nothing declared;
- Juno's Gather Information weak hit;
- Vesna's scan, upgraded by a momentum burn;
- Rook's Face Danger strong hit.

**Overall.**

- **Kept:** 40 of the first 45 passages.
- **First text:** median 1.8 s, max 3.0 s, so A18 holds.
- **Check:** median 2.6 s, p90 4.0 s.
- **Committed:** median 10.0 s, p90 13.3 s.

**Withdrawals.** Three authority withdrawals were each rewritten and kept:

- "the pain settles into something Rook can work through";
- "something in the shape of the gap sits sharp and usable", which is borderline;
- a momentum burn narrated as Vesna's feeling ("The edge she had been carrying goes out of her").

**Finding for group 8: a beat whose facts name a second player character reliably gets that character narrated acting, and the only recovery is a pause.** The aided scan paused play in 5 of its 9 runs. In each, both attempts narrated Rook helping ("Rook leans in over the secondary board and trims the filter"), an action Rook takes nowhere in the beat. D-127's checks refused it both times, so play paused as designed. The test beat had labelled the roll's add "aid from Rook". The app writes "bonus from an earlier move" (`move-commands.ts`), which names no one. Rerun with the real label, all 9 of 9 kept, with two withdrawals recovered: a momentum burn as interior, and an undeclared action for Vesna. The real label is why the golden session's Beat 5 is safe today. 8.x and 9.x will put crew and NPC names into beat facts as a matter of course, and each named character is an invitation.

**Sign-off.** I read all 49 kept passages. Every run, with its timings, withdrawals and kept segments, is in `packages/server/src/ai/eval/live-matrix-7.15.json`.

- **Pronouns:** no passage gives Rook or Juno a pronoun. Both regex flags were false alarms ("the burns they leave", "a line of them"). Vesna's "her" follows her recorded she/her.
- **Authority:** no kept passage clearly breaks D-129. Borderline, and kept:
  - "the arm stays where it is, steady against the plate" (Beat 7, Full voice);
  - "the corridor feels suddenly, usefully quiet" (Rook's airlock, Color);
  - "The margin Vesna has been carrying is spent into the scan" (Minimal).
- **Facts:** one factual slip that D-128 leaves to others. At Minimal, Juno's weak hit says "Juno's momentum rises to 5"; it went from 3 to 4. Consistency with committed mechanics is out of the checker's scope by design.

### Verification

`npm run typecheck`, `npm run lint`, `npm test` (857 tests) and the web build pass. The new tests cover:

- a checker withdrawal, re-asked with its quote;
- a second withdrawal pausing play;
- an unavailable or rejected checker failing closed, with the shown text withdrawn;
- an unverifiable quote re-asked, then failing closed;
- a rewrite withdrawn with its target;
- an injury withdrawn before proposing;
- segment-check failures as withdrawals, and a cut-off reply still a reset;
- the model-parameter omission for Haiku;
- the reason words;
- the frame reducer and log view model;
- the corpus replay.

The withdrawal UI was checked by unit tests only, not in a browser: the stub checker never withdraws.

## Implementation notes (task 4.6, AI-proposed inciting incidents)

4.6 is done (D-34, D-101, D-126, D-132–D-134). It came after 7.14–7.16 because it is prose the Guide writes, and it runs on 3.3's proposal plumbing as that plumbing's second caller.

### Shape

- **Prompt** (`ai/context/incident.ts`, pure).
  - `INCIDENT_PROPOSAL_ROLLS` rolls `oracle:campaign-launch/inciting-incident` three times, one roll per option.
  - `renderSetup` gives the truths keyed by oracle id, the sector's locations with their routes, and each crew member's name, pronouns, background vow and hooks. It says plainly when any of these is empty, so the AI doesn't read silence as a crew with no past (D-133).
  - `INCIDENT_RULES` carries D-129's narrator rules (D-134) and D-123's rule against invented names.
- **Answer.** `incidentProposalSchema` asks for exactly three options.
  - Every citation is an enum of what exists: rolls, truths, locations by name (a repeated name gets a numbered key), and crew by callsign.
  - A part the campaign has nothing in is left out of the schema, because an enum needs a value.
  - `checkIncidentProposal` rejects repeated titles, and requires that some option draws on the truths when there are any, and on the crew when there is one. A failing answer is re-asked once with the problem stated.
- **Command** (`proposeIncidents`, `db/proposal-commands.ts`).
  - `runProposal` writes the rolls, the accounting and `incident.proposed`, or the rolls and `ai.failed`.
  - `toPayload` now also receives the state `build` was given, so the answer's keys resolve to ids.
  - `campaign.propose_incidents` joins `PROPOSAL_COMMAND_KINDS`, so its rolls stay out of the log.
- **Swearing.** `swearIncitingVow` accepts `proposalCommandId`. The server looks for an `incident.proposed` in that command and records it as the vow command's `causedBy`. A command holding anything else, a character proposal included, throws `UnknownProposalError` (422). The words sworn are always the ones the player sent.
- **Event.** `incident.proposed { options: [{ title, rank, situation, reason, groundedIn, drawsOn { truths, locations, characters } }] }` is not narrative and changes no state. Like `character.proposed`, it references nothing: `drawsOn` is provenance, and a suggestion nobody took must not block voiding what it mentioned (D-83). A proposal belongs to no session, so D-84 already puts it out of void's reach, and `swearIncitingVow` doesn't check that the proposal is live, the same as `createCharacter`.
- **Route.** `POST /api/campaigns/:id/incident-proposals {commandId}` returns 201 with the proposal and rolls, or with `{ok:false, errorKind, message, rolls}`, as character proposals do.
- **Web.** The incident step gains an "Ask the Guide" section above the vow form.
  - It says when there is no crew to draw on.
  - Each proposed incident is a card showing its rank, situation, reason, what it draws on, and its roll chip.
  - "Use this" fills the vow form, asking first if that would replace words the player wrote.
  - The form shows 3.3's Guide marker, or "Edited" with a restore link.
  - A new proposal replaces the cards and never touches the form. Pure helpers are in `campaigns/incident-proposal.ts`.
- **Dev stub.** It answers three incidents that draw on the first truth and crew member listed in the request, so a stubbed setup passes the check.

### Live pass

This was 2026-09-14 with claude-opus-5, on a campaign with three truths, two locations and a route. Every run is in `ai/eval/live-incidents-4.6.json`.

- Runs 1–3 had a two-character crew with hooks and background vows. Runs 4–5 had no crew.
- **5 of 5 proposals** passed on the first attempt, in 14–17 s each, the same order as 3.3's character proposals.
- **Grounding.** Every option built on its own roll, and every option drew on at least one truth. In the crew runs, every option named a crew member. When one roll's row appeared twice (run 4), the two options took it in different directions.
- **Authority.** No situation gave a crew member an action, feeling, intent or line of speech. Situations describe what has happened. Where one mentions a crew member, it is through an extension of their record (below).
- **Pattern: a crew member's hook extended into a present-tense fact about the world, in 3 of the 9 crew-run options.** Vesna's record says only that she owes a salvage guild. Run 1's reason places the debt at the Anchorage ("where Vesna's salvage debt is held"). In runs 2 and 3, a situation has that guild acting in the sector ("The salvage guild that holds Vesna's debt has been seizing collateral from stranded ships"). D-134 holds for 4.6, because the player reads every word before swearing. **For groups 8 and 9:** the same hooks will reach the narrator with no review in between, and each hook is an invitation to extend it, the same class of finding as 7.15's aided scan.
- **Names.** No new named people, places or factions. "Founder Clans" and "the Exodus" come from the picked truths' own text.

### Verification

`npm run typecheck`, `npm run lint`, `npm test` (877 tests) and the web build pass. The new tests cover:

- what the prompt offers, and what it says when a part is empty;
- the enum constraints, the check, and key resolution;
- the dev stub's answer passing the schema and the check;
- the command writing rolls, accounting and proposal, and replaying;
- a failing check re-asked and then recorded with its rolls;
- a sworn vow naming its proposal, and an unknown or wrong-kind proposal refused;
- the route and the log;
- the card and marker helpers.

A browser pass on the stub provider walked a new campaign through the wizard. It covered:

- the no-crew notice;
- proposing and viewing the cards;
- the replace confirmation over typed words;
- the Guide marker, then "Edited" with its restore link after an edit;
- swearing the edited vow, whose command's `causedBy` is the `incident.proposed` event.

The console was clean.

## Implementation notes (task 7.12, AI move suggestion)

7.12 is done (D-14, D-120, D-135, A19). This is Beat 3's fallback: "a player who typed the action without picking a move would get a suggestion instead".

### Shape

- **Candidates and prompt** (`ai/context/suggestion.ts`, pure).
  - `SUGGESTABLE_MOVES` is D-135's filter: moves that are automated and in the relevant-moves panel, minus session moves and Pay the Price. It yields Face Danger, Secure an Advantage, Gather Information, Swear an Iron Vow, Reach a Milestone, Endure Harm and Ask the Oracle.
  - The candidates are rendered once, each with its trigger text and each roll option's condition text, and sent as a cached system block. The user turn carries projected state, the actor and the action.
  - `SUGGESTION_RULES` forbids adding to what the player described, and carries D-131's pronoun rule (see the live pass).
- **Answer and check.** `moveSuggestionSchema` gives `{ moveId | null, rollOption | null, triggerText | null, reason, confidence }`, with moves and options as enums. `checkMoveSuggestion` requires:
  - no roll option or quote when no move fits;
  - a roll option that belongs to the move, and one at all where the player has a choice (Face Danger's five stats; not Endure Harm's highest-of);
  - a quote of at least 12 characters that is verbatim, per `isVerbatimClause`, in the move's `trigger.text` or the chosen option's condition text.

  A failing answer is re-asked once with the problem stated.
- **Command** (`db/suggestion-commands.ts`). `suggestMove` writes the accounting and `move.suggested` in the open session and scene, or `ai.failed`. It replays by command id, and refuses an empty action or unknown character before asking.
- **Invocation.** `invokeMove` accepts `suggestionEventId` and writes it on `move.invoked`. `requireLiveSuggestion` refuses:
  - an id that isn't a `move.suggested`;
  - a suggestion for another move or character;
  - a voided suggestion.

  What the player rolls with and writes stays theirs.
- **Link markup.** A rules test in `text/plain.test.ts` pins that no trigger or condition text has link or emphasis markup, so the stored quote is also what the player reads (D-135).
- **Route.** `POST /api/campaigns/:id/move-suggestions {commandId, actorCharacterId, actionText}` returns 201 with the suggestion or the failure. The invoke route passes `suggestionEventId` through.
- **Web.** The idle composer is now `ActionPrompt`, with the relevant-moves panel first.
  - **Panel first:** the first browser pass put the new text box above the panel, and in a short window that pushed the panel below the fold. D-14 keeps the direct pick in view.
  - **Asking:** below the panel sit "What do you do?" and **Suggest a move**. The card shows the move and roll option, the confidence in words, "Why?" (the quoted trigger and the reason), and **Use this**. When nothing fits, it says so with the reason.
  - **Stale answers:** a suggestion disappears once the typed words change, and the prompt is keyed by the acting character.
  - **Picking by hand** carries the typed words into the composer. **Use this** also carries the roll option and the suggestion, which the composer marks "Guide" with the same "Why?". The composer then sends `suggestionEventId`.
  - Pure helpers are in `play/moves/suggestion.ts`.
- **Dev stub.** It answers Gather Information +wits at low confidence.

### Live pass

This was 2026-09-14 with claude-opus-5 on the `session-2-open` fixture. Every run is in `ai/eval/live-suggestions-7.12.json`.

- **10 of 10 answered on the first attempt**, in 2.1–3.7 s each.
- **Matches:**
  - Beat 3's "Juno jacks into the docking port and pulls the station logs" gave Gather Information +wits at high confidence.
  - Beat 4's two actions gave Gather Information and Secure an Advantage.
  - Face Danger came back +iron for shouldering through a bulkhead and +shadow for slipping past drones.
  - A vow sworn on a blade gave Swear an Iron Vow; asking the oracle gave Ask the Oracle.
  - Closing a hatch and eating a ration bar each gave "no move fits", with a reason.
- **Outside the candidates:** punching a drone, which is combat, came back Face Danger +iron at medium confidence, a fair reading within them.
- **Pronouns.** One reason called Rook "them", but Rook's pronouns aren't recorded. The suggestion prompt lacked the narrator's D-131 rule. With the rule added, the four Rook actions twice more gave no pronoun in 8 of 8.
- **Adding to the action.** Reasons stayed on the rules. Two mild additions: a stat rationale Rook never stated ("applying expertise and focus" for securing the airlock), and "her iron blade" for "her blade". Neither goes further than justifying the roll option.

### Verification

`npm run typecheck`, `npm run lint`, `npm test` (904 tests) and the web build pass. The new tests cover:

- the candidate set and its rendering;
- the quote, option and no-fit checks;
- the stub answer passing the check;
- the command writing, replaying, re-asking, failing and refusing;
- an invocation naming its suggestion without a `causedBy`, and wrong, unknown or voided suggestions refused;
- the route, and the suggestion staying out of the log;
- the card, prefill and staleness helpers;
- the markup pin.

A browser pass on the stub, on `session-2-open`, covered:

- asking and seeing the card;
- opening "Why?";
- **Use this** opening Gather Information prefilled with the Guide marker;
- rolling, which wrote `move.invoked.suggestionEventId` pointing at the `move.suggested`;
- the suggestion staying out of the log;
- switching to Rook and picking Face Danger by hand with the typed words carried over.

### Open

- **Stale proposals, three commands.** Three commands check only that a proposal exists, is the right kind and isn't voided, not how old it is:
  - `createCharacter` (`proposalCommandId`);
  - `swearIncitingVow` (`proposalCommandId`);
  - `invokeMove` (`suggestionEventId`, and D-130's `proposalEventId`).

  A suggestion asked in one session can be named by a move in a later one, where D-84 puts it beyond void. Nothing mechanical reads these fields, so it is recorded here rather than guarded.
- **A suggestion lives only in the prompt's state.** After a reload or a change of acting character, the player asks again, which writes a second `move.suggested`.
- **The Guide justifies itself with details the player didn't state.** Seen three times with three different prompts: 7.15's aided scan, 4.6's crew hooks, and these reasons. Each time the player reviewed the output before it counted. Groups 8 and 9 will generate without that review.

## Implementation notes (task 7.13, trigger-mismatch note)

7.13 is done (D-37, D-121, D-136, A20). No golden-session beat exercises it, as D-121 recorded. What the golden session does constrain is Beat 7: the +edge roll carries no note, because D-136 judges the move's trigger and never the stat.

### Shape

- **Prompt and check** (`ai/context/suggestion.ts`, alongside 7.12's quote logic).
  - `buildTriggerCheckRequest` gives the Guide projected state, the actor, the move's name and `trigger.text`, and the typed action. It gives nothing about the stat.
  - `TRIGGER_CHECK_RULES` says most chosen moves fit, a generous reading counts as a fit, the stat is not the Guide's to judge, and D-131's pronoun rule applies.
  - The answer is `{ fits, triggerText | null, reason, confidence }`. `checkTriggerCheck` requires a mismatch to quote at least 12 characters verbatim from the move's own trigger text. Condition text is rejected.
- **Command** (`checkTrigger`, `db/suggestion-commands.ts`).
  - Its `causedBy` is the `move.invoked`.
  - It refuses a command that didn't invoke a move, a voided move, a move with no typed action, one filled from a 7.12 suggestion, and a move already checked. "Already checked" means an `ai.completed`, `ai.failed` or note of purpose `trigger_check` is caused by that invocation.
  - A fit writes only the accounting; a mismatch adds `move.trigger_noted`. It replays by command id.
- **Beat narration.** `resolveBeatScope` leaves `move.trigger_noted` out of the chain. The note is never among the facts narrated, and never becomes the passage's `causedBy`, so voiding a note can't void a passage. Voiding the move still takes the note along.
- **Route.** `POST /api/campaigns/:id/trigger-checks {commandId, moveCommandId}` returns 201 with `{fits: true}`, the note, or the failure. Refusals are 422.
- **Web.**
  - The move flow's result step carries `checkTrigger`. `MoveComposer` sets it when the player typed an action and the move didn't come from a suggestion.
  - `ResultCard` fires the check once, after the roll is already on screen, and shows `TriggerNote` if one comes back: "This move's trigger may not fit what you described", the reason, and "Why?" with the quoted trigger, the confidence and "the roll stands; void and redo it if you agree".
  - The log renders the note with its move and gives it no void or correction control of its own.
- **Dev stub.** It answers "fits", so a stubbed session plays without notes.
- **Leaving before it lands.** The log invalidation is on the `useCheckTrigger` hook, not on the `mutate` call, so it should still run when the player clicks **Done** before the note arrives (react-query v5 behaviour; not checked in the browser). The narration that follows **Done** invalidates the log again when it commits.
- **Checked once.** A failed check is not retried (D-136).

### Live pass

This was 2026-09-14 with claude-opus-5 on the `session-2-open` fixture. Each move was rolled with the stat shown, then checked. Every run is in `ai/eval/live-trigger-checks-7.13.json`.

- **8 of 8 as expected, all on the first attempt**, in 2.1–3.6 s each.
- **Fits, no note:**
  - Beat 7's "Rook forces the sealed bulkhead" as Face Danger **+edge**, the case D-136 turns on;
  - Beat 3's log pull as Gather Information;
  - Beat 4's airlock as Secure an Advantage;
  - Beat 4's sensor trace as Gather Information.
- **Mismatches, noted at high confidence, each quoting the trigger verbatim:**
  - reading logs in a quiet cockpit as Face Danger;
  - shouldering through a bulkhead as Gather Information;
  - swearing on a blade as Secure an Advantage;
  - kicking a drone as Swear an Iron Vow.
- **Wording.** No reason used a pronoun, and none added to the action. Each described what the action was instead, in the player's own terms.

### Verification

`npm run typecheck`, `npm run lint`, `npm test` (916 tests) and the web build pass. The new tests cover:

- the request carrying no stat;
- a fit needing no quote, and a mismatch quoting condition text, paraphrasing or quoting too little being refused;
- the stub's answer;
- the note's cause, and a void of the move taking the note;
- a fit writing only accounting, and replaying;
- the re-ask and the failure;
- each refusal;
- the note left out of beat scope;
- the route and the log;
- the log view model.

A browser pass ran against live Claude, because the stub never notes anything. Juno typed "reads the station logs in the quiet of the cockpit" and rolled Face Danger. The card showed the miss straight away, and the note arrived a few seconds later. The log showed the note under the move with no controls. **Done** narrated the beat, and the passage's `causedBy` was the chain's last `move.chained`, not the note written just before it.

## Implementation notes (task 8.1, the world pass)

8.1 is done (D-65, D-137–D-139, D-140, D-144). Before any code, the step-0 spike measured the approved order: plan, roll and interpret, then narrate. It missed A18 badly, so D-138 was amended: the world pass follows the passage.

### Step-0 spike

The spike ran 2026-09-14 on `session-2-open`, with real Beat 6 and Beat 7 moves and Opus 5 narrating. Every run is in `ai/eval/live-spike-8.json`. The first run's file was overwritten, so its timings are given here.

- **A plan that asked for nothing:** first text at 3.4–6.1 s with Sonnet 5 as planner, 5.1–5.7 s with Opus 5.
- **A plan that generated an NPC or derelict:** first text at 12.1–15.0 s. Interpreting alone took 6.9–8.0 s on either model.
- **Haiku 4.5 was no faster:** first text at 8.4–23.8 s.
- **Quality findings:**
  - Opus requested the derelict recipe for Varga Relay, already established, in 2 of 3 runs.
  - A routine scan got a clock in 3 of 6 Opus and Sonnet runs.
  - Without the move's outcome text, no run made Beat 6's NPC.

### Shape

- **Recipes** (`rules/src/recipes/`). `NPC_RECIPE` and `DERELICT_RECIPE` are in `ORACLE_RECIPES`. Each slot names its table, and a name slot is marked `name: true`. `OracleRecipe` gained a `label` for the prompt.
  - `rollRecipe` rolls each slot in order. A slot holds one or more results:
    - A **"Roll twice"** row gives exactly two results, and a nested "Roll twice" is rerolled once. This is D-68 applied to recipes.
    - A row that **embeds tables** ("[Action] + [Theme]", "[Descriptor] + [Focus]") is resolved by rolling each embedded table.
    - A row that only says what to roll is never itself a result.
  - The first live pass found this gap: a goal of "Roll twice", which the Guide interpreted as a result.
- **Prompt and checks** (`ai/context/world.ts`, pure).
  - `outcomeTexts` gives each roll's outcome text at its final tier, after any burn.
  - `buildWorldPlanRequest` sends state, beat facts, outcome text and the committed passage, plus the offered recipes.
  - `worldPlanSchema` answers `{ recipes: [{ recipe, reason }] }`, at most 2.
  - `buildWorldInterpretRequest` lists each result under a key (`E1.role`, or `E1.goal.1` and `E1.goal.2`).
  - `checkWorldInterpretation` requires:
    - one entity per instance;
    - each field slot answered exactly once, citing one of its own results;
    - a name citing only name rolls;
    - D-140: no player character named in the name or any field, using `namedCharacter`, now exported from `segments.ts`.
- **Command** (`db/world-commands.ts`). `prepareWorldPass` refuses before any stream opens:
  - an event that isn't a beat passage;
  - a voided passage;
  - a passage already followed by a pass that succeeded (`already_passed`).

  A failed pass can be retried. `runWorldPass` writes one command, `world.pass`, caused by the passage:
  - the plan's accounting;
  - every roll, as system-authored `oracle.rolled` with `recipeId` and `slot`, even when interpreting fails;
  - the interpretation's accounting;
  - `entity.established` (`establishedBy: 'ai'`, `recipeId`, every roll in `groundedIn`), or `ai.failed`.

  Beat passes offer only `recipe:npc`, per D-138 amendment (b).
- **Event.** `oracle.rolled` gained optional `recipeId` and `slot` (D-142). `rerollOf` and `question` come with 8.3 and 8.4.
- **Route.** `POST /api/campaigns/:id/world-passes {commandId, passageEventId}` streams NDJSON, closing with `committed` or `failed`. 8.2's follow-up passage will stream on the same request.
- **Web.** `NarrationTarget` gained `world`. `followUp` queues a beat's world pass right after its passage commits, ahead of any beat queued behind it. A world-pass failure pauses play with Retry, like narration. An `already_passed` refusal is silent. While a pass runs, the log shows "The Guide is considering whether the world holds anything new…".
- **Dev stub.** `world_plan` asks for nothing, so a stubbed session plays without generating.

### The SDK doesn't enforce enums

`betaZodOutputFormat` in `@anthropic-ai/sdk` 0.125 keeps only `type`, `description`, `title`, `properties`, `required`, supported `format`s, `items` and `minItems`, and moves everything else (`enum`, `const`, `maxItems`, `minLength`) into the description (`lib/transform-json-schema.js`). **No enum in any schema is enforced during decoding.** Zod validates afterwards and a violation is re-asked, so nothing invalid has been committed. But the notes for 7.14 ("constrained decoding enforces every cited key exists"), 7.12 and 4.6 describe an enforcement that doesn't happen. In the first 8.1 live pass, 2 of 6 plans answered something other than `recipe:npc` on both attempts, and play would have paused. The plan now names recipes by entity kind (`npc`), the word the model writes, and `recipeOf` maps it back. Whether to send enums to the API directly, around the SDK helper, is an open question for the user.

### Live pass

The pass ran 2026-09-14 on `session-2-open`, with claude-opus-5 narrating and planning and claude-sonnet-5 checking. Beat 6's scan and Beat 7's chain were each narrated, checked and followed by a real world pass. Each run was 3 × 2 beats, run twice after the enum fix; the second run is in `ai/eval/live-world-pass-8.1.json`.

- **Plans:** 12 of 12 valid. Before the fix, 2 of 6 failed.
- **Beat 6:** an NPC in 3 of 6 runs (Magnus Malek, Luna Velez, Echo Silva). **Beat 7:** none in 6 of 6.
- **Timing after the passage commits:** 1.97–3.36 s when the plan asks for nothing. With an NPC, 9.2–10.3 s, of which interpreting took 6.5–6.9 s.
- **Entities:**
  - Fields stayed with their rolls, and none named a player character.
  - Some described an encounter that hasn't happened yet ("filling the lit doorway of the aft corridor", "unlikely to take a hailing ship's word at face value"). One, in the first live pass, referred to "the Lantern Wake's hail" when no one had hailed. D-140 can't catch the crew acting together; the checker isn't run on world text (D-140).
- **Narration** (existing 7.15 path): 10.5–42.0 s to commit, the long ones after withdrawals.

### Verification

`npm run typecheck`, `npm run lint`, `npm test` (940 tests) and the web build pass. The new tests cover:

- recipes naming real tables, seeded reproducibility, "Roll twice" and nested rerolls, and embedded tables;
- the plan offering only what it's given, and outcome text at the burned tier;
- the interpretation check, including multi-result slots and D-140's name check with its whole-word exemption;
- the dev stub's plan;
- the command:
  - the request's contents;
  - accounting only on an empty plan;
  - rolls and an entity citing every roll;
  - replay, and `already_passed`;
  - a name-check re-ask ending in `ai.failed` with the rolls kept, then a retry;
  - refusals, and the pass voided with its move;
- the route;
- `followUp`.

A browser pass on the stub, on a freshly reset `session-2-open`, played Vesna's Gather Information to Done. The narration POST was followed by `/world-passes`. The world command, caused by the passage, held only the plan's accounting, and the log rendered normally.

The console showed a **pre-existing** React duplicate-key warning from `MoveComposer.tsx:228`. Datasworn ability ids are per-asset indexes (`'0'`, `'1'`, `'2'`), so two assets' ability `1` collide. It is left for 6.3's owner or 10.1.

**After the live pass, not yet run live.** Two changes followed review:

- **The plan answers a `review` first:** what the beat brings that isn't established, and whether it needs a recipe. Beat 6 produced its NPC in only 3 of 6 runs, and a plan that requested nothing said nothing, so the next live pass could not tell a judgement from a miss. 8.5 inherits this.
- **`INTERPRET_RULES` says a field is what the entity *is*,** never an encounter with the crew that hasn't happened. Entity fields reach every later prompt as established fact (`render-state.ts`), so an invented hail would become canon.

The design record's claims that enums are enforced while decoding, in D-127 (2), D-132 and D-135, are corrected inline.

## Implementation notes (task 8.2, chips, the follow-up passage and the scene frame)

8.2 is done (D-17, D-138 as amended, D-141). A passage now carries the oracle rolls it cites as chips. A world pass that establishes something narrates it in a follow-up passage. The open scene can be framed.

### Shape

- **Grounding.** `BeatFact` gained `grounds`, the oracle rolls behind a fact: a roll fact is grounded in itself, and an entity fact in the rolls it was built from. `groundedInOf` collects the grounds of every fact the segments cite. Beat narration, the follow-up passage and the scene frame all write it to `narration.written.groundedIn`, which was always `[]` before. Beat 7's Pay the Price roll is now in its passage's grounding.
- **Chips.** `buildNarrativeLog` resolves `groundedIn` to `NarrativeEntry.chips` (`OracleChip`: table, slot, roll, row text, voided). A roll outside the fetched events is left out. On the web:
  - chips sit under the passage, labelled by recipe slot or by table name;
  - a voided chip is struck through, with "(discarded)" for screen readers;
  - `withoutChippedRolls` hides a roll's own row once a loaded passage shows it as a chip, and a roll no passage cites keeps its row.
- **Follow-up passage** (`db/world-commands.ts`, `ai/context/world-narration.ts`).
  - When a world pass establishes an entity, the same request goes on to narrate it. That passage is its own command (`narration.world`), caused by the entity, with its command id derived from the request's (`derivedUuid`) so a replay finds it.
  - `narration.written` gained the role `world`. A world pass follows only a `beat`, so none follows a follow-up passage.
  - The stream sends a new `world` frame when the entity commits, and the client refetches, so the NPC card appears before its passage.
  - **Retry never rolls again.** If the world command succeeded but its passage failed, the next request (`mode: 'passage'`) writes only the passage.
- **World-only segments.** `SegmentContext.worldOnly` makes `checkSegmentTags` refuse any non-`world` segment, and the instructions say so, the crew acting together included (D-141's rubric amendment). The follow-up passage and the scene frame both use it, and both go through D-128's checker. The follow-up is routine length; the frame uses the dramatic range (D-141).
- **Scene frame** (`prepareSceneFrame`, `runSceneFrame`). It refuses when there is no session, no scene, or the scene is already framed. One command (`narration.scene_frame`), caused by the `scene.started`, writes:
  - a plan offering only the derelict recipe (D-139);
  - the rolls, with no interpret call, because a derelict amends no entity;
  - the checked, world-only passage (role `scene_frame`).

  `SceneState.framedBy` is projected from it. Route: `POST /api/campaigns/:id/scene-frames {commandId}`. The scene header shows **Frame the scene** while an open scene has no frame (D-141).
- **Plan review.** The plan's `review` is not stored in any event. It exists to shape the model's answer, and the live pass recorded it through a wrapper.
- **Dev stub.** It answers `scene_frame_plan` with nothing to roll, and `world_passage` and `scene_frame` with a world segment.

### Live pass

The pass ran 2026-09-14 on `session-2-open`, with claude-opus-5 narrating and planning and claude-sonnet-5 checking. It covered Beat 2's frame and Beat 6's scan, followed by its world pass. Results are in `ai/eval/live-8.2.json`, and `ai/eval/live-8.2-beat6.json` has the run with an NPC forced whenever the plan declined.

- **Scene frame:** 9 of 9 committed, with no withdrawals. Each rolled the derelict recipe and cited all three rolls. First text reached the player at **4.9–6.3 s**, of which planning took 2.9–3.9 s, so **A18 is missed in most runs**. The frames interpreted the rolls ("Limited power", "Blocked access", "Esoteric writing or symbols") against what is established. One reconciled "Cold and dark" with the fixture's lit windows, and one ended on "a language nobody aboard the Lantern Wake can read", which the checker passed.
- **Beat 6, before the prompt fix:** no NPC in 3 of 3. Every plan review said the scan revealed only a circuit and that "no person has entered the story yet". **The cause is structural.** The plan reads the scan passage, and the narrator may not introduce new people (`GUIDE_RULES`), so after D-138's reordering the passage the plan reads always stops short of a person. The plan prompt now says so: that silence is not evidence that no one is there, and the decision is the plan's. **After the fix:** an NPC in 2 of 3. The reviews read "a survivor or occupant is the natural discovery here" in two runs and "the discovery stands fine as infrastructure" in the third.
- **Follow-up passage** (5 runs: 3 forced, 2 real):
  - the NPC card committed 8.7–13.2 s after the world pass began;
  - the passage's first text followed about 2 s later;
  - all cited every roll, and none was withdrawn;
  - each narrated first contact over comms in the NPC's own voice ("I see you. Come down that corridor and I'll put you in it."), with no player character acting.

### Verification

`npm run typecheck`, `npm run lint`, `npm test` (951 tests) and the web build pass. The new tests cover:

- a beat passage grounded in the Pay the Price roll it cites;
- log chips, including a discarded one;
- the follow-up passage: its cause, grounding and prompt, the `world` frame arriving before text, a resume without re-rolling, and no world pass after a follow-up;
- the scene frame: rolls, dramatic length, grounding, `framedBy` and `already_framed`, and a non-world segment withdrawn and re-asked;
- the `no_scene` refusal on the route;
- chip view models and hidden rows;
- the header's frame offer.

A browser pass on the stub, on a freshly reset `session-2-open`, used **Frame the scene**. The passage streamed into the log under the scene, the button disappeared once the scene was framed, the token counter rose, and the console was clean. Chips can't appear on the stub, whose plans roll nothing; the unit tests and the live pass cover them.

### Open

- **A18 on the scene frame, resolved: the user chose Sonnet 5.** The frame now plans on `createPlannerFromEnv` (`claude-sonnet-5`, overridable by `ASTROLABE_PLAN_MODEL`). `buildApp` takes an optional `planner`, which defaults to `ai`. Over 5 live runs, planning took 2.2–4.2 s and first text arrived at 3.9–6.5 s, a median of 4.3 s. Only the first, cold run missed A18. One run rolled 4 results: the inner first look landed on an embedded "[Descriptor] + [Focus]" row. D-141 is amended.
- **The dev servers.** Stopping a background `tsx watch` or `vite` shell left its node child holding the port. Stop the process on 3000 or 5173 before restarting.

## Implementation notes (task 8.3, visible rerolls)

8.3 is done (D-18, D-29, D-69, D-70, D-142). It covers Beat 6's reroll: a rolled result that contradicts what is established is rerolled visibly, and the discarded chip stays, struck through with its reason.

### Shape

- **Where rerolls happen.** Only in the world pass's interpret call, the call that turns an npc recipe's rolls into an entity. The scene frame has no review call, and adding one would cost the A18 time D-141's amendment just recovered. Beat 6 is the only golden-session beat with a reroll.
- **The answer.** `worldInterpretSchema` answers `rerolls: [{ roll, reason }]` before `entities`. `INTERPRET_RULES` says only a result that *contradicts* something established may be rerolled; a surprising or unwelcome result is kept. An answer that asks for rerolls leaves its entities unread.
- **The check** (`checkWorldInterpretation`, with the campaign's `rerollCap`). Each named result must be a current one, named once, and not yet final. Its reason must not name a player character (D-140). A result that has used its cap is marked `(final)` in the prompt, and asking to reroll it is refused and re-asked.
- **The loop** (`commitWorldPass`, `applyRerolls`). For each named result, the server writes:
  - `event.voided { kind: 'reroll', reason, cascaded: [that roll] }`, authored by the AI and appended directly, never through `voidEvent` (D-142);
  - the result's table rolled again with `rules`' new `rerollResult` (a "Roll twice" rerolled once per D-68, an embedded row expanded);
  - new `oracle.rolled` results carrying `rerollOf` and one more reroll behind them.

  It then asks again. The prompt lists what was discarded, with the reasons, and the new results under keys counted from the original (`E1.first_lookr1`, then `r2`). D-69's cap ends the loop; a guard of 12 rounds records `ai.failed` if it ever doesn't. The entity is grounded in the surviving results only. Everything stays in the one world command.
- **Chips.** `buildNarrativeLog` follows each grounded roll's `rerollOf` chain and puts the discarded predecessors before the survivor. Each is struck, with `discardedBecause` taken from the reroll's void mark, and a predecessor shared by two replacements appears once. The web shows "discarded: *reason*" on the struck chip, with the reason itself not struck. `withoutChippedRolls` also hides the reroll's own row once its roll shows as a chip.
- **Event.** `oracle.rolled` gains the optional `rerollOf`, as D-142 said.

### Scene frame on Sonnet 5

By the user's choice, the frame's plan call runs on `createPlannerFromEnv` (D-141, amended; see the 8.2 notes).

### Live pass

The pass ran 2026-09-14 with claude-opus-5 interpreting and narrating and claude-sonnet-5 checking; runs are in `ai/eval/live-8.3.json`. The plan was forced to request the npc, and the scan's passage was scripted, so each run could plant or omit a contradiction. The passage establishes the sleeper as "a child, small and light-framed", and loaded dice set the npc's first look.

- **Contradiction** (first look "Large"): rerolled in 3 of 3 runs, one reroll each, each with a reason naming what it contradicts ("The passage establishes the sleeper as a child, small and light-framed; 'Large' contradicts that."). The replacements were "Mutated", "Scruffy" and "Plain", and each entity was interpreted from its replacement.
- **Control** (first look "Scruffy"): no rerolls in 3 of 3.
- **Time:** the world pass took 17.4–21.2 s with a reroll (two interpret calls) and 13.9–15.2 s without, including the follow-up passage.
- One control passage said the boy "is bigger than the trace suggested". That is the narrator drifting from established fact, which is outside the checker's scope by design (D-128).

### Verification

`npm run typecheck`, `npm run lint`, `npm test` (960 tests) and the web build pass. The new tests cover:

- `rerollResult`;
- the reroll check: current, repeated, final at the cap, and a reason naming a player character;
- the prompt's `(final)` marks and discarded results;
- the command: a reroll's void, `rerollOf`, and grounding in the survivor, then the cap refusing a third reroll and re-asking;
- chips carrying a discarded predecessor, with its reason, once;
- the web hiding a chipped reroll's row while carrying the reason on the chip.

**Found while testing:** a Node heredoc in the shell had stripped the backslashes from a regex (`/r\d+(\.\d+)?$/` became `/rd+(.d+)?$/`), and the cap test caught it. Later edits went through files, not heredocs.

**Not verified in the browser:** the stub never rerolls, so the struck chip with its reason is covered by unit tests and the live pass only.

## Implementation notes (task 8.4, AI-set odds)

8.4 is done, minimal as D-138 records (D-28, D-140, D-142). No golden-session beat exercises it.

### Shape

- **Rules** (`rules/src/recipes/yes-no.ts`). `ORACLE_ODDS` has five odds, each mapped to the Ask the Oracle table its spec already names (`ODDS_ORACLES`). `ORACLE_MATCH_CLAUSE` is the move's own "On a match, envision an extreme result or twist.", pinned verbatim by a test. `isOracleMatch` treats doubles as a match, and reads 100 as 00.
- **Plan.** `worldPlanSchema` gained `questions: [{ question, odds }]`, at most 2, shared by the beat pass and the scene frame. `QUESTION_RULES` sits in both plans' rules:
  - ask only what is uncertain, matters, and isn't simply the Guide's to decide;
  - most plans ask nothing;
  - never ask about a player character;
  - never request a recipe that depends on the answer.

  `checkWorldPlan` applies D-140's name check to question text, and a failure is re-asked.
- **Rolls.** `questionEvents` rolls each question on its odds table as a system-authored `oracle.rolled` with the new optional `question`. Question rolls come before recipe rolls.
- **Where answers go.** `describeAnswer` gives the odds, the question and the answer, plus the match clause on a match.
  - In a beat pass, the answers reach the interpret call (`<oracle_answers>`).
  - They are facts for the follow-up passage, which now also runs when a pass answered a question but established nothing. `isEstablished` covers both, as does resuming only the passage.
  - In a scene frame they join its facts.

  Each cited answer is its own chip, labelled by its question.

### Live pass

The pass ran 2026-09-14 on `session-2-open`, with Opus 5 narrating and planning beats, Sonnet 5 planning frames, and Sonnet 5 checking. There were 3 runs each of the scene frame, Beat 6's scan and Beat 7's chain, all planned for real. Runs are in `ai/eval/live-8.4.json`.

- **How often:** questions in 2 of 9 plans, both on Beat 6. None on any scene frame or on Beat 7.
- **What they asked** (both about the world, with plausible odds):
  - "Is someone still alive aboard the relay, keeping the core warm?" at likely → Yes (20);
  - "Is the repeated call being actively sent by a living person aboard the station?" at unlikely → No (70).
- **Passages** followed the answers. The No became "No hand has touched it… The beacon is only a machine". The Yes became a voice on the channel.
- **Finding: a Yes about a person can't create the person.** `QUESTION_RULES` forbids a recipe that depends on an answer. So in run 1, the "someone is alive" Yes was narrated as an unnamed voice, with no tracked NPC. The next beat's world pass may establish one. Beat 6 made an NPC outright in 1 of 3 runs here. **Resolved: the user chose "recipe on a Yes"** (D-138, amended again). A question may name a recipe in `onYes`, which `yesRecipes` adds to the plan only when the answer is Yes, with the question as its reason. The scene frame applies it too. **Live** (4 Beat 6 runs, `ai/eval/live-onyes.json`): every plan asked whether someone was alive with `onYes: npc`. Both Yes answers established an NPC (Jihun Sutton, Ragnar Silva) with one interpret call, and both No answers rolled nothing more. Beat 6's survivor now comes from the oracle rather than the plan's judgement.

### Verification

`npm run typecheck`, `npm run lint`, `npm test` and the web build pass. The new tests cover:

- the odds tables, the verbatim match clause, and match detection;
- the plan schema's questions and odds;
- the name check on questions;
- `describeAnswer`, with and without a match;
- a question-only pass rolled on its odds table and narrated, grounded in the roll;
- the answers reaching the interpret call;
- a question naming a player character, re-asked;
- a chip labelled by its question.

## Implementation notes (task 8.5, NPC entities)

8.5 is done, for NPCs only (D-65, D-144). Most of it landed earlier:
- 8.1 writes `entity.established` from the npc recipe, with `establishedBy: 'ai'`, its `recipeId` and every roll in `groundedIn`;
- 5.6's card already badges it AI-established (A10);
- 8.2's follow-up passage narrates it;
- `renderState` carries its fields into every later prompt.

This task makes the entity readable and its grounding visible.

### Shape

- **Grounding read** (`GET /api/campaigns/:id/entities/:entityId/grounding`, returning `EntityGroundingResponse`). It is 404 for an entity never established. The chip resolution from 8.2 and 8.3 moved into an exported `oracleChips(events)` in `projection/narrative-log.ts`, shared by the log and this route, so an entity's chips carry discarded predecessors and reasons exactly as a passage's do. It is a read of its own, not a field of `CampaignState`, which stays bounded.
- **Web.**
  - `useEntityGrounding` is keyed under the campaign's state, so any command's invalidation refreshes it.
  - The drawer's "Grounded in" section, a count until now, shows the chips.
  - Fields read as labels (`fieldLabel`: `first_look` → "First look").
  - The chip list moved out of `NarrativeLog.tsx` into `play/oracle/OracleChips.tsx`, with `toChipView` exported from `log/entries.ts`, so the log and the drawer render chips one way.

### Verification

`npm run typecheck`, `npm run lint`, `npm test` and the web build pass. The new tests cover the grounding route (chips including a discarded roll with its reason, and a 404 for an unknown entity) and the field labels.

A browser pass on the stub reset the dev database and appended one AI-established NPC to `session-2-open`: six rolls, one discarded by a reroll. The dev database was reset again afterwards.
- The card showed "AI-established" in the Present rail.
- The drawer listed the four fields with labels.
- It showed seven chips, the discarded "first look Large (53)" struck with "discarded: The sleeper is a child." ahead of its "Scruffy" replacement.
- The console was clean.

With no passage citing that NPC, its rolls also showed as log rows, the fallback 8.2 chose so rolled dice stay visible.

## Implementation notes (task 8.6, clocks)

8.6 is done (A14, D-138, D-140, D-145). The user settled the open questions before building: clocks only after pressure, and shown rather than narrated.

### Shape

- **The gate** (`prepareWorldPass`). A beat has pressure when its facts include a miss or a match, or its scope includes a Pay the Price invocation (`WorldBeat.pressure`). Only then does `commitWorldPass` offer clocks: `openClocks(state)` lists the unfilled clocks under keys `C1`, `C2`, …, and the plan's schema gains `clocks: { create, tick }`. On any other beat the fields aren't in the schema, so clock values the model sends are dropped when the answer is parsed. The prompt says nothing about clocks, and `checkWorldPlan` refuses clocks without an offer. A scene frame never offers clocks.
- **The limits** (`checkWorldPlan`, via `checkClocks`):
  - at most one new clock, of 4, 6, 8 or 10 segments, starting with 0 to segments−1 filled;
  - at most two ticks, each on an open clock, once, by 1 up to the segments left;
  - D-140's name check on titles and reasons.
- **The rules sent** (`clockSection`, in the user turn so the cached system blocks stay stable): a clock tracks a specific threat this beat set building that nothing established already tracks, and most pressure beats still need none. The section lists the open clocks with how full they are.
- **Events** (`clockEvents`, in the world command, authored by the AI). A new clock is `track.created` (kind `clock`, cause `ai_judgement` with its reason). Its starting segments follow as `track.advanced` with the same reason, so the rail's hover shows who filled them and why (Beat 8). A tick is `track.advanced` with its own reason.
- **Not narrated.** `isEstablished` leaves clocks out, so a pass that only sets clocks writes no follow-up passage, and an NPC's passage doesn't mention them. A full clock does nothing mechanical (D-145 (4)).
- **Dev stub.** Its world plan now includes `clocks: { create: [], tick: [] }`. The stub browser pass found that the missing field failed a pressure beat's schema and paused play; the field is dropped on other beats.

### Live pass

The pass ran 2026-09-14 with Opus 5 and Sonnet 5 on `session-2-open`: 3 runs each of Beat 7's chain and Beat 6's scan, narrated, then a real world pass. Runs are in `ai/eval/live-8.6-8.7.json`.

- **Beat 7** (pressure) created a clock in 1 of 3 runs: "Something in the dark closes in" (6 segments, 1 filled), with the reason "The forced bulkhead announced the crew's presence, and something metal stirred deeper in the station."
- **Beat 6** (a strong hit, no pressure): no clocks in 3 of 3. The gate held; in the spike, a routine scan got a clock in 3 of 6 runs.
- Beat 8's golden "Station power failing" did not appear. A clock stays the Guide's judgement within the gate.

## Implementation notes (task 8.7, weak-hit complications)

8.7 is done (A5, D-15, D-143 as amended). The player writes the complication, or asks for options, picks one and may edit it. Options can be asked for again, and the beat can't be narrated until a complication is set.

### Shape

- **Rules.** `OutcomeSpec` gained `complication: { clause }`. Gather Information's weak hit declares it ("but also complicates your quest"), and the traceability test checks the clause verbatim. `complicationFor(moveId, tier)` is what the server and the client both read, at the tier after any burn.
- **Events** (`shared/src/events/complication.ts`). Both are caused by the `move.invoked` and are narrative and voidable.
  - `complication.offered { options: [{ text, groundedIn }] }` is written by the AI.
  - `complication.set { text, source, offeredEventId?, optionIndex? }` is written by the player.
- **Offering** (`offerComplications`, `POST /campaigns/:id/complication-options`). It refuses a move with no roll, one voided, one whose outcome calls for no complication, and one already set. For each of three options it rolls `core/action` and `core/theme`. The AI answers three options, each citing its own pair (`checkComplicationOptions`: exactly three, own pair only, distinct, D-140's name check), with one re-ask, and no D-128 checker (D-134). One command writes the rolls, the accounting, and the offer or `ai.failed`. A failure is shown in the prompt and never pauses play: the player can still write their own.
- **Setting** (`setComplication`, `POST /campaigns/:id/complications`). A pick names its offer and option. `source` is `offered` only when the words match the option exactly; an edited pick is `written`, still naming the offer. A second complication on the same move is refused.
- **Narration.**
  - `prepareBeatNarration` refuses a beat still owed a complication (`missingComplication`, reason `complication_required`).
  - `resolveBeatScope` leaves out the commands that wrote an offer, so unused options and their rolls are never facts.
  - `describeBeat` adds the set complication as a fact, grounded in the rolls of the option it started from. The passage's `groundedIn` then gives Beat 3 its chips (A2).
- **Web.** The result card shows `ComplicationPrompt` whenever `complicationFor` says the current tier needs one, including after a burn changes the tier. It offers a box to write in, **Give me options** / **Other options**, each option's text with its chips and **Use this** (marked "(picked)" in words), and **Set complication**. Done is disabled, with "Set the complication to finish the move.", until one is set. The log shows each offer with its options and their chips, whose rolls then don't also appear as rows, and the set complication with where its words came from ("picked from the Guide's options", "edited from the Guide's option", "written by the player").
- **Dev fixture.** `session-1`'s Gather Information weak hit (`juno-archive`) now sets a player-written complication before it is narrated, since narration refuses without one.

### Live pass

Same runs as 8.6, 3 of Beat 3's weak hit: options requested, the first option picked, and the beat narrated.

- **Options:** 3 of 3 answered on the first attempt, in 8.2–8.7 s, each set three distinct directions built on its pair ("Withdraw + Survival", "Raid + Humanity", "Surrender + Cure", …).
- **Passages:** all three narrated the picked complication, each with 2 chips.
- **Borderline:** some options describe what the complication does to the crew's gear ("cooks half the diagnostic rig"), and one passage closes on "the weight of it sits in Juno's hands", which the checker passed.

### Verification

`npm run typecheck`, `npm run lint`, `npm test` and the web build pass. The new tests cover:

- **Clocks:** the schema offering clock fields only with an offer; refusal outside a pressure beat; sizes, starting fill, one creation, open-clock ticks with room, and repeats; the name check; the open-clock list; a miss creating a filled clock that is logged but not narrated; ticking a clock later; a strong hit getting none even when the plan sends one; the stub satisfying a pressure beat's schema.
- **Complications:** the traced clause; pair rolls and the offer's cause; narration refused until set, with the set complication then a fact grounded in its option and no offer rolls among the facts; an edited pick recorded as written; asking again; one written from scratch; a second complication refused; a naming option re-asked and then failed with its rolls kept; a strong hit and a burned weak hit owing none; `missingComplication`; the dev stub; the web draft helpers; offered options' chips hiding their rows.

**Browser pass on the stub.** Vesna's Gather Information missed, and the burn offer lifted it to a weak hit.
- The complication prompt appeared, with Done disabled.
- **Give me options** showed three options with chips. **Use this** on the second, plus an edit, then **Set complication** enabled Done.
- The passage committed, and the log read "Complication (edited from the Guide's option): …".
- The same pass found the stub's missing clock fields: the earlier miss beat had paused play. Retry recovered it once fixed.

**Existing issues seen, not in scope:**
- The duplicate-key warning from 6.3's ability list (see 8.1's notes).
- After a burn lifts a miss to a weak hit, the result card still offers Pay the Price from the original miss.

## Implementation notes (task 9.1, Begin a Session and the recap)

9.1 is done (A1, D-12, D-72, D-146, D-147). Before building, the user settled D-146 to D-150 for the whole group. Beginning a session is a command, not a move. The scene carries forward, and the recap streams after the session has begun.

### Shape

- **Command** (`db/session-commands.ts`, `beginSession`). One `session.begin` command writes `session.began` and `scene.started`, both with the new session in their envelope, and commits at once.
  - A campaign's first session needs `scene: { title, locationId? }`. Any later session refuses it (`scene_carried`) and copies the last scene's title and location into a new, unframed scene, so **Frame the scene** applies (D-141).
  - Refusals: `session_open`, `scene_required`, `unknown_location`, `no_scene`. A replay answers the same session.
  - Route: `POST /api/campaigns/:id/sessions`, answering `{ sessionId, sceneId, number, recap }`. `recap` says whether there is an earlier session to retell.
- **No play outside a session** (D-146). `invokeMove` refuses with `MoveRejectedError`. `proposeAmount` and `suggestMove` refuse with `no_session`, through `requireOpenSession` in `narration-commands.ts`. The scene frame now also refuses an ended session. `resolvePayThePriceMethod`, choices, burns, complications and trigger checks aren't guarded: each follows a move already made in the session.
- **The log is per session.** The log route passes `latestSessionId` (the last `session.began`, open or ended) to `readNarrativeEvents`, as §10 always specified. Before any session it reads the whole campaign.
- **Recap facts** (`ai/context/recap.ts`, pure).
  - `previousSession` finds the latest ended session other than the current one.
  - `describeRecap` keys, in order: the summary; each open thread; then that session's significant, non-voided events.
    - A scene is a `scene` fact.
    - A move is a `move` fact, plus a `declared_action` fact when an action was declared.
    - Also: a set complication, an entity other than a location, a track created or advanced, and each passage as it now reads (`livePassages`, so a corrected passage reads corrected).
  - Two fact kinds are new: `summary` and `passage`. Rolls aren't significant, so what came of them reaches the recap through the summary and the passages.
- **Segments.** The recap uses beat segmentation, not world-only. `checkSegmentTags` already requires a `character_does` segment to cite that character's `declared_action`, and a `declared_action` fact now comes only from the retold session. So the rule D-147 set needed no new check. D-128's checker runs as on a beat.
- **Command** (`prepareRecap`, `runRecap`). One `narration.recap` command, caused by `session.began`, writes the accounting, any withdrawals and `narration.written { role: 'recap' }`.
  - Refusals: `no_session`, `already_recapped`, `no_recap` (a first session).
  - Beat narration's stream-check-commit moved into `commitSegmentedPassage`, which both use.
  - Length: routine (D-115's recap weight).
  - Route: `POST /api/campaigns/:id/recaps`, streamed.
- **Web.**
  - `play/session/session.ts`'s `toSessionView` gives `open`, `first` (with the sector's locations) or `next` (the number, and the scene carried forward).
  - While no session is open, `BeginSession` replaces the composer, ahead of the pause banner, because beginning needs no Guide.
  - A `recap` response enqueues the new `recap` target, which streams into the log like a beat.
- **Fixtures.**
  - `session-1` begins through `beginSession`. When the crew reaches the relay (after `vesna-drift`), it appends a second scene, "The derelict relay station". That is D-146's fixture exception to D-71. Its end is still appended directly, until 9.4.
  - `session-2-open` opens session 2 through `beginSession`, carrying the relay scene forward, with no recap. It is kept rather than retired, because the world, complication and suggestion tests seed it for an open session. Browser play of Beat 1 starts from `session-1`.
- **Dev stub.** It answers `recap` with a world segment.

### Live pass

The pass ran 2026-09-14 with claude-opus-5 narrating and claude-sonnet-5 checking: `session-1`, Begin Session, then the recap, twice at each latitude. Runs are in `ai/eval/live-recap-9.1.json`.

- **6 of 6 committed, with no withdrawals.**
- **First text at 2.0–2.5 s** (A18). Commit took 10.6–25.1 s, most of it the check.
- **Length:** 112–124 words. Two runs went slightly over the 120 asked for.
- **Content.** Every recap retold the four declared actions and ended on the open threads or the lit windows. None invented a thought or a feeling. Minimal stayed plain, and no latitude quoted speech.
- **Borderline, passed by the checker.** Some `character_does` segments carry the outcome of the declared action as well as the action:
  - "Vesna ran the clipped signal against the Lantern Wake's star charts, and the drift pointed not to the colony ship but to Varga Relay";
  - "Vesna threaded the Lantern Wake through the ice of Kessel Drift, and the ship came out clean".

  The outcomes are committed facts, so nothing is invented, but they are labelled as the character's.

### Verification

`npm run typecheck`, `npm run lint`, `npm test` (1008 tests, 1 skipped) and the web build pass. The new tests cover:

- beginning a first session: the scene is required, the envelope, replay, and `session_open`;
- carrying the relay scene forward into a new, unframed scene, and refusing a scene of its own;
- a move and a recap refused with no open session;
- the recap's facts from `session-1`;
- the committed recap: its cause, session, role and text, replay and `already_recapped`;
- a `character_does` citing the summary, withdrawn and re-asked;
- `no_recap` in a first session;
- over HTTP: the log showing only the latest session, the begin and recap routes, and their refusals;
- `toSessionView`.

`move-commands.test.ts` and `app.test.ts` now begin a session before rolling. The void test in `app.test.ts` used to rely on having no session; it now applies the void and checks `already_voided`.

**Browser pass on the stub,** on a freshly reset `session-1`:
- the composer read "Session 2 opens on The derelict relay station, at Varga Relay";
- **Begin session** switched the top bar to Session 2, and the log to session 2 alone;
- the recap streamed in and committed;
- the header offered **Frame the scene**, and the composer opened;
- a reload showed the same;
- the console was clean.

## Implementation notes (task 9.3, "What now?")

9.3 is done (A6, D-10, D-148).

### Shape

- **Anchors** (`ai/context/what-now.ts`, pure). "Anchored in current state" is made checkable. `whatNowAnchors` lists the state a suggestion may build on, keyed `A1`, `A2`, …:
  - the scene;
  - each crew member's meters and impacts;
  - each vow and expedition, and each clock not yet full;
  - each NPC and faction;
  - the last session's open threads;
  - the open session's set complications and its last four passages.

  Every suggestion must cite at least one anchor, and `actions.suggested` records the anchors' text rather than their keys, so the record stands on its own.
- **Answer.** Exactly three suggestions, each with `character` (a callsign), `actionText`, `moveId` (any Starforged move, or null), `reason` and `anchors`.
  - The prompt lists every move with its trigger, because D-148 allows Reference moves.
  - It carries D-129's player-interior rule, and says a suggested action is the player's to declare.
- **Check** (`checkWhatNow`). Every character is in the crew and every move exists. Neither is left to zod alone, because the SDK doesn't enforce enums (8.1's notes). Each suggestion cites a real anchor, and no two actions repeat. One re-ask, then `ai.failed`.
- **Event.** `actions.suggested { suggestions }` is not narrative, changes no state, and is voidable. It references each suggestion's character. The event catalogue has 36 types.
- **Command** (`suggestActions`, `POST /api/campaigns/:id/action-suggestions`). One `actions.suggest` command writes the accounting and the suggestions, or `ai.failed`, in the open session. It refuses `no_session` and `no_crew`. A failure returns 201 with `ok: false` and doesn't pause play. There is no D-128 checker (D-134's reasoning).
- **Web** (`moves/WhatNow.tsx`, `moves/what-now.ts`).
  - **What now?** sits above the relevant-moves panel on the idle composer, which stays usable throughout. It shows three cards: the action, who and which move, the reason, **Why?** (the anchors) and **Use this**.
  - **Use this** sets the acting character. For a move the composer can play, it opens the composer with the action text and never rolls. `isComposerPlayable` applies the same test as `invokeMove`.
  - For any other move (Undertake an Expedition at Reference; Reach a Milestone, which has no outcome automation), it puts the action text in the prompt and opens that move in the moves drawer. `DrawerState.moves` gained an optional `moveId`.
  - The cards stay until dismissed or asked again, so they can be combined (Beat 4).
- **Dev stub.** It answers `what_now` with three suggestions for the first callsign.

### Live pass

The pass ran 2026-09-14 with claude-opus-5 on `session-2-open`, after Beat 3's shape: Juno's Gather Information weak hit, its complication, and a scripted passage. There were 3 runs, recorded in `ai/eval/live-what-now-9.3.json`.

- **3 of 3 valid on the first attempt,** in 6.4–7.6 s.
- **Anchoring.** Every run gave one suggestion each to Juno, Vesna and Rook, and every one cited real anchors: the humming circuit, the lit windows, the scrubbed coordinates and the vow. None invented a person or a place.
- **Close to Beat 4's script:**
  - Vesna "sweeps the relay's transmitter array with the Sensor Array" (Gather Information);
  - Rook "moves ahead into the dark corridor… weapon up" (Secure an Advantage in run 1, Face Danger in runs 2 and 3);
  - Juno traces the live circuit.
- **What differed.** No run named Undertake an Expedition or a crew action, and no action gave anyone a thought or feeling. Two reasons lean on a character's traits ("Rook is armored for meeting it"), which the Armored asset supports.

### Verification

`npm run typecheck`, `npm run lint`, `npm test` (1016 tests, 1 skipped) and the web build pass. The new tests cover:

- the anchors from `session-2-open`;
- three suggestions recorded with their characters, a Reference move, anchors recorded once as text, the open session, and replay;
- a re-ask for an answer that cites no anchor and repeats itself, then the failure;
- the `no_session` refusal;
- the event's sample, its meta and its projection probe;
- which moves the composer can play, and the suggestion card's view.

**Browser pass on the stub** (`session-2-open`, freshly reset):
1. **What now?** showed three cards, the third reading "Undertake an Expedition (rules reference)".
2. **Use this** on that card opened the Undertake an Expedition drawer, set Vesna acting, and left "Vesna pushes on toward the goal." in the prompt.
3. **Use this** on the Gather Information card opened the composer on that move with its action text.

The console showed only the duplicate-key warning from 6.3's ability list, recorded in 8.1's notes.

## Implementation notes (task 9.4, End a Session)

9.4 is done (A17, D-149). The Guide proposes a summary and open threads; the player reviews them, may edit either, and commits `session.ended`.

### Shape

- **Proposal** (`ai/context/summary.ts`, `proposeSessionSummary`).
  - The facts are the recap's read (`describeRecap`) over the session that is ending: its significant, non-voided events. The next recap is then built from a summary made from the same kind of record.
  - The answer is `{ summary, openThreads }`: 80–150 words, and 2–5 threads, each about the world, an NPC, a clock or a vow.
  - `checkSessionSummary` checks what the SDK doesn't enforce (8.1's notes): the thread count, no repeated threads, and D-140's name check on every thread.
  - The summary goes through D-128's checker. `generateChecked` gained optional `role` and `check` arguments, so the harm proposal and the summary share it. The checker is told the text is a session summary, with the session's facts under `<session>`.
  - `narration.withdrawn` gained the role `summary`.
  - One `session.propose_summary` command writes the accounting, any withdrawals, and `session.summary_proposed` or `ai.failed`. It refuses `no_session`. The session stays open whatever the outcome.
  - Route: `POST /api/campaigns/:id/session-summaries`.
- **Commit** (`endSession`, `POST /api/campaigns/:id/session-ends`).
  - It needs a live proposal from the open session (`unknown_proposal`) and a summary (`no_summary`). Blank threads are dropped.
  - `session.ended` gained `proposalEventId`, and is caused by the proposal.
  - It is authored by the AI when the words match the proposal exactly, and by the player otherwise.
- **Events.** `session.summary_proposed` is not narrative, changes no state, and is voidable. It was registered in 9.3's commit alongside `actions.suggested`.
- **Web** (`session/EndSession.tsx`, `session/end-session.ts`).
  - **End session** in the composer's acting row opens the panel in place of the composer and asks for the proposal at once.
  - The panel shows the summary, marked Guide, in an editable box; each thread as an input with Remove; **Add a thread**; and "Reach a Milestone is available for "…" if you judge one was earned" for each open vow.
  - Once anything is edited it says "Edited: the record will be yours." Then comes **End session**.
  - A failed proposal shows "Guide unavailable — the session stays open", with Retry. **Cancel** returns to play. That is a deviation from D-149's wording ("pauses under D-116"). The failure blocks only ending the session, which is the one step that waits on it, and a player who wants to go on playing isn't locked out.
  - After the commit, the panel closes and Begin Session takes over (D-146).
- **Fixture.** `session-1` ends through `proposeSessionSummary` with a scripted stub and `endSession`, unedited, so its record is the Guide's as before. It now has 10 `ai.completed` events instead of 8.
- **Dev stub.** It answers `session_summary`.

### Live pass

The pass ran 2026-09-14 with claude-opus-5 writing and claude-sonnet-5 checking, on `session-2-open` after scripted Beats 3, 6 and 7:
- Juno's logs and the live circuit;
- Vesna's heat signature, with an NPC, Sura Vance;
- Rook's jammed bulkhead and the flickering lights.

There were 3 runs, recorded in `ai/eval/live-summary-9.4.json`.

- **3 of 3 valid, with no withdrawals,** in 8.3–8.8 s. Summaries ran 125–130 words.
- **Threads, 5 per run.** Every run covered Beat 10's three: the survivor's intent ("What Sura Vance wants from strangers at her door"), the failing power, and where the recorder is. The other two were the jammed bulkhead and why the logs break off. No thread named a player character.
- **Summaries.** Each retold the three declared actions as declared, and gave no one a feeling. Two stated what the facts only implied: "Someone had been keeping the relay alive: Sura Vance". The script established the heat signature and Sura Vance separately. The player can correct that in review, which is why D-149 has one.

### Verification

`npm run typecheck`, `npm run lint`, `npm test` (1023 tests, 1 skipped) and the web build pass. The new tests cover:

- a proposal from the session's facts, checked as a summary, with replay and the session still open;
- an unedited commit authored by the AI, caused by the proposal, projected into `sessionSummaries`, with the next proposal refused;
- an edited commit authored by the player, and an unknown proposal refused;
- threads naming Rook, re-asked and then failed with the session still open;
- a summary giving Rook a feeling, withdrawn with role `summary` and re-asked;
- the draft helpers and the milestone reminders.

**Browser pass on the stub** (`session-2-open`):
1. **End session** opened the panel with the stub's summary, its two threads, and the Reach a Milestone reminder for the vow.
2. Editing the first thread showed the edited note.
3. **End session** ended session 2. The log showed "Session ended: …", and the composer offered "Session 3 opens on The derelict relay station, at Varga Relay".
4. The database recorded `session.ended` as player-authored, with the edited thread.
5. **Begin session** opened session 3 with its recap, and the composer returned to play.

The console was clean.

A scripted click that awaited inside the page froze the tab once. It didn't reproduce with real clicks, and no request had reached the server.

## Implementation notes (task 9.5, resuming a campaign)

9.5 is done (D-150), with the three cases D-150 named and nothing more.

### Shape

- **An ended session** opens the play screen on Begin Session. That is 9.1's `toSessionView` (D-146), and needs nothing new.
- **An open session** resumes in place. The projection, the per-session log (9.1), the header, the rails and the token counter already come from committed events.
- **A chain owed a passage** (`owedPassages` in `ai/context/beat-scope.ts`, pure). The narration queue lives in the browser, so a reload between a move and its passage used to strand the move.
  - A chain is owed when it has a root move in the open session (a `move.invoked` with no `causedBy`) that `resolveBeatScope` still resolves: not voided, and with no live passage.
  - `owedComplication`, which `missingComplication` now wraps, adds the move and clause when a complication is still owed (D-143).
  - The state route returns `owedPassages` beside `state`. It is computed from the events the route already reads, and kept out of `CampaignState`, which is projection-only.
- **Web** (`log/OwedPassages.tsx`, at the foot of the log).
  - Each owed chain reads "Not yet narrated: Rook, Face Danger — "…"".
  - Its **Narrate** button queues the chain as Done would. A chain still owed a complication shows 8.7's `ComplicationPrompt` first, and Narrate appears once the refetch drops the complication.
  - The offer shows only while no move flow is open and nothing is being narrated or paused, so a chain the player is still resolving, or one already queued, is never offered.

### Limits

- **A half-finished flow isn't restored** (D-150). A miss whose Pay the Price was never chosen is narrated as the miss alone, and a pending choice as the roll without it. The player can void and redo instead.
- **A world pass that didn't follow its passage** before a reload isn't offered again. D-150 doesn't name that case.
- **Owed chains can flash briefly.** Between a committed passage and its world pass, the offer can appear for as long as the state refetch takes. Narrate in that window is refused as `already_narrated`, silently.

### Verification

`npm run typecheck`, `npm run lint`, `npm test` (1024 tests, 1 skipped) and the web build pass. The new test builds, on `session-2-open`:
- Beat 7's miss, chained into Pay the Price;
- Beat 3's weak hit, with no complication set;
- a voided move.

It checks that:
- one entry is owed per chain, at its root;
- the weak hit owes its complication, with Gather Information's clause;
- the voided move is owed nothing;
- narrating the chain and setting the complication settle both;
- the state route carries the list.

**Browser pass on the stub** (`session-2-open`, freshly reset).
1. A Face Danger was rolled over HTTP and not narrated, standing in for a reload.
2. The play screen showed "Not yet narrated: Rook, Face Danger — "Rook forces the sealed bulkhead."" with **Narrate**.
3. Narrate streamed and committed the passage, and the offer went away.

The console was clean.

## Group 9 complete

9.1, 9.3, 9.4 and 9.5 are done. 9.2 moved out of Milestone 1 (D-71). The session lifecycle now runs through the app:
- Begin Session with a recap;
- "What now?" on request;
- End Session with a reviewed summary and open threads;
- the next session's recap built from them.

`session-1` begins and ends through the real commands.

---

## Implementation notes (task 10.4)

The golden session now runs start to finish as an automated test (§10, D-152). It is the `golden-session` fixture plus `fixtures/golden-session.test.ts`.

### Shape

- **The fixture plays; the test reads back.** `playGoldenSession` seeds session 1 under its own campaign ID, then plays session 2's ten beats through `app.inject`, making every call the play screen makes, in the order it makes them. That includes the world pass after each beat passage, the trigger check after a typed action, and "What now?". It throws on a non-2xx answer, an `ok: false` body, a stream that withdraws or fails, an outcome the rules score differently, a die left over, or an AI call nobody scripted. The test then asserts each beat against its acceptance criteria (A1–A17, A19, A21), from the responses, the stored events, the projection and `GET /log`. Its last Beat 10 check begins session 3 and confirms the recap request carries session 2's summary and threads (A17 feeding A1).
- **The scripted Guide answers by purpose.** One queue per AI purpose, filled by each beat just before its call, so a beat reads as what it expects to be asked. An unscripted call throws with the beat name and the whole prompt, which is how the fact keys the passages cite were found. The checker is a default `StubProvider`, which passes every check. The scripted passages are written to pass D-127's segment checks for real.
- **Loaded dice, step by step.** `buildApp` gained an optional `rng`, which the rolling routes (moves, Pay the Price, complication options, world passes, scene frames, truths, character and incident proposals) pass to their commands. The fixture's `rng` delegates to a `loadedDice` queue it reloads before each step and checks empty after it.
- **`db:reset` seeds it**, so the finished session opens in the browser as the third Lantern Wake campaign.
- **`golden-beats.ts` is retired.** Its cold-rebuild and second-read checks moved into the new test. `npm run harness` plays the new fixture in a throwaway schema and prints it. `app.test.ts`, which seeded from it, now seeds `session-2-open`.

### Where the script departs from the golden session's text

- **Juno's momentum (D-61).** The weak hit takes her from +3 to +4, so Beat 9's "one too low" override goes from +4 to +5, not +3 to +4.
- **Vesna's burn.** Rook's aid adds +2 before her scan, so the burn is offered at +9, not +7, and resets her to +2.
- **Beat 9's correction is about a fact, not a feeling.** The golden session has the passage call Rook "shaken". D-129 withdraws a passage that gives a player character an emotion before it reaches the log, so a fixture passage that did so would be scripting a withdrawal. The scripted passage overstates the burn instead ("a thin burn opens"), and the player's note corrects that.
- **Beat 3's move suggestion is asked for and not used.** A19 is part of Beat 3, so the fixture asks the Guide which move fits Juno's typed action, then invokes Gather Information directly, as the beat describes.
- **The NPC is Valda Thorn**, from the loaded name rolls, and the reroll discards a first look of "Accompanied" against the evacuation logs.

### Not covered

- **A18.** The stub answers instantly, so time to first text stays a live measurement (the `ai/eval/live-*.json` runs).
- **The browser.** The test drives the routes, not the React client (D-152's choice). The client's own logic keeps its unit tests, and the browser passes recorded for each task stand.
- **AI quality**, as §10 says.

### Verification

1035 tests passed and 1 skipped against the real database (the golden session adds 24), and typecheck and lint are clean. `npm run harness` prints the session, and `db:reset` seeds all three fixtures.

---

## Implementation notes (task 10.5)

`docker compose up -d --build` runs Astrolabe on a Linux host (D-55, D-154).

### Shape

- **`Dockerfile`, two stages on `node:22-alpine`.** The build stage runs `npm ci` from the manifests first, then builds `shared`, `rules` and `server` with tsc and the client with tsc and Vite. The runtime stage installs only the server workspace's production dependencies (`npm ci --omit=dev --workspace @astrolabe/server`), copies the four `dist` folders, runs as `node`, and starts `packages/server/dist/http/serve.js`. That entry point migrates before it listens. A `HEALTHCHECK` calls `/api/ai/status`.
- **The server serves the client.** `buildApp` takes an optional `webRoot`, and `@fastify/static` serves it. Any other GET outside `/api/` gets `index.html`, so a reload on `/campaigns/:id/play` works, and an unknown `/api/` path stays a JSON 404. Files under `assets/` are fingerprinted by Vite and cached as immutable; everything else is `no-cache`. `serve.ts` reads `ASTROLABE_WEB_ROOT`, set in the image, and otherwise uses `packages/web/dist` when it has been built, so `npm start` after a build also serves the whole app. `npm run dev` is unchanged: no `webRoot`, and Vite proxies `/api`.
- **`docker-compose.yml` gains `app`** beside `db`. `app` builds from `.`, waits for a healthy `db`, reads `.env` if present (`required: false`), and sets `DATABASE_URL`, `NODE_ENV=production` and `PORT` itself, so a development `.env`'s localhost URL never wins. `POSTGRES_PASSWORD`, `ASTROLABE_PORT` and `POSTGRES_PORT` interpolate with defaults.
- **Postgres is published on `127.0.0.1` only.** Before this, the development mapping `5433:5432` listened on every interface, which on a home server exposes the database to the LAN. Local development and the tests connect exactly as before. The existing dev container keeps its old mapping until `npm run db:up` recreates it; the volume is unaffected.
- **Production is not seeded.** `fixtures/cli.ts` now refuses `seed`, as well as `reset`, under `NODE_ENV=production`.
- **`.dockerignore`** keeps `node_modules`, every `dist`, `.env*`, `.git` and `docs` out of the build context, so secrets never enter an image layer.

### Verification

- The image built from a clean context.
- A separate compose project (`-p astrolabe-smoke`, ports 3100 and 5434) came up healthy:
  - `/` and a client route returned the app;
  - a fingerprinted asset carried `immutable`;
  - `/api/campaigns` answered `[]` on the empty database;
  - `POST /api/campaigns` created a campaign that survived an app restart;
  - `seed` inside the container was refused.
- The project was then removed with its volume.
- `web-client.test.ts` covers the serving rules without a database.
- 1039 tests passed and 1 skipped; typecheck and lint are clean.

### Not covered

TLS, backups (the README gives the `pg_dump` command) and authentication stay out of Milestone 1 (D-52, D-154). The app has no login, so it belongs on a trusted network.
