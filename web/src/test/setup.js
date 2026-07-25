import '@testing-library/jest-dom';

// vitest: virtual PWA module is only available after a Vite build/dev plugin load
vi.mock('virtual:pwa-register', () => ({
  registerSW: () => () => {},
}));
