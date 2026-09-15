# Astrolabe

*Know where you are.*

A web app for playing **Ironsworn: Starforged** with a Generative AI Game Guide.

Players make the decisions. The AI turns those decisions into vivid narrative, runs the world, and grounds what it invents in oracle rolls. The app tracks every piece of game state, so nobody is ever unsure what's happening or what to do next.

Built first for solo play, then for a private table of up to six players in a shared session.

## Status

**Milestone 1, in build.** The golden session plays end to end; the visual design pass and keyboard work are under way. Scope and progress: [docs/milestone-1.md](docs/milestone-1.md).

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
npm run db:seed                             # fixture campaigns (D-122): "session 1" to play Beat 1 on, "golden session" to read the finished session
npm run dev --workspace @astrolabe/server   # :3000
npm run dev --workspace @astrolabe/web      # :5173
```

`npm run db:reset -- --yes` wipes the database back to the seeded fixtures. It drops and recreates the schema, then migrates and seeds, because the event log can't be deleted from. It removes **every** campaign, so without `--yes` it only lists what it would drop.

`npm run harness` plays the golden session into a throwaway schema and prints the state and log it produced. The same run is asserted by `packages/server/src/fixtures/golden-session.test.ts` (D-152).

## Running on a Linux server

One `docker compose up` (D-154). From a checkout, create a `.env` next to `docker-compose.yml`:

```bash
ANTHROPIC_API_KEY=sk-ant-...
POSTGRES_PASSWORD=choose-a-password   # read once, when the database volume is created
# ASTROLABE_PORT=3000                 # the host port the app is published on
# ASTROLABE_CLAUDE_MODEL=, ASTROLABE_PLAN_MODEL=, ASTROLABE_CHECK_MODEL=   # optional overrides
```

Then:

```bash
docker compose up -d --build
```

This builds one image holding the server and the built web client, starts Postgres, migrates, and serves the app at `http://<host>:3000`. The database starts empty: create a campaign in the app. Fixtures are for development, and `db:seed` and `db:reset` refuse under `NODE_ENV=production`. Postgres is published on `127.0.0.1` only. There is no authentication in Milestone 1, so keep the app on a trusted network. Campaign data lives in the `astrolabe-pgdata` volume; back it up with `docker compose exec db pg_dump -U astrolabe astrolabe`.

To update, pull and run `docker compose up -d --build` again. The server migrates on start.

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
