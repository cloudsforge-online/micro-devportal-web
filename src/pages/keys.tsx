/**
 * API keys: issue one, see the list, revoke one.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THIS IS THE SCREEN THE WHOLE PRODUCT IS FOR, AND ITS ONE IRREVERSIBLE MOMENT.
 *
 * `POST /v1/projects/:id/keys` (`devplatform/src/server.ts`) is the only route in the service
 * that returns a usable credential. The response carries `secretKey` once, with the service's own
 * sentence in `note` (`devplatform/src/server.ts`), and **there is no route and no column that
 * could produce it again** — `api_keys` holds a scrypt hash and nothing else, and
 * `api_keys_slow_kdf_only` refuses any row that says otherwise
 * (`devplatform/src/migrations.ts`).
 *
 * So the warning is on the FORM, before the request is sent, in the service's own words; and the
 * secret itself appears in `<ShownOnce>`, which is modal, traps focus, arms `beforeunload`, and
 * cannot be dismissed until the reader has copied it or said they have written it down. See
 * src/components/once.tsx for why each of those is there.
 *
 * Two things this screen must never do, and `test/render.test.ts` enforces both: offer to show a
 * secret again, and word a failure as though support could recover one.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * The `Idempotency-Key` is not optional politeness here. Without it a double-clicked "Issue key"
 * mints two credentials "and the second is one the developer never sees and therefore never revokes
 * — a live key with no owner" (`devplatform/src/server.ts`).
 */
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Empty, Failed, Loading, Note } from '../components/states.tsx'
import { Identifier, Scopes, StateBadge } from '../components/tone.tsx'
import { Replayed, ShownOnce } from '../components/once.tsx'
import { useResource } from '../lib/resource.ts'
import { useIdempotentMutation, useMutation } from '../lib/mutation.ts'
import { keyState, when, SHOWN_ONCE } from '../lib/format.ts'
import {
  getScopes,
  issueKey,
  listKeys,
  revokeKey,
  KEY_ENVIRONMENTS,
  type IssuedKey,
  type KeyEnvironment,
} from '../lib/devplatform.ts'

export function KeysPage() {
  const { id = '' } = useParams()
  const [includeRevoked, setIncludeRevoked] = useState(false)

  const keys = useResource(
    (signal) => listKeys(id, { includeRevoked, signal }),
    (data) => data.keys.length,
    'The list of credentials did not come back.',
    [id, includeRevoked],
  )

  return (
    <>
      <h2 className="dp-h2">API keys</h2>
      <IssueKey projectId={id} onIssued={keys.reload} />

      <div className="dp-toolbar">
        <label className="dp-check">
          <input
            type="checkbox"
            checked={includeRevoked}
            onChange={(event) => setIncludeRevoked(event.currentTarget.checked)}
          />
          Include withdrawn credentials
        </label>
      </div>

      {keys.state === 'loading' && <Loading label="Fetching this project’s credentials" />}
      {(keys.state === 'failed' || keys.state === 'forbidden') && keys.error && (
        <Failed notice={keys.error} onRetry={keys.reload} />
      )}
      {keys.state === 'empty' && (
        <Empty
          title={
            includeRevoked
              ? 'No credential has ever existed in this project'
              : 'Nothing here can authenticate right now'
          }
          hint={
            includeRevoked
              ? 'Counting the revoked ones, the list is still empty. Use the form above to mint the first.'
              : 'Revoked keys are hidden by this filter, and there may be some — tick the box to see them. Their rows survive permanently, because the row is the only proof the credential ever existed.'
          }
        />
      )}
      {keys.state === 'ok' && keys.data && (
        <div className="dp-tablewrap">
          <table className="dp-table">
            <thead>
              <tr>
                <th scope="col">State</th>
                <th scope="col">Key</th>
                <th scope="col">Name</th>
                <th scope="col">Environment</th>
                <th scope="col">Scopes</th>
                <th scope="col">Last used</th>
                <th scope="col">Expires</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {keys.data.keys.map((key) => (
                <tr key={key.id}>
                  <td>
                    <StateBadge tone={keyState(key)} />
                  </td>
                  <td>
                    <Identifier value={key.display} />
                  </td>
                  <td>{key.name}</td>
                  <td>{key.environment}</td>
                  <td>
                    <Scopes scopes={key.scopes} />
                  </td>
                  <td>{when(key.lastUsedAt, 'never')}</td>
                  <td>{when(key.expiresAt, 'does not expire')}</td>
                  <td>
                    {key.revokedAt === null ? (
                      <RevokeKey id={key.id} display={key.display} onRevoked={keys.reload} />
                    ) : (
                      <span className="dp-absent">
                        revoked {when(key.revokedAt)}
                        {key.revokedReason ? ` — ${key.revokedReason}` : ''}
                      </span>
                    )}
                  </td>
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
 * The issue form.
 *
 * The scope checkboxes are built from `GET /v1/scopes` rather than from a list in this bundle. A
 * hard-coded vocabulary here would be a second copy of the service's own registry, and the copy is
 * the one that goes stale — a developer would tick a scope that no longer exists and the issuance
 * would be refused with `unknown_scope` for a reason the screen had caused.
 *
 * **An empty scope selection is allowed and is not a mistake.** `grantsScope([], anything)` is false
 * and creating such a key is permitted "precisely so that it is provable: a credential can exist and
 * be completely inert" (`devplatform/src/scopes.ts`). The form says that rather than refusing.
 */
function IssueKey({ projectId, onIssued }: { projectId: string; onIssued: () => void }) {
  const vocabulary = useResource(
    (signal) => getScopes(signal),
    (data) => data.scopes.length,
    'We could not reach the service that publishes the scope list.',
  )

  const [name, setName] = useState('')
  const [environment, setEnvironment] = useState<KeyEnvironment>('test')
  const [scopes, setScopes] = useState<readonly string[]>([])
  const [expiresAt, setExpiresAt] = useState('')
  const [issued, setIssued] = useState<IssuedKey | null>(null)

  // The key's lifecycle belongs to the hook, not to this component. Rotating it here would mean
  // reading `issue.error` in the closure that started the run, and that closure cannot see the
  // state the hook has just set — so it would read the previous attempt's error and keep a spent
  // key, which on this route is the difference between a replay and a second live credential.
  const issue = useIdempotentMutation(async (key: string) => {
    const result = await issueKey(
      projectId,
      {
        environment,
        scopes,
        ...(name.trim() ? { name: name.trim() } : {}),
        ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
      },
      key,
    )
    setIssued(result)
    return result
  }, 'The platform refused to mint this credential.')

  const toggle = (scope: string) =>
    setScopes((current) =>
      current.includes(scope) ? current.filter((s) => s !== scope) : [...current, scope],
    )

  return (
    <>
      {/*
        THE WARNING IS ON THE FORM, NOT ONLY ON THE ANSWER.

        A warning that first appears alongside the secret is a warning read after the decision it
        was meant to inform. This is the service's own sentence, verbatim — `SHOWN_ONCE` in
        src/lib/format.ts, which `test/devplatform.test.ts` asserts is still identical to the string
        `devplatform/src/server.ts` puts on the wire.
      */}
      <Note tone="warn">
        {SHOWN_ONCE} Open your secret manager first — the value appears the moment you submit, and
        closing that box ends your only chance to read it.
      </Note>

      <form
        className="dp-form"
        onSubmit={(event) => {
          event.preventDefault()
          void issue.run().then((result) => {
            if (result) onIssued()
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
            placeholder={`${environment} key`}
          />
          <span className="dp-field__help">
            A label for your own benefit — the platform never reads it. Write down where the key is
            going to live, and the list above becomes something a colleague can act on.
          </span>
        </label>

        <fieldset className="dp-fieldset">
          <legend className="dp-field__label">Environment</legend>
          {KEY_ENVIRONMENTS.map((candidate) => (
            <label className="dp-check" key={candidate}>
              <input
                type="radio"
                name="environment"
                value={candidate}
                checked={environment === candidate}
                onChange={() => setEnvironment(candidate)}
              />
              {candidate}
            </label>
          ))}
        </fieldset>

        <fieldset className="dp-fieldset">
          <legend className="dp-field__label">Scopes</legend>
          {vocabulary.state === 'loading' && <Loading label="Asking which scopes exist" />}
          {vocabulary.state === 'ok' &&
            vocabulary.data?.scopes.map((scope) => (
              <label className="dp-check" key={scope.name}>
                <input
                  type="checkbox"
                  checked={scopes.includes(scope.name)}
                  onChange={() => toggle(scope.name)}
                />
                <code className="cf-num">{scope.name}</code> — {scope.description}
              </label>
            ))}
          <p className="dp-field__help">
            Each name is matched literally. <code className="cf-num">market:write</code> buys you
            nothing on <code className="cf-num">market:read</code>, and there is no name that stands
            in for a group. Leave every box clear and you get a working credential that is turned
            away at every route — useful for proving a deployment path before it has any authority.
          </p>
        </fieldset>

        <label className="dp-field">
          <span className="dp-field__label">Expires</span>
          <input
            className="cf-input"
            type="date"
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.currentTarget.value)}
          />
          <span className="dp-field__help">
            After this date the key stops authenticating. Skip the field for a credential that runs
            until somebody revokes it.
          </span>
        </label>

        <button type="submit" className="cf-btn cf-btn--primary" disabled={issue.busy}>
          {issue.busy ? 'Issuing…' : 'Issue key'}
        </button>
      </form>

      {issue.error && (
        <Failed notice={issue.error} title="No credential was minted, and nothing changed" />
      )}

      {/*
        Three outcomes, three renderings.

        A replay is a SUCCESS with no secret in it (`devplatform/src/server.ts`), and it must
        not be drawn as either a failure or a fresh credential — a developer who read it as a
        failure would issue a second key nobody needs.
      */}
      {issued?.secretKey && (
        <ShownOnce
          kind="API key"
          secret={issued.secretKey}
          note={issued.note ?? SHOWN_ONCE}
          label={issued.key.display}
          onAcknowledge={() => setIssued(null)}
        >
          <p className="dp-once__extra">
            Put it on the wire as <code className="cf-num">Authorization: Bearer {'<key>'}</code>.
            The scopes you chose are welded to it — nothing edits them later. Changing what this
            credential may do means minting a second one and withdrawing this.
          </p>
        </ShownOnce>
      )}
      {issued && issued.secretKey === null && (
        <>
          <Replayed kind="key" label={issued.key.display} />
          <button type="button" className="cf-btn" onClick={() => setIssued(null)}>
            Understood
          </button>
        </>
      )}
    </>
  )
}

/**
 * Revoke one key.
 *
 * `DELETE /v1/keys/:id` (`devplatform/src/server.ts`) is idempotent by claim, not merely by
 * verb: `revokeApiKey` updates `where revoked_at is null`, so a second call preserves the first
 * call's time and reason and emits no second event. The answer says which happened, and this
 * control renders the difference rather than reporting both as "done".
 *
 * **The confirmation is not a courtesy.** Revocation cannot be undone: there is no route that
 * un-revokes a key, and a replacement is a new credential that every caller has to be given.
 */
function RevokeKey({
  id,
  display,
  onRevoked,
}: {
  id: string
  display: string
  onRevoked: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const [reason, setReason] = useState('')
  const revoke = useMutation(
    () => revokeKey(id, reason),
    'The withdrawal did not take. This key is still authenticating.',
  )

  if (!confirming) {
    return (
      <button type="button" className="cf-btn cf-btn--danger" onClick={() => setConfirming(true)}>
        Revoke
      </button>
    )
  }

  return (
    <div className="dp-confirm">
      <p className="dp-confirm__lead">
        You are about to withdraw <Identifier value={display} />. Anything still presenting it —
        including software you did not deploy — starts getting refused.{' '}
        <strong>This cannot be undone.</strong> There is no route that restores a key, so recovery
        means minting a fresh credential and rolling it out everywhere the old one was in use.
      </p>
      <input
        className="cf-input"
        value={reason}
        placeholder="Reason — optional, and kept on the record"
        onChange={(event) => setReason(event.currentTarget.value)}
      />
      <button
        type="button"
        className="cf-btn cf-btn--danger"
        disabled={revoke.busy}
        onClick={() => void revoke.run().then((result) => result && onRevoked())}
      >
        {revoke.busy ? 'Withdrawing…' : 'Withdraw this key'}
      </button>
      <button type="button" className="cf-btn" onClick={() => setConfirming(false)}>
        Leave it working
      </button>
      {revoke.error && (
        <Failed notice={revoke.error} title="This key is still live — nothing was withdrawn" />
      )}
      {revoke.result?.alreadyRevoked && (
        <Note tone="warn">
          Somebody had already withdrawn it, at {when(revoke.result.key.revokedAt)}. That first
          timestamp and reason stand; your click overwrote neither.
        </Note>
      )}
      <Note>
        This service stops honouring the key the moment you confirm. Validation at the edge holds a
        credential’s state for as long as 30 seconds, so a call already on its way can still land
        inside that window.
      </Note>
    </div>
  )
}
