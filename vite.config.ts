import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// base './' lets the same dist/ run on GitHub Pages (/ToolsJunction/) and in Electron (file://)
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
  test: { environment: 'node', globals: true },
});
