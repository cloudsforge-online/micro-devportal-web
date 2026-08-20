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
 * registry has ONE `developers` entry (`ui/packages/ui/src/surfaces.ts`), so this bundle
 * and `micro-devplatform` share `developers.<apex>`, `apiBase()` collapses to `''` in production,
 * and every request from this bundle is relative.
 *
 * **The alternative was `api`, and it was rejected on evidence.** `devplatform/src/server.ts`
 * says the public surface is `api.<apex>/v1/<resource>`, forwarded unchanged. Two things make that
 * the wrong host for THIS bundle:
 *
 *   1. **THIS REASON IS CLOSED, AND THE DECISION DOES NOT DEPEND ON IT.** It read: "the gateway
 *      routes nothing of devplatform's — none of `organisations`, `projects`, `keys`,
 *      `webhook-endpoints`, `oauth-clients`, `quotas`, `usage`, `apps` or `scopes` appears in any
 *      rule, so every one of them falls to `cf-api-catchall` and is blackholed at
 *      `http://127.0.0.1:1`." `deploy/gateway/dynamic/public-api.yml` now declares
 *      `cf-api-devplatform` forwarding the seven prefixes to devplatform, and both the catch-all
 *      and the blackhole it pointed at are deleted outright. `https://api.<apex>/v1/scopes`
 *      answers 200. It is kept, named, because a reader who finds the rule and not this note would
 *      reasonably conclude the surface decision below was made on a premise that is no longer
 *      true — and it was not: reason 2 is the load-bearing one and is unaffected.
 *   2. **`api.<apex>` is deliberately not a browser origin.** Its middleware chain is
 *      `cf-api-headers` alone (`public-api.yml`), which carries no CORS — the file says why
 *      in the comment above that middleware: the API host "is not a browser origin for a
 *      first-party app — it is called by
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
 * (`ui/packages/ui/src/surfaces.ts`). `micro-devplatform` binds **4000**:
 * `devplatform/src/env.ts` defaults `PORT` to 4000 and `devplatform/.env.example:27` sets it
 * to 4000. `LOCAL_HOSTS` derives `http://localhost:3012` from the registry
 * (`ui/packages/ui/src/index.tsx`), so under `pnpm dev` a devplatform started from its own
 * example environment is not where this app looks.
 *
 * This is the SIXTH instance of a devPort that is an allocation pretending to be a fact — after
 * `admin` (registry 3002, `admin-api` binds 4014), `emberkin` (3014, binds 4100), `foresight`
 * (4021 read as beacon's 4011), `create` (4004, `mint` binds 4000) and `worlds-api` (4002,
 * `worlds` binds 4000 — that row has since been deleted with the hostname). It is NOT fixed with a literal port here: a hard-coded host is a second,
 * unversioned copy of the registry, and the copy is the one that goes stale. The README says
 * `PORT=3012 pnpm start`, in one line, next to the citation. Reported to micro-ui.
 *
 * **2 AND 3 ARE BOTH CLOSED — 2026-08-11 — and are recorded here rather than deleted, because
 * this block is the argument for reporting a disagreement instead of working around it.**
 *
 * **2 said the gateway's CORS allowlist names a host the registry does not define:**
 * `deploy/gateway/dynamic/policy.yml` allowlisted `https://devportal.cloudsforge.online` while the
 * registry's subdomain for this surface is `developers` (`ui/packages/ui/src/surfaces.ts`), so the
 * origin this bundle is actually served from was not on the list and `devportal.<apex>` was a name
 * nothing resolved. `policy.yml` now allowlists `https://developers{{ env "CF_WEB_SUFFIX" }}` and
 * carries no `devportal` origin anywhere. The old name still resolves to nothing — which was the
 * whole risk: it read like a fact.
 *
 * **3 said `deploy/README.md` says devplatform does not exist.** It now says the opposite, and
 * credits this repository for catching it. The estate composition had already agreed —
 * `deploy/compose/docker-compose.estate.yml` declares the `devplatform` service and its migration
 * job — and only the sentence was stale.
 *
 * This note used to cite a `docker-compose.slice.yml` under `deploy/compose` — written out as a
 * path, which it deliberately is not here — and micro-deploy has since deleted that file.
 * Nothing noticed for as long as the citation carried a line number: the sweep that
 * checked citations only looked at the ones that named a line, so a citation to a file that had
 * stopped existing was the single shape it was blind to.
 */
import { apiBaseFor, cloudsforgeHosts, type CloudsForgeHosts, type SurfaceKey } from '@cloudsforge/ui'
import { viewedHosts } from './viewed.ts'

/**
 * The surface this application IS, and the surface it CALLS.
 *
 * `ui/packages/ui/src/surfaces.ts` registers `developers` as a `surface` (not a product)
 * with `inSwitcher: false`, accent `#4a86e0`, glyph `⌗`, subdomain `developers` and
 * `markId: null`. It is reached from the footer rather than from the product switcher, and
 * `surfaces.ts` says why: "a developer console is something a person goes looking for, and
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
/**
 * ── IT IS `@cloudsforge/ui`'s NOW, AND THIS REPOSITORY HELD ONE OF SIXTEEN COPIES ───────────────
 *
 * The body used to live here, and in fifteen other frontends, eleven of them byte-identical. It
 * is a derivation from the registry, and the estate has been bitten three times by a second copy
 * of a registry derivation.
 *
 * The behaviour is unchanged in the case this surface was in and changes in exactly one way for
 * the case it has moved to. Same origin used to answer `''`, so requests stayed RELATIVE —
 * correct while `micro-devplatform` and this bundle shared a hostname, and wrong now the bundle is
 * `<apex>/developers`: a relative `/v1/…` then resolves at the APEX ROOT, which is micro-site's, and
 * micro-site answers its SPA shell. 200, an HTML body where JSON was expected, every panel on the
 * page in a failure state with a perfectly healthy network tab.
 *
 * `apiBaseFor` answers the surface's own MOUNT instead, and the gateway's stripPrefix takes it
 * back off before `micro-devplatform` sees it — so the SERVICE is unchanged (decision 4).
 *
 * Re-exported rather than deleted because the tests and `lib/api.ts` both name it, and a rename
 * across those for no behavioural reason is churn a reviewer has to read past.
 */
export const resolveApiBase = apiBaseFor

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
 * (`ui/packages/ui/src/index.tsx`). Served from an unknown name, the whole name becomes
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
export function isRegisteredPlacement(
  pageUrl: string,
  hostname: string,
  hosts: CloudsForgeHosts,
): boolean {
  if (isLocal(hostname)) return true
  if (!pageUrl) return true
  try {
    const registered = new URL(hosts[PRODUCT])
    const page = new URL(pageUrl)
    if (registered.origin !== page.origin) return false
    // ── AND THE MOUNT, WITHOUT WHICH THIS CHECK STOPPED CHECKING ANYTHING ────────────────────
    //
    // This compared ORIGINS alone, and it took an argument called `pageOrigin`. That was a
    // complete test while this console lived on `developers.<apex>`: only one surface answered
    // on that hostname, so matching the origin matched the surface.
    //
    // On the apex it is not. `https://cloudsforge.online` is the origin of the marketing site,
    // Forge Market, Forge Journal, the exchange and eight more — so an origin comparison is
    // TRUE FOR ALL OF THEM and this function returned `true` for every address in the estate. It
    // did not start reporting a false placement; it stopped being able to report one at all,
    // which is the failure a security control has when nobody is looking at it.
    //
    // The registered URL is now `https://<apex>/developers`, so the mount is the discriminator
    // and comparing it back is what makes the answer mean something again. `startsWith` on a
    // SEGMENT boundary, not a raw prefix: `/developers-staging` must not pass for `/developers`,
    // which is the same trap Traefik's `PathPrefix` has and this estate has hit before.
    const mount = registered.pathname.replace(/\/+$/, '')
    if (!mount) return true
    return page.pathname === mount || page.pathname.startsWith(`${mount}/`)
  } catch {
    return false
  }
}

/** Every CloudsForge base URL, for the current environment. */
export function hosts(): CloudsForgeHosts {
  return cloudsforgeHosts()
}

/**
 * This app's API base, resolved now. Call it per request; never cache it in a module constant.
 *
 * `viewedHosts()` rather than `cloudsforgeHosts()` is the whole of the in-place network view at
 * this layer (micro-org#459). It returns the map it was given, unchanged, until the reader picks
 * the other network in the bar, and the sibling estate's origins after that — so this line is a
 * no-op in development, in a preview deployment and for every reader who never touches the
 * switcher. The `-testnet` WEB hostnames are retired and 302 to their mainnet siblings, but `/v1`
 * on them is not: that path still answers from the testnet services, which is what makes reading
 * the other network from this page possible at all. See `lib/viewed.ts`.
 */
export function apiBase(): string {
  const origin = typeof window === 'undefined' ? '' : window.location.origin
  return resolveApiBase(origin, viewedHosts(), PRODUCT)
}

/** The page origin, or a stable placeholder when there is no document (tests, prerender). */
export function pageOrigin(): string {
  return typeof window === 'undefined' ? 'http://localhost' : window.location.origin
}

/** Whether the current address is one the registry knows. Read by the shell. */
export function placementIsKnown(): boolean {
  if (typeof window === 'undefined') return true
  // The whole address, not the origin — since the mount, the path is what identifies the
  // surface and the origin is shared with a dozen others. See the note on the function.
  return isRegisteredPlacement(window.location.href, window.location.hostname, cloudsforgeHosts())
}
