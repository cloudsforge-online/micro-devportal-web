/**
 * This surface's slice of `docs/ecosystem/22-browser-journeys.md`, as data.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * WHY THE CATALOGUE IS DATA AND NOT JUST A LIST OF `it(...)` TITLES
 *
 * Doc 22 §3.2 makes the layer boundary mechanical rather than advisory: every scenario declares
 * one `asserts` kind, and any scenario whose outcome depends on a SERVER-SIDE rule must carry
 * `ownedBy` — "a path, resolvable by grep, in the service that enforces the rule". A meta-test
 * reads these and fails the suite when one is missing.
 *
 * The second reason is doc 22 §8: a scenario that exists and cannot run is a gap somebody can
 * close, and an absent scenario is a gap nobody can see.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */

export type Asserts = 'presentation' | 'client-request' | 'navigation'
export type Tier = 'T1' | 'T2' | 'T3'

export interface Scenario {
  readonly id: string
  readonly what: string
  readonly asserts: Asserts
  readonly tier: Tier
  readonly gate?: boolean
  readonly ownedBy?: { readonly path: string; readonly grep: string }
  readonly blocked?: string
}

const NEEDS_SERVICE =
  'doc 22 §4 puts this at tier 3 — it needs micro-devplatform up, and a second read after a write ' +
  'to establish what persisted. Tier 3 lives in micro-beacon; nothing in this repository can ' +
  'stand the service up. What IS a property of this client is asserted at tier 1 elsewhere in ' +
  'this file.'

export const SCENARIOS: readonly Scenario[] = [
  /* ── 6.12 Group L — the developer platform ────────────────────────────────────────────────── */
  {
    id: 'BJ-DEV-01',
    what: 'the scope catalogue renders for somebody who has not signed in and is deciding whether to',
    asserts: 'presentation',
    tier: 'T2',
  },
  {
    id: 'BJ-DEV-02',
    what: 'the application directory and one listing render with no credential',
    asserts: 'presentation',
    tier: 'T2',
  },
  {
    id: 'BJ-DEV-03',
    what: 'the enrolment screen does not mutate in order to read',
    asserts: 'client-request',
    tier: 'T3',
    blocked: NEEDS_SERVICE,
  },
  {
    id: 'BJ-DEV-04',
    what: 'a member who cannot create a project sees the refusal in words, not a 403 dump',
    asserts: 'presentation',
    tier: 'T3',
    blocked: NEEDS_SERVICE,
    ownedBy: { path: 'devplatform/src/server.ts', grep: 'org:write' },
  },
  {
    id: 'BJ-DEV-05',
    what: 'the secret appears in a modal — role=dialog, aria-modal, focus moved into it on mount, a full-viewport scrim — and never as a toast',
    asserts: 'presentation',
    tier: 'T1',
    gate: true,
  },
  {
    id: 'BJ-DEV-06',
    what: 'the once-modal cannot be dismissed by accident: Escape and a scrim click do not close it without the explicit acknowledgement',
    asserts: 'client-request',
    tier: 'T1',
    gate: true,
  },
  {
    id: 'BJ-DEV-07',
    what: 'the modal says the credential is live and nobody can tell you what it is, and never implies recovery',
    asserts: 'presentation',
    tier: 'T1',
    gate: true,
  },
  {
    id: 'BJ-DEV-08',
    what: 'after a reload the key is listed, the secret is not, and no "show again" control is offered',
    asserts: 'presentation',
    tier: 'T1',
  },
  {
    id: 'BJ-DEV-09',
    what: 'a revoked key shows revoked and its usage history is retained',
    asserts: 'presentation',
    tier: 'T1',
  },
  {
    id: 'BJ-DEV-10',
    what: 'rotating a webhook secret goes through the once-modal, and the request carries an idempotency key',
    asserts: 'client-request',
    tier: 'T1',
    gate: true,
  },
  {
    id: 'BJ-DEV-11',
    what: 'a replay is rendered as a replay: the artefact exists, its secret was shown when it was created, and this is not a failure',
    asserts: 'presentation',
    tier: 'T1',
  },
  {
    id: 'BJ-DEV-12',
    what: 'a registered endpoint’s delivery list renders each attempt with its outcome',
    asserts: 'presentation',
    tier: 'T3',
    blocked: NEEDS_SERVICE,
  },
  {
    id: 'BJ-DEV-13',
    what: 'disabling and deleting a webhook endpoint both take effect on reload',
    asserts: 'presentation',
    tier: 'T3',
    blocked: NEEDS_SERVICE,
  },
  {
    id: 'BJ-DEV-14',
    what: 'registering an OAuth client sends an Idempotency-Key and shows the client secret through the once-modal',
    asserts: 'client-request',
    tier: 'T1',
    gate: true,
  },
  {
    id: 'BJ-DEV-15',
    what: 'quotas and usage both render, and a quota RAISE is not offered — the direction is the authority',
    asserts: 'presentation',
    tier: 'T1',
    ownedBy: { path: 'devplatform/src/server.ts', grep: 'quota' },
  },
  {
    id: 'BJ-DEV-16',
    what: 'opening a project fetches the project once; the five sections each fetch their own resource rather than fanning out on mount',
    asserts: 'client-request',
    tier: 'T1',
  },
  {
    id: 'BJ-DEV-17',
    what: '05 journey 12’s sandbox leg: a third party completes an integration against a resettable sandbox from public documentation alone',
    asserts: 'client-request',
    tier: 'T3',
    blocked:
      'doc 22 §8.3: devportal-web has keys, webhooks, OAuth, usage and organisations, and no ' +
      'sandbox screen. The service exists and the screen does not, so there is nothing for a ' +
      'browser to drive.',
  },

  /* ── 6.19 Group S — the adversarial matrix. BJ-ADV-10 is this repo's four forms. ──────────── */
  {
    id: 'BJ-ADV-10-H1',
    what: 'issuing a key under a double-submit sends one idempotency key',
    asserts: 'client-request',
    tier: 'T1',
    gate: true,
  },
  {
    id: 'BJ-ADV-10-H2',
    what: 'the once-modal is the step after the commit, and there is no armed form behind it',
    asserts: 'navigation',
    tier: 'T1',
    gate: true,
  },
  {
    id: 'BJ-ADV-10-H3',
    what: 'issuing a key from two tabs',
    asserts: 'client-request',
    tier: 'T3',
    gate: true,
    blocked:
      'two browser contexts against one service. Doc 22 §4 makes that tier 3 by definition and ' +
      'puts tier 3 in micro-beacon; nothing in this repository can hold two browsers open. The ' +
      'defence is devplatform’s idempotency wrapper and that is its test to own.',
  },
  {
    id: 'BJ-ADV-10-H4',
    what: 'a failed issue states the failure beside the form and leaves the draft on screen',
    asserts: 'presentation',
    tier: 'T1',
    gate: true,
  },
  {
    id: 'BJ-ADV-10-H5',
    what: 'the session expires mid-flow while a secret is on screen',
    asserts: 'presentation',
    tier: 'T3',
    gate: true,
    blocked:
      'the re-authentication path is signInRedirect() into a surface that does not exist — doc ' +
      '22 §8.1, "nothing in the estate serves a sign-in page". Worse here than anywhere else: a ' +
      'redirect while the once-modal holds an unacknowledged secret destroys it, which is ' +
      'exactly what the beforeunload guard exists to warn about, and there is nothing to redirect ' +
      'TO to test it against.',
  },
  {
    id: 'BJ-ADV-22',
    what: 'degraded not down: the page paints inside its deadline with the slow read marked pending',
    asserts: 'presentation',
    tier: 'T1',
    gate: true,
  },
  {
    id: 'BJ-ADV-23',
    what: 'every failure state renders the request id to quote to support',
    asserts: 'presentation',
    tier: 'T1',
    gate: true,
  },

  /* ── 6.20 Group T — accessibility ─────────────────────────────────────────────────────────── */
  {
    id: 'BJ-A11Y-01',
    what: 'axe on every route of this surface: zero serious or critical violations',
    asserts: 'presentation',
    tier: 'T2',
    gate: true,
    blocked:
      'axe-core is not installed anywhere in the estate, and doc 22 §1 records that as true of ' +
      'all fifteen bundles. Doc 22 §7.2 makes the axe sweep estate-wide by construction ("Any PR ' +
      'in ui — every surface’s T1 axe set"), so it belongs to the shared design system rather ' +
      'than to one repository. BJ-A11Y-02, -04, -10 and -12 need no engine and are run.',
  },
  {
    id: 'BJ-A11Y-02',
    what: 'the modal is announced with the dialog open and focus inside it',
    asserts: 'presentation',
    tier: 'T1',
    gate: true,
  },
  {
    id: 'BJ-A11Y-04',
    what: 'keyboard-only: focus moves into the dialog on mount, Tab cycles within it and never escapes to the page behind, and the acknowledgement is operable by keyboard alone',
    asserts: 'presentation',
    tier: 'T1',
    gate: true,
  },
  {
    id: 'BJ-A11Y-10',
    what: 'colour is never the only channel: every state badge carries a word as well',
    asserts: 'presentation',
    tier: 'T1',
  },
  {
    id: 'BJ-A11Y-12',
    what: 'one main landmark, a reachable skip link, and a heading order with no level skipped',
    asserts: 'presentation',
    tier: 'T1',
  },

  /* ── 5.1 the universal per-surface property ───────────────────────────────────────────────── */
  {
    id: 'BJ-DEVELOPERS-404',
    what: 'an address this surface does not own renders the not-found screen UNDER a 404',
    asserts: 'navigation',
    tier: 'T2',
  },
]

/**
 * Every id doc 22 assigns to this surface: §6.12 in full; §6.19's `BJ-ADV-10` row over the five
 * hazards it declares; §6.19's two page-level rows; the Group T rows naming a property this
 * surface has — including BJ-A11Y-04, which doc 22 makes THE estate's stand-in for the send flow
 * because this is its one irreversible reveal; and §5.1. Doc 22 §5 keys this surface `developers`.
 */
export const DOC22_IDS: readonly string[] = [
  'BJ-DEV-01',
  'BJ-DEV-02',
  'BJ-DEV-03',
  'BJ-DEV-04',
  'BJ-DEV-05',
  'BJ-DEV-06',
  'BJ-DEV-07',
  'BJ-DEV-08',
  'BJ-DEV-09',
  'BJ-DEV-10',
  'BJ-DEV-11',
  'BJ-DEV-12',
  'BJ-DEV-13',
  'BJ-DEV-14',
  'BJ-DEV-15',
  'BJ-DEV-16',
  'BJ-DEV-17',
  'BJ-ADV-10-H1',
  'BJ-ADV-10-H2',
  'BJ-ADV-10-H3',
  'BJ-ADV-10-H4',
  'BJ-ADV-10-H5',
  'BJ-ADV-22',
  'BJ-ADV-23',
  'BJ-A11Y-01',
  'BJ-A11Y-02',
  'BJ-A11Y-04',
  'BJ-A11Y-10',
  'BJ-A11Y-12',
  'BJ-DEVELOPERS-404',
]
