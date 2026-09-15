import { Component, type ReactNode } from 'react';

import styles from './ErrorBoundary.module.css';

/**
 * Catches a render-time throw so one broken screen doesn't blank the whole
 * app. A class component because React has no hook for this.
 */
export class ErrorBoundary extends Component<
  { readonly children: ReactNode },
  { readonly error: Error | null }
> {
  override state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override render() {
    if (this.state.error !== null) {
      return (
        <div className={styles.page}>
          <p>Something went wrong.</p>
          <pre>{this.state.error.message}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}
