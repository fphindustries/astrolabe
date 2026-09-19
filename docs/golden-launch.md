# Astrolabe — Golden Launch (v1.0, Approved)

**Purpose.** The Golden Launch is Milestone 2's acceptance story and fun test. It turns a
blank campaign into the Lantern Wake campaign that the existing Session 1 fixture can
play. If Campaign Launch behavior does not support a beat here, it is outside Milestone
2 unless another acceptance criterion explicitly requires it.

Christopher is the only signed-in identity because authentication and multiplayer remain
deferred. He creates and controls three characters. The workflow is nevertheless shaped
around campaign, crew, shared-asset, participant, and actor identities so multiplayer can
arrive without replacing the launch domain.

Safety and content-expectation setup is not part of this milestone.

---

## Beat 1 — Begin a campaign

Christopher creates **Lantern Wake**, keeps Color narration, standard length, and the
default oracle-reroll cap. The campaign opens on a Campaign Launch home rather than the
play screen. Seven sections show their status and why they are incomplete. The campaign
is a draft and cannot yet begin a session.

He enters a short campaign premise, saves, returns to the campaign list, and reopens it.
The premise and section progress return exactly as saved. The draft is labelled as setup,
not campaign canon or session history.

*Tests:* A22, A23, campaign phase, typed saved drafts, server-derived readiness.

## Beat 2 — Choose the truths

Christopher works through all fourteen setting truths. The test deliberately mixes the
four paths:

- several official options are picked;
- several are rolled by the server;
- one is written in Christopher's own words;
- **Horrors** is deliberately left open for discovery in play.

At least one selected option requires a nested subchoice. Its subchoice is resolved and
saved as part of the truth. Each chosen option displays its quest starter separately as
inspiration; the starter is not added to canon. A rolled truth shows its oracle chip.
Christopher revises one accepted truth before launch, and the screen shows the current
answer with its earlier answer available in history.

The overview reads “14 of 14 decided,” counting the explicit open truth. An unanswered
truth would still block readiness.

*Tests:* A24–A26, A40–A42, nested data import, server dice, revision semantics.

## Beat 3 — Propose Vesna

Christopher describes **Vesna Kade** as a daring pilot and navigator who trusts charts
more than institutions. The Guide receives server-rolled name, callsign, and backstory
prompts and proposes a complete legal character.

Christopher keeps the proposed name, callsign, pronouns (`she/her`), appearance,
backstory, paths, stats, and background vow. He changes the final asset to **Sensor
Array**. The UI marks that field as player-edited and preserves the proposal's original
choice and reason. He adds a short signature-gear note and accepts.

Only acceptance creates Vesna. Her meters and momentum start from the rules, and her
background vow becomes her own vow track.

*Tests:* A27–A29, A41, complete proposal, edited acceptance, legal character validation.

## Beat 4 — Build Rook by hand

Christopher adds **Rook Ilari** using the step-by-step path without asking the Guide.
He assigns the established Golden Session stats and selects Veteran, Armored, and Gunner.
He writes Rook's appearance and background, records no pronouns, gives him a background
vow, and deliberately leaves some history mysterious. The form explains that an omitted
pronoun is not guessed and that “discover in play” is an explicit backstory state, not a
missing required field.

The server accepts the character without any AI call.

*Tests:* A27–A29, A42, manual completion, explicit mystery, no invented pronouns.

## Beat 5 — Build Juno with mixed assistance

Christopher starts **Juno Marr** manually, rolls for backstory inspiration, and asks the
Guide for help only with hooks and a background vow. He keeps Gearhead and Scavenger,
selects the Utility Bot companion as the final asset, edits one proposed hook, and accepts
the complete character. Juno's pronouns remain unrecorded.

The crew overview now contains three complete characters and still offers room for up to
three more. It explains that one complete character is the launch minimum; three is this
campaign's choice, not a global requirement.

*Tests:* A27–A29, A41–A42, field-level assistance, mixed provenance, crew limits.

## Beat 6 — Board the Lantern Wake

The Starship step shows one shared command vehicle, not one copy on each character.
Christopher asks for a whole-ship proposal. The server rolls Starship History and two
Starship Quirks; the Guide interprets them. Christopher names the ship **Lantern Wake**,
keeps the quirk that its timers and clocks are always slightly off, edits its appearance,
and accepts the ship with integrity 5.

Vesna's Sensor Array appears installed on the Lantern Wake and labelled as Vesna's
module. The Starship asset itself is shared by the crew; the module is not silently
converted into a shared character ability.

*Tests:* A30, A41–A42, shared asset, module ownership, ship proposal and revision.

## Beat 7 — Establish the Outlands sector

Christopher chooses the **Outlands** and gives the sector a name. The workspace shows the
region's required settlement and passage baselines. He asks the Guide for a complete
sector proposal, but reviews each proposed object separately.

The resulting sector includes three settlements:

- **Deepwater Anchorage**, the eventual starting settlement;
- **Varga Relay**, a remote deep-space station known to have gone dark;
- a third settlement that supplies the remaining Outlands context.

**Kessel Drift** is also established as a known non-settlement location: a slow river of
broken ice and old wreckage. At least one settlement is entered manually, one comes from
direct oracle rolls, and one begins as a Guide proposal. Each settlement records name,
location type, population, authority, and one or two projects.

Associated planets receive the shallow detail required at this stage. The flow does not
force Christopher to exhaustively generate unrelated worlds.

*Tests:* A31–A33, A41–A42, region rules, structured settlements, mixed authoring modes.

## Beat 8 — Draw the sector

The accepted settlements and Kessel Drift appear as movable nodes on the sector map.
Christopher arranges them, connects the relevant nodes with passages, and creates one
passage that exits toward another sector. The screen also provides a list/control view
that can create and inspect every connection without dragging.

Moving a node changes the presentation layout only. It does not change travel distance,
rank, or any other mechanic. Planets and an optional star appear in location details
rather than crowding the passage graph unless separately established as destinations.

Christopher saves, reloads, and sees the same layout and routes.

*Tests:* A23, A31, A34, accessible equivalent controls, non-mechanical layout.

## Beat 9 — Zoom in and introduce trouble

Christopher selects Deepwater Anchorage as the starting settlement. He rolls its first
look and settlement trouble, then edits the Guide's interpretation without changing the
rolls. He also rolls Sector Trouble and accepts an interpretation that can coexist with
the selected truths.

The planet associated with the starting settlement, if any, receives its additional
Chapter 2 details. Other planets remain shallow. Both troubles become accepted structured
facts, visible in the launch review and available to incident generation.

*Tests:* A33, A35, A41–A42, progressive detail, distinct settlement/sector trouble.

## Beat 10 — Make a local connection

The server rolls the declared character recipe for a local NPC. Christopher reviews the
Guide's interpretation, supplies or edits the connection's role and rank, and chooses all
three crew members as sharing the connection.

Campaign Launch records the rules-directed automatic strong hit. No dice animation or
fabricated roll appears. The NPC, connection role, rank, progress track, and participants
are visible. The rest of the Connection move family remains Reference.

*Tests:* A36, A41–A42, automatic result represented honestly, shared connection.

## Beat 11 — Choose the inciting incident

Christopher asks the Guide for three incidents. Before the call, the server rolls the
declared incident grounding for each option. Each proposal shows the rolls and names the
accepted truths, quest starters, backgrounds, vows, ship details, locations, troubles, or
connection facts it draws on.

Christopher chooses and edits the incident that becomes:

> Recover the flight recorder of *Meridian's Hope*.

The edited words are Christopher's accepted fact. The original proposal, its rationale,
and its grounding remain traceable. No vow track or session exists yet.

*Tests:* A37, A41–A42, complete launch context, proposal/review/commit boundary.

## Beat 12 — Review and launch

The review screen summarizes every launch section, identifies Deepwater Anchorage as the
start, and shows no blocking problems. Christopher chooses Vesna to swear the inciting
vow, marks Rook and Juno as sharing it, selects **formidable**, and approves the opening
scene **A beacon at Deepwater Anchorage**.

He confirms **Launch campaign**. In one authoritative transition the campaign becomes
active, Session 1 begins, and the scene is established. Returning to the launch workspace
is no longer offered; future changes use explicit amendments.

*Tests:* A38–A40, readiness revalidation, one-way activation, shared-vow participants.

## Beat 13 — Swear the first vow

The play surface opens on the new scene with the accepted incident ready. Vesna makes the
actual `Swear an Iron Vow +heart` move. The server rolls loaded dice in the automated
test, creates one formidable vow track shared by Vesna, Rook, and Juno, applies the
outcome's momentum effect to Vesna only, and sends the beat through the existing checked
narration path.

The result, math, participants, grounding, and state change appear together. When the
passage commits, ordinary play is available. This resulting campaign is the foundation
the Session 1 fixture continues from.

*Tests:* A38–A39, A44, server dice, one shared track, actor-only effect, checked
narration, transition into play.

---

## Compatibility checks

- A pre-Milestone-2 campaign missing launch facts opens on **Finish campaign launch** and
  preserves all existing truths, characters, entities, routes, and vows.
- The built-in `session-1`, `session-2-open`, and `golden-session` fixtures are rebuilt
  on a completed Lantern Wake launch and still open directly in play.
- The existing golden-session end-to-end test continues to pass.
- With no configured AI provider, Christopher can complete the same launch using manual
  entry, official choices, and server-rolled oracles; proposal controls explain why they
  are unavailable without blocking the workspace.
