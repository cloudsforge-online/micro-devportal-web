/**
 * The app shell: the company bar, the section navigation, and the page.
 *
 * The bar is `CloudsForgeBar` from @cloudsforge/ui and is never reimplemented. It is passed
 * `PRODUCT` — `developers` — which the registry marks `inSwitcher: false`
 * (`ui/packages/ui/src/surfaces.ts`), so the switcher renders the six products and Forge Hub
 * and marks none of them current. That is correct rather than a gap: this surface is reached from
 * the footer, not from the switcher (`ui/packages/ui/src/surfaces.ts`), and putting a
 * developer console beside the products would say it is one.
 *
 * There is no brand mark in the bar for this surface, and that is also a registry fact rather than
 * an omission: `developers` carries `markId: null` (`ui/packages/ui/src/surfaces.ts`) and
 * `hasMark('developers')` is therefore false (`ui/packages/ui/src/index.tsx`). `micro-brand`
 * DOES hold `assets/developers/mark-1024x1024.png` and a wordmark — the entitled set is "mark,
 * favicon, wordmark, og", seven files, with no social banner (`brand/plan.ts`,
 * `brand/README.md`) — so the artwork exists and the design system has no SVG drawing for it.
 * The favicons and the OG card in `public/` come from that set. Reported to micro-ui; not papered
 * over here with a locally drawn mark, which would be this repository inventing brand.
 */
import { useEffect } from 'react'
import {
  CloudsForgeBar,
  CloudsForgeFooter,
  CookieBanner,
  MainRegion,
  SkipLink,
  SubNav,
} from '@cloudsforge/ui'
import { applyHead } from '@cloudsforge/ui/seo'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { PRODUCT } from '../lib/hosts.ts'
import { metaFor } from '../lib/meta.ts'
import { NAV } from '../lib/routes.ts'
import { useSession } from '../lib/auth.tsx'

export function AppShell({ unregistered = false }: { unregistered?: boolean }) {
  const { account, signIn, signOut } = useSession()

  return (
    <>
      {/*
        The skip link is the first focusable thing in the document, and it is now the SHARED one.
        This surface had a local `.dp-skip` anchor pointing at `#main`; the component points at
        `MAIN_ID` and `MainRegion` below carries the `tabIndex={-1}` that the local pair did not.
        Without it the fragment SCROLLS the page in Chrome and Safari and leaves focus on the link,
        so the next Tab goes back to the second item in the bar — a skip link that looks like it
        works and does not.
      */}
      <SkipLink />
      <CloudsForgeBar
        current={PRODUCT}
        account={account}
        onSignIn={() => signIn()}
        onSignOut={signOut}
      />
      {/*
        THE SECTION STRIP IS THE SHARED ONE NOW, AND THE LOCAL `.dp-subnav*` RULES ARE GONE WITH IT.

        The strip itself — sticky at the bar's own `--cf-bar-h`, the bar's measure, the horizontal
        scroll, the narrow-viewport gutter, the three-channel current marker — is `SubNav` from
        @cloudsforge/ui. Measured 2026-08-10 across the estate: ten frontends declared this row in
        their own stylesheet under six class prefixes, from what was plainly one original that had
        then been edited in ten places.

        This copy had drifted in two ways a reader can see. `.dp-subnav__link.is-active` marked the
        current section in TWO channels, ink and underline, where the estate's standing rule is
        three; the shared modifier adds the weight. And the gutter was `--cf-space-xl` at every
        width while `.cf-bar__inner` above it narrows to `--cf-space-md` under 560px, so on a phone
        the second row of the header sat 6px inboard of the first on each side.

        `aria-label` stays "Sections" — this repo's own wording, passed through as `label`. Only the
        strip is homogenised, not the sentence a screen reader reads.
      */}
      <SubNav label="Sections">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `cf-subnav__link${isActive ? ' cf-subnav__link--current' : ''}`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </SubNav>
      <DocumentMeta />
      <MainRegion className="dp-main">
        {/*
          Not fatal, so not a refusal — the scope vocabulary and the public directory are worth
          serving from anywhere. But louder here than on a product page, and for a reason.

          `cloudsforgeHosts()` derives the apex by stripping a KNOWN subdomain
          (`ui/packages/ui/src/index.tsx`), so an address the registry does not know makes
          every estate URL resolve one level too deep — including this app's own API base and the
          account portal it would send a bearer token through. On a catalogue that is a broken page;
          here it is a credential console pointed somewhere unintended.
        */}
        {unregistered && (
          <p className="dp-note dp-note--warn" role="status">
            <span className="dp-note__icon" aria-hidden="true">
              ▲
            </span>
            <span>
              This page is being served from an address the CloudsForge surface registry does not
              know, so every host it resolves — the account portal and this console’s own API
              included — is derived from the wrong apex. Do not sign in or create a credential from
              here. Its home is the <code className="cf-num">developers</code> surface.
            </span>
          </p>
        )}
        <Outlet />
      </MainRegion>

      {/*
        The company footer, from @cloudsforge/ui. Not written here, and deliberately not
        `<footer>` markup of this app's own: the estate had four hand-rolled footers and nine
        surfaces with none, and the registry's `developers` row has been claiming all along that
        the developer console is "reached from the footer" — a navigation path that existed
        nowhere. Every link in it is derived from SURFACES, so a new product appears here without
        this file changing.

        `account` is passed for one reason: it decides whether the operator surfaces are offered.
        Omitting it would hide them, which is safe, but this app already knows and a signed-in
        operator should be able to reach Admin from any page.
      */}
      <CloudsForgeFooter current={PRODUCT} account={account} />

      {/*
        LAST IN THE DOCUMENT, AND THEREFORE LAST IN THE TAB ORDER.

        That is deliberate: the banner is a dialog and is explicitly NOT modal, so a developer who
        came here to read the scope vocabulary can read it and answer afterwards. A consent banner
        that traps focus is the coercion the regulation is about.

        It renders nothing at all until it knows this reader has not already answered, nothing on a
        surface whose shell carries no measurement ID, and nothing on a local or preview hostname —
        because there is nothing to consent TO in any of those cases. The tag itself is injected
        from exactly one place in the estate, the Accept button inside this component; there is no
        gtag snippet in `index.html` and there must never be one. See the header of
        `@cloudsforge/ui/consent` for the whole argument.
      */}
      <CookieBanner />
    </>
  )
}

/**
 * Keep `document.title`, the description, the Open Graph tags, the robots directive and the
 * canonical link in step with the address.
 *
 * A component in the shell rather than a hook called by each page, because the failure mode of the
 * second shape is the page that forgets to call it — and the page that forgets is the one added
 * last, which is the one nobody has bookmarked yet and therefore the one nobody notices is titled
 * with the previous page's title.
 *
 * The construction of the tags is a pure function in `lib/meta.ts` with its own test. This is only
 * the part that touches the DOM, and `applyHead` updates each tag IN PLACE rather than appending,
 * so a client-side navigation does not leave the previous page's description in the head beside
 * the current one.
 */
function DocumentMeta() {
  const { pathname } = useLocation()
  useEffect(() => {
    applyHead(metaFor(pathname), window.location.origin)
  }, [pathname])
  return null
}
