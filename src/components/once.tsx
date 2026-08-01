/**
 * THE COMPONENT THAT SHOWS A SECRET, ONCE.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * WHAT IS IRREVERSIBLE HERE, AND WHY THIS IS NOT A TOAST
 *
 * Four routes on `devplatform` return a credential and none of them returns it twice:
 *
 *   `POST /v1/projects/:id/keys`                   → `secretKey`  (`devplatform/src/server.ts:924`)
 *   `POST /v1/projects/:id/webhook-endpoints`      → `secret`     (`devplatform/src/server.ts:1111`)
 *   `POST /v1/webhook-endpoints/:id/rotate-secret` → `secret`     (`devplatform/src/server.ts:1141`)
 *   `POST /v1/projects/:id/oauth-clients`          → `clientSecret` (`devplatform/src/server.ts:1241`)
 *
 * For an API key and an OAuth client secret, "cannot be shown again" is not a policy that could be
 * relaxed by an operator with database access: **there is no column the secret could be read back
 * from.** `api_keys` stores `secret_algo`, `secret_salt` and `secret_hash` and nothing else, and
 * the CHECK constraint `api_keys_slow_kdf_only` refuses any row whose recorded algorithm is not a
 * scrypt encoding (`devplatform/src/migrations.ts:204`); `oauth_clients` carries the same
 * constraint (`devplatform/src/migrations.ts:244`). The schema's own comment names what it is for:
 * "the day someone reaches for createHash because it is one line shorter, this is what stops it"
 * (`devplatform/src/migrations.ts:201-203`).
 *
 * So the fact this component has to convey is not "please copy this" — it is "if this window
 * closes without you copying it, the credential exists, it is live, and nobody on Earth can tell
 * you what it is." That is a different sentence and it needs a different presentation.
 *
 * ── The three things this does that a notification cannot ─────────────────────────────────────
 *
 * 1. **It is modal, and it does not close by accident.** `role="dialog" aria-modal="true"`, focus
 *    moved into it on mount, a full-viewport scrim that swallows every pointer event, and a Tab
 *    trap that cycles within the dialog so the navigation behind it cannot be reached by keyboard
 *    either. Escape deliberately does NOT dismiss it, and neither does a click on the scrim: the
 *    two gestures a user makes without reading are the two that would destroy the value. A secret
 *    shown in a corner while the page underneath stays clickable is a secret one stray click
 *    destroys.
 *
 * 2. **It warns before a hard navigation too.** A `beforeunload` listener is attached while the
 *    secret is unacknowledged and removed the moment it is not. That covers the reload, the back
 *    button and the closed tab — the three ways out of a single-page app that no in-app guard can
 *    see. The browser's own prompt is deliberately the mechanism: it is the one dialog a user
 *    cannot style away or miss.
 *
 * 3. **Acknowledgement is a claim about the reader, not a click on "OK".** The only control that
 *    dismisses it says what has happened rather than agreeing to it, and it is disabled until the
 *    reader has either copied the value or ticked the box that says they have written it down.
 *
 * ── What it must never do, and what `test/render.test.ts` enforces ────────────────────────────
 *
 *   * It must never say "you can find this later", "in your dashboard", "we have emailed it",
 *     "contact support", or anything else that implies recovery. Support cannot recover it either.
 *   * It must not persist the secret. It is a prop, held in the caller's state, and cleared on
 *     acknowledgement. Nothing here touches `localStorage`, and `test/render.test.ts` refuses the
 *     identifier in this directory at all.
 *   * It must not be rendered for a REPLAY. `secretKey` is null when the idempotency wrapper
 *     returned a stored response (`devplatform/src/server.ts:917-924`), and a modal saying "copy
 *     this now" over an empty box would be this app inventing a failure. `<Replayed>` below is the
 *     screen for that case, and it says what actually happened.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

export interface ShownOnceProps {
  /** What kind of thing this is, in the reader's words. "API key", "signing secret". */
  readonly kind: string
  /** The credential. Held by the caller, cleared by the caller when `onAcknowledge` fires. */
  readonly secret: string
  /**
   * The sentence about recoverability, which differs between an API key and a webhook secret and
   * must not be written inline at a call site. See `SHOWN_ONCE` and `WEBHOOK_SECRET_NOTE`.
   */
  readonly note: string
  /** The non-secret identifier this credential will be known by afterwards, if it has one. */
  readonly label?: string | undefined
  /** Extra context — the overlap window on a rotation, the client id on an OAuth registration. */
  readonly children?: ReactNode
  readonly onAcknowledge: () => void
}

export function ShownOnce({ kind, secret, note, label, children, onAcknowledge }: ShownOnceProps) {
  const [copied, setCopied] = useState(false)
  const [writtenDown, setWrittenDown] = useState(false)
  const dialog = useRef<HTMLDivElement | null>(null)
  const titleId = useId()
  const noteId = useId()

  // Focus the dialog rather than the dismiss button: a screen reader lands on the heading and the
  // warning, in that order, instead of on a control it might activate before hearing why.
  useEffect(() => {
    dialog.current?.focus()
  }, [])

  // ────────────────────────────────────────────────────────────────────────────────────────────
  // THE HARD-NAVIGATION GUARD.
  //
  // Attached while the secret is on screen and removed when this unmounts. It is the only thing
  // standing between a reload and a live credential with no owner — the same artefact the
  // service's idempotency wrapper exists to prevent, arrived at from the other end.
  //
  // `preventDefault()` plus `returnValue` because browsers disagree about which one arms the
  // prompt, and the modern ones ignore the string entirely.
  // ────────────────────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])

  // ────────────────────────────────────────────────────────────────────────────────────────────
  // THE TAB TRAP.
  //
  // The scrim stops the pointer; this stops the keyboard. Without it, Tab walks straight out of the
  // dialog into the navigation behind, and the next Return is a route change that takes the secret
  // with it — the modal's whole promise defeated without a single click.
  //
  // Escape is swallowed on purpose. Every other dialog in this estate closes on Escape, and that is
  // correct for every other dialog: none of them is displaying something that cannot be recovered.
  // ────────────────────────────────────────────────────────────────────────────────────────────
  const onKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      return
    }
    if (event.key !== 'Tab') return
    const focusable = dialog.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input, [href], [tabindex]:not([tabindex="-1"])',
    )
    if (!focusable || focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (!first || !last) return
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }, [])

  const copy = useCallback(() => {
    // `navigator.clipboard` is undefined on an insecure origin and rejects when the document is
    // not focused. Neither is worth a failure state: the value is on screen and selectable, and a
    // red error over a working manual copy would be this app reporting its own convenience layer
    // as a problem with the credential.
    void navigator.clipboard
      ?.writeText(secret)
      .then(() => setCopied(true))
      .catch(() => setCopied(false))
  }, [secret])

  const dismissable = copied || writtenDown

  return (
    <div className="dp-once__scrim">
      <div
        className="dp-once"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={noteId}
        tabIndex={-1}
        ref={dialog}
        onKeyDown={onKeyDown}
      >
        <p className="dp-once__flag" aria-hidden="true">
          ⌗
        </p>
        <h2 className="dp-once__title" id={titleId}>
          Your {kind} — shown once
        </h2>
        <p className="dp-once__note" id={noteId} role="alert">
          {note}
        </p>

        {label && (
          <p className="dp-once__label">
            It will be listed as <code className="cf-num">{label}</code>. That identifier is safe to
            put in a log or a support message; the value below is not.
          </p>
        )}

        <div className="dp-once__value">
          {/* readOnly rather than disabled: a disabled field cannot be selected, and manual
              selection is the fallback when the clipboard API is unavailable. */}
          <input
            className="dp-once__secret cf-num"
            value={secret}
            readOnly
            spellCheck={false}
            aria-label={`The ${kind}. Copy it now.`}
            onFocus={(event) => event.currentTarget.select()}
          />
          <button type="button" className="cf-btn" onClick={copy}>
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>

        {children}

        <label className="dp-once__confirm">
          <input
            type="checkbox"
            checked={writtenDown}
            onChange={(event) => setWrittenDown(event.currentTarget.checked)}
          />
          I have stored it somewhere I can reach it again.
        </label>

        <div className="dp-once__actions">
          <button
            type="button"
            className="cf-btn cf-btn--primary"
            disabled={!dismissable}
            onClick={onAcknowledge}
          >
            Done — it will not be shown again
          </button>
          {!dismissable && (
            <p className="dp-once__hint">
              Copy it, or tick the box, before closing this. Nothing here or anywhere else can print
              it a second time.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * What a REPLAY looks like, which is not a failure.
 *
 * When an `Idempotency-Key` is presented a second time for the same request, `devplatform` returns
 * the stored response with `replayed: true` — and the stored response deliberately carries the
 * metadata only, so the credential field is `null` (`devplatform/src/server.ts:875-878`). The
 * artefact exists and is live; it was shown when it was created and it cannot be shown now.
 *
 * A client that rendered that as an error would tell a developer their key had failed to be
 * created when it had not, and the developer's next action would be to create a second one.
 */
export function Replayed({ kind, label }: { kind: string; label?: string | undefined }) {
  return (
    <div className="dp-note dp-note--warn" role="status">
      <span className="dp-note__icon" aria-hidden="true">
        ◐
      </span>
      <span>
        This request repeated one that had already completed, so the {kind} was not created a second
        time{label ? <> — it already exists as <code className="cf-num">{label}</code></> : null}.
        Its secret was shown when it was first created and cannot be shown again. If you no longer
        have it, revoke this one and issue another.
      </span>
    </div>
  )
}
