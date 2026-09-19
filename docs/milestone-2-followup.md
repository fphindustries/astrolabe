# Milestone 2 follow-up — focus and disabled controls

Milestone 2 is complete (`milestone-2.md`, "Milestone 2 complete"). Its keyboard pass (10.4)
found three things and fixed none of them by design. This document scopes two: **(a)**
disabled launch buttons that lose or hide focus, and **(b)** focus that starts at the top of
the page after Create campaign and after activation. The third, the unexplained tab stall,
is an investigation and is not scoped here.

This is not Milestone 3, and it pulls nothing in from it. It changes no rules, events,
routes or projections, so `design-event-log.md` is untouched and the golden launch and golden
session must pass unchanged. D-208 and D-209 are approved and in `design-record.md` (round 39).

## What is wrong

### (a) Native `disabled` on launch buttons

`launch/` has 59 native `disabled` sites (60 with `NewCampaignScreen`). They are two
different problems:

| Kind | Sites | Symptom |
|---|---|---|
| **Busy**: disabled only while a request is pending (`saveDraft.isPending`, `roll.isPending`, `accepting`, …) | ~26 | Pressing the button disables it under the focus. Focus falls to the document, and a screen reader loses its place. This is the finding 10.4 recorded. |
| **Gated**: disabled until the form is valid or the Guide is available (`request === null`, `!aiAvailable`, `region === ''`, `!configured`, a required reason blank) | ~34 | The button is skipped in the tab order, so a keyboard user never reaches it and never hears why it does nothing. Focus is not lost, but the control and its reason are invisible to them. |

`TruthCard`, `TruthProposalPanel` and `LaunchReviewScreen` already do it properly:
`aria-disabled`, a guarded click, and `aria-describedby` on the reason. Each carries a comment
saying why. The other 59 predate that pattern. Three CSS modules already style
`[aria-disabled='true']`. `CrewSection.module.css` still styles `:disabled`, which
`aria-disabled` never matches.

### (b) Focus on arrival

`useFocusOnViewChange` (`ui/focus.ts`) moves focus to the heading when the launch view
changes, but skips the first render: "the browser's own starting point is right". That is
true for a full page load and false for an in-app navigation. Two navigations hit the gap:

- **Create campaign** → `navigate(launchOverviewPath)`. The workspace mounts fresh, so the
  first-render skip applies. Before it mounts, `CampaignHomeScreen` shows a heading-less
  `Opening the campaign…`.
- **Launch campaign** → `navigate('/campaigns/:id')` → `PlayScreen`. The confirm dialog and its
  button unmount, and focus falls to the document. **`PlayScreen` has no `<h1>` at all**
  (`grep '<h1' play/` finds none), so there is nothing to move focus to yet.

The same gap exists on any `Link` between the five top-level screens, so this is a class, not
two cases.

## Scope

### In

**1a. Busy buttons keep focus.** Every launch button disabled only while pending becomes
`aria-disabled` with the click guarded. Add `aria-busy` where the action is the pending one.

**1b. Gated buttons stay reachable.** Every launch button disabled by validity or
availability becomes `aria-disabled` with the click guarded. It points `aria-describedby` at
its reason where the UI already renders one (an error summary, a `gap` paragraph, the
Guide-unavailable notice). Where none exists, it is announced as unavailable with no
description. No new copy is written in this follow-up.

**1c. One implementation.** A small `ui` helper replaces 59 copies of the pattern:
`guarded(unavailable, handler)` (pure, unit-tested) and shared `[aria-disabled='true']`
styling in `ui/controls.module.css`. The per-module `:disabled` and `[aria-disabled]` rules
collapse into it. Keep the pure part separate so it can be tested without a DOM (see Tests).

**2a. Focus on arrival.** After an in-app navigation, focus moves to the new screen's heading
once that heading exists.
- `navigate()` records that the next screen was arrived at by navigation. `popstate`
  (back/forward) does not, since the browser restores its own position.
- A `useFocusOnArrival(ref)` hook, used by each top-level screen shell, consumes the flag the
  first time it finds a heading. A loading placeholder finds none, so it does not consume it
  and the screen that renders the heading does.
- `useFocusOnViewChange` stays for views inside the launch workspace and stops skipping the
  arrival render, so the two hooks do not double-fire.

**2b. Give `PlayScreen` a heading.** The campaign name in the play header becomes an `h1`
(or the existing element gains the role). It is the focus target for activation and the
landmark a screen-reader user lacks today.

### Out

- **`play/` buttons (~35 native `disabled` sites).** Same defect class, but Milestone 1
  surfaces with their own flows. Convert them in a later pass if wanted. The shared helper
  from 1c would make that cheap.
- **Focus on `popstate`.** Back/forward keeps the browser's behaviour.
- **The tab stall.** Separate investigation.
- **Announcing busy state** through a live region. `aria-busy` is enough here.

## Decisions

D-208 and D-209 are in `design-record.md` (round 39). D-208 covers `campaigns/` as well as
`launch/`, because the New campaign submit is the first button a new player meets. D-209
gained one sentence after the browser pass found the activation hazard (below).

## Open questions

Both were asked and answered.

1. **Where does focus land after activation?** The play screen's `h1`, the same as every
   other screen. Focusing the pending vow's action was considered and not taken: it would make
   activation the one screen that focuses a control, and fixtures with no pending vow would
   need a fallback.
2. **Is 1b in scope?** Yes. The gated buttons are converted in the same pass, so D-208's lint
   rule covers all of `launch/`.

## Tasks

- [x] **F1** `ui/guarded.ts` and its test, and the shared `aria-disabled` style in
  `styles/global.css`, with the hover rules in `ui/controls.module.css` excluding it.
  *As built:* the helper is `guarded({ busy, blocked, reasonId, onClick })`, spread onto the
  button, not the `guarded(unavailable, handler)` sketched above. It returns `aria-disabled`,
  `aria-busy`, `aria-describedby` (only while blocked) and a click that calls
  `preventDefault` when unavailable, so a blocked submit button cannot submit its form,
  including through Enter in a field. The shared style is one zero-specificity rule for every
  `button[aria-disabled='true']`, not a class each module composes.
- [x] **F2** `FoundationSection`, checked in the browser: Save and continue kept focus.
- [x] **F3** Every other launch button. One codemod-driven commit rather than one per section
  (a script split each `disabled` expression into its pending terms, `busy`, and the rest,
  `blocked`, and I reviewed the diff). Where the section already showed why, the button is
  described by it: the Guide-unavailable notes in Crew, Starship, Sector (whole sector and
  each settlement), Starting settlement trouble, Connection, Troubles and Incident; the
  "needs a name, a role…" note on the connection; the "Roll the trouble first" note. The
  now-dead `:disabled` and opacity-only rules are gone from four modules. The pending
  starting-settlement radio also uses `aria-disabled`, since it had the same focus loss.
- [x] **F4** New campaign's submit, with a new one-line hint as its description
  ("Give the campaign a name to create it."), the one place this follow-up adds copy.
- [x] **F5** The lint rule (`eslint.config.js`), proved on a probe file.
- [x] **F6** `ui/arrival.ts`, `navigate()` noting the path, `popstate` clearing it,
  `useFocusOnArrival`, and `useFocusOnViewChange` taking the arrival on its first render.
  The note is keyed to a path so a screen that mounts after a heading-less loading line still
  gets it.
- [x] **F7** The play screen's campaign name is an `h1` (`TopBar`), and the campaign list,
  New campaign and Launch-closed screens use `useFocusOnArrival`.
- [x] **F8** Browser pass, below.

## What the browser pass found

Dev server, Chrome, no provider.

- **Activation dropped focus a second time.** With the first F7 build, Launch campaign
  focused an `h1` and then lost it. `useActivateLaunch` invalidated the campaign in the
  background and `navigate()` ran at once, so the dispatcher at `/campaigns/:id` read the
  *stale* launch query, rendered the launch workspace for a moment, and that mount took the
  arrival. Play then replaced it. Fixed by `useInvalidateCampaignSettled`: activation's
  `onSuccess` waits for the state, log and launch refetch before it navigates. Re-run: focus
  moves to the play screen's `h1` and stays there. Before D-209 the same stale read flashed
  the workspace for a frame with no focus at stake.
- **Vite served a stale module.** After the codemod, the dev server served
  `TruthsSection` with the call to `guarded` and without its import (it had transformed the
  file between my edit and my import fix and missed the second change). The whole launch
  workspace fell to the error boundary until the dev server was restarted. The source and
  `tsc` were right throughout. Noted here because it looks like a regression and isn't.
- **Checked and working.** Full load of the list: focus on the document, as it should be.
  List → New campaign: focus on its `h1`. Create campaign: focus on the workspace heading.
  Each of the eight launch views reached by navigation: no native `disabled` button on any,
  no runtime error, focus on the view's heading, and the gated buttons `aria-disabled` and
  reachable (with a description where one exists). New campaign's submit with an empty name:
  focusable, `aria-disabled`, described by the hint, and a click does nothing. Foundation's
  Save and continue: focus stayed on it after the save.

## Not done, and why

- **No full keyboard walk of every section.** 10.4 completed each by keyboard. This pass
  spot-checked the pattern (Foundation's busy button, New campaign's gated one, the
  activation path) and scanned every view's DOM. It did not re-press each of the ~58 buttons.
  The lint rule guarantees none is native `disabled`, and `guarded` is unit-tested, but a
  full second keyboard walk would be the honest sign-off, and it has not been done.
- **Gated buttons with no description.** Where a section says nothing about why a button is
  blocked, it is announced as unavailable and no more: Accept the star, Add a settlement, Add
  a location, Save the layout, Add the passage, Accept the sector trouble, Accept the
  incident, the Crew review step's Accept, and the vow-choices Accept. Writing that copy is a
  separate, small pass.
- **`VowChoicesPanel`'s radio** for the character already chosen to roll is still natively
  `disabled`. It is a permanently unavailable option, not a pressed control losing focus, and
  D-208 is about buttons.
- **`NotFoundScreen`** has no heading (a `<p>`), so it takes no focus on arrival.
- **`play/`** is untouched: about 35 native `disabled` sites, as scoped out.
- **The tab stall** remains unexplained.

## Verification

`npm test` with `DATABASE_URL` set: 139 files, 1620 tests, one skipped test and no skipped
files. typecheck, lint and format:check clean. The golden launch and the golden session pass
unchanged. New tests: `ui/guarded.test.ts` (6) and `ui/arrival.test.ts` (6). `packages/web`
still has no DOM test tooling, so focus itself was checked in the browser, as before.
