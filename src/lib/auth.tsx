/**
 * Session state for the tree, and the gate in front of the routes that need one.
 *
 * Hiding a route is NOT the security boundary. `devplatform` decides every question itself: a user
 * token is verified against identity's JWKS (`devplatform/src/server.ts:525`), the caller's role in
 * an organisation is asked of identity PER REQUEST with the caller's own token forwarded
 * (`devplatform/src/server.ts:667`, `devplatform/src/membership.ts:95-129`), and a project or
 * organisation the caller may not see answers **404 rather than 403**
 * (`devplatform/src/server.ts:629`, `:655`) so that ids are not enumerable across customers. This
 * gate exists so a signed-out developer is sent to sign in instead of being shown a console made
 * entirely of 401s.
 *
 * **Three of the ten screens are deliberately outside the gate**, because the service put their
 * routes outside it: `GET /v1/scopes` (`devplatform/src/server.ts:744`), `GET /v1/apps` (`:1297`)
 * and `GET /v1/apps/:slug` (`:1325`) read no credential at all. Sending an anonymous visitor to
 * sign in to read the scope vocabulary — the page written for somebody deciding whether to build
 * on this platform at all — would be the mirror of the estate's older mistake of sending a bearer
 * to a route that never wanted one. See `src/lib/routes.ts`.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * ── The `/auth/me` shape ──────────────────────────────────────────────────────────────────────
 *
 * Identity answers `{ user: {...}, session: {...}, organisations: [...] }` — the profile is
 * NESTED under `user`. The route is `GET /auth/me` in `identity/src/server.ts` and the body is
 * built by `toPublicUser` at `identity/src/users.ts:52-63`; both were re-read against the source
 * for this repository rather than carried over.
 *
 * **The route citation names the FILE, not a line in it, and that is a correction.** It said
 * `:891-903`. micro-identity's route table has since moved twice in one afternoon — 891 → 954 →
 * 1000 — so the line existed and registered somebody else's route, which reads as verified and
 * verifies nothing. `micro-explorer-web` reached the same conclusion an hour earlier and its
 * `test/auth.test.ts` finds the handler by content. The file is the durable half of the claim.
 *
 * That shape is worth stating because the estate got it wrong once, at the root: the web template
 * declared `interface Me { handle?, roles? }` and read both fields off the TOP level, where they
 * are not, and four frontends inherited it — `roles` was then always null, `isAdmin` in the shared
 * company bar was always false, and the switcher hid every `adminOnly` entry from every signed-in
 * operator. It has since been fixed everywhere;
 * `web-template/src/lib/auth.tsx` declares the nested shape.
 *
 * **This app is nested-ONLY. There is no flat fallback here, and that is a departure from the
 * siblings with a reason.** `micro-trade-web` and `micro-worlds-web` keep a flat fallback so a
 * proxy or an older build on the rollback path still signs somebody in. On this surface the flat
 * shape would be doing something different: `organisations` has no flat spelling at all, so a body
 * that only satisfied the fallback would produce a signed-in console with an empty organisation
 * list — which renders as "you administer nothing" rather than as "this answer was not
 * understood". Being wrong about which organisations somebody may enrol is worse than refusing to
 * guess, so an unrecognised body is read as nobody. `test/auth.test.ts` proves both directions.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useLocation } from 'react-router-dom'
import type { AccountState } from '@cloudsforge/ui'
import { AUTH_EXPIRED_EVENT, clearTokens, hasSession, nimbus, signIn, signOut } from './api.ts'

/**
 * One identity organisation the signed-in user belongs to, as `/auth/me` carries it.
 *
 * `listOrganisationsFor` selects `o.id, o.slug, o.name, o.kind, o.status, m.role` and joins the
 * membership (`identity/src/organisations.ts:148-159`), so the ROLE is on the wire. This app needs
 * both halves: the id is what `POST /v1/organisations` enrols
 * (`devplatform/src/server.ts:780`), and the role is what decides whether the attempt can possibly
 * succeed — devplatform re-asks identity for it and refuses anything below admin (`:784-785`).
 *
 * The role is used to LABEL, never to authorise. The decision is made by devplatform against
 * identity on every request; a browser deciding it would be a browser deciding its own authority.
 */
export interface IdentityOrg {
  readonly id: string
  readonly name: string
  readonly slug: string
  readonly role: string
}

/** What identity answers at `/auth/me`, narrowed to what this app needs. Nested only. */
export interface MeResponse {
  user?: {
    id?: string | null
    handle?: string | null
    roles?: readonly string[] | null
  } | null
  organisations?: readonly unknown[] | null
}

export interface Developer {
  readonly userId: string | null
  readonly handle: string | null
  readonly roles: readonly string[]
  /** The identity organisations this account belongs to, with the role it holds in each. */
  readonly organisations: readonly IdentityOrg[]
}

const NOBODY: Developer = { userId: null, handle: null, roles: [], organisations: [] }

/**
 * Read the developer out of an `/auth/me` body.
 *
 * A pure function so `test/auth.test.ts` can prove the shape without a browser, and so the
 * nested-versus-flat mistake cannot be made silently a sixth time.
 *
 * An organisation with no id is DROPPED rather than kept with a placeholder. The id is what an
 * enrolment names, and enrolling a guess would create a developer organisation against an identity
 * organisation the user has nothing to do with — the exact thing `devplatform/src/server.ts:781-783`
 * exists to refuse.
 */
export function readDeveloper(body: unknown): Developer {
  if (typeof body !== 'object' || body === null) return NOBODY
  const top = body as MeResponse
  const nested = typeof top.user === 'object' && top.user !== null ? top.user : undefined
  if (!nested) return NOBODY

  return {
    userId: str(nested.id) ?? null,
    handle: str(nested.handle) ?? null,
    roles: list(nested.roles) ?? [],
    organisations: readOrganisations(top.organisations),
  }
}

function readOrganisations(value: unknown): readonly IdentityOrg[] {
  if (!Array.isArray(value)) return []
  const out: IdentityOrg[] = []
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue
    const row = entry as Record<string, unknown>
    const id = str(row['id'])
    if (id === undefined) continue
    out.push({
      id,
      name: str(row['name']) ?? id,
      slug: str(row['slug']) ?? '',
      role: str(row['role']) ?? 'unknown',
    })
  }
  return out
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function list(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.filter((v): v is string => typeof v === 'string')
}

/**
 * Which identity roles devplatform will accept for an enrolment.
 *
 * Copied from `devplatform/src/membership.ts:53` — `owner` and `admin`, nothing else — and used
 * only to say so on screen. `devplatform/src/server.ts:784-785` is where it is decided, against
 * identity, with the caller's own token. This constant existing does not make the browser an
 * authority; it makes the screen honest about what will happen.
 */
export const ENROLLING_ROLES: readonly string[] = ['owner', 'admin']

export function mayEnrol(org: IdentityOrg): boolean {
  return ENROLLING_ROLES.includes(org.role)
}

export type SessionStatus = 'loading' | 'anonymous' | 'signedIn'

export interface Session {
  status: SessionStatus
  account: AccountState
  developer: Developer
  signIn: (returnTo?: string) => void
  signOut: () => void
}

const SessionContext = createContext<Session | null>(null)

export function useSession(): Session {
  const value = useContext(SessionContext)
  // Throwing beats returning a signed-out default: a component rendered outside the provider would
  // otherwise show an anonymous UI to a signed-in developer and nobody would ever see why.
  if (!value) throw new Error('useSession must be used inside <AuthProvider>')
  return value
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>(() => (hasSession() ? 'loading' : 'anonymous'))
  const [developer, setDeveloper] = useState<Developer>(NOBODY)

  useEffect(() => {
    if (!hasSession()) return
    let live = true
    // The identity call is allowed to fail quietly: an unreachable account service must not sign
    // somebody out while they are reading whether a key was revoked. What it may NOT do is leave a
    // stale organisation list behind — the list is what an enrolment is named from — so a failure
    // keeps the session and empties the list rather than the other way round.
    nimbus<unknown>('/auth/me')
      .then((profile) => {
        if (!live) return
        setDeveloper(readDeveloper(profile))
        setStatus('signedIn')
      })
      .catch(() => {
        if (!live) return
        setDeveloper(NOBODY)
        setStatus(hasSession() ? 'signedIn' : 'anonymous')
      })
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    const onExpired = () => {
      clearTokens()
      setDeveloper(NOBODY)
      setStatus('anonymous')
    }
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired)
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired)
  }, [])

  const doSignOut = useCallback(() => {
    setDeveloper(NOBODY)
    setStatus('anonymous')
    signOut()
  }, [])

  const value = useMemo<Session>(
    () => ({
      status,
      account: {
        signedIn: status === 'signedIn',
        handle: developer.handle,
        roles: developer.roles,
      },
      developer,
      signIn,
      signOut: doSignOut,
    }),
    [status, developer, doSignOut],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

/**
 * Gate a route behind a session.
 *
 * The redirect carries the CURRENT path, search and hash, so somebody who followed a link to a
 * project lands back on that project rather than on the index. It is fired from an effect rather
 * than during render because a redirect during render runs twice under StrictMode, and the second
 * one would overwrite the first's return address.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { status, signIn: go } = useSession()
  const location = useLocation()

  useEffect(() => {
    if (status !== 'anonymous') return
    const back = `${window.location.origin}${location.pathname}${location.search}${location.hash}`
    go(back)
  }, [status, location.pathname, location.search, location.hash, go])

  if (status === 'loading') return <LoadingGate label="Checking your session" />
  if (status === 'anonymous') return <LoadingGate label="Taking you to sign in" />
  return <>{children}</>
}

function LoadingGate({ label }: { label: string }) {
  return (
    <div className="dp-state dp-state--loading" role="status">
      <span className="dp-spinner" aria-hidden="true" />
      <p className="dp-state__title">{label}</p>
    </div>
  )
}
