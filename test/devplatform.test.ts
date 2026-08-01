/**
 * THE ROUTE TABLE, CHECKED AGAINST THE SERVICE THAT SERVES IT.
 *
 * Every client in this estate that was built against an imagined surface passed its own tests. That
 * is the whole problem: a test that asserts "the client calls /v1/keys" is a test that the client
 * agrees with itself. So this file does not assert paths in the abstract — it reads
 * `devplatform/src/server.ts` from the sibling checkout and requires that each path and method this
 * bundle calls is REGISTERED there, at the line the citation names.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * ── FOUR CHECKS, AND THREE OF THEM EXIST BECAUSE A SIBLING'S VERSION HAS ALREADY BEEN FOOLED ──
 *
 * **1. Citations.** Each entry in `SURFACE` names a line; that line must contain the `define(` that
 * registers exactly that method and path.
 *
 * **2. SHAPES, never prefixes.** `micro-market`'s guard matched `path.startsWith(servedPrefix)` and
 * would have passed two genuinely dead paths because they BEGAN with a served prefix;
 * `micro-mint-web` then shipped exactly that defect. `matchesShape` below is the corrected form
 * from `market/src/indexerclient.test.ts:230-249`: same segment count, every segment agrees, and a
 * `${...}` is exactly one segment.
 *
 * **3. HOW each route authenticates, not whether — and this service is the reason.** `micro-worlds-web`
 * greps each handler body for `await authenticate(ctx, deps)` and asserts a boolean. There is no
 * such literal inside ANY of devplatform's 31 `/v1` handlers: the call appears three times in the
 * file and all three are inside helpers (`server.ts:473`, `:480`, `:516`). Run here, the boolean
 * check would report all thirty-one routes public, including the twenty-five that authenticate —
 * and a client built on that answer would send no bearer to the route that mints credentials. So
 * every route carries a MECHANISM and the handler body is matched against that mechanism's pattern.
 *
 * **4. NO LINE NUMBER IS EVER WRITTEN INSIDE A CHECK.** Two guards in `micro-trade-web` hardcoded
 * one, and when the service's route table moved, one of them went on PASSING while grading a
 * completely different function — a guard that cannot fail is worse than none. Every line this file
 * reads comes out of the `SURFACE`/`DECLINED` tables below, and the handler-body extractor walks
 * forward from the cited line to the next `define(` rather than to a number.
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
import { describe, it } from 'node:test'

const here = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url))

/** Where a micro-devplatform checkout is, in the order CI and a developer's machine put it. */
const CANDIDATES = [
  process.env['CLOUDSFORGE_DEVPLATFORM_DIR'],
  here('../devplatform/src/server.ts'),
  here('.devplatform/src/server.ts'),
].filter((v): v is string => Boolean(v))

const server = CANDIDATES.find((p) => existsSync(p))

/**
 * How a route establishes the caller, as one of six mechanisms.
 *
 * The regex for each is a property of `devplatform/src/server.ts`, not a guess: `none` asserts the
 * ABSENCE of any of the other five, which is what makes the set exhaustive rather than a list of
 * things somebody happened to check for.
 */
type Auth =
  | 'none'
  | 'key'
  | 'user+admin'
  | 'org:read'
  | 'org:write'
  | 'project:read'
  | 'project:write'
  | 'hmac'

/** What a handler body must contain for each mechanism. `none` is handled separately. */
const MECHANISM: Readonly<Record<Exclude<Auth, 'none'>, RegExp>> = {
  key: /await authenticateKeyOnly\(ctx, deps\)/,
  'user+admin': /await authenticateUser\(ctx, deps\)[\s\S]*permits\(role, ADMIN_ROLES\)/,
  'org:read': /await authoriseOrg\(ctx, deps, [^)]*'read'\)/,
  'org:write': /await authoriseOrg\(ctx, deps, [^)]*'write'\)/,
  'project:read': /await authoriseProject\(ctx, deps, [^)]*'read'\)/,
  'project:write': /await authoriseProject\(ctx, deps, [^)]*'write'\)/,
  hmac: /verifyInbound\(raw, headerOf\(ctx\.req, SIGNATURE_HEADER\), deps\.ingestSecrets\)/,
}

/** Every pattern, used to prove a `none` route matches NONE of them. */
const ANY_MECHANISM = Object.values(MECHANISM)

interface Route {
  readonly method: string
  readonly path: string
  readonly line: number
  readonly auth: Auth
  /** True when the handler is wrapped in `withIdempotentRoute`, so the header is required. */
  readonly idempotent: boolean
}

/**
 * The surface this bundle CALLS, with the line each was read from.
 *
 * Written down here as DATA so the checks below can be mechanical. If one of these citations is
 * wrong, the test fails and names it — which is the property a comment does not have.
 */
const SURFACE: readonly Route[] = [
  { method: 'GET', path: '/v1/scopes', line: 604, auth: 'none', idempotent: false },
  { method: 'POST', path: '/v1/organisations', line: 637, auth: 'user+admin', idempotent: false },
  { method: 'GET', path: '/v1/organisations/:id', line: 655, auth: 'org:read', idempotent: false },
  { method: 'GET', path: '/v1/organisations/:id/projects', line: 663, auth: 'org:read', idempotent: false },
  { method: 'POST', path: '/v1/projects', line: 671, auth: 'org:write', idempotent: true },
  { method: 'GET', path: '/v1/projects/:id', line: 694, auth: 'project:read', idempotent: false },
  { method: 'POST', path: '/v1/projects/:id/service-accounts', line: 706, auth: 'project:write', idempotent: false },
  { method: 'GET', path: '/v1/projects/:id/service-accounts', line: 717, auth: 'project:read', idempotent: false },
  { method: 'POST', path: '/v1/projects/:id/keys', line: 736, auth: 'project:write', idempotent: true },
  { method: 'GET', path: '/v1/projects/:id/keys', line: 790, auth: 'project:read', idempotent: false },
  { method: 'DELETE', path: '/v1/keys/:id', line: 812, auth: 'project:write', idempotent: false },
  { method: 'GET', path: '/v1/projects/:id/quotas', line: 856, auth: 'project:read', idempotent: false },
  { method: 'GET', path: '/v1/projects/:id/usage', line: 866, auth: 'project:read', idempotent: false },
  { method: 'POST', path: '/v1/projects/:id/webhook-endpoints', line: 876, auth: 'project:write', idempotent: true },
  { method: 'GET', path: '/v1/projects/:id/webhook-endpoints', line: 907, auth: 'project:read', idempotent: false },
  { method: 'POST', path: '/v1/webhook-endpoints/:id/rotate-secret', line: 916, auth: 'project:write', idempotent: true },
  { method: 'POST', path: '/v1/webhook-endpoints/:id/disable', line: 937, auth: 'project:write', idempotent: false },
  { method: 'DELETE', path: '/v1/webhook-endpoints/:id', line: 947, auth: 'project:write', idempotent: false },
  { method: 'GET', path: '/v1/webhook-endpoints/:id/deliveries', line: 956, auth: 'project:read', idempotent: false },
  { method: 'POST', path: '/v1/projects/:id/oauth-clients', line: 966, auth: 'project:write', idempotent: true },
  { method: 'GET', path: '/v1/projects/:id/oauth-clients', line: 1003, auth: 'project:read', idempotent: false },
  { method: 'DELETE', path: '/v1/oauth-clients/:id', line: 1008, auth: 'project:write', idempotent: false },
  { method: 'GET', path: '/v1/apps', line: 1022, auth: 'none', idempotent: false },
  { method: 'GET', path: '/v1/apps/:slug', line: 1027, auth: 'none', idempotent: false },
  { method: 'PUT', path: '/v1/projects/:id/application', line: 1034, auth: 'project:write', idempotent: false },
  { method: 'GET', path: '/v1/projects/:id/application', line: 1048, auth: 'project:read', idempotent: false },
  { method: 'POST', path: '/v1/projects/:id/application/submit', line: 1056, auth: 'project:write', idempotent: false },
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
  { method: 'GET', path: '/v1/keys/self', line: 624, auth: 'key', idempotent: false },
  { method: 'GET', path: '/v1/keys/:id', line: 797, auth: 'project:read', idempotent: false },
  { method: 'PUT', path: '/v1/projects/:id/quotas', line: 836, auth: 'project:write', idempotent: false },
  { method: 'POST', path: '/v1/events', line: 1175, auth: 'hmac', idempotent: false },
]

const ALL: readonly Route[] = [...SURFACE, ...DECLINED]

const client = readFileSync(here('src/lib/devplatform.ts'), 'utf8')
const idempotency = readFileSync(here('src/lib/idempotency.ts'), 'utf8')
const format = readFileSync(here('src/lib/format.ts'), 'utf8')

/* ------------------------------------------------ shapes, never prefixes */

/**
 * Does a requested path match a served pattern? Same segment count, and every segment agrees.
 *
 * **Segment counts, never prefixes.** Copied from `market/src/indexerclient.test.ts:230-249`, which
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

/** Every request path this client sends, read out of its source with the PROSE STRIPPED. */
export function requestedPaths(source: string): readonly string[] {
  return [...codeOf(source).matchAll(/['"`](\/v1\/[^'"`]*)['"`]/g)].map((m) => m[1] ?? '')
}

/**
 * Every call site as a METHOD and a path.
 *
 * The method matters: `GET /v1/projects/:id/keys` is called and there is no `POST` at that shape,
 * while `POST /v1/projects/:id/keys` is a different route with a different authority. A checker
 * that compared paths alone would confuse the two. `api()` defaults to GET
 * (`src/lib/api.ts:272`), so a call site with no `method:` is a GET, and the options object follows
 * the path in the same call — so the method is looked for between this path literal and the next.
 */
function requestedCalls(source: string): ReadonlyArray<{ method: string; path: string; block: string }> {
  const code = codeOf(source)
  const matches = [...code.matchAll(/['"`](\/v1\/[^'"`]*)['"`]/g)]
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
    assert.ok(paths.length >= 25, `expected the call sites, found ${paths.length}: ${paths.join(', ')}`)

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
      // The route that would exist if somebody assumed a list endpoint into being.
      '/v1/organisations',
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

  it('cites a line for every route, called or declined, in the client', () => {
    for (const route of ALL) {
      assert.ok(
        client.includes(`devplatform/src/server.ts:${route.line}`),
        `${route.method} ${route.path} has no citation in src/lib/devplatform.ts`,
      )
    }
  })

  it('every call site uses a method the surface table cites for that shape', () => {
    const calls = requestedCalls(client)
    assert.ok(calls.length >= 25, `expected the call sites, found ${calls.length}`)
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

describe('the cited lines are the lines that register the routes', () => {
  if (server === undefined) {
    // NOT a silent pass. It says which check did not run, and CI makes the absence fatal.
    it('SKIPPED: no micro-devplatform checkout — CI checks one out and requires this to run', () => {
      assert.ok(true)
    })
    return
  }

  const source = readFileSync(server, 'utf8')
  const lines = source.split('\n')

  it('reads a server with a route table in it, so this cannot pass on an empty file', () => {
    const defines = lines.filter((l) => /^\s{4}define\('/.test(l))
    assert.ok(defines.length >= 30, `expected devplatform's route list, found ${defines.length} defines`)
  })

  for (const route of ALL) {
    it(`${route.method} ${route.path} is registered at devplatform/src/server.ts:${route.line}`, () => {
      // 1-indexed citation, 0-indexed array.
      const line = lines[route.line - 1] ?? ''
      assert.match(
        line,
        new RegExp(`define\\('${route.method}',\\s*'${route.path.replace(/[/:]/g, '\\$&')}'`),
        `devplatform/src/server.ts:${route.line} is:\n  ${line.trim()}`,
      )
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
   * Read one handler body, by walking forward from the cited line to the next `define(`.
   *
   * NO LINE NUMBER IS WRITTEN HERE. `micro-trade-web` hardcoded one in two guards, and when the
   * service's table moved, one of them kept passing while grading a different function entirely.
   * The start comes from the table, and the end is found by scanning.
   */
  function bodyOf(line: number): string {
    const start = line - 1
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
        bodyOf(route.line),
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
      const body = bodyOf(route.line)
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
        /withIdempotentRoute/.test(bodyOf(route.line)),
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
    const theirs = /note: '([^']+)'/.exec(bodyOf(issuance.line))?.[1]
    assert.ok(theirs, 'devplatform no longer attaches a note to an issued key')
    assert.ok(
      format.includes(theirs),
      `src/lib/format.ts does not carry the service's sentence verbatim:\n  ${theirs}`,
    )
  })

  it('there is still no route that returns a secret a second time', () => {
    // The claim the whole `<ShownOnce>` component rests on. `secretKey`, `clientSecret` and the
    // webhook `secret` appear on exactly the four creating routes and nowhere else; a fifth
    // occurrence would mean a reveal route had appeared and the copy in this app would be wrong.
    const reveals = [...source.matchAll(/^\s*(?:secretKey|clientSecret):/gm)].length
    assert.equal(reveals, 1, 'a second route now puts a key secret on the wire')
    assert.match(
      source,
      /api_keys_slow_kdf_only|scrypt/,
      'the service no longer mentions scrypt; the claim that a key cannot be recovered needs re-checking',
    )
  })
})
