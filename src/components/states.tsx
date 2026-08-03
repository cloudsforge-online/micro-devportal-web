/**
 * The four states a screen can be in, as four visibly different things.
 *
 * They are separated because collapsing any two of them destroys information the reader needs:
 *
 *   LOADING   — we do not know yet. Waiting is the correct action.
 *   EMPTY     — the query answered, with nothing. Nothing is wrong; there is something to DO.
 *   FAILED    — the query did not answer. Retrying may work. The request id is what support needs.
 *   FORBIDDEN — the query was understood and refused. Retrying will never work, and the honest
 *               response is to say who to ask, not to offer a button that cannot succeed.
 *
 * A spinner that never resolves, an empty list that was actually a timeout, and a "no results" that
 * was actually a missing scope are the three failures this file exists to prevent. On this surface
 * the second is the dangerous one: an empty key list rendered for a failed request looks exactly
 * like a project whose credentials have all been revoked.
 */
import type { ReactNode } from 'react'
import type { ErrorNotice } from '../lib/api.ts'

// Every optional prop is spelled `?: T | undefined`. Under `exactOptionalPropertyTypes` those are
// two different types, and only the second one accepts the `value ?? undefined` a caller writes
// when it may or may not have something to pass.
export function Loading({ label = 'Loading' }: { label?: string | undefined }) {
  return (
    <div className="dp-state dp-state--loading" role="status" aria-live="polite">
      <span className="dp-spinner" aria-hidden="true" />
      <p className="dp-state__title">{label}</p>
    </div>
  )
}

export function Empty({
  title,
  hint,
  action,
}: {
  /** Say what was asked and found nothing. "No data" describes the screen, not the answer. */
  title: string
  hint?: string | undefined
  action?: ReactNode | undefined
}) {
  return (
    <div className="dp-state dp-state--empty" role="status">
      <span className="dp-state__icon" aria-hidden="true">
        ◇
      </span>
      <p className="dp-state__title">{title}</p>
      {hint && <p className="dp-state__hint">{hint}</p>}
      {action && <div className="dp-state__action">{action}</div>}
    </div>
  )
}

/**
 * A failure, with the request id on screen.
 *
 * The id is what the reader quotes and what finds their exact request across every service at once.
 * It is rendered in the monospace token and made selectable on its own line, because it is going to
 * be read aloud down a phone line or pasted into a support form, and a `cf-1a2b…` embedded
 * mid-sentence is neither.
 */
export function Failed({
  notice,
  onRetry,
  title = 'That did not load',
}: {
  notice: ErrorNotice
  onRetry?: (() => void) | undefined
  title?: string | undefined
}) {
  return (
    <div className="dp-state dp-state--failed" role="alert">
      <span className="dp-state__icon" aria-hidden="true">
        ■
      </span>
      <p className="dp-state__title">{title}</p>
      <p className="dp-state__hint">{notice.message}</p>
      {notice.requestId && (
        <p className="dp-state__meta">
          Quote this to support: <code className="cf-num dp-reqid">{notice.requestId}</code>
        </p>
      )}
      {onRetry && (
        <div className="dp-state__action">
          <button type="button" className="cf-btn" onClick={onRetry}>
            Try again
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Refused, not broken.
 *
 * No retry button: the request was understood and denied, and a button that cannot succeed is a
 * button that teaches the reader the app is unreliable.
 *
 * **On this surface a 403 is rarer than a 404, and that is worth knowing before diagnosing one.**
 * `devplatform` answers 404 rather than 403 for an organisation or a project the caller may not see
 * (`devplatform/src/server.ts:629`, `:655`), precisely so ids are not enumerable. So a 403 here is
 * almost always a KEY presenting itself without the scope it needs
 * (`devplatform/src/server.ts:635`), or a user token on a route that wants an API key (`:575`) — a
 * misconfiguration rather than a membership problem, which is why the copy says what it says.
 */
export function Forbidden({
  notice,
  title = 'That was refused',
}: {
  notice?: ErrorNotice | undefined
  title?: string | undefined
}) {
  return (
    <div className="dp-state dp-state--forbidden" role="alert">
      <span className="dp-state__icon" aria-hidden="true">
        ⊘
      </span>
      <p className="dp-state__title">{title}</p>
      <p className="dp-state__hint">
        {notice?.message ?? 'The credential you presented does not carry the authority this needs.'}{' '}
        Check the scopes on the key you are using, and that you are an owner or an admin of this
        organisation.
      </p>
      {notice?.requestId && (
        <p className="dp-state__meta">
          Reference: <code className="cf-num dp-reqid">{notice.requestId}</code>
        </p>
      )}
    </div>
  )
}

/** A short note in the flow of a page. `tone` picks the accent stripe and the glyph's meaning. */
export function Note({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warn' | 'crit' | undefined
  children: ReactNode
}) {
  const glyph = tone === 'crit' ? '■' : tone === 'warn' ? '▲' : '◇'
  return (
    <p className={`dp-note dp-note--${tone}`} role={tone === 'info' ? 'note' : 'status'}>
      <span className="dp-note__icon" aria-hidden="true">
        {glyph}
      </span>
      <span>{children}</span>
    </p>
  )
}
