/**
 * WHAT THE SCREENS ARE NOT ALLOWED TO SAY, AND WHAT THEY MUST.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE RULE THIS FILE EXISTS FOR: NOTHING IN THIS APP MAY IMPLY THAT A SECRET CAN BE RECOVERED.
 *
 * It cannot be. `api_keys` has no column a secret could be read back from — `secret_algo`,
 * `secret_salt` and `secret_hash` are a one-way function of the key, and `api_keys_slow_kdf_only`
 * refuses any row whose recorded algorithm is not a scrypt encoding
 * (`devplatform/src/migrations.ts`); `oauth_clients` carries the same constraint.
 * There is no reveal route, no support tool, and no operator with a way round it.
 *
 * So a sentence like "you can find it later in your dashboard", "we have emailed it to you" or
 * "contact support if you lose it" is not a small copy mistake here. It is an instruction to do
 * something that will fail at the worst possible moment, written by the only party the reader has
 * to trust on the question.
 *
 * This is a SOURCE-LEVEL check because the failure is an omission of care rather than a behaviour:
 * a screen that says the wrong thing renders perfectly.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * The second half is the mirror: the shown-once dialog must actually do the three things its
 * header claims — be modal, arm `beforeunload`, and refuse to dismiss until the reader has copied
 * the value or said they have written it down. Those are the only reasons it is a dialog and not a
 * notification, and a later "simplification" that removed one would leave the argument in the
 * comment and the protection nowhere.
 */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

const root = fileURLToPath(new URL('..', import.meta.url))
const read = (file: string): string => readFileSync(join(root, file), 'utf8')

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...sourceFiles(full))
    else if (['.ts', '.tsx'].includes(extname(entry.name))) out.push(full)
  }
  return out
}

/**
 * A source file with its prose removed.
 *
 * SIX GUARDS IN THIS ESTATE HAVE FAILED A CORRECT BUILD by matching the comment that explains the
 * rule. This repository's comments quote every forbidden phrase in order to say why it is
 * forbidden — the header above does it four times — so a scan over the raw text would fail the
 * files that are most careful. The fix is to strip the comments, never to reword the explanation.
 */
function codeOf(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join('\n')
}

const FILES = sourceFiles(join(root, 'src')).map((path) => ({
  name: relative(root, path),
  code: codeOf(readFileSync(path, 'utf8')),
}))

describe('the sweep can see the source at all', () => {
  it('found the tree', () => {
    // A scan over an empty list passes for the wrong reason, which is the one way every assertion
    // below could silently stop protecting anything.
    assert.ok(FILES.length >= 15, `expected the source tree, found ${FILES.length} files`)
  })

  it('and the stripping left the code behind', () => {
    const total = FILES.reduce((sum, file) => sum + file.code.length, 0)
    assert.ok(total > 10_000, `stripping left only ${total} characters; the extractor is broken`)
  })
})

describe('nothing implies a secret can be recovered', () => {
  /**
   * Each pattern is a sentence somebody would write in good faith. They are the failure mode, not a
   * hypothetical: every one of these is standard copy on a developer console whose keys ARE
   * retrievable, and this one's are not.
   */
  const FORBIDDEN: ReadonlyArray<{ pattern: RegExp; why: string }> = [
    { pattern: /\bview (your |the )?(api )?key\b/i, why: 'there is no route that shows a key again' },
    { pattern: /\breveal\b/i, why: 'nothing can reveal a stored secret; micro-custody deleted its reveal route for the same reason' },
    { pattern: /\bshow (it|the secret|your key) again\b/i, why: 'nothing can' },
    { pattern: /\bcopy it later\b/i, why: 'there is no later' },
    { pattern: /\bfind (it|your key) (later|in )/i, why: 'it is not stored anywhere it could be found' },
    { pattern: /\bcontact support\b/i, why: 'support cannot recover it either, and saying so sends somebody on an errand that ends in a no' },
    { pattern: /\bwe (have )?emailed\b/i, why: 'nothing in this product emails a credential' },
    { pattern: /\bretrieve (it|the secret|your key)\b/i, why: 'it cannot be retrieved' },
    { pattern: /\bforgot your (key|secret)\b/i, why: 'a key is not a password and has no recovery flow' },
  ]

  for (const rule of FORBIDDEN) {
    it(`says nothing matching ${rule.pattern} — ${rule.why}`, () => {
      const offenders = FILES.filter((file) => rule.pattern.test(file.code)).map((f) => f.name)
      assert.deepEqual(offenders, [], `${offenders.join(', ')} matches ${rule.pattern}: ${rule.why}`)
    })
  }

  it('never persists a secret, in any storage a browser has', () => {
    // The value lives in one component's props and in the caller's state, and is cleared on
    // acknowledgement. A stored copy would outlive the dialog that explains what it is.
    for (const file of FILES) {
      if (file.name === 'src/lib/api.ts') continue // the token store, which is not a devplatform secret
      if (file.name === 'src/lib/obs.ts') continue // the RUM session id, pinned by the check below
      assert.doesNotMatch(file.code, /localStorage|sessionStorage|document\.cookie/, file.name)
    }
  })

  /**
   * `src/lib/obs.ts` is exempted above, so the exemption is PINNED here rather than trusted.
   *
   * That file is the estate's shared browser reporter — byte-identical in seventeen frontends, and
   * copied from `web-template` rather than re-derived, because sixteen independent derivations of
   * one judgement is how the last defect in it survived for months. It touches `sessionStorage` for
   * exactly one thing: a per-TAB random id that lets two samples from one session be joined. It is
   * not a devplatform secret, it is not derived from one, and it dies with the tab.
   *
   * A bare `continue` would make that file a hole this whole describe cannot see into — the same
   * "check that cannot fail" the exemption is meant to avoid. So instead: obs.ts may use
   * sessionStorage, under one named key, and may not use `localStorage` or `document.cookie` at
   * all. A future edit that stores anything else there turns this red.
   */
  it('and the one exempted file stores only the RUM session id, under one key', () => {
    const obs = FILES.find((f) => f.name === 'src/lib/obs.ts')
    assert.ok(obs, 'src/lib/obs.ts is exempted above but is not in the sweep; the exemption is stale')
    // Nothing durable, and nothing a server ever sees on a request it did not ask for.
    assert.doesNotMatch(obs!.code, /localStorage|document\.cookie/, 'obs.ts may use sessionStorage and nothing else')
    const uses = [...obs!.code.matchAll(/sessionStorage\.(\w+)\(([^)]*)\)/g)].map((m) => `${m[1]}(${m[2]})`)
    assert.deepEqual(uses, ["getItem('cf-obs-session')", "setItem('cf-obs-session', minted)"])
    // And what goes under that key is minted, not read off anything the user typed or was shown.
    assert.match(obs!.code, /const minted =\s*\n?\s*typeof crypto !== 'undefined'/)
  })
})

describe('the shown-once dialog does the three things it claims', () => {
  const once = read('src/components/once.tsx')

  it('is a modal dialog rather than a notification', () => {
    assert.match(once, /role="dialog"/)
    assert.match(once, /aria-modal="true"/)
  })

  it('arms the hard-navigation guard', () => {
    // The reload, the back button and the closed tab are the three ways out that no in-app guard
    // can see.
    assert.match(once, /addEventListener\('beforeunload'/)
    assert.match(once, /removeEventListener\('beforeunload'/)
  })

  it('swallows Escape rather than closing on it', () => {
    assert.match(codeOf(once), /event\.key === 'Escape'[\s\S]{0,120}preventDefault\(\)/)
  })

  it('traps Tab, so the navigation behind cannot be reached by keyboard', () => {
    assert.match(codeOf(once), /event\.key !== 'Tab'/)
  })

  it('cannot be dismissed until the reader has copied it or said they wrote it down', () => {
    const code = codeOf(once)
    assert.match(code, /const dismissable = copied \|\| writtenDown/)
    assert.match(code, /disabled=\{!dismissable\}/)
  })

  it('renders the note as an alert, so a screen reader hears it', () => {
    assert.match(once, /id=\{noteId\} role="alert"/)
  })

  it('has a REPLAYED rendering that is not a failure', () => {
    // `secretKey` is null when the idempotency wrapper returned a stored response. A client that
    // rendered that as an error would tell a developer their key had failed to be created when it
    // exists and is live — and their next action would be to create a second one.
    assert.match(once, /export function Replayed/)
    assert.match(once, /cannot be shown again/i)
  })
})

describe('every screen that shows a secret uses that dialog', () => {
  const screens = ['src/pages/keys.tsx', 'src/pages/webhooks.tsx', 'src/pages/oauth.tsx']

  for (const screen of screens) {
    it(`${screen} renders <ShownOnce> and <Replayed>, and neither inline`, () => {
      const code = codeOf(read(screen))
      assert.match(code, /<ShownOnce/, `${screen} shows a secret without the dialog`)
      assert.match(code, /<Replayed/, `${screen} does not handle a replay`)
    })
  }

  it('and the three of them are the only files that touch a secret field', () => {
    // If a fourth screen starts reading `secretKey`, `clientSecret` or a webhook `secret`, it has
    // to come through this test first.
    const touching = FILES.filter(
      (file) =>
        file.name.startsWith('src/pages/') &&
        /\.(secretKey|clientSecret)\b|\bsecret=\{/.test(file.code),
    ).map((f) => f.name)
    assert.deepEqual(touching.sort(), [...screens].sort())
  })
})

describe('the pages say the things they must', () => {
  it('the key screen warns BEFORE the request, in the service’s own sentence', () => {
    // A warning that first appears alongside the secret is a warning read after the decision it
    // was meant to inform.
    const keys = codeOf(read('src/pages/keys.tsx'))
    assert.match(keys, /SHOWN_ONCE/, 'the key form does not carry the service’s sentence')
    assert.match(keys, /Open your secret manager first/)
  })

  it('the key screen says revocation cannot be undone', () => {
    assert.match(codeOf(read('src/pages/keys.tsx')), /cannot be undone/i)
  })

  it('the webhook screen offers Enable, and draws it as a verb rather than a switch', () => {
    // ══════════════════════════════════════════════════════════════════════════════════════════
    // THIS CHECK USED TO ASSERT THE OPPOSITE, AND IT WAS RIGHT AT THE TIME.
    //
    // It required the screen to say "no route that re-enables one", because there was none: the
    // only way back was to delete the endpoint, which mints a new signing secret and drops the
    // delivery history. That was reported and `POST /v1/webhook-endpoints/:id/enable` closed it,
    // so the check was inverted rather than relaxed — the screen must now offer the control.
    //
    // The service made it two routes rather than one boolean deliberately: "a client that
    // inverted the flag would silently do the opposite of what its operator intended". A checkbox
    // or a `checked=` toggle here would be exactly that client, so the shape is asserted too.
    // ══════════════════════════════════════════════════════════════════════════════════════════
    const webhooks = codeOf(read('src/pages/webhooks.tsx'))
    assert.match(webhooks, /enableEndpoint\(/, 'the screen cannot re-enable an endpoint')
    assert.match(webhooks, /'Enabling…' : 'Enable'/, 'there is no Enable control')
    assert.doesNotMatch(
      webhooks,
      /type="checkbox"[\s\S]{0,400}disabl/i,
      'disable and enable are two verbs on this service; a toggle can be inverted',
    )
    // And the sentence that stops somebody waiting for a backlog that was never queued.
    assert.match(
      webhooks,
      /There is no backlog waiting for you/i,
      'the screen does not say that events produced while disabled are not replayed',
    )
  })

  it('the webhook screen no longer claims a disabled endpoint is stuck', () => {
    // The mirror of the above, and the reason it is separate: deleting a stale warning is easy to
    // forget when adding the control that makes it stale, and a screen carrying both is worse than
    // one carrying neither.
    assert.doesNotMatch(codeOf(read('src/pages/webhooks.tsx')), /no route that re-enables one/i)
  })

  it('the webhook screen prints the rotation overlap from the RESPONSE, not a constant', () => {
    const webhooks = codeOf(read('src/pages/webhooks.tsx'))
    assert.match(webhooks, /rotated\.overlapMinutes/)
    assert.doesNotMatch(webhooks, /1440|1_440/, 'the overlap window is hard-coded')
  })

  it('the usage screen lowers a quota and offers nothing that raises one', () => {
    // ══════════════════════════════════════════════════════════════════════════════════════════
    // THE ROUTE CHANGED UNDER THIS CHECK; THE RULE DID NOT.
    //
    // `PUT /v1/projects/:id/quotas` used to be plain `project:write` with no ceiling — the party
    // the limit binds chose the limit — so this screen drew nothing at all. The direction is now
    // the authority upstream: lowering is `project:write`, raising and creating are an operator's.
    // So the control exists, and the rule it must obey is unchanged: nothing here raises a limit.
    //
    // The old check forbade `method: 'PUT'` anywhere in the file, which would now forbid the
    // lowering control as well. That is a check that has stopped matching the rule it was written
    // for, so it is replaced rather than deleted: the request lives in src/lib/devplatform.ts and
    // no page assembles one, which `no page calls the API directly` below already proves.
    // ══════════════════════════════════════════════════════════════════════════════════════════
    const usage = codeOf(read('src/pages/usage.tsx'))
    assert.match(usage, /lowerQuota\(/, 'the screen cannot lower a limit')
    assert.doesNotMatch(usage, /setQuota|putQuota|raiseLimit/, 'a raise primitive is named here')
    assert.match(
      usage,
      /No allowance can be increased from this console/,
      'the screen does not say who may raise a limit',
    )
    // The input is bounded BELOW the current value. `max` is advisory in a browser, which is why
    // `lowerQuota` refuses a raise as well and the service refuses it a third time — but a field
    // that let a developer type a bigger number without a hint is a field that invites the 403.
    assert.match(usage, /max=\{quota\.maxUnits - 1\}/, 'the field does not cap itself below the limit')
  })

  it('the platform page renders the known gaps as findings rather than as a roadmap', () => {
    const platform = codeOf(read('src/pages/platform.tsx'))
    assert.match(platform, /KNOWN_GAPS/)
    assert.doesNotMatch(platform, /coming soon|on the roadmap|shortly/i)
  })

  /**
   * ══════════════════════════════════════════════════════════════════════════════════════════════
   * NO SCREEN COUNTS `KNOWN_GAPS` IN PROSE — docs/ecosystem/32-roadmap-ui-and-content.md §4.3.
   *
   * §1.1 is the rule: "No number goes on a page that is not checkable against something real. A
   * figure is admissible if it is read at runtime out of a response the page has already fetched,
   * or if a test binds it to the source constant it describes." `<h2>Two limits worth knowing
   * before you start</h2>` was neither. It was arithmetic over an array in a different file,
   * performed once, by hand, in a heading.
   *
   * And the array shrinks by design. `src/lib/devplatform.ts` carries two block comments recording
   * gaps deleted the moment they closed — GATEWAY_GAP and REVIEW_GAP — each with the same
   * reasoning: "A findings list that keeps its resolved entries is a list somebody stops reading."
   * Both deletions changed the count. Neither touched the heading, and neither could have been
   * expected to: closing a gap is a commit in the library, and the heading is in a page.
   *
   * So the count is forbidden rather than pinned. Pinning it to `KNOWN_GAPS.length` would spell
   * the number back out on screen and hand the next person a heading that changes text when a gap
   * closes — which is a worse artefact than a heading that never counted.
   *
   * The second assertion is the empty case, which is the one this section is heading towards.
   * `KNOWN_GAPS.map` over an empty array renders nothing at all, so the day the last gap closes an
   * unguarded page shows a heading and an explanatory paragraph over blankness. On a developer
   * console that reads as a fetch that failed, not as good news — §1.2's rule, "render a named
   * hole, never a plausible screen over nothing", read from the other direction.
   * ══════════════════════════════════════════════════════════════════════════════════════════════
   */
  describe('the known-gaps section counts nothing and vanishes when there is nothing to say', () => {
    const platform = codeOf(read('src/pages/platform.tsx'))

    /**
     * A quantity, as a word or as digits, in front of the noun this section is made of.
     *
     * `\w+\s+` optionally between them catches "two known limits" and "3 outstanding gaps".
     * Articles are absent on purpose: "a limit" is English, not a count, and a scan that fired on
     * English is a scan somebody switches off.
     */
    const COUNTED_GAPS =
      /\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:\w+\s+)?(?:limits?|gaps?|caveats?|findings?)\b/i

    it('the pattern matches the heading it was written for, and not ordinary prose', () => {
      // The guard on the guard: if this stops matching the original defect, the check below is
      // green for no reason.
      assert.match('Two limits worth knowing before you start', COUNTED_GAPS)
      assert.match('3 gaps', COUNTED_GAPS)
      assert.match('two known limits', COUNTED_GAPS)
      assert.doesNotMatch('Limits worth knowing before you start', COUNTED_GAPS)
      assert.doesNotMatch('Each is the platform as it stands today', COUNTED_GAPS)
    })

    it('no heading or paragraph on the platform page states how many gaps there are', () => {
      assert.doesNotMatch(
        platform,
        COUNTED_GAPS,
        'this page counts KNOWN_GAPS in prose. The array is edited in src/lib/devplatform.ts, ' +
          'which has already deleted two entries without opening this file; drop the numeral ' +
          'instead — "Limits worth knowing before you start" costs nothing.',
      )
      assert.match(
        platform,
        /<h2 className="dp-h2">Limits worth knowing before you start<\/h2>/,
        'the section heading was renamed; keep it free of a count',
      )
      // "Both" is the same defect spelled without a digit: it is a count of two, and it is wrong
      // the moment the array holds one entry or three.
      assert.doesNotMatch(platform, /\bBoth are the platform\b/, 'the lead-in still counts two')
    })

    it('the heading and its paragraph are inside the guard, not just the list', () => {
      // Guarding only `KNOWN_GAPS.map` would leave the heading and the explanatory paragraph
      // rendering over nothing, which is the exact state this check exists to make impossible.
      const guard = platform.indexOf('KNOWN_GAPS.length > 0 &&')
      const heading = platform.indexOf('Limits worth knowing before you start')
      const list = platform.indexOf('KNOWN_GAPS.map(')
      assert.ok(guard >= 0, 'the section is not guarded on KNOWN_GAPS being non-empty')
      assert.ok(heading > guard, 'the heading is outside the guard and renders over an empty list')
      assert.ok(list > guard, 'the list is outside the guard')
    })

    it('and the array it guards is the one the page draws from', () => {
      // The guard is only worth anything while it names the array actually rendered. A stale
      // identifier would not typecheck, but a SECOND array would, and the section would then be
      // gated on a list it does not draw.
      //
      // Deliberately NOT asserted here: that KNOWN_GAPS is non-empty. The day it empties is the
      // day this whole section is correctly absent, and a test that went red on it would be a
      // suite punishing the closure of the last gap — which is the behaviour this file is
      // arguing against.
      assert.match(platform, /import \{ getScopes, KNOWN_GAPS \} from '\.\.\/lib\/devplatform\.ts'/)
      const guarded = platform.slice(platform.indexOf('KNOWN_GAPS.length > 0 &&'))
      assert.equal(
        (guarded.match(/KNOWN_GAPS/g) ?? []).length,
        2,
        'the guard and the map must name the same array and nothing else may appear between them',
      )
    })
  })

  it('nothing anywhere promises a feature that does not exist', () => {
    for (const file of FILES) {
      assert.doesNotMatch(file.code, /\bcoming soon\b/i, file.name)
      assert.doesNotMatch(file.code, /\bwill be available\b/i, file.name)
    }
  })
})

describe('no page calls the API directly', () => {
  it('every /v1 path in this repository lives in src/lib/devplatform.ts', () => {
    // The route table is only trustworthy while it is the only place a request is made. A page
    // that assembled its own path would be outside every check in test/devplatform.test.ts.
    const strays = FILES.filter(
      (file) => file.name !== 'src/lib/devplatform.ts' && /['"`]\/v1\//.test(file.code),
    ).map((f) => f.name)
    assert.deepEqual(strays, [], `${strays.join(', ')} builds a /v1 path outside the route table`)
  })
})
