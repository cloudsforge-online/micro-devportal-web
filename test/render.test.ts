/**
 * WHAT THE SCREENS ARE NOT ALLOWED TO SAY, AND WHAT THEY MUST.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE RULE THIS FILE EXISTS FOR: NOTHING IN THIS APP MAY IMPLY THAT A SECRET CAN BE RECOVERED.
 *
 * It cannot be. `api_keys` has no column a secret could be read back from — `secret_algo`,
 * `secret_salt` and `secret_hash` are a one-way function of the key, and `api_keys_slow_kdf_only`
 * refuses any row whose recorded algorithm is not a scrypt encoding
 * (`devplatform/src/migrations.ts:204`); `oauth_clients` carries the same constraint (`:244`).
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
      assert.doesNotMatch(file.code, /localStorage|sessionStorage|document\.cookie/, file.name)
    }
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
    assert.match(keys, /Have somewhere to put it before you press the button/)
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
      /were never queued for it/i,
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
      /Raising a limit is not something this console does/,
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
