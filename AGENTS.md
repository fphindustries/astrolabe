# Astrolabe agent guide

This is the repository entry point for Codex and other coding agents. `CLAUDE.md`
remains the original working agreement; its product constraints still apply. Use this
file for the current codebase map, engineering boundaries, and verification workflow.

## Start with the design

Before substantive work, read the parts of these documents that govern the change:

1. `docs/design-record.md` — product charter and approved decisions (`D-…`); this is
   the product source of truth.
2. `docs/design-event-log.md` — authoritative event-store and projection design for
   changes involving state, persistence, voiding, corrections, or read models.
3. `docs/milestone-2.md` — current Campaign Launch scope, acceptance criteria, domain
   model, and ordered implementation plan.
4. `docs/golden-launch.md` — Milestone 2 acceptance narrative and intended Session 0
   experience.
5. `docs/milestone-1.md` — completed scope and detailed implementation notes.
6. `docs/golden-session.md` — the Milestone 1 regression narrative and play experience.
7. `CLAUDE.md` — the original compact working agreement.

Milestone 1 is complete. Treat its behavior and golden-session coverage as a baseline
to preserve. Milestone 2 is the approved current scope; its boundary is the Golden
Launch, not every future capability mentioned in the design record. Combat is
Milestone 3, multiplayer is Milestone 4, and safety/content-expectation tools are
deferred. If a requested change raises a product question not answered by an approved
decision, surface the gap and ask; do not silently invent a decision or promote a
Proposed/Draft item to Approved. When an approved decision changes, update the design
record and reference its decision ID in the implementation notes and commit/PR
description.

## Product invariants

- The player decides; the AI narrates. Never give a player character an undeclared
  action, thought, emotion, intent, motivation, history, values, or disposition.
- The AI never invents random results. It asks for declared oracle recipes; the
  server rolls and records them; the AI interprets the results.
- The server owns dice and state. The browser sends intent and renders server-authored
  state.
- Every state change is an appended event. Current state is a projection, never a
  mutable source of truth.
- Mechanics commit without waiting for AI output. Narration follows asynchronously,
  and AI failure must leave committed state intact.
- Rules data and rules logic remain separate. Datasworn enters through the adapter;
  automation is keyed by stable internal rule IDs.
- Every automated rule behavior is traceable to the rule text or an explicit citation.
- Preserve attribution. Do not reproduce Starforged book art, prose outside the
  licensed data, or page layout.

## Repository map and dependency boundaries

- `packages/rules` — pure rules schema, frozen Datasworn data, dice, automation,
  character validation, relevance, and oracle recipes. It has no runtime dependencies,
  I/O, ambient clock, or ambient randomness.
- `packages/shared` — Zod event/request schemas, inferred wire types, IDs, metadata,
  and read-model shapes shared by server and client. It may depend on rules vocabulary;
  rules must not depend on it.
- `packages/server` — Fastify API, command layer, append-only Postgres store, pure
  projections/read models, AI provider adapters, and prompt/context assembly.
- `packages/web` — React/Vite client. It renders shared read models and invokes command
  endpoints; it does not project events or author state.
- `docs` — design decisions and implementation history, not optional background prose.

Application code must import `@astrolabe/rules` and `@astrolabe/shared` from their
package roots. Relative imports into another package's internals are for that package's
own tests only. Keep the existing dependency direction; do not create server/web or
web/server coupling.

## State and event changes

The event log is the architectural center of the application.

- Put campaign-aware validation and event construction in
  `packages/server/src/db/*-commands.ts`. Route handlers parse the wire request, choose
  the server-owned actor, call a command, and translate its result; they do not append
  events or implement game rules directly.
- Do not call `appendCommand` from route handlers. Do not accept `actor`, `causedBy`,
  timestamps, die results, server-minted IDs, or other server-owned facts from a
  client. Command IDs are deliberately client-minted for idempotency; campaign creation
  also client-mints its campaign ID so a retry cannot create a duplicate. Do not extend
  those exceptions without an explicit design decision.
- Resolve all nondeterminism at write time. Events store rolls, timestamps, IDs, oracle
  rows, AI output, and resolved effects. Projection must never recompute a historical
  effect from current rules content. The rule is: store facts; derive bounds.
- `packages/server/src/projection` is a deterministic, I/O-free fold. Preserve its lint
  fence: no database, provider, process environment, clock, randomness, generated IDs,
  or versioned `STARFORGED`/`ATTRIBUTION` data.
- Campaign state is bounded and projected whole; the narrative log is unbounded and
  paged. Voided events disappear from projected state but remain visibly marked in the
  log.
- Campaign Launch draft snapshots and unaccepted Guide proposals are durable but
  non-canonical. Keep them out of narration, recaps, and ordinary world context.
  Accepted facts are canonical events linked to their provenance; revisions append
  rather than overwrite.
- Launch readiness and blocking reasons are server-derived. Campaign phase only moves
  `draft` → `ready` → `active`; activation is irreversible and creates Session 1 plus
  its opening scene before the actual `Swear an Iron Vow` move.
- Model one shared command starship per campaign crew. Do not duplicate the Starship
  as a character asset; character-selected modules retain their character owner.
- A new event type normally requires coordinated changes to its Zod payload schema,
  `PAYLOAD_SCHEMAS`, `EVENT_TYPE_META`, payload versioning/upcasting as needed, the
  state projector and/or narrative read model, fixtures, and exhaustive tests. Let
  TypeScript's failed exhaustive switches guide the full change.
- `EVENT_TYPE_META` owns event semantics such as `voidable`, `mutatesState`, entity
  introductions, and references. Do not duplicate these judgments elsewhere.
- Database migrations are immutable once added. Add the next zero-padded migration
  module and append it to `MIGRATIONS`; never rewrite an applied migration.

## Rules and AI boundaries

- Keep `packages/rules/src` pure. Dice accept an injected `RandomSource`; never use
  `Math.random`. Constraints that need campaign state belong in a server command, not
  in rules.
- Do not hand-edit `packages/rules/src/generated/starforged.json`. Change the adapter
  or pinned Datasworn input, run
  `npm run generate --workspace @astrolabe/rules`, and commit the regenerated artifact.
- Every new `MoveAutomation` effect needs a `clause` that is a verbatim substring of
  the imported move text, and the spec must be registered in `MOVE_AUTOMATION_SPECS`
  so traceability tests cover it.
- Prefer real frozen rules data in rules tests over hand-built substitutes.
- Prompt/context assembly under `packages/server/src/ai/context` is pure and
  provider-independent. It receives projected state/events and builds a request; it
  does not perform I/O or use a raw chat transcript as state.
- Keep provider calls behind `AiProvider` and inject providers, planners, checkers, and
  RNGs. Structured output must be schema-validated and follow the existing retry and
  accounting path. Every AI call's token use is an event, even if its fictional result
  is later voided.
- Default development and automated tests to `StubProvider`. Do not make live,
  token-spending AI calls unless the task explicitly calls for live verification and
  credentials are available.

## TypeScript and web conventions

- The repository is ESM on Node 22+. Use `.js` extensions in relative TypeScript
  imports. Use `import type` (or an inline `type` modifier) for type-only imports.
- Strict options include `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
  Preserve readonly data shapes and omit optional keys instead of assigning
  `undefined` when the type does not allow it.
- In shared boundaries, Zod schemas are the source of truth and types are inferred from
  them. The server validates client input even when the UI already validated it.
- Organize web code by feature. Use `app` for routing/providers, `api` for transport,
  and `ui` only for cross-feature primitives. Prefer one component per file, a sibling
  CSS Module, and pure display/model helpers in adjacent `.ts` files with DOM-free tests.
- Keep server state in TanStack Query and explicitly invalidate it after commands.
  Keep transient interaction state local or in the existing play UI reducer/context.
- Preserve the hand-rolled router, small fetch wrapper, native dialog/popover
  primitives, CSS Modules, and shared design tokens unless an approved decision changes
  those choices.
- The supported viewport is 1280×720 or larger. The scene header, action composer, and
  pressure rail remain visible; only the narrative log scrolls. Meaning must not depend
  on color. New controls need semantic elements, visible focus, and keyboard operation;
  drawers/popovers must take and restore focus.

## Tests and verification

Add or update a colocated `*.test.ts` for behavior changes. Test pure logic at the
lowest layer that owns it, then add command/HTTP coverage for cross-layer behavior.
The golden-session test is the regression boundary for Milestone 1. The golden-launch
test is the acceptance boundary for Milestone 2 and must cover both stub-AI mixed
authoring and completion without an AI provider.

Use focused Vitest runs while iterating, then run the applicable repository checks:

```bash
npm test
npm run typecheck
npm run lint
npm run format:check
```

`npm test` intentionally skips Postgres integration tests when `DATABASE_URL` is not
set. A green run with skipped database suites is not database verification. For store,
migration, command, HTTP, fixture, or golden-session changes, start Postgres with
`npm run db:up`, set
`DATABASE_URL=postgres://astrolabe:astrolabe@localhost:5433/astrolabe` in the shell,
and rerun the relevant tests or the full suite. Tests create isolated schemas and clean
them up.

For UI changes, also run the server and Vite client with the stub provider, inspect the
affected flow at 1280×720, and exercise keyboard focus and scrolling behavior. Do not
use `db:reset` casually: it deletes every local campaign and requires `--yes`.

Report which checks ran, whether database-backed suites actually executed, and any
checks that remain unrun.
