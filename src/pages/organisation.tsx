/**
 * One enrolled organisation: its status, its projects, and the form that creates another.
 *
 * Two reads (`GET /v1/organisations/:id` and `GET /v1/organisations/:id/projects`, both
 * `org:read`) and one write (`POST /v1/projects`, `org:write` — owner or admin only). All three
 * are registered in `devplatform/src/server.ts`.
 *
 * ── A 404 here is not "somebody else's organisation" ──────────────────────────────────────────
 *
 * `authoriseOrg` throws `NotFoundError` when the caller's role does not permit the read
 * (`devplatform/src/server.ts`), which is the same answer as an id that does not exist.
 * That is deliberate — a 403 would confirm the id is real and make developer organisation ids
 * enumerable — so this screen must never tell somebody the organisation belongs to another
 * customer. It says what it can honestly say: it is not there for you.
 *
 * ── A suspended organisation is a fact worth rendering loudly ─────────────────────────────────
 *
 * `status` is `active` or `suspended` (`devplatform/src/orgs.ts`). A suspension is set by the
 * inbox when identity reports the organisation deleted, and it revokes every key the organisation
 * holds (`devplatform/src/server.ts`). The rows survive so reinstatement is one state
 * change rather than a re-issue of every credential (`devplatform/src/orgs.ts`) — so a
 * suspended organisation shows its projects and its keys, and says why none of them works.
 */
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Empty, Failed, Loading, Note } from '../components/states.tsx'
import { Identifier } from '../components/tone.tsx'
import { useResource } from '../lib/resource.ts'
import { useIdempotentMutation } from '../lib/mutation.ts'
import { when } from '../lib/format.ts'
import { createProject, getOrganisation, listProjects } from '../lib/devplatform.ts'

export function OrganisationPage() {
  const { id = '' } = useParams()
  const organisation = useResource(
    (signal) => getOrganisation(id, signal),
    () => 1,
    'The organisation did not come back from the service.',
    [id],
  )
  const projects = useResource(
    (signal) => listProjects(id, signal),
    (data) => data.projects.length,
    'The project list did not come back.',
    [id],
  )

  return (
    <section className="dp-page">
      {organisation.state === 'loading' && <Loading label="Fetching the organisation" />}
      {(organisation.state === 'failed' || organisation.state === 'forbidden') &&
        organisation.error && (
          <Failed
            notice={organisation.error}
            onRetry={organisation.reload}
            title="This address holds no organisation you can open"
          />
        )}

      {organisation.state === 'ok' && organisation.data && (
        <>
          <header className="dp-page__head">
            <h1 className="dp-page__title">{organisation.data.organisation.name}</h1>
            <p className="dp-page__lead">
              <Identifier value={organisation.data.organisation.slug} /> · on the platform since{' '}
              {when(organisation.data.organisation.createdAt)}
            </p>
          </header>

          {organisation.data.organisation.status === 'suspended' && (
            <Note tone="crit">
              A suspension is in force here. Every credential this organisation owns has been
              withdrawn and is being turned away at authentication, so any integration running
              against it has stopped. What you see below is deliberately preserved: lifting a
              suspension is meant to be a single act, not a scramble to reissue every key.
            </Note>
          )}

          <h2 className="dp-h2">Projects</h2>
          <p className="dp-para">
            Projects are where credentials, webhook endpoints, OAuth clients and quotas actually
            live. Each one arrives with <strong>two environments</strong> —{' '}
            <code className="cf-num">live</code> and <code className="cf-num">test</code> — and its
            starting limits, all written in a single transaction. No project ever exists in a state
            where its first call goes uncounted.
          </p>

          {projects.state === 'loading' && <Loading label="Fetching the projects" />}
          {(projects.state === 'failed' || projects.state === 'forbidden') && projects.error && (
            <Failed notice={projects.error} onRetry={projects.reload} />
          )}
          {projects.state === 'empty' && (
            <Empty
              title="There is nowhere here to put a credential"
              hint="No project has been set up under this organisation. Use the form below to make the first — keys, webhooks and quotas all hang off a project, so nothing can be issued until one exists."
            />
          )}
          {projects.state === 'ok' && projects.data && (
            <ul className="dp-cards">
              {projects.data.projects.map((project) => (
                <li className="dp-card" key={project.id}>
                  <h3 className="dp-card__title">
                    <Link to={`/projects/${encodeURIComponent(project.id)}`}>{project.name}</Link>
                  </h3>
                  <p className="dp-card__meta">
                    <Identifier value={project.slug} /> · {project.status} ·{' '}
                    {project.environments.map((environment) => environment.name).join(' and ')}
                  </p>
                </li>
              ))}
            </ul>
          )}

          <NewProject orgId={organisation.data.organisation.id} onCreated={projects.reload} />
        </>
      )}
    </section>
  )
}

/**
 * The create-project form.
 *
 * **`POST /v1/projects` is one of the five routes that require an `Idempotency-Key`**
 * (`devplatform/src/server.ts`), so the key is minted when the developer commits to the action
 * and kept only while the outcome is unknown. That decision lives in `keepKeyAfter` and the hook
 * applies it — see src/lib/idempotency.ts. A taken slug is a 409 `conflict`, which is a DECISION:
 * the key is dropped, because the next attempt will carry a different slug and re-presenting the
 * old key would be a 409 `idempotency_key_reuse` about something else entirely.
 */
function NewProject({ orgId, onCreated }: { orgId: string; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')

  // `useIdempotentMutation` owns the key's whole lifecycle: minted on the first attempt, KEPT while
  // the outcome is unknown, dropped the moment it is known either way. Doing it in the page would
  // mean reading `create.error` in the closure that started the run — and that closure cannot see
  // the state the hook has just set, so it reads the PREVIOUS attempt's error and keeps a spent key.
  const create = useIdempotentMutation(
    (key: string) => createProject({ orgId, name, slug }, key),
    'The platform declined to create the project.',
  )

  return (
    <>
      <h2 className="dp-h2">Create a project</h2>
      <form
        className="dp-form"
        onSubmit={(event) => {
          event.preventDefault()
          void create.run().then((result) => {
            if (!result) return
            setName('')
            setSlug('')
            onCreated()
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
            required
          />
          <span className="dp-field__help">
            No two projects in this organisation may share one. Between 3 and 64 characters of
            lowercase letters, digits and hyphens.
          </span>
        </label>
        <button type="submit" className="cf-btn cf-btn--primary" disabled={create.busy}>
          {create.busy ? 'Creating…' : 'Create project'}
        </button>
      </form>
      {create.error && (
        <Failed notice={create.error} title="No project was created, and nothing changed" />
      )}
      {create.result?.replayed && (
        <Note tone="warn">
          We had already dealt with this exact request, so you are looking at the project it made
          the first time rather than a duplicate.
        </Note>
      )}
    </>
  )
}
