# Astrolabe — working agreement

Astrolabe is a web app for playing *Ironsworn: Starforged* with a Generative AI Game Guide. Players make the decisions; the AI narrates, runs the world, and grounds what it invents in oracle rolls; the app tracks all game state.

## Read before working

| Document | Why |
|---|---|
| `docs/design-record.md` | Source of truth. Charter, decision log (D-01…), authority model, rules scope, creation flows, play screen, architecture, NFRs |
| `docs/milestone-1.md` | Current scope, acceptance criteria, task list |
| `docs/golden-session.md` | The scripted slice of play that defines "done" |

The design record is authoritative. If code and the design record disagree, the design record wins until a decision is changed there explicitly.

## Rules of engagement

**Scope.** Milestone 1 is exactly the golden session. If a task tempts you to build something the golden session doesn't exercise, stop and say so rather than building it. Scope creep is the failure mode this project is guarding against.

**Decisions.** Every approved decision has an ID. Reference them in commits and PRs (`implements D-08`). If you hit a question the design record doesn't answer, don't guess — ask, and the answer becomes a new decision with an ID.

**Working order.** Follow the task list in `milestone-1.md` in order. Each task should leave the build working and the tests passing.

## Non-negotiables

These come from the design record. Violating them means the design was misunderstood, not that a shortcut was taken.

- **The player decides; the AI narrates.** The AI never chooses a character's action, intent, thoughts, emotions, or resource spending. It owns NPCs, new world entities, and clocks. (§3)
- **The AI never generates a random result.** When it needs one, it calls the oracle API; the server rolls; the AI interprets. (§4)
- **The server is authoritative.** All dice and all state changes go through the server. The client sends intent and renders state. (§9)
- **Everything is an event.** State changes are appended to the log; current state is a projection. Never mutate projected state directly. (§9)
- **Dice and state never wait on the AI.** Mechanics resolve immediately; narration streams in after. (§10)
- **Rules data stays separate from rules logic.** Datasworn is imported through an adapter into Astrolabe's own schema. Automation logic is keyed to stable rule IDs. (§5)
- **Every automated rule behaviour is traceable** to the rule entry that triggered it.

## Stack

React + TypeScript (Vite) · Node + TypeScript · PostgreSQL · Docker Compose for production on Linux.

Monorepo packages:

- `rules` — rules schema, Datasworn adapter, move automation, dice. Pure functions, no I/O, heavily tested. Shared by client and server.
- `server` — HTTP API, event log, projections, AI provider abstraction, prompt assembly.
- `web` — React client.
- `shared` — event and DTO types.

Library choices beyond this are open; propose and justify rather than assuming.

## Testing

- `rules` gets real unit tests: outcome tiers, matches, momentum burn, chained moves.
- The golden session runs as an end-to-end test with a stubbed AI provider.
- AI output is validated against its schema and retried on failure. AI quality is not unit tested.

## Attribution

Rules content derives from *Ironsworn: Starforged* by Shawn Tomkin under CC BY 4.0, imported via Datasworn. The app must ship an attribution screen. Do not reproduce art or page layout from the book.
