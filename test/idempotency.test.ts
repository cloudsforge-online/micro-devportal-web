/**
 * When the key is kept and when it is thrown away.
 *
 * The rule is easy to get backwards in either direction, and both directions have a cost. Keeping a
 * key after a REFUSAL means a developer who fixes a validation error gets a 409
 * `idempotency_key_reuse` that has nothing to do with the change they made. Dropping one after a
 * TIMEOUT means the retry mints a second credential — and on this surface that second credential is
 * live, in the wild, and nobody knows its value.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ApiError } from '../src/lib/api.ts'
import {
  IDEMPOTENCY_HEADER,
  IN_FLIGHT_CODE,
  KEY_REUSE_CODE,
  idempotently,
  keepKeyAfter,
  newIdempotencyKey,
} from '../src/lib/idempotency.ts'

describe('a minted key', () => {
  it('is inside the service’s 8–200 character window', () => {
    // `SAFE_IDEMPOTENCY_KEY` is /^[A-Za-z0-9._:-]{8,200}$/ — `devplatform/src/server.ts`.
    const key = newIdempotencyKey()
    assert.ok(key.length >= 8 && key.length <= 200, `${key.length} characters`)
  })

  it('uses only characters the service’s pattern allows', () => {
    assert.match(newIdempotencyKey(), /^[A-Za-z0-9._:-]+$/)
  })

  it('names the bundle, so an operator can tell a browser’s key from a service’s', () => {
    assert.match(newIdempotencyKey(), /^cf-devportal-web-/)
  })

  it('is different every time', () => {
    const keys = new Set(Array.from({ length: 50 }, newIdempotencyKey))
    assert.equal(keys.size, 50)
  })
})

describe('the header map', () => {
  it('spells the header the way the service reads it', () => {
    assert.equal(IDEMPOTENCY_HEADER, 'idempotency-key')
    assert.deepEqual(idempotently('abcdefgh'), { 'idempotency-key': 'abcdefgh' })
  })
})

describe('whether to present the same key again', () => {
  it('keeps it while the original may still be committing', () => {
    assert.equal(keepKeyAfter(new ApiError(409, 'in flight', IN_FLIGHT_CODE)), true)
  })

  it('keeps it when the request may have been received and its answer lost', () => {
    // status 0 is `api.ts`'s transport failure.
    assert.equal(keepKeyAfter(new ApiError(0, 'Cannot reach the server.')), true)
  })

  it('keeps it for every 5xx, including the two 503s this service answers', () => {
    for (const [status, code] of [
      [500, 'internal'],
      [503, 'membership_unavailable'],
      [503, 'verifier_unavailable'],
      [502, undefined],
    ] as const) {
      assert.equal(keepKeyAfter(new ApiError(status, 'x', code)), true, `${status} ${code}`)
    }
  })

  it('THROWS IT AWAY after idempotency_key_reuse, which is the case worth stating', () => {
    // The key has already been spent on a DIFFERENT request. Re-presenting it can only produce the
    // same 409 for ever, and a client that kept it would be permanently stuck on the first form
    // the developer got wrong.
    assert.equal(keepKeyAfter(new ApiError(409, 'reused', KEY_REUSE_CODE)), false)
  })

  it('throws it away after every 4xx that is a decision', () => {
    for (const [status, code] of [
      [400, 'unknown_scope'],
      [400, 'bad_request'],
      [400, 'invalid'],
      [403, 'forbidden'],
      [404, 'not_found'],
      [409, 'conflict'],
      [401, 'unauthenticated'],
    ] as const) {
      assert.equal(keepKeyAfter(new ApiError(status, 'x', code)), false, `${status} ${code}`)
    }
  })

  it('throws it away for anything that is not an ApiError at all', () => {
    // A bug in this bundle is not evidence that the service did any work.
    for (const err of [new Error('boom'), 'boom', null, undefined, {}]) {
      assert.equal(keepKeyAfter(err), false)
    }
  })
})
