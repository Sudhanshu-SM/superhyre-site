import { Component } from "react";
import type { ReactNode } from "react";

/**
 * A small error boundary for a block that only adds information (what is tied to these people, where a member's work
 * goes): if it cannot be drawn from what the server sent, it is left out and the dialog around it carries on.
 */
export class Guard extends Component<{ children: ReactNode; fallback?: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } { return { failed: true }; }
  override componentDidCatch(): void { /* the block is simply not shown */ }
  override render(): ReactNode { return this.state.failed ? (this.props.fallback ?? null) : this.props.children; }
}
