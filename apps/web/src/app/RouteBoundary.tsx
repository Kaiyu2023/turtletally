import { Component, type ErrorInfo, type ReactNode } from 'react';
import { LoadError } from '../components/Ui';

type Props = { readonly children: ReactNode };
type State = { readonly failed: boolean };

export class RouteBoundary extends Component<Props, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  // Coarse event name only. A render failure must never put a finance value in
  // the console, where a browser extension or a screen recording could read it.
  override componentDidCatch(_error: Error, _info: ErrorInfo): void {
    console.error('route_render_failed');
  }

  override render(): ReactNode {
    if (this.state.failed) {
      return <LoadError code="UNKNOWN" onRetry={() => this.setState({ failed: false })} />;
    }
    return this.props.children;
  }
}
