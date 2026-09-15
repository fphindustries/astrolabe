import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from 'react';

import { getPathname, navigate, subscribeToLocation } from './location.js';
import { matchRoute, type Route } from './router.js';

/** The current route, kept in sync with the address bar. */
export function useRoute(): Route {
  const pathname = useSyncExternalStore(subscribeToLocation, getPathname, getPathname);
  return matchRoute(pathname);
}

/**
 * A same-tab link. Intercepts a plain left-click (no modifier keys, not a
 * new-tab request) and routes it through `navigate` instead of a full page
 * load — the play screen never leaves this history stack (§8: play never
 * navigates away applies to drawers, not to these five top-level screens;
 * see D-100).
 */
export function Link({
  href,
  onClick,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { readonly href: string }) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    navigate(href);
  };

  return <a href={href} onClick={handleClick} {...rest} />;
}
