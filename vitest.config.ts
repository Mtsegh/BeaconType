import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    root: import.meta.dirname,
    include: [
      'src/**/*.{test,spec}.?(c|m)[jt]s?(x)',
      'electron/**/*.{test,spec}.?(c|m)[jt]s?(x)',
    ],
    exclude: ['node_modules/**', 'dist/**', 'dist-electron/**'],
    passWithNoTests: true,
    testTimeout: 1000 * 29,
  },
})