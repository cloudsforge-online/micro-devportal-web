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
    'The directory did not come back from the service.',
  )

  return (
    <section className="dp-page">
      <header className="dp-page__head">
        <h1 className="dp-page__title">Application directory</h1>
        <p className="dp-page__lead">
          Software other people have built against CloudsForge, each one checked by a reviewer
          before it reached this page. Nothing on this screen is behind a login — your browser sends
          no credential to fetch it.
        </p>
      </header>

      {directory.state === 'loading' && <Loading label="Fetching the listings" />}
      {(directory.state === 'failed' || directory.state === 'forbidden') && directory.error && (
        <Failed notice={directory.error} onRetry={directory.reload} />
      )}
      {directory.state === 'empty' && (
        <Empty
          title="The directory holds nothing at the moment"
          hint="This page has stopped loading — the service replied and the list was empty. A listing only reaches here once a CloudsForge reviewer has approved it, so drafts and submissions in the queue are invisible from the outside."
        />
      )}
      {directory.state === 'ok' && directory.data && (
        <ul className="dp-cards">
          {directory.data.applications.map((application) => (
            <li className="dp-card" key={application.id}>
              <h2 className="dp-card__title">
                <Link to={`/apps/${encodeURIComponent(application.slug)}`}>{application.name}</Link>
              </h2>
              <p className="dp-card__tagline">
                {application.tagline || 'Its developer wrote no summary line.'}
              </p>
              <p className="dp-card__meta">
                Approved {when(application.listedAt, 'on a date that was not recorded')}
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
    'Nothing came back for this listing.',
    [slug],
  )

  return (
    <section className="dp-page">
      {listing.state === 'loading' && <Loading label="Fetching this listing" />}
      {(listing.state === 'failed' || listing.state === 'forbidden') && listing.error && (
        <Failed
          notice={listing.error}
          onRetry={listing.reload}
          title="Nothing approved sits at this address"
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
            Everything above was written by the team who built the integration. A CloudsForge
            reviewer read it before it went up. We do not run the software itself, and support for
            it comes from its developer.
          </Note>
          <p className="dp-para">
            <Link to="/apps">Return to the directory</Link>
          </p>
        </>
      )}
    </section>
  )
}
