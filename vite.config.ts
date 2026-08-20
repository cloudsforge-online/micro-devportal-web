import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * There is deliberately no `define`, no `envPrefix` and no `.env` file in this repository.
 *
 * A build-time constant is an environment baked into an image, and an image with an environment
 * baked into it has to be rebuilt to be promoted — which means the artefact that reaches
 * production is not the artefact that passed CI. Every host this app talks to is resolved at
 * RUNTIME from `window.location.hostname` by `cloudsforgeHosts()`, so one image serves localhost,
 * staging, a preview deployment and production. `test/no-build-time-config.test.ts` fails the
 * build if `import.meta.env.VITE_` ever reappears, and the `rules` job in CI greps for it again
 * so deleting the test does not delete the rule.
 */
export default defineConfig({
  plugins: [react()],
  // ── THE MOUNT, AND IT IS AN ADDRESS RATHER THAN AN ENVIRONMENT ────────────────────────────────
  //
  // `/developers` is the same string on localhost, on testnet, on mainnet and in a preview: it is a
  // fact about how the estate composes this surface's URLs, not about which estate serves it.
  //
  // TRAILING SLASH REQUIRED. vite joins `base` to an asset name by concatenation, so `/developers`
  // emits `/developersassets/index-a1b2.js` — a 404 for the bundle on every page, with a build that
  // succeeds and a dev server that is unaffected because it serves from memory.
  base: '/developers/',
  resolve: {
    // @cloudsforge/ui is a `link:` dependency, so its own node_modules holds a second copy of
    // React. Two copies means two dispatchers, and the shared bar would throw on its first
    // useState.
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    // The linked package now ships BUILT output — its entry points name a committed `dist` — so
    // the old reason for this line ("shipped as TypeScript source until it is published") is no
    // longer why it is here. The setting is still right, for the reason that outlives it: `link:`
    // resolves to a working tree edited beside this one, and pre-bundling copies it into
    // node_modules/.vite, where it stays until the dep hash changes. A rebuild in micro-ui does
    // not change this repository's lockfile, so `pnpm dev` would keep serving yesterday's `dist`.
    exclude: ['@cloudsforge/ui'],
  },
  build: {
    // Named chunks and a real manifest of hashes: the assets are immutable-cached by nginx, and
    // that is only safe when every rebuild produces a new filename.
    sourcemap: true,
  },
  // ════════════════════════════════════════════════════════════════════════════════════════════
  // 5192 IS A VITE PORT. IT IS NOT THE REGISTRY'S `developers` ENTRY, AND IT MUST NOT BE.
  //
  // The registry gives `developers` devPort **3012** (`ui/packages/ui/src/surfaces.ts`).
  // `LOCAL_HOSTS` in @cloudsforge/ui builds `http://localhost:<devPort>` for EVERY surface
  // (`ui/packages/ui/src/index.tsx`), so under `pnpm dev` this bundle resolves its own API
  // base to `http://localhost:3012`. If Vite also served the page there, the SPA and the service
  // would be fighting for one port and `resolveApiBase` would collapse to '' against a server
  // that has no `/v1` on it.
  //
  // So Vite is on its own port and 3012 is where `micro-devplatform` is expected to answer.
  // `devplatform` binds **4000**: `devplatform/src/env.ts` defaults `PORT` to 4000 and
  // `devplatform/.env.example:27` sets it to 4000. Run it with `PORT=3012 pnpm start`; the README
  // says so in one line, next to the citation.
  //
  // This is NOT papered over with a literal host here. A hard-coded host is a second, unversioned
  // copy of the surface registry, and the copy is the one that goes stale. See src/lib/hosts.ts,
  // which reports the disagreement rather than absorbing it.
  //
  // None of it is visible in production: the bundle and devplatform share `developers.<apex>`
  // there, so `apiBase()` is '' and every request is relative.
  // ════════════════════════════════════════════════════════════════════════════════════════════
  server: { port: 5192 },
  preview: { port: 5192 },
})
