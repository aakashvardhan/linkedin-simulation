import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // When `VITE_API_BASE_URL=/api`, forward to the compose API gateway (see repo root `docker-compose.yml`).
      '/api': { target: 'http://127.0.0.1:8090', changeOrigin: true },
    },
  },
  resolve: {
    // Avoid "Invalid hook call" caused by duplicated React in optimized deps.
    dedupe: ['react', 'react-dom'],
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setupTests.js'],
    css: true,
  },
});
