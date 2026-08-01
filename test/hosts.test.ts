/**
 * Where this bundle talks to, and how it decides.
 *
 * The rule the whole file exists to keep: NOTHING here is a build-time constant. Every host is
 * derived from `window.location` on the call, so one image serves localhost, a preview deployment
 * and production — and the tests install four different windows to prove it rather than trusting a
 * comment.
 *
 * The second thing under test is the dev-port disagreement, asserted as a FACT rather than fixed
 * with a literal: the registry gives `developers` devPort 3012 (`ui/packages/ui/src/surfaces.ts:389`)
 * and `micro-devplatform` binds 4000 (`devplatform/src/env.ts:197`, `devplatform/.env.example:27`).
 * See the header of src/lib/hosts.ts.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { afterEach, describe, it } from 'node:test'
import { SURFACES, cloudsforgeHosts, hasMark, type CloudsForgeHosts } from '@cloudsforge/ui'
import {
  APP_NAME,
  PRODUCT,
  apiBase,
  isLocal,
  isRegisteredPlacement,
  resolveApiBase,
} from '../src/lib/hosts.ts'
import { installWindow, removeWindow } from './browser-stubs.ts'

afterEach(removeWindow)

/**
 * A file in this repository, as text.
 *
 * vite.config.ts and app.tsx are READ rather than imported: the first pulls in a Vite plugin and
 * the second the whole React tree, and this suite deliberately has no DOM.
 */
const read = (file: string): string => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')

/** The production host table, as `cloudsforgeHosts()` derives it from an apex hostname. */
function production(): CloudsForgeHosts {
  installWindow('https://developers.cloudsforge.online/')
  const hosts = cloudsforgeHosts()
  removeWindow()
  return hosts
}

describe('the surface this app is', () => {
  it('is the developers surface', () => {
    assert.equal(PRODUCT, 'developers')
  })

  it('is registered as a SURFACE rather than a product, and is not in the switcher', () => {
    // Both halves are decisions with reasons in the registry, and both change what the shell draws.
    // A developer console beside the six products in the switcher would say it is one.
    const surface = SURFACES.find((s) => s.key === PRODUCT)
    assert.ok(surface, 'developers is not in the surface registry')
    assert.equal(surface.kind, 'surface')
    assert.equal(surface.inSwitcher, false)
    assert.equal(surface.subdomain, 'developers')
    assert.equal(surface.name, 'Developer Platform')
    assert.equal(surface.accent, '#4a86e0')
  })

  it('has no brand mark in the design system, which is why the shell draws none', () => {
    // `markId: null` in the registry and no drawing in @cloudsforge/ui. micro-brand DOES hold a
    // generated mark and wordmark for this surface — the entitled set is mark, favicon, wordmark,
    // og — so the artwork exists and the component cannot render it. Pinned in both directions so
    // that "the console has no logo" stays a recorded divergence rather than an assumption.
    assert.equal(SURFACES.find((s) => s.key === PRODUCT)?.markId, null)
    assert.equal(hasMark(PRODUCT), false)
  })

  it('reports a name to the observability ingest that names the bundle, not the surface', () => {
    // Lantern groups on it, and "developers" is the surface while "devportal-web" is the artefact
    // that threw. An error report that cannot name the bundle cannot be pinned to a deploy.
    assert.equal(APP_NAME, 'devportal-web')
  })
})

describe('the API base is an origin comparison, never a flag', () => {
  const hosts = production()

  it('is relative when the page and the API share an origin', () => {
    // Production: nginx serves this bundle and devplatform serves /v1 behind developers.<apex>.
    assert.equal(resolveApiBase('https://developers.cloudsforge.online', hosts, PRODUCT), '')
  })

  it('is absolute when they do not', () => {
    assert.equal(resolveApiBase('https://hub.cloudsforge.online', hosts, PRODUCT), hosts[PRODUCT])
  })

  it('is absolute when there is no page origin at all', () => {
    assert.equal(resolveApiBase('', hosts, PRODUCT), hosts[PRODUCT])
  })

  it('resolves from the window on every call, so one image serves every environment', () => {
    installWindow('https://developers.cloudsforge.online/projects/x/keys')
    assert.equal(apiBase(), '')
    removeWindow()

    installWindow('http://localhost:5192/projects/x/keys')
    // Under `pnpm dev` the page is on Vite's port and the service is on the registry's, so the
    // request goes cross-origin and absolute.
    assert.notEqual(apiBase(), '')
    assert.match(apiBase(), /^http:\/\/localhost:\d+$/)
  })

  it('never resolves against the `api` surface, whatever the gateway grows later', () => {
    // devplatform's own header says the public surface is api.<apex>/v1/<resource>. This bundle
    // deliberately does not use it: the gateway routes none of devplatform's resources there today,
    // and that host carries no CORS middleware because it is not meant to be a browser origin.
    // Pinned so a later "tidy-up" cannot quietly repoint a credential console at it.
    const client = read('src/lib/hosts.ts').replace(/\/\*[\s\S]*?\*\//g, '')
    assert.doesNotMatch(client, /API_SURFACE/, 'this bundle has grown a second surface key')
    assert.doesNotMatch(client, /'api'/, "this bundle now names the `api` surface as a host")
  })
})

describe('the dev port disagreement, recorded rather than papered over', () => {
  /**
   * A hard-coded host would be a second, unversioned copy of the registry, and the copy is the one
   * that goes stale — so this app resolves 3012 and the README tells a developer to start
   * devplatform on it. The test pins BOTH halves so the day either moves, this fails and names the
   * other.
   */
  it('the registry gives developers devPort 3012', () => {
    assert.equal(SURFACES.find((s) => s.key === 'developers')?.devPort, 3012)
  })

  it('and this app therefore calls 3012 on localhost, which is what the README explains', () => {
    installWindow('http://localhost:5192/')
    assert.equal(apiBase(), 'http://localhost:3012')
  })

  it('the vite dev port is not the registry port, and must not be confused with it', () => {
    // The registry's devPort names where the API answers; Vite's names where the bundle is served.
    // If they were the same number the SPA and the service would fight for one port and
    // `resolveApiBase` would collapse to '' against a server that has no /v1 on it.
    const vite = /server:\s*\{\s*port:\s*(\d+)/.exec(read('vite.config.ts'))
    assert.ok(vite, 'vite.config.ts declares no dev server port')
    assert.notEqual(Number(vite[1]), 3012)
  })

  it('the README says how to start the service on the port this app calls', () => {
    // The disagreement is only survivable because one line of the README makes it true. If that
    // line goes, the finding goes back to being undiagnosable.
    assert.match(read('README.md'), /PORT=3012/, 'the README no longer says how to reconcile it')
  })
})

describe('local development is exempt, in exactly the four names cloudsforgeHosts() exempts', () => {
  it('treats the four as local', () => {
    for (const hostname of ['', 'localhost', '127.0.0.1', 'dev.local']) {
      assert.equal(isLocal(hostname), true, hostname)
    }
  })

  it('treats a real hostname as not local', () => {
    for (const hostname of ['developers.cloudsforge.online', 'example.test', 'localhost.evil.test']) {
      assert.equal(isLocal(hostname), false, hostname)
    }
  })
})

describe('the placement warning', () => {
  const hosts = production()

  it('accepts this surface’s own origin', () => {
    assert.equal(
      isRegisteredPlacement(
        'https://developers.cloudsforge.online',
        'developers.cloudsforge.online',
        hosts,
      ),
      true,
    )
  })

  it('accepts localhost, where there is no apex to get wrong', () => {
    assert.equal(isRegisteredPlacement('http://localhost:5192', 'localhost', hosts), true)
  })

  it('flags an address the registry does not know', () => {
    // An unknown prefix is left alone, so the whole name becomes the apex and every derived host —
    // this app's own API, the account portal — resolves one level too deep.
    assert.equal(
      isRegisteredPlacement('https://preview-7.example.test', 'preview-7.example.test', hosts),
      false,
    )
  })

  it('flags the host the gateway’s CORS list names, which the registry does not define', () => {
    // `deploy/gateway/dynamic/policy.yml:53` allowlists https://devportal.cloudsforge.online. The
    // registry's subdomain for this surface is `developers`, so that name is not a placement this
    // bundle recognises — and a page served from it would resolve every CloudsForge URL one level
    // too deep. Reported to micro-deploy; asserted here so the finding has a mechanism.
    assert.equal(
      isRegisteredPlacement(
        'https://devportal.cloudsforge.online',
        'devportal.cloudsforge.online',
        hosts,
      ),
      false,
    )
  })

  it('warns rather than refusing, because the scope vocabulary is worth serving from anywhere', () => {
    // The opposite of admin-web, which refuses to render at all. Asserted so the difference stays a
    // decision — but the warning on THIS surface tells the reader not to sign in, because every
    // gated screen creates or revokes a credential.
    const app = read('src/app.tsx')
    assert.doesNotMatch(app, /MisplacedBundle/, 'this surface must not refuse to render')
    assert.match(app, /unregistered/, 'the placement must still be passed to the shell')
    assert.match(
      read('src/components/shell.tsx'),
      /Do not sign in or create a credential/,
      'the warning no longer tells the reader what not to do here',
    )
  })
})
