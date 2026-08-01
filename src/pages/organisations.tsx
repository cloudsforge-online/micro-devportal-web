/**
 * Enrolling an identity organisation, and one enrolled organisation's projects.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * ENROLMENT IS ALSO THE ONLY LOOKUP, AND THAT IS THE FINDING THIS SCREEN IS BUILT AROUND.
 *
 * `devplatform` serves no `GET /v1/organisations` and no route that resolves an identity
 * organisation id to a developer one. `GET /v1/organisations/:id` wants the DEVELOPER id, which a
 * console that has never enrolled has no way to learn — `findOrgByIdentityId`
 * (`devplatform/src/orgs.ts:162`) exists and is called only by the event inbox
 * (`devplatform/src/server.ts:1227`).
 *
 * What makes that survivable rather than fatal is that `POST /v1/organisations` is idempotent on
 * `identity_org_id` by construction: `on conflict do nothing` followed by a read
 * (`devplatform/src/orgs.ts:126-141`). Posting it a second time RETURNS the existing row rather
 * than creating or failing. So this screen presents one control that means both "enrol" and "open",
 * and says which of the two happened afterwards rather than guessing beforehand.
 *
 * The consequence a developer must be told, because it is surprising: **`name` and `slug` are only
 * used on the first enrolment.** A second call with a different name returns the original row
 * unchanged, because `do nothing` did nothing. This is not a rename form.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * The list of identity organisations comes from `/auth/me` — `organisations`, with the caller's
 * role in each (`identity/src/organisations.ts:148-159`). The role is used to LABEL only.
 * `devplatform` re-asks identity for it on the request and refuses anything below admin
 * (`devplatform/src/server.ts:644-645`); a browser deciding it would be a browser deciding its own
 * authority.
 */
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Empty, Failed, Note } from '../components/states.tsx'
import { Identifier } from '../components/tone.tsx'
import { useMutation } from '../lib/mutation.ts'
import { mayEnrol, useSession, type IdentityOrg } from '../lib/auth.tsx'
import { enrolOrganisation } from '../lib/devplatform.ts'

/** Slug rules, copied from `devplatform/src/orgs.ts:53` so the field can refuse before the wire. */
const SLUG = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/

function suggestSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

export function OrganisationsPage() {
  const { developer } = useSession()

  return (
    <section className="dp-page">
      <header className="dp-page__head">
        <h1 className="dp-page__title">Your organisations</h1>
        <p className="dp-page__lead">
          A developer organisation is an <em>enrolment</em> of an organisation identity already
          holds. CloudsForge’s account service owns who is a member of what; this platform records
          that the organisation builds on it, and holds its projects, keys and quotas.
        </p>
      </header>

      {developer.organisations.length === 0 ? (
        <Empty
          title="This account administers no organisations"
          hint="Organisations are created in your CloudsForge account, not here. Once you own or administer one, it will appear on this page."
        />
      ) : (
        <ul className="dp-cards">
          {developer.organisations.map((org) => (
            <EnrolCard key={org.id} org={org} />
          ))}
        </ul>
      )}

      <Note>
        Enrolling the same organisation twice is not an error and does not create a second one — the
        service keys the enrolment on the organisation itself and returns the one that already
        exists. That also means the name and slug below are only used the first time.
      </Note>
    </section>
  )
}

/**
 * One identity organisation, and the control that enrols it or opens it.
 *
 * The control is offered even when the role is below admin, and it is DISABLED with the reason
 * shown. Hiding it would leave a member of an organisation unable to see why the console shows them
 * nothing; a refusal they can read is a refusal they can act on by asking an owner.
 */
function EnrolCard({ org }: { org: IdentityOrg }) {
  const navigate = useNavigate()
  const [name, setName] = useState(org.name)
  const [slug, setSlug] = useState(suggestSlug(org.slug || org.name))
  const enrol = useMutation(
    () => enrolOrganisation({ identityOrgId: org.id, name, slug }),
    'The organisation could not be enrolled.',
  )
  const allowed = mayEnrol(org)
  const slugOk = SLUG.test(slug)

  return (
    <li className="dp-card">
      <h2 className="dp-card__title">{org.name}</h2>
      <p className="dp-card__meta">
        Your role: <strong>{org.role}</strong> · <Identifier value={org.id} />
      </p>

      {!allowed && (
        <Note tone="warn">
          Only an owner or an admin of an organisation may enrol it. Ask one of them to open this
          page — the platform re-checks the role on the request, so it cannot be worked around here.
        </Note>
      )}

      <form
        className="dp-form"
        onSubmit={(event) => {
          event.preventDefault()
          void enrol.run().then((result) => {
            if (result) navigate(`/organisations/${encodeURIComponent(result.organisation.id)}`)
          })
        }}
      >
        <label className="dp-field">
          <span className="dp-field__label">Name</span>
          <input
            className="dp-input"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            maxLength={200}
            required
          />
        </label>
        <label className="dp-field">
          <span className="dp-field__label">Slug</span>
          <input
            className="dp-input cf-num"
            value={slug}
            onChange={(event) => setSlug(event.currentTarget.value)}
            aria-describedby={`slug-help-${org.id}`}
            required
          />
          <span className="dp-field__help" id={`slug-help-${org.id}`}>
            3 to 64 characters of lowercase letters, digits and hyphens, starting and ending with a
            letter or digit. Used only on the first enrolment.
          </span>
        </label>
        <button
          type="submit"
          className="cf-btn cf-btn--primary"
          disabled={!allowed || enrol.busy || !slugOk}
        >
          {enrol.busy ? 'Working…' : 'Enrol or open'}
        </button>
      </form>

      {enrol.error && <Failed notice={enrol.error} title="That was not enrolled" />}
    </li>
  )
}

/** The link out of a card once an organisation is known. Kept small and used by the tests. */
export function OrganisationLink({ id, name }: { id: string; name: string }) {
  return <Link to={`/organisations/${encodeURIComponent(id)}`}>{name}</Link>
}
