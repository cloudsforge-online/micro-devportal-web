/**
 * `/auth/me` NESTS THE PROFILE UNDER `user`, AND THIS APP IS NESTED-ONLY.
 *
 * Identity answers `{ user: {...}, session: {...}, organisations: [...] }`
 * (`GET /auth/me` in `identity/src/server.ts`, body built by `toPublicUser` at
 * `identity/src/users.ts`). The route citation names the file rather than a line: it named a
 * thirteen-line range, and micro-identity has moved that table twice since, so the range pointed
 * at real lines that register a different route.
 * The estate got this wrong once at the root — the web template declared `{ handle?, roles? }` and
 * read both off the TOP level, four frontends inherited it, and `isAdmin` in the shared bar was
 * false for every signed-in operator.
 *
 * `micro-trade-web` and `micro-worlds-web` keep a flat FALLBACK for a proxy on the rollback path.
 * This app deliberately does not, and the difference is the reason for the first block below: the
 * organisation list has no flat spelling at all, so a body that satisfied only the fallback would
 * produce a signed-in console showing no organisations — which reads as "you administer nothing"
 * rather than "this answer was not understood". On a surface where the list decides what may be
 * enrolled, refusing to guess is the safer failure.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ENROLLING_ROLES, mayEnrol, readDeveloper } from '../src/lib/auth.tsx'

describe('reading the developer out of an /auth/me body', () => {
  it('reads the NESTED shape identity actually sends', () => {
    const developer = readDeveloper({
      user: { id: 'u-1', handle: 'ada', roles: ['admin'] },
      session: { id: 's-1', amr: ['pwd'] },
      organisations: [{ id: 'o-1', name: 'Acme', slug: 'acme', role: 'owner' }],
    })
    assert.equal(developer.userId, 'u-1')
    assert.equal(developer.handle, 'ada')
    assert.deepEqual(developer.roles, ['admin'])
    assert.equal(developer.organisations.length, 1)
    assert.equal(developer.organisations[0]?.id, 'o-1')
    assert.equal(developer.organisations[0]?.role, 'owner')
  })

  it('refuses the FLAT shape rather than half-reading it', () => {
    // The deliberate divergence from the siblings. A flat body carries no organisations, so
    // accepting it would sign somebody in to a console that says they administer nothing.
    const developer = readDeveloper({ id: 'u-1', handle: 'ada', roles: ['admin'] })
    assert.equal(developer.userId, null)
    assert.equal(developer.handle, null)
    assert.deepEqual(developer.roles, [])
    assert.deepEqual(developer.organisations, [])
  })

  it('survives a body that is not an object at all', () => {
    for (const body of [null, undefined, 'nope', 42, []]) {
      const developer = readDeveloper(body)
      assert.equal(developer.userId, null)
      assert.deepEqual(developer.organisations, [])
    }
  })

  it('survives a user object with nothing in it', () => {
    const developer = readDeveloper({ user: {} })
    assert.equal(developer.userId, null)
    assert.equal(developer.handle, null)
    assert.deepEqual(developer.roles, [])
  })

  it('DROPS an organisation with no id rather than inventing a placeholder', () => {
    // The id is what an enrolment names. A placeholder would enrol a developer organisation against
    // an identity organisation the user has nothing to do with — which devplatform refuses at
    // `devplatform/src/server.ts`, but only after this app has asked it to.
    const developer = readDeveloper({
      user: { id: 'u-1' },
      organisations: [{ name: 'No id', role: 'owner' }, { id: 'o-2', name: 'Fine', role: 'admin' }],
    })
    assert.equal(developer.organisations.length, 1)
    assert.equal(developer.organisations[0]?.id, 'o-2')
  })

  it('falls back to the id for a name, and never to an empty label', () => {
    const developer = readDeveloper({ user: { id: 'u' }, organisations: [{ id: 'o-3' }] })
    assert.equal(developer.organisations[0]?.name, 'o-3')
    assert.equal(developer.organisations[0]?.role, 'unknown')
  })

  it('ignores a non-array organisations field', () => {
    assert.deepEqual(readDeveloper({ user: { id: 'u' }, organisations: 'lots' }).organisations, [])
  })

  it('drops a non-string role rather than coercing it', () => {
    const developer = readDeveloper({ user: { id: 'u' }, organisations: [{ id: 'o', role: 7 }] })
    assert.equal(developer.organisations[0]?.role, 'unknown')
  })

  it('keeps only string roles on the user', () => {
    const developer = readDeveloper({ user: { id: 'u', roles: ['admin', 7, null] } })
    assert.deepEqual(developer.roles, ['admin'])
  })
})

describe('which roles may enrol an organisation', () => {
  it('is owner and admin, copied from devplatform ADMIN_ROLES', () => {
    assert.deepEqual([...ENROLLING_ROLES], ['owner', 'admin'])
  })

  it('permits an owner and an admin', () => {
    for (const role of ['owner', 'admin']) {
      assert.equal(mayEnrol({ id: 'o', name: 'n', slug: 's', role }), true, role)
    }
  })

  it('refuses every other organisation role identity can issue', () => {
    // `devplatform/src/membership.ts` lists five: owner, admin, member, billing, read. Only the
    // first two are ADMIN_ROLES.
    for (const role of ['member', 'billing', 'read', 'unknown', '']) {
      assert.equal(mayEnrol({ id: 'o', name: 'n', slug: 's', role }), false, role)
    }
  })
})
