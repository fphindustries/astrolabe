# Astrolabe — Design Record

A living document. Each design round adds its approved decisions here, so nothing lives only in chat history. Status markers: **Approved**, **Draft**, **Open**.

*This project was called Forge Link during design rounds 1–5.*

---

## 1. Product Charter — v1.0 (Approved)

Astrolabe is an AI Game Guide for Ironsworn: Starforged. Players make the decisions, the AI turns them into vivid narrative and runs the world, and the app tracks everything so nobody is ever unsure what's happening or what to do next.

The AI Guide has three jobs: **narrate** (give player decisions narrative depth), **nudge** (help when the table stalls), and **track** (keep all state visible and current).

**First user:** Christopher, playing solo. **Target:** a private deployment for a few friends' tables, up to six players online together for a scheduled evening, with widely varying rules fluency.

**Guiding principles:** Players decide, and the AI adds depth. The app always has an answer to "what now?" Every development milestone ends in something playable. Solo comes first, but no decision may turn six-player play into a rewrite.

| Scope | |
|---|---|
| **In** | Single user controlling one or more characters, AI Guide, official Starforged rules, all state tracked digitally |
| **Designed for, not built yet** | Multiple human players, real-time sync (the data model records actor and character ownership from day one) |
| **Out** | Homebrew, public product, asynchronous play |

---

## 2. Decision Log

| ID | Decision | Round | Status |
|---|---|---|---|
| D-01 | Clean-slate build; nothing carried over from prior attempts. | 1 | Approved |
| D-02 | First user is Christopher solo; end goal is a private deployment for friends' tables. Public product is out of scope. | 1 | Approved |
| D-03 | Multiplayer means synchronous, scheduled sessions. Async play is out of scope. | 1 | Approved |
| D-04 | Up to six players. The UI must serve rules veterans and story-focused newcomers alike. | 1 | Approved |
| D-05 | Official Starforged rules only; no homebrew. | 1 | Approved |
| D-06 | For solo playtesting, one user may control multiple characters. | 2 | Approved |
| D-07 | Narration latitude setting (Minimal / Color / Full voice), with a campaign default and per-player override. | 2 | Approved |
| D-08 | On a miss, Pay the Price is offered with its rule options, with the oracle table roll as the highlighted default. The AI narrates the result but does not choose it. | 2 | Approved |
| D-09 | The AI grounds generated story content in oracle rolls (see §4). | 2 | Approved (details closed by D-65) |
| D-10 | Nudges happen only on request ("What now?") and take the form of suggested actions. | 2 | Approved |
| D-11 | Narration length scales to the dramatic weight of the moment, with a campaign-level adjustment. | 2 | Approved |
| D-12 | Sessions run 3–4 hours and open with an AI recap. | 2 | Approved |
| D-13 | The playtest uses a fresh campaign. | 2 | Approved |
| D-14 | Players can pick their move directly from a relevant-moves panel that is always available. AI move suggestions are optional help, not a required step. | 3 | Approved |
| D-15 | When a weak-hit complication has no menu, the player writes it or asks the AI for oracle-inspired options and picks one. | 3 | Approved |
| D-16 | For suffer moves, the AI proposes an amount based on the fiction and the player adjusts it before it applies. | 3 | Approved |
| D-17 | AI oracle rolls appear as chips under the narration they inspired. | 3 | Approved |
| D-18 | When an oracle result doesn't fit the fiction, the AI rerolls it visibly. The discarded result stays visible, struck through. | 3 | Approved (struck-through display is Draft) |
| D-19 | AI narration commits immediately; players correct it afterward rather than approving each passage. | 3 | Approved |
| D-20 | Roll results lead with the outcome; the full dice math opens in a popup. | 3 | Approved |
| D-21 | Astrolabe owns its internal rules schema. Datasworn's Starforged data is imported through an adapter and can be replaced if it ever constrains the app. | 4 | Approved |
| D-22 | Moves use three automation levels (Automated, Guided, Reference), assigned per move category (§5). | 4 | Approved |
| D-23 | Combat moves are Guided and ship in Milestone 2. | 4 | Approved (confirmed by D-76) |
| D-24 | Asset abilities are Guided. Only assets used by the playtest characters get full automation. | 4 | Approved |
| D-25 | The relevant-moves panel is rules-based, driven by explicit situation state. | 4 | Approved |
| D-26 | Players can manually override any meter, track, or clock; every override is logged. | 4 | Approved |
| D-27 | Players can void a roll and redo it; the voided roll stays in the log. | 4 | Approved |
| D-28 | The AI may set the odds on its own yes/no oracle questions about the world. | 4 | Approved |
| D-29 | Oracle rerolls are capped per result. The cap is campaign-configurable, default 2. | 4 | Approved |
| D-30 | Target: about 30 minutes to create a character. Characters are created before the session, not during it. | 5 | Approved (confirmed by D-77) |
| D-31 | Truths offer all three options per question: pick, roll, or write your own. No one-line-pitch generation. | 5 | Approved |
| D-32 | The starting sector is a list of locations and routes. A visual starmap comes in a later phase. | 5 | Approved |
| D-33 | Character creation is concept-first: the player describes a character, and the AI proposes the mechanical build for review. Every field stays directly editable. | 5 | Approved |
| D-34 | The AI proposes several inciting incidents, grounded in oracles and character backgrounds; the player may instead write their own. | 5 | Approved |
| D-35 | Lines and veils are deferred past Milestone 1. | 5 | Approved |
| D-36 | AI-generated portraits for characters, ships, and NPCs, for visual consistency. Deferred if they complicate the build. | 5 | Approved (later phase) |
| D-37 | If a chosen move's trigger doesn't match the described action, the AI notes it without blocking the roll. | 5 | Approved |
| D-38 | The project is named **Astrolabe** (previously Forge Link, renamed to avoid confusion with Crew Link). Tagline: *know where you are.* | — | Approved |
| D-39 | Design documentation lives in the project repository under `docs/`, versioned alongside the code. | — | Approved |
| D-40 | Three zones are always visible without scrolling: the scene header, the action composer, and the pressure rail (clocks, vows, progress). Only the narrative log scrolls. | 6 | Approved |
| D-41 | The centre column holds both a compact scene header and a flowing narrative log. | 6 | Approved |
| D-42 | Crew mini-cards show callsign, health, and momentum only. Everything else opens in a drawer. | 6 | Approved |
| D-43 | Scenes are explicit but low-ceremony: the AI proposes a scene change inline and the player accepts or ignores it. | 6 | Approved |
| D-44 | Desktop and laptop are the target. Tablet and mobile are out of scope for now. | 6 | Approved |
| D-45 | Dice rolls are animated. | 6 | Approved |
| D-46 | Visual direction follows Starforged's: dark surfaces, amber accents, similar typographic rhythm. No book art or layout is reproduced. | 6 | Approved |
| D-47 | React and TypeScript on the front end. | 7 | Approved |
| D-48 | PostgreSQL for storage. | 7 | Approved |
| D-49 | TypeScript on the server too, in a monorepo, so the rules engine and its types are shared with the client. | 7 | Approved |
| D-50 | Pluggable AI provider abstraction from the start, targeting Claude and OpenAI. | 7 | Approved |
| D-51 | A visible token counter per session. No hard budget or cap. | 7 | Approved |
| D-52 | No auth in Milestone 1 (single local user). Authentik via OIDC arrives with multiplayer. | 7 | Approved |
| D-53 | If the AI provider is unavailable, the session stops. Campaign state must survive intact. | 7 | Approved |
| D-54 | Narration starts streaming within 5 seconds. | 7 | Approved |
| D-55 | Docker packaging for production on a Linux home server. Local development runs natively. | 7 | Approved |
| D-56 | Milestone 1 is done when the golden session runs end to end with real rules data and real AI narration. Nothing beyond it ships. | 8 | Approved |
| D-57 | Build order runs rules engine → event log → creation flows → play shell → move flow → AI → polish (see `milestone-1.md`). | 8 | Approved (groups 3–5 resequenced by D-88) |
| D-58 | The build prompt targets Claude Code. Repository conventions live in `CLAUDE.md`. | 8 | Approved |
| D-59 | Milestone 1 hand-writes move automation only for the moves the golden session exercises (about eleven, including Swear an Iron Vow for campaign setup and Reach a Milestone for Beat 10). The rest of the Session, Adventure, Quest, Fate and Suffer categories, and all three Threshold moves, stay at Reference. This narrows §5's assignment table for Milestone 1 only. | 9 | Approved |
| D-60 | Milestone 1 ships the AI provider interface, the Claude implementation, and the stubbed provider the golden-session test needs. The OpenAI implementation moves to Milestone 2. D-50 is satisfied by the abstraction existing. | 9 | Approved |
| D-61 | When a golden-session beat contradicts the rules data, the rules data wins; the beat is amended. | 9 | Approved |
| D-62 | Aid Your Ally is a flag on a single move invocation, not a separately logged move. On a hit, effect targets resolve to the aided character. | 9 | Approved |
| D-63 | The Datasworn adapter targets version 0.0.10, consumed at build time as a development dependency. | 9 | Approved |
| D-64 | §7, §9, §10 and §12 are promoted from Draft to Approved. | 9 | Approved |
| D-65 | Oracle-grounded generation uses declared recipes held in the rules data, one per generated entity type. The AI requests a recipe by name, the server rolls the set, the AI interprets. Closes §4's open detail. | 9 | Approved |
| D-66 | Milestone 1's relevant-moves panel uses zero situation flags: a move is highlighted when its category is Session, Adventure, Quest, Fate, Suffer, or Threshold, verified as broadly applicable with no fictional-positioning requirement across every move in those categories. The situation-flag mechanism (moves setting/clearing flags other moves require) is real infrastructure with an empty Milestone 1 ruleset, first needed by Milestone 2's Enter the Fray. | 9 | Approved |
| D-67 | A Pay the Price result that maps to no suffer move applies no mechanical effect. The result grounds the AI's narration, and the AI may propose a clock or an entity under the authority it already has. | 9 | Approved |
| D-68 | A Pay the Price "roll twice" result recurses to a depth of two; a nested repeat is rerolled rather than recursed. Both results appear as their own oracle chips. | 9 | Approved |
| D-69 | The oracle reroll cap (D-29) counts per individual roll. | 9 | Approved |
| D-70 | The AI rerolls without interrupting the beat. The discarded chip stays visible and struck through with its stated reason, and the player may correct or reinstate it afterward under §3. | 9 | Approved |
| D-71 | Milestone 1 builds the scene data model and binds the scene header to it, but a session opens one scene and stays in it. AI-proposed scene transitions (D-43) move out of Milestone 1. | 9 | Approved |
| D-72 | The golden session runs against a committed fixture event log for session 1, so the recap is genuinely built from events. | 9 | Approved |
| D-73 | A corrected narration passage replaces the original in the rendered log, marked with an affordance that opens the original and the player's note. Both are retained as events. | 9 | Approved |
| D-74 | Momentum implements the full rule: maximum is 10 minus marked impacts, reset is 2 minus marked impacts, both projected from character state. | 9 | Approved |
| D-75 | Each AI call appends an event carrying its input and output token counts. The session token counter is a projection over those events, so it survives reload and resumption. | 9 | Approved |
| D-76 | D-23 confirmed: combat moves are Guided and ship in Milestone 2; Reference in Milestone 1. | 9 | Approved |
| D-77 | D-30 confirmed: characters are created before the session, on each player's own time. | 9 | Approved |
| D-78 | Momentum's fixed floor is −6, unaffected by marked impacts. Only the maximum (10 minus impacts) and the burn-reset value (2 minus impacts) are impact-reduced, per D-74. | 10 | Approved |
| D-79 | Momentum's impact-reduced maximum and reset value are floored at 0 rather than going negative, completing D-74's formula for the case D-74 didn't specify. | 10 | Approved |
| D-80 | Face Danger's weak-hit "make a suffer move (-1)" is not auto-chained to a specific suffer move — the text doesn't say which, and choosing between Endure Harm and Endure Stress is a fictional judgment the authority model already gives the player. | 10 | Approved |
| D-81 | Endure Harm's miss-branch compounding requirement (if health is already 0, also mark wounded or permanently harmed, or roll the oracle) is deferred past Milestone 1. Endure Harm's automation covers the common case; this rare compounding state waits for impact-marking to exist. | 10 | Approved |
| D-82 | Ask the Oracle's "pick two" is folded into the same five odds-tier options as "ask a yes/no question," rather than modelled as its own two-envisioned-options flow — mechanically it is the same "rate one likely and roll" action once the two options are stated. | 10 | Approved |
| D-83 | Voiding an event cascades over recorded causation: the causal subtree is computed and stored on the void event at write time, previewed before the player confirms, and the void is refused when a non-voided event outside the subtree references an entity or track introduced inside it. Void means "this shouldn't have happened"; amendment (A15, A16) means "this happened and was wrong." | 11 | Approved |
| D-84 | Void is limited to events in the current session. | 11 | Approved |
| D-85 | Token accounting is exempt from void: an AI call inside a voided cascade still counts toward the session token total (D-75), because the tokens were spent whatever the fiction now says. | 11 | Approved |
| D-86 | Entity amendment and void-reinstatement are both deferred past Milestone 1. They are coupled: D-70's reinstating of a discarded oracle roll implies amending the entity built from the surviving result. A9 requires only that the discarded chip stay struck through, so Milestone 1 ships display-only rerolls. This leaves §3's "correcting or retconning any AI-established fact" undelivered in Milestone 1 — narration correction (A15) and manual mechanical override (A16) ship; entity retcon does not. | 11 | Approved |
| D-87 | The starship is a display-only entity in Milestone 1. No golden-session beat mutates ship state — Beats 4 and 5 use the *Lantern Wake*'s sensors, which resolves as a character move. Whether a ship is an entity, an asset, or a character defers to Milestone 2. | 11 | Proposed |
| D-88 | The play-screen shell (5.1, 5.2) moves ahead of the creation and campaign-setup UI (3.2, 3.4, 4.2–4.5), because those have no React app to live in. D-57's build order otherwise stands, and the server-side halves of groups 3 and 4 keep their place ahead of it. | 11 | Approved |
| D-89 | Character creation assets are three slots, not a quota: **exactly two base paths**, plus one **final** asset which may be a module, support vehicle, companion, or another path — so a character ends with two or three paths. Deeds cannot be chosen at creation. The command vehicle (starship) is a default asset granted at creation and does **not** occupy a slot; its ownership (sole, shared, or another character's) is narrative only and is deliberately not modelled, having no effect on how the asset is used in play. Encoded as a data-driven spec in `rules` keyed to asset category IDs, each constraint traced to Datasworn's imported collection description where one exists (command vehicle p.55, paths p.56, deeds p.57) and cited to Rulebook pp.104–110 otherwise — those pages are outside the CC-BY subset, so they are cited, never quoted. | 11 | Approved |
| D-90 | Character-creation validation is pure and lives in `rules`, not on the server, because both sides need it: the client validates a field as it is edited, and the server revalidates on write because it is authoritative and a client is not to be trusted about the rules. One implementation, so the two cannot disagree. | 11 | Approved |
| D-91 | D-89's constraints **block** rather than warn: every one of them is explicit in the source, and the design record only warns where a rule is a recommendation. Two qualifications. Slot counts are judged only on a *complete* set, so a half-filled draft is in progress rather than invalid. And a path's `requirement` ("If you wield a bladed weapon…") gates *use*, not selection, so it is displayed and never blocks a choice — unlike a deed's, which gates acquisition. | 11 | Approved |
| D-92 | Starforged's starting stat array (3/2/2/1/1) and starting momentum (+2) are hand-authored constants in `rules`, cited to the rulebook rather than quoted, because Datasworn ships the data a character is made of but not the procedure for making one. Meter starting values and their bounds are read from the imported data, which does carry them. | 11 | Approved |
| D-93 | `vow.sworn` is dropped from the event catalogue: `track.created` with `kind: 'vow'` already says it. A vow carries the character who swore it (optional `characterId`), and `CharacterState.vowTrackIds` lists them, so a sheet need not scan every track in the campaign. | 11 | Approved |
| D-94 | Milestone 1 adds a new task, **5.0 HTTP read API**, ahead of 5.1: read-only endpoints (list campaigns, campaign state, narrative log page) that give `web` its first server round trip. Task numbers stay stable (D-88); command endpoints land with the first task that writes through them, not with 5.0. | 12 | Approved |
| D-95 | The read-model interfaces (`CampaignState` and its parts, `NarrativeLog`/`NarrativeBeat`/`NarrativeEntry`/`VoidMark`/`ResolvedNarration`) move from `server/src/projection/` to `shared/src/read-models/`, so `web` can import them. The folds that produce them (`project`, `buildNarrativeLog`) stay in `server/projection`, behind its existing purity lint fence — only the shapes move, not the logic. The client renders server-projected state in Milestone 1; it does not run the projector itself. | 12 | Approved |
| D-96 | `web`'s dependency set for the play-screen shell: keep `@tanstack/react-query` for server-state caching and cursor paging; drop `zustand` (never imported; local UI state is small enough for `useReducer`); add no router, CSS, or component-primitive library (a small hand-rolled route matcher, CSS Modules with custom-property tokens, and native `<dialog>`/`popover` cover Milestone 1's five routes and its drawers); add `eslint-plugin-react-hooks` as a dev dependency. | 12 | Approved |
| D-97 | Desktop/laptop (D-44) means a minimum supported viewport of **1280×720**. Rails never scroll (D-40); a rail section that would overflow at that size truncates to "+N more" and opens a drawer instead. Crew has layout priority in the left rail; clocks, vows, and progress tracks in the right. | 12 | Approved |
| D-98 | A crew mini-card's click opens the character drawer, as §8 already says. Choosing which character is acting (golden session Beat 3) is a control in the action composer (task 6.2), not the card click; the acting character is indicated on its card. | 12 | Approved |
| D-99 | The top bar's "connection status" (§8) means API reachability in Milestone 1, read from query error state — there is no realtime channel to report on (§9 defers it to Milestone 3). AI-provider availability is a separate indicator added by task 7.11 (D-53). | 12 | Approved |
| D-100 | Campaign setup (group 4) and character creation (3.2–3.4) are full-page routes outside the play screen, not drawers over it. D-30/D-77 already put creation before the session begins, so §8's "play never navigates away" doesn't apply to them. Opening a campaign lands on the play screen (A1), which is the campaign's home. | 12 | Approved |

---

## 3. Authority Model — v1.2

| Decision | Owner | Status |
|---|---|---|
| Character actions, intent, thoughts, vows, spending resources | Player | Approved |
| Which move applies | Player picks directly, or asks the AI for a suggestion with a stated reason | Approved |
| Dice results, outcome tier, mechanical effects with no choice involved | Rules engine | Approved |
| Choices written into a move ("choose one…") | Player | Approved |
| What goes wrong on a miss | Player picks the Pay the Price method (default: roll the table); AI narrates | Approved |
| Complications on weak hits where the move offers no menu | Player writes it, or picks from AI-offered options | Approved |
| Severity of suffer moves (e.g., how much harm) | AI proposes from the fiction; player adjusts | Approved |
| NPC motives and actions, including betrayal | AI | Approved |
| New factions, locations, NPCs | AI, grounded in oracle rolls | Approved |
| Ticking threat and tension clocks | AI, always visible with a stated reason | Approved |
| Random results for world content | Rules engine rolls; AI interprets and may visibly reroll a result that doesn't fit | Approved |
| Correcting or retconning any AI-established fact | Player, at any time | Approved |

---

## 4. Oracle-Grounded Generation — v1.1 (Approved)

When the AI Guide creates story content (NPCs, locations, derelicts, factions, complications, answers to open questions about the world), it grounds that content in Starforged oracle rolls instead of inventing freely.

**Why.** It fits the spirit of the game, which uses oracles as a creative partner. It also answers the fairness concern: the world's surprises come from dice, not from an AI's taste. And oracle combinations push stories away from the familiar tropes language models drift toward.

**How.** The AI never produces random results itself. It asks the rules engine for rolls, which the server generates, and then interprets the results. Each roll is logged as an event recording the table, the value rolled, and the result, and it links to the narration it inspired. The dice supply the result; the AI supplies the interpretation. Rolls appear as chips under the narration. If a result doesn't fit the fiction, the AI rerolls it, and the discarded chip stays visible, struck through.

The AI sets the odds on its own yes/no questions about the world. Rerolls are capped per individual roll (campaign setting, default 2); once the cap is reached, the AI works with the final result (D-69). The AI rerolls without interrupting the beat — narration commits, the discarded chip stays visible with its reason, and the player may correct or reinstate it afterward (D-70).

**How many rolls per beat.** Each generated entity type has a declared **recipe** in the rules data: a named list of oracle tables and the slot each one fills. `npc` rolls role, goal, first look, disposition and name; `derelict` rolls type, condition and first looks. The AI requests a recipe by name, the server rolls the whole set and returns the results with their slots, and the AI interprets them. Recipes make a beat's grounding reproducible, so the golden session can assert it (D-65).

---

## 5. Rules Scope — v1.1 (Approved)

**Rules source.** Astrolabe owns its internal rules schema. Datasworn's Starforged data (moves, assets, oracle tables) is imported into that schema through an adapter. Automation logic (effects, choices, chained moves) lives in Astrolabe's own layer, keyed to stable rule IDs. If Datasworn ever constrains the application, only the adapter changes, not the rules engine. Datasworn content is CC BY licensed, so the app includes an attribution screen.

**Automation levels**

| Level | What the app does |
|---|---|
| **Automated** | Rolls the dice, determines the outcome, applies effects that involve no choice, offers choices inline, and chains into follow-up moves |
| **Guided** | Rolls the dice and determines the outcome, highlights the matching outcome text, and gives quick controls so the player applies the effects |
| **Reference** | Shows the move text and rolls generically; the player updates state by hand |

**Assignment by milestone**

| Move category | Milestone 1 (golden session) | Milestone 2 | Later |
|---|---|---|---|
| Session, Adventure, Quest, Fate, Suffer | Automated | — | — |
| Threshold | Guided | — | Automated |
| Combat | Reference | Guided | — |
| Exploration, Recover | Reference | — | Automated (Sojourn stays Guided) |
| Connection, Legacy, Scene Challenge | Reference | — | Guided |

The Milestone 1 column is the *eventual* assignment for those categories. D-59 narrows what Milestone 1 actually builds: automation is hand-written only for the moves the golden session exercises, and every other move — including the Threshold moves — runs at Reference until a later milestone needs it. Datasworn supplies move text but no structured effects, so each Automated move costs a hand-authored effect specification; that cost is what the narrowing buys back.

**Assets.** Asset abilities are Guided. When a player picks a move, the abilities from their assets that apply to it are surfaced, and the player taps to apply them. Only assets used by the playtest characters get full automation.

**Relevant-moves panel.** Relevance is rules-based. It comes from explicit situation state that moves set and clear (for example, Enter the Fray puts the characters in a fight), plus categories that are always relevant. Relevance rules live in the rules data: each move declares the situation flags it requires, sets and clears. The full move list is always one click away. Milestone 1 needs none of that machinery exercised: every move in the Session, Adventure, Quest, Fate, Suffer, and Threshold categories has a broadly applicable trigger with no fictional-positioning requirement, so those six categories are always relevant and no situation flag is required until Milestone 2's Enter the Fray (D-66).

**Overrides and corrections.** Players can directly edit any meter, track, or clock. Every edit is logged with who made it, and it's shown differently from automated changes. Players can also void a roll and redo it. The voided roll stays in the log, visible and struck through *(display is Draft)*.

Voiding cascades over what the voided event caused — its effects, any clock it ticked, the narration it produced — and the player sees that set before confirming. It is refused when something outside that set has already been built on it, and it reaches back no further than the current session (D-83, D-84). The rule of thumb: **void is for "this shouldn't have happened," amendment for "this happened and was wrong."** Once the world has moved on, the correction path is a narration correction or a manual override, neither of which removes anything.

Milestone 1 delivers two of §3's three correction paths: narration correction (A15) and manual mechanical override (A16). Retconning an AI-established fact — amending an NPC's disposition, reinstating a discarded oracle result — is deferred (D-86). The authority in §3 is unchanged; only its delivery waits.

---

## 6. Campaign and Character Creation — v1.0 (Approved)

**Time budget.** About 30 minutes per character. Character creation happens before the session, on each player's own time, not as a shared activity at the table (confirmed by D-77 — see note below). Campaign setup (truths, sector, inciting incident) is a shared activity.

**Truths.** Each truth question offers three paths: pick from the book's options, roll for one, or write your own. All three are equally prominent.

**Starting sector.** A list of locations with the routes between them. Locations are created through oracle-grounded generation like any other world content. A visual starmap is a later phase.

**Character creation — concept-first.** The player writes a sentence or two describing the character they want. The AI proposes a complete build: paths and other assets, stat array, background vow, callsign, and backstory hooks, each with a one-line reason and grounded in oracles where it invents detail. The player reviews it as a whole, and every field remains directly editable, so a rules-fluent player can simply set their own stats and assets and skip the proposal. Nothing becomes canon until the player accepts it.

**Inciting incident.** The AI proposes several incidents, grounded in oracles and drawn from the characters' backgrounds and the campaign truths. The player picks one, edits it, or writes their own. The chosen incident becomes the first vow.

**Portraits.** AI-generated portraits for characters, ships, and NPCs, using a shared style so the campaign looks consistent. Deferred to a later phase.

**Deferred:** lines and veils, visual starmap, portraits, importing an existing campaign.

**Note on six-player setup.** At 30 minutes each, six characters created serially would consume an entire evening. Players therefore build characters independently between sessions, with the shared setup evening covering truths, the sector, the inciting incident, and crew bonds (D-77).

---

## 7. Golden Session — v1.0 (Approved)

**Purpose.** A scripted slice of ideal play, used as both the acceptance test and the fun test. If a feature doesn't appear in a golden session, it isn't MVP. The mechanics here are illustrative; exact move text and table results will come from the rules data.

**Setup.** Fresh campaign, session 2. Christopher plays three characters: **Vesna Kade** (pilot), **Rook Ilari** (ex-soldier), and **Juno Marr** (salvage tech), crewing the starship *Lantern Wake*. Active vow (formidable): recover the flight recorder of the colony ship *Meridian's Hope*. Narration latitude: Color. Momentum: Vesna +7, Rook +2, Juno +3.

### Beat 1 — Opening the session (0:00)
Christopher opens the campaign and clicks Begin Session. The AI gives a short "previously on…" built from last session's event log: the crew traced the recorder's beacon to a derelict relay station at the edge of the sector. The screen already shows the location, the vow and its progress, and every character's meters and momentum. Nothing has to be looked up.

*Tests:* recap from structured state, "you are here" at a glance, Begin a Session.

### Beat 2 — Framing the scene (0:02)
The AI frames the arrival. Before writing, it rolls derelict oracles through the engine, and the results appear as small oracle chips beneath the narration. The prose is rich because this is a scene opening. It ends on the stakes, without telling anyone what to do.

*Tests:* oracle-grounded generation, visible rolls, length scaled to the moment, no unrequested nudging.

### Beat 3 — A player decision gets depth (0:05)
Christopher selects Juno. The relevant-moves panel highlights the moves that fit the current situation. He picks Gather Information himself and types: "Juno jacks into the docking port and pulls the station logs." A player who typed the action without picking a move would get a suggestion instead, such as Gather Information +wits with a one-line reason. He rolls, and the result card reads **Weak hit, +1 momentum**, with the dice math a click away. The move doesn't specify the complication, so the app asks what complicates things. Christopher isn't sure and clicks **Give me options**. The AI offers three complications inspired by an Action + Theme roll, shown as chips. He picks one: the station was abandoned, yet one life-support circuit is still drawing power. The AI narrates at Color latitude: how Juno works, the fragmented evacuation logs, the humming circuit. Juno's thoughts are not narrated.

*Tests:* player-chosen move, relevant-moves panel, AI suggestion as fallback, outcome-first result with math on demand, weak-hit complication written by the player or chosen from AI options, narration within latitude.

### Beat 4 — The stall and the nudge (0:09)
Christopher isn't sure what's next and clicks **What now?** The AI offers three suggested actions. Each names the character best placed, the likely move, and why it matters now:
- Vesna traces the power draw with the *Lantern Wake*'s sensors (Gather Information).
- Rook secures the airlock before anyone goes deeper (Secure an Advantage).
- The crew pushes toward the station core (Undertake an Expedition).

Christopher combines two of them: Rook covers the airlock while Vesna runs the scan.

*Tests:* nudge only on request, suggestions anchored in current state, player free to remix suggestions.

### Beat 5 — Helping an ally, and a momentum decision (0:11)
Christopher picks Secure an Advantage for Rook and marks it as direct support for Vesna. The app applies Aid Your Ally and explains that the benefits go to her. Rook rolls a strong hit, so Vesna takes both benefits: +2 momentum and +1 on her next move. Vesna's scan is Gather Information +wits, with the +1 already applied. The result card reads **Weak hit**; clicking it shows an action score of 5 against challenge dice of 6 and 3. The app sees that Vesna's +7 momentum would beat both dice and offers: *"Burn momentum to upgrade to a strong hit? Momentum resets to +2."* Christopher accepts.

*Tests:* controlling multiple characters, benefits redirected to an aided ally, a rule the player didn't think to ask about surfaced when it matters, clear cost for a choice, outcome first with math on demand.

*(Amended under D-61: Secure an Advantage grants both benefits on a strong hit with no choice. The choice sits on the weak hit.)*

### Beat 6 — The world gets a new face (0:14)
On the strong hit, Vesna finds a heat signature: someone is alive aboard. The AI rolls character oracles for role, goal, first look, disposition, and name. One result contradicts what the evacuation logs established, so the AI rerolls it, and the discarded chip stays visible, struck through. An NPC card appears in the side panel, badged as AI-established. The AI narrates the first contact over comms, and the NPC's wariness comes straight from the disposition roll.

*Tests:* AI ownership of NPCs, oracle grounding, visible rerolls, automatic entity tracking, visible provenance.

### Beat 7 — A miss and the price (0:18)
Impatient, Christopher has Rook force the sealed bulkhead between the crew and the survivor. He picks Face Danger, chooses +edge by mistake, and rolls a strong hit. But Rook is forcing the bulkhead, not slipping past it, so Christopher voids the roll and redoes it with +iron. The voided roll stays in the log, struck through. This time it's a miss. The app presents Pay the Price with its options, with the table roll highlighted. He rolls, and the result says the character is harmed. The app chains into Endure Harm. The AI proposes −2 with a one-line reason: a ruptured conduit sprays sparks across Rook's arm, a serious burn. Christopher adjusts it to −1 because Rook's armor took the worst of it. Rook's health drops by 1, and the AI narrates the moment to match.

*Tests:* void and redo with a visible record, miss flow, player chooses the Pay the Price method, chained suffer move, AI-proposed severity adjusted by the player, narration that follows the adjusted outcome.

### Beat 8 — Pressure builds (0:20)
The AI creates a four-segment tension clock, "Station power failing," and fills one segment. The reason is shown with it: forcing the bulkhead tripped emergency load-shedding. The clock appears in the tracker panel, and hovering shows who ticked it and why.

*Tests:* AI ownership of clocks, every state change visible with its reason.

### Beat 9 — Corrections (0:22)
The narration calls Rook "shaken." Christopher disagrees: Rook is a veteran, annoyed rather than rattled. He flags the line, the AI rewrites that passage, and the event log records the correction. Nothing else changes. Christopher also remembers a ruling from last session that left Juno's momentum one too low. He edits it directly from +3 to +4, and the log records the manual override.

*Tests:* narration correction in a single action, narration respects player-owned character interiority, manual override of mechanical state, all corrections logged.

### Beat 10 — Ending the session (3:30)
Christopher clicks End Session. The AI writes a summary and lists open threads: the survivor's intent, the failing power, and where the recorder is. The app reminds him that Reach a Milestone is available if he judges one was earned. Everything is saved, and next session's recap will be built from it.

*Tests:* End a Session, open threads carried forward, vow progress under player control.

---

## 8. Play Screen — v1.0 (Approved)

**The stall test.** Three zones are always visible without scrolling, because together they answer "what now?":

- **Scene header** (centre, top) — where we are, what's at stake, what's unresolved.
- **Action composer** (bottom, full width) — relevant moves, the freeform "what do you do?" box, and the What now?, Ask Guide, and Oracle controls.
- **Pressure rail** (right) — clocks, vows, and progress tracks.

Only the narrative log scrolls. Everything else holds still.

**Layout**

| Zone | Contents |
|---|---|
| Top bar | Campaign, location, scene state, connection status |
| Left rail | Crew mini-cards, present NPCs, ship status |
| Centre | Scene header above a scrolling narrative log |
| Right rail | Clocks, vows, progress tracks |
| Bottom | Action composer |

**Scene header and narrative log together.** The log carries the prose, the rolls, and the oracle chips, and reads like a story. The header is a compact standing answer to "where am I and what's at stake," so nobody has to scroll back to find out. The AI maintains the header as play moves; it is not a second thing to write.

**Crew mini-cards** show callsign, health, and momentum. Spirit, supply, conditions, impacts, and assets open in a drawer on click. Six cards at this size fit the left rail without scrolling.

**Scenes, minimal ceremony.** Scenes are explicit in the data model, because clocks, recaps, and stakes all attach to them. In the UI they cost one click: when the situation changes, the AI proposes a new scene inline, and the player accepts, edits the title, or ignores it and keeps playing. There is no "start scene" wizard and no modal.

**Drawers, not navigation.** Clicking a crew card, an NPC, a clock, a vow, a move name, or an asset chip opens a drawer or popover over the play screen. Play never navigates away.

**Target devices.** Desktop and laptop. Tablet and mobile are out of scope.

**Dice.** Rolls are animated: the action die and the two challenge dice, distinguished as the book does. The animation is short enough not to slow a session and skippable *(Draft)*.

**Visual direction.** Starforged's direction, not its assets: dark surfaces, amber accents, strong display type for headings, and generous spacing. Progress tracks, clocks, condition meters, and momentum get purpose-built visual treatments. No art or page layout from the book is reproduced.

---

## 9. Architecture — v1.1 (Approved)

**Stack**

| Layer | Choice | Note |
|---|---|---|
| Front end | React + TypeScript, Vite | |
| Server | Node + TypeScript | |
| Database | PostgreSQL | |
| Packaging | Docker Compose for production; native for development | |
| Auth | None in Milestone 1; Authentik via OIDC with multiplayer | |
| AI | Provider abstraction over Claude and OpenAI, streaming | |

**Why TypeScript on the server.** The rules engine is the heart of the app, and both sides need it: the client to show relevant moves, valid choices, and modifiers, and the server to be authoritative over dice and state changes. In one language it is a single shared package with one set of types. Split across two languages, every rule type gets defined twice and drifts. The alternative worth weighing is ASP.NET Core, which is closer to daily work, at the cost of duplicating the rules model or pushing all rules logic server-side and making the UI chattier.

**Shape.** A monorepo with four packages:

- `rules` — the rules schema, the Datasworn adapter, move automation logic, and dice. Pure functions, no I/O, heavily tested. Shared by client and server.
- `server` — HTTP API, the event log, state projection, the AI provider abstraction, and prompt assembly.
- `web` — the React client.
- `shared` — event and DTO types.

**Server-authoritative state.** All dice and all state changes go through the server. The client renders state and sends intent. This is unnecessary for solo play and essential for multiplayer, and retrofitting it later would mean rewriting every interaction. It costs little now.

**Event log.** Every state change is an appended event: rolls, move resolutions, oracle rolls, clock ticks, canon entries, narration, corrections, and manual overrides. Current state is a projection over the log. The log gives recaps, AI grounding, void-and-redo, correction history, and later multiplayer sync, all from one mechanism.

Three properties make that work, and each constrains what may go in an event:

- **Projection is a pure fold.** No dice, no clock, no I/O, and no reads of the rules data. Anything non-deterministic — a die, an oracle row, an AI passage, a generated ID, a timestamp — is resolved once at write time and stored.
- **Events store resolved effects, not instructions to recompute them.** Which effects a weak hit produces comes from the automation layer, which changes when Datasworn is regenerated or a spec is edited. Replaying an old campaign must not produce different numbers, so the resolved deltas are recorded. Bounds that should track the current rules — momentum's maximum, for instance — stay derived. *Store facts, derive bounds.*
- **Events record causality.** Each carries the command that wrote it and, where one exists, the event that caused it. That is what makes cascading void computable and what groups a narrative log into beats rather than rows.

Detailed design: [`design-event-log.md`](design-event-log.md).

**Real-time.** Deferred with multiplayer, but the design assumes it: events already carry an actor, and the client already applies server-authored events. Adding a WebSocket later means broadcasting the events that are already being written, not restructuring state.

**AI provider abstraction.** One interface with streaming, structured output, and token accounting. Claude and OpenAI implementations behind it. Prompt assembly and context selection live above the interface, so switching providers does not change how context is built.

**AI outage.** If the provider is unavailable, the session stops. State is unaffected, because narration is an event like any other and everything else is already committed. A resumed session picks up from the last committed event.

---

## 10. Non-Functional Requirements — v1.0 (Approved)

| Requirement | Target |
|---|---|
| Narration begins streaming | Within 5 seconds |
| Dice, state changes, and panel updates | Immediate; never gated on the AI |
| Token accounting | Visible per session |
| State durability | No committed event is ever lost, including through an AI failure |
| Rules engine and dice | Unit tested, including outcome tiers, matches, momentum burn, and chained moves |
| Golden session | Runs end to end as an automated test |
| AI output | Validated against its schema; rejected and retried on failure. Quality is not unit tested |
| Deployment | One `docker compose up` on Linux |
| Accessibility | Keyboard navigable; meaning never carried by color alone |

---

## 11. Milestone Plan — v1.0 (Approved)

**Milestone 1 — the golden session.** Done when [`golden-session.md`](golden-session.md) runs start to finish against a real campaign, real rules data, and real AI narration. Scope and tasks: [`milestone-1.md`](milestone-1.md).

**Milestone 2 — combat.** Guided combat moves, fight state (position and progress), and a combat beat added to the golden session.

**Milestone 3 — the table.** Real-time multiplayer, Authentik authentication, player presence, spotlight, and Aid Your Ally across separate clients.

**Later, unordered.** Automated exploration and recovery moves, connections, legacy tracks, scene challenges, the visual starmap, AI-generated portraits, lines and veils.

---

## 12. Fun Budget — v1.0 (Approved)

Experience targets, binding alongside §10.

| Target | Proposed threshold |
|---|---|
| Declared intent → visible roll result | 3 interactions or fewer |
| Narration starts appearing | Within 5 seconds (streamed) |
| Routine-beat narration length | Short (roughly 60–120 words), longer for scene openings and dramatic outcomes |
| Answering "what can I do?" | Never requires leaving the play screen |
| State change visibility | Shown in the same beat that caused it, with a reason |
| Correcting AI narration | One action |
| Resuming a campaign | Recap plus "you are here" readable in under a minute |
