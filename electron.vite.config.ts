import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

import react from '@vitejs/plugin-react';
import {defineConfig, swcPlugin} from 'electron-vite';

const {version} = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as {
  version: string;
};

export default defineConfig({
  main: {
    plugins: [swcPlugin()],
    build: {
      outDir: 'out/main',
      // cli.js is the `fly` CLI, run by bin/fly on Electron in Node mode.
      rollupOptions: {
        input: {index: resolve('src/main.ts'), cli: resolve('src/cli.ts')},
      },
    },
  },
  preload: {
    build: {
      outDir: 'out/preload',
      rollupOptions: {input: {index: resolve('src/preload.ts')}},
    },
  },
  renderer: {
    root: 'src/application/ui',
    plugins: [react()],
    define: {__APP_VERSION__: JSON.stringify(version)},
    build: {
      outDir: resolve('out/renderer'),
      rollupOptions: {
        input: {index: resolve('src/application/ui/index.html')},
      },
    },
  },
});
