/**
 * Running one write, and being honest about the three ways it can end.
 *
 * `useResource` covers reads. A write needs different answers: it is not running until somebody
 * asks, only one may be in flight at a time, and its failure belongs beside the control that caused
 * it rather than in place of the page.
 *
 * ── Why `busy` is not merely cosmetic on THIS surface ─────────────────────────────────────────
 *
 * Four of this app's writes mint a credential, and each does it exactly once:
 * `POST /v1/projects/:id/keys` (`devplatform/src/server.ts`),
 * `POST /v1/projects/:id/webhook-endpoints`,
 * `POST /v1/webhook-endpoints/:id/rotate-secret` and
 * `POST /v1/projects/:id/oauth-clients`. The service says what an unprotected double click
 * costs, in its own words at `devplatform/src/server.ts`: two credentials, "and the second
 * is one the developer never sees and therefore never revokes — a live key with no owner".
 *
 * The `Idempotency-Key` those five routes require is what makes a RETRY safe. It is not what makes
 * a double click safe — so the hook still refuses to start a second run while one is in flight.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * ── THE GUARD IS A REF, AND WAS ONCE A PIECE OF STATE ─────────────────────────────────────────
 *
 * Both hooks below used to read `if (busy) return null` out of the render closure, under a comment
 * asserting that "React batches the `setBusy(true)` below before the next click can be processed."
 * **It does not.** `setBusy(true)` only SCHEDULES a render; two clicks dispatched in one tick both
 * read `busy === false` from their own closures and both start a run. `disabled={busy}` has the
 * identical hole from the other end — the attribute is not on the DOM node until the render
 * commits, and the second event was dispatched before that.
 *
 * ── ON THIS SURFACE THE SECOND REQUEST DESTROYS A CREDENTIAL ──────────────────────────────────
 *
 * Not by minting a second one. `useIdempotentMutation` holds its key in a REF, so both same-tick
 * attempts present THE SAME key and `devplatform`'s wrapper collapses them — that half was always
 * right. The damage is subtler and worse.
 *
 * `POST /v1/projects/:id/keys` attaches the secret to the FIRST response and to nothing else, on
 * purpose: "`minted` is null on a replay because the work did not run — which is precisely the
 * behaviour that makes a replay safe" (`devplatform/src/server.ts`). The duplicate BLOCKS
 * on the first transaction's uncommitted row (`devplatform/src/idempotency.ts`) and so
 * always resolves LAST — and last write wins. `KeyForm` calls `setIssued(result)` inside the work,
 * so the developer is left holding the REPLAY, whose `secretKey` is `null`.
 *
 * The outcome: the key was created, it is live, `<Replayed>` correctly says its secret "cannot be
 * shown again" — and the developer never saw it once. That is a live credential with no owner,
 * which is the exact artefact `devplatform/src/server.ts` says the wrapper exists to
 * prevent, arrived at from the other end and manufactured entirely by this client. The same holds
 * for the webhook secret, the rotation and the OAuth client secret.
 *
 * So: the latch is taken SYNCHRONOUSLY, before the first `await` and before the key is minted, and
 * released in `finally` so a throw cannot wedge the form. `busy` survives as affordance only — a
 * label and a `disabled` attribute — and is never the guard.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import { useCallback, useRef, useState } from 'react'
import { noticeFor, type ErrorNotice } from './api.ts'
import { keepKeyAfter, newIdempotencyKey } from './idempotency.ts'

export interface Mutation<A extends unknown[], T> {
  readonly busy: boolean
  readonly error: ErrorNotice | null
  /** The last successful result, kept so a 202 acceptance can be rendered after the fact. */
  readonly result: T | null
  readonly run: (...args: A) => Promise<T | null>
  readonly reset: () => void
}

export function useMutation<A extends unknown[], T>(
  fn: (...args: A) => Promise<T>,
  fallbackMessage: string,
): Mutation<A, T> {
  // Not `useState`: the whole point is a value written and read in the same tick.
  //
  // Under `<StrictMode>` (src/main.tsx) React double-invokes the component function on mount,
  // so this initialiser runs twice and one of the two refs is discarded. That is harmless — both
  // start `false`, and from the first commit onwards there is exactly one ref, which is the one
  // both clicks of a double click read. `test/double-submit.test.ts` proves every scenario in
  // both modes, because a guard that has only ever run outside StrictMode is a guard that has
  // never run the way this app runs it.
  const latch = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ErrorNotice | null>(null)
  const [result, setResult] = useState<T | null>(null)

  const run = useCallback(
    async (...args: A): Promise<T | null> => {
      // Synchronous, and before the first `await`. `busy` is affordance, never the guard.
      if (latch.current) return null
      latch.current = true
      setBusy(true)
      setError(null)
      try {
        const value = await fn(...args)
        setResult(value)
        return value
      } catch (err) {
        setError(noticeFor(err, fallbackMessage))
        return null
      } finally {
        // The ref first, and both in the `finally`. Releasing after the `try` instead would leave
        // the control permanently dead the first time the work threw — the failure mode that gets
        // a latch deleted rather than fixed.
        latch.current = false
        setBusy(false)
      }
    },
    [fn, fallbackMessage],
  )

  const reset = useCallback(() => {
    setError(null)
    setResult(null)
  }, [])

  return { busy, error, result, run, reset }
}

/**
 * The same, for a write that must carry an `Idempotency-Key`.
 *
 * `fn` receives the key as its FIRST argument rather than minting one itself, because the whole
 * question is when a key may be presented twice and a function that mints its own can only ever
 * answer "never" — which is the answer that mints a
 * second credential after a timeout.
 *
 * The lifecycle, in three lines:
 *
 *   * no key held → mint one;
 *   * the attempt ends with the outcome UNKNOWN (transport failure, 5xx, `idempotency_in_flight`)
 *     → keep it, so the retry is a replay rather than a repeat (`keepKeyAfter`, and the reasoning
 *     in `src/lib/idempotency.ts`);
 *   * the attempt ends with the outcome KNOWN, success or refusal alike → drop it, so the next
 *     intent is a new one and an edited payload cannot collide with the old fingerprint
 *     (`devplatform/src/server.ts`).
 *
 * `reset()` drops the key too: it is what a screen calls when the user abandons the attempt.
 */
export function useIdempotentMutation<A extends unknown[], T>(
  fn: (idempotencyKey: string, ...args: A) => Promise<T>,
  fallbackMessage: string,
): Mutation<A, T> {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ErrorNotice | null>(null)
  const [result, setResult] = useState<T | null>(null)
  // A ref, deliberately: the key must be readable by the very next call without waiting for a
  // render, and it is never displayed, so nothing renders from it.
  const key = useRef<string | null>(null)
  // The same reasoning one level up, and the reason a same-tick duplicate here was never a second
  // credential but WAS a destroyed one. See the header.
  const latch = useRef(false)

  const run = useCallback(
    async (...args: A): Promise<T | null> => {
      // Before the key is minted, not after: a second entrant that got as far as reading
      // `key.current` would send the same key and collapse into a replay whose `secretKey` is
      // null, and that replay resolves last and wins.
      if (latch.current) return null
      latch.current = true
      setBusy(true)
      setError(null)
      const attempt = key.current ?? newIdempotencyKey()
      key.current = attempt
      try {
        const value = await fn(attempt, ...args)
        key.current = null
        setResult(value)
        return value
      } catch (err) {
        if (!keepKeyAfter(err)) key.current = null
        setError(noticeFor(err, fallbackMessage))
        return null
      } finally {
        latch.current = false
        setBusy(false)
      }
    },
    [fn, fallbackMessage],
  )

  const reset = useCallback(() => {
    key.current = null
    setError(null)
    setResult(null)
  }, [])

  return { busy, error, result, run, reset }
}
