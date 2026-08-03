/**
 * The responses the scenarios are run against.
 *
 * Every shape is one `src/lib/devplatform.ts` declares, which was read out of `devplatform/src/`
 * at the lines that module cites. Typed against the client's own declarations so a drift between
 * them is a type error here rather than a scenario asserting a shape nothing produces.
 */
import type { ApiKeySummary, Project } from '../src/lib/devplatform.ts'

export const PROJECT_ID = '11111111-2222-3333-4444-555555555555'
export const ORG_ID = '66666666-7777-8888-9999-000000000000'
export const ENV_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
export const ENDPOINT_ID = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff'
/** A credential shaped like the real thing, and used nowhere but a stub. */
export const SECRET = 'cfk_live_0000000000000000000000000000000000000000'

export function project(over: Partial<Project> = {}): Project {
  return {
    id: PROJECT_ID,
    orgId: ORG_ID,
    name: 'Journey project',
    slug: 'journey-project',
    status: 'active',
    createdAt: '2026-07-01T09:00:00.000Z',
    environments: [
      { id: ENV_ID, projectId: PROJECT_ID, name: 'test', createdAt: '2026-07-01T09:00:00.000Z' } as never,
    ],
    ...over,
  }
}

export function key(over: Partial<ApiKeySummary> = {}): ApiKeySummary {
  return {
    id: 'key-1',
    projectId: PROJECT_ID,
    environmentId: ENV_ID,
    environment: 'test',
    serviceAccountId: null,
    display: 'cfk_test_0000…abcd',
    lookupId: 'lookup-1',
    name: 'A key',
    scopes: ['market:read'],
    createdBy: 'user:aaaaaaaa',
    createdAt: '2026-07-01T09:00:00.000Z',
    lastUsedAt: null,
    expiresAt: null,
    revokedAt: null,
    revokedReason: null,
    ...over,
  } as ApiKeySummary
}

/** The estate's error envelope — nested, as `errorReply()` builds it in every service. */
export function error(code: string, message: string): { error: { code: string; message: string } } {
  return { error: { code, message } }
}

/** The two `cf.*` keys a signed-in browser holds. `src/lib/api.ts` reads exactly these. */
export const SIGNED_IN = {
  'cf.accessToken': 'access-token-stub',
  'cf.refreshToken': 'refresh-token-stub',
}

/** `GET /auth/me` in `identity/src/server.ts` returns it this way: the profile is nested. */
export const ME = {
  user: { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', handle: 'developer', roles: ['customer'] },
  session: { id: 'session-1' },
  organisations: [],
}
