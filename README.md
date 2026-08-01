# micro-devportal-web

The **Developer Platform console** — the surface a third party uses to integrate with CloudsForge.
It enrols a developer organisation, creates projects, issues and revokes API keys, registers OAuth
clients and webhook endpoints, and shows usage against quotas. It is the browser client for
[`micro-devplatform`](../devplatform), and it holds nothing of its own.

> **This console cannot show you a key twice, and neither can anybody else.**
> `api_keys` has no column a secret could be read back from: `secret_algo`, `secret_salt` and
> `secret_hash` are a one-way function of the key, and the CHECK constraint
> `api_keys_slow_kdf_only` refuses any row whose recorded algorithm is not a scrypt encoding
> (`devplatform/src/migrations.ts:189`). `oauth_clients` carries the same constraint (`:229`).
> There is no reveal route, no support tool and no operator with a way round it. So this bundle
> never draws a "show key" control, never offers to email one, and never says "contact support" —
> and `test/render.test.ts` fails the build on nine phrasings that would imply otherwise.

Specification: `docs/ecosystem/03-repository-responsibilities.md` §1.2 (`devportal-web`, phase P11).

---

## What it talks to

One service, one host. In production the bundle and `micro-devplatform` share
`developers.<apex>` — nginx serves the static files, the service serves `/v1` — so `apiBase()` is
the empty string and every request is relative. Under `pnpm dev` they are on different ports and
the request goes cross-origin. That difference is derived by **comparing origins**, never by a
build flag: this repository has no build-time configuration at all (see
[No build-time environment](#no-build-time-environment)).

Identity is the second upstream, and it is reached at `nimbus.<apex>` for `/auth/me` and
`/auth/refresh` only. `/auth/me` nests the profile under `user` (`identity/src/server.ts:891-903`,
body built by `toPublicUser` at `identity/src/users.ts:52-63`) and this app is **nested-only** —
see [The `/auth/me` shape](#the-authme-shape).

### The routes this bundle calls

Read out of `devplatform/src/server.ts`, one at a time, with the line each was verified against.
`test/devplatform.test.ts` reads that file and fails if any citation is not the line that registers
the route; CI bends one and requires the suite to go red, so a green run is evidence.

**How each authenticates matters more here than anywhere else in the estate.** There is no
middleware — `handle()` dispatches straight into each route's closure
(`devplatform/src/server.ts:373-418`) — and **not one of the 31 `/v1` handlers contains a literal
`await authenticate(ctx, deps)`**. That call appears three times in the whole file and all three are
inside helpers (`:473`, `:480`, `:516`). A boolean grep for the literal, which is what
`micro-worlds-web`'s route test does, would declare all thirty-one routes public. So the table
records the mechanism, and the test matches the handler against that mechanism.

| Method | Path | Authenticates | Idempotency-Key | Verified at |
| --- | --- | --- | --- | --- |
| `GET` | `/v1/scopes` | **none** | — | `devplatform/src/server.ts:604` |
| `POST` | `/v1/organisations` | `authenticateUser` + `permits(role, ADMIN_ROLES)` | — | `:637` |
| `GET` | `/v1/organisations/:id` | `authoriseOrg` read | — | `:655` |
| `GET` | `/v1/organisations/:id/projects` | `authoriseOrg` read | — | `:663` |
| `POST` | `/v1/projects` | `authoriseOrg` write | **required** | `:671` |
| `GET` | `/v1/projects/:id` | `authoriseProject` read | — | `:694` |
| `POST` | `/v1/projects/:id/service-accounts` | `authoriseProject` write | — | `:706` |
| `GET` | `/v1/projects/:id/service-accounts` | `authoriseProject` read | — | `:717` |
| `POST` | `/v1/projects/:id/keys` | `authoriseProject` write | **required** | `:736` |
| `GET` | `/v1/projects/:id/keys` | `authoriseProject` read | — | `:790` |
| `DELETE` | `/v1/keys/:id` | `authoriseProject` write | — | `:812` |
| `GET` | `/v1/projects/:id/quotas` | `authoriseProject` read | — | `:856` |
| `GET` | `/v1/projects/:id/usage` | `authoriseProject` read | — | `:866` |
| `POST` | `/v1/projects/:id/webhook-endpoints` | `authoriseProject` write | **required** | `:876` |
| `GET` | `/v1/projects/:id/webhook-endpoints` | `authoriseProject` read | — | `:907` |
| `POST` | `/v1/webhook-endpoints/:id/rotate-secret` | `authoriseProject` write | **required** | `:916` |
| `POST` | `/v1/webhook-endpoints/:id/disable` | `authoriseProject` write | — | `:937` |
| `DELETE` | `/v1/webhook-endpoints/:id` | `authoriseProject` write | — | `:947` |
| `GET` | `/v1/webhook-endpoints/:id/deliveries` | `authoriseProject` read | — | `:956` |
| `POST` | `/v1/projects/:id/oauth-clients` | `authoriseProject` write | **required** | `:966` |
| `GET` | `/v1/projects/:id/oauth-clients` | `authoriseProject` read | — | `:1003` |
| `DELETE` | `/v1/oauth-clients/:id` | `authoriseProject` write | — | `:1008` |
| `GET` | `/v1/apps` | **none** | — | `:1022` |
| `GET` | `/v1/apps/:slug` | **none** | — | `:1027` |
| `PUT` | `/v1/projects/:id/application` | `authoriseProject` write | — | `:1034` |
| `GET` | `/v1/projects/:id/application` | `authoriseProject` read | — | `:1048` |
| `POST` | `/v1/projects/:id/application/submit` | `authoriseProject` write | — | `:1056` |

`authoriseOrg` (`:537`) accepts a **user token only** (`:543`) and asks identity for the caller's
role on every request. `authoriseProject` (`:510`) accepts a user token **or an API key**, and a key
may act only within its own project because the project id is read from the row rather than from the
request (`:522-527`).

### The four routes this bundle declines, each for a stated reason

Declining is a first-class entry: `test/devplatform.test.ts` requires `SURFACE ∪ DECLINED` to cover
every `/v1` route the service registers, so a route that grows and is never read fails the build
instead of going quiet.

| Method | Path | Verified at | Why not |
| --- | --- | --- | --- |
| `GET` | `/v1/keys/self` | `:624` | The whoami for a **machine** credential. `authenticateKeyOnly` refuses anything that is not a `cfk_…` string (`:479-483`), so the user JWT this bundle holds is a 403 — and satisfying it would mean a browser holding a live API key, which is the one thing this product exists to stop. It is the SDK's route, not the console's. |
| `GET` | `/v1/keys/:id` | `:797` | It answers the identical `ApiKeySummary` (`devplatform/src/apikeys.ts:136-155`) that the project's key list already returns for every key, and this app has no per-key address. |
| `PUT` | `/v1/projects/:id/quotas` | `:836` | **A control this console must not draw.** It is `project:write` — the same authority that issues a key — and `setQuota` accepts any whole number ≥ 1 with no ceiling (`devplatform/src/quotas.ts:112-126`). A "raise my limit" button in a customer console makes the platform's quota advisory. Reported; it belongs to the operator surface. |
| `POST` | `/v1/events` | `:1175` | The internal inbox, HMAC-checked over the raw bytes before `JSON.parse` (`:1176-1182`). A browser cannot hold that secret, and a bundle that shipped it would BE the revoke-anybody's-credentials endpoint the check prevents. |

`/livez`, `/readyz`, `/metrics` and the three `/internal` routes are served too and are not reachable
from a browser: `deploy/gateway/dynamic/policy.yml:100-102` refuses `^/+internal(/|$)` at a priority
nothing can outrank.

---

## The one-time secret, and how this app handles it

Four routes return a credential and none returns it twice: an API key (`:780`), a webhook signing
secret on creation (`:904`) and on rotation (`:934`), and an OAuth client secret (`:1000`).

`src/components/once.tsx` is the only place a secret is rendered. It is a modal dialog rather than a
notification, and each of its three behaviours is a property of what it shows:

1. **It does not close by accident.** `role="dialog" aria-modal="true"`, a full-viewport scrim that
   swallows every pointer event, a Tab trap so the navigation behind cannot be reached by keyboard,
   and Escape deliberately ignored. The two gestures a user makes without reading are the two that
   would destroy the value.
2. **It warns before a hard navigation.** `beforeunload` is armed while the secret is on screen —
   the reload, the back button and the closed tab are the three ways out that no in-app guard sees.
3. **Acknowledgement is a claim about the reader.** The dismiss button is disabled until they have
   copied the value or ticked the box that says they stored it.

The warning also appears **on the form, before the request is sent**, in the service's own sentence
verbatim (`devplatform/src/server.ts:783`, duplicated as `SHOWN_ONCE` in `src/lib/format.ts` and
checked character-for-character by `test/devplatform.test.ts`). A warning that first appears
alongside the secret is a warning read after the decision it was meant to inform.

**A replay is not a failure.** All four routes are wrapped in `withIdempotentRoute`, and the stored
response carries the metadata only — the secret is attached to the first response and nowhere else
(`devplatform/src/server.ts:731-734`). So a replay answers `200` with `replayed: true` and the
secret field `null`. `<Replayed>` renders that as what it is: the artefact exists, it is live, it was
shown when it was created, and if you no longer have it the remedy is to revoke and re-issue.

**One honest exception, stated rather than hidden.** A webhook signing secret IS stored recoverably,
because HMAC is not a one-way function of an input the service does not have — signing a delivery
requires the secret itself (`devplatform/src/migrations.ts:44-51`). It is still shown once, because
no route returns it (`devplatform/src/webhooks.ts:147`). `WEBHOOK_SECRET_NOTE` says exactly that and
deliberately does not claim scrypt; `test/format.test.ts` asserts the two sentences differ.

---

## The `Idempotency-Key`

**Five routes require one and eleven other mutations do not read one at all**, and getting that
split wrong in either direction is a real failure. `micro-trade` requires the header on every
mutating route; `micro-mint` reads it nowhere. This service does neither.

The five are `POST /v1/projects`, `POST /v1/projects/:id/keys`,
`POST /v1/projects/:id/webhook-endpoints`, `POST /v1/webhook-endpoints/:id/rotate-secret` and
`POST /v1/projects/:id/oauth-clients`. A POST without the header is a **400**
(`devplatform/src/server.ts:1293-1298`). The eleven exempt mutations each name the mechanism that
makes them safe without a wrapper — a natural key with `on conflict do nothing`, an upsert, a state
transition claimed with a WHERE clause, or a DELETE — in
`devplatform/src/routeidempotency.test.ts:34-62`.

`test/devplatform.test.ts` asserts both directions against the real service: the client sends a key
to exactly the wrapped routes and to no other.

A key belongs to an **attempt at one intent**: minted when the developer commits, kept while the
outcome is unknown, dropped the moment it is known — success or refusal alike. `keepKeyAfter` in
`src/lib/idempotency.ts` is that decision as a pure function, and `useIdempotentMutation` in
`src/lib/mutation.ts` applies it. Keeping a key after a refusal is how a developer who fixes a
validation error gets a 409 they cannot act on; dropping one after a timeout is how a second live
credential appears with nobody watching it.

---

## Screens

| Path | Session | What it is |
| --- | --- | --- |
| `/` | **public** | What a credential here can be: the scope vocabulary from `GET /v1/scopes`, and the known gaps as findings |
| `/apps` | **public** | The listed application directory |
| `/apps/:slug` | **public** | One listing |
| `/organisations` | gated | The identity organisations this account belongs to, and the control that enrols or opens one |
| `/organisations/:id` | gated | One enrolled organisation, its projects, and the form that creates another |
| `/projects/:id` | gated | Overview: environments, service accounts, the directory listing |
| `/projects/:id/keys` | gated | Issue, list and revoke API keys |
| `/projects/:id/webhooks` | gated | Endpoints, secret rotation, and the delivery log |
| `/projects/:id/oauth` | gated | OAuth clients |
| `/projects/:id/usage` | gated | Quotas and hourly usage |

**Which screens are public is read off the service, not chosen.** `GET /v1/scopes`, `GET /v1/apps`
and `GET /v1/apps/:slug` read no credential at all, so gating them would send an anonymous visitor
to sign in for a page the service would have handed them — the mirror of the estate's older mistake
of sending a bearer to a route that never wanted one. `test/routes.test.ts` checks the declaration,
`app.tsx` and `nginx.conf` against each other in all three directions.

**The gate is not the security boundary.** `devplatform` verifies the bearer itself (`:461`), asks
identity for the caller's role per request (`:558`), and answers **404 rather than 403** for an
organisation or project the caller may not see (`:546`, `:520`) so that ids are not enumerable across
customers. This app therefore never renders a 404 here as "that belongs to someone else".

---

## Running it

```bash
pnpm install
pnpm dev            # http://localhost:5192
```

**Start `micro-devplatform` on 3012, not on its own default.** The surface registry gives
`developers` devPort **3012** (`ui/packages/ui/src/surfaces.ts:389`) and this bundle derives its API
base from the registry, while `devplatform` binds **4000** (`devplatform/src/env.ts:197`,
`devplatform/.env.example:27`):

```bash
cd ../devplatform && PORT=3012 pnpm start
```

That is the whole reconciliation, and it is one line rather than a hard-coded host here — see
[Known gaps](#known-gaps).

```bash
pnpm typecheck
pnpm test           # the cross-repository halves SKIP without the siblings; CI makes that fatal
pnpm build
```

The suite reads sibling checkouts when they are present: `../devplatform/src/server.ts` for the
route citations, `../ui/packages/ui/src/tokens.css` for the design tokens, and
`../brand/assets/developers/` for the chrome. Without them those halves say **SKIPPED** by name; CI
checks all three out and requires each to have really run.

```bash
docker build -t devportal-web --build-context uipkg=../ui .
docker run --rm -p 8080:8080 devportal-web
```

---

## No build-time environment

There is no `define`, no `envPrefix`, no `.env` and no `VITE_` variable anywhere in this repository.
A build-time constant is an environment baked into an image, and an image with an environment baked
into it has to be rebuilt to be promoted — so the artefact that reaches production is not the one
that passed CI. Every host is resolved at runtime from `window.location.hostname` by
`cloudsforgeHosts()`. `test/no-build-time-config.test.ts` fails the build if that reappears, and the
`rules` job greps for it again so deleting the test does not delete the rule.

## An unknown address answers 404

`nginx.conf` enumerates this app's routes and lets everything else fall through to
`error_page 404 /index.html`, which serves the bundle while keeping the 404 status. The usual
`try_files $uri /index.html` answers 200 for every address in existence, which makes "page not
found" a success: crawlers index it, monitors call it healthy, and a deploy that drops a route looks
exactly like one that did not. On this surface the address that matters is
`/projects/<uuid>/keys` — a mistyped one answering 200 with an empty key list would look exactly
like a project whose credentials had all been revoked.

`X-Frame-Options` is **DENY** rather than SAMEORIGIN, unlike the public product surfaces. Every
screen behind the session gate creates or revokes a credential and nothing anywhere has a reason to
frame that.

## The `/auth/me` shape

Identity answers `{ user: {...}, session: {...}, organisations: [...] }` — the profile is **nested**
under `user`. The estate got this wrong once at the root: the web template declared
`{ handle?, roles? }` and read both off the top level, four frontends inherited it, and `isAdmin` in
the shared company bar was false for every signed-in operator.

`micro-trade-web` and `micro-worlds-web` keep a flat fallback for a proxy on the rollback path.
**This app is nested-only**, and the reason is specific to it: `organisations` has no flat spelling
at all, so a body that satisfied only the fallback would produce a signed-in console showing no
organisations — which reads as "you administer nothing" rather than "this answer was not
understood". Being wrong about which organisations somebody may enrol is worse than refusing to
guess. `test/auth.test.ts` proves both directions.

## Design tokens

Every `--cf-*` this stylesheet names is declared in `ui/packages/ui/src/tokens.css`, and
`test/tokens.test.ts` proves it against the sibling checkout. An undefined custom property makes the
whole declaration invalid at computed-value time — `border: 1px solid var(--cf-nope)` removes the
border, silently, in a file that looks correct. `micro-mint-web` ships ten such properties across 72
declarations. There are no `var()` fallbacks and no literal colours; the accent comes from
`[data-cf-product='developers']` (`ui/packages/ui/src/tokens.css:428`), set statically on `<html>` so
the page cannot paint the company ember first and then change colour.

## Brand chrome

`public/` holds four files copied byte-identical from `brand/assets/developers/`, and
`test/brand-chrome.test.ts` compares the bytes in both directions. This surface's entitled set is
**mark, favicon, wordmark, og — seven files, and deliberately no social banner**
(`brand/README.md:41`, `brand/README.md:64-65`, `brand/plan.ts:234-243`). The og card is shipped
because "devportal-web is public and its links get shared"; a repository social preview "is a
separate question nobody has asked", and the test asserts its absence so that adding one is a
decision somebody makes on purpose.

The registry carries `markId: null` for this surface (`ui/packages/ui/src/surfaces.ts:392`), so
`hasMark('developers')` is false and the shared bar draws no inline mark. `micro-brand` does hold a
generated mark and wordmark. That divergence is recorded rather than papered over with a locally
drawn mark, which would be this repository inventing brand.

---

## Known gaps

Each is a finding with the lines it was read from. The first three are also rendered on the index
page, held as data in `src/lib/devplatform.ts` so the screens and this file cannot disagree.

**1. The public API gateway routes none of this service.**
`deploy/gateway/dynamic/public-api.yml` registers routers for pricing, activity, foresight, identity,
wallet, market, mint and worlds (`:79`–`:159`) and for nothing else. None of `organisations`,
`projects`, `keys`, `webhook-endpoints`, `oauth-clients`, `quotas`, `usage`, `apps` or `scopes`
appears in any rule, so every devplatform path on `api.<apex>` falls to the catch-all (`:164`) and is
blackholed to an unreachable upstream (`:206`). **A key issued through this console works against no
public host today.** `deploy/compose/docker-compose.slice.yml` has no block for the service either —
it brings up postgres, identity and ledger. Closing it: a `cf-api-devplatform` router matching the
eight resources, forwarded unchanged, since the service serves `/v1` natively and needs no
strip-prefix middleware.

**2. The public SDK and CLI cannot manage a key.** `sdk/openapi.json` carries 52 paths and not one
belongs to devplatform, so `@cloudsforge/sdk` and the `cloudsforge` CLI can present a key as a
bearer token and do nothing else with one. Both still say in their own source that devplatform does
not exist (`sdk/packages/sdk/src/credentials.ts:7`, `sdk/packages/cli/src/run.ts:518`). It does.

**3. Nothing can approve a submitted application.** `POST /v1/projects/:id/application/submit` moves
a listing to `in_review`, and no route in the estate moves it further: `setApplicationStatus`
(`devplatform/src/applications.ts:152`) is imported by the server (`devplatform/src/server.ts:149`)
and called by no handler. The public directory stays empty however many listings are submitted.

**4. The dev port is an allocation, not a fact.** The registry gives `developers` 3012 and
`devplatform` binds 4000. This is the sixth instance in the estate — after `admin` (3002 vs 4014),
`emberkin` (3014 vs 4100), `foresight` (4021 read as beacon's 4011), `create` (4004 vs 4000) and
`worlds-api` (4002 vs 4000). It is not fixed with a literal port here, because a hard-coded host is a
second unversioned copy of the registry and the copy is the one that goes stale. Reported to
micro-ui; the reconciliation is the `PORT=3012` line above, and `test/hosts.test.ts` pins both halves
so the day either moves, the suite names the other.

**5. The gateway's CORS allowlist names a host the registry does not define.**
`deploy/gateway/dynamic/policy.yml:53` allowlists `https://devportal.cloudsforge.online`. The
registry's subdomain for this surface is `developers` (`ui/packages/ui/src/surfaces.ts:388`), so the
origin this bundle is actually served from is not on that list and `devportal.<apex>` is a name
nothing resolves. It does not break this app, whose production requests are same-origin; it would
break any cross-origin call, and it is a name that will be believed. Reported to micro-deploy.

**6. `deploy/README.md:274` says devplatform does not exist.** It does — a complete service with 31
`/v1` routes and a migrated schema. Reported to micro-deploy.

**7. A disabled webhook endpoint cannot be re-enabled.**
`POST /v1/webhook-endpoints/:id/disable` passes `true` unconditionally
(`devplatform/src/server.ts:944`) and no route sets it back. The way back is to delete the endpoint
and register it again, which mints a new signing secret the subscriber has to deploy. The screen says
so rather than drawing a toggle. Reported.

**8. The webhook attempt ceiling is not on the wire.** `DEVPLATFORM_WEBHOOK_MAX_ATTEMPTS` defaults to
8 (`devplatform/src/env.ts:215`) and no route returns it, so the delivery list cannot tell
"abandoned" from "still retrying" without assuming a value. It assumes the default and **says on the
screen that it assumed it** — the one number in this app that is inferred rather than read.

## The one temporary thing

`@cloudsforge/ui` is unpublished and is consumed as `link:../ui/packages/ui`. Three things go with
it and disappear together the day it is published: the specifier in `package.json`, the `uipkg`
build context in the Dockerfile, and the `micro-ui` checkout in `ci.yml`. At that point the local
`check` and `image` jobs are replaced by a call to
`cloudsforge-online/micro-org/.github/workflows/web-ci.yml` — except that its `image` job requires a
200 for any deep link, and this app's nginx answers 404 for an address it does not own on purpose.
The measured target in `docs/ecosystem/03-repository-responsibilities.md` §5 is zero repositories
with a bespoke CI file, so treat every local job as a liability with a deletion date.
