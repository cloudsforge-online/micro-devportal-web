/**
 * THE SHARED CHROME RENDERS HERE, AND ITS HOOKS ACTUALLY RUN.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * WHY A TEST WHOSE SUBJECT IS ANOTHER REPOSITORY'S COMPONENT
 *
 * It is not asserting what `@cloudsforge/ui` draws — micro-ui owns that. It is asserting a fact
 * about THIS repository's test process: that `@cloudsforge/ui` and this app end up sharing ONE
 * React. They do not by default. `link:../ui/packages/ui` symlinks the design system's working
 * tree, that tree has its own `react` (a devDependency it genuinely needs to test itself), and
 * Node resolves a bare specifier from the importing file's REALPATH — so the design system's
 * components reach the second copy, share no dispatcher with ours, and the first hook they call
 * throws `Cannot read properties of null (reading 'useState')`.
 *
 * `--import @cloudsforge/ui/test-loader` in the `test` script is what collapses the two. This file
 * is what notices when it stops. Delete the flag and these tests are the first to go red.
 *
 * Publishing `dist` did NOT make that unnecessary, though eight repositories predicted it would:
 * `dist/index.js` has the same realpath as `ui/packages/ui/src/index.tsx`, so it finds the same
 * second copy. What
 * publishing `dist` did fix was the OTHER workaround — the classic JSX transform, and the
 * `globalThis.React` that used to sit in `test/dom.ts`.
 *
 * ── Why it clicks rather than only mounting ───────────────────────────────────────────────────
 *
 * A mount that does not throw is weak evidence: `CloudsForgeLogo` renders perfectly well with two
 * Reacts in the process, because it calls no hook — that was measured. The dropdowns are the ones
 * that break, so each is OPENED, which requires `useState` to hold a value across a re-render and
 * `useId` to have produced the id `aria-controls` names. A second dispatcher cannot fake that.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AccountMenu, CloudsForgeBar, ProductSwitcher } from '@cloudsforge/ui'
import { createElement as h } from 'react'
import { App } from '../src/app.tsx'
import { PRODUCT } from '../src/lib/hosts.ts'
import { NAV } from '../src/lib/routes.ts'
import { withScreen, type Screen } from './dom.ts'

/**
 * `allowEmpty` because the subject is a strip of chrome, not a page: the bar's own text is well
 * under the 40 characters `assertMounted` requires of a mounted app. Every test below then asserts
 * on named elements instead, which is a stricter check than the length heuristic it waives.
 */
const CHROME = { allowEmpty: true } as const

/** The dropdown triggers, which is how they are found without hard-coding this surface's label. */
const triggers = (s: Screen): Element[] => [...s.document.querySelectorAll('[aria-haspopup="menu"]')]

test('the company bar renders, signed out', async () => {
  await withScreen(h(CloudsForgeBar, { current: PRODUCT, account: { signedIn: false } }), CHROME, async (s) => {
    assert.ok(s.document.querySelector('[role="banner"]'), 'CloudsForgeBar rendered no banner')
    s.byRole('link', 'CloudsForge home')
    s.byRole('button', 'Sign in')
    assert.equal(triggers(s).length, 1, 'signed out, the switcher is the only dropdown')
    s.clean('the bar, signed out')
  })
})

test('the product switcher opens, which means its useState held', async () => {
  await withScreen(h(CloudsForgeBar, { current: PRODUCT, account: { signedIn: false } }), CHROME, async (s) => {
    const trigger = triggers(s)[0] as Element
    assert.equal(trigger.getAttribute('aria-expanded'), 'false')
    assert.equal(s.document.querySelector('[role="menu"]'), null, 'the menu is closed to begin with')

    await s.click(trigger)

    assert.equal(trigger.getAttribute('aria-expanded'), 'true', 'the click did not reach state')
    const menu = s.document.querySelector('[role="menu"][aria-label="CloudsForge products"]')
    assert.ok(menu, 'the switcher opened no menu')
    assert.ok(
      menu.querySelectorAll('[role="menuitem"]').length > 1,
      'an open switcher with fewer than two products is not a switcher',
    )
    // `aria-controls` names the menu by an id from `useId`, which is the other hook in play.
    assert.equal(menu.getAttribute('id'), trigger.getAttribute('aria-controls'))
    s.clean('opening the product switcher')
  })
})

test('the account menu opens for a signed-in viewer, and offers sign out', async () => {
  const account = { signedIn: true, handle: 'ada' }
  await withScreen(h(CloudsForgeBar, { current: PRODUCT, account }), CHROME, async (s) => {
    const trigger = triggers(s)[1] as Element
    assert.match(s.textOf(trigger), /ada/, 'the second dropdown is not the account menu')

    await s.click(trigger)

    const menu = s.document.querySelector('[role="menu"][aria-label="Account"]')
    assert.ok(menu, 'the account menu opened nothing')
    assert.match(s.textOf(menu), /Sign out/)
    s.clean('opening the account menu')
  })
})

test('ProductSwitcher and AccountMenu also render standing alone', async () => {
  // Named directly, not only through the bar: these are the two components measured to throw
  // without deduplication, and a test that reached them only via a parent would stop covering
  // them the day the bar stopped composing them.
  await withScreen(h(ProductSwitcher, { current: PRODUCT }), CHROME, async (s) => {
    assert.equal(triggers(s).length, 1)
    s.clean('ProductSwitcher alone')
  })
  await withScreen(h(AccountMenu, { account: { signedIn: false } }), CHROME, async (s) => {
    s.byRole('button', 'Sign in')
    s.clean('AccountMenu alone')
  })
})

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   AND THE SECTION STRIP UNDER THE BAR IS SHARED TOO.

   The row above is `CloudsForgeBar`; the row below it used to be a `.dp-subnav` this repository
   drew itself, and is now `SubNav` from the same package. `test/tokens.test.ts` proves the local
   rules are gone from the stylesheet and that the shared classes exist upstream. Neither of those
   proves the app RENDERS the shared strip: a stylesheet with no `.dp-subnav` in it and a shell
   still emitting `className="dp-subnav"` passes both, and the result is an unstyled row of links.
   So this mounts the real `App` and looks at what came out.

   ── Why this addresses elements by CLASS, which `test/dom.ts` otherwise forbids ────────────────

   That rule is right and this is the exception that proves it. The shared strip and the local copy
   render the IDENTICAL accessible tree — a navigation landmark named "Sections" containing links —
   so a role-and-name assertion passes against all ten of the estate's drifted copies and against
   this one before the change. The class name is the only thing on screen that distinguishes the
   shared implementation from a private one, which makes it the subject here rather than an
   implementation detail leaking into a test.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */

const ORIGIN = 'https://developers.cloudsforge.online'

test('the sub-nav on screen is the shared strip, and every section link is a shared link', async () => {
  // `GET /v1/scopes` is what the index reads. Stubbed empty: this test is about the chrome around
  // the page, and the page's own content has its own scenarios in test/journeys.test.ts.
  await withScreen(
    h(App),
    { url: `${ORIGIN}/`, routes: { 'GET /v1/scopes': { body: { scopes: [] } } } },
    async (s) => {
      await s.settle(30)

      const nav = s.document.querySelector('nav.cf-subnav')
      assert.ok(nav, 'the section strip is not `SubNav` — no nav.cf-subnav in the document')
      assert.equal(
        nav.getAttribute('aria-label'),
        'Sections',
        'this repository’s own wording for the landmark did not survive the move',
      )
      assert.ok(nav.querySelector('.cf-subnav__inner'), 'the strip has no shared inner measure')

      // The local block is gone from the stylesheet; it must be gone from the DOM as well, or the
      // markup is naming rules that no longer exist.
      assert.equal(
        s.document.querySelector('[class*="dp-subnav"]'),
        null,
        'something still renders a dp-subnav class; the rules behind it were deleted',
      )

      // Every section, and every one of them wearing the shared link class. Counted against `NAV`
      // rather than a number typed here, so adding a section cannot silently escape the check.
      const links = [...nav.querySelectorAll('a')]
      assert.equal(links.length, NAV.length, `the strip renders ${links.length} of ${NAV.length}`)
      for (const link of links) {
        assert.ok(
          link.classList.contains('cf-subnav__link'),
          `“${s.textOf(link)}” is not a shared sub-nav link`,
        )
      }

      // The current section, in the shared spelling. `is-active` was this repository's name for it
      // and nothing upstream styles that, so a link still asking for it would be a section marked
      // as current in no channel at all.
      const current = [...nav.querySelectorAll('.cf-subnav__link--current')]
      assert.equal(current.length, 1, 'exactly one section is the current one')
      assert.equal(s.textOf(current[0] as Element).trim(), 'The platform')
      assert.equal(nav.querySelector('.is-active'), null, 'the local current-section marker is back')
    },
  )
})
