/**
 * The boot sequence. The order is not arbitrary.
 *
 *   1. Observability first, so an exception thrown by anything below is reported rather than lost.
 *      A crash during the first render is the single most valuable event this app can send.
 *   2. Consent second: `initAnalytics()` primes Consent Mode DENIED. See the note beside the call.
 *      It is above the hand-off rather than below it because the hand-off is a network round trip,
 *      and a window in which a tag could arrive with storage permitted by default is a window this
 *      whole arrangement exists to close.
 *   3. The session hand-off third, and AWAITED, so the SSO code in the URL fragment is redeemed
 *      before React mounts. It strips `#cf_code` from the address bar before the exchange goes over
 *      the wire — see the note in @cloudsforge/ui. Rendering first would show a signed-out console
 *      to somebody who has just signed in, and would leave the code on screen for the length of a
 *      network round trip.
 *   4. Render last.
 *
 * `test/consent.test.ts` reads this file — with its comments stripped, so this list cannot satisfy
 * the check by describing it — and fails if 2 ever drifts below 3 or 4.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@cloudsforge/ui/tokens.css'
import '@cloudsforge/ui/ui.css'
import './styles.css'
import { initAnalytics } from '@cloudsforge/ui/consent'
import { App } from './app.tsx'
import { bootstrapSession } from './lib/api.ts'
import { initObs } from './lib/obs.ts'

initObs()

/*
 * Consent Mode is primed with every category DENIED before anything else runs — two pushes onto a
 * plain array, no request, no cookie — and the analytics tag is loaded ONLY if this reader granted
 * consent on a previous visit. A first-time reader gets nothing until they press Accept.
 *
 * It goes here, second, and BEFORE React mounts, rather than inside a component: the denied
 * default has to be in place before any tag could conceivably arrive, and a default installed
 * after a script has begun running is a race whose losing branch sets a cookie.
 */
initAnalytics()

const container = document.getElementById('root')
if (!container) throw new Error('#root is missing from index.html')

void bootstrapSession().finally(() => {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
