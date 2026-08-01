/**
 * Turning the service's values into the words a developer reads.
 *
 * Every function here is pure and every one is tested, because these are the sentences a developer
 * acts on. The two that matter most are `keyState` — which decides whether a credential is
 * presented as live — and `SHOWN_ONCE`, which is the one claim in this product that must never be
 * softened.
 */

/**
 * THE SENTENCE. It is the service's own, verbatim.
 *
 * `devplatform/src/server.ts:783` attaches exactly this string as `note` on the response that mints
 * a key. It is duplicated here so a screen can say it BEFORE the request is sent — a warning that
 * only appears after the secret does is a warning nobody read in time — and
 * `test/devplatform.test.ts` asserts the two strings are still identical, which is what stops this
 * copy drifting into a softer promise.
 */
export const SHOWN_ONCE =
  'This is the only time this secret is shown. It is stored under scrypt and cannot be recovered.'

/**
 * What a webhook signing secret is, which is NOT the same claim.
 *
 * `webhook_secrets` stores plaintext, and `devplatform/src/migrations.ts:44-51` says why in the
 * schema itself: "HMAC is not a one-way function of an input we do not have: signing a delivery
 * requires the secret itself." It is still shown once — no route returns it afterwards
 * (`devplatform/src/webhooks.ts:147`) — but saying it is hashed would be false, and this product
 * does not get to be vague about which of its secrets are recoverable.
 */
export const WEBHOOK_SECRET_NOTE =
  'This is the only time this secret is shown. Unlike an API key it is stored so that deliveries ' +
  'can be signed with it, but no route returns it, so nobody can read it back to you.'

/** A tone, a glyph and a word. Colour is never the only channel — see src/components/tone.tsx. */
export interface Tone {
  readonly tone: 'good' | 'warn' | 'crit' | 'idle'
  readonly glyph: string
  readonly word: string
  /** One sentence a reader can act on. Shown as the title, and beside the badge on detail screens. */
  readonly meaning: string
}

/**
 * The state of one API key.
 *
 * Four states, and the ORDER of the checks is the whole content of this function. A revoked key
 * that has also expired is REVOKED: revocation is the deliberate act and expiry is the calendar,
 * and telling somebody their key expired when in fact a colleague revoked it sends them to fix the
 * wrong thing.
 *
 * `expiresAt` is nullable and a null means "never" (`devplatform/src/apikeys.ts:150`), not "unknown".
 */
export function keyState(key: {
  revokedAt: string | null
  expiresAt: string | null
  lastUsedAt: string | null
}, now: Date = new Date()): Tone {
  if (key.revokedAt !== null) {
    return {
      tone: 'crit',
      glyph: '⊘',
      word: 'Revoked',
      meaning: 'Refused at authentication. The row is kept so the credential’s history survives.',
    }
  }
  if (key.expiresAt !== null && new Date(key.expiresAt).getTime() <= now.getTime()) {
    return {
      tone: 'crit',
      glyph: '⌛',
      word: 'Expired',
      meaning: 'Past its expiry. Refused at authentication; issue a new key rather than editing it.',
    }
  }
  if (key.lastUsedAt === null) {
    return {
      tone: 'idle',
      glyph: '○',
      word: 'Never used',
      meaning: 'Live, and no request has ever presented it.',
    }
  }
  return { tone: 'good', glyph: '●', word: 'Live', meaning: 'Accepted at authentication.' }
}

/**
 * The state of one webhook delivery.
 *
 * `abandoned` is the one worth being loud about. A delivery past its attempt ceiling is retained
 * rather than deleted "because the row is the only record that a customer was sent an event and
 * never took it" (`devplatform/src/server.ts:248-253`), so it will sit in this list for ever
 * looking like a pending one unless the screen distinguishes them. The ceiling is configurable
 * (`DEVPLATFORM_WEBHOOK_MAX_ATTEMPTS`, default 8 — `devplatform/src/env.ts:215`) and is NOT on the
 * wire, so this function takes it rather than assuming it.
 */
export function deliveryState(
  delivery: { deliveredAt: string | null; attempts: number; lastStatus: number | null },
  maxAttempts: number,
): Tone {
  if (delivery.deliveredAt !== null) {
    return {
      tone: 'good',
      glyph: '●',
      word: 'Delivered',
      meaning: 'Your endpoint answered 2xx.',
    }
  }
  if (delivery.attempts >= maxAttempts) {
    return {
      tone: 'crit',
      glyph: '■',
      word: 'Abandoned',
      meaning:
        'Past the attempt ceiling and no longer retried. The row is kept because it is the only ' +
        'record that this event was sent and never taken.',
    }
  }
  return {
    tone: 'warn',
    glyph: '◐',
    word: 'Retrying',
    meaning: `Attempt ${delivery.attempts} so far. It will be retried with an increasing backoff.`,
  }
}

/** `devplatform/src/applications.ts:23`. Four statuses, and the app must render all four. */
export function applicationState(status: string): Tone {
  switch (status) {
    case 'listed':
      return { tone: 'good', glyph: '●', word: 'Listed', meaning: 'Visible in the public directory.' }
    case 'in_review':
      return {
        tone: 'warn',
        glyph: '◐',
        word: 'In review',
        meaning: 'Submitted. Nothing in this estate can approve it yet — see the note on this page.',
      }
    case 'delisted':
      return {
        tone: 'crit',
        glyph: '⊘',
        word: 'Delisted',
        meaning: 'Removed from the public directory.',
      }
    default:
      return {
        tone: 'idle',
        glyph: '○',
        word: 'Draft',
        meaning: 'Saved and not submitted. Nobody outside this project can see it.',
      }
  }
}

/**
 * Whether a quota window is close to its limit.
 *
 * There is no "over" state, and that is not an omission: `quota_windows_within_limit` makes
 * exceeding a quota a constraint violation rather than a state a row can be in
 * (`devplatform/src/migrations.ts:29-35`), so `used > limit` cannot be read from the service. A
 * screen with a bar for it would be drawing something that cannot happen.
 */
export function quotaTone(used: number, limit: number): Tone {
  const share = limit > 0 ? used / limit : 0
  if (share >= 0.9) {
    return {
      tone: 'crit',
      glyph: '■',
      word: 'At the limit',
      meaning: 'The next requests in this window will be refused.',
    }
  }
  if (share >= 0.7) {
    return { tone: 'warn', glyph: '◐', word: 'Filling', meaning: 'Over seventy per cent used.' }
  }
  return { tone: 'good', glyph: '●', word: 'Within limit', meaning: 'Room left in this window.' }
}

/** An ISO timestamp as a readable absolute date. Never a relative one — see below. */
export function when(iso: string | null, missing = 'never'): string {
  if (iso === null || iso === '') return missing
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return missing
  // ABSOLUTE, not "3 days ago". A key's expiry and a delivery's next attempt are both decisions
  // somebody has to act on at a particular moment, and a relative label is a number the reader has
  // to convert back before they can do anything with it.
  return at.toISOString().replace('T', ' ').replace(/\.\d+Z$/, 'Z')
}

/** A whole number with thousands separators. Usage counts get large and unreadable without them. */
export function count(n: number): string {
  return new Intl.NumberFormat('en-GB').format(n)
}

/**
 * A percentage, for a usage bar's label.
 *
 * Floored rather than rounded: "100%" for a window with one request left is the difference between
 * a developer investigating and a developer waiting.
 */
export function percent(used: number, limit: number): string {
  if (limit <= 0) return '—'
  return `${Math.floor((used / limit) * 100)}%`
}

/**
 * The prefix of a `cfk_…` display string, which is the part that is safe everywhere.
 *
 * `display` is `cfk_<environment>_<lookup>` and carries no secret at all — the schema constrains
 * it to exactly that shape (`devplatform/src/migrations.ts:184`). It is what a revocation is quoted
 * by and what appears in a log, so it is rendered in full rather than masked. Masking it would
 * suggest there is something in it to hide, and would make the one string a developer needs to
 * quote at support the one string they cannot read.
 */
export function isDisplayString(value: string): boolean {
  return /^cfk_(live|test)_[a-z2-7]{16}$/.test(value)
}
