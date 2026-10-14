import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.tsx'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  clean: true,
  // dist/ is committed (installs from GitHub use it as is) – keep it small
  sourcemap: false,
  banner: { js: '#!/usr/bin/env node' },
});
