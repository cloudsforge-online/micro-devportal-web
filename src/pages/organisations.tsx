/**
 * Enrolling an identity organisation, and one enrolled organisation's projects.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THIS SCREEN NO LONGER MUTATES IN ORDER TO READ.
 *
 * Until `micro-devplatform@e13c154` the service served no route that resolved an identity
 * organisation to its developer-platform enrolment: `GET /v1/organisations/:id` wants the
 * DEVELOPER id, which a console that has never enrolled has no way to learn, and
 * `findOrgByIdentityId` (`devplatform/src/orgs.ts`) was reachable only from the event inbox
 * (`devplatform/src/server.ts`). So this screen drew ONE control meaning both "enrol" and
 * "open", and answered "which organisation am I in?" by re-POSTing the idempotent enrolment. That
 * was harmless — `on conflict do nothing` really is idempotent — and it was still a write issued
 * to ask a question, which is one keystroke from a write issued by mistake.
 *
 * `GET /v1/organisations?identityOrgId=…` (`devplatform/src/server.ts`) is the read, and this
 * screen now uses it. Each card asks the question first and then draws ONE of two things:
 *
 *   ENROLLED      a link. No form, because there is nothing to fill in — `name` and `slug` are
 *                 ignored on a second enrolment, so a form here would be a rename control that
 *                 silently renames nothing.
 *   NOT ENROLLED  the form. It is the first enrolment, so the fields are the ones that count.
 *
 * That distinction is only drawable because an empty answer is a `200` with `[]` rather than a 404
 * (`devplatform/src/server.ts`): "you are a member of this company and it has no developer
 * platform presence yet" is an enrolment button, whereas a 404 would be a dead end.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * The list of identity organisations comes from `/auth/me` — `organisations`, with the caller's
 * role in each (`identity/src/organisations.ts`). The role is used to LABEL only.
 * `devplatform` re-asks identity for it on the request and refuses anything below admin
 * (`devplatform/src/server.ts`); a browser deciding it would be a browser deciding its own
 * authority.
 */
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Empty, Failed, Loading, Note } from '../components/states.tsx'
import { Identifier } from '../components/tone.tsx'
import { useMutation } from '../lib/mutation.ts'
import { useResource } from '../lib/resource.ts'
import { mayEnrol, useSession, type IdentityOrg } from '../lib/auth.tsx'
import { enrolOrganisation, resolveOrganisation } from '../lib/devplatform.ts'

/** Slug rules, copied from `devplatform/src/orgs.ts` so the field can refuse before the wire. */
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
          Membership is decided by your CloudsForge account, not by this console. What happens here
          is <em>enrolment</em> — telling the developer platform that one of those organisations
          intends to build, after which it can hold projects, credentials and quotas.
        </p>
      </header>

      {developer.organisations.length === 0 ? (
        <Empty
          title="You do not administer an organisation yet"
          hint="An organisation is set up in your CloudsForge account rather than on this page. Once you are its owner or an admin of it, it will turn up in this list and you can enrol it."
        />
      ) : (
        <ul className="dp-cards">
          {developer.organisations.map((org) => (
            <EnrolCard key={org.id} org={org} />
          ))}
        </ul>
      )}

      <Note>
        Where a card offers a link instead of a form, that organisation is already on the platform.
        The name and slug you choose apply to the first enrolment only. Enrolling twice hands back
        the record that exists, untouched, so a form on an enrolled card would look like a rename
        and change nothing.
      </Note>
    </section>
  )
}

/**
 * One identity organisation: ask whether it is enrolled, then draw the link or the form.
 *
 * ── ONE READ PER CARD, AND IT IS A READ ───────────────────────────────────────────────────────
 *
 * `resolveOrganisation` is `GET /v1/organisations?identityOrgId=…`. It answers `200` with an empty
 * list for an organisation this reader is a member of that has never been enrolled, so an empty
 * answer is a state to render rather than an error to report — which is why `count` below is 1
 * unconditionally: the resource is "the answer", and the answer being empty is `enrolled === null`,
 * not the `empty` state.
 *
 * A FAILURE here draws neither. Falling back to the form on an error would offer to create
 * something that may already exist, and the enrolment is idempotent so the mistake would be
 * survivable and silent — which is the shape of thing this repository keeps having to correct.
 */
function EnrolCard({ org }: { org: IdentityOrg }) {
  const existing = useResource(
    (signal) => resolveOrganisation(org.id, signal),
    () => 1,
    'We could not find out whether this organisation is already on the platform.',
    [org.id],
  )
  const enrolled = existing.data?.organisations[0] ?? null

  return (
    <li className="dp-card">
      <h2 className="dp-card__title">{org.name}</h2>
      <p className="dp-card__meta">
        You are <strong>{org.role}</strong> here · <Identifier value={org.id} />
      </p>

      {existing.state === 'loading' && <Loading label="Checking whether this one is enrolled" />}
      {(existing.state === 'failed' || existing.state === 'forbidden') && existing.error && (
        <Failed notice={existing.error} onRetry={existing.reload} />
      )}
      {existing.state !== 'loading' && existing.error === null && (
        enrolled ? (
          <p className="dp-para">
            On the platform as <Identifier value={enrolled.slug} /> ·{' '}
            <Link to={`/organisations/${encodeURIComponent(enrolled.id)}`}>
              Go to {enrolled.name}
            </Link>
          </p>
        ) : (
          <EnrolForm org={org} />
        )
      )}
    </li>
  )
}

/**
 * The first enrolment, and only the first.
 *
 * The control is offered even when the role is below admin, and it is DISABLED with the reason
 * shown. Hiding it would leave a member of an organisation unable to see why the console shows them
 * nothing; a refusal they can read is a refusal they can act on by asking an owner.
 */
function EnrolForm({ org }: { org: IdentityOrg }) {
  const navigate = useNavigate()
  const [name, setName] = useState(org.name)
  const [slug, setSlug] = useState(suggestSlug(org.slug || org.name))
  const enrol = useMutation(
    () => enrolOrganisation({ identityOrgId: org.id, name, slug }),
    'The platform turned the enrolment down. Nothing was created.',
  )
  const allowed = mayEnrol(org)
  const slugOk = SLUG.test(slug)

  return (
    <>
      {!allowed && (
        <Note tone="warn">
          Enrolment is reserved to an organisation’s owners and admins, and your role is neither.
          Ask one of them to visit this page. The platform re-reads your role when the request
          arrives, so nothing you do in this browser gets around it.
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
            className="cf-input"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            maxLength={200}
            required
          />
        </label>
        <label className="dp-field">
          <span className="dp-field__label">Slug</span>
          <input
            className="cf-input cf-num"
            value={slug}
            onChange={(event) => setSlug(event.currentTarget.value)}
            aria-describedby={`slug-help-${org.id}`}
            required
          />
          <span className="dp-field__help" id={`slug-help-${org.id}`}>
            Between 3 and 64 characters: lowercase letters, digits and hyphens, with a letter or
            digit at each end. Pick carefully — this is the one enrolment that sets it.
          </span>
        </label>
        <button
          type="submit"
          className="cf-btn cf-btn--primary"
          disabled={!allowed || enrol.busy || !slugOk}
        >
          {enrol.busy ? 'Enrolling…' : 'Enrol'}
        </button>
      </form>

      {enrol.error && (
        <Failed notice={enrol.error} title="The enrolment did not go through" />
      )}
    </>
  )
}

/** The link out of a card once an organisation is known. Kept small and used by the tests. */
export function OrganisationLink({ id, name }: { id: string; name: string }) {
  return <Link to={`/organisations/${encodeURIComponent(id)}`}>{name}</Link>
}
