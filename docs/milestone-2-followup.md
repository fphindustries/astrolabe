# Milestone 2 follow-up — focus and disabled controls

Milestone 2 is complete (`milestone-2.md`, "Milestone 2 complete"). Its keyboard pass (10.4)
found three things and fixed none of them by design. This document scopes two: **(a)**
disabled launch buttons that lose or hide focus, and **(b)** focus that starts at the top of
the page after Create campaign and after activation. The third, the unexplained tab stall,
is an investigation and is not scoped here.

This is not Milestone 3, and it pulls nothing in from it. It changes no rules, events,
routes or projections, so `design-event-log.md` is untouched and the golden launch and golden
session must pass unchanged. Decision IDs below are **proposed**: the open questions
are answered, but D-208 and D-209 enter `design-record.md` only once their wording is approved.

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

## Decisions to approve

| ID | Proposed decision |
|---|---|
| D-208 | **Launch controls that are unavailable stay focusable.** A button that is busy or gated uses `aria-disabled` with a guarded click, never native `disabled`, so a keyboard or screen-reader user keeps their place and can reach the reason. Extends the pattern `TruthCard` and `LaunchReviewScreen` already use. **Enforced by lint**: `no-restricted-syntax` forbids `disabled` on `<button>` in `packages/web/src/launch`. Leaving 1b's gated buttons native was considered: it fixes only the focus loss, and leaves the ~34 controls a keyboard user still can't find. |
| D-209 | **A screen reached by in-app navigation takes focus on its heading.** The first heading a top-level screen renders after `navigate()` receives focus. Full page loads and back/forward are unchanged. Amends 10.4's fix 1, which covered views within the launch workspace only. |

## Open questions

Both were asked and answered.

1. **Where does focus land after activation?** The play screen's `h1`, the same as every
   other screen. Focusing the pending vow's action was considered and not taken: it would make
   activation the one screen that focuses a control, and fixtures with no pending vow would
   need a fallback.
2. **Is 1b in scope?** Yes. The gated buttons are converted in the same pass, so D-208's lint
   rule can cover all of `launch/`.

## Tasks

Each task leaves the build working and the tests passing.

- [ ] **F1** `ui/guarded.ts` and its unit test. Shared `aria-disabled` styling in
  `ui/controls.module.css`. No call sites yet.
- [ ] **F2** Convert one section end to end as the pattern's proof (`FoundationSection`, one
  busy button and the submit). Check it in the browser before the rest.
- [ ] **F3** Convert the remaining launch sections, one commit per section file group
  (Truths, Crew, Starship, Sector, Connection/Troubles/Incident, Review/Vow/Confirm). Delete
  each module's now-dead `:disabled` rule.
- [ ] **F4** `NewCampaignScreen`'s submit. It is native `disabled` on an empty name, which
  is a gated case. Add its reason as `aria-describedby`, since it is the first thing a new
  player meets.
- [ ] **F5** The lint rule, added last so it lands green.
- [ ] **F6** `navigate()` flag, `useFocusOnArrival`, and the `useFocusOnViewChange` change (2a).
- [ ] **F7** `PlayScreen` heading (2b), then wire activation.
- [ ] **F8** Browser and keyboard pass at 1280×720, recorded in this file.

## Tests

`packages/web` has no DOM test tooling (no jsdom or Testing Library). Its tests are pure
functions. This follow-up does not add any:

- `guarded()` and the arrival flag are pure and get unit tests, including the guard blocking a
  click while unavailable and the flag surviving a heading-less render.
- The lint rule is the regression net for D-208 across all of `launch/`.
- Focus itself is checked in the browser (F8), as 10.4 checked it. Adding jsdom and
  `@testing-library/react` would test it in CI, but it is a new dependency and a new test
  style for two hooks. Propose it separately if a second focus regression appears.

Full verification is the Milestone 2 bar: `npm test` with `DATABASE_URL` set and zero skipped
files, typecheck, lint, `format:check`, and the web build.

## Done when

- No native `disabled` on a `<button>` in `packages/web/src/launch` (lint-enforced).
- Every section, and the review and confirm dialog, completes by keyboard with focus never
  leaving the control just pressed, and every gated button reachable by Tab.
- After Create campaign and after activation, focus is on the new screen's heading.
- The golden launch and golden session pass unchanged.
