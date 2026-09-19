import { describe, expect, it, vi } from 'vitest';

import { guarded } from './guarded.js';

function click(props: ReturnType<typeof guarded<{ preventDefault(): void }>>) {
  const event = { preventDefault: vi.fn() };
  props.onClick(event);
  return event;
}

describe('a focusable unavailable button (D-208)', () => {
  it('runs its action and says nothing when it is available', () => {
    const onClick = vi.fn();
    const props = guarded({ onClick, reasonId: 'why' });

    expect(props['aria-disabled']).toBeUndefined();
    expect(props['aria-busy']).toBeUndefined();
    expect(props['aria-describedby']).toBeUndefined();
    const event = click(props);
    expect(onClick).toHaveBeenCalledOnce();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('while busy, is unavailable and busy, and swallows the click', () => {
    const onClick = vi.fn();
    const props = guarded({ busy: true, reasonId: 'why', onClick });

    expect(props['aria-disabled']).toBe(true);
    expect(props['aria-busy']).toBe(true);
    // Busy is not a reason a person can fix, so nothing describes it.
    expect(props['aria-describedby']).toBeUndefined();
    const event = click(props);
    expect(onClick).not.toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it('while blocked, is unavailable, not busy, and points at its reason', () => {
    const onClick = vi.fn();
    const props = guarded({ blocked: true, reasonId: 'why', onClick });

    expect(props['aria-disabled']).toBe(true);
    expect(props['aria-busy']).toBeUndefined();
    expect(props['aria-describedby']).toBe('why');
    click(props);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('blocked with no reason to point at is unavailable with no description', () => {
    const props = guarded({ blocked: true });
    expect(props['aria-disabled']).toBe(true);
    expect(props['aria-describedby']).toBeUndefined();
  });

  it('cancels the click of a blocked submit button so its form does not submit', () => {
    const event = click(guarded({ blocked: true }));
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it('is fine with no action at all, as a submit button has none', () => {
    const props = guarded({});
    const event = click(props);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});
