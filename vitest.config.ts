/// <reference types="vitest" />
import { defineConfig } from 'vite'

export default defineConfig({
  test: {
    environment: 'jsdom', // Mocks browser
    setupFiles: ['./tests/setup.ts'], // Will create this
    include: ['tests/**/*.{test,spec}.ts'],
  },
})
