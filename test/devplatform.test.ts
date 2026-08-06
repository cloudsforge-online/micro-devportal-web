/**
 * THE ROUTE TABLE, CHECKED AGAINST THE SERVICE THAT SERVES IT.
 *
 * Every client in this estate that was built against an imagined surface passed its own tests. That
 * is the whole problem: a test that asserts "the client calls /v1/keys" is a test that the client
 * agrees with itself. So this file does not assert paths in the abstract — it reads
 * `devplatform/src/server.ts` from the sibling checkout and requires that each path and method this
 * bundle calls is REGISTERED there, found by searching for its `define(`.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * ── FOUR CHECKS, AND THREE OF THEM EXIST BECAUSE A SIBLING'S VERSION HAS ALREADY BEEN FOOLED ──
 *
 * **1. Citations.** Each entry in `SURFACE` names a method and a path, and the service must
 * register exactly that pair. The entry used to name a LINE as well — see the fourth check, which
 * is the record of why it does not any more.
 *
 * **2. SHAPES, never prefixes.** `micro-market`'s guard matched `path.startsWith(servedPrefix)` and
 * would have passed two genuinely dead paths because they BEGAN with a served prefix;
 * `micro-mint-web` then shipped exactly that defect. `matchesShape` below is the corrected form
 * from `market/src/indexerclient.test.ts`: same segment count, every segment agrees, and a
 * `${...}` is exactly one segment.
 *
 * **3. HOW each route authenticates, not whether — and this service is the reason.** `micro-worlds-web`
 * greps each handler body for `await authenticate(ctx, deps)` and asserts a boolean. There is no
 * such literal inside ANY of devplatform's 35 `/v1` handlers: the call appears three times in the
 * file and all three are inside helpers (`server.ts`). Run here, the boolean
 * check would report all thirty-five routes public, including the twenty-nine that authenticate —
 * and a client built on that answer would send no bearer to the route that mints credentials. So
 * every route carries a MECHANISM and the handler body is matched against that mechanism's pattern.
 *
 * **4. NO CHECK READS A HANDLER AT A LINE THIS REPOSITORY WROTE DOWN.** Two guards in
 * `micro-trade-web` hardcoded one, and when the service's route table moved, one of them went on
 * PASSING while grading a completely different function — a guard that cannot fail is worse than
 * none. This file shipped a subtler version of the same thing and it fired: `bodyOf()` started at
 * the line in the table, so when `micro-devplatform` grew 34 lines above its route table, three
 * `none` routes and `DELETE /v1/webhook-endpoints/:id` went on PASSING while grading somebody
 * else's handler. The one named `project:write` was reading `POST /v1/webhook-endpoints/:id/disable`,
 * which really is `project:write` — a green test, about the wrong function.
 *
 * So the line a body is read from is FOUND, not declared. `cite()` from `@cloudsforge/ui/cite`
 * resolves `define('METHOD', '/path',` and refuses to answer unless EXACTLY ONE line matches, and
 * every body check starts from what it found. The handler-body extractor walks forward to the next
 * `define(` rather than to a number.
 *
 * AND THE TABLES NO LONGER CARRY A `line:` AT ALL. It survived one revision as a CLAIM — not read
 * by any check, only asserted against the line `cite()` found — and that was still the defect,
 * because a claim that fails is a red build. `micro-devplatform` moved its route table by 32 lines
 * on 3 August and by 34 before that, without one route changing its method, path, authority or
 * idempotency; both times this repository went red for an edit made in another one, and nothing
 * runs this suite when that repository is edited, so both times it surfaced during a release. What
 * the table records instead is the COMMIT it was last read against, which is a fact about a
 * reading rather than a promise about a file somebody else owns.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ── What happens without the sibling ──────────────────────────────────────────────────────────
 *
 * The service is a private repository. `pnpm test` must pass for somebody who has cloned only this
 * one, so a missing checkout SKIPS the cross-repository half — and, because a skipped test is an
 * unmeasured one, CI is where absence becomes a failure: the `check` job checks micro-devplatform
 * out and the workflow asserts the cross-check REALLY RAN by requiring the count in the output.
 * Neither half can go quiet on its own.
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, it } from 'node:test'
import { cite, type Citation } from '@cloudsforge/ui/cite'
import { ApiError } from '../src/lib/api.ts'
import { getProject, lowerQuota } from '../src/lib/devplatform.ts'
import { installFetch, installWindow, json, removeWindow, type FetchStub } from './browser-stubs.ts'

const here = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url))

/** Where a micro-devplatform checkout is, in the order CI and a developer's machine put it. */
const CANDIDATES = [
  process.env['CLOUDSFORGE_DEVPLATFORM_DIR'],
  here('../devplatform/src/server.ts'),
  here('.devplatform/src/server.ts'),
].filter((v): v is string => Boolean(v))

const server = CANDIDATES.find((p) => existsSync(p))

/**
 * How a route establishes the caller, as one of ten mechanisms.
 *
 * The regex for each is a property of `devplatform/src/server.ts`, not a guess: `none` asserts the
 * ABSENCE of any of the other nine, which is what makes the set exhaustive rather than a list of
 * things somebody happened to check for.
 *
 * ── THE THREE THAT DID NOT EXIST BEFORE `micro-devplatform@e13c154` ───────────────────────────
 *
 * `operator`      The service had no notion of one. It has now: a SERVICE token carrying the exact
 *                 scope `devplatform:admin`, or a user token with the platform role `admin`
 *                 (`devplatform/src/server.ts`). An API key can never be one —
 *                 `devplatform:admin` is deliberately absent from `scopes.ts`, so `validateScopes`
 *                 refuses it at issuance and no row can hold it. A browser cannot become an
 *                 operator by holding a key.
 * `operator-or-lower`
 *                 `PUT /v1/projects/:id/quotas` alone. The DIRECTION is the authority: raising or
 *                 creating needs an operator, lowering or writing the same value needs only
 *                 `project:write`. The handler resolves the caller ONCE with `authenticateAny` and
 *                 then takes one of two branches, so neither the plain `project:write` pattern nor
 *                 the plain `operator` one describes it and a table that used either would be
 *                 recording something that is not true.
 * `user+member`
 *                 `GET /v1/organisations` alone. A user token whose membership is asked of identity
 *                 for the IDENTITY organisation named in the query — not `authoriseOrg`, which
 *                 wants a developer organisation id this route exists to hand out in the first
 *                 place.
 */
type Auth =
  | 'none'
  | 'key'
  | 'user+admin'
  | 'user+member'
  | 'org:read'
  | 'org:write'
  | 'project:read'
  | 'project:write'
  | 'operator'
  | 'operator-or-lower'
  | 'hmac'

/** What a handler body must contain for each mechanism. `none` is handled separately. */
const MECHANISM: Readonly<Record<Exclude<Auth, 'none'>, RegExp>> = {
  key: /await authenticateKeyOnly\(ctx, deps\)/,
  'user+admin': /await authenticateUser\(ctx, deps\)[\s\S]*permits\(role, ADMIN_ROLES\)/,
  'user+member': /await authenticateUser\(ctx, deps\)[\s\S]*permits\(role, READ_ROLES\)/,
  'org:read': /await authoriseOrg\(ctx, deps, [^)]*'read'\)/,
  'org:write': /await authoriseOrg\(ctx, deps, [^)]*'write'\)/,
  'project:read': /await authoriseProject\(ctx, deps, [^)]*'read'\)/,
  'project:write': /await authoriseProject\(ctx, deps, [^)]*'write'\)/,
  operator: /requireOperator\(await authenticateAny\(ctx, deps\)\)/,
  // All three parts, because any one alone would accept a weaker handler: the single resolution,
  // the operator branch, and the `project:write` fallback for everybody else.
  'operator-or-lower':
    /await authenticateAny\(ctx, deps\)[\s\S]*isOperator\(caller\)[\s\S]*authoriseProjectAs\(caller, deps, [^)]*'write'\)/,
  hmac: /verifyInbound\(raw, headerOf\(ctx\.req, SIGNATURE_HEADER\), deps\.ingestSecrets\)/,
}

/** Every pattern, used to prove a `none` route matches NONE of them. */
const ANY_MECHANISM = Object.values(MECHANISM)

interface Route {
  readonly method: string
  readonly path: string
  readonly auth: Auth
  /** True when the handler is wrapped in `withIdempotentRoute`, so the header is required. */
  readonly idempotent: boolean
}

/**
 * The surface this bundle CALLS.
 *
 * Written down here as DATA so the checks below can be mechanical. If one of these entries is
 * wrong, the test fails and names it — which is the property a comment does not have.
 *
 * Last read against `micro-devplatform@974e1ed`, and that COMMIT is what this table records rather
 * than a set of line numbers. The reading before it was `@e13c154`: three commits on 3 August
 * inserted 32 lines above the route table and two more inside it, and every line number here moved
 * by 32 or 34 without one route changing its method, path, authority or idempotency. A commit is a
 * fact about when somebody last looked; a line was a promise about a file this repository does not
 * own, and it was broken twice in a week.
 */
const SURFACE: readonly Route[] = [
  { method: 'GET', path: '/v1/scopes', auth: 'none', idempotent: false },
  { method: 'POST', path: '/v1/organisations', auth: 'user+admin', idempotent: false },
  { method: 'GET', path: '/v1/organisations', auth: 'user+member', idempotent: false },
  { method: 'GET', path: '/v1/organisations/:id', auth: 'org:read', idempotent: false },
  { method: 'GET', path: '/v1/organisations/:id/projects', auth: 'org:read', idempotent: false },
  { method: 'POST', path: '/v1/projects', auth: 'org:write', idempotent: true },
  { method: 'GET', path: '/v1/projects/:id', auth: 'project:read', idempotent: false },
  { method: 'POST', path: '/v1/projects/:id/service-accounts', auth: 'project:write', idempotent: false },
  { method: 'GET', path: '/v1/projects/:id/service-accounts', auth: 'project:read', idempotent: false },
  { method: 'POST', path: '/v1/projects/:id/keys', auth: 'project:write', idempotent: true },
  { method: 'GET', path: '/v1/projects/:id/keys', auth: 'project:read', idempotent: false },
  { method: 'DELETE', path: '/v1/keys/:id', auth: 'project:write', idempotent: false },
  { method: 'PUT', path: '/v1/projects/:id/quotas', auth: 'operator-or-lower', idempotent: false },
  { method: 'GET', path: '/v1/projects/:id/quotas', auth: 'project:read', idempotent: false },
  { method: 'GET', path: '/v1/projects/:id/usage', auth: 'project:read', idempotent: false },
  { method: 'POST', path: '/v1/projects/:id/webhook-endpoints', auth: 'project:write', idempotent: true },
  { method: 'GET', path: '/v1/projects/:id/webhook-endpoints', auth: 'project:read', idempotent: false },
  { method: 'POST', path: '/v1/webhook-endpoints/:id/rotate-secret', auth: 'project:write', idempotent: true },
  { method: 'POST', path: '/v1/webhook-endpoints/:id/disable', auth: 'project:write', idempotent: false },
  { method: 'POST', path: '/v1/webhook-endpoints/:id/enable', auth: 'project:write', idempotent: false },
  { method: 'DELETE', path: '/v1/webhook-endpoints/:id', auth: 'project:write', idempotent: false },
  { method: 'GET', path: '/v1/webhook-endpoints/:id/deliveries', auth: 'project:read', idempotent: false },
  { method: 'POST', path: '/v1/projects/:id/oauth-clients', auth: 'project:write', idempotent: true },
  { method: 'GET', path: '/v1/projects/:id/oauth-clients', auth: 'project:read', idempotent: false },
  { method: 'DELETE', path: '/v1/oauth-clients/:id', auth: 'project:write', idempotent: false },
  { method: 'GET', path: '/v1/apps', auth: 'none', idempotent: false },
  { method: 'GET', path: '/v1/apps/:slug', auth: 'none', idempotent: false },
  { method: 'PUT', path: '/v1/projects/:id/application', auth: 'project:write', idempotent: false },
  { method: 'GET', path: '/v1/projects/:id/application', auth: 'project:read', idempotent: false },
  { method: 'POST', path: '/v1/projects/:id/application/submit', auth: 'project:write', idempotent: false },
]

/**
 * The `/v1` routes `devplatform` serves that this bundle deliberately does NOT call.
 *
 * Declining is a first-class entry rather than an omission. The "knows about everything it serves"
 * test below is satisfied by `SURFACE ∪ DECLINED`, so a route the service grows and nobody reads
 * fails the build instead of going quiet. The REASONS are in the header of src/lib/devplatform.ts,
 * keyed by these citations, and the last test in the first block requires each to be there.
 */
const DECLINED: readonly Route[] = [
  { method: 'GET', path: '/v1/keys/self', auth: 'key', idempotent: false },
  { method: 'GET', path: '/v1/keys/:id', auth: 'project:read', idempotent: false },
  { method: 'GET', path: '/v1/apps/pending', auth: 'operator', idempotent: false },
  { method: 'PUT', path: '/v1/projects/:id/application/status', auth: 'operator', idempotent: false },
  { method: 'POST', path: '/v1/events', auth: 'hmac', idempotent: false },
]

const ALL: readonly Route[] = [...SURFACE, ...DECLINED]

const client = readFileSync(here('src/lib/devplatform.ts'), 'utf8')
const idempotency = readFileSync(here('src/lib/idempotency.ts'), 'utf8')
const format = readFileSync(here('src/lib/format.ts'), 'utf8')

/* ------------------------------------------------ shapes, never prefixes */

/**
 * Does a requested path match a served pattern? Same segment count, and every segment agrees.
 *
 * **Segment counts, never prefixes.** Copied from `market/src/indexerclient.test.ts`, which
 * is itself the corrected form of a guard that matched by prefix and would have passed a dead path
 * because it began with a served one. A count is not a shape, and a prefix is not a shape.
 */
function matchesShape(requested: string, pattern: string): boolean {
  const asked = requested.split('/')
  const serves = pattern.split('/')
  if (asked.length !== serves.length) return false
  return serves.every((segment, index) => {
    const mine = asked[index] ?? ''
    return segment.startsWith(':') ? mine.length > 0 : segment === mine
  })
}

/**
 * `${...}` is exactly ONE segment.
 *
 * So a helper standing for two — a `${scope}` holding `chain/network` — produces a path one segment
 * short of every pattern and is refused rather than guessed at. That is deliberate: a checker that
 * accepted a path whose shape it cannot see would have passed the defect it exists to catch.
 */
const placeholder = (path: string): string => path.replace(/\$\{[^}]*\}/g, 'x')

/**
 * The executable part of the client: prose stripped, so a sentence is never read as a request.
 *
 * Six guards in this estate have failed a correct build by matching the comment that explains the
 * rule. This client's own header is a table of every path it must NEVER send, so without this the
 * check would assert the exact opposite of the truth. The fix is to strip the comments, never to
 * reword the explanation.
 */
function codeOf(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join('\n')
}

/**
 * One request path, as it appears in the source: a quoted string starting `/v1/`.
 *
 * ── `${…}` MAY CONTAIN A QUOTE, AND AN EARLIER VERSION OF THIS PATTERN COULD NOT SEE PAST ONE ──
 *
 * It was `/['"`](\/v1\/[^'"`]*)['"`]/`. That reads to the first quote of ANY kind, so the moment a
 * wrapper interpolated a call carrying a string argument —
 * `` `/v1/projects/${encodeURIComponent(assertUuid(id, 'project id'))}/keys` `` — the match stopped
 * inside the interpolation and the extractor reported a truncated path. It failed loudly rather
 * than passing, which is the right direction, but it failed a CORRECT client and named the wrong
 * cause. An interpolation is now consumed whole, quotes and all, before the closing quote is
 * looked for.
 */
const PATH_LITERAL = /['"`](\/v1\/(?:\$\{[^}]*\}|[^'"`])*)['"`]/g

/** Every request path this client sends, read out of its source with the PROSE STRIPPED. */
export function requestedPaths(source: string): readonly string[] {
  return [...codeOf(source).matchAll(PATH_LITERAL)].map((m) => m[1] ?? '')
}

/**
 * Every call site as a METHOD and a path.
 *
 * The method matters: `GET /v1/projects/:id/keys` is called and there is no `POST` at that shape,
 * while `POST /v1/projects/:id/keys` is a different route with a different authority. A checker
 * that compared paths alone would confuse the two. `api()` defaults to GET
 * (`src/lib/api.ts`), so a call site with no `method:` is a GET, and the options object follows
 * the path in the same call — so the method is looked for between this path literal and the next.
 */
function requestedCalls(source: string): ReadonlyArray<{ method: string; path: string; block: string }> {
  const code = codeOf(source)
  const matches = [...code.matchAll(PATH_LITERAL)]
  return matches.map((match, index) => {
    const from = (match.index ?? 0) + match[0].length
    const to = matches[index + 1]?.index ?? code.length
    const block = code.slice(from, to)
    const method = /method:\s*'([A-Z]+)'/.exec(block)?.[1]
    return { method: method ?? 'GET', path: match[1] ?? '', block }
  })
}

describe('the client calls only routes it has cited', () => {
  it('every path in the client is a WHOLE ROUTE SHAPE the service serves', () => {
    const paths = requestedPaths(client)
    // Stated positively so the assertion below cannot go vacuous by the extractor breaking and
    // finding nothing at all.
    assert.ok(paths.length >= 28, `expected the call sites, found ${paths.length}: ${paths.join(', ')}`)

    for (const path of new Set(paths)) {
      const shape = placeholder(path)
      assert.ok(
        SURFACE.some((r) => matchesShape(shape, r.path)),
        `src/lib/devplatform.ts requests ${path}, which is not a whole route shape in the verified surface`,
      )
    }
  })

  it('and it never requests a path the service does not serve, including a served PREFIX', () => {
    // ══════════════════════════════════════════════════════════════════════════════════════════
    // THE MUTATION, IN THE SUITE.
    //
    // It is not enough that the check says "all good". It has to be shown that it can say
    // otherwise, and specifically on the case a prefix version would pass. Every path below BEGINS
    // with something `devplatform` really serves.
    // ══════════════════════════════════════════════════════════════════════════════════════════
    const dead = [
      // The `micro-mint` defect's shape: a served prefix with a resource bolted on.
      '/v1/projects/${id}/keys/${keyId}',
      '/v1/organisations/${id}/projects/${projectId}',
      // Right resource, one segment too many.
      '/v1/webhook-endpoints/${id}/deliveries/latest',
      // Right shape, wrong resource — this is what a prefix check cannot see.
      '/v1/projects/${id}/credentials',
      // A two-segment helper collapsing a path. `/v1/projects/x/keys` has four segments; a
      // `${scope}` standing for `projects/${id}` gives three, matching nothing.
      '/v1/${scope}/keys',
      // Keys hang off a PROJECT, never off an organisation, and this is the mistake somebody makes
      // reading the two `/v1/organisations/:id/…` routes and assuming the family goes further.
      // Four segments under a served prefix, and no route has that shape.
      //
      // This entry replaces `/v1/organisations`, which was in this list until
      // `micro-devplatform@e13c154` and is now genuinely served — see SURFACE. It was removed
      // rather than left to fail, because a mutation list asserting the absence of something the
      // service serves is a list that is wrong about the service.
      '/v1/organisations/${id}/keys',
    ]
    for (const path of dead) {
      assert.equal(
        SURFACE.some((r) => matchesShape(placeholder(path), r.path) && r.method === 'GET'),
        false,
        `GET ${path} is not served by micro-devplatform, but this check accepted it`,
      )
    }

    // And it is not simply refusing everything: every route in the surface matches itself.
    for (const route of SURFACE) {
      assert.ok(matchesShape(route.path, route.path), route.path)
    }
  })

  it('names every route it calls or declines in the client, and says which file it read', () => {
    // This asserted that the client's header carried the LINE from the table beside it — three
    // copies of one number, of which the copies are the ones that go stale. What is worth having
    // is that the client's own tables, which is where the REASON each route is called or declined
    // is written, still have a row per route: a decision keyed to nothing is a decision nobody can
    // check, and that is the failure the citation was standing in for.
    for (const route of ALL) {
      // The path has no regex metacharacter in it — `:id` and `/` are literal — so it goes in as it is.
      const row = new RegExp(`\`${route.method}\`\\s*\\|\\s*\`${route.path}\``)
      assert.match(
        client,
        row,
        `${route.method} ${route.path} has no row in the tables in src/lib/devplatform.ts`,
      )
    }
    // And that it says where it read the surface FROM. The file, not a position in it.
    assert.ok(
      client.includes('devplatform/src/server.ts'),
      'src/lib/devplatform.ts no longer says which service source its surface was read from',
    )
  })

  it('every call site uses a method the surface table cites for that shape', () => {
    const calls = requestedCalls(client)
    assert.ok(calls.length >= 28, `expected the call sites, found ${calls.length}`)
    for (const call of calls) {
      assert.ok(
        SURFACE.some((r) => r.method === call.method && matchesShape(placeholder(call.path), r.path)),
        `src/lib/devplatform.ts sends ${call.method} ${call.path}, which is not in the verified surface`,
      )
    }
  })

  it('every declined route says why, and none of them is called', () => {
    const calls = requestedCalls(client)
    for (const route of DECLINED) {
      assert.ok(
        calls.every(
          (call) => !(call.method === route.method && matchesShape(placeholder(call.path), route.path)),
        ),
        `${route.method} ${route.path} is declined but src/lib/devplatform.ts requests it`,
      )
    }
  })

  it('reaches every route the service serves that it does not decline', () => {
    // The other direction of the same rule: a route in SURFACE that no wrapper actually calls is a
    // table entry describing a client that does not exist.
    const calls = requestedCalls(client)
    const unreached = SURFACE.filter(
      (route) =>
        !calls.some(
          (call) => call.method === route.method && matchesShape(placeholder(call.path), route.path),
        ),
    ).map((route) => `${route.method} ${route.path}`)
    assert.deepEqual(unreached, [], 'the surface table names a route no wrapper calls')
  })

  it('sends an Idempotency-Key on exactly the routes the service wraps, and on no other', () => {
    // The header is required on five routes and unread on eleven other mutations. Sending it where
    // it is not read is dishonest; omitting it where it is required is a 400 on the one action in
    // this product that mints a credential.
    const calls = requestedCalls(client)
    for (const call of calls) {
      const route = SURFACE.find(
        (r) => r.method === call.method && matchesShape(placeholder(call.path), r.path),
      )
      if (!route) continue
      const sends = /idempotently\(/.test(call.block)
      assert.equal(
        sends,
        route.idempotent,
        `${route.method} ${route.path}: the client ${sends ? 'sends' : 'does not send'} an ` +
          `Idempotency-Key and the service ${route.idempotent ? 'requires' : 'does not read'} one`,
      )
    }
    // Positively, so a broken extractor cannot make this vacuous.
    const wrapped = SURFACE.filter((r) => r.idempotent).length
    assert.equal(wrapped, 5, `the service wraps five routes; the table names ${wrapped}`)
  })
})

/**
 * THE TWO REFUSALS THIS CLIENT MAKES BEFORE A REQUEST EXISTS.
 *
 * Both mirror something the service also refuses, and neither is decoration:
 *
 *   * a malformed id is `500 internal` upstream, not a 400 — `ctx.params['id']` reaches a `uuid`
 *     column on every route that predates `requireUuid`. A console whose own addresses are those
 *     ids must not turn a typo into a status-page visit.
 *   * a quota RAISE is a 403 upstream. Refusing it here means a developer reads a sentence about
 *     the rule rather than one about their authority.
 *
 * The property asserted is **that no request was sent**, not merely that a promise rejected. A
 * guard that threw after `fetch` had already gone out would pass a check on the error alone while
 * leaving the 500 exactly where it was, so `stub.calls` is the assertion in both.
 */
describe('the client refuses, before the wire, what the service refuses on it', () => {
  let stub: FetchStub | null = null

  afterEach(() => {
    stub?.restore()
    stub = null
    removeWindow()
  })

  /** A fetch that fails the test if it is ever reached. */
  function noRequestExpected(): FetchStub {
    installWindow('http://localhost:5183/')
    return installFetch(() => json(200, { ok: true }))
  }

  it('sends nothing at all when a path id is not a uuid', async () => {
    stub = noRequestExpected()
    await assert.rejects(
      // An async wrapper, because these guards throw SYNCHRONOUSLY — the request is refused before
      // a promise exists, which is the property being asserted. `assert.rejects` re-throws a
      // synchronous throw without ever consulting the validator, so the throw has to become a
      // rejection first or this check would report the right error as an unexpected one.
      async () => getProject('not-a-uuid'),
      (err: unknown) =>
        err instanceof ApiError && err.status === 0 && err.code === 'malformed_id',
      'a malformed project id must be refused as a malformed id, not as a server fault',
    )
    assert.deepEqual(stub.calls, [], 'a request went out with a malformed id in the path')
  })

  it('accepts a real uuid, so the guard is not simply refusing everything', async () => {
    // The mutation, in the suite: a check that rejected every id would pass the test above and
    // break the whole console.
    stub = noRequestExpected()
    await getProject('5c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f')
    assert.equal(stub.calls.length, 1)
    assert.match(stub.calls[0]?.url ?? '', /\/v1\/projects\/5c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f$/)
  })

  it('sends nothing when asked to RAISE a quota', async () => {
    stub = noRequestExpected()
    await assert.rejects(
      async () =>
        lowerQuota('5c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f', {
          environment: 'test',
          period: 'minute',
          maxUnits: 5_000,
          current: 1_000,
        }),
      (err: unknown) =>
        err instanceof ApiError && err.status === 0 && err.code === 'quota_raise_refused',
      'a raise must be refused here as well as upstream',
    )
    assert.deepEqual(stub.calls, [], 'a quota raise went out on the wire')
  })

  it('sends nothing when asked to set a quota to zero', async () => {
    // Zero is not expressible: `quotas_max_positive` refuses it at the database, and the service
    // says why — a quota of zero is a suspension, which is a status on the organisation rather
    // than a limit on a meter. It is smaller than the current value, so the direction check alone
    // would let it through.
    stub = noRequestExpected()
    await assert.rejects(
      async () =>
        lowerQuota('5c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f', {
          environment: 'test',
          period: 'minute',
          maxUnits: 0,
          current: 1_000,
        }),
      (err: unknown) => err instanceof ApiError && err.code === 'invalid_quota',
    )
    assert.deepEqual(stub.calls, [], 'a quota of zero went out on the wire')
  })

  it('does send a genuine reduction, as a PUT with no Idempotency-Key', async () => {
    stub = noRequestExpected()
    await lowerQuota('5c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f', {
      environment: 'test',
      period: 'minute',
      maxUnits: 100,
      current: 1_000,
    })
    assert.equal(stub.calls.length, 1)
    const call = stub.calls[0]
    assert.equal(call?.method, 'PUT')
    assert.match(call?.url ?? '', /\/v1\/projects\/[0-9a-f-]+\/quotas$/)
    // The route is not wrapped, so a header here would be this client inventing a contract.
    assert.equal(call?.headers['idempotency-key'], undefined)
    // `current` is this app's own bookkeeping and must not reach the service, which reads the
    // stored row rather than trusting the caller's idea of it.
    assert.deepEqual(JSON.parse(call?.body ?? '{}'), {
      environment: 'test',
      period: 'minute',
      maxUnits: 100,
    })
  })
})

describe('the cited lines are the lines that register the routes', () => {
  if (server === undefined) {
    // NOT a silent pass, and no longer a loud one either: this was a GREEN test named "SKIPPED",
    // which counted towards `pass` and towards the number a reader compares between runs. `t.skip()`
    // puts it in the `skipped` column, where an unmeasured check belongs. The name keeps the exact
    // words ci.yml greps for, so the workflow's "it skipped itself while the sibling was present"
    // guard still has something to match.
    it('SKIPPED: no micro-devplatform checkout — CI checks one out and requires this to run', (t) => {
      t.skip('micro-devplatform is not checked out; the cross-repository half did not run')
    })
    return
  }

  const found = server
  const source = readFileSync(found, 'utf8')
  const lines = source.split('\n')

  /**
   * WHERE THE SERVICE REALLY REGISTERS A ROUTE — found by what the line SAYS.
   *
   * `cite()` refuses to answer unless exactly one line matches, so the anchor cannot quietly follow
   * a second `define(` that appears later, and a route the service DELETES throws here naming the
   * anchor rather than silently reading whatever moved into its old line. The trailing `',` is
   * load-bearing: without it `define('GET', '/v1/apps'` also matches `/v1/apps/pending` and
   * `/v1/apps/:slug`, and `cite()` would refuse all three for matching three lines.
   */
  const pins = new Map<Route, Citation>()
  function pin(route: Route): Citation {
    const at = pins.get(route) ?? cite(found, `define('${route.method}', '${route.path}',`)
    pins.set(route, at)
    return at
  }

  it('reads a server with a route table in it, so this cannot pass on an empty file', () => {
    const defines = lines.filter((l) => /^\s{4}define\('/.test(l))
    assert.ok(defines.length >= 35, `expected devplatform's route list, found ${defines.length} defines`)
  })

  for (const route of ALL) {
    it(`${route.method} ${route.path} is registered in devplatform/src/server.ts`, () => {
      // `pin()` THROWS unless exactly one line registers this exact method and path, so a route the
      // service deletes, renames or registers twice fails here and names the anchor it looked for.
      // What it no longer does is compare the line it found against a line written down above:
      // that comparison was the whole of this repository's exposure to somebody else's edits, and
      // it went red twice in a week for route tables that had only MOVED.
      assert.ok(pin(route).line > 0, `${route.method} ${route.path} is not registered by the service`)
    })
  }

  it('this bundle knows about every /v1 route devplatform serves — called or declined', () => {
    // Both directions. A route the service grew that neither table has heard of is not a failure of
    // the app, but it IS the moment somebody should look — the citations are only trustworthy while
    // somebody is re-reading them.
    const registered = lines
      .map((l) => /^\s{4}define\('([A-Z]+)',\s*'([^']+)'/.exec(l))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => `${m[1]} ${m[2]}`)
      .filter((r) => r.includes('/v1/'))
    const known = ALL.map((r) => `${r.method} ${r.path}`)
    assert.deepEqual(
      registered.filter((r) => !known.includes(r)),
      [],
      'devplatform serves a /v1 route this app has never read. Read it, then add it to SURFACE or DECLINED.',
    )
    assert.equal(registered.length, ALL.length, 'the two tables and the service disagree in size')
  })

  /**
   * Read one handler body, by walking forward from the route's OWN `define(` to the next one.
   *
   * NO LINE NUMBER IS WRITTEN HERE, AND NONE IS READ OUT OF THE TABLE EITHER. `micro-trade-web`
   * hardcoded one in two guards, and when the service's table moved, one of them kept passing while
   * grading a different function entirely. This file's previous version took its start from
   * `route.line`, which is the same defect one step removed: with the table 34 lines stale,
   * `DELETE /v1/webhook-endpoints/:id authenticates by project:write` PASSED while reading
   * `POST /v1/webhook-endpoints/:id/disable`, and the three `none` routes passed while reading
   * three unrelated handlers that happen to match none of the mechanisms. Both ends are found now:
   * the start by {@link pin}, the end by scanning.
   */
  function bodyOf(route: Route): string {
    const start = pin(route).line - 1
    let end = lines.length
    for (let i = start + 1; i < lines.length; i++) {
      if (/^\s{4}define\('/.test(lines[i] ?? '')) {
        end = i
        break
      }
    }
    return lines.slice(start, end).join('\n')
  }

  it('THE LITERAL `authenticate(ctx, deps)` APPEARS IN NO ROUTE HANDLER, WHICH IS WHY THIS TEST EXISTS', () => {
    // The premise of the whole mechanism table, asserted rather than assumed. If devplatform ever
    // inlines the call into a handler, this goes red and the mechanism patterns should be revisited
    // rather than quietly left describing something that has changed.
    for (const route of ALL) {
      assert.doesNotMatch(
        bodyOf(route),
        /await authenticate\(ctx, deps\)/,
        `${route.method} ${route.path} now calls authenticate() directly; a boolean check would ` +
          'suddenly become meaningful and the mechanism table needs re-reading',
      )
    }
    // And the helpers really are where it lives — three call sites, none of them a route.
    assert.equal(
      [...source.matchAll(/await authenticate\(ctx, deps\)/g)].length,
      3,
      'devplatform no longer resolves its caller through exactly three helpers',
    )
  })

  for (const route of ALL) {
    it(`${route.method} ${route.path} authenticates by ${route.auth}`, () => {
      const body = bodyOf(route)
      if (route.auth === 'none') {
        for (const pattern of ANY_MECHANISM) {
          assert.doesNotMatch(
            body,
            pattern,
            `${route.method} ${route.path} is treated as public and its handler matches ${pattern}`,
          )
        }
        return
      }
      assert.match(
        body,
        MECHANISM[route.auth],
        `${route.method} ${route.path}: this app treats it as ${route.auth} and the handler disagrees`,
      )
    })
  }

  it('the five wrapped routes are the five this client sends a header to', () => {
    for (const route of SURFACE) {
      assert.equal(
        /withIdempotentRoute/.test(bodyOf(route)),
        route.idempotent,
        `${route.method} ${route.path}: the service ${route.idempotent ? 'should' : 'should not'} ` +
          'wrap this route, and does the opposite',
      )
    }
  })

  it('the header name this client sends is the one the service reads', () => {
    assert.match(
      source,
      /export const IDEMPOTENCY_HEADER = 'idempotency-key'/,
      'devplatform no longer reads an `idempotency-key` header',
    )
    assert.match(idempotency, /export const IDEMPOTENCY_HEADER = 'idempotency-key'/)
  })

  it('the two idempotency refusal codes are still spelled the same on both sides', () => {
    for (const code of ['idempotency_key_reuse', 'idempotency_in_flight']) {
      assert.ok(source.includes(`'${code}'`), `devplatform no longer answers ${code}`)
      assert.ok(idempotency.includes(`'${code}'`), `this client no longer handles ${code}`)
    }
  })

  it('the shown-once sentence in this bundle is the service’s own, character for character', () => {
    // The one string in this repository that is a duplicate of the service's on purpose: it has to
    // be shown BEFORE the request is sent, and a warning that only appears with the secret is a
    // warning nobody read in time. Duplication without a check is how it softens.
    // Scoped to the key-issuance handler, and the line comes out of SURFACE rather than being
    // written here: `GET /v1/scopes` also carries a `note:` field, and an unscoped search finds that
    // one first and compares the wrong string.
    const issuance = SURFACE.find((r) => r.method === 'POST' && r.path === '/v1/projects/:id/keys')
    assert.ok(issuance, 'the surface table no longer names the key-issuance route')
    const theirs = /note: '([^']+)'/.exec(bodyOf(issuance))?.[1]
    assert.ok(theirs, 'devplatform no longer attaches a note to an issued key')
    assert.ok(
      format.includes(theirs),
      `src/lib/format.ts does not carry the service's sentence verbatim:\n  ${theirs}`,
    )
  })

  /**
   * The two shapes in which `devplatform` attaches a credential to a response.
   *
   * ══════════════════════════════════════════════════════════════════════════════════════════════
   * A GUARD THAT DESCRIBED FOUR ROUTES AND EXAMINED ONE.
   *
   * The version of this check that shipped read `/^\s*(?:secretKey|clientSecret):/gm` and asserted
   * the count was 1, under a comment claiming that "`secretKey`, `clientSecret` and the webhook
   * `secret` appear on exactly the four creating routes and nowhere else". They do not appear in
   * that form. Three of the four attach their secret by SPREAD —
   * `body: { …(reply.body …), secret }` — which has no `field:` at the start of a line, so the
   * regex never saw them. The assertion was true, the comment was false, and a reveal route added
   * to the webhook or OAuth path would have passed it.
   *
   * Both shapes are matched now, the total is four rather than one, and each is required to sit
   * inside a route the table already names as a creating one — so a fifth anywhere fails, and a
   * fourth that MOVED to a different route fails too.
   * ══════════════════════════════════════════════════════════════════════════════════════════════
   */
  const ATTACHES_SECRET =
    /^\s*secretKey:|body: \{ \.\.\.\(reply\.body as Record<string, unknown>\), (?:secret|clientSecret) \}/

  /** The route a line belongs to: the nearest `define(` at or above it. No line number is written. */
  function routeAt(line: number): string {
    for (let i = line - 1; i >= 0; i--) {
      const match = /^\s{4}define\('([A-Z]+)',\s*'([^']+)'/.exec(lines[i] ?? '')
      if (match) return `${match[1]} ${match[2]}`
    }
    return 'outside any route'
  }

  it('there is still no route that returns a secret a second time', () => {
    // The claim the whole `<ShownOnce>` component rests on, and the reason this app may never draw
    // a reveal control: a credential is on the wire exactly where it is minted.
    const creating = [
      'POST /v1/projects/:id/keys',
      'POST /v1/projects/:id/webhook-endpoints',
      'POST /v1/webhook-endpoints/:id/rotate-secret',
      'POST /v1/projects/:id/oauth-clients',
    ]
    // Each of the four is a route this table already knows about, so the list above cannot drift
    // into naming something the service does not serve.
    for (const route of creating) {
      assert.ok(
        SURFACE.some((r) => `${r.method} ${r.path}` === route),
        `${route} is not in the surface table`,
      )
    }

    const attaching = lines
      .map((line, index) => (ATTACHES_SECRET.test(line) ? index + 1 : 0))
      .filter((line) => line > 0)
    assert.equal(
      attaching.length,
      4,
      `four routes mint a credential; ${attaching.length} places attach one to a response ` +
        `(${attaching.map((line) => `${routeAt(line)} at :${line}`).join('; ')})`,
    )
    assert.deepEqual(
      [...new Set(attaching.map(routeAt))].sort(),
      [...creating].sort(),
      'a secret is attached to a response by a route that does not mint one',
    )
    assert.match(
      source,
      /api_keys_slow_kdf_only|scrypt/,
      'the service no longer mentions scrypt; the claim that a key cannot be recovered needs re-checking',
    )
  })

  /**
   * The DIRECTION rule on `PUT /v1/projects/:id/quotas`, which is what this console's control rests
   * on.
   *
   * The mechanism table records that the route takes an operator OR a `project:write` caller. That
   * alone would be satisfied by a handler that let anybody with `project:write` write any number —
   * which is the defect this repository reported. The property the "lower my limit" control depends
   * on is narrower: a non-operator may write a value that is not greater than the one already
   * there, and may not create a row where none exists. Both are asserted here, against the handler,
   * because src/lib/devplatform.ts refuses a raise BEFORE the wire and a client-side refusal that
   * the service does not also make is decoration.
   */
  it('a non-operator may lower a quota and may not raise or create one', () => {
    const route = SURFACE.find((r) => r.method === 'PUT' && r.path === '/v1/projects/:id/quotas')
    assert.ok(route, 'the surface table no longer names the quota route')
    const body = bodyOf(route)
    assert.match(
      body,
      /if \(!operator\) \{[\s\S]*maxUnits > current\.maxUnits[\s\S]*ForbiddenError/,
      'a non-operator is no longer refused a RAISE; this console must not offer to lower a limit ' +
        'on a route that would equally accept a raise',
    )
    assert.match(
      body,
      /const current = await findQuota\([\s\S]*if \(!current\) \{[\s\S]*ForbiddenError/,
      'a missing quota row is no longer an operator decision; absence means UNLIMITED, so a ' +
        'finite value written where there was no row is a raise wearing a reduction’s clothes',
    )
    // And the ceiling the service names in its 400, so this app can say the number rather than
    // paraphrasing it.
    assert.match(
      source,
      /MAX_UNITS_CEILING\[period\]/,
      'the quota reply no longer carries the ceiling',
    )
  })
})
