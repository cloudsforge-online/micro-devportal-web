/**
 * The index: what a credential on this platform can be, before anybody has one.
 *
 * PUBLIC, because `GET /v1/scopes` is (`devplatform/src/server.ts:604`). The person this page is
 * written for has not signed in and is deciding whether to.
 *
 * It renders the scope vocabulary as a table rather than as prose, because the vocabulary IS the
 * product's authority model: exact match, no wildcard, no hierarchy, and an empty set that grants
 * nothing (`devplatform/src/scopes.ts:5-19`). A page that summarised it would be a second, prettier
 * copy that drifts.
 */
import { Link } from 'react-router-dom'
import { Empty, Failed, Loading, Note } from '../components/states.tsx'
import { useResource } from '../lib/resource.ts'
import { getScopes, KNOWN_GAPS } from '../lib/devplatform.ts'

export function PlatformPage() {
  const vocabulary = useResource(
    (signal) => getScopes(signal),
    (data) => data.scopes.length,
    'The scope vocabulary could not be loaded.',
  )

  return (
    <section className="dp-page">
      <header className="dp-page__head">
        <h1 className="dp-page__title">The Developer Platform</h1>
        <p className="dp-page__lead">
          A CloudsForge integration presents an API key. This is where an organisation enrols, a
          project is created, a key is issued with the exact scopes it needs, and its usage is
          metered. A key’s secret is shown once, at the moment it is created, and cannot be
          recovered afterwards by anybody — including us.
        </p>
      </header>

      <div className="dp-cta">
        <Link className="cf-btn cf-btn--primary" to="/organisations">
          Enrol an organisation
        </Link>
        <Link className="cf-btn" to="/apps">
          Browse the directory
        </Link>
      </div>

      <h2 className="dp-h2">The scopes a key may carry</h2>
      <p className="dp-para">
        Named by service and action rather than by URL — <code className="cf-num">market:write</code>{' '}
        is a fact about authority and survives any change to where the public API is mounted
        (<code className="cf-num">devplatform/src/scopes.ts:69-72</code>).{' '}
        <strong>There is no wildcard scope.</strong> Name every scope a key needs: an unknown one is
        refused at issuance rather than filtered out, so a key never quietly carries less authority
        than you asked for. A key with no scopes at all is legal, and it can do nothing.
      </p>

      {vocabulary.state === 'loading' && <Loading label="Reading the scope vocabulary" />}
      {vocabulary.state === 'failed' && vocabulary.error && (
        <Failed notice={vocabulary.error} onRetry={vocabulary.reload} />
      )}
      {vocabulary.state === 'forbidden' && vocabulary.error && (
        <Failed notice={vocabulary.error} title="The scope vocabulary was refused" />
      )}
      {vocabulary.state === 'empty' && (
        <Empty
          title="This platform publishes no scopes"
          hint="That is not a loading state — the service answered with an empty vocabulary."
        />
      )}
      {vocabulary.state === 'ok' && vocabulary.data && (
        <>
          <div className="dp-tablewrap">
            <table className="dp-table">
              <caption className="dp-table__caption">
                Every scope this platform issues. Read from{' '}
                <code className="cf-num">GET /v1/scopes</code>, which is public.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Scope</th>
                  <th scope="col">Service</th>
                  <th scope="col">Kind</th>
                  <th scope="col">What it grants</th>
                </tr>
              </thead>
              <tbody>
                {vocabulary.data.scopes.map((scope) => (
                  <tr key={scope.name}>
                    <td>
                      <code className="cf-num">{scope.name}</code>
                    </td>
                    <td>{scope.service}</td>
                    <td>{scope.kind}</td>
                    <td>{scope.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Note>{vocabulary.data.note}</Note>
        </>
      )}

      <h2 className="dp-h2">What is not finished</h2>
      <p className="dp-para">
        Stated here rather than discovered later. Each is a finding with the lines it was read from,
        not a roadmap.
      </p>
      <dl className="dp-gaps">
        {KNOWN_GAPS.map((gap) => (
          <div className="dp-gap" key={gap.id}>
            <dt className="dp-gap__title">{gap.title}</dt>
            <dd className="dp-gap__body">
              <p>{gap.finding}</p>
              <p className="dp-gap__closes">
                <strong>What would close it:</strong> {gap.closes}
              </p>
              <p className="dp-gap__cites">
                {gap.citations.map((citation) => (
                  <code className="cf-num" key={citation}>
                    {citation}
                  </code>
                ))}
              </p>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
