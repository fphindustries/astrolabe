# Astrolabe — Golden Session (v1.0, Approved)

**Astrolabe** is a web app for playing *Ironsworn: Starforged* with a Generative AI Game Guide. Players make the decisions, the AI turns them into vivid narrative and runs the world, and the app tracks every piece of game state so nobody is ever unsure what's happening or what to do next.

A **golden session** is a scripted slice of ideal play. It serves as both the acceptance test and the fun test for the design: if a feature doesn't appear in a golden session, it isn't part of the first version. Each beat notes what it tests.

The mechanics are illustrative. Exact move text and oracle results will come from the official rules data.

---

**Purpose.** A scripted slice of ideal play, used as both the acceptance test and the fun test. If a feature doesn't appear in a golden session, it isn't MVP. The mechanics here are illustrative; exact move text and table results will come from the rules data.

**Setup.** Fresh campaign, session 2. Christopher plays three characters: **Vesna Kade** (pilot), **Rook Ilari** (ex-soldier), and **Juno Marr** (salvage tech), crewing the starship *Lantern Wake*. Active vow (formidable): recover the flight recorder of the colony ship *Meridian's Hope*. Narration latitude: Color (the AI adds style and sensory detail to declared actions, but never voices a character's thoughts or dialogue). Momentum: Vesna +7, Rook +2, Juno +3.

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
