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
import { CloudsForgeBar, CloudsForgeFooter } from '@cloudsforge/ui'
import { NavLink, Outlet } from 'react-router-dom'
import { PRODUCT } from '../lib/hosts.ts'
import { NAV } from '../lib/routes.ts'
import { useSession } from '../lib/auth.tsx'

export function AppShell({ unregistered = false }: { unregistered?: boolean }) {
  const { account, signIn, signOut } = useSession()

  return (
    <>
      {/* Skip link first in the DOM: the key list and the scope table are both long, and a keyboard
          user should not have to tab the whole navigation to reach them. */}
      <a className="dp-skip" href="#main">
        Skip to the page
      </a>
      <CloudsForgeBar
        current={PRODUCT}
        account={account}
        onSignIn={() => signIn()}
        onSignOut={signOut}
      />
      {/*
        The sub-nav is sticky at exactly `var(--cf-bar-h)` — the bar's own height token, not a
        number copied out of it. When the bar's height changes, this moves with it.
      */}
      <nav className="dp-subnav" aria-label="Sections">
        <div className="dp-subnav__inner">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `dp-subnav__link${isActive ? ' is-active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
      <main className="dp-main" id="main">
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
      </main>

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
    </>
  )
}
