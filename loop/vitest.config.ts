import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['runtime/**/*.spec.ts'],
    environment: 'node',
    passWithNoTests: false,
  },
});
