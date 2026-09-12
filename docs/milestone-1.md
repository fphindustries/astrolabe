# Milestone 1 — The Golden Session

**Done when** [`golden-session.md`](golden-session.md) runs start to finish against a real campaign, real rules data, and real AI narration, played solo by one user controlling three characters.

Nothing outside that scope ships in this milestone. When something feels missing, check whether the golden session needs it. If it doesn't, it waits.

---

## In scope

Campaign setup (truths, sector as a location list, inciting incident) · concept-first character creation · the play screen · relevant-moves panel · move resolution at the Automated level for the moves the golden session exercises (D-59) · server-authoritative animated dice · oracle rolls and oracle-grounded generation from declared recipes (D-65) · AI narration with latitude and length scaling, via the provider interface and the Claude implementation (D-60) · suggested actions on request · clocks, vows, and progress tracks · NPC and location tracking · the event log · void-and-redo · manual overrides · narration corrections · session recap, start, and end · token counter.

**Automated moves (D-59).** Begin a Session, End a Session, Gather Information, Secure an Advantage, Face Danger, Pay the Price, Endure Harm, Ask the Oracle, Swear an Iron Vow, Reach a Milestone. Aid Your Ally is a flag on an invocation rather than its own spec (D-62). Every other move runs at Reference.

## Out of scope

Multiplayer and real-time sync · authentication · the OpenAI provider implementation (D-60) · AI-proposed scene transitions (D-71) · automation for any move the golden session does not exercise, including the Threshold moves (D-59) · combat, exploration, recovery, connection, legacy, and scene-challenge automation · the visual starmap · portraits · lines and veils · mobile and tablet layouts · asset automation beyond the Guided level.

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

### 1. Rules package

- [x] 1.1 Monorepo scaffold: `rules`, `server`, `web`, `shared`; TypeScript, linting, test runner
- [x] 1.2 Define the internal rules schema: moves, outcomes, stats, assets, oracle tables, stable IDs
- [x] 1.3 Datasworn adapter: import Starforged moves, assets, and oracles into the schema
- [x] 1.4 Dice: action roll, progress roll, oracle roll; seedable for tests
- [x] 1.5 Outcome resolution: strong hit, weak hit, miss, match detection
- [ ] 1.6 Momentum: gain, loss, reset, burn, and when burning changes an outcome
- [ ] 1.7 Move automation for the Automated-level moves listed under In scope (D-59): effects with no choice, inline choices, chained moves
- [ ] 1.8 Move relevance rules driven by situation state; the flag set is proposed and approved first (D-66)
- [ ] 1.9 Unit tests across 1.4–1.8, including matches and chained Pay the Price → suffer moves
- [ ] 1.10 Attribution screen content for Datasworn's CC BY licence

### 2. Event log and state

- [ ] 2.1 Postgres schema: campaigns, events, and projections
- [ ] 2.2 Event types and payload schemas in `shared`
- [ ] 2.3 Append-only event writer with actor and timestamp
- [ ] 2.4 State projection: characters, scene, trackers, entities, canon
- [ ] 2.5 Void-and-redo: mark an event void, reproject, keep it visible
- [ ] 2.6 Manual override events, distinguishable from automated changes
- [ ] 2.7 CLI harness that plays a scripted sequence and prints projected state

### 3. Character creation

- [ ] 3.1 Character data model: stats, meters, momentum, impacts, assets, vows
- [ ] 3.2 Manual creation UI with rule validation on every field
- [ ] 3.3 Concept-first flow: prompt, AI proposal, review, accept or edit per field
- [ ] 3.4 Asset selection with rule constraints
- [ ] 3.5 Creation writes character-created events

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
