import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev server on 5173; proxy /api → Express on 3001 so the client can call
// relative URLs without CORS headaches.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
