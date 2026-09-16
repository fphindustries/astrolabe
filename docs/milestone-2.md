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
| A31 | The chosen sector region determines the required settlement and passage baseline. Readiness enforces the baseline and permits additional custom content. | 7 |
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

- [ ] 1.1 Replace the truth-as-plain-oracle adapter shape with a truth schema that retains
  nested choices, quest starters, order, and provenance; regenerate the frozen artifact.
- [ ] 1.2 Add pure launch rules for campaign regions, required settlement/passage counts,
  allowed deferrals, one-to-six crew, and launch readiness, each traced to imported text
  or cited to the rulebook where the procedure is not in Datasworn.
- [ ] 1.3 Declare recipes for a starship, settlement, shallow planet, detailed starting
  planet, starting connection NPC, sector trouble, and inciting incident.
- [ ] 1.4 Extend character-creation validation for appearance, backstory state, background
  vow, and optional gear without moving campaign-aware checks into `rules`.
- [ ] 1.5 Add the shared-starship/module ownership model and pure validation.
- [ ] 1.6 Unit-test real imported data, traceability, recipe completeness, region baselines,
  character validity, and launch readiness.

### 2. Event catalogue and projections

- [ ] 2.1 Implement the approved Campaign Launch catalogue in `design-event-log.md`,
  including per-type payload schemas, revision chains, and introduction/reference
  metadata.
- [ ] 2.2 Add campaign phase and typed saved-draft events, payload schemas, metadata, and
  upcasters where existing payloads change.
- [ ] 2.3 Add truth deferral, nested-choice, and revision support.
- [ ] 2.4 Extend character facts compatibly and add the shared starship aggregate.
- [ ] 2.5 Add structured sector, settlement, planet/star relationship, map placement,
  off-map passage, starting-location, and trouble facts.
- [ ] 2.6 Add the connection aggregate/track participants and shared-vow participants.
- [ ] 2.7 Project launch status, drafts, ship, complete sector, connection, and
  participants without reading rules content inside projection.
- [ ] 2.8 Cover void containment, revision fallback, cold rebuild, incremental projection,
  narrative-log visibility, and per-type `mutatesState` metadata.

### 3. Launch commands and API

- [ ] 3.1 Add read endpoints for the Campaign Launch workspace and typed save/resume
  commands for each draft section.
- [ ] 3.2 Generalize truth commands to pick, roll, write, defer, resolve nested choices,
  and revise before launch.
- [ ] 3.3 Extend character proposal/creation commands and support one-to-six launch crew.
- [ ] 3.4 Add shared-starship proposal, roll, save, accept, and revision commands.
- [ ] 3.5 Add sector and settlement commands, including authoritative oracle rolls,
  planet/star relationships, node placement, passages, exits, and troubles.
- [ ] 3.6 Add the automatic-strong-hit starting connection command.
- [ ] 3.7 Extend incident proposals to the complete accepted launch context.
- [ ] 3.8 Add the atomic activation command: validate readiness, mark active, begin Session
  1, start the scene, and return the pending `Swear an Iron Vow` flow.
- [ ] 3.9 Add explicit post-launch amendment commands for launch facts.

### 4. Campaign Launch workspace

- [ ] 4.1 Replace the one-way creation wizard with the resumable section dashboard and
  server-projected completion/blocking status.
- [ ] 4.2 Add Save and continue, leave/reopen behavior, section navigation, and accessible
  error summaries without duplicating server readiness rules.
- [ ] 4.3 Add the ready review page and irreversible Launch campaign confirmation.
- [ ] 4.4 Route incomplete existing campaigns to Finish campaign launch and active
  campaigns to the existing play screen.

### 5. Truths

- [ ] 5.1 Build the fourteen-truth overview with answer/open status and progress.
- [ ] 5.2 Render choices, nested subchoices, quest starters, custom text, authoritative
  rolls, and revisions with complete provenance.
- [ ] 5.3 Add field help and full truth proposals without allowing the Guide to commit.
- [ ] 5.4 Verify keyboard navigation, screen-reader grouping, and no-color-only status.

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
does not verify the group. The final sign-off also requires:

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
