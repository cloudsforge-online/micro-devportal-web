/**
 * The per-address document head, and the two copies of it that must not drift.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * WHY THE SHELL AND THE MODULE BOTH CARRY THE SAME SENTENCE
 *
 * This is a single-page application with ONE `index.html`. `DocumentMeta` in the shell applies
 * `metaFor(pathname)` on every navigation, which browsers and the crawlers that execute JavaScript
 * see — and which the link-preview fetchers used by Slack, Discord, Teams and iMessage generally do
 * not. Those get whatever the static shell carries, for every address. So the shell has to carry
 * the root's title and description itself, and the module has to carry the same ones, and there is
 * no import that can join them because a static document cannot import.
 *
 * That leaves a copy. `site` has the scar: its application's home-page description was rewritten,
 * every rendered page changed, its suite stayed green, and the tab, the search result and every
 * social card went on carrying the old sentence for as long as it took somebody to open the served
 * HTML rather than the page. This file is the mechanism instead of the memory — it compares the two
 * BYTE FOR BYTE, so a smart quote or a trimmed full stop fails the build.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * AND WHY THE ROBOTS DIRECTIVE IS CHECKED AGAINST THE ROUTE TABLE RATHER THAN READ
 *
 * `robotsDirective()` answers `index, follow` for `developers`: the registry row is `servesUi:
 * true` and not `adminOnly`. That is right for the two public pages and wrong for everything else.
 * An organisation, a project, a key list and a usage chart are somebody's private configuration
 * behind a session gate, and a crawler that reaches one is either being handed a sign-in bounce to
 * index or — if the gate ever slips — a customer's project names.
 *
 * `src/lib/routes.ts` already declares which is which, in `public`, and declares it by reading the
 * SERVICE: `GET /v1/scopes` (`devplatform/src/server.ts:744`), `GET /v1/apps` (`:1297`) and
 * `GET /v1/apps/:slug` (`:1325`) take no principal and look at no `authorization` header. Those
 * three citations were re-read against the file for this test rather than carried over. So the
 * assertion below is: for every route, `public` and the robots directive agree. A route that is
 * gated and indexable, or public and hidden, fails here rather than being noticed by a crawler.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { surfaceMeta } from '@cloudsforge/ui/seo'
import { PRODUCT } from '../src/lib/hosts.ts'
import {
  DIRECTORY_DESCRIPTION,
  PRIVATE_ROBOTS,
  ROOT_DESCRIPTION,
  metaFor,
} from '../src/lib/meta.ts'
import { DEEP_LINK_PATH, PROJECT_SECTIONS, ROUTES } from '../src/lib/routes.ts'

const HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8')

/**
 * The shell's MARKUP, with its comments stripped.
 *
 * The same treatment `tokens.test.ts` and `base-layer.test.ts` give the stylesheet, and for the
 * same reason: this file's comments QUOTE the misspelling they exist to explain — `colour-scheme`,
 * the British spelling that is not a registered meta name and therefore did nothing at all, in
 * every browser, since this surface shipped. A scan over the raw bytes finds the warning inside the
 * explanation and fails a correct file, which is a check that can only be satisfied by deleting the
 * reason. The rule is about TAGS; strip the prose before checking it.
 *
 * `test/consent.test.ts` deliberately does the opposite for the analytics tag's host, and that
 * difference is not an inconsistency: there the property being asserted is that the host appears
 * NOWHERE, comments included, so that its absence is a grep rather than an argument.
 */
const MARKUP = HTML.replace(/<!--[\s\S]*?-->/g, '')

/** The `content` of a `<meta>`, whichever way round the attributes are written. */
function metaContent(kind: 'name' | 'property', key: string): string {
  const attribute = new RegExp(
    `<meta\\s+${kind}="${key}"\\s+content="([^"]*)"|<meta\\s+${kind}="${key}"\\s*\\n?\\s*content="([^"]*)"`,
  )
  const inline = attribute.exec(HTML)
  if (inline) return inline[1] ?? inline[2] ?? ''
  // The multi-line form Prettier produces for a long content string.
  const block = new RegExp(`<meta\\s*\\n\\s*${kind}="${key}"\\s*\\n\\s*content="([^"]*)"`).exec(HTML)
  return block?.[1] ?? ''
}

describe('the shell carries the same words the application does', () => {
  it('finds the tags at all, so nothing below passes on an empty string', () => {
    assert.ok(HTML.length > 1000, 'index.html is not the shell')
    assert.ok(metaContent('name', 'description').length > 50, 'no meta description in index.html')
  })

  it("the shell's description is ROOT_DESCRIPTION, byte for byte", () => {
    assert.equal(metaContent('name', 'description'), ROOT_DESCRIPTION)
  })

  it("the shell's og:description is the same string again", () => {
    // Two copies in one file is one more chance to drift than one copy, and a social card read
    // WITHOUT the surrounding page is the easiest place to imply that a key could be recovered.
    assert.equal(metaContent('property', 'og:description'), ROOT_DESCRIPTION)
  })

  it('the description states the irreversible thing, because the search result is all some readers get', () => {
    assert.match(ROOT_DESCRIPTION, /cannot be recovered/i)
    // 50–160 characters is a description doing its job. Longer is truncated, shorter is discarded
    // and rewritten from the page.
    assert.ok(ROOT_DESCRIPTION.length >= 50, `${ROOT_DESCRIPTION.length} characters is too short`)
  })

  it("the shell's <title> is what surfaceMeta composes for the root, and not a hand-typed name", () => {
    // It read "CloudsForge Developer Platform" until 1.1 — one of the sixteen hand-typed copies of
    // a string `surfaces.ts` already held. The company prefix is carried by og:site_name and by the
    // shared bar on the page itself.
    const title = /<title>([^<]*)<\/title>/.exec(HTML)?.[1] ?? ''
    assert.equal(title, surfaceMeta(PRODUCT).title)
    assert.equal(title, metaFor('/').title)
  })

  it("the shell's og:title matches too, and og:site_name carries the company", () => {
    assert.equal(metaContent('property', 'og:title'), metaFor('/').title)
    assert.equal(metaContent('property', 'og:site_name'), 'CloudsForge')
  })

  it('declares the scheme with the attribute and the meta name a browser actually reads', () => {
    // `colour-scheme` is correct English and is not a registered meta name: it did nothing, in
    // every browser, for as long as this surface has shipped.
    assert.match(MARKUP, /<html[^>]*\sdata-cf-scheme="auto"/)
    assert.match(MARKUP, /<meta name="color-scheme" content="dark light" \/>/)
    assert.doesNotMatch(MARKUP, /colour-scheme/)
    // Both schemes, not only `dark`: `data-cf-scheme="auto"` means the token layer resolves
    // whichever palette the reader's system asks for, and declaring only `dark` here would leave
    // the chrome the browser draws disagreeing with the page around it.
    assert.doesNotMatch(MARKUP, /content="dark"/)
  })
})

describe('every address this console serves gets its own head', () => {
  it('titles the root with the surface name alone, never twice', () => {
    // `surfaceMeta` refuses to render "Developer Platform — Developer Platform" on a front door.
    assert.equal(metaFor('/').title, 'Developer Platform')
    assert.equal(metaFor('').title, 'Developer Platform')
    assert.equal(metaFor('/').description, ROOT_DESCRIPTION)
  })

  it('collapses a trailing slash rather than minting a second canonical for one page', () => {
    assert.equal(metaFor('/apps/').path, '/apps')
    assert.equal(metaFor('/apps/').title, metaFor('/apps').title)
  })

  it('gives the directory its own description, because it is the one page aimed at a non-developer', () => {
    assert.equal(metaFor('/apps').description, DIRECTORY_DESCRIPTION)
    assert.equal(metaFor('/apps').title, 'Application directory — Developer Platform')
  })

  it('titles one listing by its SLUG, which is the only name it can honestly know', () => {
    // The head is applied on navigation, before the page has fetched anything. A name here would be
    // blank on first paint or would be the PREVIOUS listing's name — the exact bug `applyHead`
    // updates tags in place to avoid, one level up. The slug is in the address the reader followed.
    assert.equal(metaFor('/apps/ledger-tools').title, 'ledger-tools — Developer Platform')
    // The directory is named in the description rather than in the title: `surfaceMeta` already
    // appends the surface name, so putting it in both produced a three-part title truncated in a
    // browser tab before the reader reached the slug.
    assert.equal(metaFor('/apps/ledger-tools').description, DIRECTORY_DESCRIPTION)
  })

  it('names every project section, read off PROJECT_SECTIONS rather than restated', () => {
    // The sub-navigation, the router and the head are three lists of the same five sections. This
    // asserts the third is DERIVED: a sixth section added to the list arrives with a title.
    for (const section of PROJECT_SECTIONS) {
      const path = `/projects/7f1e/${section.segment}`.replace(/\/$/, '')
      const meta = metaFor(path)
      assert.equal(meta.title, `${section.label} — Developer Platform`, `no title for ${path}`)
    }
  })

  it('titles the CI deep-link probe, which is the address a developer reloads most', () => {
    assert.equal(metaFor(DEEP_LINK_PATH).title, 'API keys — Developer Platform')
  })

  it('names the two organisation screens apart', () => {
    assert.equal(metaFor('/organisations').title, 'Your organisations — Developer Platform')
    assert.equal(metaFor('/organisations/7f1e').title, 'Organisation — Developer Platform')
  })
})

describe('an address this console does NOT serve is titled as one', () => {
  /**
   * Every shape the router answers with `NotFoundPage`, including the four that are one segment too
   * deep on a real route.
   *
   * A 404 presenting itself as the front door in a browser tab and in a link preview is the same
   * dishonesty as a 404 served with a 200, one layer up — which is what `nginx.conf` exists to
   * refuse. The over-deep cases are here because they are the ones a hand-written matcher gets
   * wrong: `/organisations/a/b` matches no route in `app.tsx`, react-router fails the whole branch
   * and falls to `path="*"`, and a `segments[0] === 'organisations'` test in the head would title
   * it "Organisation" while the page underneath says there is nothing there.
   */
  const NOWHERE = [
    '/nope',
    '/nope/not/a/route',
    '/projects',
    '/projects/7f1e/keys/extra',
    '/projects/7f1e/nosuchsection',
    '/organisations/7f1e/extra',
    '/apps/ledger-tools/extra',
  ]

  for (const path of NOWHERE) {
    it(`${path} is titled Not found and is noindex`, () => {
      assert.equal(metaFor(path).title, 'Not found — Developer Platform')
      assert.equal(metaFor(path).robots, PRIVATE_ROBOTS)
    })
  }

  it('keeps the address it was asked about as the canonical, rather than pretending it was /', () => {
    assert.equal(metaFor('/nope').path, '/nope')
  })
})

describe('the robots directive agrees with the route table, in both directions', () => {
  /** The head each top-level route resolves to, at the segment itself and one level under it. */
  const addressesFor = (path: string): string[] =>
    path === '' ? ['/'] : [`/${path}`, `/${path}/7f1e`]

  it('every PUBLIC route is indexable, at the segment and at a detail address under it', () => {
    // `/` and `/apps`. Sending an anonymous visitor to sign in to read the scope vocabulary — the
    // page written for somebody deciding whether to build on this platform at all — would be the
    // mirror of the estate's older mistake of sending a bearer to a route that never wanted one.
    for (const route of ROUTES.filter((r) => r.public)) {
      for (const address of addressesFor(route.path)) {
        assert.notEqual(
          metaFor(address).robots,
          PRIVATE_ROBOTS,
          `${address} is public in routes.ts and noindex in the head`,
        )
        assert.match(metaFor(address).robots, /^index, follow/)
      }
    }
  })

  it('every GATED route is noindex, nofollow, at every address beneath it', () => {
    for (const route of ROUTES.filter((r) => !r.public)) {
      const addresses = [
        ...addressesFor(route.path),
        ...PROJECT_SECTIONS.map((s) => `/${route.path}/7f1e/${s.segment}`.replace(/\/$/, '')),
      ]
      for (const address of addresses) {
        assert.equal(
          metaFor(address).robots,
          PRIVATE_ROBOTS,
          `${address} is gated in routes.ts and indexable in the head`,
        )
      }
    }
  })

  it('says both halves, because neither is sufficient on its own', () => {
    // `noindex` stops the indexing; `nofollow` stops a crawl spending itself walking a tree of
    // addresses that all answer a sign-in redirect.
    assert.equal(PRIVATE_ROBOTS, 'noindex, nofollow')
  })

  it('the public set is exactly the two the service left unauthenticated', () => {
    // Restated here as a literal ON PURPOSE, so that widening `public` in routes.ts fails a test
    // whose comment names the three service routes rather than passing quietly.
    assert.deepEqual(
      ROUTES.filter((r) => r.public).map((r) => r.path),
      ['', 'apps'],
    )
  })
})

describe('nothing here names a hostname', () => {
  it('no address, description or image in any head is absolute', () => {
    /*
     * The property this whole repository is arranged around (`test/no-build-time-config.test.ts`).
     * The canonical and the card both want to be absolute, so the absolute form is assembled at
     * RUNTIME from the origin the page was served on — one image therefore serves localhost, a
     * preview deployment and production.
     */
    for (const path of ['/', '/apps', '/apps/x', '/organisations', DEEP_LINK_PATH, '/nope']) {
      const meta = metaFor(path)
      for (const value of [meta.path, meta.image, meta.title, meta.description]) {
        assert.doesNotMatch(value, /https?:\/\//, `${path} names an origin: ${value}`)
        assert.doesNotMatch(value, /cloudsforge\.online/, `${path} names the apex: ${value}`)
      }
      assert.ok(meta.path.startsWith('/'), `${path} produced a relative canonical`)
    }
  })

  it('the card is the shared relative one', () => {
    assert.equal(metaFor('/').image, '/og-1200x630.png')
    assert.equal(metaContent('property', 'og:image'), '/og-1200x630.png')
  })
})
