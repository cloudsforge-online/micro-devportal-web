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
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { ENV_LABELS } from '@cloudsforge/ui'
import { robotsTxt } from '@cloudsforge/ui/sitemap'
import { PRIVATE_ROBOTS, metaFor } from '../src/lib/meta.ts'
import { ROUTES } from '../src/lib/routes.ts'

const nginx = readFileSync(new URL('../nginx.conf', import.meta.url), 'utf8')

/**
 * Every address of this surface a crawler should be handed, DERIVED rather than restated.
 *
 * The `public` flag in `src/lib/routes.ts`, which is itself read off devplatform: `GET /v1/scopes`
 * (`devplatform/src/server.ts:744`) and `GET /v1/apps` (`:1297`) take no principal. `/organisations`
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
    const xml = servedBody('/sitemap.xml')
    assert.ok(!xml.includes('cloudsforge.online'), 'the sitemap names the production apex')
    assert.ok(!xml.includes('localhost'), 'the sitemap names localhost')
    const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1] ?? '')
    assert.ok(locs.length > 0, 'the sitemap lists nothing at all')
    for (const loc of locs) {
      // No subdomain is composed here, unlike the apex's sitemap: `$host` IS this surface.
      assert.match(loc, /^\$scheme:\/\/\$host(\/|$)/, `a <loc> is not composed: ${loc}`)
    }
  })

  it('lists every PUBLIC route, so a crawler is not left to guess', () => {
    const xml = servedBody('/sitemap.xml')
    for (const path of PUBLIC_PATHS) {
      const address = path === '/' ? '$scheme://$host' : `$scheme://$host${path}`
      assert.ok(xml.includes(`<loc>${address}</loc>`), `${path} is missing from the sitemap`)
    }
  })

  it('lists nothing else, and in particular no gated address and no one listing', () => {
    const xml = servedBody('/sitemap.xml')
    const listed = [...xml.matchAll(/<loc>\$scheme:\/\/\$host([^<]*)<\/loc>/g)].map((m) =>
      m[1] === '' ? '/' : (m[1] ?? ''),
    )
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
    const xml = servedBody('/sitemap.xml')
    for (const path of PUBLIC_PATHS) {
      assert.notEqual(metaFor(path).robots, PRIVATE_ROBOTS, `${path} is listed and is noindex`)
    }
    for (const route of ROUTES.filter((r) => !r.public)) {
      assert.equal(metaFor(`/${route.path}`).robots, PRIVATE_ROBOTS)
      assert.ok(!xml.includes(`/${route.path}`), `/${route.path} is noindex and is listed`)
    }
  })

  it('is a well-formed urlset in the only schema crawlers implement', () => {
    const xml = servedBody('/sitemap.xml')
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
      /location = \/sitemap\.xml \{[\s\S]*?types \{ \}[\s\S]*?default_type application\/xml;/,
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
    // Both halves matter and neither is sufficient: robots.txt stops the fetch, and a sitemap that
    // still answered would be an invitation contradicting the instruction beside it.
    assert.match(nginx, /if \(\$cf_env\) \{ return 200 'User-agent: \*\\nDisallow: \/\\n'; \}/)
    assert.match(nginx, /location = \/sitemap\.xml \{[\s\S]*?if \(\$cf_env\) \{ return 404; \}/)
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
  it('is exactly what the design system generates', () => {
    // Compared with its trailing newline intact: robots.txt is a line-oriented format and a parser
    // that reads the last line only when it is terminated is a parser that silently loses the
    // Sitemap directive.
    assert.equal(
      servedBody('/robots.txt'),
      robotsTxt({ indexable: true, sitemapUrl: '$scheme://$host/sitemap.xml' }),
    )
  })

  it('points at the sitemap with an absolute address, composed rather than typed', () => {
    // A relative `Sitemap:` line is invalid per the standard and is ignored; a literal one bakes in
    // a hostname. `$scheme://$host` is the only form that is both valid and environment-free.
    assert.match(servedBody('/robots.txt'), /^Sitemap: \$scheme:\/\/\$host\/sitemap\.xml$/m)
  })

  it('is not a static file, which an exact-match location would have shadowed', () => {
    /*
     * `location = /robots.txt` wins over the `location /` prefix that serves the static tree, so a
     * file in `public/` would be deployed, unreachable, and edited by the next reader to no effect
     * — the worst of the three states, worse than either serving it or not having it. This file's
     * own header used to name robots.txt as one of the "real files" `location /` serves; it does
     * not any more, and this is what keeps the two statements in step.
     */
    for (const name of ['robots.txt', 'sitemap.xml']) {
      let present = true
      try {
        readFileSync(new URL(`../public/${name}`, import.meta.url))
      } catch {
        present = false
      }
      assert.equal(present, false, `public/${name} exists, and nginx will never serve it`)
    }
  })
})

describe('the security headers on the documents this file adds', () => {
  it('are repeated in both new locations, because add_header does not accumulate', () => {
    // A location that declares ANY add_header inherits NONE from the server level. Both blocks set
    // Cache-Control, so both have to restate the three security headers or ship without them.
    for (const path of ['/sitemap.xml', '/robots.txt']) {
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
    const block = /location \/assets\/ \{([\s\S]*?)\n {4}\}/.exec(nginx)
    assert.ok(block, 'no /assets/ location')
    assert.match(block[1] ?? '', /X-Content-Type-Options "nosniff"/)
  })
})
