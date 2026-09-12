/**
 * The route matcher (D-96): pure, so it's unit tested with no DOM at all
 * (`router.test.ts`) and needs nothing from `tsconfig.test.json` beyond
 * plain ES2023. `location.ts` holds the History API glue this depends on
 * in the browser — kept separate so this file never references a DOM
 * global.
 *
 * Milestone 1 has five routes with one param shape (a campaign id in the
 * path). That's less than the surface of learning a router library's
 * conventions. Revisit if routes grow nested layouts or data loaders —
 * `wouter` is the fallback (see the plan's dependency table, D-96).
 */

export type Route =
  | { readonly name: 'campaign-list' }
  | { readonly name: 'campaign-new' }
  | { readonly name: 'play'; readonly campaignId: string }
  | { readonly name: 'character-new'; readonly campaignId: string }
  | { readonly name: 'not-found'; readonly pathname: string };

/** Pure: pathname in, route out. */
export function matchRoute(pathname: string): Route {
  const segments = pathname.split('/').filter((segment) => segment.length > 0);

  if (segments.length === 0) {
    return { name: 'campaign-list' };
  }
  if (segments[0] === 'campaigns' && segments[1] === 'new' && segments.length === 2) {
    return { name: 'campaign-new' };
  }
  if (segments[0] === 'campaigns' && segments.length === 2 && segments[1] !== undefined) {
    return { name: 'play', campaignId: segments[1] };
  }
  if (
    segments[0] === 'campaigns' &&
    segments[2] === 'characters' &&
    segments[3] === 'new' &&
    segments.length === 4 &&
    segments[1] !== undefined
  ) {
    return { name: 'character-new', campaignId: segments[1] };
  }
  return { name: 'not-found', pathname };
}
