import { Component } from 'react';
import { Icon } from './Icons';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-navy-700 flex items-center justify-center p-4">
          <div className="text-center max-w-sm">
            <div className="flex justify-center mb-4"><Icon name="skull" className="w-12 h-12" color="#94a3b8" /></div>
            <h1 className="text-xl font-bold text-navy-50 mb-2">Something went wrong</h1>
            <p className="text-navy-300 text-sm mb-6">
              The page hit an unexpected error. Your data is safe — just reload.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="btn-primary py-2.5 px-6"
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
