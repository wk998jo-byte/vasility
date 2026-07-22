import React, { Component } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-[100dvh] flex items-center justify-center p-8 bg-white text-neutral-900">
          <div className="max-w-lg text-center bg-white border border-neutral-200 shadow-md rounded-[2rem] p-10">
            <h1 className="text-2xl font-extrabold tracking-tight text-neutral-900 mb-4">Something went wrong</h1>
            <p className="text-red-700 text-sm mb-6 font-medium">{String(this.state.error?.message || this.state.error)}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="btn-primary px-8 py-3.5"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
