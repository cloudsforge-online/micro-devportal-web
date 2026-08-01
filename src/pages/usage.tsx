/**
 * Quotas and usage.
 *
 * Two reads: `GET /v1/projects/:id/quotas` (`devplatform/src/server.ts:856`) and
 * `GET /v1/projects/:id/usage` (`devplatform/src/server.ts:866`), both `project:read`.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * `PUT /v1/projects/:id/quotas` IS DELIBERATELY NOT DRAWN, AND THE REASON IS A DEFECT REPORT.
 *
 * The route exists (`devplatform/src/server.ts:836`) and it is `project:write` (`:837`) — the same
 * authority that issues a key. `setQuota` accepts any whole number of at least 1, with no ceiling
 * of any kind (`devplatform/src/quotas.ts:112-126`). So the owner of a project may set their own
 * rate limit to whatever they like.
 *
 * A "raise my limit" control in a customer console would make the platform's quota advisory, and
 * this is a customer console. The route belongs to the operator surface, where a limit is a
 * decision somebody else makes. Reported to micro-devplatform; not exercised here, and recorded as
 * a declined route in src/lib/devplatform.ts so the omission is a decision rather than a gap.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ── The counter is a row, so these numbers are the estate's ───────────────────────────────────
 *
 * `quota_windows` holds the count and one guarded UPDATE increments it;
 * `quota_windows_within_limit` makes exceeding a quota a constraint violation rather than a race
 * that usually does not happen (`devplatform/src/migrations.ts:29-35`). An in-memory counter would
 * be per-replica, and a per-replica quota is not a quota. So `used` here is the whole platform's
 * view and this screen may state it as fact.
 *
 * There is no "over the limit" rendering, for the same reason: it is not a state a row can be in.
 */
import { useParams } from 'react-router-dom'
import { Empty, Failed, Loading, Note } from '../components/states.tsx'
import { Identifier, StateBadge } from '../components/tone.tsx'
import { useResource } from '../lib/resource.ts'
import { count, percent, quotaTone, when } from '../lib/format.ts'
import { getQuotas, getProject, listUsage } from '../lib/devplatform.ts'

export function UsagePage() {
  const { id = '' } = useParams()
  const project = useResource(
    (signal) => getProject(id, signal),
    () => 1,
    'The project could not be loaded.',
    [id],
  )
  const quotas = useResource(
    (signal) => getQuotas(id, signal),
    (data) => data.quotas.length,
    'The quotas could not be loaded.',
    [id],
  )
  const usage = useResource(
    (signal) => listUsage(id, { signal }),
    (data) => data.usage.length,
    'The usage could not be loaded.',
    [id],
  )

  /** Environment ids appear on quota and usage rows; the names come from the project. */
  const nameOf = (environmentId: string): string =>
    project.data?.project.environments.find((environment) => environment.id === environmentId)
      ?.name ?? environmentId

  return (
    <>
      <h2 className="dp-h2">Quotas</h2>
      <p className="dp-para">
        Counted per environment, in the database rather than in any one running copy of the service —
        so these are the platform’s numbers and not one replica’s. A request that would exceed a
        window is refused rather than recorded.
      </p>

      {quotas.state === 'loading' && <Loading label="Reading the quotas" />}
      {(quotas.state === 'failed' || quotas.state === 'forbidden') && quotas.error && (
        <Failed notice={quotas.error} onRetry={quotas.reload} />
      )}
      {quotas.state === 'empty' && (
        <Empty
          title="This project has no quotas"
          hint="That should not happen: a project is created with its default quotas in the same transaction as its environments. If you see this, the project’s creation did not complete as designed."
        />
      )}
      {quotas.state === 'ok' && quotas.data && (
        <>
          <div className="dp-tablewrap">
            <table className="dp-table">
              <caption className="dp-table__caption">
                The configured limits. Changing one is an operator action and is not offered here —
                see the note below.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Environment</th>
                  <th scope="col">Meter</th>
                  <th scope="col">Period</th>
                  <th scope="col">Limit</th>
                </tr>
              </thead>
              <tbody>
                {quotas.data.quotas.map((quota) => (
                  <tr key={quota.id}>
                    <td>{nameOf(quota.environmentId)}</td>
                    <td>
                      <code className="cf-num">{quota.meter}</code>
                    </td>
                    <td>{quota.period}</td>
                    <td>{count(quota.maxUnits)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="dp-h3">The current windows</h3>
          {Object.entries(quotas.data.current).map(([environment, windows]) => (
            <div className="dp-windows" key={environment}>
              <h4 className="dp-h4">{environment}</h4>
              {windows.length === 0 ? (
                <p className="dp-absent">No window has opened yet in this environment.</p>
              ) : (
                <ul className="dp-meters">
                  {windows.map((window) => (
                    <li className="dp-meter" key={`${environment}-${window.period}`}>
                      <span className="dp-meter__label">
                        per {window.period}: {count(window.used)} of {count(window.limit)}
                      </span>
                      {/* The bar is decorative; the numbers above it are the content, and the
                          badge is the third channel. Colour alone never carries a state here. */}
                      <span
                        className={`dp-meter__bar dp-meter__bar--${quotaTone(window.used, window.limit).tone}`}
                        style={{
                          inlineSize: percent(window.used, window.limit),
                        }}
                        aria-hidden="true"
                      />
                      <StateBadge tone={quotaTone(window.used, window.limit)} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}

          <Note>
            Raising a limit is not something this console does. The route that sets a quota takes the
            same authority that issues a key and accepts any number, so a self-service control here
            would make the limit advisory. Ask CloudsForge to change it.
          </Note>
        </>
      )}

      <h2 className="dp-h2">Usage</h2>
      <p className="dp-para">
        Hourly buckets, from the last seven days. These are rollups rather than raw calls: raw usage
        events are kept for 35 days by default and the rollups for 400, and this route reads only the
        rollups. A gap at the older end is retention, not a quiet week.
      </p>
      {usage.state === 'loading' && <Loading label="Reading the usage" />}
      {(usage.state === 'failed' || usage.state === 'forbidden') && usage.error && (
        <Failed notice={usage.error} onRetry={usage.reload} />
      )}
      {usage.state === 'empty' && (
        <Empty
          title="No metered calls in the last seven days"
          hint="This route reads a seven-day window and takes no date parameter, so an empty answer means nothing in that window rather than nothing ever."
        />
      )}
      {usage.state === 'ok' && usage.data && (
        <div className="dp-tablewrap">
          <table className="dp-table">
            <thead>
              <tr>
                <th scope="col">Hour</th>
                <th scope="col">Environment</th>
                <th scope="col">Route</th>
                <th scope="col">Calls</th>
                <th scope="col">Errors</th>
              </tr>
            </thead>
            <tbody>
              {usage.data.usage.map((row) => (
                <tr key={`${row.environmentId}-${row.route}-${row.bucket}`}>
                  <td>{when(row.bucket)}</td>
                  <td>{nameOf(row.environmentId)}</td>
                  <td>
                    <Identifier value={row.route} />
                  </td>
                  <td>{count(row.calls)}</td>
                  <td>{count(row.errors)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
