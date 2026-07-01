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
        <div className="min-h-screen flex items-center justify-center p-8 bg-white text-black">
          <div className="max-w-lg text-center">
            <h1 className="text-2xl font-bold mb-4">Something went wrong</h1>
            <p className="text-red-600 text-sm mb-6">{String(this.state.error?.message || this.state.error)}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="bg-black text-white px-6 py-3 rounded-xl font-bold"
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
