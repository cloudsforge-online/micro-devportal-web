/**
 * OAuth clients: register one, list them, revoke one.
 *
 * Three routes: `POST /v1/projects/:id/oauth-clients` (`devplatform/src/server.ts`, wrapped, so
 * an `Idempotency-Key` is required), `GET …` and `DELETE /v1/oauth-clients/:id`.
 *
 * The client secret is shown once and there is no column it could be read back from: it is hashed
 * exactly as an API key's is, under the same `oauth_clients_slow_kdf_only` constraint
 * (`devplatform/src/migrations.ts`).
 *
 * ── The redirect URIs are the part worth being strict about ───────────────────────────────────
 *
 * Absolute https, or http on loopback for development, with no fragment and no wildcard
 * (`devplatform/src/oauth.ts`), and the schema says the same in a CHECK
 * (`devplatform/src/migrations.ts`). The service's own comment names the stake: a wildcard
 * or relative redirect "is an open redirect that hands an authorisation code to whoever asked for
 * it, and it is the single most exploited misconfiguration in OAuth deployments". This screen says
 * that on the field rather than letting a developer discover it from a 400.
 *
 * ── What this screen deliberately does not claim ──────────────────────────────────────────────
 *
 * Registering a client here does not make an authorisation flow work. `POST /internal/oauth/verify`
 * (`devplatform/src/server.ts`) is the check identity's token endpoint WOULD call, and nothing
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
  'You are looking at this client secret for the only time. What we keep is a scrypt hash, in a ' +
  'table whose CHECK constraint rejects any row storing something cheaper to crack, so there is ' +
  'nothing here that could give the value back to you.'

export function OAuthPage() {
  const { id = '' } = useParams()
  const clients = useResource(
    (signal) => listClients(id, signal),
    (data) => data.clients.length,
    'The client list did not come back.',
    [id],
  )

  return (
    <>
      <h2 className="dp-h2">OAuth clients</h2>
      <p className="dp-para">
        Register a client when your software needs to act for somebody else’s CloudsForge account —
        the authorisation-code flow, where the account holder approves what you are asking for.
        Where your integration only ever speaks for itself, stay with an API key: it is fewer moving
        parts and nothing on this page applies.
      </p>

      <NewClient projectId={id} onRegistered={clients.reload} />

      {clients.state === 'loading' && <Loading label="Fetching the clients" />}
      {(clients.state === 'failed' || clients.state === 'forbidden') && clients.error && (
        <Failed notice={clients.error} onRetry={clients.reload} />
      )}
      {clients.state === 'empty' && (
        <Empty
          title="This project has registered no clients"
          hint="Most integrations never need one. Use the form above only when your software must act on behalf of a CloudsForge account that is not yours."
        />
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
    'We could not reach the service that publishes the scope list.',
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
  }, 'The platform refused to register this client.')

  const toggle = (scope: string) =>
    setScopes((current) =>
      current.includes(scope) ? current.filter((s) => s !== scope) : [...current, scope],
    )

  return (
    <>
      <Note tone="warn">
        {CLIENT_SECRET_NOTE} Open your secret manager first — the value appears the moment you
        submit, and closing that box ends your only chance to read it.
      </Note>
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
            One address per line, each a full https URL — or http on localhost while you are
            building. No fragments, and no patterns. A pattern here would let anyone who can shape a
            matching address collect an authorisation code meant for you, which is why the database
            rejects one no matter which code path tries to write it.
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

      {register.error && (
        <Failed notice={register.error} title="No client was registered, and nothing changed" />
      )}

      {registered?.clientSecret && (
        <ShownOnce
          kind="client secret"
          secret={registered.clientSecret}
          note={CLIENT_SECRET_NOTE}
          label={registered.client.clientId}
          onAcknowledge={() => setRegistered(null)}
        >
          <p className="dp-once__extra">
            That client id travels in the open — it sits in the authorisation request and anyone can
            see it. The value in the box does not: keep it on your server, out of any code a browser
            downloads.
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
 * revocation's time (`devplatform/src/routeidempotency.test.ts`). The row survives, which is
 * why the list above shows revoked clients rather than dropping them.
 */
function RevokeClient({ id, onRevoked }: { id: string; onRevoked: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const revoke = useMutation(
    () => revokeClient(id),
    'The withdrawal did not take. This client is still verifying.',
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
        You are about to withdraw this client. Its secret stops verifying at once, and every
        authorisation flow that depends on it breaks. <strong>Nothing reinstates it</strong> — you
        would register a replacement and update whatever holds the old credentials.
      </p>
      <button
        type="button"
        className="cf-btn cf-btn--danger"
        disabled={revoke.busy}
        onClick={() => void revoke.run().then((result) => result && onRevoked())}
      >
        {revoke.busy ? 'Withdrawing…' : 'Withdraw this client'}
      </button>
      <button type="button" className="cf-btn" onClick={() => setConfirming(false)}>
        Leave it working
      </button>
      {revoke.error && (
        <Failed notice={revoke.error} title="This client is still live — nothing was withdrawn" />
      )}
    </div>
  )
}
