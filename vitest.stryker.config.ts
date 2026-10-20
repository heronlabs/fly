import {defineConfig} from 'vitest/config';

// Stryker runs only the `node` project of vitest.config.ts (unit + integration
// specs). `projects` is not merged from the base config because mergeConfig
// concatenates arrays and would pull in the `ui` (jsdom) and `di` projects.
export default defineConfig({
  oxc: {decorator: {legacy: true, emitDecoratorMetadata: false}},
  test: {
    globals: true,
    clearMocks: true,
    mockReset: true,
    restoreMocks: true,
    passWithNoTests: true,
    environment: 'node',
    include: ['tests/unit/**/*.spec.ts', 'tests/integration/**/*.spec.ts'],
    setupFiles: ['reflect-metadata'],
    reporters: ['default'],
  },
});
