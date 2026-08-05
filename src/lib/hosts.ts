/**
 * Where this app talks to, resolved at runtime.
 *
 * `cloudsforgeHosts()` reads `window.location.hostname` on every call, so one image serves
 * localhost, a preview deployment and production. Nothing here reads a build-time constant; see
 * the note in vite.config.ts and `test/no-build-time-config.test.ts`.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * ONE SURFACE KEY, NOT TWO, AND THAT IS A DECISION WITH A REASON RATHER THAN A DEFAULT.
 *
 * `micro-worlds-web` uses two keys — `worlds` for the product and `api` for the service — because
 * the registry gives its service a host of its own. (That second key was `worlds-api` until
 * 2026-08-05, when the hostname was folded into `api.` and its row deleted; the two-key SHAPE is
 * what matters here, not which key.) There is no `developers-api` row: the
 * registry has ONE `developers` entry (`ui/packages/ui/src/surfaces.ts:384-395`), so this bundle
 * and `micro-devplatform` share `developers.<apex>`, `apiBase()` collapses to `''` in production,
 * and every request from this bundle is relative.
 *
 * **The alternative was `api`, and it was rejected on evidence.** `devplatform/src/server.ts:8-20`
 * says the public surface is `api.<apex>/v1/<resource>`, forwarded unchanged. Two things make that
 * the wrong host for THIS bundle:
 *
 *   1. **The gateway routes nothing of devplatform's.** `deploy/gateway/dynamic/public-api.yml`
 *      registers routers for pricing, activity, foresight, identity, wallet, market, mint and
 *      worlds (`:79`-`:159`) and for no other service. None of `organisations`, `projects`,
 *      `keys`, `webhook-endpoints`, `oauth-clients`, `quotas`, `usage`, `apps` or `scopes` appears
 *      in any rule, so every one of them falls to `cf-api-catchall` (`:164-169`) and is
 *      blackholed at `http://127.0.0.1:1` (`:206-208`). Reported to micro-deploy.
 *   2. **`api.<apex>` is deliberately not a browser origin.** Its middleware chain is
 *      `cf-api-headers` alone (`public-api.yml:65-76`), which carries no CORS — the file says why
 *      at `:62-64`: the API host "is not a browser origin for a first-party app — it is called by
 *      third-party servers and by the SDK". A first-party console calling it from a browser is
 *      exactly what that sentence excludes.
 *
 * So this app resolves against its OWN surface, which is what every other first-party frontend in
 * this estate does, and the README states precisely what the deploy has to add for either half.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ── The disagreements, reported rather than papered over ──────────────────────────────────────
 *
 * **1. The dev port.** The registry gives `developers` devPort **3012**
 * (`ui/packages/ui/src/surfaces.ts:389`). `micro-devplatform` binds **4000**:
 * `devplatform/src/env.ts:197` defaults `PORT` to 4000 and `devplatform/.env.example:27` sets it
 * to 4000. `LOCAL_HOSTS` derives `http://localhost:3012` from the registry
 * (`ui/packages/ui/src/index.tsx:136`), so under `pnpm dev` a devplatform started from its own
 * example environment is not where this app looks.
 *
 * This is the SIXTH instance of a devPort that is an allocation pretending to be a fact — after
 * `admin` (registry 3002, `admin-api` binds 4014), `emberkin` (3014, binds 4100), `foresight`
 * (4021 read as beacon's 4011), `create` (4004, `mint` binds 4000) and `worlds-api` (4002,
 * `worlds` binds 4000 — that row has since been deleted with the hostname). It is NOT fixed with a literal port here: a hard-coded host is a second,
 * unversioned copy of the registry, and the copy is the one that goes stale. The README says
 * `PORT=3012 pnpm start`, in one line, next to the citation. Reported to micro-ui.
 *
 * **2. The gateway's CORS allowlist names a host the registry does not define.**
 * `deploy/gateway/dynamic/policy.yml:53` allowlists `https://devportal.cloudsforge.online`. The
 * registry's subdomain for this surface is `developers` (`ui/packages/ui/src/surfaces.ts:388`), so
 * the origin this bundle is actually served from — `https://developers.<apex>` — is not on that
 * list, and `https://devportal.<apex>` is a name nothing in the estate resolves. It does not break
 * THIS app, whose requests are same-origin in production; it would break any cross-origin call
 * from here, and it is a name that will be believed. Reported to micro-deploy.
 *
 * **3. `deploy/README.md:274` says devplatform does not exist.** It does: `micro-devplatform` is a
 * complete service with 31 `/v1` routes and a migrated schema. The sentence is stale, and the
 * compose slice agrees with it rather than with reality — `deploy/compose/docker-compose.slice.yml`
 * brings up postgres, identity and ledger and nothing else. Reported to micro-deploy.
 */
import { cloudsforgeHosts, type CloudsForgeHosts, type SurfaceKey } from '@cloudsforge/ui'

/**
 * The surface this application IS, and the surface it CALLS.
 *
 * `ui/packages/ui/src/surfaces.ts:384-395` registers `developers` as a `surface` (not a product)
 * with `inSwitcher: false`, accent `#4a86e0`, glyph `⌗`, subdomain `developers` and
 * `markId: null`. It is reached from the footer rather than from the product switcher, and
 * `surfaces.ts:382-383` says why: "a developer console is something a person goes looking for, and
 * it does not compete for a switcher slot with the products".
 */
export const PRODUCT: SurfaceKey = 'developers'

/** The name reported to the observability ingest and shown in error copy. */
export const APP_NAME = 'devportal-web'

/**
 * The base URL for this app's OWN API, which is `micro-devplatform`.
 *
 * In production the SPA and the service are the same origin — nginx serves the bundle, the service
 * serves `/v1` behind `developers.<apex>` — so the base is the empty string and requests stay
 * relative. Under `pnpm dev` the page is on Vite's port while the service is on the registry's dev
 * port, so the base is absolute and the request goes cross-origin.
 *
 * The difference is derived by COMPARING ORIGINS rather than by a `DEV` flag, because a flag is a
 * build-time constant and this repository has none: an image built for production and opened on
 * localhost would then point at a host that is not there.
 */
export function resolveApiBase(pageOrigin: string, hosts: CloudsForgeHosts, key: SurfaceKey): string {
  const own = hosts[key]
  // With no page origin there is nothing for a relative URL to resolve against, so the absolute
  // form is the only correct answer.
  if (!pageOrigin) return own
  // A surface may carry a basePath (the wallet is a path inside Hub), so compare ORIGINS rather
  // than whole URLs — otherwise every such surface would look cross-origin to itself.
  return new URL(own).origin === pageOrigin ? '' : own
}

/** The same four names `cloudsforgeHosts()` treats as development. Kept in step by test. */
export function isLocal(hostname: string): boolean {
  return (
    hostname === '' ||
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.endsWith('.local')
  )
}

/**
 * Whether this bundle is being served from an address the surface registry knows.
 *
 * `cloudsforgeHosts()` derives the apex by stripping a KNOWN subdomain prefix
 * (`ui/packages/ui/src/index.tsx:149-159`). Served from an unknown name, the whole name becomes
 * the apex, and every CloudsForge URL derived from it — this app's own API, the account portal,
 * Lantern — resolves one level too deep.
 *
 * On this surface the consequence is sharper than on a product page. Every screen behind the
 * session gate mints or revokes a credential, so an app resolving its API to the wrong host is an
 * app that would send a bearer token somewhere unintended. It still renders — the scope vocabulary
 * and the application directory are public pages worth serving — but it says so, once, in the
 * shell, and the credential screens are behind a session that cannot be established from a host
 * the account portal does not know.
 */
export function isRegisteredPlacement(pageOrigin: string, hostname: string, hosts: CloudsForgeHosts): boolean {
  if (isLocal(hostname)) return true
  if (!pageOrigin) return true
  try {
    return new URL(hosts[PRODUCT]).origin === pageOrigin
  } catch {
    return false
  }
}

/** Every CloudsForge base URL, for the current environment. */
export function hosts(): CloudsForgeHosts {
  return cloudsforgeHosts()
}

/** This app's API base, resolved now. Call it per request; never cache it in a module constant. */
export function apiBase(): string {
  const origin = typeof window === 'undefined' ? '' : window.location.origin
  return resolveApiBase(origin, cloudsforgeHosts(), PRODUCT)
}

/** The page origin, or a stable placeholder when there is no document (tests, prerender). */
export function pageOrigin(): string {
  return typeof window === 'undefined' ? 'http://localhost' : window.location.origin
}

/** Whether the current address is one the registry knows. Read by the shell. */
export function placementIsKnown(): boolean {
  if (typeof window === 'undefined') return true
  return isRegisteredPlacement(window.location.origin, window.location.hostname, cloudsforgeHosts())
}
