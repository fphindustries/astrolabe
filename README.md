# Astrolabe

*Know where you are.*

A web app for playing **Ironsworn: Starforged** with a Generative AI Game Guide.

Players make the decisions. The AI turns those decisions into vivid narrative, runs the world, and grounds what it invents in oracle rolls. The app tracks every piece of game state, so nobody is ever unsure what's happening or what to do next.

Built first for solo play, then for a private table of up to six players in a shared session.

## Status

**Milestone 1 is complete. Milestone 2 is designed and ready to build.** The current milestone is Campaign Launch: the Chapter 2 Session 0 flow for truths, crew, shared starship, starting sector, local connection, inciting incident, and the opening vow. Scope: [docs/milestone-2.md](docs/milestone-2.md). Acceptance narrative: [docs/golden-launch.md](docs/golden-launch.md).

## Development

Requires Node 22+. Docker is needed only for the database.

```bash
npm install
npm test          # unit tests; database tests skip without a DATABASE_URL
npm run typecheck # sources and tests
npm run lint
```

To run the database-backed tests:

```bash
npm run db:up
export DATABASE_URL=postgres://astrolabe:astrolabe@localhost:5433/astrolabe
npm run migrate   # optional; the tests migrate their own schema
npm test
```

The `rules` package and the state projection are pure and need no database. Only the store does.

To run the app, copy `.env.example` to `.env` and fill in `ANTHROPIC_API_KEY`. The server's `dev`, `migrate` and `harness` scripts read it; a variable already set in the shell takes precedence. `npm test` does not read it.

```bash
npm run db:up
npm run db:seed                             # fixture campaigns (D-122, D-205): the golden launch just launched, "session 1" to play Beat 1 on, "golden session" to read the finished session
npm run dev --workspace @astrolabe/server   # :3000
npm run dev --workspace @astrolabe/web      # :5173
```

`npm run db:reset -- --yes` wipes the database back to the seeded fixtures. It drops and recreates the schema, then migrates and seeds, because the event log can't be deleted from. It removes **every** campaign, so without `--yes` it only lists what it would drop.

`npm run harness` plays the golden session into a throwaway schema and prints the state and log it produced. The same run is asserted by `packages/server/src/fixtures/golden-session.test.ts` (D-152).

## Installing and updating the container

`main` always has a built image: every push to it (a merge from `dev` included) triggers a GitHub Actions workflow that builds `Dockerfile` and pushes `ghcr.io/fphindustries/astrolabe:latest` (D-157). Installing or updating is a pull, not a build, and the steps below are the same on Windows and Linux — Docker itself is the only thing that differs.

### Prerequisites

- **Linux:** Docker Engine and the Compose plugin (`docker compose version` should print something). Most distributions' package managers install both together as `docker.io`/`docker-ce` plus `docker-compose-plugin`.
- **Windows:** [Docker Desktop](https://www.docker.com/products/docker-desktop/), with the WSL2 backend (the installer sets this up; it needs the Windows Subsystem for Linux, which the installer also offers to enable). Compose is bundled — no separate install. Run the commands below from PowerShell.

### First install

Clone the repo (or just copy `docker-compose.yml` — it's the only file the container needs):

```bash
git clone https://github.com/fphindustries/astrolabe.git
cd astrolabe
```

Create a `.env` file next to `docker-compose.yml` — a plain text file, the same on both OSes:

```bash
ANTHROPIC_API_KEY=sk-ant-...
POSTGRES_PASSWORD=choose-a-password   # read once, when the database volume is created
# ASTROLABE_PORT=3000                 # the host port the app is published on
# ASTROLABE_CLAUDE_MODEL=, ASTROLABE_PLAN_MODEL=, ASTROLABE_CHECK_MODEL=   # optional overrides
```

The repo is private, so the image is too: pulling it needs a login once, with a GitHub personal access token that has `read:packages`:

```bash
docker login ghcr.io -u <your-github-username>
```

Then, from the folder holding `docker-compose.yml` (Windows: PowerShell; Linux: any shell):

```bash
docker compose pull
docker compose up -d
```

This pulls the published image, starts Postgres, migrates, and serves the app at `http://localhost:3000` (or `http://<host>:3000` from another machine on a Linux server; change the port with `ASTROLABE_PORT`). **A fresh database starts empty** (D-170): the first thing you see is the campaign list, and **New campaign** opens Campaign Launch, which walks you from a blank campaign through truths, crew, ship, sector, connection and inciting incident to Session 1 and its first vow. It works with or without an Anthropic API key: without one, every Guide proposal says it is unavailable and every manual and oracle path still completes the launch. An existing database keeps every campaign it already has, including the example campaigns earlier versions seeded on first start (D-158, now retired). The `db:seed` and `db:reset` commands are for development and refuse under `NODE_ENV=production`. Postgres is published on `127.0.0.1` only. There is no authentication in Milestone 1, so keep the app on a trusted network. Campaign data lives in the `astrolabe-pgdata` volume; back it up with `docker compose exec db pg_dump -U astrolabe astrolabe`.

### Updating

Once `main` has what you want:

```bash
docker compose pull
docker compose up -d
```

The server migrates on start. On Windows, Docker Desktop needs to be running first; on Linux, the daemon is normally already running as a service.

### Building from source instead

Working on the app itself, or `main`'s image isn't reachable: `docker compose up -d --build` builds `Dockerfile` locally instead of pulling. This needs the repo cloned (not just `docker-compose.yml`) and takes longer, but otherwise works the same on both OSes.

## Documentation

| Document | What it is |
|---|---|
| [docs/design-record.md](docs/design-record.md) | The living design record: charter, decision log, authority model, rules scope, creation flows, play screen, architecture, and milestone plan |
| [docs/milestone-2.md](docs/milestone-2.md) | Current Campaign Launch scope, acceptance criteria, domain model, and ordered task breakdown |
| [docs/golden-launch.md](docs/golden-launch.md) | Milestone 2's scripted Session 0 acceptance and fun test |
| [docs/milestone-1.md](docs/milestone-1.md) | Completed Milestone 1 scope and implementation record |
| [docs/golden-session.md](docs/golden-session.md) | Milestone 1's scripted play and regression test |
| [AGENTS.md](AGENTS.md) | Repository guide and engineering boundaries for Codex and other coding agents |
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
