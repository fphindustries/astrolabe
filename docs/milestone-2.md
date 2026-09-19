# Milestone 2 — Campaign Launch

**Done when** [`golden-launch.md`](golden-launch.md) runs from a new campaign to the
first narrated `Swear an Iron Vow` result against real rules data, with a three-character
crew, a shared starship, a complete starting sector, resumable setup, and a stubbed AI
provider. The same flow must remain completable with no AI provider configured.

Milestone 2 implements the campaign-launch exercises from Chapter 2 of *Ironsworn:
Starforged*, except safety and content-expectation tools. It replaces the deliberately
thin creation paths built for Milestone 1; it does not replace the play screen or broaden
active-play automation.

Design decisions: D-159–D-170 in [`design-record.md`](design-record.md).

---

## In scope

- A persisted, resumable Campaign Launch workspace with `draft`, `ready`, and `active`
  phases.
- One to six characters, all controlled by the local user in this milestone; at least
  one complete character is required to launch.
- All fourteen setting truths, including nested subchoices, quest starters, custom
  answers, server rolls, and an explicit “leave open” choice.
- Manual, oracle-assisted, and AI-assisted creation at the field and whole-object level.
- Complete Chapter 2 character creation: identity, appearance, assets, stats, starting
  meters and momentum, backstory or an explicit mystery, background vow, and optional
  signature gear.
- One shared command starship with name, appearance, history, quirks, integrity, the
  shared Starship asset, and installed modules linked to their owning characters.
- A starting sector with region, name, structured settlements, shallow planet details,
  an optional star, a detailed starting settlement and planet, passages, off-map exits,
  a visual node map, settlement trouble, and sector trouble.
- One local NPC connection with role, rank, progress, and selected crew members sharing
  it. Campaign Launch grants the rules-directed automatic strong hit; the broader
  Connection move family remains Reference.
- A grounded inciting-incident proposal that draws on accepted truths, quest starters,
  crew backgrounds, the sector, its troubles, and the local connection.
- Campaign activation: begin Session 1, establish the approved opening scene, and make
  the actual `Swear an Iron Vow` roll as the first playable beat.
- Explicit pre-launch revision and post-launch amendment paths.
- Migration behavior: incomplete existing campaigns enter “Finish campaign launch”;
  built-in fixtures are upgraded to project as already active.
- Removal of the temporary production startup seeding once the new-campaign path is a
  complete, useful first-run experience.

## Out of scope

- Safety tools, lines and veils, content flags, and content-preference prompting.
- Authentication, separate player identities, invitations, character ownership, voting,
  presence, and real-time synchronization.
- Combat state and Guided combat moves; these move to Milestone 3.
- Full automation of Connection moves after the starting connection is established.
- Full automation of modules, support vehicles, companions, or other asset abilities.
- Generating an entire campaign with one button.
- Tactical distance, travel time, or movement rules derived from map placement.
- Exhaustively generating every planet, star, faction, or site before play.
- Importing a campaign from another application or document.
- Portraits and book-derived art or page layout.

---

## Acceptance criteria

Criteria continue Milestone 1's numbering.

| # | Criterion | Golden launch beat |
|---|---|---|
| A22 | A new campaign opens a Campaign Launch workspace showing every section, its status, and the next useful action. | 1 |
| A23 | Saving, leaving, and reopening restores the latest explicitly saved non-canonical drafts without making them accepted campaign facts. | 1–2 |
| A24 | Every truth is either answered or deliberately left open before launch; accidental omissions cannot pass readiness. | 2 |
| A25 | Truth options retain nested subchoices and quest starters. A subchoice is part of the accepted truth; a quest starter is labelled inspiration and is not canon. | 2 |
| A26 | Truths support pick, server roll, custom text, and leave-open paths; accepted revisions retain visible history. | 2 |
| A27 | Campaign Launch supports one to six characters and requires at least one complete character. The golden launch creates Vesna, Rook, and Juno. | 3–5 |
| A28 | A complete character records identity, appearance, legal starting assets and stats, starting meters and momentum, backstory or an explicit mystery, a background vow, and optional signature gear. | 3–5 |
| A29 | Concept-first and step-by-step creation edit the same draft. A proposal never becomes a character until the player reviews and accepts it. | 3–5 |
| A30 | The campaign has one shared command starship with integrity 5; its shared abilities are available to the crew, while an attached non-shared module retains its owning character. *Read with D-190: every module is shared for use and keeps the character who holds it as its owner; D-192 bounds "available" to shown, not automated.* | 6 |
| A31 | The chosen sector region determines the required settlement and passage baseline. Readiness enforces the baseline as a floor and permits additional custom content. Enforcing it is Astrolabe's deliberate choice, stricter than the rulebook, which offers the counts as a recommendation for the Chapter 2 exercise (D-180). | 7 |
| A32 | Every required settlement has a name, location type, population, authority, and one or two projects, created manually, by server rolls, or from a reviewed Guide proposal. | 7 |
| A33 | Planets are generated only to the depth Chapter 2 calls for: shallow details for associated settlements and fuller detail for the starting settlement's planet. Stars are optional. | 7–8 |
| A34 | The sector map displays repositionable settlement/location nodes, passages, and off-map exits. Layout has no mechanical distance meaning. | 8 |
| A35 | One settlement is selected as the start and gains first-look details and settlement trouble; the sector also has an accepted sector trouble. | 9 |
| A36 | A local NPC connection has a role, rank, progress track, and explicit sharing crew. It is established through the Chapter 2 automatic strong hit without rolling. | 10 |
| A37 | An incident proposal cites its oracle rolls and the accepted launch facts it draws on. The player may choose, edit, reroll, replace, or write the incident. | 11 |
| A38 | Activating a ready campaign begins Session 1, creates the approved scene, and presents `Swear an Iron Vow` as the first actual move and roll. | 12–13 |
| A39 | The inciting vow is one track with one swearing character and selected sharing characters. Move effects apply to the roller; shared progress and later rewards retain their participants. | 13 |
| A40 | Activation is one-way. Pre-launch changes are revisions; post-launch changes are explicit amendments, all append-only and visible. | all |
| A41 | Every rolled or Guide-interpreted proposal shows oracle chips, rerolls, rationale, edits, and links from the accepted fact to its grounding. | 2–11 |
| A42 | Campaign Launch remains fully completable without AI. Provider failure disables proposal actions only; manual and oracle paths remain usable. | all |
| A43 | Existing incomplete campaigns open in “Finish campaign launch”; built-in fixtures remain directly playable as active campaigns. | compatibility |
| A44 | The golden launch runs end to end through HTTP routes with loaded dice and stubbed providers; its completed launch becomes the reusable fixture foundation for Session 1 and the existing golden session. | all |

---

## Experience model

Campaign Launch is a workspace, not a one-way form. Its home shows seven sections:

1. Foundation
2. Truths
3. Crew
4. Starship
5. Starting sector
6. Connection and troubles
7. Inciting incident and launch

Each section is `not_started`, `in_progress`, or `complete`. The server computes status
from projected facts and the applicable rules; the client does not maintain a second
readiness algorithm. A section can be revisited at any time before launch. “Ready” means
all required facts exist or carry an explicit allowed deferral, not merely that the user
visited every page.

The creation interaction is consistent across sections:

- **Write** — enter the fact directly.
- **Choose** — select an official option.
- **Roll** — ask the authoritative server to roll an official oracle.
- **Ask the Guide** — receive a grounded proposal.
- **Review** — accept, edit, reroll, replace, or leave the fact open where allowed.

There is no “generate campaign” action. Whole-object proposals exist for a character,
the starship, one settlement, the sector, and the incident, but the player reviews each
object and its fields in context.

---

## Domain and event model

### Campaign phase and launch state

`CampaignState` gains a bounded launch read model with:

- phase: `draft | ready | active`;
- section statuses and blocking problems;
- latest saved non-canonical drafts;
- selected starting settlement and approved opening scene;
- the accepted crew, starship, sector, connection, troubles, and inciting-incident
  references needed to activate.

`campaign.created` begins in `draft`. Readiness is derived, never set by the client.
Activation is one server command that validates the projection, appends the permanent
launch transition, starts Session 1 and its scene, and returns the pending vow flow.

### Drafts, proposals, acceptance, and revision

- Form changes remain local until **Save and continue**. Saving appends a typed draft
  snapshot event. Draft events are projected for resumption but are not canon and are
  excluded from narration, recap, and ordinary AI world context.
- Guide output is a proposal event with its rolls, citations, reasons, and accounting.
- Accepting writes the normal canonical event or events and records server-resolved
  causality back to the proposal. Edited acceptance stores the player's final words.
- A second accepted value before activation appends a revision that supersedes the
  earlier accepted value. Voiding the revision reveals the previous value naturally.
- After activation, the same change is an amendment with an explicit reason and visible
  history. No command returns an active campaign to `draft`.
- Exact event names and payload versions are added to
  [`design-event-log.md`](design-event-log.md) before the first event-schema task lands.
  Payloads remain typed; no unvalidated `Record<string, unknown>` launch-event escape
  hatch is permitted.

### Truths

The internal truth schema is no longer merely an `OracleTable`. It retains:

- truth identity and display order;
- the three primary options and roll ranges;
- nested subchoices and their roll ranges;
- the option's quest starter;
- source provenance.

An accepted truth records pick/roll/write provenance and its resolved subchoice. An
explicitly open truth is a fact that the category is intentionally undefined; AI context
must not treat that as permission to silently decide it. Quest starters are prompts for
the incident and later play, never accepted facts by themselves.

### Characters

Character drafts and proposals add appearance, backstory state (`written` or
`discover_in_play`), background vow, and signature gear to the existing name, callsign,
pronouns, hooks, stats, and assets. Rules validation remains pure in `rules` and runs in
both client and command layer. Starting meters, momentum, and the legal asset slot model
continue to use the existing rules functions.

The long form becomes a step flow over one draft. Concept-first fills the same fields;
it is not a separate character type or alternate write path.

### Shared starship

The Starship command-vehicle asset is campaign-shared, as the imported asset rules say.
It is no longer copied into every newly created character. The starship is a first-class
campaign aggregate with name, appearance, history, quirks, integrity, shared asset state,
and installed-module references. A module selected by a character is installed on the
ship but keeps that character as its mechanical owner unless the rule marks it shared.

The Guide may propose ship details only from server-rolled campaign-launch oracles.
History and quirks can also be chosen, rolled, or written. One or two quirks are valid.

### Starting sector

The sector records:

- name and region (`terminus | outlands | expanse`);
- settlements and other known locations;
- planet/star relationships;
- the starting settlement;
- passages between nodes and passages to an off-map exit;
- presentation coordinates for the map;
- settlement trouble and sector trouble.

Region rules determine the required settlement and passage baselines. Map coordinates
are presentation state: moving a node changes the saved layout, not fictional distance.
Settlement nodes are the primary map objects. Planets and stars appear in their detail
drawers unless separately established as playable locations.

A settlement recipe rolls name, location, region-appropriate population, authority, and
one or two projects. The starting settlement adds one or two first looks and trouble.
Planet generation follows its class-specific tables to the depth A33 requires. A sector
proposal orchestrates these declared recipes; the model never chooses a table or random
result itself.

### Starting connection

Campaign Launch establishes one NPC connection with an automatic strong hit, as directed
by Chapter 2. The player chooses its role, rank, and which crew members share it; the
Guide may propose those fields. The connection has one progress track and participant
list rather than one duplicate per character. This special launch command does not
pretend a die was rolled and does not broaden Connection move automation.

### Incident, session, and vow

Incident generation consumes only accepted facts: truths and their quest starters,
character backgrounds and background vows, starship details, sector/settlement trouble,
and the local connection. Each proposal is grounded in its own server rolls and cites the
accepted facts it draws on.

Activation begins Session 1 and creates the approved opening scene at the starting
settlement. One selected character then makes the real `Swear an Iron Vow` move for the
accepted incident. The vow is one track with explicit participants; all three Lantern
Wake characters share the golden launch vow. Outcome effects apply to the rolling
character. The existing narration and authority-check path narrates the result before
the app transitions to ordinary play.

---

## Task breakdown

Issue-sized tasks. Follow this order unless a later approved decision changes it. Every
task leaves the build working and the applicable tests passing.

### 1. Rules and imported launch data

- [x] 1.1 Extend the truth-as-plain-oracle adapter shape into a truth schema that retains
  nested choices, quest starters, order, and provenance; regenerate the frozen artifact.
  (Wording corrected by D-179: D-172 keeps the oracle id/dice/rows contract for Milestone 1
  callers rather than replacing it. The `row.text` transition is owned by group 5's cutover.)
- [x] 1.2 Add pure launch rules for campaign regions, required settlement/passage counts,
  allowed deferrals, one-to-six crew, and launch readiness, each traced to imported text
  or cited to the rulebook where the procedure is not in Datasworn.
- [x] 1.3 Declare recipes for a starship, settlement, shallow planet, detailed starting
  planet, starting connection NPC, sector trouble, and inciting incident.
- [x] 1.4 Extend character-creation validation for appearance, backstory state, background
  vow, and optional gear without moving campaign-aware checks into `rules`.
- [x] 1.5 Add the shared-starship/module ownership model and pure validation.
- [x] 1.6 Unit-test real imported data, traceability, recipe completeness, region baselines,
  character validity, and launch readiness. *(Reopened: the readiness validator has three
  tests, all on the empty case. Completed by 3R.8.)*

### 2. Event catalogue and projections

- [x] 2.1 Implement the approved Campaign Launch catalogue in `design-event-log.md`,
  including per-type payload schemas, revision chains, and introduction/reference
  metadata.
- [x] 2.2 Add campaign phase and typed saved-draft events, payload schemas, metadata, and
  upcasters where existing payloads change.
- [x] 2.3 Add truth deferral, nested-choice, and revision support.
- [x] 2.4 Extend character facts compatibly and add the shared starship aggregate.
- [x] 2.5 Add structured sector, settlement, planet/star relationship, map placement,
  off-map passage, starting-location, and trouble facts.
- [x] 2.6 Add the connection aggregate/track participants and shared-vow participants.
- [x] 2.7 Project launch status, drafts, ship, complete sector, connection, and
  participants without reading rules content inside projection. *(Closed by 3R.2.)*
- [x] 2.8 Cover void containment, revision fallback, cold rebuild, incremental projection,
  narrative-log visibility, and per-type `mutatesState` metadata.

### 3. Launch commands and API

- [x] 3.1 Add read endpoints for the Campaign Launch workspace and typed save/resume
  commands for each draft section.
- [x] 3.2 Generalize truth commands to pick, roll, write, defer, resolve nested choices,
  and revise before launch.
- [x] 3.3 Extend character proposal/creation commands and support one-to-six launch crew.
  *(Implemented; untested until 3R.7f.)*
- [x] 3.4 Add shared-starship proposal, roll, save, accept, and revision commands, rolling the
  declared starship recipe rather than a client-named oracle. *(Re-closed: recipe path in
  3R.5, save/accept/revision covered by 3R.7d.)*
- [x] 3.5 Add sector and settlement commands, including authoritative oracle rolls **of the
  declared settlement, planet and trouble recipes**, planet/star relationships, node placement,
  passages, exits, and troubles. *(Re-closed by 3R.5, 3R.7e, 3R.9b and 3R.9d.)*
- [x] 3.6 Add the automatic-strong-hit starting connection command. *(Implemented; untested
  until 3R.7c.)*
- [x] 3.7 Extend incident proposals to the complete accepted launch context. *(Re-closed by
  3R.6: the full D-168 list, each part asserted as arriving.)*
- [x] 3.8 Add the atomic activation command: validate readiness, mark active, begin Session
  1, start the scene, and return the pending `Swear an Iron Vow` flow. *(Re-closed by 3R.1d:
  two blocking defects fixed and covered by `launch-activation.test.ts`.)*
- [x] 3.9 Add explicit post-launch amendment commands for launch facts. *(Re-closed by
  3R.4a and 3R.7b: typed replacement, server-derived subject, covered.)*

### 3R. Launch foundation remediation

Corrective work on groups 1–3, added round 29. Task numbers 1–10 stay stable (D-151's
convention). **Group 4 does not start until 3R.1, 3R.2, 3R.3 and 3R.7 are green**: 4.1's
section dashboard and 4.3's ready review and Launch confirmation cannot be built or tested
against a readiness that can never reach `ready`.

Decisions behind this group: D-176 (statuses beside state), D-177 (revision, not void),
D-178 (a campaign with a session is not in launch), D-179 (ratification of D-171–D-175).

**3R.1 Unblock readiness — blocking, do first.**

- [x] 3R.1a Add the failing test first: `buildLaunchWorkspace` over `sector.configured` plus
  `trouble.established` must not report `sector_trouble_missing`. It fails today.
- [x] 3R.1b Map `state.launch.troubles` into the readiness input — `sector.sectorTrouble` from
  the `kind: 'sector'` trouble, each settlement's `trouble` from its `kind: 'settlement'`
  trouble by `ownerId`. The facts are projected today and read by nothing. **Decide here, not
  mid-implementation:** `ownerId` is optional in the trouble schema and nothing requires a
  settlement trouble to carry one, so an unattributed trouble cannot be mapped. Either require
  `ownerId` when `kind` is `'settlement'`, or add a readiness blocker for an unattributed
  settlement trouble.
- [x] 3R.1c Map `sector.starId` into `LaunchSector.star`.
- [x] 3R.1d A readiness test that reaches `ready === true`, and a command test that drives
  `activateLaunch` to success. 3.8 stays reopened until both exist.

**3R.2 Task 2.7 — type the launch read model (D-176).**

- [x] 3R.2a Replace every `unknown` and `Record<string, unknown>` in `LaunchState` with the
  accepted-fact types `design-event-log.md` §8 names.
- [x] 3R.2b Delete every cast in the launch read and command layers (`as PayloadFor<…>`,
  `as never`, `rank as never`). A cast that cannot be deleted marks a real contract gap — fix
  the type, not the call site.
- [x] 3R.2c Return section statuses and blockers beside `CampaignState`, per D-176.
- [x] 3R.2d Project `campaign.activated.pendingVow`, currently dropped.
- [x] 3R.2e Record an `eventId` on `connection.established` like every other launch fact.

**3R.3 Task 2.8 — void, revision, and rebuild coverage (D-177).**

- [x] 3R.3a Mark launch event types `voidable: false` and assert it: no event type may claim
  voidability that `planVoid` would refuse on session scope. **This is a test rewrite, not a
  flag flip:** `meta.test.ts` asserts the exempt set is *exactly* `ai.completed`, `ai.failed`,
  `campaign.activated`, `event.voided`, and its title names only D-85's token accounting. Both
  the list and the reason it states have to grow to cover D-177.
- [x] 3R.3b Revision fallback — voiding or superseding a revision reveals the previous value.
- [x] 3R.3c Cold rebuild and incremental projection over a complete launch log.
- [x] 3R.3d Assert `launch.draft_saved` and `creation.proposed` reach neither narration, recap,
  nor world context (D-161).

**3R.4 Typed payloads.** Cheapest now: these shapes exist only in the shared sample-payload
table, not in any seeded fixture campaign, so no upcaster is owed under 2.2.

- [x] 3R.4a `launch.fact_amended`: a discriminated union carrying the target id and a typed
  replacement per subject, replacing `subject` enum plus `replacement: string`.
- [x] 3R.4b `creation.proposed`: a typed object discriminated on `targetKind`, so a proposal is
  field-editable per D-166.
- [x] 3R.4c Project `creation.proposed` so acceptance can resolve its causality (A41).
- [x] 3R.4d Replace the placeholder truths and crew draft snapshots — `{decisions: string[]}`
  and `{characters: string[]}` restore nothing (A23).
- [x] 3R.4e Update the sample payloads in the shared test fixtures to match.

**3R.5 Recipe-driven oracle rolls (D-65, D-166, D-173).** No task in groups 3–9 owned this,
which is why the declared recipes are dead code.

- [x] 3R.5a Add a recipe roll command: the server materializes the recipe, rolls every slot,
  appends one `oracle.rolled` per slot, and returns them as grounding. Threaded `rng`.
- [x] 3R.5b Wire the declared recipes — starship, settlement, shallow and detailed planet,
  starting-connection NPC, sector trouble, inciting incident.
- [x] 3R.5c Keep the single-oracle roll for field-level Roll actions; state which interaction
  uses which.

**3R.6 Full incident context — completes 3.7.**

- [x] 3R.6a `decideTruth` records `questStarter`; the schema field exists and is never written,
  leaving A25's inspiration half unimplemented.
- [x] 3R.6b Supply crew backgrounds and background vows, starship details, settlement and sector
  trouble, the local connection, and quest starters — D-168's complete list. Accepted facts only.
- [x] 3R.6c Test that no draft snapshot reaches incident context.

**3R.7 Command and route test backfill for 3.3–3.9**, highest risk first.

- [x] 3R.7a Activation: atomicity, readiness refusal, Session 1 and scene created, `pendingVow`
  returned, a second activation refused (A38, A40).
- [x] 3R.7b Post-activation amendments with reason and visible history (A40).
- [x] 3R.7c The connection's automatic strong hit — no die rolled or fabricated (A36, D-167).
- [x] 3R.7d Shared starship: integrity 5, module owners retained, no per-character grant (A30).
- [x] 3R.7e Sector, locations, routes, off-map exits, layout, starting settlement (A31–A35).
- [x] 3R.7f Crew: one-to-six bounds, launch-validator rejection, no command-vehicle grant (A27).
- [x] 3R.7g HTTP coverage for the launch routes; none are exercised today.

**3R.8 Readiness test matrix — completes 1.6.**

- [x] 3R.8a The `ready` case, and each region's baseline enforced while permitting extra content.
- [x] 3R.8b Route rules: self-link, undirected duplicate, unknown endpoint, off-map exit.
- [x] 3R.8c Planet depth — shallow for associated settlements, full for the starting planet.
- [x] 3R.8d Crew bounds, allowed deferrals (`leave_open`, `discover_in_play`), section statuses.
- [x] 3R.8e Traceability: every region baseline carries its citation. **This asserts the
  citation is present, not that the numbers are right** — pp. 116–120 are outside the CC-BY
  subset, so D-179 leaves the six numbers open for the user to confirm against the book.

**3R.9 Correctness fixes.**

- [x] 3R.9a `route.removed` filters on `supersedesEventId`, which is the acceptance field and
  undefined for a fresh route: nothing is removed and the tombstone inflates the passage count.
  Fix the identity and add the missing command, or drop the event type until one needs it.
- [x] 3R.9b Route dedupe compares `to` by identity, so an off-map endpoint object never matches.
  Compare structurally and undirected.
- [x] 3R.9c Model `location.removed` explicitly instead of leaving a tombstone in `locations`.
- [x] 3R.9d Type planet details; readiness requires `atmosphere`, `observedFromSpace` and
  `feature` from what is currently an open string map.
- [x] 3R.9e Record the single-user assumption as a note rather than locking every launch
  command. Activation locks because it alone must revalidate then append atomically; the rest
  serve one local user (D-02, D-52). Revisit at Milestone 4.
- [x] 3R.9f Narrow activation's `launchFactEventIds` to accepted launch facts; it currently
  sweeps in `oracle.rolled` and `ai.completed`. Assert the contents in 3R.7a.
- [x] 3R.9g Define `readinessVersion` or remove it; it is hardcoded to 1 and means nothing.

**3R.10 Legacy-campaign guard (D-178).**

- [x] 3R.10a Refuse every launch command on a campaign that has begun a session.
- [x] 3R.10b Test that a Milestone 1 fixture campaign rejects them.

### 4. Campaign Launch workspace

Group 4 is the workspace **shell**: the sections it navigates to are built by groups 5–9, so
Foundation is the one working section here and the other six are honest placeholders that
still show their server blockers. Three gaps below the client are fixed first — see 4.0.

- [x] 4.0 Prerequisites found while planning group 4:
  - the `premise_required` foundation blocker in `rules`, so Foundation is not complete the
    moment a campaign has a name (D-181);
  - `launchOpen`/`closedReason` on the launch workspace response, derived from the same
    predicate `requireLaunchOpen` uses, so 4.4's routing and the server's refusal cannot
    drift (D-178);
  - `seq` on accepted launch facts and on projected drafts, so a section's form and its
    status cannot disagree about which write was last (D-182);
  - a test that `GET /launch` returns 200 for the three built-in fixtures. 3R.10b proved they
    reject launch *commands*; 4.4 makes that endpoint the front door for every campaign open.
- [x] 4.1 Replace the one-way creation wizard with the resumable section dashboard and
  server-projected completion/blocking status.
- [x] 4.2 Add Save and continue, leave/reopen behavior, section navigation, and accessible
  error summaries without duplicating server readiness rules.
- [x] 4.3 Add the ready review page and irreversible Launch campaign confirmation. The
  review page is the shell: the swearing character, sharing crew, rank and opening scene come
  from the accepted incident, so their pickers belong to 9.3 and `activateLaunch` takes only
  a `commandId`.
- [x] 4.4 Route incomplete existing campaigns to Finish campaign launch and active
  campaigns to the existing play screen.

### 5. Truths

Group 5 found the same shape of defect group 4 did, and fixes it first — see 5.0. The
editor itself plugs into the section shell group 4 built; there are no new routes.

- [x] 5.0 Prerequisites found while planning group 5:
  - **one truth representation (D-183)**, because `renderState` read only the Milestone 1
    one — a campaign launched through group 5 would have been narrated by a Guide that
    knew none of its truths;
  - `truthHistory` projected beside `truthDecisions`, because `supersedesEventId` is
    written and nothing can read the chain back (A26);
  - a truth-proposal AI route, which does not exist as characters' and incidents' do (5.3);
  - **`chips` on the workspace response**, because a decision cites its rolls by event id
    and a truth is not an entity, so nothing could resolve them and A41's oracle chip had
    no source;
  - **proposal-aware acceptance**, because `decideTruth` had no concept of a proposal, so
    accepting the Guide's recommendation recorded `official_choice` — indistinguishable
    from a player who picked the same option unaided.
- [x] 5.1 Build the fourteen-truth overview with answer/open status and progress.
- [x] 5.2 Render choices, nested subchoices, quest starters, custom text, authoritative
  rolls, and revisions with complete provenance.
- [x] 5.3 Add field help and full truth proposals without allowing the Guide to commit.
- [x] 5.4 Verify keyboard navigation, screen-reader grouping, and no-color-only status.
- [x] 5.5 Complete D-172's `row.text` transition: cut the legacy truth flow over to the
  richer schema's summary/description fields, so `row.text` stops doubling as the cleaned
  description. Owns the obligation D-179 left open; drop the task only by amending D-172.

**Implementation note (group 5).** Truths is the first section where all four of D-162's
paths, nested subchoices, quest starters, revisions and a Guide proposal appear together,
and the shape of the work was the same as group 4's: most of the difficulty was in facts
that were already being written and that nothing could read.

- **D-183 ends the two representations.** `TruthOption.text` becomes the summary and
  `description` carries the full option, so every consumer names the field it means. The
  `truth.set` arm folds into `launch.truthDecisions`, so a Milestone 1 campaign keeps its
  truths; `state.truths` and `setTruth` are gone. No payload version bump and no upcaster —
  the doubling ended in the adapter, where it started.
- **Three reads that were written and unreadable.** `truthHistory` gives A26's revision
  chain a read path; `chips` on the workspace response resolves the rolls a decision cites,
  collected by walking the launch state for `groundedIn` rather than by naming each
  section's field, so groups 6-9 need no edit here; and accepting a Guide recommendation
  now names the proposal, which the server resolves to set `causedBy` and to decide between
  `guide_proposal` and `guide_proposal_edited` by comparing what was proposed to what was
  accepted. Whether the player edited it is a fact about the player, not a claim the client
  makes about itself.
- **A truths draft holds unaccepted work.** Each truth is accepted on its own the moment
  the player chooses, rolls, writes or leaves it open, so Save and continue is for the work
  in between. D-182's precedence is therefore applied **per truth**: the draft is one
  snapshot with one `seq` while each accepted truth carries its own, and comparing the
  section as a whole would discard thirteen neighbours' work the moment one truth was
  accepted. Groups 6-9 inherit this; `truth-form.ts`'s module comment states it.
- **A truth can be decided and still blocked.** `truth_option_invalid` and
  `truth_subchoice_missing` survive a decision present in the fold, which is how a
  Milestone 1 campaign's truths arrive. Such a truth reads "Needs attention" in the
  server's own words and does not count toward the progress line, so "14 of 14 decided"
  cannot sit beside a section chip reading In progress.
- **5.4 earned its place.** The pass at 1280x720 found four defects that typechecked,
  linted and unit-tested clean: the disclosure never closed (`display: flex` beats
  `[hidden]`), Datasworn's link markup reached the reader, the option radios fell back to
  their value for an accessible name, and "work you have not saved" outlived the save and
  appeared for a rolled truth nobody had touched.
- **Two more the browser pass structurally could not reach**, and both were group 4's
  lesson again — logic in a `.tsx` is logic nothing checks. Clicking an option to compare
  it against a typed answer threw the typed answer away, and a nested choice was carried
  onto a different option where a coincidentally valid index would have been sent. The
  transitions now live in `truth-form.ts` as `selectOption`, `selectSubchoice` and
  `writeCustom`, where they are three lines of test each. Separately, the card's prominent
  **Use this answer** recorded `official_choice` for an answer the Guide had just
  proposed, bypassing the provenance the commit before it existed to record: the selection
  now carries the proposal's event id from the moment the player takes it and loses it on
  any manual move away, so there is one accept path and one provenance, and a held
  proposal from an hour ago cannot attach itself to an unaided revision.
- The dev stub answers `truth_proposal`, so the launch's stubbed-provider path reaches an
  acceptance by hand; the no-provider path (A42) is reached by configuring no provider,
  and both were walked.
- **The truth proposal cites no oracle roll, deliberately.** A truth's own table is its
  enumerated option set, so the Guide recommends among the official options or drafts
  custom wording — the authority it already has over incident text (D-168) and backstory
  (D-163). It generates no random result, so section 4 is satisfied without a roll, and a
  player who wants dice uses the Roll path. `truth-proposal.test.ts` asserts the absence
  rather than leaving it to be assumed.
- Group 4 pinned Truths as its placeholder example; `SECTION_ARRIVES_IN.truths` is now
  null and the two tests that named Truths moved to Crew, the first section without an
  editor.

### 6. Crew

Group 6 found the same shape of defect groups 4 and 5 each found, and it has one cause worth
stating once: **Crew is the only launch section whose accepted facts live outside
`state.launch`.** A character projects to `state.characters`, and `LaunchState` has no crew
member in it, so every cross-cutting affordance group 5 built is blind to crew. 6.0 fixes
that before the editor is built.

Decisions behind this group: D-184 (crew metadata on the character), D-185 (`creation.proposed`
for crew), D-186 (a declared character recipe), D-187 (a saved draft starts a section), D-188
(a revised background vow reaches its track).

- [x] 6.0 Prerequisites found while planning group 6. Each begins with its failing test
  (3R.1a's pattern):
  - [x] **6.0a Crew acceptance is readable (D-184).** `CharacterCreatedSchema` gains optional
    `provenance` and `groundedIn`; projection carries `eventId`, `seq`, `provenance` and
    `groundedIn` onto `CharacterState`. All optional, so no upcaster is owed.
  - [x] **6.0b Crew chips resolve (D-184).** `launchChips` walks `state.characters` as well as
    `state.launch`, and its comment stops claiming groups 6–9 need no edit there.
  - [x] **6.0c The crew revision chain is readable (D-184).** `LaunchState.crewHistory`, oldest
    first, written by the `character.revised` arm — `truthHistory`'s shape and projection arm.
  - [x] **6.0d `reviseCharacter` and `removeCharacter` commands and routes.** Both events have
    schemas, metadata, projection arms and sample payloads, and **no command appends either**;
    6.4 requires both. Guarded by `requireLaunchOpen` (D-178), revalidated with
    `validateLaunchCharacterDraft`, and filling `supersedesEventId` from the projected
    `CharacterState.eventId` 6.0a adds rather than trusting the client — which is why 6.0a
    sequences first. **Dangling background-vow tracks are handled in the `character.removed`
    projection arm**, which today only deletes from `state.characters`: it also drops tracks
    whose `characterId` is the removed character. Not a new event type and not a void (D-177
    leaves void no job here). A removal that orphans an installed module surfaces as
    `module_owner_unknown` from the existing `validateSharedStarship` rather than silently —
    assert it.
  - [x] **6.0e Crew draft identity (D-182, D-185, A23).** The crew draft arm becomes
    `{ characters: Array<{ draftId, characterId?, …loose fields }> }`. 3R.4d typed this
    snapshot but gave an in-progress character no stable key, so nothing could correlate a
    saved draft to the crew member it belongs to. `draftId` is minted client-side, stable
    across saves, and is the proposal `targetId` D-185 defines. Precedence is decided **per
    crew member**, as group 5 decided it per truth. The inner `min(1)` constraints drop, as
    the `connection_troubles` arm already does deliberately: a draft is incomplete by nature.
  - [x] **6.0f `sectionStarted` honours drafts (D-187).** `LaunchReadinessInput.draftedSections`,
    supplied by the workspace from the projected drafts. This changes status for all seven
    sections. The test churn predicted here did not materialise: `draftedSections` is
    optional, so every existing caller and fixture is unaffected, and no existing test saved
    a draft and then asserted `not_started`.
  - [x] **6.0g Delete the `rank as never` casts.** `character-commands.ts` types
    `backgroundVow.rank` as `string` and casts twice. `/launch/crew` routes through it, so it
    is a launch command path and 3R.2b's rule applies; D-175 exists to stop this drift.
  - [x] **6.0h Declare `CHARACTER_RECIPE` (D-186).** Five distinct slots, added to
    `CAMPAIGN_LAUNCH_RECIPE_MATERIALIZATIONS`, `LaunchRecipeSelector` and
    `materializeLaunchRecipe`; `CHARACTER_PROPOSAL_ROLLS` becomes a read of it. The wire
    schema's selector union needed the same arm — the recipe was otherwise declared and
    unreachable over HTTP — and `LAUNCH_RECIPE_KINDS` plus a test now stops the two lists
    drifting again.
- [x] 6.1 Refactor character creation into a resumable step flow over the existing draft.
  Identity → Stats → Assets → Background → Review, with **Save and continue** at any step.
  Every transition lives in `crew-form.ts`, not in the `.tsx` — group 5's note is unambiguous
  that logic in a `.tsx` is logic nothing checks, and crew has more transitions than truths
  did. Reuses `assignStat`, `slotOptionGroups`, `CREATION_SLOTS`, `problemsByField` and
  `AssetPicker` rather than restating them. `SECTION_ARRIVES_IN.crew` becomes null and the
  placeholder example moves to Starship.
- [x] 6.2 Add appearance, backstory/discover-in-play, required background vow, and gear,
  validated by `validateLaunchCharacterDraft` in both client and command layer. The form says
  in words that an omitted pronoun is not guessed (D-131) and that discover-in-play is an
  explicit state, not a missing required field. Field-level **Roll** for backstory prompts
  through the existing single-oracle endpoint (3R.5c), its chip resolved by 6.0b.
- [x] 6.3 Update concept-first proposals and field-level help to fill the same draft.
  `characterProposalSchema`, `CREATION_RULES` and `checkCharacterProposal` gain `appearance`,
  `backstory` and optional `signatureGear` — beat 3 keeps the *proposed* appearance and
  backstory, and today the schema has neither. The command writes `creation.proposed`
  (D-185) grounded in `CHARACTER_RECIPE` rolled as its own command (D-186), and acceptance
  generalizes `acceptedProposal` to any target kind. Field-level help (beat 5: hooks and a
  background vow) is the same command with a requested-field list, not a second path.
- [x] 6.4 Add the one-to-six crew overview, completion status, revision, and removal before
  launch, retaining server-side rules validation. Per-character status from
  `readiness.sections.crew.blockers`, visible revision history from `crewHistory`, and beat
  5's sentence: one complete character is the launch minimum, three is this campaign's choice.

**Scope fences.** The per-character Starship grant stays until 7.3 (D-171). The Milestone 1
`/campaigns/:id/characters/new` screen is untouched — mid-play character creation is in no
criterion A22–A44. Starship modules, connection and incident belong to groups 7 and 9.

### 7. Shared starship

Planning group 7 turned up the same kind of defect as groups 4–6: **the starship aggregate
is written and projected, but everything that would let a player build it with help, or
see where it came from, is missing below the client.** `saveSharedStarship` records
`player_written` with no grounding for every ship. The client supplies the ship's identity
and its integrity bounds. There is no starship proposal route. The Starship's integrity
of 5 is a literal in the validator rather than something traced to the imported rule. 7.0
fixes these before the editor is built.

Decisions behind this group: D-190 (a module keeps its owner, the crew uses it), D-191
(installed modules are derived from the crew), D-192 (shared abilities are shown, not
automated), D-193 (the legacy grant is neutralized in projection).

- [x] 7.0 Prerequisites found while planning group 7. Each starts with its failing test
  (3R.1a's pattern). **Before the first schema change lands** (7.0d, 7.0f, 7.0i), update
  `design-event-log.md`: the `creation.proposed` starship arm, `starshipHistory` in §8, and
  the `starship.established` and `character.removed` rows that D-191 corrects.
  - [x] **7.0a The server owns the ship's identity and bounds.** `SaveSharedStarshipRequest`
    takes `starshipId`, `integrity {value,min,max}` and `assetId` from the client. Mint
    `starshipId` on establish and reuse the projected one on revise, so a revision cannot
    split the aggregate. Derive `assetId` and integrity from the rules. Sequence this first,
    because 7.0c–e key off it. There is exactly one ship, and no id exists before
    establishment, so a starship proposal's `targetId` is the fixed `'starship'` rather than
    a client-minted id (D-185's `draftId` problem avoided rather than repeated).
  - [x] **7.0b Integrity is traced to the imported rule.** The adapter drops Datasworn's
    `controls`. Import the command vehicle's `integrity` condition meter (min 0, max 5,
    value 5) into the asset schema, regenerate the artifact, and have `validateSharedStarship`
    read it instead of the literal `5`. Check `min`/`max` too; today a client can send
    `max: 99`. The `battered`/`cursed` impacts are imported as data only; nothing marks them
    in Milestone 2. The new asset field is optional and additive, so existing
    `STARFORGED.assets` consumers (MoveComposer, AssetDrawer, crew form) are untouched.
    Regenerate the artifact with `npm run generate --workspace @astrolabe/rules`.
  - [x] **7.0c Proposal-aware acceptance.** Stop hardcoding `player_written` and `groundedIn: []`.
    Acceptance names the proposal event. The server resolves `causedBy` and decides between
    `guide_proposal` and `guide_proposal_edited` by comparing the proposal with what was
    accepted. Field-level rolls the player kept become `groundedIn`, validated as recorded
    `oracle.rolled` events. Two acceptance mechanisms exist today: truths' `acceptedProposal` over
    `state.launch.proposals`, and crew's `readEventsByCommand`. D-185 said it would
    generalize and it did not. Generalize `acceptedProposal` over the projected proposals
    (it is already projected for A41) and state why in the note.
  - [x] **7.0d A per-field starship proposal.** The `starship` arm of `creation.proposed` is
    `SharedStarshipSchema.partial()`, so the proposal has no per-field reason or grounding. It
    has the same shape as the character arm before 6.3. Add `StarshipProposalSchema`: name,
    history and each quirk as `ProposedTextSchema` (value, reason, the rolls behind it), and
    appearance as `ProposedNoteSchema`. Beat 6 has the player keep one quirk and edit the
    appearance, and still see the original. Update sample payloads (3R.4e).
  - [x] **7.0e A starship proposal route.** Add a `starship_proposal` purpose, a context
    builder in `ai/context/starship.ts` over accepted facts only (truths, crew backgrounds,
    no drafts, D-161), a `proposeStarship` command, `POST /starship-proposals` beside
    `/truth-proposals`, the structured arm in `create-provider.ts`, and a dev-stub answer
    (A42's stubbed path). The client rolls `{ kind: 'starship', quirkCount }` through
    `rollLaunchRecipe` and passes the event ids as `groundedIn` (D-186's shape). Field-level
    help is the same command with a requested-field list (6.3's shape). The grounding check
    refuses a proposal whose name, history or quirk cites no roll from the recipe.
  - [x] **7.0f The starship revision chain is readable.** Add `LaunchState.starshipHistory`,
    oldest first, written by the `starship.revised` arm. It has the same shape as
    `truthHistory` and `crewHistory` (A40; beat 6 tests "ship proposal and revision").
  - [x] **7.0g The starship draft admits incomplete work.** The draft arm is
    `SharedStarshipSchema.partial()`, whose inner `min(1)` and quirk bounds refuse a draft
    that has one quirk blank. Loosen it as 6.0e did for crew. D-182's precedence is
    per section, because there is one ship.
  - [x] **7.0h Play context knows the ship.** `renderState` reads no `launch.starship`, so a
    launched campaign would be narrated by a Guide that does not know the *Lantern Wake* by
    name. This is D-183's defect again. Render name, appearance, history, quirks, integrity
    and installed modules with their owners. Assert that each one arrives.
  - [x] **7.0i Installed modules are derived from the crew (D-190, D-191).** Take `modules`
    out of the accepted payload's inputs and out of the request body. Derive the list and
    its owners in the read layer from the crew's module-category assets. `starship.established`
    events already written with a `modules` list stay readable, but the list is ignored.
    `module_owner_unknown` is then unreachable by construction, and `module_invalid`'s
    category check is true by construction. Both leave `validateSharedStarship`.
    `module_duplicate` moves to the Crew section, reported on the later-created of two
    characters holding the same module (D-191). Assert that revising Vesna's final asset, or
    removing her, updates the ship with no second write.
  - [x] **7.0j Amendments keep the same contract.** Found after 7.0a–i landed: the
    `starship` arm of `launch.fact_amended` took a full client-supplied ship, so a
    post-launch amendment could record a different id, any integrity, or a module list.
    The arm is now the fact as projected (no modules), and `amendLaunchFact` stamps the
    id, asset and **current** integrity from the projected ship and checks the details
    through `validateStarshipDetails`, the checks acceptance uses. Current rather than
    starting integrity, because an amendment corrects words and must not undo damage.
- [x] 7.1 Add the Starship step with Write, Roll, field-level Guide help, and a whole-ship
  proposal for name, appearance, history, and one or two quirks. Every transition lives in
  `starship-form.ts`, not the `.tsx` (the lesson from groups 5 and 6). That covers the
  quirk count, keeping or discarding a proposed field, and carrying the proposal id only
  while the selection is still the Guide's. Field Roll uses `rollLaunchOracle` against the
  recipe's own oracles, with chips resolved by the existing `launchChips` walk. Save and
  continue and D-182 precedence apply. Proposal actions are disabled when there is no
  provider, and Write/Roll remain (A42). `SECTION_ARRIVES_IN.starship` becomes null. The
  placeholder example, and the tests that name it, move to Sector.
- [x] 7.2 Show integrity from the imported meter, the shared Starship asset with its
  abilities (the first enabled by default), installed modules labelled with their owners,
  and the server's `readiness.sections.starship.blockers` beside the fields they name.
  Show the visible revision history from `starshipHistory`. Nothing here is a second
  readiness algorithm (D-176). In play, the ship appears once as a crew-level panel, not
  under each character, with its abilities as Reference (D-192). Each module is labelled
  with its owner and usable by the crew (D-190).
- [x] 7.3 Remove the per-character grant in one change: `CHARACTER_CREATION.grants`,
  `grantedAssets`, the `grantCommandVehicle` flag and its call sites, and
  `CharacterCreationScreen`'s `GRANTED`. Update the creation prompt's "granted separately"
  line. Apply D-193: `legacyStarshipGrant` in the `character.created` arm,
  keyed by a `rules`-exported id constant. First, a failing test: a legacy incomplete
  campaign whose characters carry the grant must not report `forbidden_category` or
  `category_not_allowed` for it. Today it does, so A43's Finish campaign launch can never
  reach `ready` for such a campaign. Then assert that the three built-in fixtures still
  open in play and the golden session still passes. State the one expected change: in the
  fixtures' world context, the Starship moves from each character's asset list to D-193's
  single crew line. Assert that line, rather than claiming the context is unchanged.

**Scope fences.** Starship impacts, Withstand Damage and Repair against integrity, support
vehicles, and buying modules after launch are not in any of A22–A44. Ship details are
proposed only from the declared starship recipe (D-164). The Guide chooses no table.

### 8. Starting sector

Planning group 8 found the same shape of defect for the fourth time, and more of it. **The
sector aggregate is written and projected, but everything that would let a player build it
with help, correct it, resume it, or see where it came from is missing below the client.**
Every sector command hardcodes `player_written` with no grounding. The client supplies the
sector's id and its baseline, and every location's id. No declared recipe covers first
looks, settlement trouble, planet class, the star or the sector name, although all of them
are in the frozen data. There is no settlement or trouble proposal route. `location.removed`
and `route.removed` have schemas and projection arms, and no command appends either. The
sector draft holds only a name and a region. And `renderState` does not know the sector.
8.0 fixes these before the editor is built.

Decisions behind this group: D-194 (sector trouble is edited in Connection and Troubles),
D-195 (the optional star belongs to the sector), D-196 (a whole-sector proposal is one
proposal per object), D-197 (the map is hand-rolled SVG).

- [ ] 8.0 Prerequisites found while planning group 8. Each starts with its failing test
  (3R.1a's pattern). **Before the first schema change lands** (8.0b, 8.0d, 8.0h, 8.0i),
  update `design-event-log.md`: the settlement, trouble and sector arms of
  `creation.proposed`, the sector draft arm, the history reads in §8, the `sector.configured`
  row (server-minted id and derived baseline), and `starting_settlement.selected`'s
  supersession as written.
  - [x] **8.0a The server owns sector and location identity (7.0a's shape).**
    `configureLaunchSector` mints `sectorId` on configure and reuses the projected one on
    revise, so a revision cannot split the aggregate. It derives `baseline` from
    `REGION_BASELINES` instead of checking a client copy: the field records the region's
    rule (D-180), so the server should write it. `saveLaunchLocation` mints the id on add. A
    revision names an existing projected id, and an id the fold does not hold is refused.
    A settlement being built has no id yet, so it is keyed by a `draftId` (D-185's shape).
    The client mints it for a settlement the player starts, and 8.6's orchestration mints
    it for a settlement the Guide proposes. **The proposal target is the key the proposal
    was made under**: the `draftId` before acceptance, and the `locationId` for field help
    on an accepted settlement. Acceptance names that target alongside the proposal event.
    Then `heldProposal` resolves every settlement proposal, whichever path made it, and
    the key change at acceptance does not force the second mechanism crew needed (group
    7's note). The sector name has one fixed target, `'sector'` (7.0a's shape). Do this
    first, because 8.0d–i depend on it.
  - [x] **8.0b The command enforces what readiness already assumes.** `saveLaunchRoute`
    accepts any id in `state.launch.locations`, but `validateSector` counts only settlements
    and `kind: 'other'` as endpoints. A route to a planet is accepted and then blocked as
    `route_endpoint_unknown`. D-165 settles which is right: settlement and other-location
    nodes are the map, and planets and the star are details. The route command and
    `setSectorLayout` refuse planets and stars. `planetClass` narrows from `string` to
    `PLANET_CLASSES`. No seeded fixture writes a planet, so no upcaster is owed (3R.4's
    reasoning). A `planetId` is refused on a `deep_space` settlement. `starId` must name an
    accepted `kind: 'star'` location (D-195).
  - [x] **8.0c Declare the recipes Chapter 2 rolls and nothing declares (D-173).** Add
    `SECTOR_NAME_RECIPE` (prefix, suffix), `buildStartingSettlementRecipe(firstLookCount)`
    (one or two first looks plus settlement trouble), `PLANET_CLASS_RECIPE` and
    `STAR_RECIPE` (stellar object). Add them to `CAMPAIGN_LAUNCH_RECIPE_MATERIALIZATIONS`,
    `LaunchRecipeSelector`, `LAUNCH_RECIPE_KINDS` and the wire schema, where 6.0h's drift
    test catches a missing arm. Add two rules-owned row readers:
    `settlementLocationFromRow` (`Deep Space` → `deep_space`) and `planetClassFromRow`. The
    class row is Datasworn link markup, `[Desert World](id:oracle:planets/desert)`, so the
    reader takes the linked id, not the words. As 3R.5c requires, state which interaction
    uses which command: a whole-object **Roll** uses `rollLaunchRecipe`, and a one-field
    **Roll** uses `rollLaunchOracle` against that recipe's own oracle. A starting planet is
    shallow first, then deepened, because the `starting_detail` recipe has no name slot.
  - [x] **8.0d Per-field proposals (7.0d's shape).** `SettlementProposalSchema` has no
    per-field reason or grounding. It has the shape the starship arm had before 7.0d. Name,
    population, authority and each project become `ProposedTextSchema`, and `location`
    becomes `{ value, reason, groundedIn }` over the enum. Add an optional `planet`
    (`planetClass`, `name`) and optional `firstLooks`, which are offered only for the
    starting settlement. `TroubleProposalSchema` becomes `text` as `ProposedTextSchema` under
    the settlement/sector discriminator that the accepted fact already has. The `sector`
    arm narrows to its `name` (D-196). Update the sample payloads (3R.4e). *Found while
    implementing:* `launch.proposals` holds one proposal per target, with the newest
    winning. So a trouble proposal is held under `trouble:sector` or
    `trouble:<settlementId>`. Keyed by the settlement's own id, it would replace that
    settlement's proposal. The sample payloads use the truth arm, so none needed changing.
  - [x] **8.0e Settlement and trouble proposal routes (7.0e's shape).** Add
    `settlement_proposal` and `trouble_proposal` purposes and a context builder in
    `ai/context/sector.ts` over accepted facts only: truths, the sector, and the accepted
    settlements, so a proposal does not duplicate them. No drafts (D-161). Add
    `proposeSettlement` and `proposeTrouble`, `POST /settlement-proposals` and
    `/trouble-proposals`, the structured arms in `create-provider.ts`, and dev-stub answers
    (A42's stubbed path). The grounding check refuses any field that cites no roll from its
    recipe. Field-level help is the same command with a requested-field list (6.3's shape).
    A trouble proposal carries the accepted truths, so beat 9's "can coexist with the
    selected truths" has something to be checked against.
  - [x] **8.0f Proposal-aware acceptance (7.0c again).** `configureLaunchSector`,
    `saveLaunchLocation` and `saveLaunchTrouble` stop hardcoding `player_written` and
    `groundedIn: []`. Acceptance names the proposal event, and `heldProposal` resolves it,
    so there is still one mechanism. The server decides `guide_proposal` or
    `guide_proposal_edited` by comparing the proposal with what was accepted. The rolls
    behind the fields the player kept become `groundedIn`, and field rolls are validated as
    recorded `oracle.rolled` events. `saveLaunchRoute` stays `player_written`, because
    nothing proposes a passage (D-196). **A settlement and its planet are one decision**, so
    one command writes both `location.added` events (D-105's rule). Otherwise the player
    must accept a planet before the settlement that is the reason for it. *Found while
    implementing:* `saveLaunchTrouble` took the trouble id from the client, which is 8.0a's
    defect in the one aggregate 8.0a did not name. There is one sector trouble and one per
    settlement, so the owner now names the trouble and the server keeps its id. A second
    write revises the first instead of adding a trouble that readiness would silently map
    over.
  - [x] **8.0g Removal commands (the missing half of 3R.9a).** Add `removeLaunchLocation`
    and `removeLaunchRoute`, with routes, guarded by `requireLaunchOpen`. A location
    removal is refused while a retained fact references it: a route, the starting-settlement
    selection, a trouble's `ownerId`, a settlement's `planetId`, or `sector.starId`. The
    `design-event-log.md` row already says this, and nothing implements it. The
    `location.removed` projection arm also drops the location's layout coordinate.
    Otherwise the client's next complete-layout write is refused as
    `unknown_layout_location`.
  - [x] **8.0h The sector's revision chains are readable (A40).** Add `sectorHistory`,
    `locationHistory` by id, and `troubleHistory` by id, oldest first, in the shape of
    `truthHistory`, `crewHistory` and `starshipHistory`. A removed location's final version
    goes into its history, as `character.removed` does (6.0d). Project the starting
    selection's `eventId`, and have `setStartingSettlement` fill the `supersedesEventId` it
    has never written.
  - [x] **8.0i The sector draft admits work in progress (A23; 6.0e and 7.0g's shape).** The
    arm is `{ name?, region? }`, so a half-built settlement cannot be saved. It gains loose
    `settlements[]` entries: `draftId`, an optional `locationId`, the settlement fields, an
    optional planet, first looks and trouble text, and the proposal and kept rolls. It also
    gains loose other locations and a loose star. Routes and layout are accepted when the
    player acts, as a truth is, so they are not in the draft. D-182's precedence applies
    **per settlement**, as it applied per truth and per crew member.
  - [x] **8.0j Play context knows the sector (D-183 and 7.0h, a third time).**
    `renderState` reads no `launch.locations`, and it resolves a scene's location only
    against `state.entities`. Activation opens Session 1's scene at a launch location id,
    so the Guide would narrate beat 12 at no place and in a sector it has never been told
    about. Render the sector's name and region, the starting settlement and its planet, the
    other settlements and locations by name, the passages, and both troubles. Resolve a
    scene location against the launch locations. Assert that each one arrives. This is
    owned here rather than in 9.5 because it reads group 8's facts.
  - [x] **8.0k Amendments keep the same contract (7.0j's finding, applied to group 8).**
    Found after 8.0a–j landed, by the same route 7.0j was found. The `sector`, `location`
    and `trouble` arms of `launch.fact_amended` took the fact's id from the request, so a
    post-launch amendment could record a sector, location or trouble id the campaign never
    had in its visible history (A40), the very ids 8.0a and 8.0f made the server's.
    `amendLaunchFact` now stamps each id from the event it supersedes. A location keeps its
    kind and a trouble its owner, for the reason a revision does: other facts rest on what
    they are. Amendments project into `launch.amendments` and never back into the sector's
    facts, so this was a history defect rather than a split aggregate.
- [x] 8.1 Add region and sector-name selection with the required baseline visible. Offer
  Write, Roll (the sector-name recipe) and field-level Guide help for the name. Show the
  baseline with its citation and D-180's sentence: it is a floor, not a quota. A revised
  region changes the baseline and does not re-roll populations already accepted, and the
  screen says so. Every transition lives in `sector-form.ts`, not the `.tsx`.
  `SECTION_ARRIVES_IN.sector` becomes null, and the placeholder example and the tests that
  name it move to Incident and Launch. Connection and Troubles is half built after 8.5.
- [x] 8.2 Build settlement creation and review for manual, oracle, and Guide proposals. Show
  the settlement list against the baseline ("2 of 3"). For each settlement, offer Write,
  field Roll, whole Roll (the recipe) and Ask the Guide (whole or per field). Review is
  keep, edit or discard per field, and the proposal id is carried only while the selection
  is still the Guide's (7.1). Other locations (Kessel Drift) take a written name and
  description. Removal shows the server's refusal when a fact still references the
  location. Show the `readiness.sections.sector.blockers` beside the fields they name, and
  show visible history from 8.0h. Nothing here is a second readiness algorithm (D-176).
- [x] 8.3 Add progressive planet details and optional star generation. A planetside or
  orbital settlement shows its planet inside the settlement: choose or roll the class, then
  write or roll the name (shallow). The starting settlement's planet is deepened with
  atmosphere, observed from space and a feature, and every other planet stays shallow
  (A33). The star is optional and belongs to the sector (D-195). It is written or rolled in
  the sector's details, and it is not a map node.
- [x] 8.4 Build the accessible node-and-passage map, off-map exits, persisted presentation
  layout, and non-visual equivalent controls/list. The map is hand-rolled SVG (D-197).
  Settlements and other locations are nodes, and passages are edges. An off-map exit is
  drawn at the map edge nearest its node, labelled, and has no coordinates of its own.
  Nodes move by pointer drag and by arrow keys. Positions stay local until **Save and
  continue** or leaving the map, which writes one `sector.layout_changed`, never one per
  pointer move. Default placement for a node with no coordinates, keyboard steps and
  clamping live in `sector-map.ts` as pure, tested functions. The list view can create,
  inspect and remove every passage and exit without dragging. The screen states that
  layout has no distance or travel meaning (A34). Planets and the star appear in the
  detail drawer.
- [x] 8.5 Add starting-settlement selection, first looks, settlement trouble, and sector
  trouble. Once the start is selected, the player rolls the starting-settlement recipe, or
  writes the details. Selecting does not roll by itself. The Guide interprets
  the first looks and the trouble, and the player edits the interpretation without
  changing the rolls. The chips stay with the accepted words (beat 9, A41). The starting
  planet is deepened (8.3). Sector trouble is the Troubles half of Connection and Troubles
  (D-194): roll the sector-trouble recipe, have the Guide interpret it against the accepted
  truths, then accept, edit or write. The connection half remains a labelled placeholder
  naming group 9. **This is the first half-built section**; every earlier group flipped a
  whole section. The section screen shows the Troubles editor, then the placeholder for the
  connection alone. `SECTION_ARRIVES_IN.connection_troubles` becomes the connection's
  placeholder note rather than null, and group 4's two placeholder properties survive. The
  next useful action still points here while the connection is missing. The status is the
  server's for the whole section (D-176), so it reads In progress with the sector trouble
  accepted and the connection absent. *As built (D-198):* the Guide reads the rolled trouble,
  and first looks are rolled or written. **Found in the browser:** a recipe slot can yield
  several results, a roll-twice row or a row that embeds other tables such as Action + Theme.
  The client kept only the first result, so a trouble read "Deliver" where the roll was
  "Deliver + Discovery". The server matched a proposal's rolls to slots by table id, so an
  embedded table's result matched no slot and the Guide was refused. The same defect was
  latent in the starship and character proposals. `rollLaunchRecipe` now records each
  result's recipe and slot on `oracle.rolled`, fields D-142 already defined. The matcher
  takes every result of a slot, including embedded tables, and a proposal cites them all.
  The client reads a slot's results as one field.
- [x] 8.6 Add whole-sector orchestration that still reviews objects one at a time (D-196).
  One command rolls the sector-name recipe and the region's baseline count of settlement
  recipes. For each planetside or orbital result, it rolls a planet class and then the
  shallow planet recipe. It appends one `creation.proposed` for the name and one per
  settlement. The player reviews each through 8.2's panel and accepts, edits or discards
  it. The command never proposes passages or layout. Beat 7's mix of one written, one
  rolled and one proposed settlement is reached by discarding proposals, not by a special
  mode. The action is disabled when there is no provider, and Write and Roll remain (A42).

**Scope fences.** Travel time, distance and movement derived from map placement (D-165) are
out. So are generating planets beyond A33's depth, generating a sector for any region other
than the starting one, and a general exploration starmap. `REGION_BASELINES` stays scoped to
launch (D-180). The Milestone 1 `/sector/locations` and `/sector/routes` routes are untouched,
because group 10 owns their removal. The connection is group 9's. The Guide chooses no table:
every roll it cites comes from a declared recipe.

### 9. Connection, incident, and launch

Planning group 9 found the same shape of gap as groups 4–8, spread across three objects.
**The connection** is established by its own command but cannot be revised, although its
refusal message says to revise it. It records no grounding, and its proposal arm is
`ConnectionSchema.partial()`, the shape the starship arm had before 7.0d.
**The incident** can be proposed and can be accepted, but nothing connects the two:
`incident.proposed` is not projected, so a proposal is lost on reload and its chips never
reach the workspace. A chosen option names what it draws on by entity and truth id, while
acceptance wants the event ids of accepted facts, and acceptance always records
`player_written`. **Swearing the vow** has no path at all. Activation records a
`pendingVow`, but no command turns it into the real `Swear an Iron Vow` move with a shared
track. The play screen's scene header also resolves a location only against entities, so
Session 1 would open at an unnamed place: 8.0j's defect, on the client. 9.0 fixes these
before the screens are built.

Decisions behind this group: D-199 (the connection's track stays a vow), D-200 (the vow
choices are made on the review page), D-201 (one move command swears the pending vow),
D-202 (`track.revised` carries participants).

- [ ] 9.0 Prerequisites found while planning group 9. Each starts with its failing test
  (3R.1a's pattern). **Before the first schema change lands** (9.0b, 9.0e, 9.0g, 9.0h),
  update `design-event-log.md`: the connection and incident arms of `creation.proposed`,
  `incident.proposed`'s projection, the incident's optional vow choices, `track.revised`'s
  participants, the vow track's `incidentId`, and `launch.activation.vowTrackId` in §8.
  - [x] **9.0a The connection can be revised (D-202).** Add `reviseLaunchConnection` and
    its route, guarded by `requireLaunchOpen`, filling `supersedesEventId` from the
    projected connection rather than trusting the client. A changed name or rank changes
    the track's title and rank, and a changed sharing crew changes its participants. Both
    go through `track.revised` in the same command, as D-188 does for a background vow.
    `establishLaunchConnection`'s refusal then points at a command that exists.
    *Found while implementing:* `track.created`'s participants were never projected, so a
    shared vow's or a connection's sharers were written and unreadable, the group 5–8 shape
    again. `TrackState` now carries them, and the revision reaches them. The NPC is restated
    under its own id (D-203, asked).
  - [x] **9.0b A per-field connection proposal (7.0d's shape).** `ConnectionProposalSchema`
    has the NPC's name, role, goal, first look and disposition, each as
    `ProposedTextSchema` with its reason and rolls. The rank and the sharing crew are the
    player's (beat 10), so the Guide proposes neither. The target is the fixed
    `'connection'`, because there is one starting connection. Update the sample payloads
    (3R.4e).
  - [x] **9.0c A connection proposal route (8.0e's shape).** Add a `connection_proposal`
    purpose, a context builder over accepted facts only (truths, crew, the starting
    settlement and its trouble; no drafts, D-161), `proposeConnection`,
    `POST /connection-proposals`, the structured arm in `create-provider.ts`, and a dev-stub
    answer. The client rolls `STARTING_CONNECTION_RECIPE` through `rollLaunchRecipe`, and
    the rolls are matched by recorded slot (8.5). The grounding check refuses a field that
    cites no roll.
  - [x] **9.0d Proposal-aware connection acceptance (7.0c again).** Establishing or
    revising names the proposal event, and `heldProposal` resolves it. The server decides
    `guide_proposal` or `guide_proposal_edited` field by field and grounds the connection in
    the rolls behind the kept fields. The NPC's `entity.established` carries the same
    grounding, with its goal, first look and disposition as fields. D-167 holds: nothing
    rolls or fabricates a result for the automatic strong hit.
  - [ ] **9.0e Incident proposals are readable and launch-scoped.** Project the latest
    `incident.proposed` into the launch fold, so a proposal survives a reload and its rolls
    resolve as chips (A41). `proposeIncidents` refuses a campaign whose launch is closed
    (D-178). It rolls the declared `INCITING_INCIDENT_RECIPE` once per option through the
    recipe path, so each roll records its slot (8.5).
  - [ ] **9.0f Accepting an incident names its option.** `acceptLaunchIncident` takes the
    proposal event and the chosen option's index. The server resolves what the option draws
    on (truth, location, character and launch-fact ids) to the **event ids** of those
    accepted facts for `citedFactEventIds`. It decides `guide_proposal` or
    `guide_proposal_edited` by comparing the accepted words and rank with the option's, and
    grounds the incident in the option's rolls. A written incident still works without a
    proposal. The server mints the `incidentId` and reuses it on revision (8.0a's lesson).
    `citedFactEventIds` must name accepted launch facts, from the same set activation cites
    (3R.9f), not merely non-draft events: today an `oracle.rolled` would pass.
  - [ ] **9.0g The vow choices are optional until the review (D-200).** On the incident,
    `rollerId`, `participants` and `openingScene` become optional. Beat 11 accepts the words,
    the citations and the option's proposed rank, and beat 12 picks the rest. **Rank stays
    required** because it sizes the vow track. The review page confirms it or changes it,
    through the same revision. Readiness gains an
    `incident_vow_choices_missing` blocker, so launch waits for them. A revision command
    sets them, with the roller and participants checked as crew. The opening scene's
    location is stamped by the server as the starting settlement (D-168: "at the starting
    settlement"), never taken from the client, and activation writes the scene there. The
    fields become optional, which is additive, so no upcaster is owed.
  - [ ] **9.0h One move command swears the pending vow (D-201).** `invokeMove` gains a
    pending-vow mode for `Swear an Iron Vow`. It is refused unless the campaign is active
    with an unsworn `pendingVow`, the actor is its roller, and the roll is +heart. In one
    command it writes the vow's `track.created`: kind vow, the incident's words and rank,
    the roller as `characterId`, the participants, and a new optional `incidentId`. The
    move's own events follow. Effects apply to the roller alone through the existing
    `target: 'actor'` spec (A39). The `track.created` arm sets a new
    `launch.activation.vowTrackId` when its `incidentId` matches the pending vow. That is the
    field the guard reads, as 8.0h's `startingSettlementEventId` is, and a second swear is
    refused. The ordinary checked narration path narrates the result.
  - [ ] **9.0i Play knows where Session 1 opens (8.0j's defect, client side).** `play/scene.ts`
    and `SceneHeader` resolve a scene's location against the launch locations as well as
    entities. Assert that the opening scene shows its settlement by name.
  - [ ] **9.0j Milestone 1's inciting-vow command cannot write a launched campaign's vow.**
    `swearIncitingVow` and `POST /inciting-vow` still create a vow track from an incident
    with no roll. The session-one fixture uses them, so they stay until 10.1 rebuilds the
    fixtures. But on a campaign with a launch they would be a second path to the fact D-201
    owns. They refuse any campaign whose launch is open or activated, and keep serving a
    Milestone 1 campaign in play. 10.1 removes them with the fixtures.
  - [ ] **9.0k Play context knows the incident (D-183, a fourth time).** `renderState` reads
    no `launch.incident`. Until the vow is sworn, the Guide in play would not know why the
    campaign has begun. Render the accepted incident, and the pending vow with its roller and
    sharing crew, while it is unsworn. Assert that each arrives.
- [ ] 9.1 Establish the local NPC connection, role, rank, track, and sharing crew through
  the automatic strong-hit launch command. This is the connection half of Connection and
  Troubles, beside group 8's troubles. Offer Write, a field Roll from the declared NPC
  recipe, and Ask the Guide, reviewed field by field (beat 10). The screen says plainly
  that the automatic strong hit is the rules' outcome and that no die is rolled (D-167).
  Show the sharing crew as checkboxes, and the progress track with its participants.
  Transitions live in `connection-form.ts`, not the `.tsx`. The section stops being half
  built: `SECTION_ARRIVES_IN.connection_troubles` becomes null, and the `part` placeholder
  goes.
- [ ] 9.2 Extend incident proposals to cite complete accepted launch facts and oracle
  grounding; retain choose/edit/write/ask-again behavior. This is the Incident half of
  Incident and Launch. Ask the Guide for three incidents. Each shows its rolls as chips and
  names what it draws on (A37). The player chooses one, edits its words, asks again, or
  writes their own, and accepts. Accepting records the words, rank and citations only
  (D-200). Assert that the incident context carries the connection's NPC details and the
  starting settlement's first looks, which it gained after 3R.6.
- [ ] 9.3 Build the launch review and activation flow. The review page picks the
  swearing character, the sharing crew, the rank and the opening scene's title (beat 12,
  D-200), and saves them as an incident revision. The starting settlement is shown as
  where the scene opens. Blockers stay the server's (D-176). Launch is enabled only when
  readiness is ready, and the one-way confirmation is group 4's.
  `SECTION_ARRIVES_IN.incident_launch` becomes null; no section is a placeholder any more,
  so the catalogue test asserts zero pending. `review.ts`'s comment about the pickers
  belonging elsewhere is corrected.
- [ ] 9.4 Run the real `Swear an Iron Vow` move as Session 1's first beat, including actor,
  sharing crew, loaded dice in tests, result, effects, and checked narration. The play
  screen offers **Swear the inciting vow** while the pending vow is unsworn, opening the
  move composer on `Swear an Iron Vow` for the roller at +heart, with the vow's words,
  rank and sharing crew shown and the player's adds available. A server test with loaded
  dice asserts one formidable track shared by the three crew members, momentum changed on
  the roller only, and the checked narration committing.
- [ ] 9.5 Transition into the existing play screen without a reload-only state gap. After
  activation, play opens on the new scene, named at its settlement (9.0i), with the vow
  offered (9.4), from the same invalidated reads, with no reload. Assert in the browser.
  The launch workspace URL then says launch is closed, as 4.4 decided.

**Scope fences.** The Connection move family beyond the automatic strong hit stays
Reference (D-167). There is no amendment screen: the post-launch amendment commands exist
(3.9, 8.0k), and a screen for them is in no group 9 task. The recap and a scene-frame
narration for Session 1's opening scene are not beat 13's. The first narrated beat is the
vow's result. Rebuilding the fixtures on the launch belongs to 10.1.

### 10. Compatibility, acceptance, and packaging

- [ ] 10.1 Extract a reusable Lantern Wake campaign-launch fixture and rebuild the three
  existing fixtures on top of it as active campaigns.
- [ ] 10.2 Implement `golden-launch.test.ts` through HTTP routes with loaded dice and
  scripted providers, covering A22–A44.
- [ ] 10.3 Test manual/oracle completion with an unconfigured provider and proposal failure
  without blocking unrelated setup.
- [ ] 10.4 Exercise the full flow in the browser at 1280×720, including save/resume,
  keyboard focus, map alternatives, launch, and entry into play.
- [ ] 10.5 Run one live-provider launch pass for proposal validity, authority, provenance,
  latency, and token accounting; AI quality remains an eval/live sign-off, not a unit
  assertion.
- [ ] 10.6 Remove automatic production fixture seeding and update install documentation so
  a fresh deployment opens the complete new-campaign path.

---

## Verification

During implementation, run focused unit tests first. Before completing a task group:

```bash
npm test
npm run typecheck
npm run lint
npm run format:check
```

Database-backed groups require the real Postgres suite; a run that skipped those tests
does not verify the group. **A bare `npm test` skips them silently and still exits 0** — it
reports 83 files passed and 15 skipped, which is 305 tests, the whole launch command and
projection surface. A run only counts when `DATABASE_URL` is set and vitest reports **zero
skipped files**:

```bash
docker compose up -d db
DATABASE_URL=postgres://astrolabe:astrolabe@localhost:5433/astrolabe npm test
```

The final sign-off also requires:

- the golden launch through HTTP with stub providers and loaded dice;
- the existing golden session unchanged after its fixture is rebuilt on the launch;
- a no-provider manual/oracle launch;
- save, process restart, and resume from every section;
- cold projection from the complete log;
- browser and keyboard verification at 1280×720;
- one recorded live-provider pass, with no live AI dependency in CI.

---

## Implementation notes

Add notes here as each group lands. Record deviations and new approved decisions in the
design record first; do not silently change the acceptance story or task scope in an
implementation note.

- **Group 1 complete — `ded30a2`.** Added richer frozen truths, pure launch/readiness
  contracts, launch-character and shared-starship validators, challenge-rank vocabulary,
  and concrete launch recipe builders. This is additive: current M1 creation/truth flows
  still use their legacy contracts. Group 2 maps launch drafts into events; Groups 4–9
  adopt the new rules APIs. Do not remove the legacy Starship grant before Group 7.
- `validateLaunchReadiness` takes rules-owned draft types plus `STARFORGED`; the server
  must supply projected facts, never duplicate its checks. It treats missing values as
  blockers and explicit `leave_open`/`discover_in_play` as valid deferrals.
- Re-run `npm run generate --workspace @astrolabe/rules` after editing the truth adapter;
  the committed artifact intentionally includes nested truth tables and quest starters.
- **Group 2 (2.1–2.6) complete.** Added the typed Campaign Launch catalogue, draft and
  accepted-fact schemas, compatibility fields for existing characters, shared-starship,
  sector, connection, incident, activation, and amendment projection state. The legacy
  Milestone 1 events remain readable. `npm test` passed with Postgres-backed suites
  enabled; `npm run typecheck` and `npm run lint` passed. Tasks 2.7–2.8 remain open for
  the rules-aware readiness read model and their dedicated void/revision coverage.
- **Group 3 complete.** Added typed workspace/draft commands, complete truth decisions,
  launch crew, shared-starship proposal/roll/acceptance, sector graph and oracle commands,
  connection, incident context, atomic activation, and amendments. `launch-commands.test.ts`
  covers the principal command boundaries against Postgres; the full suite, typecheck, and
  lint passed. Group 2's projection/void suite (2.7–2.8) remains independently open.
- **Groups 1–3 reviewed, round 29. Group 3R added; 1.6 and 3.4–3.5, 3.7–3.9 reopened.**
  The review found one blocking defect and several contract drifts. Corrections to the two
  notes above, so the record is accurate:
  - Both claim the suite passed "with Postgres-backed suites enabled". That is true only of a
    run with `DATABASE_URL` set. The default `npm test` skips 305 tests and exits 0, so the
    claim as written does not distinguish a real run from a vacuous one. See Verification.
  - **Campaign Launch could not launch.** The workspace read layer never mapped the projected
    trouble facts into the readiness input, so `sector_trouble_missing` was permanent,
    `readiness.ready` was unreachable, and the activation command marked complete in 3.8 always
    refused. Root cause is the untyped `LaunchState` that task 2.7 exists to fix: every reader
    cast, so nothing failed to compile. Group 3 should not have completed over an open 2.7,
    and 3R sequences that correctly.
  - Group 1's declared recipes (1.3) are imported only by their own test. No task in groups 3–9
    owned wiring them into a command, so the "authoritative oracle roll" shipped as a
    client-names-the-oracle endpoint, against D-65 and D-166. 3R.5 adds the missing task.
  - D-171–D-175 were authored and marked Approved in the implementer's own commit rather than
    asked. They are ratified by D-179, with 1.1's wording corrected and D-174's six sector
    baselines left open for verification against the rulebook.
- **Group 3R started, round 29.** 3R.1 and 3R.8 are complete, and 3.8 is re-closed.
  Two blocking defects, not one. The first was the trouble mapping the review found. The
  second only appeared once 3R.1d drove every fact through its real command:
  `activateLaunch` opened its own transaction and handed the handle to `appendCommand`
  as `tx as unknown as Sql`, but a postgres.js transaction has no `begin` and
  `appendCommand` always opens one, so activation threw `TypeError` on every call.
  `AppendRequest.precondition` replaces that outer transaction, revalidating readiness
  inside the write transaction while the campaign row lock is held.
  **The lesson for the remaining backfill:** the rules-level matrix in 3R.8 would have
  passed before either fix, because it hand-builds its input and both defects were in the
  layers around the validator. Command-level tests are what close a task; a pure test
  beside them is not a substitute.
  Verified with Postgres: 101 files, 1102 tests, zero skipped files.
- `npm run format:check` fails on `eslint.config.js`, which predates this work and is
  untouched by it. Until that is fixed the fourth verification gate cannot pass cleanly.
- **3R.2 complete; 2.7 closed.** Typing `LaunchState` found five more defects, each one
  invisible while every reader cast: `starship.revised` projected a differently shaped ship
  from `starship.established`; `route.removed` matched the wrong id, so it removed nothing and
  its tombstone inflated the passage count against A31's baseline; `location.removed` left a
  tombstone shaped like nothing else in the record; `connection.established` recorded no
  `eventId`; `campaign.activated` dropped `pendingVow`. 3R.9a and 3R.9c are closed by the
  same change. Removing the tombstones made `mutates-state.test.ts` fail honestly for both
  removal types — they had only ever "mutated" by leaving the tombstone behind — so both got a
  real setup. `format:check` now passes; the `eslint.config.js` violation is fixed.
- **3R.3 and 3R.4 complete; 2.8 closed, 3.9 re-closed.** The launch catalogue's
  `voidable: true` described a capability `planVoid` denies, so all 25 types are now
  `voidable: false` (D-177) and `cascade.test.ts` asserts the planner agrees with the
  metadata. `launch.fact_amended` carries a typed replacement shaped like the fact it
  supersedes, and **`subject` is derived from the superseded event rather than accepted from
  the caller** — `supersedesEventId` already names the fact, so a second label could only
  contradict it, and a mismatch is now refused. `creation.proposed` carries a typed object
  per `targetKind` so D-166's field-level review has something to edit, and is projected into
  `launch.proposals` for A41's causality link — which made `mutates-state.test.ts` correctly
  demand its `mutatesState` flag flip. Truth and crew draft snapshots hold real shapes
  instead of `string[]`.
  The D-161 context assertions carry a positive control where one is possible; the
  `renderState` assertion says plainly that it is a regression guard, because `renderState`
  reads no launch state at all today.
  Verified with Postgres: 102 files, 1118 tests, zero skipped files.
- **3R.5 complete; the declared recipes are wired in.** Group 1.3 declared them and nothing
  imported them but their own test, because no task in groups 3–9 owned the wiring — the plan
  permitted the gap, which is why 3R.5 exists. `rollLaunchRecipe` materializes a recipe from a
  **typed selector rather than an oracle id**, so a caller cannot reach a table the rules did
  not declare in a recipe; that is the half of D-65 the previous endpoint had inverted. Each
  slot result becomes its own `oracle.rolled`, which is what a proposal cites (A41). The
  single-oracle roll stays for field-level Roll actions. `LAUNCH_EVENT_TYPES` is now derived
  from the launch schema module by identity, so a twenty-sixth launch event joins the set
  automatically instead of silently defaulting to voidable.
  Verified with Postgres: 103 files, 1125 tests, zero skipped files.
- **3R.6 complete; 3.7 re-closed.** `decideTruth` now records the option's `questStarter` —
  the schema field had existed since group 2 and was never written, leaving A25's inspiration
  half unimplemented. `renderSetup` carries the complete D-168 list: quest starters labelled
  as inspiration, an open truth stated as deliberately open rather than rendered blank, crew
  appearance/background vow/backstory from the launch fields rather than Milestone 1 hooks,
  typed settlement and planet detail, launch passages and off-map exits, the starting
  settlement, the shared starship, both troubles against what they trouble, and the local
  connection with who shares it. Launch locations previously rendered as bare names, because
  the renderer read `state.entities` and launch locations are not there.
  An option can now cite those facts: `drawsOn` gains a `launchFacts` category, omitted when
  empty so a proposal that cites none looks the same as one written before they existed.
  Each assertion names the specific fact it checks arrives, rather than testing the renderer
  in general — 3.7 was marked done while the context supplied truths and bare names.
  Verified with Postgres: 104 files, 1135 tests, zero skipped files.
- **3R.7c–g complete; 3.4 re-closed.** Two suites for the commands and routes group 3
  shipped without: `launch-aggregates.test.ts` covers the connection, the shared starship, the
  sector graph and the crew bounds; `launch-routes.test.ts` covers the launch routes over HTTP,
  which nothing had exercised.
  The connection test asserts the *absence* of `dice.rolled`, `oracle.rolled` and
  `move.invoked` — D-167 says the automatic strong hit neither rolls nor fabricates a roll it
  then calls automatic, and only an absence assertion can check that. It also pins one track
  with a participant list rather than one per character.
  Writing the route tests found that `drafts` and `sector-layout` are `PUT` while the rest are
  `POST`, and that a launch character with no background vow is refused by the **body schema**
  (400), not the command (422). Both are refusals; which one fires tells you where the rule
  lives, so the suite now asserts each at its own layer and adds a schema-valid,
  rules-invalid asset set for the 422 path.
  Verified with Postgres: 106 files, 1162 tests, zero skipped files.
- **Group 3R complete.** The remaining correctness fixes and the legacy guard:
  - **Passage identity (3R.9b).** The command compared `to` with `===`, so two off-map exits
    were never the same passage — an endpoint is an object and no two are the same reference —
    and a passage stated the other way round was a second passage. Both inflated the count
    against A31's baseline. Identity is now structural and undirected, per D-174.
  - **A revised route appended a second entry** rather than replacing the one it supersedes,
    which is the same double-count from the projection side. Found while fixing 3R.9b.
  - **Planet detail (3R.9d)** is three named optional fields instead of an open string map.
    Readiness reads exactly those keys, so a starting planet used to pass or fail on whether
    the client happened to spell them the way the validator did.
  - **Activation's citation (3R.9f)** now lists accepted launch facts rather than every event
    that is not a draft; it was sweeping in `oracle.rolled` and `ai.completed`. The set is
    derived from `AMENDABLE_SUBJECTS`, so what activation cites and what an amendment can
    supersede cannot drift apart.
  - **`readinessVersion` (3R.9g)** is a named constant with a documented meaning and a rule for
    bumping it, rather than a bare `1`.
  - **Launch commands stay single-writer (3R.9e).** Only activation locks, because only it must
    revalidate then append atomically; the rest serve one local user (D-02, D-52). Recorded
    rather than changed, and revisited at Milestone 4.
  - **The legacy guard (3R.10, D-178).** A campaign with a `session.began` refuses every launch
    command whatever its phase says. Seventeen near-copies of the phase check became one
    `requireLaunchOpen`, so the second condition could not be added to some and not others.
    The test asserts the phase is still `draft` when the refusal fires — otherwise it would not
    be testing D-178's condition at all.
  Verified with Postgres: 106 files, 1165 tests, zero skipped files. typecheck, lint and
  format:check clean.
  **Group 4 is unblocked.** Readiness reaches `ready`, activation works, `LaunchState` is
  typed, and every task group 3 claimed has a test behind it.
- **Group 4 complete.** The Campaign Launch workspace, and the Milestone 1 wizard retired.
  Three gaps below the client had to be closed first, and each is a decision rather than a
  detail:
  - **Foundation could not be incomplete (D-181).** Readiness had one foundation blocker,
    `campaign_name_required`, and `premise` appeared nowhere in `rules` — so the section
    reported `complete` the moment a campaign had a name, and beat 1 had nothing to show.
    `setLaunchFoundation` already refused a blank premise; readiness did not reflect the rule
    its own command enforced. D-181 adds the blocker and records the bound: the campaign
    settings never gate readiness, because they always have defaults.
  - **A43 had no signal to route on.** A Milestone 1 campaign projects `phase: 'draft'` yet
    must open in play. `launchClosedReason` is now one predicate with two callers, the
    command's refusal and the workspace read, and `launchOpen`/`closedReason` ride on the
    response. `launch-routes.test.ts` seeds the three real fixtures and asserts `GET /launch`
    answers 200 and closed: 3R.10b proved they reject launch *commands*, and nothing proved
    the launch *read* survived characters carrying the legacy Starship grant D-171 makes
    invalid for a launch.
  - **A form could contradict its own status (D-182).** Nothing clears a draft, so preferring
    the draft shows stale words beside a section reporting `complete` from the accepted ones,
    and preferring the accepted fact breaks A23 instead. `Accepted<T>` and each projected
    draft now carry `seq`, and the newer wins. Clearing the draft on acceptance was considered
    and rejected: right for Foundation, wrong for Crew, where one snapshot holds the whole crew.
  **Six sections are honest placeholders** naming the group that builds them. Two properties
  of them are deliberate and should survive: the next useful action still points at them,
  because the next useful thing genuinely is Truths; and one renders `Complete` if the server
  says so, because the status is about the campaign rather than about whether group 4 built a
  form. Client logic forcing a placeholder to display incomplete would be a D-176 violation
  in an honesty costume.
  **The wizard cluster is gone** — the four-step screen, its truths/sector/incident steps,
  their helpers and `api/campaign-setup.ts`. Those steps wrote Milestone 1 facts that launch
  readiness does not count, so a player could have completed every one of them and still been
  blocked. Two web test files went with the helpers they covered; both tested M1 contracts
  that groups 5, 8 and 9 replace outright. The M1 *server* routes are untouched — group 10
  owns their removal.
  **`ui/ErrorSummary`** is new shared ground: the package had no error summary, and no
  `aria-current`, `aria-invalid` or `aria-describedby` anywhere. One path yields both the
  summary link and the field id it moves focus to, so the two cannot drift.
  **4.3 is the shell.** The swearing character, sharing crew, rank and opening scene come from
  the accepted incident — `activateLaunch` takes only a `commandId` — so their pickers are
  9.3's and the review page shows them read-only.
  **Which URL was asked for is part of 4.4's decision, not just the answer.** `/campaigns/:id`
  means "open this campaign", so a closed one opens in play and says nothing about launch
  (A43). A launch URL asked for a workspace that no longer exists and is told so, because a
  bookmark that quietly rendered the play screen would be doing something other than what it
  says (D-160, beat 12). The first version routed both the same way, which left the closed
  panel unreachable and `closedReason` displayed nowhere — the review caught it, and the
  entry point is now an argument to `campaignDestination` so a test can tell the two apart.
  **Not verified, and 10.4 owns it:** the client activation path — the confirm dialog, the
  201, and the handoff into play — is unexercised, because no campaign can reach `ready`
  until groups 5–9 fill the sections. The server side is covered by 3R.7a and
  `launch-activation.test.ts`.
  Verified with Postgres: 111 files, 1211 tests, zero skipped files. typecheck, lint,
  format:check and the web build clean. Browser pass at 1280x720: beat 1 end to end including
  save, leave, reopen and a process-independent reload; D-182's edit-then-accept sequence,
  where the form and the dashboard agree on the accepted words; the review page refusing to
  launch with its blockers grouped and linked; a blank premise raising the error summary and
  its link reaching the field by keyboard alone; and the `session-1` fixture opening directly
  in play (A43).
- **Group 7 complete.** The shared starship, and the Milestone 1 per-character grant retired.
  Planning found the group-4-to-6 shape again: the aggregate was written and projected, and
  what would let a player build it with help or see where it came from was missing. Six
  questions were asked rather than assumed, recorded as D-190 to D-193, and one item (7.0j)
  was found after 7.0 had landed.
  - **Every module is `shared: true` in the imported data (D-190).** Read literally, D-164's
    exception described an empty set and contradicted beat 6. `shared` says who may use a
    module; ownership says whose slot holds it. Both hold.
  - **Installed modules are derived, not stored (D-191).** The ship's stored list could name
    a module nobody held and keep one after its holder was revised or removed.
    `installedModules` derives it from the crew in creation order. `module_owner_unknown` is
    unreachable by construction, and a module two members hold is a Crew blocker on the
    later one.
  - **The server owns the ship's id, asset and integrity (7.0a, 7.0b, 7.0j).** Integrity is
    read from the imported `integrity` meter, which the adapter had been dropping. The
    amendment path is held to the same contract, and it stamps the *current* integrity,
    because an amendment corrects words, not damage.
  - **Acceptance names the proposal (7.0c).** `acceptedProposal`'s lookup became
    `heldProposal`, generic over target kind, and the starship uses it. Crew keeps its
    `proposalCommandId` path because its proposal key changes from `draftId` to
    `characterId` on acceptance (D-185), so the fold is not keyed for it. Two mechanisms
    remain, and this note is why.
  - **A latent 500 on the launch crew route (found in 7.3).** `createCharacter` ran the
    Milestone 1 validator before the launch one, and the route does not map the error it
    throws. The Starship grant hid this for a command vehicle, but a bad stat array always
    hit it. A launch character is now judged by the launch validator alone.
  - **The fixtures still write the legacy grant, deliberately (D-193).** `createCharacter`
    no longer writes it, so `fixtures/legacy-character.ts` writes Milestone 1's
    `character.created` as it was. The built-in fixtures are what prove the compatibility
    path runs on real legacy data until 10.1 rebuilds them on a launched ship. In their
    world context the Starship moves from each sheet to one crew line, and the play screen
    shows it once, as the crew's.
  - **Browser.** Walked at 1280x720 on the dev stub: proposal, take, edit, accept (the
    server recorded `guide_proposal_edited` with three kept rolls), field roll, save, reload
    (the newer draft wins), error summary, ship panel, play card, drawer. **Not explained:**
    under the Vite dev server, a tab sometimes froze on first paint after HMR edits. The
    same pages never froze on the production build served from `:3000`, including all three
    fixtures reloaded in turn. Rendering the components in isolation, in the page and in
    Node, took milliseconds. Watch for it in 10.4; it is recorded here rather than guessed
    at.
  Verified with Postgres: 122 files, 1435 tests, zero skipped files. typecheck, lint,
  format:check and the web build clean.
- **Group 8 complete.** The starting sector, and the Troubles half of Connection and
  Troubles. Planning found the group-4-to-7 shape again, at greater size. The aggregate was
  written and projected. What would let a player build it with help, correct it, resume it,
  or see where it came from was missing: every command hardcoded `player_written`, the
  client supplied every id, five tables Chapter 2 rolls were in no recipe, two removal
  events had no command, the draft held two fields, and play context knew no sector. Four
  questions were asked before planning (D-194–D-197) and one during it (D-198). Item 8.0k
  was found after 8.0a–j had landed.
  - **The server owns every id in the sector (8.0a, 8.0f, 8.0k).** This covers the sector,
    each location, and each trouble, whose owner now names it. Amendments are held to the
    same contract, 7.0j's finding applied again.
  - **A settlement and its planet are one decision (8.0f).** One command writes both, the
    planet first. Acceptance judges the planet on its own, so a kept planet under a renamed
    settlement is unedited.
  - **One acceptance mechanism still.** A settlement proposal is keyed by its draft key, and
    acceptance names the key it was made under, so `heldProposal` resolves every path,
    whole-sector included (D-196). A trouble proposal is held under a prefixed target
    (`trouble:<settlementId>`), because the proposals fold keeps one proposal per target.
  - **A slot can yield several results (8.5, found in the browser).** A trouble read
    "Deliver" where the roll was "Deliver + Discovery", and the Guide was refused. The server
    matched rolls to slots by table id, and an embedded table's result has another table's
    id. `rollLaunchRecipe` now records each result's recipe and slot, fields D-142 already
    defined. The matcher takes a slot's every result, and the client reads them as one
    field. This was latent in the starship and character proposals from groups 6 and 7.
  - **The map (D-197).** The browser pass found that dragging one unsaved node moved the
    others: default positions were renumbered around a local move. They are now decided
    against the saved layout alone. Focus follows the pointer, so the arrow keys move what
    was just touched.
  - **A draft that outlives its acceptance.** Accepting a settlement writes its new id back
    into the form and saves the draft, so a reload shows it once. **Crew had the same defect
    (group 6), fixed here:** a crew member drafted and then accepted kept a draft entry with
    no `characterId`, so a reload showed them twice. A test reproduced it. The Crew screen
    now saves the draft again after an acceptance, as the sector does.
  - **Test setup, not an app defect:** the server indexes `packages/web/dist` when it
    starts, so after a web rebuild it serves the old asset names. The page then loads blank
    with no console error. Restart the server after each web build. **This is distinct from
    the freeze group 7 recorded**, which happened under the Vite dev server and never on the
    production build; this one happens only on the production build, after a rebuild.
  - **Browser.** Walked at 1280x720 on the dev stub, on the production build. Beat 7 went
    through the whole-sector path: the name and a settlement with its planet were accepted
    as `guide_proposal` with their rolls, and the other proposals survived a reload. The
    walk also covered a lone settlement proposal taken and accepted, the star rolled and
    accepted, and the map dragged and moved by keys, with the layout saved and reloaded.
    Passages and an off-map exit were added through the list. Beat 9 covered the start
    selected, first looks and trouble rolled, the Guide's reading taken and accepted, and
    the sector trouble in Connection and Troubles. **Not walked:** the no-provider path (A42)
    in the browser. The proposal actions are disabled from the same `useAiStatus` signal
    groups 5–7 use, and every Write and Roll path is independent of it, but 10.3 and 10.4
    own the proof.
  Verified with Postgres: 127 files, 1542 tests, zero skipped files. typecheck, lint,
  format:check and the web build clean.
