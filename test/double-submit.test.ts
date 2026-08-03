/**
 * Two events in one tick, on every control in this console that writes.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE DEFECT THIS FILE EXISTS FOR
 *
 *   A GUARD WRITTEN AS COMPONENT STATE CANNOT SEE A SECOND EVENT IN THE SAME TICK.
 *
 * Both hooks in `src/lib/mutation.ts` read `if (busy) return null` out of the render closure,
 * under a comment that actively defended it — "React batches the `setBusy(true)` below before the
 * next click can be processed." It does not. `setBusy(true)` SCHEDULES a render; two clicks
 * dispatched before React commits both read `busy === false` from their own closures and both
 * start a run. `disabled={busy}` has the same hole from the other end: the attribute is not on
 * the DOM node until the render commits, and the second event was already dispatched.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THE SECOND REQUEST COSTS HERE, WHICH IS NOT WHAT IT COSTS ANYWHERE ELSE
 *
 * Not a second credential. `useIdempotentMutation` holds its key in a REF, so both same-tick
 * attempts present THE SAME `Idempotency-Key` and `devplatform` collapses them. That half was
 * always right and these scenarios must not break it.
 *
 * **It destroys the credential instead.** Three facts compose:
 *
 *   1. `POST /v1/projects/:id/keys` attaches the secret to the FIRST response and to nothing
 *      else, deliberately — "`minted` is null on a replay because the work did not run, which is
 *      precisely the behaviour that makes a replay safe" (`devplatform/src/server.ts:951-958`).
 *      There is no column it could be read back from: `api_keys` stores only salt and hash, under
 *      a CHECK that refuses anything but scrypt (`devplatform/src/migrations.ts:204`).
 *   2. The duplicate BLOCKS on the first transaction's uncommitted row and replays once it
 *      commits (`devplatform/src/idempotency.ts:154-167`), so it always resolves LAST.
 *   3. `IssueKey` calls `setIssued(result)` inside the work, so last write wins.
 *
 * The developer therefore ends holding the REPLAY, whose `secretKey` is `null`. `<Replayed>`
 * then renders — and it is telling the truth, which is what makes this so bad: the key WAS
 * created, it IS live, and its secret genuinely cannot be shown again. It was simply never shown
 * once. That is a live key with no owner, the exact artefact `devplatform/src/server.ts:903-905`
 * says its wrapper exists to prevent, manufactured entirely by this client.
 *
 * The same shape holds for the webhook secret, the rotation and the OAuth client secret.
 *
 * ── WHY THIS BELONGS TO THE CLIENT ────────────────────────────────────────────────────────────
 *
 * Doc 22 §3 forbids a browser scenario from asserting a business rule, and collapsing duplicates
 * IS the service's rule. HOW MANY TIMES A BROWSER SENDS is not: it is the one thing about a
 * duplicate that is squarely the client's own.
 *
 * ── AND BOTH WAYS ROUND ───────────────────────────────────────────────────────────────────────
 *
 * `src/main.tsx:29` renders under `<StrictMode>`; this harness mounted without it until this file
 * added `strict`. A ref latch is CREATED TWICE on a StrictMode mount, so a guard proven only in
 * the plain mode has never been run the way the app runs it. Every proof below runs twice — and
 * `strict` is itself proven by the meta-test at the top, because three repos in the previous
 * sweep shipped a mutation making `strict: true` a no-op and SURVIVED it, which means their
 * paired tests had been silent duplicates all along.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createElement as h, useRef, type ReactElement } from 'react'
import { MemoryRouter, Route, Routes as RouterRoutes } from 'react-router-dom'

import { withScreen, type Routes } from './dom.ts'
import * as fx from './fixtures.ts'
import { AuthProvider } from '../src/lib/auth.tsx'
import { useIdempotentMutation, useMutation } from '../src/lib/mutation.ts'
import { KeysPage } from '../src/pages/keys.tsx'
import { WebhooksPage } from '../src/pages/webhooks.tsx'

const ORIGIN = 'https://developers.cloudsforge.online'

const atRoute = (pattern: string, element: ReactElement, path: string): ReactElement =>
  h(
    MemoryRouter,
    { initialEntries: [path] },
    h(AuthProvider, null, h(RouterRoutes, null, h(Route, { path: pattern, element }))) as ReactElement,
  )

const keysAt = () => atRoute('/projects/:id/keys', h(KeysPage), `/projects/${fx.PROJECT_ID}/keys`)
const webhooksAt = () =>
  atRoute('/projects/:id/webhooks', h(WebhooksPage), `/projects/${fx.PROJECT_ID}/webhooks`)

const SCOPES = {
  scopes: [{ name: 'market:read', description: 'Read listings.', product: 'market' }],
}

const keysRoutes = (over: Routes = {}): Routes => ({
  'GET /auth/me': { body: fx.ME },
  'GET /v1/scopes': { body: SCOPES },
  [`GET /v1/projects/${fx.PROJECT_ID}/keys`]: { body: { keys: [fx.key()] } },
  ...over,
})

/** The message an assertion prints when a control sent twice. */
const once = (what: string, n: number, cost: string): string =>
  `${what} left the browser ${n} times for ONE double click. ` +
  `A guard read from component state cannot see the second event in the same tick — take the ` +
  `latch in a ref before the first await. ${cost}`

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   THE META-TEST. Without this, everything below is one test written twice.
   ══════════════════════════════════════════════════════════════════════════════════════════ */

describe('the `strict` option really is StrictMode', () => {
  const Probe = ({ box }: { box: { passes: number } }): ReactElement => {
    box.passes += 1
    return h('p', null, 'A probe with enough text to clear the forty-character floor this harness enforces.')
  }

  it('double-invokes the component function under strict, and does not without it', async () => {
    const plain = { passes: 0 }
    const strict = { passes: 0 }

    await withScreen(h(Probe, { box: plain }), { url: ORIGIN }, async () => undefined)
    await withScreen(h(Probe, { box: strict }), { url: ORIGIN, strict: true }, async () => undefined)

    assert.ok(plain.passes > 0, 'the plain probe never rendered at all')
    assert.ok(
      strict.passes > plain.passes,
      `\`strict: true\` did not change how the tree was rendered: ${plain.passes} render pass(es) ` +
        `plain and ${strict.passes} under strict. The option is a no-op, which means every ` +
        `"under StrictMode" scenario in this file is a silent duplicate of its plain twin and ` +
        `proves nothing. This is the exact failure three repos shipped in the previous sweep.`,
    )
  })

  it('a ref survives the StrictMode double-invocation, which is why the latch may be one', async () => {
    const seen: unknown[] = []
    const Probe2 = (): ReactElement => {
      const ref = useRef({})
      seen.push(ref.current)
      return h('p', null, 'A probe with enough text to clear the forty-character floor this harness enforces.')
    }
    await withScreen(h(Probe2), { url: ORIGIN, strict: true }, async () => undefined)
    assert.ok(seen.length >= 2, 'the probe did not render twice, so this proves nothing about strict')
    assert.equal(
      new Set(seen).size,
      1,
      'the committed tree kept more than one ref identity, so a latch in a ref would not be shared ' +
        'between two clicks of a double click',
    )
  })
})

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   BOTH HOOKS, at their narrowest.
   ══════════════════════════════════════════════════════════════════════════════════════════ */

for (const strict of [false, true]) {
  const mode = strict ? 'under StrictMode' : 'plain'

  describe(`the mutation hooks run once per double click — ${mode}`, () => {
    it(`useMutation starts one run, not two (${mode})`, async () => {
      const box = { runs: 0 }
      const Probe = (): ReactElement => {
        const m = useMutation(async () => {
          box.runs += 1
          await new Promise((r) => setTimeout(r, 30))
          return 'done'
        }, 'It did not work.')
        return h(
          'div',
          null,
          h('button', { type: 'button', onClick: () => void m.run() }, 'Do the thing'),
          h('p', null, m.busy ? 'Working…' : 'Idle, and long enough to clear the floor.'),
        )
      }

      await withScreen(h(Probe), { url: ORIGIN, strict }, async (s) => {
        const button = s.byRole('button', 'Do the thing')
        s.clickNoFlush(button)
        s.clickNoFlush(button)
        await s.settle(5)
        // The affordance HAS committed mid-flight. `busy` is still worth setting; it is just not
        // the guard. Asserting it stops a "fix" that deletes `busy` altogether.
        assert.match(s.text(), /Working…/, 'the busy affordance never rendered')
        await s.settle(60)
        assert.equal(box.runs, 1, once('the work', box.runs, 'One press is one run.'))
      })
    })

    it(`useIdempotentMutation starts one run under one key, not two (${mode})`, async () => {
      // Both halves in one scenario, because they fail apart: the key was already shared between
      // the two attempts (it lives in a ref), so a test asserting only "one key" passed happily
      // against the defect. What was wrong was that there were two ATTEMPTS.
      const keys: string[] = []
      const Probe = (): ReactElement => {
        const m = useIdempotentMutation(async (key: string) => {
          keys.push(key)
          await new Promise((r) => setTimeout(r, 30))
          return 'done'
        }, 'It did not work.')
        return h(
          'div',
          null,
          h('button', { type: 'button', onClick: () => void m.run() }, 'Do the thing'),
          h('p', null, m.busy ? 'Working…' : 'Idle, and long enough to clear the floor.'),
        )
      }

      await withScreen(h(Probe), { url: ORIGIN, strict }, async (s) => {
        const button = s.byRole('button', 'Do the thing')
        s.clickNoFlush(button)
        s.clickNoFlush(button)
        await s.settle(60)
        assert.equal(keys.length, 1, once('the work', keys.length, 'One press is one attempt.'))
        assert.ok((keys[0] ?? '').length >= 8, 'the attempt carried no usable idempotency key')
      })
    })

    it(`releases the latch when the work throws, so the form is not wedged (${mode})`, async () => {
      // The failure mode that gets a latch deleted rather than fixed: released after the `try`
      // instead of in `finally`, the first throw kills the button for the life of the page.
      const box = { runs: 0 }
      const Probe = (): ReactElement => {
        const m = useMutation(async () => {
          box.runs += 1
          await new Promise((r) => setTimeout(r, 5))
          throw new Error('the upstream is unreachable')
        }, 'It did not work.')
        return h(
          'div',
          null,
          h('button', { type: 'button', onClick: () => void m.run() }, 'Do the thing'),
          h('p', null, 'Idle, and long enough to clear the forty-character floor.'),
        )
      }

      await withScreen(h(Probe), { url: ORIGIN, strict }, async (s) => {
        const button = s.byRole('button', 'Do the thing')
        await s.click(button)
        await s.settle(20)
        await s.click(button)
        await s.settle(20)
        assert.equal(
          box.runs,
          2,
          `the second press did not run: the latch was not released after a throw, so one failed ` +
            `attempt wedges this form for the life of the page (${box.runs} run(s))`,
        )
      })
    })
  })
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   THE REAL SCREENS — and the credential.
   ══════════════════════════════════════════════════════════════════════════════════════════ */

for (const strict of [false, true]) {
  const mode = strict ? 'under StrictMode' : 'plain'

  describe(`one press is one write — ${mode}`, () => {
    /**
     * The service, modelled honestly: the first attempt mints and returns the secret, and a
     * duplicate under the same key replays the STORED response, which carries metadata only.
     *
     * A stub that answered both the same way would let every scenario here pass against the
     * defect — the replay's `secretKey: null` IS the damage.
     */
    const issueRoute = (over: Routes = {}) =>
      keysRoutes({
        [`POST /v1/projects/${fx.PROJECT_ID}/keys`]: (_w, n) =>
          n === 1
            ? { status: 201, body: { key: fx.key(), secretKey: fx.SECRET, replayed: false }, delayMs: 30 }
            : { status: 200, body: { key: fx.key(), secretKey: null, replayed: true }, delayMs: 45 },
        ...over,
      })

    it(`issuing a key sends one POST, not two (${mode})`, async () => {
      const path = `POST /v1/projects/${fx.PROJECT_ID}/keys`
      await withScreen(
        keysAt(),
        { url: `${ORIGIN}/projects/${fx.PROJECT_ID}/keys`, strict, storage: fx.SIGNED_IN, routes: issueRoute() },
        async (s) => {
          await s.settle(30)
          const button = s.byRole('button', /issue key/i)
          s.clickNoFlush(button)
          s.clickNoFlush(button)
          await s.settle(120)

          const sent = s.api.matching(path)
          assert.equal(
            sent.length,
            1,
            once(
              'a key issuance',
              sent.length,
              'The second is a replay whose secretKey is null, and it resolves last.',
            ),
          )
        },
      )
    })

    it(`and the developer is SHOWN the secret, not told it can never be shown (${mode})`, async () => {
      // The half that matters to a person, and the one nothing on this page masks: `IssueKey`
      // renders outside the list's `state === 'ok'` branch (src/pages/keys.tsx:59), so the
      // reload after a success does not unmount it and take `issued` with it.
      await withScreen(
        keysAt(),
        { url: `${ORIGIN}/projects/${fx.PROJECT_ID}/keys`, strict, storage: fx.SIGNED_IN, routes: issueRoute() },
        async (s) => {
          await s.settle(30)
          const button = s.byRole('button', /issue key/i)
          s.clickNoFlush(button)
          s.clickNoFlush(button)
          await s.settle(120)

          const dialog = s.document.querySelector('[role="dialog"]')
          assert.ok(
            dialog,
            'a double click destroyed the credential: the replay resolved last, `setIssued` took ' +
              'its null `secretKey`, and the developer was handed <Replayed> instead of the one ' +
              'and only sight of the secret. The key is live and nobody knows what it is.',
          )
          assert.ok(
            [...s.document.querySelectorAll('input')].some(
              (el) => (el as unknown as { value: string }).value === fx.SECRET,
            ),
            'the once-modal opened without the secret in it',
          )
          assert.doesNotMatch(
            s.text(),
            /repeated one that had already completed/i,
            'the console told the developer their request was a repeat of one they never made',
          )
        },
      )
    })

    it(`rotating a webhook secret sends one POST, not two (${mode})`, async () => {
      const path = `POST /v1/webhook-endpoints/${fx.ENDPOINT_ID}/rotate-secret`
      await withScreen(
        webhooksAt(),
        {
          url: `${ORIGIN}/projects/${fx.PROJECT_ID}/webhooks`,
          strict,
          storage: fx.SIGNED_IN,
          routes: {
            'GET /auth/me': { body: fx.ME },
            [`GET /v1/projects/${fx.PROJECT_ID}/webhook-endpoints`]: {
              body: {
                endpoints: [
                  {
                    id: fx.ENDPOINT_ID,
                    projectId: fx.PROJECT_ID,
                    environmentId: fx.ENV_ID,
                    url: 'https://example.test/hooks',
                    topics: ['market.listing.created'],
                    description: 'The listings feed.',
                    disabledAt: null,
                    createdAt: '2026-08-01T09:00:00.000Z',
                  },
                ],
              },
            },
            [path]: (_w, n) =>
              n === 1
                ? { body: { endpointId: fx.ENDPOINT_ID, overlapMinutes: 60, secret: fx.SECRET }, delayMs: 30 }
                : { body: { endpointId: fx.ENDPOINT_ID, overlapMinutes: 60, secret: null }, delayMs: 45 },
          },
        },
        async (s) => {
          await s.settle(30)
          const button = s.queryByRole('button', 'Rotate secret')
          assert.ok(button, 'the rotate control is not on this screen, so this scenario proves nothing')
          s.clickNoFlush(button)
          s.clickNoFlush(button)
          await s.settle(120)

          const sent = s.api.matching(path)
          assert.equal(
            sent.length,
            1,
            once(
              'a secret rotation',
              sent.length,
              'The replay carries no secret, and it retires the one the customer has just been ' +
                'shown but has not yet deployed.',
            ),
          )
        },
      )
    })
  })
}
