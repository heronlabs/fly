import {resolve} from 'node:path';

import react from '@vitejs/plugin-react';
import {defineConfig, swcPlugin} from 'electron-vite';

export default defineConfig({
  main: {
    plugins: [swcPlugin()],
    build: {
      outDir: 'out/main',
      rollupOptions: {input: {index: resolve('src/main.ts')}},
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
    build: {
      outDir: resolve('out/renderer'),
      rollupOptions: {
        input: {index: resolve('src/application/ui/index.html')},
      },
    },
  },
});
