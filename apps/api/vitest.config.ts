import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
    // Інтеграційні тести піднімають PostgreSQL у контейнері (testcontainers).
    testTimeout: 60_000,
    hookTimeout: 180_000,
    fileParallelism: false,
  },
});
