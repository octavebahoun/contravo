import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    alias: {
      '@': path.resolve(__dirname, './'),
    },
    testTimeout: 20000, // 20s timeout since we hit a real DB
  },
});
