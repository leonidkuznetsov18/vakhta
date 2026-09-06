import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // esbuild не емітить decorator metadata, тому e2e з повним DI Nest транспілюється через swc.
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: { target: 'es2022', transform: { decoratorMetadata: true, legacyDecorator: true } },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
    // Інтеграційні тести піднімають PostgreSQL у контейнері (testcontainers).
    testTimeout: 60_000,
    hookTimeout: 300_000,
    fileParallelism: false,
  },
});
