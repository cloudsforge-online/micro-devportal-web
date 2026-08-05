# micro-devportal-web

The **Developer Platform console** — the surface a third party uses to integrate with CloudsForge.
It enrols a developer organisation, creates projects, issues and revokes API keys, registers OAuth
clients and webhook endpoints, and shows usage against quotas. It is the browser client for
[`micro-devplatform`](https://github.com/cloudsforge-online/micro-devplatform), and it holds nothing of its own.

> **This console cannot show you a key twice, and neither can anybody else.**
> `api_keys` has no column a secret could be read back from: `secret_algo`, `secret_salt` and
> `secret_hash` are a one-way function of the key, and the CHECK constraint
> `api_keys_slow_kdf_only` refuses any row whose recorded algorithm is not a scrypt encoding
> (`devplatform/src/migrations.ts:204`). `oauth_clients` carries the same constraint (`:244`).
> There is no reveal route, no support tool and no operator with a way round it. So this bundle
> never draws a "show key" control, never offers to email one, and never says "contact support" —
> and `test/render.test.ts` fails the build on nine phrasings that would imply otherwise.

Design authority: [`ecosystem/03-repository-responsibilities.md`](https://github.com/cloudsforge-online/micro-docs/blob/main/ecosystem/03-repository-responsibilities.md) §1.2 (`devportal-web`, phase P11).

---

## What it talks to

One service, one host. In production the bundle and `micro-devplatform` share
`developers.<apex>` — nginx serves the static files, the service serves `/v1` — so `apiBase()` is
the empty string and every request is relative. Under `pnpm dev` they are on different ports and
the request goes cross-origin. That difference is derived by **comparing origins**, never by a
build flag: this repository has no build-time configuration at all (see
[No build-time environment](#no-build-time-environment)).

Identity is the second upstream, and it is reached at `nimbus.<apex>` for `/auth/me` and
`/auth/refresh` only. `/auth/me` nests the profile under `user` (`GET /auth/me` in
`identity/src/server.ts`, body built by `toPublicUser` at `identity/src/users.ts:52-63`) and this app is **nested-only** —
see [The `/auth/me` shape](#the-authme-shape).

### The routes this bundle calls

Read out of `devplatform/src/server.ts`, one at a time, with the line each was verified against.
`test/devplatform.test.ts` reads that file and fails if any citation is not the line that registers
the route; CI bends one and requires the suite to go red, so a green run is evidence.

**The handler each check GRADES is found by content, not by the line below.** `cite()` from
`@cloudsforge/ui/cite` resolves `define('METHOD', '/path',` and refuses to answer unless exactly one
line matches. The lines here are still asserted — a move is a finding, and the failure names where
the route went — but no authentication, idempotency or secret check starts from a number this
repository wrote down. That distinction is not academic: with the table 34 lines stale, three
`none` routes and `DELETE /v1/webhook-endpoints/:id` PASSED while grading somebody else's handler,
and the one asserting `project:write` was reading `POST /v1/webhook-endpoints/:id/disable`.

**Every line below moved again at `micro-devplatform@974e1ed`**, by +32 or +34. It moved at
`@e13c154` before that by between +108 and +296. Each was re-derived from a diff-replayed line map
rather than shifted by hand; not one route changed its method, path, authority or idempotency in
either move, which is the argument for pinning the handler by what it says.

**How each authenticates matters more here than anywhere else in the estate.** There is no
middleware — `handle()` dispatches straight into each route's closure
(`devplatform/src/server.ts:415-460`) — and **not one of the 35 `/v1` handlers contains a literal
`await authenticate(ctx, deps)`**. That call appears three times in the whole file and all three are
inside helpers (`:567`, `:574`, `:610`). A boolean grep for the literal, which is what
`micro-worlds-web`'s route test does, would declare all thirty-five routes public. So the table
records the mechanism, and the test matches the handler against that mechanism.

| Method | Path | Authenticates | Idempotency-Key | Verified at |
| --- | --- | --- | --- | --- |
| `GET` | `/v1/scopes` | **none** | — | `devplatform/src/server.ts:744` |
| `POST` | `/v1/organisations` | `authenticateUser` + `permits(role, ADMIN_ROLES)` | — | `:777` |
| `GET` | `/v1/organisations` | `authenticateUser` + `permits(role, READ_ROLES)` | — | `:816` |
| `GET` | `/v1/organisations/:id` | `authoriseOrg` read | — | `:831` |
| `GET` | `/v1/organisations/:id/projects` | `authoriseOrg` read | — | `:839` |
| `POST` | `/v1/projects` | `authoriseOrg` write | **required** | `:847` |
| `GET` | `/v1/projects/:id` | `authoriseProject` read | — | `:870` |
| `POST` | `/v1/projects/:id/service-accounts` | `authoriseProject` write | — | `:882` |
| `GET` | `/v1/projects/:id/service-accounts` | `authoriseProject` read | — | `:893` |
| `POST` | `/v1/projects/:id/keys` | `authoriseProject` write | **required** | `:912` |
| `GET` | `/v1/projects/:id/keys` | `authoriseProject` read | — | `:968` |
| `DELETE` | `/v1/keys/:id` | `authoriseProject` write | — | `:990` |
| `PUT` | `/v1/projects/:id/quotas` | operator to raise or create, `authoriseProjectAs` write to lower | — | `:1045` |
| `GET` | `/v1/projects/:id/quotas` | `authoriseProject` read | — | `:1097` |
| `GET` | `/v1/projects/:id/usage` | `authoriseProject` read | — | `:1107` |
| `POST` | `/v1/projects/:id/webhook-endpoints` | `authoriseProject` write | **required** | `:1117` |
| `GET` | `/v1/projects/:id/webhook-endpoints` | `authoriseProject` read | — | `:1148` |
| `POST` | `/v1/webhook-endpoints/:id/rotate-secret` | `authoriseProject` write | **required** | `:1157` |
| `POST` | `/v1/webhook-endpoints/:id/disable` | `authoriseProject` write | — | `:1188` |
| `POST` | `/v1/webhook-endpoints/:id/enable` | `authoriseProject` write | — | `:1212` |
| `DELETE` | `/v1/webhook-endpoints/:id` | `authoriseProject` write | — | `:1222` |
| `GET` | `/v1/webhook-endpoints/:id/deliveries` | `authoriseProject` read | — | `:1231` |
| `POST` | `/v1/projects/:id/oauth-clients` | `authoriseProject` write | **required** | `:1241` |
| `GET` | `/v1/projects/:id/oauth-clients` | `authoriseProject` read | — | `:1278` |
| `DELETE` | `/v1/oauth-clients/:id` | `authoriseProject` write | — | `:1283` |
| `GET` | `/v1/apps` | **none** | — | `:1297` |
| `GET` | `/v1/apps/:slug` | **none** | — | `:1325` |
| `PUT` | `/v1/projects/:id/application` | `authoriseProject` write | — | `:1332` |
| `GET` | `/v1/projects/:id/application` | `authoriseProject` read | — | `:1346` |
| `POST` | `/v1/projects/:id/application/submit` | `authoriseProject` write | — | `:1354` |

Three of those are new, and two exist because this repository reported the gap they close.
`GET /v1/organisations` resolves an identity organisation to its enrolment, so the organisations
screen no longer answers "which organisation am I in?" by re-POSTing the idempotent enrolment — a
mutation used as a query. `POST /v1/webhook-endpoints/:id/enable` is the inverse of `/disable`,
which had none: the only way back used to be deleting the endpoint, which mints a new signing
secret and drops the delivery history, during the incident it was disabled for. And
`PUT /v1/projects/:id/quotas` is no longer declined — see below.

`authoriseOrg` (`:646`) accepts a **user token only** (`:652`) and asks identity for the caller's
role on every request. `authoriseProject` (`:604`) accepts a user token **or an API key**, and a key
may act only within its own project because the project id is read from the row rather than from the
request (`:631-636`).

### The five routes this bundle declines, each for a stated reason

Declining is a first-class entry: `test/devplatform.test.ts` requires `SURFACE ∪ DECLINED` to cover
every `/v1` route the service registers, so a route that grows and is never read fails the build
instead of going quiet.

| Method | Path | Verified at | Why not |
| --- | --- | --- | --- |
| `GET` | `/v1/keys/self` | `:764` | The whoami for a **machine** credential. `authenticateKeyOnly` refuses anything that is not a `cfk_…` string (`:573-577`), so the user JWT this bundle holds is a 403 — and satisfying it would mean a browser holding a live API key, which is the one thing this product exists to stop. It is the SDK's route, not the console's. |
| `GET` | `/v1/keys/:id` | `:975` | It answers the identical `ApiKeySummary` (`devplatform/src/apikeys.ts:137-156`) that the project's key list already returns for every key, and this app has no per-key address. |
| `GET` | `/v1/apps/pending` | `:1317` | **An operator route, and this is a customer console.** It lists other customers' unpublished submissions, keyed on nothing the reader owns. A CloudsForge platform admin signing in here would get a 200, which is the argument for not drawing it rather than against: a control that works for one class of reader and 403s for every other reader of the same screen teaches the wrong thing about whose console this is. |
| `PUT` | `/v1/projects/:id/application/status` | `:1378` | **The route this repository asked for, declined here on purpose.** It closes the "nothing can approve a submitted application" finding, and it is an operator's: "a directory a developer can publish to unilaterally is a directory that eventually hosts a phishing page wearing this platform's chrome" (`:1368-1371`), and the OAuth consent screen is rendered from exactly that row. The submitting party must not hold the approving control. |
| `POST` | `/v1/events` | `:1505` | The internal inbox, HMAC-checked over the raw bytes before `JSON.parse` (`:1506-1512`). A browser cannot hold that secret, and a bundle that shipped it would BE the revoke-anybody's-credentials endpoint the check prevents. |

**`PUT /v1/projects/:id/quotas` is no longer on this list.** It was, and the reason given was that
it required only `project:write` while `setQuota` accepted any whole number with no ceiling — the
party the limit binds chose the limit. That was reported, and `micro-devplatform@e13c154` fixed it
(worse than reported: any API key in the project carrying `devplatform:write` could do it too).
The direction is now the authority — lowering is `project:write`, raising and creating are an
operator's, and a browser can never be an operator because `devplatform:admin` is absent from
`scopes.ts` and no key can hold it. So the usage screen draws a **lower my limit** control, which
is a customer's own safety feature, and nothing that raises one.

`/livez`, `/readyz`, `/metrics` and the three `/internal` routes are served too and are not reachable
from a browser: `deploy/gateway/dynamic/policy.yml:100-102` refuses `^/+internal(/|$)` at a priority
nothing can outrank.

---

## The one-time secret, and how this app handles it

Four routes return a credential and none returns it twice: an API key (`:958`), a webhook signing
secret on creation (`:1145`) and on rotation (`:1175`), and an OAuth client secret (`:1275`).

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
verbatim (`devplatform/src/server.ts:961`, duplicated as `SHOWN_ONCE` in `src/lib/format.ts` and
checked character-for-character by `test/devplatform.test.ts`). A warning that first appears
alongside the secret is a warning read after the decision it was meant to inform.

**A replay is not a failure.** All four routes are wrapped in `withIdempotentRoute`, and the stored
response carries the metadata only — the secret is attached to the first response and nowhere else
(`devplatform/src/server.ts:907-910`). So a replay answers `200` with `replayed: true` and the
secret field `null`. `<Replayed>` renders that as what it is: the artefact exists, it is live, it was
shown when it was created, and if you no longer have it the remedy is to revoke and re-issue.

**One honest exception, stated rather than hidden.** A webhook signing secret IS stored recoverably,
because HMAC is not a one-way function of an input the service does not have — signing a delivery
requires the secret itself (`devplatform/src/migrations.ts:59-66`). It is still shown once, because
no route returns it (`devplatform/src/webhooks.ts:148`). `WEBHOOK_SECRET_NOTE` says exactly that and
deliberately does not claim scrypt; `test/format.test.ts` asserts the two sentences differ.

---

## The `Idempotency-Key`

**Five routes require one and eleven other mutations do not read one at all**, and getting that
split wrong in either direction is a real failure. `micro-trade` requires the header on every
mutating route; `micro-mint` reads it nowhere. This service does neither.

The five are `POST /v1/projects`, `POST /v1/projects/:id/keys`,
`POST /v1/projects/:id/webhook-endpoints`, `POST /v1/webhook-endpoints/:id/rotate-secret` and
`POST /v1/projects/:id/oauth-clients`. A POST without the header is a **400**
(`devplatform/src/server.ts:1637-1642`). The eleven exempt mutations each name the mechanism that
makes them safe without a wrapper — a natural key with `on conflict do nothing`, an upsert, a state
transition claimed with a WHERE clause, or a DELETE — in
`devplatform/src/routeidempotency.test.ts:34-68`.

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

**The gate is not the security boundary.** `devplatform` verifies the bearer itself (`:525`), asks
identity for the caller's role per request (`:667`), and answers **404 rather than 403** for an
organisation or project the caller may not see (`:655`, `:629`) so that ids are not enumerable across
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
page, held as data in `src/lib/devplatform.ts` (`GATEWAY_GAP`, `SDK_GAP`, `MALFORMED_ID_GAP`) so the
screens and this file cannot disagree. A finding that gets fixed is DELETED from both rather than
marked resolved — see §7 for what was here and what closed it.

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

**3. A mistyped id is reported as a server fault.** Every `/v1` route that takes an `:id` compares
it against a `uuid` column, and all but the two operator routes pass the path segment straight
through. Postgres answers `22P02 invalid input syntax for type uuid`, nothing catches it, and the
caller gets **`500 internal`** — so `GET /v1/projects/not-a-uuid` reports a platform failure for a
typed URL. devplatform knows, and declines to change it in the same commit as the four fixes
(`devplatform/src/server.ts:1680-1684`); that is a status-code change on shipped routes and rightly
a separate decision. This console never sends one: its own addresses are those ids, and `assertUuid`
in `src/lib/devplatform.ts` refuses a non-uuid before the request is built. Reported.

That comment used to say "eleven shipped routes", and this section used to report the count as
understated: twenty-five routes take an `:id` that reaches a `uuid` column unguarded, from
`GET /v1/organisations/:id` through `POST /v1/projects/:id/application/submit`. **The report was
accepted and the number is gone rather than corrected** (`micro-devplatform@aadf5a6`): three readers
counted eleven, nineteen and twenty-five, and the service now carries the `grep` that answers the
question instead of a number three people disagree about. The behaviour is unchanged, and this
console still never sends a malformed id.

**4. The dev port is an allocation, not a fact.** The registry gives `developers` 3012 and
`devplatform` binds 4000. This is the sixth instance in the estate — after `admin` (3002 vs 4014),
`emberkin` (3014 vs 4100), `foresight` (4021 read as beacon's 4011), `create` (4004 vs 4000) and
`worlds-api` (4002 vs 4000 — that row has since been deleted along with the hostname). It is not fixed with a literal port here, because a hard-coded host is a
second unversioned copy of the registry and the copy is the one that goes stale. Reported to
micro-ui; the reconciliation is the `PORT=3012` line above, and `test/hosts.test.ts` pins both halves
so the day either moves, the suite names the other.

**5. The gateway's CORS allowlist names a host the registry does not define.**
`deploy/gateway/dynamic/policy.yml:53` allowlists `https://devportal.cloudsforge.online`. The
registry's subdomain for this surface is `developers` (`ui/packages/ui/src/surfaces.ts:388`), so the
origin this bundle is actually served from is not on that list and `devportal.<apex>` is a name
nothing resolves. It does not break this app, whose production requests are same-origin; it would
break any cross-origin call, and it is a name that will be believed. Reported to micro-deploy.

**6. `deploy/README.md:274` says devplatform does not exist.** It does — a complete service with 35
`/v1` routes and a migrated schema. Reported to micro-deploy.

**7. Nothing on this page is a closed finding.** Three that were here are gone rather than ticked
off, because a list that keeps its resolved entries is a list people stop reading. For the record,
and because the closure is the evidence the reporting works:

* *A quota the quota'd party can raise is not a quota* — `PUT /v1/projects/:id/quotas` was plain
  `project:write` with no ceiling. Fixed by direction plus a schema ceiling; the usage screen now
  draws a lowering control.
* *Nothing can approve a submitted application* — `setApplicationStatus` was imported and called by
  nothing. Fixed by `PUT /v1/projects/:id/application/status` and `GET /v1/apps/pending`, both
  operator routes, both declined here.
* *A disabled webhook endpoint cannot be re-enabled* — `/disable` had no inverse, so the only way
  back minted a new signing secret mid-incident. Fixed by
  `POST /v1/webhook-endpoints/:id/enable`, and the screen offers it.

A fourth — *no route resolved a developer organisation* — is closed by `GET /v1/organisations`, and
the organisations screen no longer issues a write in order to ask a question.

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

---

## Provenance

The code in this repository was written by **Claude Opus 5** and **Claude Fable 5**, under
human direction and review.
