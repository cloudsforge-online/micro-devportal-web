/**
 * One project: the chrome its five sections sit inside, plus the overview.
 *
 * `ProjectShell` fetches the project once (`GET /v1/projects/:id`,
 * `devplatform/src/server.ts:838`) and renders the section navigation. Every child screen fetches
 * its own resource, because a project console that fetched everything on mount would make a reader
 * wait for the webhook deliveries to see their keys.
 *
 * A **404 is not "somebody else's project"**: `authoriseProject` answers `NotFoundError` for a
 * project the caller cannot see (`devplatform/src/server.ts:626-628`) precisely so project ids are
 * not enumerable across customers.
 */
import { useState } from 'react'
import { NavLink, Outlet, useParams } from 'react-router-dom'
import { Empty, Failed, Loading, Note } from '../components/states.tsx'
import { Fact, Identifier } from '../components/tone.tsx'
import { StateBadge } from '../components/tone.tsx'
import { useResource } from '../lib/resource.ts'
import { useMutation } from '../lib/mutation.ts'
import { applicationState, when } from '../lib/format.ts'
import { PROJECT_SECTIONS } from '../lib/routes.ts'
import {
  createServiceAccount,
  getApplication,
  getProject,
  listServiceAccounts,
  submitApplication,
  upsertApplication,
} from '../lib/devplatform.ts'

export function ProjectShell() {
  const { id = '' } = useParams()
  const project = useResource(
    (signal) => getProject(id, signal),
    () => 1,
    'That project could not be loaded.',
    [id],
  )

  return (
    <section className="dp-page">
      {project.state === 'loading' && <Loading label="Reading the project" />}
      {(project.state === 'failed' || project.state === 'forbidden') && project.error && (
        <Failed
          notice={project.error}
          onRetry={project.reload}
          title="No project at this address"
        />
      )}
      {project.state === 'ok' && project.data && (
        <>
          <header className="dp-page__head">
            <h1 className="dp-page__title">{project.data.project.name}</h1>
            <p className="dp-page__lead">
              <Identifier value={project.data.project.slug} /> · {project.data.project.status} ·
              created {when(project.data.project.createdAt)}
            </p>
          </header>
          <nav className="dp-sections" aria-label="Project sections">
            {PROJECT_SECTIONS.map((section) => (
              <NavLink
                key={section.segment}
                end={section.segment === ''}
                to={`/projects/${encodeURIComponent(id)}${section.segment ? `/${section.segment}` : ''}`}
                className={({ isActive }) => `dp-sections__link${isActive ? ' is-active' : ''}`}
              >
                {section.label}
              </NavLink>
            ))}
          </nav>
          <Outlet />
        </>
      )}
    </section>
  )
}

/**
 * The overview: environments, service accounts and the directory listing.
 *
 * ── Environments are ROWS, and that is why they are shown ─────────────────────────────────────
 *
 * `live` and `test` are rows in `environments`, not an enum, because keys, quotas, webhook
 * endpoints and usage all hang off an environment and "a foreign key to a row is the only version
 * of 'this key belongs to this environment' the database can enforce"
 * (`devplatform/src/orgs.ts:19-24`). Their ids appear on quota and usage rows, so a reader who
 * cannot map an id back to a name cannot read those screens.
 */
export function ProjectOverviewPage() {
  const { id = '' } = useParams()
  const project = useResource(
    (signal) => getProject(id, signal),
    () => 1,
    'That project could not be loaded.',
    [id],
  )
  const accounts = useResource(
    (signal) => listServiceAccounts(id, signal),
    (data) => data.serviceAccounts.length,
    'The service accounts could not be loaded.',
    [id],
  )

  return (
    <>
      <h2 className="dp-h2">Environments</h2>
      {project.state === 'ok' && project.data && (
        <dl className="dp-facts">
          {project.data.project.environments.map((environment) => (
            <Fact key={environment.id} label={environment.name}>
              <Identifier value={environment.id} />
            </Fact>
          ))}
        </dl>
      )}
      <Note>
        A <code className="cf-num">test</code> key and a <code className="cf-num">live</code> key are
        different credentials with different quotas and different webhook endpoints. Nothing crosses
        between them.
      </Note>

      <h2 className="dp-h2">Service accounts</h2>
      <p className="dp-para">
        A machine identity inside this project. A key may be attached to one, which is how a fleet
        of keys is grouped and rotated together. A service account is not itself a credential and
        cannot authenticate.
      </p>
      {accounts.state === 'loading' && <Loading label="Reading the service accounts" />}
      {(accounts.state === 'failed' || accounts.state === 'forbidden') && accounts.error && (
        <Failed notice={accounts.error} onRetry={accounts.reload} />
      )}
      {accounts.state === 'empty' && (
        <Empty
          title="No service accounts"
          hint="Keys can be issued without one. Add one when several keys belong to the same running thing."
        />
      )}
      {accounts.state === 'ok' && accounts.data && (
        <div className="dp-tablewrap">
          <table className="dp-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Description</th>
                <th scope="col">Id</th>
                <th scope="col">Created</th>
              </tr>
            </thead>
            <tbody>
              {accounts.data.serviceAccounts.map((account) => (
                <tr key={account.id}>
                  <td>{account.name}</td>
                  <td>{account.description || '—'}</td>
                  <td>
                    <Identifier value={account.id} />
                  </td>
                  <td>{when(account.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <NewServiceAccount projectId={id} onCreated={accounts.reload} />

      <ApplicationSection projectId={id} />
    </>
  )
}

/**
 * Create a service account.
 *
 * **No `Idempotency-Key`**, and that is read off the service rather than chosen:
 * `POST /v1/projects/:id/service-accounts` is not wrapped, because `service_accounts_name_uniq`
 * makes `(project, name)` the natural key and `createServiceAccount` is `on conflict do nothing`
 * then read — so a retry returns the first account rather than creating a second
 * (`devplatform/src/server.ts:845-849`). Sending a header the route does not read would make this
 * client look like it were protecting something it is not.
 */
function NewServiceAccount({
  projectId,
  onCreated,
}: {
  projectId: string
  onCreated: () => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const create = useMutation(
    () => createServiceAccount(projectId, { name, description }),
    'The service account could not be created.',
  )

  return (
    <>
      <form
        className="dp-form"
        onSubmit={(event) => {
          event.preventDefault()
          void create.run().then((result) => {
            if (!result) return
            setName('')
            setDescription('')
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
            required
            maxLength={200}
          />
        </label>
        <label className="dp-field">
          <span className="dp-field__label">Description</span>
          <input
            className="cf-input"
            value={description}
            onChange={(event) => setDescription(event.currentTarget.value)}
          />
        </label>
        <button type="submit" className="cf-btn" disabled={create.busy}>
          {create.busy ? 'Adding…' : 'Add service account'}
        </button>
      </form>
      {create.error && <Failed notice={create.error} title="That was not created" />}
    </>
  )
}

/**
 * The project's directory listing.
 *
 * Three routes: `GET /v1/projects/:id/application` (`devplatform/src/server.ts:1312`),
 * `PUT …/application` (`:1298`) and `POST …/application/submit` (`:1320`). None takes an
 * `Idempotency-Key`: the PUT is an upsert on `project_id` and the submit is a state transition
 * claimed with `where status in (…)`, so the second attempt matches no row.
 *
 * **A 404 from the GET is the normal answer for a project that has never written one** (`:1315`),
 * so it is rendered as an invitation. It is the one place in this client where a 404 is the
 * expected outcome of a correct request.
 *
 * **Editing a listed application does not un-list it and does not re-open review**
 * (`devplatform/src/applications.ts:160-165`). Said on the screen, because a developer who believes
 * a typo fix will pull their listing will not fix the typo.
 *
 * ── THE REVIEWER'S SIDE EXISTS NOW, AND THIS SCREEN IS NOT IT ─────────────────────────────────
 *
 * Until `micro-devplatform@e13c154` `setApplicationStatus` was imported by the server and called
 * by no route, so a submission sat in `in_review` for ever and this screen said so.
 * `PUT /v1/projects/:id/application/status` (`devplatform/src/server.ts:1344`) closes it — and is
 * DECLINED in src/lib/devplatform.ts, because it is an operator's and this is the submitting
 * party's console. The right change here was to delete a warning, not to draw a button.
 *
 * `rejected` is the new status a developer will actually meet, and it is not `delisted`: a
 * reviewer declined a listing that was never public. `submitForReview` accepts it as a source
 * (`devplatform/src/applications.ts:80-87`), so the submit control is offered from `rejected` as
 * well as from `draft`.
 */
function ApplicationSection({ projectId }: { projectId: string }) {
  const listing = useResource(
    (signal) => getApplication(projectId, signal),
    () => 1,
    'The listing could not be loaded.',
    [projectId],
  )
  const [draft, setDraft] = useState({ slug: '', name: '', tagline: '', description: '', homepageUrl: '' })

  const save = useMutation(
    () =>
      upsertApplication(projectId, {
        slug: draft.slug,
        name: draft.name,
        tagline: draft.tagline,
        description: draft.description,
        homepageUrl: draft.homepageUrl.trim() === '' ? null : draft.homepageUrl.trim(),
      }),
    'The listing could not be saved.',
  )
  const submit = useMutation(
    () => submitApplication(projectId),
    'The listing could not be submitted for review.',
  )

  const current = listing.data?.application ?? save.result?.application ?? submit.result?.application

  return (
    <>
      <h2 className="dp-h2">Directory listing</h2>
      {listing.state === 'loading' && <Loading label="Reading the listing" />}

      {current ? (
        <>
          <dl className="dp-facts">
            <Fact label="Status">
              <StateBadge tone={applicationState(current.status)} />
            </Fact>
            <Fact label="Slug">
              <Identifier value={current.slug} />
            </Fact>
            <Fact label="Listed">{when(current.listedAt, 'not listed')}</Fact>
          </dl>
          {(current.status === 'draft' || current.status === 'rejected') && (
            <button
              type="button"
              className="cf-btn cf-btn--primary"
              disabled={submit.busy}
              onClick={() => void submit.run().then(() => listing.reload())}
            >
              {submit.busy
                ? 'Submitting…'
                : current.status === 'rejected'
                  ? 'Submit again'
                  : 'Submit for review'}
            </button>
          )}
          {current.status === 'in_review' && (
            <Note>
              Submitted, and waiting for a CloudsForge reviewer. You cannot approve your own listing
              and neither can this console — a directory a developer could publish into unilaterally
              would not be a reviewed one.
            </Note>
          )}
          {current.status === 'rejected' && (
            <Note tone="warn">
              A reviewer declined this listing. It was never public, and this is not final: change
              the copy above and submit it again.
            </Note>
          )}
          {current.status === 'listed' && (
            <Note>
              Editing this copy will not remove it from the directory and will not send it back for
              review. The status transition is the reviewed event; the words are not.
            </Note>
          )}
        </>
      ) : (
        listing.state !== 'loading' && (
          <Empty
            title="This project has no listing"
            hint="A listing is optional. Write one only if you want this integration to appear in the public directory."
          />
        )
      )}

      <form
        className="dp-form"
        onSubmit={(event) => {
          event.preventDefault()
          void save.run().then((result) => {
            if (result) listing.reload()
          })
        }}
      >
        <label className="dp-field">
          <span className="dp-field__label">Slug</span>
          <input
            className="cf-input cf-num"
            value={draft.slug}
            onChange={(event) => setDraft({ ...draft, slug: event.currentTarget.value })}
            required
          />
        </label>
        <label className="dp-field">
          <span className="dp-field__label">Name</span>
          <input
            className="cf-input"
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.currentTarget.value })}
            required
          />
        </label>
        <label className="dp-field">
          <span className="dp-field__label">Tagline</span>
          <input
            className="cf-input"
            value={draft.tagline}
            maxLength={300}
            onChange={(event) => setDraft({ ...draft, tagline: event.currentTarget.value })}
          />
        </label>
        <label className="dp-field">
          <span className="dp-field__label">Description</span>
          <textarea
            className="cf-input dp-area"
            value={draft.description}
            maxLength={10_000}
            onChange={(event) => setDraft({ ...draft, description: event.currentTarget.value })}
          />
        </label>
        <label className="dp-field">
          <span className="dp-field__label">Homepage</span>
          <input
            className="cf-input"
            value={draft.homepageUrl}
            onChange={(event) => setDraft({ ...draft, homepageUrl: event.currentTarget.value })}
          />
          <span className="dp-field__help">
            Absolute https, with no wildcard. Leave it empty for none.
          </span>
        </label>
        <button type="submit" className="cf-btn" disabled={save.busy}>
          {save.busy ? 'Saving…' : 'Save listing'}
        </button>
      </form>
      {save.error && <Failed notice={save.error} title="That listing was not saved" />}
      {submit.error && <Failed notice={submit.error} title="That was not submitted" />}
    </>
  )
}
