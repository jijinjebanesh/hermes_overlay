import React, { Component } from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary — Catches React rendering errors and displays
 * a premium error UI with retry capability.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="error-boundary">
          <div className="error-boundary__content">
            <div className="error-boundary__icon">⚠️</div>
            <h3 className="error-boundary__title">Something went wrong</h3>
            <p className="error-boundary__message">
              {this.state.error?.message || 'An unexpected error occurred.'}
            </p>
            <div className="error-boundary__actions">
              <button
                className="error-boundary__retry"
                onClick={this.handleRetry}
              >
                Try Again
              </button>
              <button
                className="error-boundary__reload"
                onClick={() => window.location.reload()}
              >
                Reload App
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
