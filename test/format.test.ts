/**
 * The words this app puts on the screen, checked as decisions rather than as strings.
 *
 * Two of them are load-bearing beyond the usual: `keyState` decides whether a credential is
 * presented as live, and `SHOWN_ONCE` is the claim a developer acts on before they lose something
 * irreplaceable.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  SHOWN_ONCE,
  WEBHOOK_SECRET_NOTE,
  applicationState,
  count,
  deliveryState,
  isDisplayString,
  keyState,
  percent,
  quotaTone,
  when,
} from '../src/lib/format.ts'
import { APPLICATION_STATUSES } from '../src/lib/devplatform.ts'

const NOW = new Date('2026-08-01T12:00:00.000Z')

describe('the two sentences about secrets', () => {
  it('the API key one says scrypt and says it cannot be recovered', () => {
    // Verbatim from `devplatform/src/server.ts`; `test/devplatform.test.ts` proves the two are
    // still identical against the real service.
    assert.match(SHOWN_ONCE, /only time this secret is shown/i)
    assert.match(SHOWN_ONCE, /scrypt/)
    assert.match(SHOWN_ONCE, /cannot be recovered/i)
  })

  it('the webhook one does NOT claim to be hashed, because that secret is stored', () => {
    // `webhook_secrets` holds plaintext, because signing a delivery requires the secret itself
    // (`devplatform/src/migrations.ts`). Saying it is hashed would be false, and this product
    // does not get to be vague about which of its secrets are recoverable.
    assert.doesNotMatch(WEBHOOK_SECRET_NOTE, /scrypt|hashed/i)
    assert.match(WEBHOOK_SECRET_NOTE, /only time this secret is shown/i)
    assert.match(WEBHOOK_SECRET_NOTE, /no route returns it/i)
  })

  it('neither offers a way to get it back', () => {
    for (const sentence of [SHOWN_ONCE, WEBHOOK_SECRET_NOTE]) {
      assert.doesNotMatch(sentence, /\b(retrieve|recover it|resend|contact support|dashboard)\b/i)
    }
  })
})

describe('the state of a key', () => {
  const live = { revokedAt: null, expiresAt: null, lastUsedAt: '2026-07-30T00:00:00Z' }

  it('is live when it has been used and is neither revoked nor expired', () => {
    assert.equal(keyState(live, NOW).word, 'Live')
    assert.equal(keyState(live, NOW).tone, 'good')
  })

  it('distinguishes a key that has never been used from one that has', () => {
    // "Never used" is a diagnosis, not a decoration: it is what a developer sees when the key they
    // deployed is not the key their service is presenting.
    assert.equal(keyState({ ...live, lastUsedAt: null }, NOW).word, 'Never used')
  })

  it('is expired once the expiry has passed', () => {
    assert.equal(keyState({ ...live, expiresAt: '2026-07-01T00:00:00Z' }, NOW).word, 'Expired')
  })

  it('is live while the expiry is still in the future', () => {
    assert.equal(keyState({ ...live, expiresAt: '2027-01-01T00:00:00Z' }, NOW).word, 'Live')
  })

  it('REVOKED WINS OVER EXPIRED, and the order of the checks is the whole point', () => {
    // Revocation is the deliberate act and expiry is the calendar. Telling somebody their key
    // expired when a colleague revoked it sends them to fix the wrong thing.
    const both = { revokedAt: '2026-07-15T00:00:00Z', expiresAt: '2026-07-01T00:00:00Z', lastUsedAt: null }
    assert.equal(keyState(both, NOW).word, 'Revoked')
  })

  it('treats a null expiry as “does not expire”, never as unknown', () => {
    assert.equal(keyState({ ...live, expiresAt: null }, NOW).word, 'Live')
  })
})

describe('the state of a delivery', () => {
  it('is delivered when the endpoint answered', () => {
    assert.equal(
      deliveryState({ deliveredAt: '2026-08-01T00:00:00Z', attempts: 1, lastStatus: 200 }, 8).word,
      'Delivered',
    )
  })

  it('is retrying below the ceiling', () => {
    assert.equal(deliveryState({ deliveredAt: null, attempts: 3, lastStatus: 500 }, 8).word, 'Retrying')
  })

  it('is ABANDONED at the ceiling and above, because the row stays for ever either way', () => {
    // A row past the ceiling is retained rather than deleted, so without this it would sit in the
    // list looking like a pending one indefinitely.
    assert.equal(deliveryState({ deliveredAt: null, attempts: 8, lastStatus: 500 }, 8).word, 'Abandoned')
    assert.equal(deliveryState({ deliveredAt: null, attempts: 99, lastStatus: null }, 8).word, 'Abandoned')
  })

  it('takes the ceiling as a parameter, because it is NOT on the wire', () => {
    // `DEVPLATFORM_WEBHOOK_MAX_ATTEMPTS` is configuration and no route returns it. A function that
    // assumed 8 would be asserting a deployed value it cannot read.
    const delivery = { deliveredAt: null, attempts: 4, lastStatus: 500 }
    assert.equal(deliveryState(delivery, 3).word, 'Abandoned')
    assert.equal(deliveryState(delivery, 20).word, 'Retrying')
  })
})

describe('the state of an application listing', () => {
  it('renders all five statuses the service can hold, and knows there are five', () => {
    // The count is asserted against the SERVICE'S OWN list rather than written here, so a sixth
    // status added upstream fails this rather than falling silently into the draft default.
    // `rejected` arrived with the operator route and is the one that had to be added by hand.
    assert.deepEqual([...APPLICATION_STATUSES], [
      'draft',
      'in_review',
      'listed',
      'rejected',
      'delisted',
    ])
    assert.equal(applicationState('draft').word, 'Draft')
    assert.equal(applicationState('in_review').word, 'In review')
    assert.equal(applicationState('listed').word, 'Listed')
    assert.equal(applicationState('rejected').word, 'Rejected')
    assert.equal(applicationState('delisted').word, 'Delisted')
  })

  it('gives every status a distinct word, so the badge is never ambiguous', () => {
    const words = APPLICATION_STATUSES.map((status) => applicationState(status).word)
    assert.equal(new Set(words).size, words.length, `two statuses share a badge: ${words.join(', ')}`)
  })

  it('falls back to draft for anything it does not recognise', () => {
    assert.equal(applicationState('something-new').word, 'Draft')
  })

  it('says on the in_review badge that a person decides it', () => {
    // It used to say nothing in the estate could approve it, which was true and was reported.
    // `PUT /v1/projects/:id/application/status` closed that; what is left is a wait for a human,
    // and the copy has to be the second thing rather than the first.
    const meaning = applicationState('in_review').meaning
    assert.match(meaning, /reviewer/i)
    assert.doesNotMatch(meaning, /nothing (in this estate )?can approve/i)
  })

  it('says on the rejected badge that it is not the end of the road', () => {
    // `submitForReview` accepts `rejected` as a source, so a declined listing can be edited and
    // sent back. Copy that read as final would stop somebody doing what the service allows.
    assert.match(applicationState('rejected').meaning, /again|not final/i)
    // And it is NOT worded as a takedown: `delisted` is the one that was public.
    assert.doesNotMatch(applicationState('rejected').meaning, /removed from the public directory/i)
  })
})

describe('quota tone', () => {
  it('is good well below the limit', () => {
    assert.equal(quotaTone(10, 100).tone, 'good')
  })

  it('warns from seventy per cent', () => {
    assert.equal(quotaTone(70, 100).tone, 'warn')
  })

  it('is critical from ninety', () => {
    assert.equal(quotaTone(90, 100).tone, 'crit')
    assert.equal(quotaTone(100, 100).tone, 'crit')
  })

  it('does not divide by zero', () => {
    assert.equal(quotaTone(0, 0).tone, 'good')
  })
})

describe('the small formatters', () => {
  it('renders a timestamp absolutely, never relatively', () => {
    // A relative label is a number the reader has to convert back before they can act on it, and
    // every timestamp on this surface is something somebody acts on.
    assert.equal(when('2026-08-01T12:00:00.000Z'), '2026-08-01 12:00:00Z')
  })

  it('says the missing sentence rather than a dash', () => {
    assert.equal(when(null), 'never')
    assert.equal(when(''), 'never')
    assert.equal(when('not a date'), 'never')
    assert.equal(when(null, 'does not expire'), 'does not expire')
  })

  it('separates thousands, because usage counts are unreadable without it', () => {
    assert.equal(count(1234567), '1,234,567')
  })

  it('FLOORS a percentage rather than rounding it', () => {
    // "100%" for a window with one request left is the difference between a developer
    // investigating and a developer waiting.
    assert.equal(percent(999, 1000), '99%')
    assert.equal(percent(1000, 1000), '100%')
    assert.equal(percent(1, 3), '33%')
    assert.equal(percent(1, 0), '—')
  })

  it('recognises the display string shape the schema constrains', () => {
    // `api_keys_display_shape` — `devplatform/src/migrations.ts`.
    assert.equal(isDisplayString('cfk_live_abcdefghijklmnop'), true)
    assert.equal(isDisplayString('cfk_test_abcdefghijklmnop'), true)
    assert.equal(isDisplayString('cfk_prod_abcdefghijklmnop'), false)
    assert.equal(isDisplayString('cfk_live_ABCDEFGHIJKLMNOP'), false)
    assert.equal(isDisplayString('cfk_live_short'), false)
  })
})
