/**
 * Webhook endpoints: register one, rotate its secret, disable it, delete it, read its deliveries.
 *
 * Five routes, and one of them returns a secret twice as often as any other in this service — a
 * rotation. `POST /v1/webhook-endpoints/:id/rotate-secret` (`devplatform/src/server.ts:916`) is
 * wrapped for the reason the service states at `:912-914`: a retry without the wrapper "mints a
 * second secret and retires the one the customer has just been shown but has not yet deployed".
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * A WEBHOOK SECRET IS THE ONE SECRET IN THIS SERVICE THAT IS STORED RECOVERABLY, AND THIS SCREEN
 * SAYS SO RATHER THAN IMPLYING OTHERWISE.
 *
 * `webhook_secrets` holds plaintext, because "HMAC is not a one-way function of an input we do not
 * have: signing a delivery requires the secret itself" (`devplatform/src/migrations.ts:44-51`). It
 * is still shown once — no route returns it afterwards (`devplatform/src/webhooks.ts:147`) — but
 * saying it is hashed like an API key would be false. `WEBHOOK_SECRET_NOTE` in src/lib/format.ts is
 * the wording, and it is deliberately different from `SHOWN_ONCE`.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ── Two facts about disabling, both read off the service ──────────────────────────────────────
 *
 * `POST /v1/webhook-endpoints/:id/disable` passes `true` unconditionally
 * (`devplatform/src/server.ts:944`). It is not a toggle and there is no route that re-enables an
 * endpoint. So the control is labelled "Disable" rather than drawn as a switch, and the screen says
 * what the way back actually is: delete it and register it again, which mints a new secret.
 * Reported.
 */
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Empty, Failed, Loading, Note } from '../components/states.tsx'
import { Identifier, StateBadge } from '../components/tone.tsx'
import { Replayed, ShownOnce } from '../components/once.tsx'
import { useResource } from '../lib/resource.ts'
import { useIdempotentMutation, useMutation } from '../lib/mutation.ts'
import { deliveryState, when, WEBHOOK_SECRET_NOTE } from '../lib/format.ts'
import {
  createEndpoint,
  deleteEndpoint,
  disableEndpoint,
  listDeliveries,
  listEndpoints,
  rotateEndpointSecret,
  KEY_ENVIRONMENTS,
  type CreatedEndpoint,
  type KeyEnvironment,
  type RotatedSecret,
} from '../lib/devplatform.ts'

/**
 * The attempt ceiling, which is NOT on the wire.
 *
 * `DEVPLATFORM_WEBHOOK_MAX_ATTEMPTS` defaults to 8 (`devplatform/src/env.ts:215`) and no route
 * returns it, so this bundle cannot know the deployed value. It is used only to tell "still
 * retrying" from "abandoned" in the delivery list, and the screen says the number it assumed rather
 * than presenting it as fact — a client asserting a configured value it cannot read is exactly the
 * shape of claim this estate keeps having to correct.
 */
const ASSUMED_MAX_ATTEMPTS = 8

export function WebhooksPage() {
  const { id = '' } = useParams()
  const endpoints = useResource(
    (signal) => listEndpoints(id, signal),
    (data) => data.endpoints.length,
    'The webhook endpoints could not be loaded.',
    [id],
  )

  return (
    <>
      <h2 className="dp-h2">Webhook endpoints</h2>
      <NewEndpoint projectId={id} onCreated={endpoints.reload} />

      {endpoints.state === 'loading' && <Loading label="Reading the endpoints" />}
      {(endpoints.state === 'failed' || endpoints.state === 'forbidden') && endpoints.error && (
        <Failed notice={endpoints.error} onRetry={endpoints.reload} />
      )}
      {endpoints.state === 'empty' && (
        <Empty
          title="No webhook endpoints"
          hint="Register one above to have events delivered to your own service."
        />
      )}
      {endpoints.state === 'ok' && endpoints.data && (
        <ul className="dp-cards">
          {endpoints.data.endpoints.map((endpoint) => (
            <li className="dp-card" key={endpoint.id}>
              <h3 className="dp-card__title">
                <Identifier value={endpoint.url} />
              </h3>
              <p className="dp-card__meta">
                {endpoint.topics.join(', ')} · created {when(endpoint.createdAt)}
                {endpoint.disabledAt !== null && ` · disabled ${when(endpoint.disabledAt)}`}
              </p>
              {endpoint.description && <p className="dp-card__tagline">{endpoint.description}</p>}
              <EndpointControls
                id={endpoint.id}
                disabled={endpoint.disabledAt !== null}
                onChanged={endpoints.reload}
              />
              <Deliveries endpointId={endpoint.id} />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

/**
 * Register an endpoint.
 *
 * **Wrapped, so an `Idempotency-Key` is required** (`devplatform/src/server.ts:884`).
 *
 * Four refusals are the service's and are surfaced verbatim rather than pre-empted with a guess in
 * this bundle: https only with no loopback or link-local (`devplatform/src/webhooks.ts:106-136`,
 * which exists because an unchecked subscriber URL is a server-side request forgery primitive), at
 * least one topic and no wildcard topic (`devplatform/src/webhooks.ts:157-165`), and one endpoint
 * per `(environment, url)` (`devplatform/src/webhooks.ts:172-180`).
 */
function NewEndpoint({ projectId, onCreated }: { projectId: string; onCreated: () => void }) {
  const [url, setUrl] = useState('')
  const [topics, setTopics] = useState('')
  const [description, setDescription] = useState('')
  const [environment, setEnvironment] = useState<KeyEnvironment>('test')
  const [created, setCreated] = useState<CreatedEndpoint | null>(null)

  const register = useIdempotentMutation(async (key: string) => {
    const result = await createEndpoint(
      projectId,
      {
        environment,
        url,
        topics: topics
          .split(/[\s,]+/)
          .map((topic) => topic.trim())
          .filter((topic) => topic.length > 0),
        description,
      },
      key,
    )
    setCreated(result)
    return result
  }, 'The endpoint could not be registered.')

  return (
    <>
      <Note tone="warn">{WEBHOOK_SECRET_NOTE}</Note>
      <form
        className="dp-form"
        onSubmit={(event) => {
          event.preventDefault()
          void register.run().then((result) => {
            if (!result) return
            setUrl('')
            setTopics('')
            setDescription('')
            onCreated()
          })
        }}
      >
        <label className="dp-field">
          <span className="dp-field__label">URL</span>
          <input
            className="dp-input cf-num"
            value={url}
            onChange={(event) => setUrl(event.currentTarget.value)}
            required
          />
          <span className="dp-field__help">
            Absolute https. Loopback and link-local addresses are refused: this service dials the
            address from inside its own network, so an unchecked one would let a customer aim it at
            infrastructure that is not theirs.
          </span>
        </label>
        <label className="dp-field">
          <span className="dp-field__label">Topics</span>
          <input
            className="dp-input cf-num"
            value={topics}
            onChange={(event) => setTopics(event.currentTarget.value)}
            required
          />
          <span className="dp-field__help">
            Separated by spaces or commas. At least one, and there is no wildcard — an endpoint that
            received everything by default is an endpoint nobody meant to subscribe.
          </span>
        </label>
        <fieldset className="dp-fieldset">
          <legend className="dp-field__label">Environment</legend>
          {KEY_ENVIRONMENTS.map((candidate) => (
            <label className="dp-check" key={candidate}>
              <input
                type="radio"
                name="endpoint-environment"
                value={candidate}
                checked={environment === candidate}
                onChange={() => setEnvironment(candidate)}
              />
              {candidate}
            </label>
          ))}
        </fieldset>
        <label className="dp-field">
          <span className="dp-field__label">Description</span>
          <input
            className="dp-input"
            value={description}
            onChange={(event) => setDescription(event.currentTarget.value)}
          />
        </label>
        <button type="submit" className="cf-btn cf-btn--primary" disabled={register.busy}>
          {register.busy ? 'Registering…' : 'Register endpoint'}
        </button>
      </form>

      {register.error && <Failed notice={register.error} title="That endpoint was not registered" />}

      {created?.secret && (
        <ShownOnce
          kind="signing secret"
          secret={created.secret}
          note={WEBHOOK_SECRET_NOTE}
          label={created.endpoint.url}
          onAcknowledge={() => setCreated(null)}
        />
      )}
      {created && created.secret === null && (
        <>
          <Replayed kind="endpoint" label={created.endpoint.url} />
          <button type="button" className="cf-btn" onClick={() => setCreated(null)}>
            Understood
          </button>
        </>
      )}
    </>
  )
}

/** Rotate, disable and delete, for one endpoint. */
function EndpointControls({
  id,
  disabled,
  onChanged,
}: {
  id: string
  disabled: boolean
  onChanged: () => void
}) {
  const [rotated, setRotated] = useState<RotatedSecret | null>(null)

  const rotate = useIdempotentMutation(async (key: string) => {
    const result = await rotateEndpointSecret(id, key)
    setRotated(result)
    return result
  }, 'The secret could not be rotated.')

  const turnOff = useMutation(() => disableEndpoint(id), 'The endpoint could not be disabled.')
  const remove = useMutation(() => deleteEndpoint(id), 'The endpoint could not be deleted.')

  return (
    <div className="dp-toolbar">
      <button
        type="button"
        className="cf-btn"
        disabled={rotate.busy}
        onClick={() => void rotate.run()}
      >
        {rotate.busy ? 'Rotating…' : 'Rotate secret'}
      </button>
      {!disabled && (
        <button
          type="button"
          className="cf-btn"
          disabled={turnOff.busy}
          onClick={() => void turnOff.run().then((result) => result && onChanged())}
        >
          {turnOff.busy ? 'Disabling…' : 'Disable'}
        </button>
      )}
      <button
        type="button"
        className="cf-btn cf-btn--danger"
        disabled={remove.busy}
        onClick={() => void remove.run().then((result) => result && onChanged())}
      >
        {remove.busy ? 'Deleting…' : 'Delete'}
      </button>

      {disabled && (
        <Note tone="warn">
          Disabled endpoints stay disabled: this platform has no route that re-enables one. To
          receive events at this address again, delete it and register it — which mints a new signing
          secret you will have to deploy.
        </Note>
      )}

      {rotate.error && <Failed notice={rotate.error} title="The secret was not rotated" />}
      {turnOff.error && <Failed notice={turnOff.error} title="That was not disabled" />}
      {remove.error && <Failed notice={remove.error} title="That was not deleted" />}

      {rotated?.secret && (
        <ShownOnce
          kind="signing secret"
          secret={rotated.secret}
          note={WEBHOOK_SECRET_NOTE}
          onAcknowledge={() => {
            setRotated(null)
            onChanged()
          }}
        >
          <p className="dp-once__extra">
            {/*
              The overlap is the number a rotation screen exists to print. `overlapMinutes` comes
              from the response (`devplatform/src/server.ts:931`), not from a constant here, because
              it is a deployed configuration value (`DEVPLATFORM_WEBHOOK_ROTATION_OVERLAP_MINUTES`,
              `devplatform/src/env.ts:213`) and a screen that guessed it would cause the outage it
              exists to prevent.
            */}
            The previous secret keeps verifying for another {rotated.overlapMinutes} minutes, so
            deploy this one before then. After that, deliveries signed with the old secret will not
            verify.
          </p>
        </ShownOnce>
      )}
      {rotated && rotated.secret === null && (
        <>
          <Replayed kind="rotation" />
          <button type="button" className="cf-btn" onClick={() => setRotated(null)}>
            Understood
          </button>
        </>
      )}
    </div>
  )
}

/**
 * The delivery log for one endpoint.
 *
 * The newest 50 (`devplatform/src/webhooks.ts:536-539`). **An abandoned delivery is not a pending
 * one**, and the distinction is the whole reason this list is worth rendering: a row past the
 * attempt ceiling is retained rather than deleted "because the row is the only record that a
 * customer was sent an event and never took it" (`devplatform/src/server.ts:248-253`), so it sits
 * here for ever and would read as "still trying" without the badge.
 */
function Deliveries({ endpointId }: { endpointId: string }) {
  const deliveries = useResource(
    (signal) => listDeliveries(endpointId, signal),
    (data) => data.deliveries.length,
    'The deliveries could not be loaded.',
    [endpointId],
  )

  return (
    <details className="dp-details">
      <summary className="dp-details__summary">Recent deliveries</summary>
      {deliveries.state === 'loading' && <Loading label="Reading the deliveries" />}
      {(deliveries.state === 'failed' || deliveries.state === 'forbidden') && deliveries.error && (
        <Failed notice={deliveries.error} onRetry={deliveries.reload} />
      )}
      {deliveries.state === 'empty' && (
        <Empty
          title="Nothing has been delivered here"
          hint="No event matching this endpoint’s topics has been produced since it was registered."
        />
      )}
      {deliveries.state === 'ok' && deliveries.data && (
        <div className="dp-tablewrap">
          <table className="dp-table">
            <caption className="dp-table__caption">
              The newest fifty. “Abandoned” assumes the default attempt ceiling of{' '}
              {ASSUMED_MAX_ATTEMPTS}; the deployed value is not on the wire, so this is the one
              number on this page that is inferred rather than read.
            </caption>
            <thead>
              <tr>
                <th scope="col">State</th>
                <th scope="col">Topic</th>
                <th scope="col">Attempts</th>
                <th scope="col">Last status</th>
                <th scope="col">Next attempt</th>
                <th scope="col">Last error</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.data.deliveries.map((delivery) => (
                <tr key={delivery.id}>
                  <td>
                    <StateBadge tone={deliveryState(delivery, ASSUMED_MAX_ATTEMPTS)} />
                  </td>
                  <td>
                    <code className="cf-num">{delivery.topic}</code>
                  </td>
                  <td>{delivery.attempts}</td>
                  <td>{delivery.lastStatus ?? '—'}</td>
                  <td>{delivery.deliveredAt ? '—' : when(delivery.nextAttemptAt)}</td>
                  <td>{delivery.lastError ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </details>
  )
}
