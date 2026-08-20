/**
 * The three descriptions of this app's addresses, checked against each other.
 *
 *   1. `src/lib/routes.ts` — the declaration, from which the navigation is derived.
 *   2. `src/app.tsx`       — which component renders at each path.
 *   3. `nginx.conf`        — which addresses are served the app shell at all.
 *
 * The third is what makes this test worth having. nginx enumerates the real routes and 404s
 * everything else on purpose, so that a wrong address answers 404 rather than 200 — an app that
 * answers 200 for every address serves its "page not found" screen as a success, which crawlers
 * index and monitors call healthy.
 *
 * The price of that honesty is that a route added to the router and not to nginx works perfectly
 * under `pnpm dev` and 404s on the first hard refresh in production. That failure survives review
 * because nothing about the diff looks wrong. This test is the mechanism instead.
 *
 * It reads `app.tsx` as TEXT rather than importing it: importing would pull in React, the router
 * and every page, and this suite deliberately has no DOM.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import {
  BASE,
  BARE_PATHS,
  DEEP_LINK_PATH,
  NAV,
  NON_INDEX_PATHS,
  PREFIX_ONLY_PATHS,
  PROJECT_SECTIONS,
  ROUTES,
} from '../src/lib/routes.ts'

const read = (file: string): string => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')

const appSource = read('src/app.tsx')
const nginx = read('nginx.conf')
const ci = read('.github/workflows/ci.yml')

/**
 * nginx.conf with its comments removed.
 *
 * The file's own header quotes the directive it forbids, in order to explain why the routes are
 * enumerated by hand — so a grep over the raw text matches the warning and fails a correct file.
 * The rule is about DIRECTIVES; strip the prose before checking it.
 */
const directives = nginx
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('#'))
  .join('\n')

/**
 * The segments nginx serves the shell for, and whether the segment ITSELF is one of them.
 *
 * Two shapes, because two things are being said. `^/(a|b)(/|$)` serves the segment and everything
 * under it; `^/c/` serves only what is under it, and `/c` on its own falls through to the 404. That
 * distinction is `bare` in src/lib/routes.ts, and it is the difference between an honest 404 and
 * this app's own "there is nothing at this address" page served with a 200.
 */
function nginxServed(): { bare: string[]; prefixOnly: string[] } {
  // ── BOTH BLOCKS ARE MOUNTED, AND THIS RETURNS ROUTER PATHS EITHER WAY ──────────────────────
  //
  // nginx enumerates `^<BASE>/(organisations|apps)(/|$)` and `^<BASE>/projects/` since wave 3g.
  // These patterns were anchored on a bare `^/`, so after the mount the first matched NOTHING and
  // the second matched `developers` — which then failed as "nginx.conf serves /developers, which
  // is not in the route table". Two failures, neither describing the actual difference.
  //
  // The mount goes into the PATTERN and comes back off the RESULT, so every caller below keeps
  // comparing against `NON_INDEX_PATHS`, `BARE_PATHS` and `PREFIX_ONLY_PATHS` — which are router
  // paths, and are the source this file exists to hold nginx against.
  const mount = BASE.replace(/\//g, '\\/')
  const bare = [
    ...directives.matchAll(new RegExp(`location\\s+~\\s+\\^${mount}\\/\\(([^)]+)\\)\\(\\/\\|\\$\\)`, 'g')),
  ].flatMap((m) => (m[1] ?? '').split('|').map((p) => p.trim()))
  const prefixOnly = [
    ...directives.matchAll(new RegExp(`location\\s+~\\s+\\^${mount}\\/([a-z-]+)\\/`, 'g')),
  ].map((m) => m[1] ?? '')
  assert.ok(bare.length + prefixOnly.length > 0, 'nginx.conf has no enumerated route block')
  return { bare, prefixOnly }
}

describe('the route declaration', () => {
  it('is not empty, so this whole file cannot pass for the wrong reason', () => {
    assert.ok(ROUTES.length >= 4, `expected the route table, found ${ROUTES.length} entries`)
  })

  it('has exactly one index route, and it is the public scope vocabulary', () => {
    // A developer platform's front page has to answer "what can a credential here actually do" to
    // somebody who has not signed in. A gated index would send that visitor to a sign-in form
    // instead — and `GET /v1/scopes` is public precisely so that it does not have to.
    const index = ROUTES.filter((r) => r.path === '')
    assert.equal(index.length, 1)
    assert.equal(index[0]?.label, 'The platform')
    assert.equal(index[0]?.public, true)
  })

  it('declares no duplicate path', () => {
    const paths = ROUTES.map((r) => r.path)
    assert.equal(new Set(paths).size, paths.length)
  })

  it('declares no path with a slash: these are TOP-LEVEL segments', () => {
    // nginx matches on the first segment and everything under it. A declaration of
    // `projects/keys` would produce a location block that does not mean what it says.
    for (const route of ROUTES) {
      assert.ok(!route.path.includes('/'), `${route.path} is not a top-level segment`)
    }
  })

  it('marks every non-index route as a wildcard, because each has pages under it', () => {
    for (const route of ROUTES) {
      if (route.path === '') continue
      assert.equal(route.wildcard, true, `/${route.path} owns pages beneath it and is not a wildcard`)
    }
  })

  it('offers three routes and hides one, and the hidden one is /projects', () => {
    // `label: null` is "reachable and deliberately not offered". `/projects` has nothing to
    // navigate TO without a project id: a nav entry would lead to a screen that can only say "pick
    // one". It is arrived at from an organisation, and it is enumerated in nginx and covered by
    // this test exactly like the others.
    const hidden = ROUTES.filter((r) => r.label === null).map((r) => r.path)
    assert.deepEqual(hidden, ['projects'])
  })
})

describe('which routes are public matches which routes devplatform leaves unauthenticated', () => {
  /**
   * THE ASSERTION THIS FILE EXISTS FOR, ALONGSIDE THE nginx ONE.
   *
   * `GET /v1/scopes` (`devplatform/src/server.ts`), `GET /v1/apps` and
   * `GET /v1/apps/:slug` read no credential at all. Gating a screen built from them would
   * send a visitor to sign in for a page the service would have served them — and the estate has
   * already shipped the mirror-image defect, a client sending a bearer to a route with no
   * authentication and then reasoning about a 403 that was never about authorisation.
   */
  it('the index and the directory are public; the credential screens are gated', () => {
    const publicPaths = ROUTES.filter((r) => r.public).map((r) => r.path)
    assert.deepEqual(publicPaths, ['', 'apps'])
    const gated = ROUTES.filter((r) => !r.public).map((r) => r.path)
    assert.deepEqual(gated, ['organisations', 'projects'])
  })

  it('every gated route is wrapped in ProtectedRoute in app.tsx, and no public one is', () => {
    // Read as text, per the note at the top. EVERY element under a route segment is checked, not
    // only the first — `/organisations` and `/organisations/:id` are two elements and gating one of
    // them would otherwise pass.
    for (const route of ROUTES) {
      if (route.path === '') continue
      const elements = [...appSource.matchAll(new RegExp(`path="${route.path}(?:/[^"]*)?"`, 'g'))]
      assert.ok(elements.length > 0, `app.tsx has no route for /${route.path}`)
      for (const match of elements) {
        const at = match.index
        // The element for this route runs from its path attribute to the next `<Route`.
        const next = appSource.indexOf('<Route', at + 1)
        const element = appSource.slice(at, next === -1 ? undefined : next)
        assert.equal(
          element.includes('<ProtectedRoute>'),
          !route.public,
          `${match[0]} is ${route.public ? 'public' : 'gated'} in routes.ts but not in app.tsx`,
        )
      }
    }
  })

  it('the index route is not gated', () => {
    const at = appSource.indexOf('<Route index')
    const next = appSource.indexOf('<Route', at + 1)
    assert.doesNotMatch(appSource.slice(at, next), /ProtectedRoute/)
  })
})

describe('the navigation', () => {
  it('is derived from the declaration rather than restated', () => {
    const labelled = ROUTES.filter((r) => r.label !== null)
    assert.equal(NAV.length, labelled.length)
    assert.deepEqual(
      NAV.map((n) => n.to),
      labelled.map((r) => `/${r.path}`),
    )
  })

  it('points the first entry at the index, with the leading slash a NavLink needs', () => {
    assert.equal(NAV[0]?.to, '/')
  })

  it('offers the organisations and the directory, and not the bare project route', () => {
    assert.ok(NAV.some((n) => n.to === '/organisations'))
    assert.ok(NAV.some((n) => n.to === '/apps'))
    assert.ok(!NAV.some((n) => n.to === '/projects'))
  })
})

describe('the router', () => {
  it('renders a route element for every BARE path', () => {
    for (const path of BARE_PATHS) {
      assert.match(appSource, new RegExp(`path="${path}"`), `app.tsx has no route for /${path}`)
    }
  })

  it('renders NO element for a prefix-only path, because there is no screen there', () => {
    // The router half of the same rule. A `<Route path="projects">` with an element would render
    // something at an address nginx correctly 404s, and the two would disagree about what exists.
    for (const path of PREFIX_ONLY_PATHS) {
      assert.doesNotMatch(
        appSource,
        new RegExp(`path="${path}"[^/]`),
        `app.tsx renders a screen at /${path}, which nginx answers 404 for`,
      )
      // …but it must still render everything beneath it.
      assert.match(appSource, new RegExp(`path="${path}/`), `app.tsx has no routes under /${path}`)
    }
  })

  it('renders the five project sections declared in PROJECT_SECTIONS', () => {
    // The sub-navigation and the router are two lists of the same thing, so they are checked
    // against each other rather than each against a reader's memory.
    for (const section of PROJECT_SECTIONS) {
      if (section.segment === '') {
        assert.match(appSource, /<Route index element={<ProjectOverviewPage/)
        continue
      }
      assert.match(
        appSource,
        new RegExp(`path="${section.segment}"`),
        `app.tsx has no project section for ${section.segment}`,
      )
    }
  })

  it('renders the two detail routes', () => {
    assert.match(appSource, /path="organisations\/:id"/)
    assert.match(appSource, /path="apps\/:slug"/)
    assert.match(appSource, /path="projects\/:id"/)
  })

  it('has an index route', () => {
    assert.match(appSource, /<Route\s+index/)
  })

  it('has a catch-all, so an unknown address renders inside the shell', () => {
    assert.match(appSource, /path="\*"/)
  })
})

describe('nginx serves exactly the routes that exist', () => {
  it('enumerates every non-index path, in one block or the other', () => {
    const { bare, prefixOnly } = nginxServed()
    const served = [...bare, ...prefixOnly]
    for (const path of NON_INDEX_PATHS) {
      assert.ok(served.includes(path), `nginx.conf does not serve /${path}`)
    }
  })

  it('enumerates nothing that is not a route', () => {
    const { bare, prefixOnly } = nginxServed()
    for (const path of [...bare, ...prefixOnly]) {
      assert.ok(
        NON_INDEX_PATHS.includes(path),
        `nginx.conf serves /${path}, which is not in the route table`,
      )
    }
  })

  it('SERVES A BARE SEGMENT ONLY WHEN THE ROUTE TABLE SAYS IT IS AN ADDRESS', () => {
    // The assertion this split exists for. `/projects` has no screen; serving it the shell would
    // answer 200 for an address this app does not own, and React would render "there is nothing at
    // this address" underneath that success — the lie the whole file refuses, arrived at from the
    // inside rather than from a typo.
    const { bare, prefixOnly } = nginxServed()
    assert.deepEqual([...bare].sort(), [...BARE_PATHS].sort())
    assert.deepEqual([...prefixOnly].sort(), [...PREFIX_ONLY_PATHS].sort())
  })

  it('serves the index', () => {
    assert.match(directives, new RegExp(`location = /developers\\s*\\{`))
  })

  it('does NOT use the SPA 200-fallback', () => {
    // `try_files $uri /index.html` serves the bundle with a 200 for every address in existence.
    assert.doesNotMatch(directives, /try_files\s+\$uri\s+(\$uri\/\s+)?\/index\.html/)
  })

  it('keeps the honest 404 through error_page', () => {
    assert.match(directives, new RegExp(`error_page 404 /developers/index\\.html`))
  })

  it('404s a missing asset rather than serving the shell for it', () => {
    // A JavaScript request answered with HTML fails with a syntax error naming the wrong file.
    assert.match(directives, new RegExp(`location /developers/assets/\\s*\\{\\s*try_files \\$uri =404`))
  })

  it('sets the three security headers at the server level', () => {
    for (const header of ['X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy']) {
      assert.match(directives, new RegExp(`add_header ${header}`), header)
    }
  })

  it('DENIES framing, because a credential console has no legitimate embed', () => {
    // The public product surfaces use SAMEORIGIN and have to: they have real embeds inside Hub.
    // Every screen behind this app's session gate creates or revokes a credential, and nothing
    // anywhere has a reason to frame that. Asserted in both directions so the difference stays a
    // decision rather than a copy of whichever sibling was open at the time.
    assert.match(directives, /X-Frame-Options "DENY"/)
    assert.doesNotMatch(directives, /X-Frame-Options "SAMEORIGIN"/)
  })

  it('does NOT tell robots to stay away: the scope vocabulary and the directory are public pages', () => {
    assert.doesNotMatch(directives, /X-Robots-Tag/)
  })

  it('restates the security headers in EVERY location that sets Cache-Control', () => {
    // nginx's add_header is all-or-nothing per level: a location that declares ANY add_header
    // inherits NONE from its parent. The template's `location /assets/` stripped nosniff from
    // every hashed script in every frontend cut from it.
    const blocks = directives.split(/location\s/).slice(1)
    for (const block of blocks) {
      if (!block.includes('Cache-Control')) continue
      assert.match(block, /X-Content-Type-Options/, `a Cache-Control location without nosniff`)
      assert.match(block, /X-Frame-Options/, `a Cache-Control location without frame-options`)
      assert.match(block, /Referrer-Policy/, `a Cache-Control location without referrer-policy`)
    }
  })

  it('never caches the shell', () => {
    const root = new RegExp(`location = /developers\\s*\\{([^}]*)\\}`).exec(directives)?.[1] ?? ''
    assert.match(root, /Cache-Control "no-store"/)
  })

  it('caches hashed assets immutably', () => {
    const assets = new RegExp(`location /developers/assets/\\s*\\{([^}]*)\\}`).exec(directives)?.[1] ?? ''
    assert.match(assets, /immutable/)
  })
})

describe('the CI deep-link probe names a real route', () => {
  it('is a path this app owns', () => {
    const segment = DEEP_LINK_PATH.split('/')[1] ?? ''
    assert.ok(
      NON_INDEX_PATHS.includes(segment),
      `${DEEP_LINK_PATH} starts at /${segment}, which is not a route`,
    )
  })

  it('is deep enough to exercise the wildcard rather than the top-level location', () => {
    assert.ok(DEEP_LINK_PATH.split('/').length >= 3, `${DEEP_LINK_PATH} is not a deep link`)
  })

  it('lands under a route declared as a wildcard', () => {
    const segment = DEEP_LINK_PATH.split('/')[1]
    assert.equal(ROUTES.find((r) => r.path === segment)?.wildcard, true)
  })

  it('names a project SECTION, not only a project, so the nested router is exercised too', () => {
    const section = DEEP_LINK_PATH.split('/')[3] ?? ''
    assert.ok(
      PROJECT_SECTIONS.some((s) => s.segment === section),
      `${DEEP_LINK_PATH} ends at /${section}, which is not a project section`,
    )
  })

  it('is the path CI actually probes', () => {
    // A probe against a path the app does not own proves only that the 404 page renders, which is
    // the opposite of what the check is for.
    assert.ok(ci.includes(DEEP_LINK_PATH), `ci.yml does not probe ${DEEP_LINK_PATH}`)
  })

  it('CI also probes an address the app does NOT own, and requires a 404', () => {
    assert.match(ci, /nope\/not\/a\/route/)
    assert.match(ci, /"404"/)
  })
})
