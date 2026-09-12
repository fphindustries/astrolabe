# Astrolabe

*Know where you are.*

A web app for playing **Ironsworn: Starforged** with a Generative AI Game Guide.

Players make the decisions. The AI turns those decisions into vivid narrative, runs the world, and grounds what it invents in oracle rolls. The app tracks every piece of game state, so nobody is ever unsure what's happening or what to do next.

Built first for solo play, then for a private table of up to six players in a shared session.

## Status

**Design phase.** No code yet. Requirements are being worked out round by round before development starts.

## Documentation

| Document | What it is |
|---|---|
| [docs/design-record.md](docs/design-record.md) | The living design record: charter, decision log, authority model, rules scope, creation flows, play screen, architecture, and milestone plan |
| [docs/golden-session.md](docs/golden-session.md) | A scripted slice of ideal play, used as both the acceptance test and the fun test |
| [docs/milestone-1.md](docs/milestone-1.md) | Current scope, acceptance criteria, and task breakdown |
| [CLAUDE.md](CLAUDE.md) | Working agreement and repository conventions for Claude Code |

The design record is the source of truth. Every approved decision carries an ID (D-01, D-02, …) so code, issues, and commits can reference it.

## Stack

React + TypeScript (Vite) · Node + TypeScript · PostgreSQL · Docker Compose for production on Linux.

## Design principles

- Players decide. The AI adds depth.
- The app always has an answer to "what now?"
- Every milestone ends in something playable.
- The AI never invents random results. The server rolls; the AI interprets.

## Attribution

Rules content derives from *Ironsworn: Starforged* by Shawn Tomkin, used under CC BY 4.0, imported via the [Datasworn](https://github.com/rsek/datasworn) data set. This project is unofficial and unaffiliated with Tomkin Press.
