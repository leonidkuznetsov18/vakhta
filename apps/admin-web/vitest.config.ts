import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Navigation regressions run with the production compiler, including the real mobile shell.
  plugins: [
    react({
      include:
        /\/(?:App\.tsx|app\/.*\.tsx?|features\/mobile-navigation\/ui\/mobile-navigation\.tsx|features\/employee-profile\/.*\.tsx?)$/,
      babel: { plugins: [['babel-plugin-react-compiler', { target: '19' }]] },
    }),
  ],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'jsdom',
    // Panzoom's main is UMD; let Vite resolve its browser ESM entry in DOM tests.
    server: { deps: { inline: ['@panzoom/panzoom'] } },
    setupFiles: ['src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
