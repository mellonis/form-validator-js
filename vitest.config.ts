import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const coreSrc = resolve(here, 'packages/core/src/index.js');
const validatorsSrc = resolve(here, 'packages/validators/src/index.js');

const sharedAlias = {
  '@form-validator-js/core': coreSrc,
  '@form-validator-js/validators': validatorsSrc,
};

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'core',
          root: resolve(here, 'packages/core'),
          environment: 'jsdom',
          globals: true,
          include: ['src/**/*.test.ts'],
        },
        resolve: { alias: sharedAlias },
      },
      {
        test: {
          name: 'validators',
          root: resolve(here, 'packages/validators'),
          environment: 'jsdom',
          globals: true,
          include: ['src/**/*.test.ts'],
        },
        resolve: { alias: sharedAlias },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**'],
      exclude: ['packages/*/src/**/*.test.ts'],
      reporter: ['text', 'json'],
    },
  },
});
