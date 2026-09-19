import type { LaunchSection } from '@astrolabe/rules';

import { isLaunchSection } from '../launch/sections.js';

/**
 * The route matcher (D-96): pure, so it's unit tested with no DOM at all
 * (`router.test.ts`) and needs nothing from `tsconfig.test.json` beyond
 * plain ES2023. `location.ts` holds the History API glue this depends on
 * in the browser — kept separate so this file never references a DOM
 * global.
 *
 * Group 4 makes `/campaigns/:id` a dispatcher rather than the play screen
 * (task 4.4): a campaign still in Campaign Launch opens on its workspace, one
 * in play opens on the play screen, and the server says which. `PlayScreen`
 * keeps an address of its own at `/campaigns/:id/play` so a launch page can
 * link to it.
 *
 * Still hand-rolled. Nine routes with two param shapes is less than the
 * surface of learning a router library's conventions; revisit if routes grow
 * nested layouts or data loaders — `wouter` is the fallback (D-96).
 */

export type Route =
  | { readonly name: 'campaign-list' }
  | { readonly name: 'campaign-new' }
  | { readonly name: 'campaign-home'; readonly campaignId: string }
  | { readonly name: 'play'; readonly campaignId: string }
  | { readonly name: 'launch-overview'; readonly campaignId: string }
  | { readonly name: 'launch-review'; readonly campaignId: string }
  | {
      readonly name: 'launch-section';
      readonly campaignId: string;
      readonly section: LaunchSection;
    }
  | { readonly name: 'not-found'; readonly pathname: string };

/** Pure: pathname in, route out. */
export function matchRoute(pathname: string): Route {
  const segments = pathname.split('/').filter((segment) => segment.length > 0);

  if (segments.length === 0) {
    return { name: 'campaign-list' };
  }
  if (segments[0] !== 'campaigns') {
    return { name: 'not-found', pathname };
  }
  if (segments[1] === 'new' && segments.length === 2) {
    return { name: 'campaign-new' };
  }

  const campaignId = segments[1];
  if (campaignId === undefined) {
    return { name: 'not-found', pathname };
  }
  if (segments.length === 2) {
    return { name: 'campaign-home', campaignId };
  }
  if (segments[2] === 'play' && segments.length === 3) {
    return { name: 'play', campaignId };
  }
  if (segments[2] === 'launch') {
    if (segments.length === 3) {
      return { name: 'launch-overview', campaignId };
    }
    const tail = segments[3];
    if (segments.length === 4 && tail !== undefined) {
      // `review` is a sibling of the sections, not one of them, so it is
      // matched before the section segment rather than after.
      if (tail === 'review') {
        return { name: 'launch-review', campaignId };
      }
      if (isLaunchSection(tail)) {
        return { name: 'launch-section', campaignId, section: tail };
      }
    }
  }
  return { name: 'not-found', pathname };
}
