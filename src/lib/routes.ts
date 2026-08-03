/**
 * The route table, as data, in one place.
 *
 * Three files describe this app's addresses and all three have to agree:
 *
 *   1. `src/lib/routes.ts` — this file, from which the sub-navigation is derived,
 *   2. `src/app.tsx`       — which component renders at each path,
 *   3. `nginx.conf`        — which addresses are served the app shell at all.
 *
 * The third is the one that bites, and it bites late. nginx enumerates the real routes and 404s
 * everything else ON PURPOSE, so that a wrong address answers 404 rather than 200 — an app that
 * answers 200 for every address serves its "page not found" screen as a success, which crawlers
 * index and monitors call healthy.
 *
 * On this surface the address that matters is `/projects/<uuid>/keys`: the page a developer
 * bookmarks and reloads while an integration is failing. A mistyped one answering 200 with an
 * empty key list would look exactly like a project whose keys had been revoked.
 *
 * The price of that honesty is this list, in triplicate, so `test/routes.test.ts` reads
 * `nginx.conf` and `app.tsx` and fails the build when either has drifted. "Remember to update
 * nginx.conf" is not a mechanism; a test is.
 *
 * This module deliberately imports nothing — not React, not the router — so the test that reads it
 * does not have to boot a browser to find out what the routes are.
 */

export interface AppRoute {
  /** The top-level path segment, without a leading slash. `''` is the index route. */
  readonly path: string
  /** The sub-navigation label, or null for a route that is reachable but not offered. */
  readonly label: string | null
  /** True when the route owns everything beneath it (`/projects/<uuid>/keys`). */
  readonly wildcard: boolean
  /**
   * True when the SEGMENT ITSELF is an address this app owns.
   *
   * `/organisations` and `/apps` are pages. `/projects` is not: there is nothing to render without
   * a project id, and the only honest answer at that address is a 404. This is not a detail —
   * nginx enumerates by prefix, so without this distinction `location ~ ^/(…|projects|…)(/|$)`
   * would serve the shell with a **200** for `/projects` and React would render "there is nothing
   * at this address" underneath it. That is precisely the lie this app's nginx.conf exists to
   * refuse, arrived at from the inside. `test/routes.test.ts` reads both location blocks and
   * checks them against this field.
   */
  readonly bare: boolean
  /**
   * True when the route renders without a session.
   *
   * Read off the SERVICE rather than chosen. `GET /v1/scopes` (`devplatform/src/server.ts:744`),
   * `GET /v1/apps` (`:1297`) and `GET /v1/apps/:slug` (`:1325`) read no credential at all — their
   * handlers take no principal and no `authorization` header is looked at anywhere on their path.
   * Putting a screen built from them behind the session gate would send an anonymous visitor to
   * sign in to read something the service would have handed them.
   */
  readonly public: boolean
}

export const ROUTES: readonly AppRoute[] = [
  // ────────────────────────────────────────────────────────────────────────────────────────────
  // THE INDEX IS THE PLATFORM AND THE SCOPE VOCABULARY, AND IT IS PUBLIC.
  //
  // `GET /v1/scopes` is served to anybody, and `devplatform/src/server.ts:740-742` says why: it "is
  // a property of the platform rather than of any customer, and a developer choosing scopes before
  // they have a key is exactly who needs it". The person this page is written for has not signed
  // in yet and is deciding whether to.
  // ────────────────────────────────────────────────────────────────────────────────────────────
  { path: '', label: 'The platform', wildcard: false, bare: true, public: true },
  // Your developer organisations: which identity organisations you administer, which are enrolled,
  // and the projects inside one. Wildcard: `/organisations/<uuid>` is one enrolled organisation.
  // Behind the gate: `POST /v1/organisations` needs a user token AND an admin role
  // (`devplatform/src/server.ts:778`, `:784-785`).
  { path: 'organisations', label: 'Organisations', wildcard: true, bare: true, public: false },
  // One project and everything hanging off it — keys, webhooks, OAuth clients, usage, the
  // directory listing. Wildcard, because `/projects/<uuid>/keys` and its four siblings are
  // addresses a developer bookmarks. Behind the gate: every route under it is `project:read` or
  // `project:write` (`devplatform/src/server.ts:604`).
  { path: 'projects', label: null, wildcard: true, bare: false, public: false },
  // ────────────────────────────────────────────────────────────────────────────────────────────
  // THE PUBLIC DIRECTORY, WHICH IS THE ONE PART OF THIS PRODUCT AIMED AT SOMEBODY WHO IS NOT A
  // DEVELOPER.
  //
  // `GET /v1/apps` filters to `status = 'listed'` inside its own query
  // (`devplatform/src/applications.ts:323-326`), so nothing unreviewed can reach it by a caller
  // forgetting a filter. Wildcard: `/apps/<slug>` is one listing.
  // ────────────────────────────────────────────────────────────────────────────────────────────
  { path: 'apps', label: 'Directory', wildcard: true, bare: true, public: true },
]

/** What the sub-navigation renders, with the leading slash a `NavLink` wants. */
export const NAV: ReadonlyArray<{ to: string; label: string }> = ROUTES.filter(
  (route): route is AppRoute & { label: string } => route.label !== null,
).map((route) => ({ to: `/${route.path}`, label: route.label }))

/** Every path nginx has to serve the shell for, excluding the index. */
export const NON_INDEX_PATHS: readonly string[] = ROUTES.filter((r) => r.path !== '').map(
  (r) => r.path,
)

/** The segments that are addresses in their own right, and the ones that are only prefixes. */
export const BARE_PATHS: readonly string[] = ROUTES.filter((r) => r.path !== '' && r.bare).map(
  (r) => r.path,
)
export const PREFIX_ONLY_PATHS: readonly string[] = ROUTES.filter(
  (r) => r.path !== '' && !r.bare,
).map((r) => r.path)

/** The five sections of one project, in the order the sub-navigation renders them. */
export const PROJECT_SECTIONS: ReadonlyArray<{ segment: string; label: string }> = [
  { segment: '', label: 'Overview' },
  { segment: 'keys', label: 'API keys' },
  { segment: 'webhooks', label: 'Webhooks' },
  { segment: 'oauth', label: 'OAuth clients' },
  { segment: 'usage', label: 'Usage' },
]

/**
 * A route this app owns, deep enough to prove the SPA fallback works.
 *
 * Passed to CI as the deep-link probe. It must be a REAL address — a probe against a path the app
 * does not own proves only that the 404 page renders, which is the opposite of what the check is
 * for. This one is a project's key list, which is the address a developer is most likely to reload
 * while an integration is failing, and it is two segments deeper than the wildcard it sits under.
 */
export const DEEP_LINK_PATH = '/projects/5c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f/keys'
