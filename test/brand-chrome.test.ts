/**
 * A frontend ships its own browser chrome, or it ships none at all.
 *
 * FOUR FINISHED FRONTENDS SHIPPED WITH NO FAVICON AT ALL and went green in CI, because nothing
 * anywhere asserted that a page has an icon (18-build-status.md §3.3e). The checks below are the
 * template's, kept in both directions and unweakened.
 *
 * ── This surface's entitled set, read before anything was assumed ─────────────────────────────
 *
 * `brand/README.md` gives `developers` **mark, favicon, wordmark, og — seven files**, and
 * `brand/README.md` records the one deliberate absence: no social banner, because "a
 * repository social preview is a separate question nobody has asked". The og card IS entitled and
 * IS shipped, because "devportal-web is public and its links get shared".
 *
 * So this file asserts the og card in BOTH directions, exactly as `micro-trade-web` does — and NOT
 * a social banner, exactly as `micro-admin-web` asserts the absence of its og card. Adding either
 * one to the wrong repository turns a correct test red somewhere, which is the point.
 *
 * The mark and the wordmark exist in micro-brand and are deliberately not referenced from
 * index.html: a page needs a tab icon and a share card, and the registry carries `markId: null` for
 * this surface so the design system draws no inline mark either.
 *
 * ── And the icons must reach the IMAGE, not only the repository ────────────────────────────────
 *
 * The last two tests are the ones that matter most. The web template's Dockerfile once did not copy
 * `public/`, so every frontend cut from it built an image whose `dist/` had no icons — while a test
 * exactly like this one passed, because it reads the SOURCE tree. That is fixed upstream
 * (`web-template/Dockerfile:39`, read for this repository rather than taken on a sibling's word),
 * so the tests below are a guard rather than a correction. They are still worth their lines:
 * reading a Dockerfile is not evidence that an image serves a file, which is why the second of them
 * requires CI to CURL the running container.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const at = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url))
const HTML = readFileSync(at('index.html'), 'utf8')

/** The sizes a browser and an install prompt actually ask for. */
const REQUIRED_ICONS = ['favicon-32x32.png', 'favicon-192x192.png']

/** The card a chat client, a search result and a social post render. */
const OG_CARD = 'og-1200x630.png'

/** Where micro-brand's set for this surface is, when it is checked out. */
const BRAND = '../brand/assets/developers'

test('the icons a browser asks for are present in public/', () => {
  const missing = REQUIRED_ICONS.filter((f) => !existsSync(at(`public/${f}`)))
  assert.deepEqual(
    missing,
    [],
    `public/ is missing ${missing.join(', ')} — copy them from micro-brand's assets/developers/`,
  )
})

test('index.html links every icon it ships, and ships every icon it links', () => {
  // Both directions. A link to a file that is not there is a 404 in every tab; a file nobody links
  // is dead weight that looks like it is working.
  for (const f of REQUIRED_ICONS) {
    assert.ok(HTML.includes(f), `index.html does not link /${f}`)
  }
  for (const m of HTML.matchAll(/href="\/(favicon[^"]*)"/g)) {
    assert.ok(existsSync(at(`public/${m[1]}`)), `index.html links /${m[1]}, which is not in public/`)
  }
})

test('the icons are this surface’s own, not the template’s placeholders', (t) => {
  // The template ships the company marks so that a freshly cut frontend is never iconless. Leaving
  // them in place passes every check above and puts the wrong brand in the tab.
  //
  // Without micro-brand every iteration `continue`d and the test passed having compared NOTHING —
  // the same silent pass as an `if (!existsSync) return`, one level of nesting further in. The
  // absence is now declared once, up front, so a run that could not compare says so.
  if (!existsSync(at(BRAND))) {
    t.skip('micro-brand is not checked out; no icon was compared against its source')
    return
  }
  for (const icon of [...REQUIRED_ICONS, 'favicon-512x512.png', OG_CARD]) {
    const source = at(`${BRAND}/${icon}`)
    assert.ok(existsSync(source), `brand/assets/developers/${icon} is gone from micro-brand`)
    assert.deepEqual(
      readFileSync(at(`public/${icon}`)),
      readFileSync(source),
      `public/${icon} is not the byte-identical copy from brand/assets/developers/`,
    )
  }
})

test('the og card is shipped, because this surface’s links are shared outward', () => {
  assert.ok(existsSync(at(`public/${OG_CARD}`)), `public/${OG_CARD} is missing`)
  assert.match(HTML, /property="og:image"/, 'index.html declares no og:image')
  assert.match(HTML, /property="og:title"/, 'index.html declares no og:title')
  assert.match(HTML, /property="og:description"/, 'index.html declares no og:description')
})

test('and NO social banner, which is the one deliberate absence in this surface’s set', () => {
  // `brand/plan.ts` gives this surface `['mark', 'favicon', 'wordmark', 'og']` — not FULL. A
  // social banner here would be an asset with nowhere to go, and generating one costs money.
  assert.ok(!existsSync(at('public/social-1280x640.png')), 'a social banner has appeared in public/')
})

test('and micro-brand does not ship one either, so the absence is a DECISION', (t) => {
  // The upstream half of the rule above, split out rather than nested in an `if`. Inside the `if`
  // it was invisible: with micro-brand absent the test reported a pass having checked only the
  // local half, and "asserted in both directions" was true of the comment and not of the run.
  if (!existsSync(at(BRAND))) {
    t.skip('micro-brand is not checked out; the upstream half of "no social banner" did not run')
    return
  }
  const upstream = readdirSync(at(BRAND))
  assert.ok(
    !upstream.some((f) => f.startsWith('social')),
    'micro-brand now ships a social banner for developers; this test is out of date',
  )
  // And the entitled set really is seven files, which is what makes "no social" a decision
  // rather than an oversight.
  assert.equal(upstream.length, 7, `brand/assets/developers holds ${upstream.length} files, not 7`)
})

test('the og:image is a RELATIVE path, so the card resolves against whichever origin served it', () => {
  // An absolute one would be a hostname baked into the bundle — the exact thing this repository has
  // no build-time configuration in order to avoid.
  const m = /property="og:image"\s+content="([^"]+)"/.exec(HTML)
  assert.ok(m, 'no og:image content')
  assert.ok(m[1]?.startsWith('/'), `og:image is ${m[1]}, which is not a relative path`)
  assert.ok(existsSync(at(`public${m[1]}`)), `og:image points at ${m[1]}, which is not in public/`)
})

test('the og metadata is declared ONCE', () => {
  // foresight-web/index.html declares og:type, og:title and og:description twice. The second set
  // silently wins in every crawler and the first is dead text that nobody edits. Reported there.
  for (const property of ['og:type', 'og:title', 'og:description', 'og:image']) {
    const count = [...HTML.matchAll(new RegExp(`property="${property}"`, 'g'))].length
    assert.equal(count, 1, `${property} is declared ${count} times`)
  }
})

test('the shared card says the secret cannot be recovered, and promises nothing else', () => {
  // A social card is read WITHOUT the surrounding page, which makes it the easiest place in the
  // whole product to imply that a lost key could be retrieved. So it carries the refusal, and it
  // carries no offer of recovery in any form.
  const description = /property="og:description"\s+content="([^"]+)"/.exec(HTML)?.[1] ?? ''
  assert.ok(description.length > 0, 'no og:description')
  assert.match(description, /cannot be recovered/i, 'the shared card no longer states the refusal')
  assert.doesNotMatch(
    description,
    /\b(retrieve|recover your|resend|email(ed)? (you )?the key|contact support)\b/i,
    'the shared card implies a secret can be recovered',
  )
})

test('index.html does NOT tell crawlers to stay away', () => {
  // The mirror of admin-web's assertion. A noindex here would suppress the scope vocabulary and the
  // application directory, which are the two pages this product wants read.
  assert.doesNotMatch(HTML, /name="robots"[^>]*noindex/)
})

test('public/ holds no stray brand asset that nothing links', () => {
  // A file nobody links is dead weight that looks like it is working, and this is how an old
  // product's mark survives a rebrand in one repository.
  const linked = new Set([...HTML.matchAll(/(?:href|content)="\/([^"]+\.png)"/g)].map((m) => m[1]))
  const stray = readdirSync(at('public')).filter((f) => f.endsWith('.png') && !linked.has(f))
  assert.deepEqual(stray, [], `public/ holds ${stray.join(', ')}, which index.html does not link`)
})

test('the accent and substrate are declared on <html>, before React can paint', () => {
  // Set by React, the page paints the default ember and then changes colour. `developers` has its
  // own block in tokens.css; admin's did not, and the console wore the company's colour by accident
  // for as long as that was true.
  assert.match(HTML, /data-cf-product="developers"/)
  assert.match(HTML, /data-cf-substrate="warm"/)
})

test('the accent selector this page names really exists in tokens.css', (t) => {
  // The check that would have caught admin's. A `data-cf-product` with no matching block is not an
  // error anywhere — the page simply inherits the company ember and nothing says so.
  const tokens = at('../ui/packages/ui/src/tokens.css')
  if (!existsSync(tokens)) {
    // `return` here was a PASS, not a skip — the shape that let six checks in micro-explorer-web
    // report success for work they never did. CI has micro-ui, so this only fires locally.
    t.skip('micro-ui is not checked out; tokens.css was never read')
    return
  }
  assert.match(readFileSync(tokens, 'utf8'), /\[data-cf-product='developers'\]/)
})

test('the Dockerfile copies public/ into the build context', () => {
  // Without it Vite has no publicDir to copy into dist, and the image ships with no icons at all
  // while this very test passes, because it reads the SOURCE tree. That is how four frontends
  // shipped iconless. Fixed in the template at web-template/Dockerfile:39; pinned here so it cannot
  // be lost again, and backed by the container probe below, which is the only check that could have
  // caught it in the first place.
  const dockerfile = readFileSync(at('Dockerfile'), 'utf8')
  assert.match(
    dockerfile,
    /^COPY public \.\/public$/m,
    'the Dockerfile does not copy public/, so the built image will have no favicon',
  )
})

test('CI probes the running container for the icons AND the card', () => {
  // The test above reads a file; only a request to the image proves the artefact serves them.
  const ci = readFileSync(at('.github/workflows/ci.yml'), 'utf8')
  for (const asset of [...REQUIRED_ICONS, OG_CARD]) {
    assert.ok(ci.includes(asset), `ci.yml does not probe /${asset} against the image`)
  }
})
