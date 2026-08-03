/**
 * OAuth clients: register one, list them, revoke one.
 *
 * Three routes: `POST /v1/projects/:id/oauth-clients` (`devplatform/src/server.ts:1241`, wrapped, so
 * an `Idempotency-Key` is required), `GET …` (`:1278`) and `DELETE /v1/oauth-clients/:id` (`:1283`).
 *
 * The client secret is shown once and there is no column it could be read back from: it is hashed
 * exactly as an API key's is, under the same `oauth_clients_slow_kdf_only` constraint
 * (`devplatform/src/migrations.ts:244`).
 *
 * ── The redirect URIs are the part worth being strict about ───────────────────────────────────
 *
 * Absolute https, or http on loopback for development, with no fragment and no wildcard
 * (`devplatform/src/oauth.ts:102-116`), and the schema says the same in a CHECK
 * (`devplatform/src/migrations.ts:251-255`). The service's own comment names the stake: a wildcard
 * or relative redirect "is an open redirect that hands an authorisation code to whoever asked for
 * it, and it is the single most exploited misconfiguration in OAuth deployments". This screen says
 * that on the field rather than letting a developer discover it from a 400.
 *
 * ── What this screen deliberately does not claim ──────────────────────────────────────────────
 *
 * Registering a client here does not make an authorisation flow work. `POST /internal/oauth/verify`
 * (`devplatform/src/server.ts:1426`) is the check identity's token endpoint WOULD call, and nothing
 * calls it today. So the copy says a client can be registered and its secret verified, and does not
 * describe an end-to-end flow that has not been wired.
 */
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Empty, Failed, Loading, Note } from '../components/states.tsx'
import { Identifier, Scopes } from '../components/tone.tsx'
import { Replayed, ShownOnce } from '../components/once.tsx'
import { useResource } from '../lib/resource.ts'
import { useIdempotentMutation, useMutation } from '../lib/mutation.ts'
import { when } from '../lib/format.ts'
import {
  getScopes,
  listClients,
  registerClient,
  revokeClient,
  type RegisteredClient,
} from '../lib/devplatform.ts'

const CLIENT_SECRET_NOTE =
  'This is the only time this client secret is shown. It is stored under scrypt, in a table whose ' +
  'CHECK constraint refuses any faster hash, and cannot be recovered.'

export function OAuthPage() {
  const { id = '' } = useParams()
  const clients = useResource(
    (signal) => listClients(id, signal),
    (data) => data.clients.length,
    'The OAuth clients could not be loaded.',
    [id],
  )

  return (
    <>
      <h2 className="dp-h2">OAuth clients</h2>
      <p className="dp-para">
        A client for the authorisation-code flow, when your integration acts on behalf of a
        CloudsForge account rather than on its own. If it only acts as itself, an API key is the
        simpler credential and there is nothing to register here.
      </p>

      <NewClient projectId={id} onRegistered={clients.reload} />

      {clients.state === 'loading' && <Loading label="Reading the clients" />}
      {(clients.state === 'failed' || clients.state === 'forbidden') && clients.error && (
        <Failed notice={clients.error} onRetry={clients.reload} />
      )}
      {clients.state === 'empty' && (
        <Empty title="No OAuth clients" hint="Register one above if you need the authorisation-code flow." />
      )}
      {clients.state === 'ok' && clients.data && (
        <div className="dp-tablewrap">
          <table className="dp-table">
            <thead>
              <tr>
                <th scope="col">Client id</th>
                <th scope="col">Name</th>
                <th scope="col">Redirect URIs</th>
                <th scope="col">Scopes</th>
                <th scope="col">State</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {clients.data.clients.map((client) => (
                <tr key={client.id}>
                  <td>
                    <Identifier value={client.clientId} />
                  </td>
                  <td>{client.name}</td>
                  <td>
                    {client.redirectUris.map((uri) => (
                      <code className="cf-num dp-scope" key={uri}>
                        {uri}
                      </code>
                    ))}
                  </td>
                  <td>
                    <Scopes scopes={client.scopes} />
                  </td>
                  <td>
                    {client.revokedAt === null ? 'live' : `revoked ${when(client.revokedAt)}`}
                  </td>
                  <td>
                    {client.revokedAt === null && (
                      <RevokeClient id={client.id} onRevoked={clients.reload} />
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

function NewClient({ projectId, onRegistered }: { projectId: string; onRegistered: () => void }) {
  const vocabulary = useResource(
    (signal) => getScopes(signal),
    (data) => data.scopes.length,
    'The scope vocabulary could not be loaded.',
  )
  const [name, setName] = useState('')
  const [redirects, setRedirects] = useState('')
  const [scopes, setScopes] = useState<readonly string[]>([])
  const [registered, setRegistered] = useState<RegisteredClient | null>(null)

  const register = useIdempotentMutation(async (key: string) => {
    const result = await registerClient(
      projectId,
      {
        name,
        redirectUris: redirects
          .split(/[\s,]+/)
          .map((uri) => uri.trim())
          .filter((uri) => uri.length > 0),
        scopes,
      },
      key,
    )
    setRegistered(result)
    return result
  }, 'The client could not be registered.')

  const toggle = (scope: string) =>
    setScopes((current) =>
      current.includes(scope) ? current.filter((s) => s !== scope) : [...current, scope],
    )

  return (
    <>
      <Note tone="warn">{CLIENT_SECRET_NOTE} Have somewhere to put it before you press the button.</Note>
      <form
        className="dp-form"
        onSubmit={(event) => {
          event.preventDefault()
          void register.run().then((result) => {
            if (!result) return
            setName('')
            setRedirects('')
            onRegistered()
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
          />
        </label>
        <label className="dp-field">
          <span className="dp-field__label">Redirect URIs</span>
          <textarea
            className="cf-input dp-area cf-num"
            value={redirects}
            onChange={(event) => setRedirects(event.currentTarget.value)}
            required
          />
          <span className="dp-field__help">
            One per line. Absolute https, or http on localhost for development. No fragment and no
            wildcard: a wildcard redirect hands an authorisation code to whoever asked for it, and
            the database refuses one whatever the write path.
          </span>
        </label>
        <fieldset className="dp-fieldset">
          <legend className="dp-field__label">Scopes</legend>
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
        </fieldset>
        <button type="submit" className="cf-btn cf-btn--primary" disabled={register.busy}>
          {register.busy ? 'Registering…' : 'Register client'}
        </button>
      </form>

      {register.error && <Failed notice={register.error} title="That client was not registered" />}

      {registered?.clientSecret && (
        <ShownOnce
          kind="client secret"
          secret={registered.clientSecret}
          note={CLIENT_SECRET_NOTE}
          label={registered.client.clientId}
          onAcknowledge={() => setRegistered(null)}
        >
          <p className="dp-once__extra">
            The client id above is public and appears in the authorisation request. The value in the
            box is not, and belongs only in your server’s configuration.
          </p>
        </ShownOnce>
      )}
      {registered && registered.clientSecret === null && (
        <>
          <Replayed kind="client" label={registered.client.clientId} />
          <button type="button" className="cf-btn" onClick={() => setRegistered(null)}>
            Understood
          </button>
        </>
      )}
    </>
  )
}

/**
 * Revoke a client.
 *
 * `revokeClient` uses `coalesce(revoked_at, now())`, so a second call preserves the first
 * revocation's time (`devplatform/src/routeidempotency.test.ts:63-64`). The row survives, which is
 * why the list above shows revoked clients rather than dropping them.
 */
function RevokeClient({ id, onRevoked }: { id: string; onRevoked: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const revoke = useMutation(() => revokeClient(id), 'The client could not be revoked.')

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
        Revoke this client? Its secret stops verifying immediately and cannot be reinstated.
      </p>
      <button
        type="button"
        className="cf-btn cf-btn--danger"
        disabled={revoke.busy}
        onClick={() => void revoke.run().then((result) => result && onRevoked())}
      >
        {revoke.busy ? 'Revoking…' : 'Revoke it'}
      </button>
      <button type="button" className="cf-btn" onClick={() => setConfirming(false)}>
        Keep it
      </button>
      {revoke.error && <Failed notice={revoke.error} title="That client was not revoked" />}
    </div>
  )
}
