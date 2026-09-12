# Kickoff prompt for Claude Code

Paste this as the first message in a Claude Code session at `c:\repos\astrolabe`,
once `README.md`, `CLAUDE.md`, and `docs/` are committed.

---

Read `CLAUDE.md`, then `docs/design-record.md`, `docs/milestone-1.md`, and
`docs/golden-session.md` before doing anything else. The design record is the
source of truth; every approved decision has an ID (D-01, D-02, …).

We are building Milestone 1, which is defined as: the golden session runs end to
end with real rules data and real AI narration. Nothing outside that scope ships.

Before writing code, do three things:

1. Tell me anything in the design record that is ambiguous, contradictory, or
   insufficient to implement from. Do not resolve these yourself — list them as
   questions. Each answer will become a new decision ID.
2. Propose the specific libraries you want for the server, database access,
   validation, testing, and the client, with a one-line reason each. Keep the
   dependency count low.
3. Propose the internal rules schema from §5 in enough detail to see how a move,
   its outcomes, its automation level, and its rule IDs are represented, and how
   the Datasworn adapter maps onto it. This is the decision the rest of the build
   depends on, so it is worth getting right before anything else exists.

Then stop and wait for my response.

After that we work through the task list in `docs/milestone-1.md` in order, one
task at a time. Each task should leave the build working and the tests passing.
Reference decision IDs in commits. If a task tempts you to build something the
golden session does not exercise, stop and say so rather than building it.
