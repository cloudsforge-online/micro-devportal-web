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
    'That organisation could not be loaded.',
    [id],
  )
  const projects = useResource(
    (signal) => listProjects(id, signal),
    (data) => data.projects.length,
    'The projects could not be loaded.',
    [id],
  )

  return (
    <section className="dp-page">
      {organisation.state === 'loading' && <Loading label="Reading the organisation" />}
      {(organisation.state === 'failed' || organisation.state === 'forbidden') &&
        organisation.error && (
          <Failed
            notice={organisation.error}
            onRetry={organisation.reload}
            title="No developer organisation at this address"
          />
        )}

      {organisation.state === 'ok' && organisation.data && (
        <>
          <header className="dp-page__head">
            <h1 className="dp-page__title">{organisation.data.organisation.name}</h1>
            <p className="dp-page__lead">
              <Identifier value={organisation.data.organisation.slug} /> · enrolled{' '}
              {when(organisation.data.organisation.createdAt)}
            </p>
          </header>

          {organisation.data.organisation.status === 'suspended' && (
            <Note tone="crit">
              This organisation is suspended. Every API key it holds has been revoked and is refused
              at authentication. The rows below are kept so that reinstating the organisation is one
              change rather than a re-issue of every credential it ever handed out.
            </Note>
          )}

          <h2 className="dp-h2">Projects</h2>
          <p className="dp-para">
            A project owns keys, webhook endpoints, OAuth clients and quotas. Every project is
            created with <strong>two environments</strong>, <code className="cf-num">live</code> and{' '}
            <code className="cf-num">test</code>, and with its default quotas, in one transaction —
            so there is never a project whose first request is unmetered.
          </p>

          {projects.state === 'loading' && <Loading label="Reading the projects" />}
          {(projects.state === 'failed' || projects.state === 'forbidden') && projects.error && (
            <Failed notice={projects.error} onRetry={projects.reload} />
          )}
          {projects.state === 'empty' && (
            <Empty
              title="This organisation has no projects yet"
              hint="Create one below. Nothing can be issued until there is a project to issue it in."
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
    'The project could not be created.',
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
            Unique within this organisation. 3 to 64 characters of lowercase letters, digits and
            hyphens.
          </span>
        </label>
        <button type="submit" className="cf-btn cf-btn--primary" disabled={create.busy}>
          {create.busy ? 'Creating…' : 'Create project'}
        </button>
      </form>
      {create.error && <Failed notice={create.error} title="That project was not created" />}
      {create.result?.replayed && (
        <Note tone="warn">
          That request repeated one that had already completed, so the project was not created a
          second time.
        </Note>
      )}
    </>
  )
}
