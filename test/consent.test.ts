/**
 * ANALYTICS CONSENT, AS IT IS TRUE OF *THIS* BUNDLE.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS FILE IS FOR, GIVEN @cloudsforge/ui ALREADY TESTS THE GATE
 *
 * `ui/packages/ui/src/consent.test.ts` proves the gate works. It cannot prove this repository USES
 * it, and the way this goes wrong is never inside the gate — it is a `<script src>` pasted into a
 * shell during a hurry, or an `initAnalytics()` that drifts below the render, or a `CookieBanner`
 * that gets moved above the footer while somebody is tidying the JSX. Each of those leaves the
 * design system's own suite green and this bundle non-compliant.
 *
 * The rule, stated once: NO CONSENT, NO SCRIPT, NO COOKIE. The stock Google snippet fetches a
 * third-party script and sets `_ga` on load — before any banner has been drawn, let alone answered
 * — and under ePrivacy Art. 5(3) an analytics cookie set before consent is a violation that a
 * banner underneath it does not cure. This estate custodies other people's money and is separately
 * under GDPR review, which makes "we will tidy the analytics later" the wrong order to do things
 * in. On THIS surface there is a second reason: every screen behind the session gate mints or
 * revokes a credential, and the reader is a developer who will look at the network tab.
 *
 * So: the shell is greped, the boot order is greped, and then the banner is actually mounted and
 * both buttons are actually pressed, on a hostname where it renders.
 *
 * ── The trap this file is written around ──────────────────────────────────────────────────────
 *
 * `analyticsAllowedHere()` (`ui/packages/ui/src/consent.ts`) returns FALSE for `localhost`,
 * `127.0.0.1`, `::1`, `*.local` and `*.localtest.me`, so `CookieBanner` renders NOTHING there.
 * "Zero cookies, no banner, no script" is therefore TRUE ON LOCALHOST FOR THE WRONG REASON, and a
 * scenario mounted at the harness's default local URL would assert nothing at all. Every scenario
 * below uses a real `developers.cloudsforge.online` URL, and the first one PROVES the banner
 * renders there before any of the others rely on it having done so.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { createElement as h, useState } from 'react'
import { CookieBanner } from '@cloudsforge/ui'
import { ANALYTICS_META_NAME, CONSENT_STORAGE_KEY } from '@cloudsforge/ui/consent'
import { withScreen, type Screen } from './dom.ts'

const read = (file: string): string => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')

const HTML = read('index.html')

/**
 * Source with its comments stripped.
 *
 * The boot order below is checked by the POSITION of three calls in `src/main.tsx`, and that file's
 * own header describes the order in prose — naming `bootstrapSession()` at the top, forty lines
 * above the call. A scan over the raw text reads the description as the code and reports an order
 * that is right in the comment and wrong in the file. `tokens.test.ts` and `base-layer.test.ts`
 * strip comments from the stylesheet for the same reason; the rule is about the CODE.
 */
const code = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

const MAIN = code(read('src/main.tsx'))
const SHELL = code(read('src/components/shell.tsx'))

/** The measurement ID this bundle ships, read from the shell rather than typed here twice. */
const MEASUREMENT_ID =
  new RegExp(`<meta name="${ANALYTICS_META_NAME}" content="([^"]*)"`).exec(HTML)?.[1] ?? ''

/** The surface's real origin. On localhost the banner does not render, and nothing is proven. */
const AT = 'https://developers.cloudsforge.online/'

/**
 * The banner, under a head that carries this bundle's shell tags.
 *
 * ── Why the meta tag is written from a render body rather than after mounting ─────────────────
 *
 * The harness builds an EMPTY document, and `CookieBanner` reads `analyticsId()` off
 * `document.head` in its own mount effect — once, with `[]` deps. A meta tag appended after
 * `withScreen` returns arrives after that effect has already answered `null`, and the banner then
 * never renders no matter what is in the head. A scenario written that way asserts "no banner, no
 * cookie, no script" and proves only that its own setup ran too late, which is the exact shape of
 * vacuous pass this whole file is arranged to avoid.
 *
 * A `useState` initialiser runs during the PARENT's render, which is before the child renders and
 * long before any effect, so the tag is there when the banner looks. The ID is read out of
 * `index.html` rather than typed here, so a scenario cannot pass against an ID this bundle does not
 * ship.
 */
function ShellHead() {
  useState(() => {
    if (!document.querySelector(`meta[name="${ANALYTICS_META_NAME}"]`)) {
      const meta = document.createElement('meta')
      meta.setAttribute('name', ANALYTICS_META_NAME)
      meta.setAttribute('content', MEASUREMENT_ID)
      document.head.appendChild(meta)
    }
    return null
  })
  return h(CookieBanner)
}

/** Every `<script src>` on the page. The tag, if it is ever loaded, is one of these. */
const scriptSrcs = (s: Screen): string[] =>
  [...s.document.querySelectorAll('script[src]')].map((el) => el.getAttribute('src') ?? '')

describe('the shell loads no tag, and that is checkable rather than asserted', () => {
  it('ships a measurement ID in the shape the gate accepts', () => {
    // A GA4 measurement ID is `G-` and 4–20 alphanumerics; `analyticsId()` refuses anything else
    // rather than building a script URL out of an unsubstituted template variable.
    assert.match(MEASUREMENT_ID, /^G-[A-Z0-9]{4,20}$/i, 'index.html carries no valid cf-analytics')
  })

  it('has no third-party script tag of any kind', () => {
    /*
     * THE ASSERTION THE WHOLE ARRANGEMENT EXISTS FOR. The only `<script>` in this shell is the
     * module entry point Vite rewrites. Anything else with an `src` pointing off-origin is a
     * request made before the reader has been asked anything.
     */
    const srcs = [...HTML.matchAll(/<script[^>]*\ssrc="([^"]*)"/g)].map((m) => m[1] ?? '')
    assert.deepEqual(srcs, ['/src/main.tsx'], `index.html loads ${srcs.join(', ')}`)
    for (const src of srcs) {
      assert.ok(src.startsWith('/'), `${src} is not same-origin`)
    }
  })

  it('does not name the tag host, so its absence is greppable rather than argued', () => {
    // Spelled from parts here so this file does not match its own search.
    const host = `google${'tagmanager'}.com`
    assert.ok(!HTML.includes(host), 'index.html names the tag host')
    assert.ok(!HTML.includes('gtag'), 'index.html mentions gtag')
    assert.ok(!HTML.includes('dataLayer'), 'index.html mentions dataLayer')
  })

  it('carries the ID as a meta tag rather than a build-time constant', () => {
    // The same mechanism `cf-release` uses, and for the same reason: `no-build-time-config.test.ts`
    // fails an artefact with an environment frozen into it, because that artefact is not the one
    // that passed CI. An absent or empty value means analytics is simply off, which is a supported
    // mode — it is what `pnpm dev` gets.
    assert.match(HTML, new RegExp(`<meta name="${ANALYTICS_META_NAME}" content="`))
  })
})

describe('the boot order', () => {
  it('primes the denied defaults BEFORE React mounts', () => {
    /*
     * A default installed after a tag could have arrived is a race whose losing branch sets a
     * cookie. `initAnalytics()` pushes two entries onto a plain array — no request, no cookie — so
     * there is no window in which storage is permitted by default.
     */
    const init = MAIN.indexOf('initAnalytics()')
    const render = MAIN.search(/createRoot\(|\.render\(/)
    assert.ok(init > 0, 'src/main.tsx never calls initAnalytics()')
    assert.ok(render > 0, 'src/main.tsx never mounts')
    assert.ok(init < render, 'initAnalytics() runs after the render')
  })

  it('primes them before the session hand-off too', () => {
    // `bootstrapSession()` is a network round trip. A window in which a tag could arrive with
    // storage permitted by default is the window this ordering closes.
    const init = MAIN.indexOf('initAnalytics()')
    const boot = MAIN.indexOf('bootstrapSession(')
    assert.ok(boot > 0, 'src/main.tsx never bootstraps the session')
    assert.ok(init < boot, 'initAnalytics() runs after bootstrapSession()')
  })

  it('imports it from the design system rather than reimplementing the gate', () => {
    assert.match(MAIN, /import \{ initAnalytics \} from '@cloudsforge\/ui\/consent'/)
  })
})

describe('the banner is last in the document, and therefore last in the tab order', () => {
  it('renders after the footer in the shell', () => {
    /*
     * It is a dialog and is explicitly NOT modal: a developer who came here to read the scope
     * vocabulary can read it and answer afterwards. A consent banner that traps focus is the
     * coercion the regulation is about, so its place in the tab order is the accessibility half of
     * the same compliance argument.
     */
    const banner = SHELL.indexOf('<CookieBanner />')
    const footer = SHELL.indexOf('<CloudsForgeFooter')
    assert.ok(banner > 0, 'the shell renders no CookieBanner')
    assert.ok(banner > footer, 'the banner is not last in the shell')
  })
})

describe('nothing is loaded and no cookie is set before the reader answers', () => {
  it('the banner RENDERS on this surface, which every scenario below depends on', async () => {
    await withScreen(h(ShellHead), { url: AT, allowEmpty: true }, async (s) => {
      await s.settle()
      const dialog = s.document.querySelector('[role="dialog"]')
      assert.ok(dialog, 'the banner did not render at a real hostname — every check below is vacuous')
      assert.equal(dialog.getAttribute('aria-modal'), 'false', 'the banner is modal')
    })
  })

  it('sets no cookie and injects no script before either button is pressed', async () => {
    await withScreen(h(ShellHead), { url: AT, allowEmpty: true }, async (s) => {
      await s.settle()
      assert.equal(s.document.cookie, '', `a cookie was set before the answer: ${s.document.cookie}`)
      assert.deepEqual(scriptSrcs(s), [], 'a script was injected before the answer')
      assert.equal(s.window.localStorage.getItem(CONSENT_STORAGE_KEY), null)
    })
  })

  it('offers Reject and Accept as one class with no modifier between them', async () => {
    /*
     * Reject as easy as Accept: one click, one keystroke, same size, same colour, SAME CLASS. A
     * banner offering only "Accept", or "Accept" beside a grey "manage preferences" link, is not
     * freely given consent under Art. 4(11) — the CNIL and the EDPB have both said so in terms and
     * both have fined for it. Asserted structurally because a stylesheet override is exactly how
     * this regresses.
     */
    await withScreen(h(ShellHead), { url: AT, allowEmpty: true }, async (s) => {
      await s.settle()
      const reject = s.byRole('button', 'Reject')
      const accept = s.byRole('button', 'Accept')
      assert.equal(reject.getAttribute('class'), accept.getAttribute('class'))
      // Reject FIRST in document order: a reader scanning left to right meets the refusal before
      // the acceptance, which is the opposite of the pattern regulators have fined for.
      assert.ok(
        reject.compareDocumentPosition(accept) & 4,
        'Accept is offered before Reject',
      )
    })
  })

  it('Reject records the refusal, injects nothing, and dismisses the banner', async () => {
    await withScreen(h(ShellHead), { url: AT, allowEmpty: true }, async (s) => {
      await s.settle()
      await s.click(s.byRole('button', 'Reject'))
      await s.settle()
      assert.deepEqual(scriptSrcs(s), [], 'Reject injected a script')
      /*
       * This was `document.cookie === ''`. It is no longer, and the reason is a behaviour change
       * rather than a weakened test: the RECORD of the decision is now a cookie on the registrable
       * domain, because `localStorage` is per-origin and every surface in this estate is a
       * different subdomain — one answer used to mean seventeen banners. So the jar is not empty
       * after an answer, and the claim with legal weight is the sharper one: nothing GOOGLE sets
       * is in it. A record of the reader's own refusal is exempt under ePrivacy Art. 5(3); `_ga`
       * is the thing that is not.
       */
      const jar = s.document.cookie
      assert.ok(!/(^|;\s*)_g(a|id|at)/.test(jar), `Reject left an analytics cookie behind: ${jar}`)
      assert.match(jar, /cf_consent_analytics=denied/, 'the refusal was not recorded across surfaces')
      assert.equal(s.window.localStorage.getItem(CONSENT_STORAGE_KEY), 'denied')
      assert.equal(s.document.querySelector('[role="dialog"]'), null, 'the banner stayed up')
    })
  })

  it('Accept is the ONE call site in this bundle that loads the tag', async () => {
    await withScreen(h(ShellHead), { url: AT, allowEmpty: true }, async (s) => {
      await s.settle()
      await s.click(s.byRole('button', 'Accept'))
      await s.settle()
      assert.equal(s.window.localStorage.getItem(CONSENT_STORAGE_KEY), 'granted')
      const srcs = scriptSrcs(s)
      assert.equal(srcs.length, 1, `Accept injected ${srcs.length} scripts`)
      assert.ok(
        (srcs[0] ?? '').includes(MEASUREMENT_ID),
        `the injected script does not carry this bundle's measurement ID: ${srcs[0]}`,
      )
    })
  })

  it('does not ask a reader who has already answered', async () => {
    // `undefined` is "have not looked yet" and must not flash a banner at somebody who decided last
    // week; `null` is "looked, and they have not been asked".
    for (const decision of ['granted', 'denied']) {
      await withScreen(
        h(ShellHead),
        { url: AT, allowEmpty: true, storage: { [CONSENT_STORAGE_KEY]: decision } },
        async (s) => {
          await s.settle()
          assert.equal(
            s.document.querySelector('[role="dialog"]'),
            null,
            `the banner asked again after "${decision}"`,
          )
        },
      )
    }
  })

  it('asks nobody on a local stack, where there is nothing to consent TO', async () => {
    // The other half of the trap this file is written around, asserted so that the reason the local
    // case is quiet is a DECISION on record rather than an accident every scenario above inherits.
    await withScreen(h(ShellHead), { url: 'http://localhost:3012/', allowEmpty: true }, async (s) => {
      await s.settle()
      assert.equal(s.document.querySelector('[role="dialog"]'), null)
      assert.deepEqual(scriptSrcs(s), [])
    })
  })
})
