/**
 * The `devplatform` surface, as this app is allowed to use it.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * EVERY ROUTE BELOW WAS READ OUT OF `devplatform/src/server.ts`, ONE AT A TIME, AND CARRIES THE
 * LINE IT WAS READ FROM.
 *
 * Not inferred from a sibling client, and not copied from `@cloudsforge/sdk` — which could not
 * have supplied it anyway: `sdk/openapi.json` carries 52 paths and **not one of them belongs to
 * devplatform**. The public SDK and the `cloudsforge` CLI cannot issue, list or revoke a key, and
 * they say so themselves (`sdk/packages/sdk/src/credentials.ts` and `sdk/packages/cli/src/run.ts`
 * both record "devplatform does not exist yet"). It does exist. That is reported, not worked
 * around here.
 *
 * `devplatform` registers its routes through one `define(method, path, handler)` list
 * (`devplatform/src/server.ts`), so the surface is enumerable and the citations are
 * stable. `test/devplatform.test.ts` reads that file and fails if any line below is not the line
 * that registers the route, and CI bends a citation to prove the check can go red.
 *
 * **Every line below moved at `micro-devplatform@e13c154`**, by between +108 and +296 — not by a
 * constant, so each was re-derived from a diff-replayed line map rather than shifted by hand. Four
 * routes appeared in the same commit and are accounted for below, two of them because this file
 * reported the gaps they close.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * **HOW EACH ROUTE AUTHENTICATES — NOT MERELY WHETHER, AND THIS SERVICE IS WHY.**
 *
 * There is no middleware. `handle()` (`devplatform/src/server.ts`) dispatches straight
 * into each route's own closure, so authentication is whatever that closure calls. And **not one
 * of the 35 `/v1` handlers contains a literal `await authenticate(ctx, deps)`.** That call appears
 * exactly three times in the whole file and never inside a route:
 *
 *   * `authenticateUser`   — `devplatform/src/server.ts`
 *   * `authenticateKeyOnly`— `devplatform/src/server.ts`
 *   * `authoriseProject`   — `devplatform/src/server.ts`
 *
 * `micro-worlds-web`'s route test greps each handler body for `await authenticate(ctx, deps)` and
 * asserts a boolean. Run against this service that check declares **all thirty-five routes public**,
 * including the twenty-nine that are not — a client built on its answer would put no bearer on a
 * key-issuing route and would put the credential screens outside the session gate. So the table
 * below records the MECHANISM, one of ten, and `test/devplatform.test.ts` matches the handler
 * against the mechanism rather than against a boolean.
 *
 * The ten, and what each admits:
 *
 *   `none`        No credential is read. The handler takes no principal.
 *   `key`         `authenticateKeyOnly` — an API key ONLY. A user JWT is a 403.
 *   `user+admin`  `authenticateUser` plus `permits(role, ADMIN_ROLES)` against identity.
 *   `user+member` `authenticateUser` plus `permits(role, READ_ROLES)` against identity, for the
 *                 IDENTITY organisation named in the query rather than a developer one.
 *   `org:read` / `org:write`
 *                 `authoriseOrg(ctx, deps, id, …)` — a USER token only, whose
 *                 role in the identity organisation is asked of identity per request.
 *   `project:read` / `project:write`
 *                 `authoriseProject(ctx, deps, id, …)` — a user token OR an API key. A
 *                 key may act only within its own project, because the project id is read from the
 *                 ROW and never from the request.
 *   `operator`    `requireOperator` — a SERVICE token carrying the exact scope
 *                 `devplatform:admin`, or a user token with the platform role `admin`.
 *                 **A browser can never hold the scope**: `devplatform:admin` is deliberately absent
 *                 from `devplatform/src/scopes.ts`, so `validateScopes` refuses it at issuance
 *                 and no API key row can carry it. A signed-in CloudsForge platform admin WOULD
 *                 satisfy it with their user token, which is exactly why the two operator routes are
 *                 declined below on judgement rather than on a 403.
 *   `operator-or-lower`
 *                 `PUT /v1/projects/:id/quotas` alone, and the direction is the authority. See its
 *                 wrapper for the whole rule.
 *   `hmac`        A signature over the raw bytes, checked before `JSON.parse`.
 *
 * ── CALLED ────────────────────────────────────────────────────────────────────────────────────
 *
 * | Method   | Path                                       | Authenticates    | Verified at                       |
 * | -------- | ------------------------------------------ | ---------------- | --------------------------------- |
 * | `GET`    | `/v1/scopes`                               | **none**         | `devplatform/src/server.ts`   |
 * | `POST`   | `/v1/organisations`                        | `user+admin`     | `devplatform/src/server.ts`   |
 * | `GET`    | `/v1/organisations`                        | `user+member`    | `devplatform/src/server.ts`   |
 * | `GET`    | `/v1/organisations/:id`                    | `org:read`       | `devplatform/src/server.ts`   |
 * | `GET`    | `/v1/organisations/:id/projects`           | `org:read`       | `devplatform/src/server.ts`   |
 * | `POST`   | `/v1/projects`                             | `org:write`      | `devplatform/src/server.ts`   |
 * | `GET`    | `/v1/projects/:id`                         | `project:read`   | `devplatform/src/server.ts`   |
 * | `POST`   | `/v1/projects/:id/service-accounts`        | `project:write`  | `devplatform/src/server.ts`   |
 * | `GET`    | `/v1/projects/:id/service-accounts`        | `project:read`   | `devplatform/src/server.ts`   |
 * | `POST`   | `/v1/projects/:id/keys`                    | `project:write`  | `devplatform/src/server.ts`   |
 * | `GET`    | `/v1/projects/:id/keys`                    | `project:read`   | `devplatform/src/server.ts`   |
 * | `DELETE` | `/v1/keys/:id`                             | `project:write`  | `devplatform/src/server.ts`   |
 * | `PUT`    | `/v1/projects/:id/quotas`                  | `operator-or-lower` | `devplatform/src/server.ts`  |
 * | `GET`    | `/v1/projects/:id/quotas`                  | `project:read`   | `devplatform/src/server.ts`  |
 * | `GET`    | `/v1/projects/:id/usage`                   | `project:read`   | `devplatform/src/server.ts`  |
 * | `POST`   | `/v1/projects/:id/webhook-endpoints`       | `project:write`  | `devplatform/src/server.ts`  |
 * | `GET`    | `/v1/projects/:id/webhook-endpoints`       | `project:read`   | `devplatform/src/server.ts`  |
 * | `POST`   | `/v1/webhook-endpoints/:id/rotate-secret`  | `project:write`  | `devplatform/src/server.ts`  |
 * | `POST`   | `/v1/webhook-endpoints/:id/disable`        | `project:write`  | `devplatform/src/server.ts`  |
 * | `POST`   | `/v1/webhook-endpoints/:id/enable`         | `project:write`  | `devplatform/src/server.ts`  |
 * | `DELETE` | `/v1/webhook-endpoints/:id`                | `project:write`  | `devplatform/src/server.ts`  |
 * | `GET`    | `/v1/webhook-endpoints/:id/deliveries`     | `project:read`   | `devplatform/src/server.ts`  |
 * | `POST`   | `/v1/projects/:id/oauth-clients`           | `project:write`  | `devplatform/src/server.ts`  |
 * | `GET`    | `/v1/projects/:id/oauth-clients`           | `project:read`   | `devplatform/src/server.ts`  |
 * | `DELETE` | `/v1/oauth-clients/:id`                    | `project:write`  | `devplatform/src/server.ts`  |
 * | `GET`    | `/v1/apps`                                 | **none**         | `devplatform/src/server.ts`  |
 * | `GET`    | `/v1/apps/:slug`                           | **none**         | `devplatform/src/server.ts`  |
 * | `PUT`    | `/v1/projects/:id/application`             | `project:write`  | `devplatform/src/server.ts`  |
 * | `GET`    | `/v1/projects/:id/application`             | `project:read`   | `devplatform/src/server.ts`  |
 * | `POST`   | `/v1/projects/:id/application/submit`      | `project:write`  | `devplatform/src/server.ts`  |
 *
 * ── DECLINED, EACH FOR A STATED REASON ────────────────────────────────────────────────────────
 *
 * Declined is a first-class entry rather than an omission: `test/devplatform.test.ts` requires
 * this file to account for EVERY `/v1` route the service registers, so a route that grows and is
 * never read cannot go quiet.
 *
 * | Method | Path                                  | Verified at                      | Why not here |
 * | ------ | ------------------------------------- | -------------------------------- | ------------ |
 * | `GET`  | `/v1/keys/self`                       | `devplatform/src/server.ts`  | The whoami for a MACHINE credential. `authenticateKeyOnly` refuses anything that is not a `cfk_…` string, so the user JWT this bundle holds is a 403 — and the only way to satisfy it would be for a browser to hold a live API key, which is the one thing this product exists to stop happening. It is the SDK's route, not the console's. |
 * | `GET`  | `/v1/keys/:id`                        | `devplatform/src/server.ts`  | It answers the identical `ApiKeySummary` (`devplatform/src/apikeys.ts`) that `GET /v1/projects/:id/keys` already returns for every key in the project, and this app has no per-key address. A second read of a row the console is already holding is a request that can only disagree with itself. |
 * | `GET`  | `/v1/apps/pending`                    | `devplatform/src/server.ts` | **An operator route, and this is a customer console.** It lists every OTHER customer's unpublished submission (`devplatform/src/applications.ts` filters `GET /v1/apps` to `listed`; this one does the opposite), keyed on nothing the reader owns. A CloudsForge platform admin signing in here with the `admin` role would get a 200 — which is precisely the argument for not drawing it: a control that works for one class of reader and 403s for every other reader of the same screen teaches the wrong thing about who this product is for. The reviewer's queue belongs on the operator surface, next to the decision it feeds. |
 * | `PUT`  | `/v1/projects/:id/application/status` | `devplatform/src/server.ts` | **The route this file asked for, and it must not be called from here.** It closes the "nothing can approve a submitted application" finding — `setApplicationStatus` was imported and called by nothing — and the service states the reason it is an operator's: "A directory a developer can publish to unilaterally is a directory that eventually hosts a phishing page wearing this platform's chrome", with the OAuth consent screen a user reads rendered from exactly this row. A submitting party holding the approving control is the defect, not the fix. Declined here, and the closure is recorded rather than left implied. |
 * | `POST` | `/v1/events`                          | `devplatform/src/server.ts` | The internal inbox. It is HMAC-checked over the exact bytes received BEFORE `JSON.parse` against `DEVPLATFORM_INGEST_SECRETS`. A browser cannot hold that secret, and a bundle that shipped it would BE the revoke-anybody's-credentials endpoint the check exists to prevent (`devplatform/src/env.ts`). |
 *
 * `/livez`, `/readyz` and `/metrics` are served as well, and so are
 * three `/internal` routes — `POST /internal/keys/verify`, `POST /internal/oauth/verify`
 * and `POST /internal/usage`. None is reachable from a browser:
 * `deploy/gateway/dynamic/policy.yml` refuses any path matching `^/+internal(/|$)` at
 * priority 100000 and routes it to an unreachable upstream. They are not wrapped here and they are
 * not in the tables above, which cover `/v1` only.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ── A MALFORMED ID IS A 500 UPSTREAM, SO THIS CLIENT NEVER SENDS ONE ──────────────────────────
 *
 * `ctx.params['id']` goes straight into a comparison against a `uuid` column on every route that
 * predates `requireUuid` (`devplatform/src/server.ts`), and Postgres answers `22P02
 * invalid input syntax for type uuid`, which arrives at the client as **`500 internal`**. So
 * `GET /v1/projects/not-a-uuid` reports a server fault for a typed URL. Changing the status code of
 * every shipped route is devplatform's decision to make and is reported there, not worked around
 * here — but a console whose addresses ARE those ids can simply never send one, and `assertUuid`
 * below is how: every wrapper taking an id refuses a non-uuid before the request is built, with a
 * sentence that says the address is wrong rather than that the platform is broken.
 *
 * ── A SECRET IS SHOWN ONCE, AND THE DATABASE IS WHAT MAKES THAT TRUE ──────────────────────────
 *
 * Four routes return a credential, and each returns it exactly once:
 *
 *   * `POST /v1/projects/:id/keys` → `secretKey`, plus the service's own sentence in `note`
 *     (`devplatform/src/server.ts`)
 *   * `POST /v1/projects/:id/webhook-endpoints` → `secret`
 *   * `POST /v1/webhook-endpoints/:id/rotate-secret` → `secret`
 *   * `POST /v1/projects/:id/oauth-clients` → `clientSecret`
 *
 * **There is no route that returns any of them a second time, and for an API key there is no
 * column one could be read back from.** `api_keys` has no secret column at all: `secret_algo`,
 * `secret_salt` and `secret_hash` are a one-way function of the key, and the CHECK constraint
 * `api_keys_slow_kdf_only` (`devplatform/src/migrations.ts`) refuses any row whose recorded
 * algorithm is not a scrypt encoding — `^scrypt\$N=…,r=…,p=…,keyLen=…$`. `oauth_clients` carries
 * the same constraint (`devplatform/src/migrations.ts`). The comment above it says what it is
 * for in one line: "the day someone reaches for createHash because it is one line shorter, this is
 * what stops it" (`devplatform/src/migrations.ts`).
 *
 * So this app may never draw a "show key" control, a "reveal" toggle or a "copy again" affordance,
 * and it may never word a message as though the secret could be recovered by support. It cannot
 * be, by anybody, including the people who run the platform. `src/components/once.tsx` is how that
 * is presented, and `test/render.test.ts` refuses the vocabulary that would imply otherwise.
 *
 * **The one honest exception, stated rather than hidden.** A webhook signing secret IS stored
 * recoverably, because HMAC is not a one-way function of an input the service does not have:
 * signing a delivery requires the secret itself (`devplatform/src/migrations.ts`). It is
 * still shown once — no route returns it afterwards (`devplatform/src/webhooks.ts`) — and
 * rotation keeps the old one verifying for an overlap window. This app says that, in those words,
 * rather than implying a webhook secret is hashed like a key.
 *
 * ── A REPLAY RETURNS `null` WHERE THE SECRET WAS, AND THAT IS SUCCESS, NOT FAILURE ────────────
 *
 * All four are wrapped in `withIdempotentRoute`, and the stored idempotency response deliberately
 * carries the METADATA only. The secret is re-attached to the FIRST response and nowhere else
 * (`devplatform/src/server.ts`), so a replay answers `200` with `replayed: true` and
 * `secretKey: null`. A client that read the null as an error would tell a developer their key had
 * failed to be created when it exists and is live. Every one of the four wrappers below returns
 * the null verbatim, and the screens render it as what it is.
 */
import { api, ApiError } from './api.ts'
import { idempotently } from './idempotency.ts'

/* ══════════════════════════════ ids never leave here malformed ══════════════════════════════ */

/** RFC 4122, matching `devplatform/src/server.ts`'s own `UUID` test. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Refuse a path segment that is not a uuid, BEFORE the request exists.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE UPSTREAM BEHAVIOUR THIS EXISTS FOR, STATED WHERE A READER NEEDS IT.
 *
 * Every route on this surface that takes an `:id` compares it against a `uuid` column, and all but
 * the two operator routes added at `micro-devplatform@e13c154` pass `ctx.params['id']` straight
 * through. Postgres answers `22P02 invalid input syntax for type uuid`, which is not caught, so
 * `GET /v1/projects/not-a-uuid` arrives here as **`500 internal`** rather than a 400 or a 404. The
 * service says so itself and declines to change it in the same commit
 * (`devplatform/src/server.ts`) — reported there, and correctly a separate decision.
 *
 * The addresses of this console ARE those ids: `/projects/<uuid>/keys` is what a developer
 * bookmarks and what they mistype. So this bundle simply never sends one, and a mistyped address
 * gets a sentence about the address instead of a sentence about the platform. A 500 in that
 * situation would send somebody to the status page over their own typo.
 *
 * `ApiError(0, …)` rather than a plain `Error`: every failure surface in this app reads `ApiError`
 * (`src/lib/api.ts`), and a bare throw would render as the generic fallback with no
 * sentence. Status 0 is this app's "the request never went out", which is exactly what happened.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
function assertUuid(value: string, what: string): string {
  if (!UUID.test(value)) {
    throw new ApiError(
      0,
      `That ${what} is not a valid id, so no request was sent. Check the address in the bar — ` +
        'ids are 36 characters with four hyphens.',
      'malformed_id',
    )
  }
  return value
}

/* ══════════════════════════════ the wire shapes ══════════════════════════════ */

/** `devplatform/src/orgs.ts`. A developer organisation is an ENROLMENT of an identity one. */
export interface DeveloperOrg {
  readonly id: string
  readonly identityOrgId: string
  readonly name: string
  readonly slug: string
  readonly status: 'active' | 'suspended'
  readonly createdAt: string
}

/** `devplatform/src/keys.ts`. Two environments, and both are ROWS — see `Environment`. */
export const KEY_ENVIRONMENTS = ['live', 'test'] as const
export type KeyEnvironment = (typeof KEY_ENVIRONMENTS)[number]

/** `devplatform/src/orgs.ts`. */
export interface Environment {
  readonly id: string
  readonly projectId: string
  readonly name: KeyEnvironment
}

/**
 * `devplatform/src/orgs.ts`.
 *
 * A project is created WITH both environments in one transaction (`devplatform/src/orgs.ts`)
 * and with its default quotas in the same commit (`devplatform/src/server.ts`), so there is
 * no state in which a project exists with nowhere to put a key or with an unmetered first request.
 */
export interface Project {
  readonly id: string
  readonly orgId: string
  readonly name: string
  readonly slug: string
  readonly status: 'active' | 'archived'
  readonly createdAt: string
  readonly environments: readonly Environment[]
}

/** `devplatform/src/apikeys.ts`. */
export interface ServiceAccount {
  readonly id: string
  readonly projectId: string
  readonly name: string
  readonly description: string
  readonly disabledAt: string | null
  readonly createdAt: string
}

/**
 * What a key looks like to everyone after the moment it is created —
 * `devplatform/src/apikeys.ts`.
 *
 * **There is no `secret`, no `secretKey` and no `hash` field on this type, in the service or
 * here.** `display` is `cfk_<environment>_<lookup>` and is safe in a log, a list and a support
 * ticket; it is also what a revocation is quoted by.
 */
export interface ApiKeySummary {
  readonly id: string
  readonly projectId: string
  readonly environmentId: string
  readonly environment: KeyEnvironment
  readonly serviceAccountId: string | null
  readonly display: string
  readonly lookupId: string
  readonly name: string
  readonly scopes: readonly string[]
  readonly createdBy: string
  readonly createdAt: string
  readonly lastUsedAt: string | null
  readonly expiresAt: string | null
  readonly revokedAt: string | null
  readonly revokedReason: string | null
}

/** One entry of the public scope vocabulary — `devplatform/src/scopes.ts`. */
export interface ScopeSpec {
  readonly name: string
  readonly service: string
  readonly kind: 'read' | 'write'
  readonly description: string
}

/** `devplatform/src/webhooks.ts`. */
export interface WebhookEndpoint {
  readonly id: string
  readonly projectId: string
  readonly environmentId: string
  readonly url: string
  readonly topics: readonly string[]
  readonly description: string
  readonly disabledAt: string | null
  readonly createdAt: string
}

/** `devplatform/src/webhooks.ts`. */
export interface Delivery {
  readonly id: string
  readonly endpointId: string
  readonly eventId: string
  readonly topic: string
  readonly payload: Record<string, unknown>
  readonly attempts: number
  readonly deliveredAt: string | null
  readonly lastStatus: number | null
  readonly lastError: string | null
  readonly nextAttemptAt: string
}

/** `devplatform/src/oauth.ts`. The secret is not on this type; see the header. */
export interface OAuthClient {
  readonly id: string
  readonly projectId: string
  readonly clientId: string
  readonly name: string
  readonly redirectUris: readonly string[]
  readonly scopes: readonly string[]
  readonly createdAt: string
  readonly revokedAt: string | null
}

/** `devplatform/src/quotas.ts`. Four windows; `minute` is the burst control, `month` the plan. */
export const PERIODS = ['minute', 'hour', 'day', 'month'] as const
export type Period = (typeof PERIODS)[number]

/** `devplatform/src/quotas.ts`. */
export interface Quota {
  readonly id: string
  readonly projectId: string
  readonly environmentId: string
  readonly meter: string
  readonly period: Period
  readonly maxUnits: number
}

/** One live window, as `currentUsage` renders it — `devplatform/src/quotas.ts`. */
export interface QuotaWindow {
  readonly period: Period
  readonly used: number
  readonly limit: number
}

/**
 * An hourly usage bucket — `devplatform/src/quotas.ts`.
 *
 * `GET /v1/projects/:id/usage` reads `usage_rollups`, never the raw events
 * (`devplatform/src/quotas.ts`). Raw events are pruned at 35 days and the rollups at 400
 * (`devplatform/src/env.ts`), so a gap in this list at the older end is retention rather
 * than a quiet week — and `devplatform/src/env.ts` refuses a configuration that would let
 * a rollup expire before the events it summarises.
 */
export interface UsageRollup {
  readonly environmentId: string
  readonly route: string
  readonly bucket: string
  readonly calls: number
  readonly errors: number
}

/**
 * `devplatform/src/applications.ts`. **Five now, not four.**
 *
 * `rejected` arrived with the operator route and is a status of its own rather than a reuse of
 * `delisted`, because the two are different facts: `delisted` is a listing that was public and was
 * taken down, `rejected` is one that never went up. `submitForReview` accepts `rejected` as a
 * source (`devplatform/src/applications.ts`), so one reviewer's "no" is not permanent and
 * this app must render it as a state a developer can act on rather than as an ending.
 */
export const APPLICATION_STATUSES = ['draft', 'in_review', 'listed', 'rejected', 'delisted'] as const
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number]

/** `devplatform/src/applications.ts`. */
export interface Application {
  readonly id: string
  readonly projectId: string
  readonly slug: string
  readonly name: string
  readonly tagline: string
  readonly description: string
  readonly homepageUrl: string | null
  readonly status: ApplicationStatus
  readonly listedAt: string | null
  readonly createdAt: string
}

/* ══════════════════════════════ the public calls ══════════════════════════════ */

/**
 * `GET /v1/scopes` — `devplatform/src/server.ts`.
 *
 * **Makes no authentication call of any kind**, and `devplatform/src/server.ts` says why:
 * the vocabulary "is a property of the platform rather than of any customer, and a developer
 * choosing scopes before they have a key is exactly who needs it". Sent with `auth: false` — not
 * because a token would be refused, but because attaching one to a route that never asked for it
 * is how a client ends up reasoning about the wrong failure.
 *
 * `wildcard` is `null` and the `note` says there is no wildcard scope. Both are on the wire on
 * purpose: "I'll just use the wildcard" is the first thing a developer tries, and a
 * wildcard is refused at issuance (`devplatform/src/scopes.ts`) AND by the database
 * (`devplatform/src/migrations.ts`).
 */
export interface ScopeVocabulary {
  readonly scopes: readonly ScopeSpec[]
  readonly wildcard: null
  readonly note: string
}

export function getScopes(signal?: AbortSignal): Promise<ScopeVocabulary> {
  return api<ScopeVocabulary>('/v1/scopes', { auth: false, ...(signal ? { signal } : {}) })
}

/**
 * `GET /v1/apps` — `devplatform/src/server.ts`.
 *
 * **Public.** `listDirectory` filters to `status = 'listed'` INSIDE the query rather than at the
 * caller (`devplatform/src/applications.ts`), so a draft listing — including one written
 * to probe what the directory will render — cannot reach this response by a caller forgetting a
 * filter. `limit` is clamped to 500.
 */
export function listDirectory(
  opts: { limit?: number; signal?: AbortSignal } = {},
): Promise<{ applications: readonly Application[] }> {
  return api<{ applications: readonly Application[] }>('/v1/apps', {
    auth: false,
    ...(opts.limit ? { query: { limit: opts.limit } } : {}),
    ...(opts.signal ? { signal: opts.signal } : {}),
  })
}

/**
 * `GET /v1/apps/:slug` — `devplatform/src/server.ts`.
 *
 * **Public**, and it answers 404 for anything not `listed`: `findListedApplication` carries the
 * status filter in its own query (`devplatform/src/applications.ts`). So a 404 here means
 * "there is no listed application at that slug" and never "you may not see it" — this app must not
 * render it as a permission failure.
 */
export function getApplicationBySlug(
  slug: string,
  signal?: AbortSignal,
): Promise<{ application: Application }> {
  return api<{ application: Application }>(`/v1/apps/${encodeURIComponent(slug)}`, {
    auth: false,
    ...(signal ? { signal } : {}),
  })
}

/* ══════════════════════════════ organisations ══════════════════════════════ */

/**
 * `GET /v1/organisations` — `devplatform/src/server.ts`.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * **THE READ THAT CLOSES THIS FILE'S OWN FINDING: A MUTATION WAS BEING USED AS A QUERY.**
 *
 * Until `micro-devplatform@e13c154` the service served no route that resolved an identity
 * organisation to its developer-platform enrolment. `findOrgByIdentityId`
 * (`devplatform/src/orgs.ts`) existed and was reachable only from the event inbox
 * (`devplatform/src/server.ts`), and `GET /v1/organisations/:id` wants the DEVELOPER id,
 * which a console that has never enrolled has no way to learn. So this app asked "which
 * organisation am I in?" by re-POSTing the idempotent enrolment and reading what came back —
 * harmless, because `on conflict do nothing` really is idempotent, and still a write issued to ask
 * a question. That is now a read, and the enrolment control below is a control that only enrols.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * `user+member`: a user token, whose membership of the IDENTITY organisation is asked of identity
 * with the caller's own token BEFORE the row is read. **It cannot enumerate** —
 * `identityOrgId` is required and a missing one is a 400 saying so, and a non-member
 * gets the same 404 identity itself gives, so this route is not an oracle for organisations
 * identity hides.
 *
 * **An empty list is not a 404 and the difference is the whole point.** A member of an organisation
 * that has never been enrolled gets `200 { organisations: [] }`: "you are in this company
 * and it has no developer platform presence yet" is an enrolment button, whereas a 404 is a dead
 * end. The screen renders the two differently for that reason.
 *
 * The array carries at most one entry — the lookup key is unique (`developer_orgs_identity_uniq`).
 * It is returned as a list rather than an object so that the shape does not have to change if the
 * route ever grows a real listing; this client reads `[0]` and says so.
 */
export function resolveOrganisation(
  identityOrgId: string,
  signal?: AbortSignal,
): Promise<{ organisations: readonly DeveloperOrg[] }> {
  return api<{ organisations: readonly DeveloperOrg[] }>('/v1/organisations', {
    query: { identityOrgId },
    ...(signal ? { signal } : {}),
  })
}

/**
 * `POST /v1/organisations` — `devplatform/src/server.ts`.
 *
 * Enrolment is idempotent on `identity_org_id` by construction — `on conflict do nothing` then
 * read (`devplatform/src/orgs.ts`) — which is why the route is exempt from the idempotency
 * wrapper (`devplatform/src/routeidempotency.test.ts`) and why this app sends no
 * `Idempotency-Key` here. It is no longer used as a lookup: `resolveOrganisation` above is the read.
 *
 * **The caller must already be an owner or an admin of the identity organisation.** The role is
 * asked of identity per request with the user's own token forwarded, so this is not a
 * claim the browser makes. Without that check any authenticated user could enrol any organisation
 * id they could guess and become the owner of its developer platform presence — the comment
 * above `authenticateUser`'s membership check says exactly that.
 *
 * `name` and `slug` are only used on the FIRST enrolment. A second call with a different name
 * returns the original row unchanged, because `do nothing` did nothing — so this screen must never
 * present enrolment as a way to rename.
 */
export interface EnrolInput {
  readonly identityOrgId: string
  readonly name: string
  readonly slug: string
}

export function enrolOrganisation(input: EnrolInput): Promise<{ organisation: DeveloperOrg }> {
  return api<{ organisation: DeveloperOrg }>('/v1/organisations', { method: 'POST', body: input })
}

/**
 * `GET /v1/organisations/:id` — `devplatform/src/server.ts`.
 *
 * `authoriseOrg(ctx, deps, id, 'read')`, which is a USER token only and any of
 * the five organisation roles (`devplatform/src/membership.ts`). A caller with no role gets
 * **404, not 403** — the same answer as an id that does not exist, on purpose, so
 * developer organisation ids are not enumerable across customers. This app must therefore never
 * render a 404 here as "that organisation belongs to somebody else".
 */
export function getOrganisation(
  id: string,
  signal?: AbortSignal,
): Promise<{ organisation: DeveloperOrg }> {
  return api<{ organisation: DeveloperOrg }>(`/v1/organisations/${encodeURIComponent(assertUuid(id, 'organisation id'))}`, {
    ...(signal ? { signal } : {}),
  })
}

/** `GET /v1/organisations/:id/projects` — `devplatform/src/server.ts`. `org:read`, as above. */
export function listProjects(
  orgId: string,
  signal?: AbortSignal,
): Promise<{ projects: readonly Project[] }> {
  return api<{ projects: readonly Project[] }>(
    `/v1/organisations/${encodeURIComponent(assertUuid(orgId, 'organisation id'))}/projects`,
    { ...(signal ? { signal } : {}) },
  )
}

/**
 * `POST /v1/projects` — `devplatform/src/server.ts`.
 *
 * `authoriseOrg(ctx, deps, orgId, 'write')` — owner or admin only
 * (`devplatform/src/membership.ts`), and the organisation id comes from the BODY rather than the
 * path.
 *
 * **Wrapped, so an `Idempotency-Key` is required and a POST without one is a 400.** The project,
 * its two environments and its default quotas are one commit: "a project that exists
 * with no quota row is a project whose first request is unmetered".
 */
export interface CreateProjectInput {
  readonly orgId: string
  readonly name: string
  readonly slug: string
}

export function createProject(
  input: CreateProjectInput,
  key: string,
): Promise<{ project: Project; replayed: boolean }> {
  return api<{ project: Project; replayed: boolean }>('/v1/projects', {
    method: 'POST',
    body: input,
    headers: idempotently(key),
  })
}

/* ══════════════════════════════ one project ══════════════════════════════ */

/**
 * `GET /v1/projects/:id` — `devplatform/src/server.ts`.
 *
 * `authoriseProject(ctx, deps, id, 'read')`. A project the caller cannot see is **404 rather than
 * 403**: "A 403 confirms the id exists, which makes project ids enumerable across
 * customers."
 */
export function getProject(id: string, signal?: AbortSignal): Promise<{ project: Project }> {
  return api<{ project: Project }>(`/v1/projects/${encodeURIComponent(assertUuid(id, 'project id'))}`, {
    ...(signal ? { signal } : {}),
  })
}

/**
 * `POST /v1/projects/:id/service-accounts` — `devplatform/src/server.ts`.
 *
 * Not wrapped, and the reason is a constraint rather than a hope: `service_accounts_name_uniq`
 * makes `(project, name)` the natural key and `createServiceAccount` is `on conflict do nothing`
 * then read, so a retry returns the FIRST account rather than creating a second
 * (`devplatform/src/server.ts`). This client sends no `Idempotency-Key` here; the service
 * reads none on this route and would answer 400 for a header it does not want only if the wrapper
 * were present, which it is not.
 */
export function createServiceAccount(
  projectId: string,
  input: { name: string; description?: string },
): Promise<{ serviceAccount: ServiceAccount }> {
  return api<{ serviceAccount: ServiceAccount }>(
    `/v1/projects/${encodeURIComponent(assertUuid(projectId, 'project id'))}/service-accounts`,
    { method: 'POST', body: input },
  )
}

/** `GET /v1/projects/:id/service-accounts` — `devplatform/src/server.ts`. `project:read`. */
export function listServiceAccounts(
  projectId: string,
  signal?: AbortSignal,
): Promise<{ serviceAccounts: readonly ServiceAccount[] }> {
  return api<{ serviceAccounts: readonly ServiceAccount[] }>(
    `/v1/projects/${encodeURIComponent(assertUuid(projectId, 'project id'))}/service-accounts`,
    { ...(signal ? { signal } : {}) },
  )
}

/* ══════════════════════════════ keys ══════════════════════════════ */

/**
 * `POST /v1/projects/:id/keys` — `devplatform/src/server.ts`.
 *
 * **The one route in this service that returns a usable credential**, and the one place in this
 * app where a secret is ever held in memory.
 *
 * `project:write`. Wrapped, so an `Idempotency-Key` is REQUIRED and the wrapper is load-bearing
 * rather than decorative — `devplatform/src/server.ts`: "a double-clicked 'Create key'
 * without it mints two credentials, and the second is one the developer never sees and therefore
 * never revokes — a live key with no owner."
 *
 * ── The three fields of the answer, and why each matters ──────────────────────────────────────
 *
 *   `key`        the `ApiKeySummary`. Always present.
 *   `secretKey`  the full `cfk_…` string, or **null on a replay**. Null is a success:
 *                the work did not run because it had already run, and the secret was shown then.
 *   `note`       the service's own sentence, attached only when a secret was actually minted
 *               : "This is the only time this secret is shown. It is stored under
 *                scrypt and cannot be recovered." It is rendered VERBATIM rather than paraphrased.
 *   `replayed`   `true` when the stored response was returned.
 *
 * ── What the request may carry ────────────────────────────────────────────────────────────────
 *
 * `environment` must be `live` or `test` (`devplatform/src/server.ts`, `devplatform/src/keys.ts`).
 * `scopes` is an
 * array of strings and is REFUSED rather than filtered if any is unknown
 * (`devplatform/src/scopes.ts`) — a caller told "created" for a key missing an authority it
 * asked for would discover otherwise at the worst possible moment. An EMPTY scope array is legal
 * and produces a completely inert credential (`devplatform/src/scopes.ts`), which is worth
 * offering: it is provable that a key can exist and grant nothing.
 *
 * The idempotency fingerprint is `{projectId, environment, scopes, name}`, so changing the
 * name and retrying with the SAME key is a 409 `idempotency_key_reuse` rather than a second key.
 * See src/lib/idempotency.ts for when the key is kept and when it is thrown away.
 */
export interface IssueKeyInput {
  readonly environment: KeyEnvironment
  readonly scopes: readonly string[]
  readonly name?: string
  readonly serviceAccountId?: string | null
  /** ISO 8601. `devplatform/src/server.ts` parses it and 400s on anything else. */
  readonly expiresAt?: string | null
}

export interface IssuedKey {
  readonly key: ApiKeySummary
  /** Null on a replay. NEVER an error, and never persisted anywhere by this app. */
  readonly secretKey: string | null
  /** The service's own sentence, present only when a secret was minted. */
  readonly note?: string
  readonly replayed: boolean
}

export function issueKey(projectId: string, input: IssueKeyInput, key: string): Promise<IssuedKey> {
  return api<IssuedKey>(`/v1/projects/${encodeURIComponent(assertUuid(projectId, 'project id'))}/keys`, {
    method: 'POST',
    body: input,
    headers: idempotently(key),
  })
}

/**
 * `GET /v1/projects/:id/keys` — `devplatform/src/server.ts`.
 *
 * `project:read`. Revoked keys are EXCLUDED unless `includeRevoked=true`, and only the exact
 * string `'true'` turns it on. A revoked key is kept for ever rather than deleted — the
 * row is the record that a credential existed — so this app offers the toggle instead of hiding
 * the history.
 */
export function listKeys(
  projectId: string,
  opts: { includeRevoked?: boolean; signal?: AbortSignal } = {},
): Promise<{ keys: readonly ApiKeySummary[] }> {
  return api<{ keys: readonly ApiKeySummary[] }>(
    `/v1/projects/${encodeURIComponent(assertUuid(projectId, 'project id'))}/keys`,
    {
      ...(opts.includeRevoked ? { query: { includeRevoked: 'true' } } : {}),
      ...(opts.signal ? { signal: opts.signal } : {}),
    },
  )
}

/**
 * `DELETE /v1/keys/:id` — `devplatform/src/server.ts`.
 *
 * `project:write`, resolved from the KEY's own project row rather than from the request.
 *
 * Idempotent by definition and by claim: `revokeApiKey` updates `where revoked_at is null`, so a
 * second call preserves the first call's time and reason and emits no second event.
 * The answer says which happened — `alreadyRevoked` — and this app renders the difference rather
 * than reporting both as "done".
 *
 * `reason` is a QUERY parameter, not a body field. Revocation is immediate here; the
 * edge is where it becomes immediate for a caller, and `11-data-and-contract-strategy.md`
 * records a 30-second validation cache there. This app says that number rather than
 * implying the key stops working in the same instant everywhere.
 */
export function revokeKey(
  id: string,
  reason: string,
): Promise<{ key: ApiKeySummary; alreadyRevoked: boolean }> {
  return api<{ key: ApiKeySummary; alreadyRevoked: boolean }>(
    `/v1/keys/${encodeURIComponent(assertUuid(id, 'key id'))}`,
    { method: 'DELETE', ...(reason ? { query: { reason } } : {}) },
  )
}

/* ══════════════════════════════ quotas and usage ══════════════════════════════ */

/**
 * `GET /v1/projects/:id/quotas` — `devplatform/src/server.ts`.
 *
 * `project:read`. The answer is two things: the configured `quotas` rows, and `current` — the LIVE
 * window state per environment NAME, each entry a list of `{period, used, limit}`.
 *
 * The counter behind `used` is a Postgres row, not a process variable, and
 * `quota_windows_within_limit` makes exceeding it a constraint violation rather than a race that
 * usually does not happen (`devplatform/src/migrations.ts`). So this number is the estate's
 * and not one replica's, and the screen may state it as a fact.
 */
export interface QuotaReport {
  readonly quotas: readonly Quota[]
  /** Keyed by environment NAME — `live` and `test`. */
  readonly current: Readonly<Record<string, readonly QuotaWindow[]>>
}

export function getQuotas(projectId: string, signal?: AbortSignal): Promise<QuotaReport> {
  return api<QuotaReport>(`/v1/projects/${encodeURIComponent(assertUuid(projectId, 'project id'))}/quotas`, {
    ...(signal ? { signal } : {}),
  })
}

/**
 * `GET /v1/projects/:id/usage` — `devplatform/src/server.ts`.
 *
 * `project:read`. `limit` defaults to 200 and is clamped to 1000, and the window defaults
 * to the last seven days inside the query (`devplatform/src/quotas.ts`) — this route takes no
 * `since` parameter, so a screen cannot ask for more history than that. Said out loud, because an
 * empty list here means "nothing in seven days", not "no usage ever".
 */
export function listUsage(
  projectId: string,
  opts: { limit?: number; signal?: AbortSignal } = {},
): Promise<{ usage: readonly UsageRollup[] }> {
  return api<{ usage: readonly UsageRollup[] }>(
    `/v1/projects/${encodeURIComponent(assertUuid(projectId, 'project id'))}/usage`,
    {
      ...(opts.limit ? { query: { limit: opts.limit } } : {}),
      ...(opts.signal ? { signal: opts.signal } : {}),
    },
  )
}

/**
 * `PUT /v1/projects/:id/quotas` — `devplatform/src/server.ts`. **Lowering only.**
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THIS FILE DECLINED THIS ROUTE, AND THE REASON IT GAVE NO LONGER HOLDS.
 *
 * The old entry said: it is `project:write`, `setQuota` accepts any whole number ≥ 1 with no
 * ceiling, and so a customer could set the limit that binds them. That was true, it was reported,
 * and `micro-devplatform@e13c154` fixed it — worse than reported, because any API KEY in the
 * project carrying `devplatform:write` could do it too.
 *
 * **The direction is now the authority**:
 *
 *   LOWER or HOLD   `project:write`. A retry writing the same value is permitted deliberately —
 *                   PUT is idempotent by natural key and a 403 on the second attempt would make
 *                   the route's idempotency exemption a lie.
 *   RAISE           an operator, and a browser cannot be one. `devplatform:admin` is absent from
 *                   `devplatform/src/scopes.ts`, so no key can hold it.
 *   CREATE          an operator, because a MISSING row is UNLIMITED rather than zero: `quotasFor`
 *                   returns nothing and `consumeAll` over an empty list allows everything. Writing
 *                   a finite value where there was no row is a reduction only in appearance.
 *
 * So a "lower my limit" control is now a control this console SHOULD offer, and declining it would
 * be declining a customer's own safety feature. A developer capping a test environment so a
 * runaway loop cannot burn their month's allowance is doing the platform's work for it, and making
 * that need an operator means nobody ever does it.
 *
 * **The direction is checked HERE as well, before the request exists**, and that is not
 * duplication for its own sake: the service's refusal is the authority, and a console that let a
 * developer type a bigger number, submit it, and read a 403 would be teaching them that the
 * control is broken. `current` is the value already on the wire from `getQuotas`, so no extra read
 * is needed to know the direction. `assertLower` throws the same `ApiError` shape every failure
 * surface in this app already renders.
 *
 * A raise that somehow reached the wire would still be refused upstream — that is the point of
 * checking in both places, and `test/devplatform.test.ts` asserts the service's half rather than
 * trusting this one.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * The reply carries `ceiling` — `MAX_UNITS_CEILING[period]`, the schema's own bound from
 * `quotas_max_within_ceiling` — so a screen can print the number the service would refuse above
 * rather than paraphrasing it.
 */
export interface LoweredQuota {
  readonly quota: Quota
  /** The schema ceiling for this period. Not reachable from here; shown, not enforced. */
  readonly ceiling: number
}

export function lowerQuota(
  projectId: string,
  input: { environment: KeyEnvironment; period: Period; maxUnits: number; current: number },
): Promise<LoweredQuota> {
  if (!Number.isInteger(input.maxUnits) || input.maxUnits < 1) {
    // `quotas_max_positive` refuses zero at the database too, and the service says why: a quota of
    // zero is a suspension, which is a status on the organisation rather than a limit on a meter.
    throw new ApiError(
      0,
      'A limit is a whole number of at least 1. A limit of zero would be a suspension, which is ' +
        'not something this control can do.',
      'invalid_quota',
    )
  }
  if (input.maxUnits > input.current) {
    throw new ApiError(
      0,
      `This control only lowers a limit. The ${input.period} limit is ${input.current}; raising it ` +
        'is a decision CloudsForge makes, so ask us rather than setting it here.',
      'quota_raise_refused',
    )
  }
  return api<LoweredQuota>(
    `/v1/projects/${encodeURIComponent(assertUuid(projectId, 'project id'))}/quotas`,
    {
      method: 'PUT',
      body: { environment: input.environment, period: input.period, maxUnits: input.maxUnits },
    },
  )
}

/* ══════════════════════════════ webhooks ══════════════════════════════ */

/**
 * `POST /v1/projects/:id/webhook-endpoints` — `devplatform/src/server.ts`.
 *
 * `project:write`. **Wrapped, so an `Idempotency-Key` is required.** Returns `secret` — shown once,
 * `null` on a replay.
 *
 * The service refuses more than this app could usefully validate, and each refusal is worth
 * surfacing verbatim rather than pre-empting with a guess:
 *
 *   * **https only, and no loopback or link-local** (`devplatform/src/webhooks.ts`). A
 *     subscriber URL is a destination this service dials from inside the application network, so
 *     an unchecked one is a server-side request forgery primitive — a customer registering
 *     `https://169.254.169.254/…` would have the instance metadata endpoint fetched for them.
 *   * **At least one topic, and no wildcard topic** (`devplatform/src/webhooks.ts`): "an
 *     endpoint that receives everything by default is an endpoint nobody meant to subscribe".
 *   * **One endpoint per `(environment, url)`** (`devplatform/src/webhooks.ts`).
 */
export interface CreateEndpointInput {
  readonly environment: KeyEnvironment
  readonly url: string
  readonly topics: readonly string[]
  readonly description?: string
}

export interface CreatedEndpoint {
  readonly endpoint: WebhookEndpoint
  /** Shown once. Null on a replay. */
  readonly secret: string | null
  readonly replayed: boolean
}

export function createEndpoint(
  projectId: string,
  input: CreateEndpointInput,
  key: string,
): Promise<CreatedEndpoint> {
  return api<CreatedEndpoint>(`/v1/projects/${encodeURIComponent(assertUuid(projectId, 'project id'))}/webhook-endpoints`, {
    method: 'POST',
    body: input,
    headers: idempotently(key),
  })
}

/** `GET /v1/projects/:id/webhook-endpoints` — `devplatform/src/server.ts`. `project:read`. */
export function listEndpoints(
  projectId: string,
  signal?: AbortSignal,
): Promise<{ endpoints: readonly WebhookEndpoint[] }> {
  return api<{ endpoints: readonly WebhookEndpoint[] }>(
    `/v1/projects/${encodeURIComponent(assertUuid(projectId, 'project id'))}/webhook-endpoints`,
    { ...(signal ? { signal } : {}) },
  )
}

/**
 * `POST /v1/webhook-endpoints/:id/rotate-secret` — `devplatform/src/server.ts`.
 *
 * `project:write`, resolved from the ENDPOINT's own project row. **Wrapped**, and the
 * reason is stated in the handler's own comment: a retry without it "mints a second secret and
 * retires the one the
 * customer has just been shown but has not yet deployed".
 *
 * The answer carries `overlapMinutes` — how long the OLD secret keeps verifying
 * (`devplatform/src/env.ts`, default 1440). This app prints that number, because a rotation
 * screen that does not say when the old secret dies is a rotation screen that causes an outage.
 */
export interface RotatedSecret {
  readonly endpointId: string
  readonly overlapMinutes: number
  /** Shown once. Null on a replay. */
  readonly secret: string | null
  readonly replayed: boolean
}

export function rotateEndpointSecret(id: string, key: string): Promise<RotatedSecret> {
  return api<RotatedSecret>(`/v1/webhook-endpoints/${encodeURIComponent(assertUuid(id, 'endpoint id'))}/rotate-secret`, {
    method: 'POST',
    headers: idempotently(key),
  })
}

/**
 * `POST /v1/webhook-endpoints/:id/disable` — `devplatform/src/server.ts`.
 *
 * `project:write`. Not wrapped, and it does not need to be: it is a state transition writing a
 * fixed value, so the second attempt writes the same value. The handler passes
 * `true` unconditionally and `enableEndpoint` below passes `false` — **two
 * verbs, never one boolean**, and the service says why: "a client that inverted the
 * flag would silently do the opposite of what its operator intended". So this app draws two
 * buttons, and never a switch.
 */
export function disableEndpoint(id: string): Promise<{ endpoint: WebhookEndpoint }> {
  return api<{ endpoint: WebhookEndpoint }>(
    `/v1/webhook-endpoints/${encodeURIComponent(assertUuid(id, 'endpoint id'))}/disable`,
    { method: 'POST' },
  )
}

/**
 * `POST /v1/webhook-endpoints/:id/enable` — `devplatform/src/server.ts`.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * **THE INVERSE THIS FILE REPORTED MISSING, AND WHY IT MATTERS SO MUCH.**
 *
 * Until `micro-devplatform@e13c154` `/disable` had no opposite. The only way back was to DELETE
 * the endpoint and register it again — which mints a new signing secret, drops the delivery
 * history, and requires the subscriber to redeploy. An endpoint is disabled DURING an incident,
 * which is exactly the hour in which "you must now rotate your webhook secret" is the worst
 * available answer. It is a route now, and the screen offers it.
 *
 * `project:write`, resolved from the ENDPOINT's own project row. Not wrapped, for the
 * same reason as `/disable`: a fixed value written twice is the same row.
 *
 * **Deliveries enqueued while it was disabled are NOT replayed**, and the service states it
 * because the opposite is the reasonable assumption: `enqueueDeliveries` selects
 * `where e.disabled_at is null` (`devplatform/src/webhooks.ts`), so nothing was ever queued.
 * An operator who expected a flood on re-enabling would wait for one that never comes, and this
 * app says so on the screen rather than leaving it to be discovered.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
export function enableEndpoint(id: string): Promise<{ endpoint: WebhookEndpoint }> {
  return api<{ endpoint: WebhookEndpoint }>(
    `/v1/webhook-endpoints/${encodeURIComponent(assertUuid(id, 'endpoint id'))}/enable`,
    { method: 'POST' },
  )
}

/** `DELETE /v1/webhook-endpoints/:id` — `devplatform/src/server.ts`. `project:write`. */
export function deleteEndpoint(id: string): Promise<{ deleted: boolean }> {
  return api<{ deleted: boolean }>(`/v1/webhook-endpoints/${encodeURIComponent(assertUuid(id, 'endpoint id'))}`, {
    method: 'DELETE',
  })
}

/**
 * `GET /v1/webhook-endpoints/:id/deliveries` — `devplatform/src/server.ts`.
 *
 * `project:read`. The newest 50 (`devplatform/src/webhooks.ts`). A row with
 * `deliveredAt: null` and a climbing `attempts` is a delivery still being retried; one past the
 * attempt ceiling is ABANDONED and is retained rather than deleted, "because the row is the only
 * record that a customer was sent an event and never took it"
 * (`devplatform/src/server.ts`). This screen must therefore never present an old
 * undelivered row as merely pending.
 */
export function listDeliveries(
  endpointId: string,
  signal?: AbortSignal,
): Promise<{ deliveries: readonly Delivery[] }> {
  return api<{ deliveries: readonly Delivery[] }>(
    `/v1/webhook-endpoints/${encodeURIComponent(assertUuid(endpointId, 'endpoint id'))}/deliveries`,
    { ...(signal ? { signal } : {}) },
  )
}

/* ══════════════════════════════ oauth clients ══════════════════════════════ */

/**
 * `POST /v1/projects/:id/oauth-clients` — `devplatform/src/server.ts`.
 *
 * `project:write`. **Wrapped, so an `Idempotency-Key` is required.** Returns `clientSecret` — shown
 * once, `null` on a replay. There is no column it could be read back from: the secret is
 * hashed exactly as an API key's is, under the same `oauth_clients_slow_kdf_only` constraint
 * (`devplatform/src/migrations.ts`).
 *
 * **Every redirect URI must be absolute https, or http on loopback for development, with no
 * fragment and no wildcard** (`devplatform/src/oauth.ts`), and the schema says the same
 * thing in a CHECK (`devplatform/src/migrations.ts`). The comment there names the stake:
 * a wildcard or relative redirect "is an open redirect that hands an authorisation code to whoever
 * asked for it, and it is the single most exploited misconfiguration in OAuth deployments".
 */
export interface RegisterClientInput {
  readonly name: string
  readonly redirectUris: readonly string[]
  readonly scopes: readonly string[]
}

export interface RegisteredClient {
  readonly client: OAuthClient
  /** Shown once. Null on a replay. */
  readonly clientSecret: string | null
  readonly replayed: boolean
}

export function registerClient(
  projectId: string,
  input: RegisterClientInput,
  key: string,
): Promise<RegisteredClient> {
  return api<RegisteredClient>(`/v1/projects/${encodeURIComponent(assertUuid(projectId, 'project id'))}/oauth-clients`, {
    method: 'POST',
    body: input,
    headers: idempotently(key),
  })
}

/** `GET /v1/projects/:id/oauth-clients` — `devplatform/src/server.ts`. `project:read`. */
export function listClients(
  projectId: string,
  signal?: AbortSignal,
): Promise<{ clients: readonly OAuthClient[] }> {
  return api<{ clients: readonly OAuthClient[] }>(
    `/v1/projects/${encodeURIComponent(assertUuid(projectId, 'project id'))}/oauth-clients`,
    { ...(signal ? { signal } : {}) },
  )
}

/**
 * `DELETE /v1/oauth-clients/:id` — `devplatform/src/server.ts`.
 *
 * `project:write`, resolved from the client's own `project_id`. `revokeClient` uses
 * `coalesce(revoked_at, now())` (`devplatform/src/routeidempotency.test.ts`), so a second
 * call preserves the first revocation's time. The row survives revocation, which is why the list
 * above returns `revokedAt` rather than dropping it.
 */
export function revokeClient(id: string): Promise<{ client: OAuthClient }> {
  return api<{ client: OAuthClient }>(`/v1/oauth-clients/${encodeURIComponent(assertUuid(id, 'client id'))}`, {
    method: 'DELETE',
  })
}

/* ══════════════════════════════ the directory listing ══════════════════════════════ */

/**
 * `PUT /v1/projects/:id/application` — `devplatform/src/server.ts`.
 *
 * `project:write`. An upsert on `project_id` — one listing per project — so a retry updates rather
 * than conflicts, which is why it is exempt from the wrapper.
 *
 * **Editing a LISTED application does not un-list it and does not send it back for review**, and
 * `devplatform/src/applications.ts` states that as a deliberate, arguable choice: "re-review
 * on every copy change would mean a typo fix takes a human, and the practical consequence of that
 * is developers who never fix typos." This screen says so, because a developer who believes an
 * edit will re-trigger review will not make one.
 */
export interface UpsertApplicationInput {
  readonly slug: string
  readonly name: string
  readonly tagline?: string
  readonly description?: string
  readonly homepageUrl?: string | null
}

export function upsertApplication(
  projectId: string,
  input: UpsertApplicationInput,
): Promise<{ application: Application }> {
  return api<{ application: Application }>(
    `/v1/projects/${encodeURIComponent(assertUuid(projectId, 'project id'))}/application`,
    { method: 'PUT', body: input },
  )
}

/**
 * `GET /v1/projects/:id/application` — `devplatform/src/server.ts`.
 *
 * `project:read`. **404 is the normal answer for a project that has never written one**,
 * so this app renders that 404 as an invitation rather than as a failure. It is the one place in
 * this client where a 404 is an expected outcome of a correct request.
 */
export function getApplication(
  projectId: string,
  signal?: AbortSignal,
): Promise<{ application: Application }> {
  return api<{ application: Application }>(
    `/v1/projects/${encodeURIComponent(assertUuid(projectId, 'project id'))}/application`,
    { ...(signal ? { signal } : {}) },
  )
}

/**
 * `POST /v1/projects/:id/application/submit` — `devplatform/src/server.ts`.
 *
 * `project:write`. A state transition claimed with `where status in (…)`, so the second attempt
 * matches no row — which is why it needs no wrapper and why a double click cannot
 * produce two reviews.
 *
 * **The reviewer's side now exists**, and this file's `REVIEW_GAP` is closed.
 * `setApplicationStatus` (`devplatform/src/applications.ts`) was imported by the server
 * (`devplatform/src/server.ts`) and called by no route, so a listing could be submitted and
 * never approved. `PUT /v1/projects/:id/application/status` is the route that completes
 * it and `GET /v1/apps/pending` is the queue that makes a submission findable. Both are
 * operator routes and both are DECLINED above: a console for the submitting party must not hold
 * the approving control.
 *
 * So a submission now waits for a person rather than for a route, and this screen says which.
 * `submitForReview` also accepts `rejected` as a source (`devplatform/src/applications.ts`),
 * so a rejected listing can be edited and sent back — the developer is not at a dead end.
 */
export function submitApplication(projectId: string): Promise<{ application: Application }> {
  return api<{ application: Application }>(
    `/v1/projects/${encodeURIComponent(assertUuid(projectId, 'project id'))}/application/submit`,
    { method: 'POST' },
  )
}

/* ══════════════════════════════ the gaps, as data ══════════════════════════════ */

/**
 * A limit of the platform as it stands, written for the developer who would otherwise meet it
 * three days into an integration.
 *
 * It used to carry two more fields, both of which were RENDERED: `citations`, a list of repository
 * paths under each entry, and `closes`, what would settle it. The first is provenance for whoever
 * fixes it and the second is a roadmap note; neither is something the developer reading this page
 * can act on, and between them they turned a useful warning into an internal audit published on a
 * product's front page. What that developer needs is the limit and what to do about it, so that is
 * what a finding says now — and the provenance is kept in the comments around each entry below.
 */
export interface KnownGap {
  /** A stable id, used as the test's handle on this entry. */
  readonly id: string
  readonly title: string
  /** What is true today. Written as a finding, never as "coming soon". */
  readonly finding: string
}

/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * `GATEWAY_GAP` WAS HERE, AND IT IS CLOSED. IT IS NOT KEPT AS A CLOSED ENTRY.
 *
 * It said: "the public API gateway registers routers for pricing, activity, foresight, identity,
 * wallet, market, mint and worlds, and for nothing else — so a key issued here works against no
 * public host." Both halves of what it asked for now exist. `deploy/gateway/dynamic/public-api.yml`
 * declares `cf-api-devplatform`, matching `/v1/apps`, `/v1/keys`, `/v1/oauth-clients`,
 * `/v1/organisations`, `/v1/projects`, `/v1/scopes` and `/v1/webhook-endpoints` — quotas and usage
 * are under `/v1/projects` — forwarded unchanged to `http://devplatform:4000`, and the blackhole
 * catch-all it described has been deleted outright. `deploy/compose/docker-compose.estate.yml`
 * declares the `devplatform` service and its migration job.
 *
 * IT WENT ON BEING RENDERED AS A WARNING FOR AS LONG AS IT TOOK SOMEBODY TO OPEN THE FILE. The only
 * thing that would ever have caught it was its own citation — and the citation named a
 * `docker-compose.slice.yml` under `deploy/compose`, which micro-deploy has since deleted. It is
 * not written as a path here on purpose: a citation to a file that does not exist is what this
 * sentence is about, and writing one would make the sentence fail its own rule.
 * The sweep that should have said so only looked at citations carrying a LINE NUMBER, so a citation
 * to a deleted file was the one shape it could not see. `test/citations.test.ts` now checks every
 * cited FILE and forbids the line, which is the pair of changes that surfaced this.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */

/*
 * PROVENANCE, kept here rather than printed under the entry: `sdk/openapi.json` carries 52 paths
 * and not one of them belongs to devplatform, so neither `sdk/packages/sdk/src/credentials.ts` nor
 * `sdk/packages/cli/src/run.ts` has a route to call. Re-verified 2026-08-11: still 52, still none.
 *
 * This note used to end "Both still say in their own source that devplatform does not exist; it
 * does." That half is closed — micro-sdk corrected both files, and what they now say is the
 * accurate, narrower thing: the platform ships and mints keys self-service, and the token endpoint
 * `clientCredentials` would need is identity's to build, because devplatform will not sign with
 * identity's key and must not have one of its own. The user-facing sentence in `finding` below
 * carried the same claim and has been rewritten with it, since a console telling developers not to
 * trust our own SDK's documentation had better be right about it. It closes when devplatform's
 * `/v1` routes are added to the SDK's verified route table and to `openapi.json` — the gateway
 * condition that used to block it is met, since `cf-api-devplatform` forwards the seven prefixes
 * and the blackhole catch-all is gone.
 */
export const SDK_GAP: KnownGap = {
  id: 'sdk-has-no-devplatform',
  title: 'Keys cannot be managed from the SDK or the CLI',
  finding:
    'Our published SDK and command-line tool will carry an API key as a bearer token, and that is ' +
    'the whole of what they do with one: neither can issue a key, list the keys you hold, revoke ' +
    'one or ask what a key is allowed to do. Do all of that here in this console, or against the ' +
    'API yourself. Their OAuth client-credentials option also needs a token endpoint you supply ' +
    'yourself, because there is not one to default to yet; an API key from this console is the ' +
    'straightforward path.',
}

/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * `REVIEW_GAP` WAS HERE, AND IT IS CLOSED. IT IS NOT KEPT AS A CLOSED ENTRY.
 *
 * It said: "POST …/application/submit moves a listing to in_review, and no route in the estate
 * moves it any further." `micro-devplatform@e13c154` added
 * `PUT /v1/projects/:id/application/status` and `GET /v1/apps/pending`, so it is now false. A
 * findings list that keeps its resolved entries is a list somebody stops reading, and a screen that
 * renders "we fixed this" as a warning is worse than one that renders nothing. The closure is
 * recorded where a reader of the SUBMIT wrapper will meet it — see `submitApplication` above — and
 * the two routes are accounted for in the DECLINED table at the top of this file.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */

/*
 * PROVENANCE: every `/v1` route taking an `:id` compares it against a uuid column and, apart from
 * the two operator routes, passes the path segment straight through. Postgres answers `22P02
 * invalid input syntax for type uuid`, nothing catches it, and the caller gets a 500. devplatform
 * knows, and says so at `requireUuid` (`devplatform/src/server.ts`): changing the status code of
 * every shipped route is its own decision, because a caller treating 500 as retryable would start
 * seeing a 400 it must not retry. It closes when `requireUuid` guards every route that takes an id.
 */
export const MALFORMED_ID_GAP: KnownGap = {
  id: 'malformed-path-id-is-500',
  title: 'A malformed id comes back as a server error, not a bad request',
  finding:
    'Every address in the API that contains an id expects a UUID. Send something that is not one ' +
    'and you get a 500 rather than a 400, which reads as our fault when it is a typo in the URL. ' +
    'If you branch on status codes, check the id before you treat a 500 from these routes as an ' +
    'outage, and do not retry it — it will fail the same way every time. Nothing you do in this ' +
    'console can produce one.',
}

export const KNOWN_GAPS: readonly KnownGap[] = [SDK_GAP, MALFORMED_ID_GAP]
