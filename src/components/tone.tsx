/**
 * A state, rendered as a word, a glyph and a tone — in that order of importance.
 *
 * The word is never optional and the glyph is never the only non-colour channel. The estate's
 * reserved status hues sit ΔE 4.6 apart under protanopia, measured in micro-ui, which is why
 * status-web encodes every day three times. A badge that said "revoked" only by being red would say
 * nothing at all to a reader who cannot separate it from the green one — and on this surface that
 * badge is the difference between a credential somebody thinks is live and one that is not.
 */
import type { ReactNode } from 'react'
import type { Tone } from '../lib/format.ts'

export function StateBadge({ tone, title }: { tone: Tone; title?: string | undefined }) {
  return (
    <span className={`dp-badge dp-badge--${tone.tone}`} title={title ?? tone.meaning}>
      <span className="dp-badge__glyph" aria-hidden="true">
        {tone.glyph}
      </span>
      <span className="dp-badge__word">{tone.word}</span>
    </span>
  )
}

/** A label and its value, as a definition pair. The value may be a node — a badge, a link. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="dp-fact">
      <dt className="dp-fact__label">{label}</dt>
      <dd className="dp-fact__value">{children}</dd>
    </div>
  )
}

/**
 * A value that may be absent, where absence is a real answer rather than a rendering problem.
 *
 * `missing` is the SENTENCE, not a dash. A key with `expiresAt: null` does not expire
 * (`devplatform/src/apikeys.ts`), and rendering that as an empty cell would leave a reader
 * unsure whether the field failed to load or the key is permanent. Those want different actions.
 */
export function Maybe({ value, missing }: { value: string | null; missing: string }) {
  if (value === null || value.length === 0) {
    return <span className="dp-absent">{missing}</span>
  }
  return <span className="cf-num">{value}</span>
}

/**
 * A `cfk_…` display string, or a client id, rendered in full.
 *
 * **Deliberately not masked.** `display` is `cfk_<environment>_<lookup>` and the schema constrains
 * it to exactly that (`devplatform/src/migrations.ts`); there is no secret in it. It is what a
 * revocation is quoted by and what appears in every log line about the key
 * (`devplatform/src/apikeys.ts`). Masking it would suggest there is something in it to hide and
 * would make the one string a developer needs to quote at support the one string they cannot read.
 */
export function Identifier({ value }: { value: string }) {
  return <code className="cf-num dp-identifier">{value}</code>
}

/**
 * The scopes on a credential, or the fact that there are none.
 *
 * An EMPTY scope list is legal and produces a completely inert credential
 * (`devplatform/src/scopes.ts`), so it is rendered as the finding it is rather than as a blank
 * cell. There is no wildcard to render: `*` is refused at issuance
 * (`devplatform/src/scopes.ts`) and by the database (`devplatform/src/migrations.ts`).
 */
export function Scopes({ scopes }: { scopes: readonly string[] }) {
  if (scopes.length === 0) {
    return (
      <span className="dp-absent">
        none — this credential authenticates and is allowed to do nothing
      </span>
    )
  }
  return (
    <span className="dp-scopes">
      {scopes.map((scope) => (
        <code className="cf-num dp-scope" key={scope}>
          {scope}
        </code>
      ))}
    </span>
  )
}
