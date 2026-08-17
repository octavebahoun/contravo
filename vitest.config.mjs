import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  // JSX is configured here rather than inherited from `tsconfig.json`, because
  // `next build` rewrites that file: on 15.5.x it sets `"jsx": "preserve"`,
  // since Next compiles JSX itself through SWC. Vitest was reading the same
  // setting and therefore stopped transforming it, so every `.tsx` test — and
  // every `.ts` test importing one, such as the PDF service — failed to parse.
  // Vite 8 transforms with oxc/rolldown, not esbuild: the JSX option moved.
  oxc: {
    jsx: 'automatic',
  },
  test: {
    environment: 'node',
    alias: {
      '@': path.resolve(__dirname, './'),
    },
    testTimeout: 60000, // 60s timeout since we hit a real remote DB
  },
});
