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
| A30 | The campaign has one shared command starship with integrity 5; its shared abilities are available to the crew, while an attached non-shared module retains its owning character. | 6 |
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

- [ ] 4.0 Prerequisites found while planning group 4:
  - the `premise_required` foundation blocker in `rules`, so Foundation is not complete the
    moment a campaign has a name (D-181);
  - `launchOpen`/`closedReason` on the launch workspace response, derived from the same
    predicate `requireLaunchOpen` uses, so 4.4's routing and the server's refusal cannot
    drift (D-178);
  - `seq` on accepted launch facts and on projected drafts, so a section's form and its
    status cannot disagree about which write was last (D-182);
  - a test that `GET /launch` returns 200 for the three built-in fixtures. 3R.10b proved they
    reject launch *commands*; 4.4 makes that endpoint the front door for every campaign open.
- [ ] 4.1 Replace the one-way creation wizard with the resumable section dashboard and
  server-projected completion/blocking status.
- [ ] 4.2 Add Save and continue, leave/reopen behavior, section navigation, and accessible
  error summaries without duplicating server readiness rules.
- [ ] 4.3 Add the ready review page and irreversible Launch campaign confirmation. The
  review page is the shell: the swearing character, sharing crew, rank and opening scene come
  from the accepted incident, so their pickers belong to 9.3 and `activateLaunch` takes only
  a `commandId`.
- [ ] 4.4 Route incomplete existing campaigns to Finish campaign launch and active
  campaigns to the existing play screen.

### 5. Truths

- [ ] 5.1 Build the fourteen-truth overview with answer/open status and progress.
- [ ] 5.2 Render choices, nested subchoices, quest starters, custom text, authoritative
  rolls, and revisions with complete provenance.
- [ ] 5.3 Add field help and full truth proposals without allowing the Guide to commit.
- [ ] 5.4 Verify keyboard navigation, screen-reader grouping, and no-color-only status.
- [ ] 5.5 Complete D-172's `row.text` transition: cut the legacy truth flow over to the
  richer schema's summary/description fields, so `row.text` stops doubling as the cleaned
  description. Owns the obligation D-179 left open; drop the task only by amending D-172.

### 6. Crew

- [ ] 6.1 Refactor character creation into a resumable step flow over the existing draft.
- [ ] 6.2 Add appearance, backstory/discover-in-play, required background vow, and gear.
- [ ] 6.3 Update concept-first proposals and field-level help to fill the same draft.
- [ ] 6.4 Add the one-to-six crew overview, completion status, revision, and removal before
  launch, retaining server-side rules validation.

### 7. Shared starship

- [ ] 7.1 Add the starship step with manual, roll, field-help, and whole-ship proposal
  paths for name, appearance, history, and one or two quirks.
- [ ] 7.2 Show integrity 5, the shared Starship asset, installed modules, their owners, and
  validation conflicts.
- [ ] 7.3 Remove the per-character command-vehicle grant and add compatibility projection
  for existing characters that carry it.

### 8. Starting sector

- [ ] 8.1 Add region and sector-name selection with the required baseline visible.
- [ ] 8.2 Build settlement creation and review for manual, oracle, and Guide proposals.
- [ ] 8.3 Add progressive planet details and optional star generation.
- [ ] 8.4 Build the accessible node-and-passage map, off-map exits, persisted presentation
  layout, and non-visual equivalent controls/list.
- [ ] 8.5 Add starting-settlement selection, first looks, settlement trouble, and sector
  trouble.
- [ ] 8.6 Add whole-sector orchestration that still reviews objects one at a time.

### 9. Connection, incident, and launch

- [ ] 9.1 Establish the local NPC connection, role, rank, track, and sharing crew through
  the automatic strong-hit launch command.
- [ ] 9.2 Extend incident proposals to cite complete accepted launch facts and oracle
  grounding; retain choose/edit/write/ask-again behavior.
- [ ] 9.3 Build the launch review and activation flow.
- [ ] 9.4 Run the real `Swear an Iron Vow` move as Session 1's first beat, including actor,
  sharing crew, loaded dice in tests, result, effects, and checked narration.
- [ ] 9.5 Transition into the existing play screen without a reload-only state gap.

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
