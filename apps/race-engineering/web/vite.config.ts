import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Local dev: forward /api to the Express app (apps/race-engineering/api).
    proxy: { '/api': 'http://localhost:3001' },
  },
});
