/**
 * Webhook endpoints: register one, rotate its secret, disable it, delete it, read its deliveries.
 *
 * Five routes, and one of them returns a secret twice as often as any other in this service — a
 * rotation. `POST /v1/webhook-endpoints/:id/rotate-secret` (`devplatform/src/server.ts`) is
 * wrapped for the reason the service states in that handler's own comment: a retry without the
 * wrapper "mints a
 * second secret and retires the one the customer has just been shown but has not yet deployed".
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * A WEBHOOK SECRET IS THE ONE SECRET IN THIS SERVICE THAT IS STORED RECOVERABLY, AND THIS SCREEN
 * SAYS SO RATHER THAN IMPLYING OTHERWISE.
 *
 * `webhook_secrets` holds plaintext, because "HMAC is not a one-way function of an input we do not
 * have: signing a delivery requires the secret itself" (`devplatform/src/migrations.ts`). It
 * is still shown once — no route returns it afterwards (`devplatform/src/webhooks.ts`) — but
 * saying it is hashed like an API key would be false. `WEBHOOK_SECRET_NOTE` in src/lib/format.ts is
 * the wording, and it is deliberately different from `SHOWN_ONCE`.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ── DISABLE AND ENABLE ARE TWO BUTTONS, NEVER ONE SWITCH ──────────────────────────────────────
 *
 * This screen used to say "there is no route that re-enables one", and it was right: `/disable`
 * passed `true` unconditionally and had no inverse, so the only way back was to DELETE the
 * endpoint — new signing secret, delivery history gone, subscriber redeploys, during the incident
 * the endpoint was disabled for. That was reported and
 * `POST /v1/webhook-endpoints/:id/enable` (`devplatform/src/server.ts`) is the answer.
 *
 * It is still not drawn as a toggle. The service made it two verbs on purpose
 * (`devplatform/src/server.ts`): "a client that inverted the flag would silently do the
 * opposite of what its operator intended". One of these stops a customer's integration and the
 * other starts it, and a switch makes them look equally consequential.
 *
 * **Nothing is replayed on re-enabling**, and the screen says so, because the opposite is the
 * reasonable assumption. `enqueueDeliveries` selects `where e.disabled_at is null`
 * (`devplatform/src/webhooks.ts`), so while the endpoint was off nothing was queued for it —
 * an operator waiting for the backlog to arrive would wait for ever.
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
  enableEndpoint,
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
 * `DEVPLATFORM_WEBHOOK_MAX_ATTEMPTS` defaults to 8 (`devplatform/src/env.ts`) and no route
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
    'The endpoint list did not come back.',
    [id],
  )

  return (
    <>
      <h2 className="dp-h2">Webhook endpoints</h2>
      <p className="dp-para">
        Rather than polling us, give us an address and we will post events to it as they happen.
        Each delivery is signed, retried on a widening interval when your service does not answer,
        and recorded below whether it landed or not.
      </p>
      <NewEndpoint projectId={id} onCreated={endpoints.reload} />

      {endpoints.state === 'loading' && <Loading label="Fetching the endpoints" />}
      {(endpoints.state === 'failed' || endpoints.state === 'forbidden') && endpoints.error && (
        <Failed notice={endpoints.error} onRetry={endpoints.reload} />
      )}
      {endpoints.state === 'empty' && (
        <Empty
          title="Nothing is subscribed in this project"
          hint="No address has been registered, so events happen and go nowhere. Use the form above to point us at your service."
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
                {endpoint.topics.join(', ')} · registered {when(endpoint.createdAt)}
                {endpoint.disabledAt !== null && ` · switched off ${when(endpoint.disabledAt)}`}
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
 * **Wrapped, so an `Idempotency-Key` is required** (`devplatform/src/server.ts`).
 *
 * Four refusals are the service's and are surfaced verbatim rather than pre-empted with a guess in
 * this bundle: https only with no loopback or link-local (`devplatform/src/webhooks.ts`,
 * which exists because an unchecked subscriber URL is a server-side request forgery primitive), at
 * least one topic and no wildcard topic (`devplatform/src/webhooks.ts`), and one endpoint
 * per `(environment, url)` (`devplatform/src/webhooks.ts`).
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
  }, 'The platform refused to register this address.')

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
            className="cf-input cf-num"
            value={url}
            onChange={(event) => setUrl(event.currentTarget.value)}
            required
          />
          <span className="dp-field__help">
            A full https address. Loopback and link-local ranges are rejected, and the reason is
            worth stating: we open this connection from inside our own network, so accepting any
            address you typed would let one customer point our servers at machines belonging to
            somebody else.
          </span>
        </label>
        <label className="dp-field">
          <span className="dp-field__label">Topics</span>
          <input
            className="cf-input cf-num"
            value={topics}
            onChange={(event) => setTopics(event.currentTarget.value)}
            required
          />
          <span className="dp-field__help">
            Split them with spaces or commas, and name at least one. No pattern stands for “all of
            them”: an endpoint that quietly picked up every future event type is one nobody
            deliberately signed up for.
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
            className="cf-input"
            value={description}
            onChange={(event) => setDescription(event.currentTarget.value)}
          />
        </label>
        <button type="submit" className="cf-btn cf-btn--primary" disabled={register.busy}>
          {register.busy ? 'Registering…' : 'Register endpoint'}
        </button>
      </form>

      {register.error && (
        <Failed notice={register.error} title="No endpoint was registered, and nothing changed" />
      )}

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

/**
 * Rotate, disable, enable and delete, for one endpoint.
 *
 * **Exactly one of Disable and Enable is drawn, chosen by `disabledAt`.** Not both greyed, and not
 * a switch: the service is two routes rather than a boolean precisely so that a client cannot
 * invert the meaning, and a control that renders both actions at once invites the mis-click the
 * two-verb design exists to prevent.
 */
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
  }, 'The rotation did not happen. Keep signing with the secret you have.')

  const turnOff = useMutation(
    () => disableEndpoint(id),
    'The service did not switch this endpoint off.',
  )
  const turnOn = useMutation(
    () => enableEndpoint(id),
    'The service did not switch this endpoint back on.',
  )
  const remove = useMutation(() => deleteEndpoint(id), 'The service did not remove this endpoint.')

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
      {disabled ? (
        <button
          type="button"
          className="cf-btn cf-btn--primary"
          disabled={turnOn.busy}
          onClick={() => void turnOn.run().then((result) => result && onChanged())}
        >
          {turnOn.busy ? 'Enabling…' : 'Enable'}
        </button>
      ) : (
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
          Nothing is being sent to this address. <strong>Enable</strong> brings it back exactly as
          it was: same URL, same signing secret, same delivery history.{' '}
          <strong>There is no backlog waiting for you.</strong> Anything that happened while the
          endpoint was off was never queued for it, so it will not turn up once you switch it on —
          the gap has to be closed from your own records.
        </Note>
      )}

      {rotate.error && (
        <Failed notice={rotate.error} title="Your existing signing secret is untouched" />
      )}
      {turnOff.error && (
        <Failed notice={turnOff.error} title="This endpoint is still receiving deliveries" />
      )}
      {turnOn.error && (
        <Failed notice={turnOn.error} title="This endpoint is still switched off" />
      )}
      {remove.error && <Failed notice={remove.error} title="The endpoint is still here" />}

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
              from the response (`devplatform/src/server.ts`), not from a constant here, because
              it is a deployed configuration value (`DEVPLATFORM_WEBHOOK_ROTATION_OVERLAP_MINUTES`,
              `devplatform/src/env.ts`) and a screen that guessed it would cause the outage it
              exists to prevent.
            */}
            You have {rotated.overlapMinutes} minutes during which signatures from the old secret
            are still honoured. Get this value into your service inside that window. Once it closes,
            anything your code verifies with the previous secret will be rejected.
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
 * The newest 50 (`devplatform/src/webhooks.ts`). **An abandoned delivery is not a pending
 * one**, and the distinction is the whole reason this list is worth rendering: a row past the
 * attempt ceiling is retained rather than deleted "because the row is the only record that a
 * customer was sent an event and never took it" (`devplatform/src/server.ts`), so it sits
 * here for ever and would read as "still trying" without the badge.
 */
function Deliveries({ endpointId }: { endpointId: string }) {
  const deliveries = useResource(
    (signal) => listDeliveries(endpointId, signal),
    (data) => data.deliveries.length,
    'The delivery log did not come back.',
    [endpointId],
  )

  return (
    <details className="dp-details">
      <summary className="dp-details__summary">Delivery log</summary>
      {deliveries.state === 'loading' && <Loading label="Fetching the delivery log" />}
      {(deliveries.state === 'failed' || deliveries.state === 'forbidden') && deliveries.error && (
        <Failed notice={deliveries.error} onRetry={deliveries.reload} />
      )}
      {deliveries.state === 'empty' && (
        <Empty
          title="We have never had anything to send here"
          hint="Since this endpoint was registered, no event matching its topics has occurred. An empty log points at the topics you chose, not at a delivery problem."
        />
      )}
      {deliveries.state === 'ok' && deliveries.data && (
        <div className="dp-tablewrap">
          <table className="dp-table">
            <caption className="dp-table__caption">
              The fifty most recent attempts. Whether a row reads “Abandoned” depends on the attempt
              ceiling, and we assume the default of {ASSUMED_MAX_ATTEMPTS} because the running value
              is not returned to a browser. Every other figure in this table was read from the
              service; that one is a guess, and it is the only one.
            </caption>
            <thead>
              <tr>
                <th scope="col">State</th>
                <th scope="col">Topic</th>
                <th scope="col">Tries</th>
                <th scope="col">Your reply</th>
                <th scope="col">Next try</th>
                <th scope="col">What went wrong</th>
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
