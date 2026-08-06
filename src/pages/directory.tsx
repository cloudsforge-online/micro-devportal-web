/**
 * The public application directory, and one listing.
 *
 * Both routes behind this screen are PUBLIC and read no credential: `GET /v1/apps`
 * (`devplatform/src/server.ts`) and `GET /v1/apps/:slug` (`devplatform/src/server.ts`).
 * They are outside the session gate for that reason — the directory is the one part of this product
 * aimed at somebody who is not a developer.
 *
 * **Only `listed` applications can appear**, and the filter is inside the service's own query
 * rather than applied by a caller (`devplatform/src/applications.ts`): "a filter the caller
 * has to remember is a filter that will one day be forgotten, and the consequence here is a draft
 * listing … served to the public."
 *
 * So an EMPTY directory is a true 200 and not a loading state, and the empty copy says which of
 * the two it is. It used to say something stronger — that nothing in the estate could move a
 * listing from `in_review` to `listed`, so the directory could never fill. That was true and was
 * reported; `PUT /v1/projects/:id/application/status`
 * (`devplatform/src/server.ts`) closed it, so the sentence is gone rather than softened.
 */
import { Link, useParams } from 'react-router-dom'
import { Empty, Failed, Loading, Note } from '../components/states.tsx'
import { StateBadge } from '../components/tone.tsx'
import { useResource } from '../lib/resource.ts'
import { applicationState, when } from '../lib/format.ts'
import { getApplicationBySlug, listDirectory } from '../lib/devplatform.ts'

export function DirectoryPage() {
  const directory = useResource(
    (signal) => listDirectory({ signal }),
    (data) => data.applications.length,
    'The directory could not be loaded.',
  )

  return (
    <section className="dp-page">
      <header className="dp-page__head">
        <h1 className="dp-page__title">Application directory</h1>
        <p className="dp-page__lead">
          Integrations built on CloudsForge that have been reviewed and listed. Everything here is
          public: no credential is presented to read this page.
        </p>
      </header>

      {directory.state === 'loading' && <Loading label="Reading the directory" />}
      {(directory.state === 'failed' || directory.state === 'forbidden') && directory.error && (
        <Failed notice={directory.error} onRetry={directory.reload} />
      )}
      {directory.state === 'empty' && (
        <Empty
          title="Nothing is listed yet"
          hint="The service answered with an empty directory — this page has finished loading, and there is nothing to show. Only applications a CloudsForge reviewer has approved appear here."
        />
      )}
      {directory.state === 'ok' && directory.data && (
        <ul className="dp-cards">
          {directory.data.applications.map((application) => (
            <li className="dp-card" key={application.id}>
              <h2 className="dp-card__title">
                <Link to={`/apps/${encodeURIComponent(application.slug)}`}>{application.name}</Link>
              </h2>
              <p className="dp-card__tagline">{application.tagline || 'No tagline.'}</p>
              <p className="dp-card__meta">
                Listed {when(application.listedAt, 'at an unrecorded time')}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * One listing.
 *
 * A **404 here means "there is no LISTED application at that slug"** and never "you may not see
 * it": the status filter is in `findListedApplication`'s own query
 * (`devplatform/src/applications.ts`), so a draft belonging to the reader's own project
 * answers the same 404 as a slug that was never used. Rendering it as a permission problem would
 * send somebody to ask for access they already have.
 */
export function ApplicationPage() {
  const { slug = '' } = useParams()
  const listing = useResource(
    (signal) => getApplicationBySlug(slug, signal),
    () => 1,
    'That application could not be loaded.',
    [slug],
  )

  return (
    <section className="dp-page">
      {listing.state === 'loading' && <Loading label="Reading the listing" />}
      {(listing.state === 'failed' || listing.state === 'forbidden') && listing.error && (
        <Failed
          notice={listing.error}
          onRetry={listing.reload}
          title="There is no listed application at this address"
        />
      )}
      {listing.state === 'ok' && listing.data && (
        <>
          <header className="dp-page__head">
            <h1 className="dp-page__title">{listing.data.application.name}</h1>
            <p className="dp-page__lead">{listing.data.application.tagline}</p>
            <StateBadge tone={applicationState(listing.data.application.status)} />
          </header>
          <p className="dp-para dp-para--prewrap">{listing.data.application.description}</p>
          {listing.data.application.homepageUrl && (
            <p className="dp-para">
              <a
                className="cf-btn"
                href={listing.data.application.homepageUrl}
                rel="noreferrer noopener external"
              >
                Visit {new URL(listing.data.application.homepageUrl).hostname}
              </a>
            </p>
          )}
          <Note>
            This listing was written by its developer. CloudsForge reviews it before it appears here
            and does not operate it.
          </Note>
          <p className="dp-para">
            <Link to="/apps">Back to the directory</Link>
          </p>
        </>
      )}
    </section>
  )
}
