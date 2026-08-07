/**
 * Per-route document metadata: the title, the description, the canonical address and the card.
 *
 * ── It is derived from the surface registry, not typed out here ───────────────────────────────
 *
 * `surfaceMeta('developers', …)` in `@cloudsforge/ui/seo` reads this surface's registry row for
 * the name, the blurb and — the field that was genuinely absent estate-wide — whether a crawler is
 * invited at all. That module's header records why: the estate's SEO position was not "missing",
 * it was sixteen independent copies of a name and a blurb the registry already held, and at least
 * one of those copies had already drifted from the page it described.
 *
 * So this file declares only what the registry cannot know: which of this console's addresses is
 * which page, and which of them must NOT be indexed even though the surface as a whole may be.
 *
 * ── Most of this console is `noindex`, and that is a decision rather than a default ────────────
 *
 * `robotsDirective` answers `index, follow` for `developers`, because the row is `servesUi: true`
 * and not `adminOnly`. That is right for the two public pages and wrong for everything else: an
 * organisation page, a project, a key list and a usage chart are all somebody's private
 * configuration behind a session gate, and a crawler that reaches one is either being redirected
 * to sign in — an indexed sign-in bounce — or, if the gate ever slips, indexing a customer's
 * project names. `PageMetaInput.robots` exists for exactly this case and it is used below for
 * every gated address.
 *
 * The two public ones are public because the SERVICE made them public: `GET /v1/scopes`
 * (`devplatform/src/server.ts`), `GET /v1/apps` and `GET /v1/apps/:slug`
 * read no credential at all. `src/lib/routes.ts` carries the same distinction as `public`, and
 * `test/meta.test.ts` asserts the two agree — so a route that is gated and indexable, or public and
 * hidden, fails the build rather than being noticed by a crawler.
 *
 * ── The limitation, stated rather than glossed ────────────────────────────────────────────────
 *
 * This is a single-page application with ONE `index.html`. The tags below are applied by script on
 * navigation, which browsers and the crawlers that execute JavaScript see, and which the
 * link-preview fetchers used by chat clients generally do not. Those get whatever the shell
 * carries, for every address — which is why `ROOT_DESCRIPTION` below and `index.html` are asserted
 * identical rather than merely intended to be.
 *
 * ── No hostnames ─────────────────────────────────────────────────────────────────────────────
 *
 * Nothing here names a host. The canonical and the card both want to be absolute, so the absolute
 * form is assembled at RUNTIME from the origin the page was served on. One image therefore serves
 * localhost, a preview deployment and production, which is the property this whole repository is
 * arranged around (`test/no-build-time-config.test.ts`).
 */
import { normalisePath, surfaceMeta, type SurfaceMeta } from '@cloudsforge/ui/seo'
import { PRODUCT } from './hosts.ts'
import { PROJECT_SECTIONS } from './routes.ts'

/**
 * What a gated address tells a crawler.
 *
 * Both halves, because neither is sufficient: `noindex` stops the indexing and `nofollow` stops
 * the crawl from spending itself walking a tree of addresses that all answer a sign-in redirect.
 */
export const PRIVATE_ROBOTS = 'noindex, nofollow'

/**
 * The description of this surface as a whole.
 *
 * It replaces the registry-composed one, which would be "Projects, keys, webhooks and docs." plus
 * the company line. That is a correct sentence and a weak search result: it says what the console
 * contains and not the one property a developer most needs to know BEFORE they use it. This string
 * is the one that ends up under the link, so it says the irreversible thing.
 *
 * `index.html` carries the same bytes, because a link-preview fetcher never runs this module.
 * `test/meta.test.ts` compares the two and fails on a character — the drift that this estate has
 * already shipped once, in `site`, where the shell and the application disagreed about the home
 * page's own description for as long as it took somebody to open the served HTML.
 */
export const ROOT_DESCRIPTION =
  'Enrol an organisation, create a project, and issue an API key with exactly the scopes it ' +
  "needs. A key's secret is shown once and cannot be recovered."

/** The directory's own description: the one other page a person who is not a developer may reach. */
export const DIRECTORY_DESCRIPTION =
  'Applications built on the CloudsForge Developer Platform, listed after review. Each entry names ' +
  'who publishes it and which scopes it asks for.'

/**
 * The metadata for an address.
 *
 * A pure function of the pathname: it touches no DOM, so `test/meta.test.ts` can assert the title
 * and the robots directive of every address this console serves — including the ones nobody
 * remembers to open — without booting a browser.
 *
 * An unknown address gets the not-found metadata rather than the front page's. A 404 that presents
 * itself as the front door in a browser tab and in a link preview is the same dishonesty as a 404
 * served with a 200, one layer up — which is what `nginx.conf` exists to refuse.
 */
export function metaFor(pathname: string): SurfaceMeta {
  const path = normalisePath(pathname)
  const segments = path.split('/').filter(Boolean)
  const head = segments[0]

  if (head === undefined) {
    // The root is the platform page and the scope vocabulary. Its title is the surface name
    // unsuffixed — `surfaceMeta` refuses to render "Developer Platform — Developer Platform".
    return surfaceMeta(PRODUCT, { description: ROOT_DESCRIPTION, path: '/' })
  }

  if (head === 'apps') {
    const slug = segments[1]
    if (slug === undefined && segments.length === 1) {
      return surfaceMeta(PRODUCT, {
        title: 'Application directory',
        description: DIRECTORY_DESCRIPTION,
        path: '/apps',
      })
    }
    if (slug !== undefined && segments.length === 2) {
      /*
       * One listing. The title is the SLUG rather than the application's name, and that is the
       * honest version: the shell applies metadata on navigation, before the page has fetched
       * anything, so a name here would either be blank on first paint or would be the previous
       * listing's name — which is the exact bug `applyHead` updates tags in place to avoid, one
       * level up. The slug is in the address the reader followed and is therefore already true.
       *
       * The slug ALONE, not "<slug> — Application directory": `surfaceMeta` appends the surface
       * name, so that spelling produced a three-part title — "ledger-tools — Application directory
       * — Developer Platform" — which is 56 characters of chrome around one word and is truncated
       * in a tab before the reader reaches the part that identifies the page. The directory is
       * named in the description instead, where there is room for it.
       */
      return surfaceMeta(PRODUCT, {
        title: slug,
        description: DIRECTORY_DESCRIPTION,
        path,
      })
    }
  }

  /*
   * THE DEPTHS ARE EXACT, AND THAT IS THE CORRECTION THIS FUNCTION MOST NEEDED.
   *
   * `app.tsx` renders `organisations` and `organisations/:id` and nothing deeper; react-router
   * fails the whole branch for `/organisations/a/b` and falls to `path="*"`, which is
   * `NotFoundPage`. A `segments.length >= 1` test here would title that address "Organisation"
   * while the page under it says there is nothing at this address — the tab and the body
   * disagreeing about whether the page exists, which is the same dishonesty as a 404 served with a
   * 200 one layer up. `test/meta.test.ts` walks the over-deep form of every route for this.
   */
  if (head === 'organisations' && segments.length <= 2) {
    return surfaceMeta(PRODUCT, {
      title: segments.length === 1 ? 'Your organisations' : 'Organisation',
      path,
      robots: PRIVATE_ROBOTS,
    })
  }

  // `/projects` bare is deliberately NOT a page — nginx 404s it and `bare: false` in routes.ts is
  // where that is declared — so only `/projects/<id>` and `/projects/<id>/<section>` are titled.
  if (head === 'projects' && (segments.length === 2 || segments.length === 3)) {
    const title = sectionTitle(segments[2])
    if (title !== null) return surfaceMeta(PRODUCT, { title, path, robots: PRIVATE_ROBOTS })
  }

  return surfaceMeta(PRODUCT, { title: 'Not found', path, robots: PRIVATE_ROBOTS })
}

/**
 * The title of one section of a project, or `null` when the segment is not a section.
 *
 * READ OFF `PROJECT_SECTIONS`, not restated. That list is what the project's own sub-navigation
 * renders and what `test/routes.test.ts` checks the router against; a second copy of the five
 * labels here would be a second opinion about which sections exist, and the copy is the one that
 * goes stale. `test/meta.test.ts` asserts every entry in it resolves to a title, so a sixth section
 * added to the list without a screen — or with one — cannot arrive untitled.
 *
 * `null` rather than a fallback title, because `/projects/<id>/nope` matches no child route: the
 * branch fails, `path="*"` renders `NotFoundPage`, and the head has to say so too.
 */
function sectionTitle(segment: string | undefined): string | null {
  return PROJECT_SECTIONS.find((s) => s.segment === (segment ?? ''))?.label ?? null
}
