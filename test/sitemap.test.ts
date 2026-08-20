/**
 * The sitemap and robots.txt nginx serves for this surface.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * WHY THE BODIES ARE IN nginx.conf AT ALL
 *
 * A sitemap must carry ABSOLUTE URLs — the spec requires it and a crawler discards a relative
 * `<loc>` — and nothing built in this repository may name a hostname, because one image is served
 * from localhost, from a preview deployment and from the apex. `test/no-build-time-config.test.ts`
 * is the rule; this is the one document that cannot obey it and be useful at the same time.
 *
 * nginx is the component that can. It has `$host` on every request, so the addresses are composed
 * per request and the artefact stays environment-free.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * AND WHY THIS SURFACE DOES NOT USE `sitemapXml()` FROM THE DESIGN SYSTEM
 *
 * THE SHARED GENERATOR IS FOR THE APEX. It composes each sibling surface as `<subdomain>.$host`,
 * which is right on the marketing site, where `$host` IS the apex. Here `$host` is already
 * `developers.<apex>`, so the same call would emit `hub.developers.<apex>` — the two-label shape
 * `@cloudsforge/ui/surfaces.ts` records at length as unreachable, because the edge's Universal SSL
 * is a one-label wildcard and every two-label name fails the handshake.
 *
 * So this surface publishes ITS OWN public routes, derived from `ROUTES` — the same declaration the
 * navigation, the router, nginx's enumerated locations and `metaFor()`'s robots directive all come
 * from — and `robots.txt`, which has no such problem, IS generated from the design system and
 * compared byte for byte.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * AND WHY EITHER NEEDS A TEST
 *
 * A body pasted into a config file is a copy, and this estate has been bitten by exactly one of
 * those: `site/index.html`'s description drifted from its application's, the suite stayed green,
 * and every search result carried a sentence the owner had asked to have removed until somebody
 * opened the served HTML rather than the page. The block below is therefore treated as GENERATED
 * OUTPUT that happens to live in a config file.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { ENV_LABELS } from '@cloudsforge/ui'
import { PRIVATE_ROBOTS, metaFor } from '../src/lib/meta.ts'
import { ROUTES } from '../src/lib/routes.ts'
import { BASE } from '../src/lib/routes.ts'
import { publicPath } from '../src/lib/routes.ts'

const nginx = readFileSync(new URL('../nginx.conf', import.meta.url), 'utf8')

/**
 * nginx.conf with its comments removed.
 *
 * ── AN ABSENCE ASSERTION MUST NOT READ THE GRAVESTONE ─────────────────────────────────────────
 *
 * `refuses every crawler and serves no sitemap` now asserts that `location = /robots.txt` is
 * GONE — a folder has no robots.txt of its own. It failed against a config that does not have
 * one, because nginx.conf explains the removal in prose that names the directive it removed:
 *
 *   # ---- THERE WAS A `location = /robots.txt` HERE, AND THE FOLDER DELETED IT ----
 *
 * The comment is exactly what a future reader needs and exactly what breaks a raw grep. Same
 * shape as the `try_files $uri /index.html` rule, which went red against a config that documents
 * the forbidden directive in order to forbid it. So absence is checked against DIRECTIVES.
 */
const directives = nginx
  .split('\n')
  .filter((line) => !/^\s*#/.test(line))
  .join('\n')

/**
 * Every address of this surface a crawler should be handed, DERIVED rather than restated.
 *
 * The `public` flag in `src/lib/routes.ts`, which is itself read off devplatform: `GET /v1/scopes`
 * (`devplatform/src/server.ts`) and `GET /v1/apps` take no principal. `/organisations`
 * and `/projects/<id>` are behind a session gate — a crawler reaching one is redirected to sign in,
 * so listing them would be an invitation to crawl a tree of sign-in bounces.
 *
 * NOT `NAV`, which is the other tempting derivation and is wrong here: `NAV` includes
 * `/organisations` because it is a destination a signed-in developer navigates to, and being worth
 * a menu entry is a different question from being worth indexing.
 */
const PUBLIC_PATHS: readonly string[] = ROUTES.filter((r) => r.public).map((r) => `/${r.path}`)

/** The single-quoted body of a `return 200 '…';` inside an exact-match location. */
function servedBody(path: string): string {
  const block = new RegExp(`location = ${path.replace('.', '\\.')} \\{([\\s\\S]*?)\\n    \\}`).exec(
    nginx,
  )
  assert.ok(block, `nginx.conf has no exact-match location for ${path}`)
  // Anchored to a `return` at the start of its own line: `/robots.txt` also carries a CONDITIONAL
  // `if ($cf_env) { return 200 '…'; }` above it, and a regex that took the first match would read
  // the non-mainnet body and report the mainnet one as drifted.
  const body = /\n {8}return 200 '([\s\S]*?)';/.exec(block[1] ?? '')
  assert.ok(body, `the ${path} location does not return an unconditional literal body`)
  return body[1] ?? ''
}

describe('the sitemap nginx serves', () => {
  it('names no hostname — every address is composed from $host', () => {
    /*
     * THE ASSERTION THAT KEEPS THE ARTEFACT ENVIRONMENT-FREE, and the reason a document with
     * absolute URLs in it is allowed here at all. A single literal apex would make the image wrong
     * on a preview deployment and on testnet, silently, in the one document a crawler treats as
     * authoritative.
     */
    const xml = servedBody(`${BASE}/sitemap.xml`)
    assert.ok(!xml.includes('cloudsforge.online'), 'the sitemap names the production apex')
    assert.ok(!xml.includes('localhost'), 'the sitemap names localhost')
    const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1] ?? '')
    assert.ok(locs.length > 0, 'the sitemap lists nothing at all')
    for (const loc of locs) {
      // No subdomain is composed here, unlike the apex's sitemap: `$host` IS this surface.
      //
      // ── THE SCHEME IS A LITERAL `https`, AND IT HAS TO BE ────────────────────────────────────
      //
      // This asserted `$scheme://$host` and nginx.conf now emits `https://$host`. The variable
      // was a LIVE DEFECT, fixed in micro-site (wave 1), exchange-web (wave 2) and market-web
      // (wave 3a) before this: TLS ends at Cloudflare, cloudflared speaks plain HTTP to the
      // gateway and the gateway speaks plain HTTP to this container, so `$scheme` is `http` for
      // a reader who arrived over `https` — and every `<loc>` advertised an address that 301s,
      // in the one document a crawler treats as authoritative.
      //
      // What this test is FOR is unchanged and is checked above: no literal apex, no localhost.
      // `$host` is still a variable, because the host genuinely differs per request. Only the
      // scheme is fixed, because it genuinely does not.
      assert.match(loc, /^https:\/\/\$host(\/|$)/, `a <loc> is not composed: ${loc}`)
    }
  })

  it('lists every PUBLIC route, so a crawler is not left to guess', () => {
    const xml = servedBody(`${BASE}/sitemap.xml`)
    for (const path of PUBLIC_PATHS) {
      // ── `https` IS A LITERAL AND THE MOUNT IS PART OF THE ADDRESS ─────────────────────
      //
      // `$scheme` was a live defect: TLS ends at Cloudflare and every hop after it is
      // plaintext, so `$scheme` is `http` for a reader who arrived over `https` and every
      // `<loc>` advertised an address that 301s. `$host` stays a variable — the host really
      // does differ per request. And the surface is `<apex>/developers` now, so the public
      // address carries the mount; `publicPath()` in `src/lib/routes.ts` is the one crossing.
      const address = `https://$host${publicPath(path)}`
      assert.ok(xml.includes(`<loc>${address}</loc>`), `${path} is missing from the sitemap`)
    }
  })

  it('lists nothing else, and in particular no gated address and no one listing', () => {
    const xml = servedBody(`${BASE}/sitemap.xml`)
    // `https://$host`, not `$scheme://$host` — the scheme is a literal for the reason the
    // composition test above sets out at length. And the mount comes back OFF, because
    // PUBLIC_PATHS below are ROUTER paths: the sitemap publishes `/developers/apps` and the route
    // table calls it `/apps`, and this test is about the two agreeing on WHICH pages, not on how
    // they are spelled.
    const listed = [...xml.matchAll(/<loc>https:\/\/\$host([^<]*)<\/loc>/g)]
      .map((m) => m[1] ?? '')
      .map((p) => (p.startsWith(BASE) ? p.slice(BASE.length) : p))
      .map((p) => (p === '' ? '/' : p))
    assert.deepEqual([...listed].sort(), [...PUBLIC_PATHS].sort())
    // `/apps/<slug>` is unbounded — one address per listed application, minted by the service after
    // review. A static list of them in a config file would be a second opinion about which
    // applications exist, stale the moment one is approved. They are discovered from `/apps`.
    assert.ok(!/\/apps\/[a-z]/.test(xml), 'the sitemap lists an unbounded family of addresses')
    for (const gated of ['/organisations', '/projects']) {
      assert.ok(!xml.includes(gated), `${gated} is behind the session gate and is in the sitemap`)
    }
  })

  it('AGREES WITH THE ROBOTS DIRECTIVE THE PAGE ITSELF CARRIES', () => {
    /*
     * A sitemap is an invitation and a meta robots tag is an instruction, and the two disagreeing
     * is the failure mode neither one catches alone. Every address listed here must be one
     * `metaFor()` answers `index, follow` for, and every address it answers `noindex` for must be
     * absent — checked against the module rather than against a reader's memory of it.
     */
    const xml = servedBody(`${BASE}/sitemap.xml`)
    for (const path of PUBLIC_PATHS) {
      assert.notEqual(metaFor(path).robots, PRIVATE_ROBOTS, `${path} is listed and is noindex`)
    }
    for (const route of ROUTES.filter((r) => !r.public)) {
      assert.equal(metaFor(`/${route.path}`).robots, PRIVATE_ROBOTS)
      assert.ok(!xml.includes(`/${route.path}`), `/${route.path} is noindex and is listed`)
    }
  })

  it('is a well-formed urlset in the only schema crawlers implement', () => {
    const xml = servedBody(`${BASE}/sitemap.xml`)
    assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n/)
    assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/)
    assert.match(xml, /<\/urlset>$/)
  })

  it('is served as XML, because a sitemap sent as text/html is a sitemap nobody reads', () => {
    // `types { }` as well as `default_type`: without emptying the table for this location, nginx
    // maps the `.xml` in the URI to `text/xml` from its own mime types and `default_type` never
    // applies — a declaration that reads as a decision and is not one.
    assert.match(
      nginx,
      new RegExp(`location = /developers/sitemap\\.xml \\{[\\s\\S]*?types \\{ \\}[\\s\\S]*?default_type application/xml;`),
    )
  })

  it('is derived from the route table rather than typed a fourth time', () => {
    // `src/lib/routes.ts` already decides the router, the navigation, nginx's enumerated locations
    // and the robots directive. This asserts the derivation above is real.
    assert.deepEqual([...PUBLIC_PATHS], ['/', '/apps'])
    assert.equal(ROUTES.find((r) => r.path === 'organisations')?.public, false)
  })
})

describe('an environment that is not mainnet', () => {
  /**
   * The `map` that decides it, and the alternation of labels inside it.
   *
   * A testnet estate carries a testnet devplatform with its own database, its own projects and its
   * own keys. Its `/apps` directory lists test applications that look exactly like real ones, and
   * its front page describes a scope vocabulary governing credentials issued against nothing.
   * Indexed beside the real console, this is a support problem before it is an SEO one.
   */
  function alternation(): string[] {
    const map = /map \$host \$cf_env \{[\s\S]*?~\^[^\n]*?\(\?:([^)]*)\)\\\./.exec(nginx)
    assert.ok(map, 'the $cf_env map is missing from nginx.conf')
    return (map[1] ?? '').split('|')
  }

  it('recognises exactly the labels the registry reserves', () => {
    /*
     * ENV_LABELS is the estate's single list — `deploy/scripts/check-apex-prefix.py` reads the same
     * export. An alternation here that had drifted from it would either miss an environment (and
     * index it) or refuse a surface (and de-index a real one), and both fail silently.
     */
    assert.deepEqual(alternation().sort(), [...ENV_LABELS].sort())
  })

  it('refuses every crawler and serves no sitemap', () => {
    // ── THE robots.txt HALF IS GONE, AND ITS ABSENCE IS NOW THE ASSERTION ────────────────────
    //
    // This checked that a non-mainnet environment served `User-agent: * / Disallow: /` from this
    // container. Since the mount there is nothing here to serve it FROM: a crawler reads
    // robots.txt at the ORIGIN ROOT and nowhere else, so `/developers/robots.txt` is a file
    // nothing fetches on any host, and `/robots.txt` on this origin belongs to micro-site — whose
    // copy is what decides whether this surface is indexed.
    //
    // Serving one here would be a SECOND document at an address another container already owns,
    // and which of the two won would be decided by router priority rather than by anyone's
    // intent. So the block was deleted, and this asserts it stays deleted: a folder has no
    // robots.txt, and the day somebody adds one back this goes red.
    assert.doesNotMatch(directives, /location\s*=\s*\/robots\.txt/)
    assert.doesNotMatch(directives, /User-agent:/)
    // The sitemap half is unchanged and still load-bearing: an environment that must not be
    // indexed has no sitemap either, or the invitation would contradict micro-site's instruction.
    assert.match(nginx, new RegExp(`location = /developers/sitemap\\.xml \\{[\\s\\S]*?if \\(\\$cf_env\\) \\{ return 404; \\}`))
  })

  it('matches a suffixed subdomain as well as a bare environment apex', () => {
    // The environment is a SUFFIX on the first label now (`developers-testnet.`) and was an apex
    // prefix (`testnet.`) before, which put this surface at the two-label `developers.testnet.`.
    // Both shapes still resolve — surfaces.ts keeps the old one deliberately — so the pattern has
    // to catch both or half the estate stays indexable.
    const map = /map \$host \$cf_env \{[\s\S]*?\n\}/.exec(nginx)
    assert.ok(map, 'the $cf_env map is missing')
    assert.match(map[0], /\(\?:\[\^\.\]\+-\)\?/, 'the map does not allow a suffixed subdomain')
  })

  it('sits in http context, above the server block, which is the only place a map is legal', () => {
    // A conf.d file is included in http, so this is legal at the top of the file and would not be
    // legal ten lines down. nginx refuses to start on the other version, which is a loud failure —
    // but it fails at deploy rather than at review, and this is review.
    assert.ok(nginx.indexOf('map $host $cf_env') < nginx.indexOf('server {'))
  })
})

describe('robots.txt', () => {
  it('is not served by this image at all, because the origin root is micro-site\'s', () => {
    /*
     * ── THE BLOCK THAT WAS HERE IS GONE, AND SO IS THE ONE IN nginx.conf ────────────────────────
     *
     * It asserted that `location = /robots.txt` regenerated `robotsTxt()` and carried an absolute
     * `Sitemap:` line. Both were right while this surface was a hostname.
     *
     * A crawler reads robots.txt at the ORIGIN ROOT and nowhere else. Now the surface is
     * `<apex>/developers`, `/developers/robots.txt` is a file nothing would fetch — so the rules were not
     * relocated, they STOPPED BEING THIS BUNDLE'S TO MAKE. micro-site owns `/robots.txt` on this
     * origin, and its own suite asserts a `Sitemap:` line for every consolidated surface.
     *
     * The absence is asserted BOTH ways: no location in nginx.conf, and no static file either. An
     * unreachable config file is not a safety net — it is a thing a future reader finds, believes,
     * and reasons from.
     */
    // Comments stripped: the deleted block left one saying so, which necessarily contains the
    // words `location = /robots.txt` — a raw search finds its own explanation.
    const directives = nginx.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n')
    assert.ok(
      !/location = \/(?:developers\/)?robots\.txt/.test(directives),
      'this image serves a robots.txt again; the origin root is micro-site\'s',
    )
    assert.equal(
      existsSync(new URL('../public/robots.txt', import.meta.url)),
      false,
      'public/robots.txt is back, and nothing on this origin would fetch it',
    )
  })
})

describe('the security headers on the documents this file adds', () => {
  it('are repeated in both new locations, because add_header does not accumulate', () => {
    // A location that declares ANY add_header inherits NONE from the server level. Both blocks set
    // Cache-Control, so both have to restate the three security headers or ship without them.
    // ONE DOCUMENT, NOT TWO. `/robots.txt` was in this list and its location no longer exists:
    // a crawler reads robots.txt at the ORIGIN ROOT and nowhere else, so a folder has none and
    // micro-site's is the copy that decides whether this surface is indexed. The sitemap is
    // mounted rather than deleted, because a sitemap is fetched at whatever address announces it
    // and the apex's robots.txt announces this one by its full path.
    for (const path of [`${BASE}/sitemap.xml`]) {
      const block = new RegExp(
        `location = ${path.replace('.', '\\.')} \\{([\\s\\S]*?)\\n    \\}`,
      ).exec(nginx)
      assert.ok(block, `no location for ${path}`)
      const body = block[1] ?? ''
      assert.match(body, /X-Content-Type-Options "nosniff"/)
      // DENY, not SAMEORIGIN. Every screen behind this app's session gate creates or revokes a
      // credential and nothing anywhere has a reason to frame that; `test/routes.test.ts` asserts
      // the word SAMEORIGIN appears nowhere in this file, so copying a sibling's block verbatim
      // fails there rather than shipping a weaker header on two documents.
      assert.match(body, /X-Frame-Options "DENY"/)
      assert.match(body, /Referrer-Policy "strict-origin-when-cross-origin"/)
    }
  })

  it('are repeated in /assets/ too, which is the location that serves the code', () => {
    const block = new RegExp(`location ${BASE}/assets/ \\{([\\s\\S]*?)\\n {4}\\}`).exec(nginx)
    assert.ok(block, `no ${BASE}/assets/ location`)
    assert.match(block[1] ?? '', /X-Content-Type-Options "nosniff"/)
  })
})
