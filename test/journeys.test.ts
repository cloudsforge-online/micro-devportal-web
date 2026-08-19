/**
 * The browser journeys of `docs/ecosystem/22-browser-journeys.md`, tiers 1 and 2, for this surface.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE ONE RULE. Doc 22 §3: **a browser scenario may never assert a business rule.**
 *
 * A game client once withheld four SKUs from its UI while the payment routes stayed live and
 * chargeable (14 §11); a client-side test of the hidden catalogue would have passed, green,
 * against the defect. So every scenario below asserts one of exactly three things (§3.1): what a
 * human can see relative to what the API returned in the SAME run, what the client SENT, or where
 * the browser ended up.
 *
 * ── Why the once-modal carries more of this catalogue than anything else here ──────────────────
 *
 * Doc 22 §6.20 makes BJ-A11Y-04 — keyboard-only traversal of this dialog — THE ESTATE'S STAND-IN
 * FOR THE SEND FLOW, because 14 §11 names two flows for keyboard-only coverage and neither exists
 * (doc 22 §8.2). This modal is the estate's one irreversible reveal: four routes return a
 * credential and none returns it twice, and for an API key there is no column it could be read
 * back from. A mis-tab here costs a live credential with no owner.
 *
 * So the scenarios assert the three things a notification cannot do — it is modal and does not
 * close by accident, it traps Tab, and the acknowledgement is a claim about the reader rather than
 * a click on OK — and they assert them by DRIVING the dialog, because every one of those is a
 * statement about focus and events that no source grep can reach.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { createElement as h, type ReactElement } from 'react'
import { MemoryRouter, Route, Routes as RouterRoutes } from 'react-router-dom'

import { withScreen, type Routes } from './dom.ts'
import * as fx from './fixtures.ts'
import { DOC22_IDS, SCENARIOS } from './journeys.ts'
import { App } from '../src/app.tsx'
import { AuthProvider } from '../src/lib/auth.tsx'
import { ROUTES } from '../src/lib/routes.ts'
import { ShownOnce } from '../src/components/once.tsx'
import { PlatformPage } from '../src/pages/platform.tsx'
import { DirectoryPage } from '../src/pages/directory.tsx'
import { KeysPage } from '../src/pages/keys.tsx'
import { OAuthPage } from '../src/pages/oauth.tsx'
import { UsagePage } from '../src/pages/usage.tsx'
import { WebhooksPage } from '../src/pages/webhooks.tsx'

const ORIGIN = 'https://cloudsforge.online/developers'
const at = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url))

const page = (element: ReactElement, path: string): ReactElement =>
  h(MemoryRouter, { initialEntries: [path] }, h(AuthProvider, null, element) as ReactElement)

const atRoute = (pattern: string, element: ReactElement, path: string): ReactElement =>
  h(
    MemoryRouter,
    { initialEntries: [path] },
    h(AuthProvider, null, h(RouterRoutes, null, h(Route, { path: pattern, element }))) as ReactElement,
  )

const keysAt = () => atRoute('/projects/:id/keys', h(KeysPage), `/projects/${fx.PROJECT_ID}/keys`)

const SCOPES = {
  scopes: [
    { name: 'market:read', description: 'Read listings.', product: 'market' },
    { name: 'market:write', description: 'Create listings.', product: 'market' },
  ],
}

const keysRoutes = (over: Routes = {}): Routes => ({
  'GET /auth/me': { body: fx.ME },
  'GET /v1/scopes': { body: SCOPES },
  [`GET /v1/projects/${fx.PROJECT_ID}/keys`]: { body: { keys: [fx.key()] } },
  ...over,
})

/** Mount the once-modal on its own, for the scenarios that are about the dialog itself. */
const modal = (onAcknowledge = () => undefined): ReactElement =>
  h(ShownOnce, {
    kind: 'API key',
    secret: fx.SECRET,
    note: 'This is the only time this secret is shown. It is stored under scrypt and cannot be recovered.',
    label: 'cfk_test_0000…abcd',
    onAcknowledge,
  })

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   6.12 Group L — the developer platform
   ══════════════════════════════════════════════════════════════════════════════════════════ */

describe('BJ-DEV — the developer platform', () => {
  it('BJ-DEV-01 T2: the scope catalogue renders for a reader who has not signed in', async () => {
    await withScreen(
      page(h(PlatformPage), '/'),
      { url: `${ORIGIN}/`, routes: { 'GET /v1/scopes': { body: SCOPES } } },
      async (s) => {
        await s.settle(20)
        for (const scope of SCOPES.scopes) {
          assert.ok(s.text().includes(scope.name), `${scope.name} is not in the catalogue`)
        }
        // `GET /v1/scopes` takes no principal. Somebody deciding whether to sign up is exactly the
        // reader this page is for.
        for (const w of s.api.wire) {
          assert.equal(w.headers.authorization, undefined, `${w.path} carried a credential`)
        }
        s.clean('BJ-DEV-01')
      },
    )
  })

  it('BJ-DEV-02 T2: the application directory renders with no credential', async () => {
    await withScreen(
      page(h(DirectoryPage), '/apps'),
      {
        url: `${ORIGIN}/apps`,
        routes: {
          'GET /v1/apps': {
            body: {
              applications: [
                {
                  id: 'app-1',
                  projectId: fx.PROJECT_ID,
                  slug: 'a-thing',
                  name: 'A Thing',
                  tagline: 'It does a thing.',
                  description: 'A longer account of the thing it does.',
                  homepageUrl: null,
                  status: 'listed',
                  listedAt: '2026-07-01T09:00:00.000Z',
                  createdAt: '2026-07-01T09:00:00.000Z',
                },
              ],
            },
          },
        },
      },
      async (s) => {
        await s.settle(20)
        assert.ok(s.text().includes('A Thing'), 'the directory rendered no applications')
        for (const w of s.api.wire) {
          assert.equal(w.headers.authorization, undefined, `${w.path} carried a credential`)
        }
      },
    )
  })

  it('BJ-DEV-05 ★ T1: the secret is a modal, with a scrim and focus inside it', async () => {
    await withScreen(modal(), { url: `${ORIGIN}/`, routes: {} }, async (s) => {
      const dialog = s.document.querySelector('[role="dialog"]')
      assert.ok(dialog, 'the secret was not shown in a dialog')
      assert.equal(dialog.getAttribute('aria-modal'), 'true')
      // A full-viewport scrim, so the page underneath cannot be reached by a pointer. A secret
      // shown in a corner while the page stays clickable is a secret one stray click destroys.
      assert.ok(dialog.closest('.dp-once__scrim'), 'the dialog has no scrim')
      // Focus is on the DIALOG rather than on a control: a screen reader lands on the heading and
      // the warning, in that order, instead of on a button it might activate before hearing why.
      assert.equal(s.focused(), dialog, 'focus was not moved into the dialog on mount')
      // The secret is on screen and selectable.
      assert.ok(
        [...s.document.querySelectorAll('input')].some(
          (el) => (el as unknown as { value: string }).value === fx.SECRET,
        ),
        'the secret is not rendered where it can be copied',
      )
    })
  })

  it('BJ-DEV-05 ★ T1: the modal is reached from the key form rather than only existing', async () => {
    await withScreen(
      keysAt(),
      {
        url: `${ORIGIN}/projects/${fx.PROJECT_ID}/keys`,
        storage: fx.SIGNED_IN,
        routes: keysRoutes({
          [`POST /v1/projects/${fx.PROJECT_ID}/keys`]: {
            status: 201,
            body: { key: fx.key(), secretKey: fx.SECRET, replayed: false },
          },
        }),
      },
      async (s) => {
        await s.settle(30)
        // Mounting `ShownOnce` directly would prove the component works and keep passing on the
        // day the line that mounts it was deleted. So the dialog is reached by issuing a key.
        await s.click(s.byRole('button', /issue key/i))
        await s.settle(30)
        const dialog = s.document.querySelector('[role="dialog"]')
        assert.ok(dialog, 'issuing a key did not open the once-modal')
        assert.ok(s.textOf(dialog).includes('API key'))
      },
    )
  })

  it('BJ-DEV-06 ★ T1: Escape does not dismiss it, and nothing acknowledges without the reader', async () => {
    let acknowledged = 0
    await withScreen(
      modal(() => {
        acknowledged += 1
      }),
      { url: `${ORIGIN}/`, routes: {} },
      async (s) => {
        const dialog = s.document.querySelector('[role="dialog"]') as Element
        // Escape is swallowed on purpose. Every other dialog in this estate closes on it, and that
        // is correct for every other dialog: none of them is displaying something unrecoverable.
        //
        // HOW STRONG THIS HALF IS, MEASURED RATHER THAN ASSUMED: deleting the Escape branch from
        // `once.tsx` does NOT turn it red, because the component has no close-on-Escape to remove
        // — the `preventDefault` there suppresses the BROWSER's default, and nothing in this app
        // would have closed the dialog anyway. So this assertion guards against a future
        // `onKeyDown` that adds one, and not against today's code. The half of this scenario that
        // does bite is the acknowledgement gate below, which goes red the moment `dismissable`
        // stops depending on the reader.
        ;(dialog as unknown as HTMLElement).focus()
        await s.press('Escape')
        assert.equal(acknowledged, 0, 'Escape dismissed a dialog holding an unrecoverable secret')
        assert.ok(s.document.querySelector('[role="dialog"]'), 'the dialog closed on Escape')

        // And the acknowledgement is disabled until the reader has copied it or ticked the box.
        const done = s.byRole('button', /lose sight of it/i)
        assert.ok(done.hasAttribute('disabled'), 'the dialog could be dismissed without reading it')
        await s.click(done)
        assert.equal(acknowledged, 0, 'a disabled acknowledgement fired anyway')

        // Ticking the box is a claim about the reader, and it is what arms the control.
        const box = s.allByRole('checkbox')[0] as Element
        await s.click(box)
        const armed = s.byRole('button', /lose sight of it/i)
        assert.ok(!armed.hasAttribute('disabled'), 'ticking the box did not arm the acknowledgement')
        await s.click(armed)
        assert.equal(acknowledged, 1)
      },
    )
  })

  it('BJ-DEV-07 ★ T1: it says the credential is live and unrecoverable, and implies no recovery', async () => {
    await withScreen(modal(), { url: `${ORIGIN}/`, routes: {} }, async (s) => {
      const dialog = s.document.querySelector('[role="dialog"]') as Element
      const text = s.textOf(dialog)
      assert.match(text, /only time this secret is shown/i)
      assert.match(text, /cannot be recovered/i)
      assert.match(
        text,
        /no request to us — can produce the value a second time/i,
        'the modal says "please copy this" rather than what is true: the credential is live and ' +
          'nobody can tell you what it is',
      )
      // And nothing that implies recovery. Support cannot recover it either — there is no column
      // it could be read back from.
      for (const lie of [
        /find (this|it) later/i,
        /in your dashboard/i,
        /we have emailed/i,
        /contact support/i,
        /you can view (this|it) again/i,
      ]) {
        assert.doesNotMatch(text, lie, `the modal implies recovery: ${String(lie)}`)
      }
    })
  })

  it('BJ-DEV-08 T1: a listed key shows its display form and never the secret', async () => {
    await withScreen(
      keysAt(),
      { url: `${ORIGIN}/projects/${fx.PROJECT_ID}/keys`, storage: fx.SIGNED_IN, routes: keysRoutes() },
      async (s) => {
        await s.settle(30)
        // Presentation relative to what the API returned: the non-secret identifier, which is safe
        // to put in a log or a support message.
        assert.ok(s.text().includes(fx.key().display), 'the key is not listed by its display form')
        // And no route offers the value back, so no control may imply one does.
        assert.doesNotMatch(s.text(), /show (again|secret)|reveal/i, 'the page offers to show it again')
        assert.equal(s.document.querySelector('[role="dialog"]'), null, 'a listing opened a modal')
      },
    )
  })

  it('BJ-DEV-09 T1: a revoked key says revoked and keeps its history', async () => {
    await withScreen(
      keysAt(),
      {
        url: `${ORIGIN}/projects/${fx.PROJECT_ID}/keys`,
        storage: fx.SIGNED_IN,
        routes: keysRoutes({
          [`GET /v1/projects/${fx.PROJECT_ID}/keys`]: {
            body: {
              keys: [
                fx.key({
                  revokedAt: '2026-08-01T09:00:00.000Z',
                  revokedReason: 'rotated',
                  lastUsedAt: '2026-07-30T09:00:00.000Z',
                }),
              ],
            },
          },
        }),
      },
      async (s) => {
        await s.settle(30)
        assert.match(s.text(), /revoked/i, 'a revoked key does not say so')
        // The usage history is retained — a revoked key is still the answer to "what did this do".
        assert.match(s.text(), /last used|used/i, 'the usage history went with the revocation')
      },
    )
  })

  it('BJ-DEV-11 T1: a replay is a replay, not a failure and not a fresh credential', async () => {
    await withScreen(
      keysAt(),
      {
        url: `${ORIGIN}/projects/${fx.PROJECT_ID}/keys`,
        storage: fx.SIGNED_IN,
        routes: keysRoutes({
          [`POST /v1/projects/${fx.PROJECT_ID}/keys`]: {
            status: 200,
            // A replay carries the metadata only: the credential field is null.
            body: { key: fx.key(), secretKey: null, replayed: true },
          },
        }),
      },
      async (s) => {
        await s.settle(30)
        await s.click(s.byRole('button', /issue key/i))
        await s.settle(30)
        // Not a modal over an empty box — that would be this app inventing a failure.
        assert.equal(
          s.document.querySelector('[role="dialog"]'),
          null,
          'a replay opened a "copy this now" modal over a null secret',
        )
        assert.match(s.text(), /already handled this exact request/i)
        assert.match(
          s.text(),
          /withdraw this key and create a replacement/i,
          'the reader is left with no next step',
        )
        // And not an error: a developer who read it as one would issue a second key nobody needs.
        assert.equal(
          s.document.querySelector('[role="alert"]:not(.dp-once__note)'),
          null,
          'a replay was rendered as a failure',
        )
      },
    )
  })

  it('BJ-DEV-10 ★ T1: rotating a webhook secret carries an idempotency key and opens the modal', async () => {
    await withScreen(
      atRoute('/projects/:id/webhooks', h(WebhooksPage), `/projects/${fx.PROJECT_ID}/webhooks`),
      {
        url: `${ORIGIN}/projects/${fx.PROJECT_ID}/webhooks`,
        storage: fx.SIGNED_IN,
        routes: {
          'GET /auth/me': { body: fx.ME },
          'GET /v1/topics': { body: { topics: ['market.listing.created'] } },
          [`GET /v1/projects/${fx.PROJECT_ID}/webhook-endpoints`]: {
            body: {
              endpoints: [
                {
                  id: fx.ENDPOINT_ID,
                  projectId: fx.PROJECT_ID,
                  environmentId: fx.ENV_ID,
                  url: 'https://example.test/hook',
                  topics: ['market.listing.created'],
                  description: 'A hook',
                  disabledAt: null,
                  createdAt: '2026-07-01T09:00:00.000Z',
                },
              ],
            },
          },
          [`POST /v1/webhook-endpoints/${fx.ENDPOINT_ID}/rotate-secret`]: {
            status: 200,
            body: {
              endpointId: fx.ENDPOINT_ID,
              overlapMinutes: 60,
              secret: 'whsec_00000000000000000000000000000000',
              replayed: false,
            },
          },
        },
      },
      async (s) => {
        await s.settle(30)
        const rotate = s.allByRole('button').find((el) => /rotate secret/i.test(s.textOf(el)))
        assert.ok(rotate, 'the endpoint offers no rotation')
        await s.click(rotate)
        await s.settle(30)

        // This route returns a secret more often than any other in the service, so a retry without
        // the idempotency wrapper mints a second one — and the first is then live with no owner.
        const posted = s.api.matching(`POST /v1/webhook-endpoints/${fx.ENDPOINT_ID}/rotate-secret`)
        assert.equal(posted.length, 1)
        assert.match(
          posted[0]?.headers['idempotency-key'] ?? '',
          /.{8,}/,
          'the rotation went out with no Idempotency-Key. The route is wrapped and requires one.',
        )
        // And it goes through the once-modal, not a toast.
        const dialog = s.document.querySelector('[role="dialog"]')
        assert.ok(dialog, 'a rotated signing secret was shown outside the once-modal')
        // The overlap window is the extra context this rotation needs: both secrets verify for it.
        assert.match(s.textOf(dialog), /60|overlap/i, 'the overlap window is not stated')
      },
    )
  })

  it('BJ-DEV-14 ★ T1: registering an OAuth client sends an Idempotency-Key and shows the secret once', async () => {
    await withScreen(
      atRoute('/projects/:id/oauth', h(OAuthPage), `/projects/${fx.PROJECT_ID}/oauth`),
      {
        url: `${ORIGIN}/projects/${fx.PROJECT_ID}/oauth`,
        storage: fx.SIGNED_IN,
        routes: {
          'GET /auth/me': { body: fx.ME },
          'GET /v1/scopes': { body: SCOPES },
          [`GET /v1/projects/${fx.PROJECT_ID}/oauth-clients`]: { body: { clients: [] } },
          [`POST /v1/projects/${fx.PROJECT_ID}/oauth-clients`]: {
            status: 201,
            body: {
              client: {
                id: 'client-1',
                projectId: fx.PROJECT_ID,
                clientId: 'cfc_0000000000000000',
                name: 'A client',
                redirectUris: ['https://example.test/callback'],
                scopes: ['market:read'],
                createdAt: '2026-08-01T09:00:00.000Z',
                revokedAt: null,
              },
              clientSecret: 'cfs_00000000000000000000000000000000',
              replayed: false,
            },
          },
        },
      },
      async (s) => {
        await s.settle(30)
        for (const field of s.allByRole('textbox')) {
          if (((field as unknown as { value: string }).value ?? '') !== '') continue
          await s.type(field, /redirect|uri|url/i.test(labelOf(field)) ? 'https://example.test/callback' : 'A client')
        }
        const register = s.allByRole('button').find((el) => /register client/i.test(s.textOf(el)))
        assert.ok(register, 'the OAuth form has no commit control')
        await s.click(register)
        await s.settle(30)

        const posted = s.api.matching(`POST /v1/projects/${fx.PROJECT_ID}/oauth-clients`)
        assert.equal(posted.length, 1, 'the form sent nothing')
        // The route is wrapped and REQUIRES one — a retry without it mints a second client secret.
        assert.match(
          posted[0]?.headers['idempotency-key'] ?? '',
          /.{8,}/,
          'the registration went out with no Idempotency-Key',
        )
        // And the secret goes through the once-modal, like every other credential this service
        // returns exactly once.
        const dialog = s.document.querySelector('[role="dialog"]')
        assert.ok(dialog, 'a client secret was shown outside the once-modal')
        assert.ok(
          [...s.document.querySelectorAll('input')].some(
            (el) => (el as unknown as { value: string }).value === 'cfs_00000000000000000000000000000000',
          ),
          'the client secret is not where it can be copied',
        )
      },
    )
  })

  it('BJ-DEV-15 T1: quotas and usage both render, and no raise is offered', async () => {
    await withScreen(
      atRoute('/projects/:id/usage', h(UsagePage), `/projects/${fx.PROJECT_ID}/usage`),
      {
        url: `${ORIGIN}/projects/${fx.PROJECT_ID}/usage`,
        storage: fx.SIGNED_IN,
        routes: {
          'GET /auth/me': { body: fx.ME },
          [`GET /v1/projects/${fx.PROJECT_ID}/quotas`]: {
            body: {
              quotas: [
                {
                  id: 'quota-1',
                  projectId: fx.PROJECT_ID,
                  environmentId: fx.ENV_ID,
                  meter: 'requests',
                  period: 'day',
                  maxUnits: 10_000,
                },
              ],
              current: { test: [{ period: 'day', used: 120, limit: 10_000 }] },
            },
          },
          [`GET /v1/projects/${fx.PROJECT_ID}/usage`]: {
            body: {
              usage: [
                {
                  environmentId: fx.ENV_ID,
                  route: 'GET /v1/listings',
                  bucket: '2026-08-03T09:00:00.000Z',
                  calls: 120,
                  errors: 2,
                },
              ],
            },
          },
        },
      },
      async (s) => {
        await s.settle(30)
        // Both halves render: the configured limit and what has been spent against it.
        assert.ok(s.text().includes('10,000') || s.text().includes('10000'), 'the limit is missing')
        assert.ok(s.text().includes('120'), 'the usage is missing')

        // THE DIRECTION IS THE AUTHORITY. Lowering is the customer's; raising is CloudsForge's,
        // and the service serves no route for it. A raise control here would be a 403 built into
        // a page and then explained. The refusal itself is devplatform's and is cited in ownedBy;
        // this asserts the absence of the control and the sentence in its place.
        const raise = s
          .allByRole('button')
          .filter((el) => /raise|increase|request more/i.test(s.textOf(el)))
        assert.deepEqual(raise.map((el) => s.textOf(el)), [], 'the page offers to raise a quota')
        assert.match(
          s.text(),
          /pushing one up belongs to CloudsForge|ask CloudsForge when you need more headroom/i,
          'the page removes the control without saying who can raise a limit, which leaves a ' +
            'reader with no route at all',
        )
        // WHAT THIS SCENARIO DOES NOT ASSERT, said rather than quietly dropped.
        //
        // The other half of the asymmetry — that LOWERING is offered — is rendered per environment
        // from a name the project shell supplies, and this scenario mounts the usage section
        // alone. Asserting it here would mean stubbing the shell's context into a shape this test
        // chose, which is a fixture asserting itself. It belongs to a scenario that mounts the
        // shell, and until there is one, the positive half is uncovered and this comment is where
        // that is recorded.
      },
    )
  })

  it('BJ-DEV-16 T1: opening a project does not fan out to five calls on mount', async () => {
    await withScreen(
      keysAt(),
      { url: `${ORIGIN}/projects/${fx.PROJECT_ID}/keys`, storage: fx.SIGNED_IN, routes: keysRoutes() },
      async (s) => {
        await s.settle(30)
        // The keys section fetches keys. It does not fetch webhooks, OAuth clients or usage, so
        // seeing a key list does not wait on the delivery log.
        for (const forbidden of ['webhook-endpoints', 'oauth-clients', 'usage', 'quotas']) {
          assert.deepEqual(
            s.api.wire.filter((w) => w.path.includes(forbidden)).map((w) => w.path),
            [],
            `opening the keys section fetched ${forbidden}`,
          )
        }
      },
    )
  })
})

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   6.19 Group S — the adversarial matrix
   ══════════════════════════════════════════════════════════════════════════════════════════ */

describe('BJ-ADV — the adversarial matrix', () => {
  it('BJ-ADV-10-H1 ★ T1: issuing a key under a double-submit sends one idempotency key', async () => {
    await withScreen(
      keysAt(),
      {
        url: `${ORIGIN}/projects/${fx.PROJECT_ID}/keys`,
        storage: fx.SIGNED_IN,
        routes: keysRoutes({
          [`POST /v1/projects/${fx.PROJECT_ID}/keys`]: {
            status: 201,
            body: { key: fx.key(), secretKey: fx.SECRET, replayed: false },
            delayMs: 15,
          },
        }),
      },
      async (s) => {
        await s.settle(30)
        const issue = s.byRole('button', /issue key/i)
        s.clickNoFlush(issue)
        await s.settle(0)
        s.clickNoFlush(issue)
        await s.settle(60)
        const posted = s.api.matching(`POST /v1/projects/${fx.PROJECT_ID}/keys`)
        assert.ok(posted.length >= 1, 'the form sent nothing')
        // The guarantee is ONE INTENT. A second key issued by a double-click is a live credential
        // nobody knows exists, which is the worst outcome this surface can produce.
        const keys = new Set(posted.map((p) => p.headers['idempotency-key']))
        assert.equal(keys.size, 1, `two presses issued ${keys.size} intents`)
      },
    )
  })

  it('BJ-ADV-10-H2 ★ T1: with the secret on screen there is no armed form behind it', async () => {
    await withScreen(
      keysAt(),
      {
        url: `${ORIGIN}/projects/${fx.PROJECT_ID}/keys`,
        storage: fx.SIGNED_IN,
        routes: keysRoutes({
          [`POST /v1/projects/${fx.PROJECT_ID}/keys`]: {
            status: 201,
            body: { key: fx.key(), secretKey: fx.SECRET, replayed: false },
          },
        }),
      },
      async (s) => {
        await s.settle(30)
        await s.click(s.byRole('button', /issue key/i))
        await s.settle(30)
        const dialog = s.document.querySelector('[role="dialog"]')
        assert.ok(dialog, 'the modal did not open')

        // The background is NOT made inert, and asserting that it were would fail on correct code:
        // the scrim stops the pointer and the Tab handler stops the keyboard. So what is asserted
        // is the mechanism this component actually uses — from inside the dialog, the keyboard
        // cannot reach the issue form that is still mounted behind it.
        const inside = s.tabbables().filter((el) => dialog.contains(el))
        assert.ok(inside.length > 0, 'nothing in the dialog is reachable by keyboard')
        ;(inside[inside.length - 1] as unknown as HTMLElement).focus()
        for (let i = 0; i < inside.length + 2; i += 1) {
          const landed = await s.tab()
          assert.ok(
            landed && dialog.contains(landed),
            `Tab ${i + 1} reached "${landed ? s.textOf(landed).slice(0, 40) : '(nothing)'}" ` +
              `behind the open dialog. The issue form is still mounted there, and the next Return ` +
              `would commit against it while an unacknowledged secret is on screen.`,
          )
        }
      },
    )
  })

  it('BJ-ADV-10-H4 ★ T1: a failed issue states the failure and leaves the form', async () => {
    await withScreen(
      keysAt(),
      {
        url: `${ORIGIN}/projects/${fx.PROJECT_ID}/keys`,
        storage: fx.SIGNED_IN,
        routes: keysRoutes({
          [`POST /v1/projects/${fx.PROJECT_ID}/keys`]: {
            status: 422,
            body: fx.error('invalid_argument', 'that scope is not one this project may hold'),
            requestId: 'req-key-422',
          },
        }),
      },
      async (s) => {
        await s.settle(30)
        await s.click(s.byRole('button', /issue key/i))
        await s.settle(30)
        assert.match(s.text(), /that scope is not one this project may hold/i)
        assert.match(s.text(), /req-key-422/, 'no request id to quote')
        // No modal: nothing was created, so nothing may look as though it was.
        assert.equal(s.document.querySelector('[role="dialog"]'), null)
        assert.ok(s.queryByRole('button', /issue key/i), 'the control was left in its busy state')
      },
    )
  })

  it('BJ-ADV-22 ★ T1: the page paints while its read is slow', async () => {
    await withScreen(
      keysAt(),
      {
        url: `${ORIGIN}/projects/${fx.PROJECT_ID}/keys`,
        storage: fx.SIGNED_IN,
        routes: keysRoutes({
          [`GET /v1/projects/${fx.PROJECT_ID}/keys`]: { body: { keys: [fx.key()] }, delayMs: 40 },
        }),
      },
      async (s) => {
        await s.settle(10)
        assert.ok(s.text().length > 40, 'the page did not paint while its read was in flight')
        await s.settle(90)
        assert.ok(s.text().includes(fx.key().display), 'the slow read never landed')
      },
    )
  })

  it('BJ-ADV-23 ★ T1: every failure state offers a request id', async () => {
    const cases: ReadonlyArray<{ name: string; el: () => ReactElement; url: string; routes: Routes }> = [
      {
        name: 'the scope catalogue',
        el: () => page(h(PlatformPage), '/'),
        url: `${ORIGIN}/`,
        routes: {
          'GET /v1/scopes': { status: 500, body: fx.error('internal', 'it broke'), requestId: 'req-a' },
        },
      },
      {
        name: 'the key list',
        el: () => keysAt(),
        url: `${ORIGIN}/projects/${fx.PROJECT_ID}/keys`,
        routes: keysRoutes({
          [`GET /v1/projects/${fx.PROJECT_ID}/keys`]: {
            status: 500,
            body: fx.error('internal', 'it broke'),
            requestId: 'req-b',
          },
        }),
      },
    ]
    for (const c of cases) {
      await withScreen(c.el(), { url: c.url, storage: fx.SIGNED_IN, routes: c.routes }, async (s) => {
        await s.settle(30)
        assert.match(s.text(), /req-[ab]/, `${c.name} failed without the request id to quote`)
      })
    }
  })
})

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   6.20 Group T — accessibility
   ══════════════════════════════════════════════════════════════════════════════════════════ */

describe('BJ-A11Y — accessibility', () => {
  it('BJ-A11Y-02 ★ T1: the dialog is labelled and described, with focus inside it', async () => {
    await withScreen(modal(), { url: `${ORIGIN}/`, routes: {} }, async (s) => {
      const dialog = s.document.querySelector('[role="dialog"]') as Element
      const labelledBy = dialog.getAttribute('aria-labelledby')
      const describedBy = dialog.getAttribute('aria-describedby')
      assert.ok(labelledBy && s.document.getElementById(labelledBy), 'the dialog has no accessible name')
      assert.ok(
        describedBy && s.document.getElementById(describedBy),
        'the dialog has no accessible description, so the warning is never read out',
      )
      // The warning is a live region, so a reader who was already on the page is told.
      assert.equal(s.document.getElementById(describedBy)?.getAttribute('role'), 'alert')
      assert.equal(s.focused(), dialog)
    })
  })

  it('BJ-A11Y-04 ★ T1: Tab cycles inside the dialog and never escapes to the page behind', async () => {
    // Doc 22 §6.20 makes this the estate's stand-in for the send flow, because 14 §11 names two
    // flows for keyboard-only coverage and neither exists. This is the one irreversible reveal
    // there is, so a mis-tab here costs a live credential with no owner.
    await withScreen(
      h(
        'div',
        null,
        // Something behind the dialog that is focusable, so "never escapes" has something to
        // escape TO. Without it the assertion would hold vacuously.
        h('a', { href: '/somewhere-else' }, 'A link on the page behind'),
        modal(),
      ),
      { url: `${ORIGIN}/`, routes: {} },
      async (s) => {
        const dialog = s.document.querySelector('[role="dialog"]') as Element
        assert.equal(s.focused(), dialog, 'focus was not moved into the dialog on mount')

        const inside = s.tabbables().filter((el) => dialog.contains(el))
        assert.ok(inside.length >= 3, 'the dialog holds too few controls for a trap to mean anything')

        // Walk the whole cycle twice and never leave.
        for (let i = 0; i < inside.length * 2 + 2; i += 1) {
          const landed = await s.tab()
          assert.ok(
            landed && dialog.contains(landed),
            `Tab ${i + 1} left the dialog and landed on ` +
              `"${landed ? s.textOf(landed).slice(0, 40) : '(nothing)'}". The next Return is a ` +
              `route change that takes the secret with it.`,
          )
        }
        // And backwards, which is the direction a trap written for one direction gets wrong.
        for (let i = 0; i < inside.length + 2; i += 1) {
          const landed = await s.tab(true)
          assert.ok(landed && dialog.contains(landed), `Shift+Tab ${i + 1} left the dialog`)
        }

        // The acknowledgement is completable by keyboard alone: tick the box, then press Done.
        const box = s.allByRole('checkbox')[0] as Element
        ;(box as unknown as HTMLElement).focus()
        await s.click(box)
        const done = s.byRole('button', /lose sight of it/i)
        assert.ok(!done.hasAttribute('disabled'), 'the acknowledgement is not reachable by keyboard')
      },
    )
  })

  it('BJ-A11Y-10 T1: every state badge carries a word', async () => {
    await withScreen(
      keysAt(),
      { url: `${ORIGIN}/projects/${fx.PROJECT_ID}/keys`, storage: fx.SIGNED_IN, routes: keysRoutes() },
      async (s) => {
        await s.settle(30)
        const badges = [...s.document.querySelectorAll('[class*="badge" i], [class*="dp-note" i]')]
        assert.ok(badges.length > 0, 'the page renders no state badges at all')
        for (const badge of badges) {
          if (badge.getAttribute('aria-hidden') === 'true') continue
          assert.ok(
            s.textOf(badge).length > 0,
            `a badge rendered with no text: ${badge.outerHTML.slice(0, 120)}`,
          )
        }
      },
    )
  })

  it('BJ-A11Y-12 T1: one main landmark, a reachable skip link, no skipped heading level', async () => {
    await withScreen(h(App), { url: `${ORIGIN}/`, routes: { 'GET /v1/scopes': { body: SCOPES } } }, async (s) => {
      await s.settle(30)
      assert.equal(s.allByRole('main').length, 1)
      const skip = s.document.querySelector('a[href^="#"]')
      assert.ok(skip, 'no skip link')
      assert.ok(s.document.getElementById((skip.getAttribute('href') ?? '#').slice(1)))
      assert.equal(s.tabbables()[0], skip, 'the skip link is not first in the tab order')

      const levels = s.allByRole('heading').map((el) => Number(el.tagName.slice(1)))
      assert.equal(levels.filter((l) => l === 1).length, 1, 'a page has exactly one h1')
      let previous = 0
      for (const level of levels) {
        assert.ok(previous === 0 || level <= previous + 1, `heading order skips h${previous} → h${level}`)
        previous = level
      }
    })
  })
})

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   5.1 — the universal per-surface property
   ══════════════════════════════════════════════════════════════════════════════════════════ */

describe('BJ-DEVELOPERS-404 — an unowned address answers 404', () => {
  const directives = readFileSync(at('nginx.conf'), 'utf8')
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n')

  it('BJ-DEVELOPERS-404 T2: nginx serves the shell through error_page 404, never try_files', () => {
    assert.match(directives, /error_page\s+404\s+\/developers\/index\.html/)
    assert.doesNotMatch(directives, /try_files\s+\$uri\s+(\$uri\/\s+)?\/index\.html/)
  })

  it('BJ-DEVELOPERS-404 T2: the not-found screen renders inside the shell', async () => {
    await withScreen(h(App), { url: `${ORIGIN}/nothing-here`, routes: {} }, async (s) => {
      assert.match(s.text(), /not found|nothing at this address|no page|does not exist/i)
      assert.ok(s.allByRole('link').length > 0, 'the not-found screen strands the reader')
      assert.ok(!ROUTES.map((r) => r.path).includes('nothing-here'))
    })
  })
})

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   The meta-test. Doc 22 §3.2.
   ══════════════════════════════════════════════════════════════════════════════════════════ */

describe('the catalogue and this file agree', () => {
  it('every id doc 22 assigns to this surface is accounted for exactly once', () => {
    const ids = SCENARIOS.map((s) => s.id)
    assert.deepEqual([...new Set(ids)].sort(), [...ids].sort(), 'an id appears twice')
    assert.deepEqual([...ids].sort(), [...DOC22_IDS].sort())
  })

  it('a scenario whose outcome depends on a server rule carries an ownedBy path', () => {
    const REFUSAL = /\b(refus|denie|denial|reject|403|409|4xx|RAISE is not offered)\w*/i
    for (const s of SCENARIOS) {
      if (s.blocked) continue
      if (!REFUSAL.test(s.what)) continue
      assert.ok(
        s.ownedBy,
        `${s.id} turns on a server-side refusal and names no test that owns it. Doc 22 §3.2.`,
      )
      assert.match(s.ownedBy.path, /^[a-z-]+\/src\/[\w./-]+\.ts$/)
    }
  })

  it('no scenario is marked implemented without a test named for it', () => {
    const source = readFileSync(at('test/journeys.test.ts'), 'utf8')
    for (const s of SCENARIOS) {
      if (s.blocked) continue
      assert.ok(
        new RegExp(`it\\('${s.id}[ ★]`).test(source),
        `${s.id} is in the catalogue as implemented and has no test named for it`,
      )
    }
  })

  it('every blocked scenario names its blocker and no blocker is a shrug', () => {
    for (const s of SCENARIOS) {
      if (!s.blocked) continue
      assert.ok(s.blocked.length > 60, `${s.id}'s blocker is too short to be a reason`)
      assert.ok(
        /doc 22|§|does not exist|no UI|tier 3|micro-beacon|not installed|no sandbox/i.test(s.blocked),
        `${s.id}'s blocker does not name a fact about the estate: ${s.blocked}`,
      )
    }
  })

  it('nothing here is tier 3 and implemented — tier 3 lives in micro-beacon', () => {
    for (const s of SCENARIOS) {
      if (s.tier !== 'T3') continue
      assert.ok(s.blocked, `${s.id} is tier 3 and not blocked; doc 22 §4 puts tier 3 in beacon`)
    }
  })
})

/* ── helpers ────────────────────────────────────────────────────────────────────────────────── */

/** The visible label of a control — the label element, never the wrapper's whole text. */
function labelOf(el: Element): string {
  const wrapping = el.closest('label')
  const span = wrapping?.querySelector('.dp-field__label')
  return span?.textContent ?? wrapping?.textContent ?? el.getAttribute('name') ?? ''
}
