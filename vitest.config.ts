import {defineConfig} from 'vitest/config';

export default defineConfig({
  // Tests build services by hand (no Nest DI), so decorator metadata is not
  // needed; emitting it adds uncoverable `typeof X === 'undefined'` branches.
  // The electron-vite build keeps emitting it via swcPlugin.
  oxc: {decorator: {legacy: true, emitDecoratorMetadata: false}},
  test: {
    globals: true,
    clearMocks: true,
    mockReset: true,
    restoreMocks: true,
    passWithNoTests: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: [
            'tests/unit/**/*.spec.ts',
            'tests/integration/**/*.spec.ts',
          ],
          setupFiles: ['reflect-metadata'],
        },
      },
      {
        extends: true,
        test: {
          name: 'ui',
          environment: 'jsdom',
          include: ['tests/ui/**/*.spec.tsx'],
          setupFiles: ['tests/ui/setup.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reportsDirectory: 'reports/vitest',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/main.ts',
        'src/preload.ts',
        'src/application/ipc/ipc-module.ts',
        'src/application/ui/**',
      ],
      thresholds: {lines: 100, functions: 100, branches: 100, statements: 100},
    },
  },
});
