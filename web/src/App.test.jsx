import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

describe('App', () => {
  it('renders the main navigation without crashing', () => {
    render(<App />);
    expect(screen.getByText('Request')).toBeInTheDocument();
    expect(screen.getByText('Track')).toBeInTheDocument();
    expect(screen.getByText('Admin Login')).toBeInTheDocument();
  });

  it('shows QR scan required message on request view by default', () => {
    render(<App />);
    expect(screen.getByText(/valid Room QR Code/i)).toBeInTheDocument();
  });
});
