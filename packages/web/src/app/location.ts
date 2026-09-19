/**
 * The History API glue `routes.tsx`'s `useRoute`/`Link` use. Split out of
 * `router.ts` so that file's `matchRoute` stays pure and DOM-free — this
 * file is the one that actually touches `location`/`history`.
 */

import { clearArrival, noteArrival } from '../ui/arrival.js';

const NAVIGATE_EVENT = 'astrolabe:navigate';

/**
 * Push a new path and notify subscribers. `pushState` alone fires no event,
 * so this dispatches one after — `subscribeToLocation` listens for both
 * this and the browser's own `popstate` (back/forward).
 */
export function navigate(to: string): void {
  if (to === location.pathname + location.search) {
    return;
  }
  noteArrival(to);
  history.pushState(null, '', to);
  dispatchEvent(new Event(NAVIGATE_EVENT));
}

export function getPathname(): string {
  return location.pathname;
}

/** For `useSyncExternalStore`. */
export function subscribeToLocation(onChange: () => void): () => void {
  // Back/forward restores the browser's own focus (D-209), so it is not an arrival.
  addEventListener('popstate', clearArrival);
  addEventListener('popstate', onChange);
  addEventListener(NAVIGATE_EVENT, onChange);
  return () => {
    removeEventListener('popstate', clearArrival);
    removeEventListener('popstate', onChange);
    removeEventListener(NAVIGATE_EVENT, onChange);
  };
}
