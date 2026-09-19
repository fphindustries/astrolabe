/**
 * A button that is unavailable but still focusable (D-208).
 *
 * Native `disabled` removes a button from the tab order and drops focus to the
 * document when it is set on the button just pressed. A launch button that is
 * busy (its request is pending) or gated (the form is invalid, the Guide is
 * unavailable) is `aria-disabled` instead, so a keyboard user keeps their
 * place and can reach the reason. `aria-disabled` blocks nothing by itself, so
 * the click is guarded here.
 *
 * Spread the result onto the button:
 *
 *   <button type="button" {...guarded({ busy: save.isPending, onClick: save })}>
 */

export interface GuardedState<E extends { preventDefault(): void }> {
  /** The button's own request is pending. Sets `aria-busy` too. */
  readonly busy?: boolean;
  /** The action can't run yet: an invalid form, an unavailable Guide, an unconfigured place. */
  readonly blocked?: boolean;
  /** The id of the text that says why it is blocked. Only described while blocked. */
  readonly reasonId?: string;
  readonly onClick?: (event: E) => void;
}

export interface GuardedProps<E> {
  readonly 'aria-disabled': true | undefined;
  readonly 'aria-busy': true | undefined;
  readonly 'aria-describedby': string | undefined;
  readonly onClick: (event: E) => void;
}

export function guarded<E extends { preventDefault(): void }>(
  state: GuardedState<E>,
): GuardedProps<E> {
  const busy = state.busy === true;
  const unavailable = busy || state.blocked === true;
  return {
    'aria-disabled': unavailable ? true : undefined,
    'aria-busy': busy ? true : undefined,
    'aria-describedby': state.blocked === true ? state.reasonId : undefined,
    onClick: (event) => {
      if (unavailable) {
        // A submit button's click would otherwise still submit its form, and
        // Enter in a field submits through the form's default button.
        event.preventDefault();
        return;
      }
      state.onClick?.(event);
    },
  };
}
