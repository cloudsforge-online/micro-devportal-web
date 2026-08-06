/**
 * Quotas and usage.
 *
 * Two reads: `GET /v1/projects/:id/quotas` (`devplatform/src/server.ts`) and
 * `GET /v1/projects/:id/usage` (`devplatform/src/server.ts`), both `project:read`.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THIS SCREEN LOWERS A LIMIT AND CANNOT RAISE ONE, AND THAT IS THE SERVICE'S RULE RATHER THAN
 * THIS SCREEN'S MANNERS.
 *
 * The earlier version of this file drew no quota control at all, because
 * `PUT /v1/projects/:id/quotas` was plain `project:write` and `setQuota` accepted any whole number
 * with no ceiling — the party the limit binds chose the limit. That was reported and
 * `micro-devplatform@e13c154` fixed it. **The direction is now the authority**
 * (`devplatform/src/server.ts`):
 *
 *   * lowering, or writing the same value, is `project:write` — the customer's own safety feature;
 *   * raising is an operator's, and a browser can never be one: `devplatform:admin` is absent from
 *     `devplatform/src/scopes.ts`, so no API key can hold it;
 *   * CREATING a row is also an operator's, because a missing row means UNLIMITED rather than
 *     zero — a finite value written where there was none is a raise wearing a reduction's clothes.
 *
 * So the control below appears only next to a quota that EXISTS, and it refuses a larger number
 * before the request is built (`lowerQuota` in src/lib/devplatform.ts). The service would refuse it
 * too; refusing here as well means a developer who types a bigger number reads a sentence about
 * the rule rather than a 403 about their authority.
 *
 * A developer capping a test environment so a runaway loop cannot burn the month's allowance is
 * doing the platform's work for it. Making that need a support ticket means nobody ever does it.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ── The counter is a row, so these numbers are the estate's ───────────────────────────────────
 *
 * `quota_windows` holds the count and one guarded UPDATE increments it;
 * `quota_windows_within_limit` makes exceeding a quota a constraint violation rather than a race
 * that usually does not happen (`devplatform/src/migrations.ts`). An in-memory counter would
 * be per-replica, and a per-replica quota is not a quota. So `used` here is the whole platform's
 * view and this screen may state it as fact.
 *
 * There is no "over the limit" rendering, for the same reason: it is not a state a row can be in.
 */
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Empty, Failed, Loading, Note } from '../components/states.tsx'
import { Identifier, StateBadge } from '../components/tone.tsx'
import { useResource } from '../lib/resource.ts'
import { useMutation } from '../lib/mutation.ts'
import { count, percent, quotaTone, when } from '../lib/format.ts'
import {
  getQuotas,
  getProject,
  listUsage,
  lowerQuota,
  type Environment,
  type KeyEnvironment,
  type Quota,
} from '../lib/devplatform.ts'

export function UsagePage() {
  const { id = '' } = useParams()
  const project = useResource(
    (signal) => getProject(id, signal),
    () => 1,
    'The project did not come back from the service.',
    [id],
  )
  const quotas = useResource(
    (signal) => getQuotas(id, signal),
    (data) => data.quotas.length,
    'The allowances did not come back.',
    [id],
  )
  const usage = useResource(
    (signal) => listUsage(id, { signal }),
    (data) => data.usage.length,
    'The usage summaries did not come back.',
    [id],
  )

  /**
   * The environment ROW for an id, or null while the project is still loading.
   *
   * Quota and usage rows carry ids; the names live on the project. Returning the row rather than a
   * string matters for the lowering control: `PUT …/quotas` wants the NAME in its body
   * (`requireEnvironment`, `devplatform/src/server.ts`), and a lookup that fell back to
   * echoing the id would produce a control that posts an id where a name belongs and gets a 400
   * naming a field the reader never filled in. No fallback: no row, no control.
   */
  const environmentOf = (environmentId: string): Environment | null =>
    project.data?.project.environments.find((environment) => environment.id === environmentId) ??
    null

  /** For display only, where showing the raw id is better than showing nothing. */
  const nameOf = (environmentId: string): string =>
    environmentOf(environmentId)?.name ?? environmentId

  return (
    <>
      <h2 className="dp-h2">Quotas</h2>
      <p className="dp-para">
        Every environment carries its own allowance, and the tally is held in the database rather
        than inside whichever copy of the service took your call. What you see is therefore the
        whole platform’s count, not one machine’s guess. A call that would push a window past its
        limit is turned away instead of being counted.
      </p>

      {quotas.state === 'loading' && <Loading label="Fetching the limits" />}
      {(quotas.state === 'failed' || quotas.state === 'forbidden') && quotas.error && (
        <Failed notice={quotas.error} onRetry={quotas.reload} />
      )}
      {quotas.state === 'empty' && (
        <Empty
          title="No allowances are recorded against this project"
          hint="This is not a normal state. Limits are written alongside the environments in the same transaction that creates a project, so an empty answer means that transaction did not finish the way it was meant to. Worth raising with us, quoting the project id."
        />
      )}
      {quotas.state === 'ok' && quotas.data && (
        <>
          <div className="dp-tablewrap">
            <table className="dp-table">
              <caption className="dp-table__caption">
                What each environment is allowed. Pulling a number down is yours to do; pushing one
                up belongs to CloudsForge, and the platform rejects a larger figure no matter who
                sends it.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Environment</th>
                  <th scope="col">Meter</th>
                  <th scope="col">Period</th>
                  <th scope="col">Allowed</th>
                  <th scope="col">Reduce it</th>
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
                    <td>
                      {/*
                        No control until the project has loaded and the id has resolved to a real
                        environment row. The route wants the environment NAME, and a cast from a
                        fallback id would post an id where a name belongs.
                      */}
                      {(() => {
                        const environment = environmentOf(quota.environmentId)
                        return environment ? (
                          <LowerLimit
                            projectId={id}
                            quota={quota}
                            environment={environment.name}
                            onChanged={quotas.reload}
                          />
                        ) : (
                          <span className="dp-absent">—</span>
                        )
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="dp-h3">Where each window stands</h3>
          {Object.entries(quotas.data.current).map(([environment, windows]) => (
            <div className="dp-windows" key={environment}>
              <h4 className="dp-h4">{environment}</h4>
              {windows.length === 0 ? (
                <p className="dp-absent">
                  Nothing has been metered in this environment, so no window is open.
                </p>
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
            <strong>No allowance can be increased from this console</strong> — and that is the
            platform’s rule rather than this page being coy. A larger figure is rejected for every
            credential a browser is capable of holding. Cutting one back is entirely yours, and it
            earns its keep: a tight ceiling on your test environment is what keeps a loop that ran
            away overnight from eating the month. Ask CloudsForge when you need more headroom.
          </Note>
        </>
      )}

      <h2 className="dp-h2">Usage</h2>
      <p className="dp-para">
        One row per hour, covering the past seven days. These figures are summaries rather than
        individual calls — the underlying events live for 35 days by default and the summaries for
        400, and this screen only ever reads the summaries. Where the older end of the table thins
        out, you are seeing retention rather than a quiet week.
      </p>
      {usage.state === 'loading' && <Loading label="Fetching the usage summaries" />}
      {(usage.state === 'failed' || usage.state === 'forbidden') && usage.error && (
        <Failed notice={usage.error} onRetry={usage.reload} />
      )}
      {usage.state === 'empty' && (
        <Empty
          title="Nothing was metered in the past week"
          hint="The window is fixed at seven days and there is no way to shift it from here, so this tells you about the past week only. Traffic older than that is not being reported as absent — it is simply out of range."
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

/**
 * Lower one quota, for one environment and one period.
 *
 * ── WHY THE FIELD IS `max={quota.maxUnits}` AND THE CHECK IS ALSO IN THE CLIENT ───────────────
 *
 * Three layers, and each catches something the next cannot. `max` on the input is the one a
 * developer meets first and costs nothing. `lowerQuota` refuses a larger number before the request
 * is built, because `max` is advisory in every browser and a typed number can exceed it.
 * `devplatform` refuses it again with a 403 naming the current value, and THAT is the authority —
 * the two here exist so a developer reads a sentence about the rule instead of a refusal about
 * their authority, not because the service is trusted less.
 *
 * **A lowered limit takes effect on the next window, not retroactively.** `quota_windows` rows
 * already open keep the count they have; the new limit is what the next `consumeAll` compares
 * against. Said on the button's help text rather than left to be discovered by somebody who
 * lowered a limit during an incident and expected traffic to stop immediately.
 *
 * The environment is passed by NAME because that is what the route's body wants
 * (`requireEnvironment`, `devplatform/src/server.ts`) — the table renders names and the rows
 * carry ids, so the mapping happens once, in `nameOf`, rather than twice.
 */
function LowerLimit({
  projectId,
  quota,
  environment,
  onChanged,
}: {
  projectId: string
  quota: Quota
  environment: KeyEnvironment
  onChanged: () => void
}) {
  const [value, setValue] = useState('')
  const wanted = Number(value)
  const usable = value.trim() !== '' && Number.isInteger(wanted) && wanted >= 1 && wanted < quota.maxUnits

  const lower = useMutation(
    () =>
      lowerQuota(projectId, {
        environment,
        period: quota.period,
        maxUnits: wanted,
        current: quota.maxUnits,
      }),
    'The platform kept the existing allowance.',
  )

  return (
    <form
      className="dp-inline-form"
      onSubmit={(event) => {
        event.preventDefault()
        void lower.run().then((result) => {
          if (!result) return
          setValue('')
          onChanged()
        })
      }}
    >
      <label className="dp-field dp-field--inline">
        <span className="dp-field__label dp-field__label--sr">
          A smaller {quota.period} allowance for {environment}. It must come in under{' '}
          {count(quota.maxUnits)}, and it applies from the next window rather than this one.
        </span>
        <input
          className="cf-input cf-num"
          type="number"
          min={1}
          max={quota.maxUnits - 1}
          step={1}
          value={value}
          placeholder={String(quota.maxUnits)}
          onChange={(event) => setValue(event.currentTarget.value)}
        />
      </label>
      <button type="submit" className="cf-btn" disabled={!usable || lower.busy}>
        {lower.busy ? 'Reducing…' : 'Reduce'}
      </button>
      {lower.error && (
        <Failed notice={lower.error} title="The allowance stands where it was" />
      )}
    </form>
  )
}
