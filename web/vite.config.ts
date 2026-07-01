import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['assets/bin-quraya-logo.png'],
      manifest: {
        name: 'SSC Building Portal',
        short_name: 'SSC Portal',
        description: 'Bin Quraya facility management',
        theme_color: '#0a0a0a',
        background_color: '#fcfcfc',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: '/assets/bin-quraya-logo.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
  },
});
