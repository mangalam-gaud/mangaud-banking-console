import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration.
 *
 * The `include` is scoped to `src/` on purpose. Vitest's default glob also
 * matches the *compiled* copy of every test under `dist/`. Since
 * `npm run build` emits CommonJS while vitest is ESM, a stale
 * `dist/tests/unit.test.js` failed the run with "Vitest cannot be imported in a
 * CommonJS module" -- a failure in the compiled artefact rather than the
 * source, and one that only appears after the first build.
 *
 * `tsconfig.json` also excludes `src/tests` from compilation, so the artefact is
 * never produced in the first place. This is the belt to that pair of braces.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**'],
    environment: 'node',
    // The suite is pure logic and finishes in about a second; a longer default
    // would only hide a hang.
    testTimeout: 10_000,
  },
});