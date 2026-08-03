/**
 * The `Idempotency-Key` this bundle sends, on the five routes that require one and nowhere else.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * FIVE ROUTES REQUIRE IT. ELEVEN OTHER MUTATIONS DO NOT READ IT AT ALL.
 *
 * That split is a fact about `devplatform`, and it is the fact a client copied from a sibling gets
 * wrong in one direction or the other. `micro-trade` requires the header on EVERY mutating route;
 * `micro-mint` reads it nowhere. This service does neither: `withIdempotentRoute` throws when the
 * header is missing or outside 8–200 characters (`devplatform/src/server.ts:1637-1642`), and it
 * wraps exactly these five —
 *
 *   `POST /v1/projects`                            `devplatform/src/server.ts:851`
 *   `POST /v1/projects/:id/keys`                   `devplatform/src/server.ts:919`
 *   `POST /v1/projects/:id/webhook-endpoints`      `devplatform/src/server.ts:1125`
 *   `POST /v1/webhook-endpoints/:id/rotate-secret` `devplatform/src/server.ts:1164`
 *   `POST /v1/projects/:id/oauth-clients`          `devplatform/src/server.ts:1246`
 *
 * — while eleven other mutations are exempt, each naming the mechanism that makes a retry safe
 * without a wrapper: a natural key with `on conflict do nothing`, an upsert, a state transition
 * claimed with a WHERE clause, or a DELETE. The list is
 * `devplatform/src/routeidempotency.test.ts:34-68`, and the service has a source-level test that
 * fails when a route is added without either a wrapper or an entry — because the defect is an
 * OMISSION, and an omission has no behaviour to test.
 *
 * **So this file exports one function and the wrapper functions in src/lib/devplatform.ts decide
 * where it is used.** Sending the header to a route that does not read it is harmless but
 * dishonest — it makes the client look like it is protecting something it is not — and NOT sending
 * it to one of the five is a 400 on the one action in this product that mints a credential.
 * `test/devplatform.test.ts` asserts both directions against the real service.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ── Why it matters most here, of anywhere in the estate ───────────────────────────────────────
 *
 * `devplatform/src/server.ts:903-905`: a double-clicked "Create key" without the wrapper "mints
 * two credentials, and the second is one the developer never sees and therefore never revokes — a
 * live key with no owner." That is the worst artefact this whole product could produce, and the
 * header is what prevents it.
 *
 * ── The reuse rule, which is the part that is easy to get backwards ───────────────────────────
 *
 * The service stores the key with a FINGERPRINT of the request (`requestFingerprint`,
 * `devplatform/src/idempotency.ts:84`) and then makes three different decisions:
 *
 *   * same key, same request, work committed → the stored response is REPLAYED, `200` with
 *     `replayed: true` (`devplatform/src/server.ts:1657-1662`). **The secret is NOT in the stored
 *     response**, so a replay answers `secretKey: null`, which is the behaviour that makes the
 *     replay safe (`devplatform/src/server.ts:907-910`).
 *   * same key, **different** request → `IdempotencyKeyReuseError`, a 409 `idempotency_key_reuse`
 *     (`devplatform/src/server.ts:446-448`).
 *   * same key, claim exists, no response yet → `IdempotencyInFlightError`, a 409
 *     `idempotency_in_flight` (`devplatform/src/server.ts:449-451`). Retry shortly, with the SAME
 *     key.
 *
 * So a key is not "one per click" and it is not "one per form" either. It belongs to an ATTEMPT AT
 * ONE INTENT: minted when the user commits to an action, kept while the outcome is unknown, and
 * thrown away the moment the outcome is known — success or refusal alike. Keeping it after a
 * refusal is how a developer who fixes a validation error gets a 409 they cannot act on; dropping
 * it after a timeout is how a second live credential appears with nobody watching it.
 *
 * `keepKeyAfter()` below is that decision as a pure function, so `test/idempotency.test.ts` can
 * walk every case without a browser.
 */
import { ApiError } from './api.ts'

/** How the service spells the two idempotency refusals. `devplatform/src/server.ts:447`, `:450`. */
export const IN_FLIGHT_CODE = 'idempotency_in_flight'
export const KEY_REUSE_CODE = 'idempotency_key_reuse'

/** The header name, spelled as the service reads it — `devplatform/src/server.ts:219`. */
export const IDEMPOTENCY_HEADER = 'idempotency-key'

/**
 * A fresh key.
 *
 * Prefixed so an operator reading `idempotency_keys.client_key` can tell a browser's key from a
 * service's without joining anything. The stored key is namespaced by the principal and the route
 * anyway (`devplatform/src/server.ts:1643-1647`), so this prefix is for humans, not for collision
 * avoidance.
 *
 * Length is 49 characters, comfortably inside the service's 8–200 window
 * (`devplatform/src/server.ts:220`).
 */
export function newIdempotencyKey(): string {
  return `cf-devportal-web-${uuid()}`
}

function uuid(): string {
  const c = globalThis.crypto as Crypto | undefined
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  if (c && typeof c.getRandomValues === 'function') {
    const bytes = c.getRandomValues(new Uint8Array(16))
    return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  }
  // Last resort. Weak randomness is survivable for an idempotency key — the worst outcome of a
  // collision is a 409 rather than a second credential, because the service compares the REQUEST
  // too — and a bundle that threw here instead would take the page down over it.
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`
}

/**
 * The header map for one attempt.
 *
 * A function rather than an inline object literal at each call site, so `test/devplatform.test.ts`
 * can count the routes that send one and compare that count against the routes the service wraps.
 * An inline literal would have to be counted by a regex over five different spellings.
 */
export function idempotently(key: string): Record<string, string> {
  return { [IDEMPOTENCY_HEADER]: key }
}

/**
 * Whether the key that produced `err` must be presented again on the next attempt.
 *
 * True only while the outcome is genuinely UNKNOWN:
 *
 *   * a transport failure (`status: 0`) — the request may have been received and its answer lost;
 *   * any 5xx, including this service's `503 membership_unavailable`
 *     (`devplatform/src/server.ts:428-432`) and `503 verifier_unavailable` (`:442-445`), both of
 *     which can fire after work has partially committed;
 *   * `idempotency_in_flight`, which is the service explicitly saying "the original is still
 *     committing; come back with this key".
 *
 * False for every 4xx that is a decision: a 400 on an unknown scope, a 404 on a project the caller
 * cannot see, a 409 `conflict` on a taken slug, a 403. None of those did any work, and all of them
 * are followed by the developer changing something — at which point the old key with a new request
 * is a 409 `idempotency_key_reuse` that has nothing to do with the change they made.
 *
 * **`idempotency_key_reuse` is deliberately FALSE**, and it is the case worth stating: it means the
 * key has already been spent on a DIFFERENT request. Re-presenting it can only produce the same
 * 409 for ever.
 */
export function keepKeyAfter(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false
  if (err.code === IN_FLIGHT_CODE) return true
  if (err.code === KEY_REUSE_CODE) return false
  return err.status === 0 || err.status >= 500
}
