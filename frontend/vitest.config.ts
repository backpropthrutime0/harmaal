import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

// Kept separate from vite.config.ts on purpose: `tsconfig.node.json` typechecks
// vite.config.ts during `npm run build`, and pulling vitest's types in there
// conflicts with vite's own http-proxy typings.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      // Test files opt into jsdom with a `// @vitest-environment jsdom` docblock;
      // this setup patches the Web Storage globals Node 26 + vitest 2 leave
      // undefined there. See src/test-setup.ts.
      setupFiles: ['./src/test-setup.ts'],
    },
  }),
)
