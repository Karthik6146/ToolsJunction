import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

// base './' lets the same dist/ run on GitHub Pages (/ToolsJunction/) and in Electron (file://)
// preact aliases react/react-dom to preact/compat: same React API, ~120 KB less JS on first load
export default defineConfig({
  base: './',
  plugins: [preact()],
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
  test: { environment: 'node', globals: true },
});
