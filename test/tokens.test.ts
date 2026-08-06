/**
 * EVERY `--cf-*` THIS APP NAMES IS DEFINED BY THE DESIGN SYSTEM.
 *
 * An undefined custom property does not fall back to something sensible. `var(--cf-nope)` makes
 * the whole declaration invalid at computed-value time, so `border: 1px solid var(--cf-nope)`
 * removes the border — silently, in a file that looks correct, in a browser that reports nothing.
 *
 * The estate has shipped exactly this. `micro-mint-web/src/styles.css` references ten properties
 * that `ui/packages/ui/src/tokens.css` does not declare — `--cf-border`, `--cf-radius-md`,
 * `--cf-space-1` … `--cf-space-5`, `--cf-status-good`, `--cf-status-warn`, `--cf-status-crit` —
 * across 72 declarations. Three of those are written `var(--cf-status-good, var(--cf-border))`,
 * where the FALLBACK is undefined too. Every other frontend in the estate (`micro-admin-web`,
 * `micro-web-template`, `micro-hub-web`, `micro-market-web`, `micro-status-web`,
 * `micro-foresight-web`) is clean, so this is one repository's drift rather than a template
 * defect. Reported to micro-mint-web; this test is what stops it happening here.
 *
 * The second rule: a `var(--undefined, #hex)` is not a repair. It is a hard-coded colour wearing a
 * token's clothes, and it stops following the substrate the moment the ash ramp changes. So this
 * file also refuses a literal colour in the stylesheet outright.
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

const at = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url))

/**
 * The stylesheet with its comments stripped.
 *
 * Same lesson as nginx.conf and the `try_files` grep: the file's own header QUOTES the property
 * names it forbids, in order to explain why they are forbidden. A scan over the raw text matches
 * the warning and fails a correct file — which is a check that can only be satisfied by deleting
 * the explanation.
 */
const CSS = readFileSync(at('src/styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

/** Where a micro-ui checkout is, in the order CI and a developer's machine put it. */
const TOKENS = [process.env['CLOUDSFORGE_UI_TOKENS'], at('../ui/packages/ui/src/tokens.css')]
  .filter((v): v is string => Boolean(v))
  .find((p) => existsSync(p))

/** Every `--cf-*` the stylesheet READS. */
function referenced(): string[] {
  return [...new Set([...CSS.matchAll(/var\((--cf-[a-z0-9-]+)/g)].map((m) => m[1] ?? ''))].sort()
}

describe('the stylesheet names only tokens that exist', () => {
  it('references a real number of them, so this cannot pass on an empty match', () => {
    assert.ok(referenced().length >= 20, `found ${referenced().length} token references`)
  })

  if (TOKENS === undefined) {
    // A GREEN test named "SKIPPED" is still a pass: it counts towards the number a reader compares
    // between runs, and this suite reported "0 skipped" while the whole cross-repository half had
    // not run. `t.skip()` puts it where an unmeasured check belongs. The NAME keeps the exact words
    // ci.yml greps for, so the workflow's "it skipped itself while micro-ui was present" guard
    // still has something to match.
    it('SKIPPED: no micro-ui checkout — CI checks one out and requires this to run', (t) => {
      t.skip('micro-ui is not checked out; tokens.css was never read')
    })
  } else {
    const tokens = readFileSync(TOKENS, 'utf8')
    const defined = new Set(
      [...tokens.matchAll(/^\s*(--cf-[a-z0-9-]+)\s*:/gm)].map((m) => m[1] ?? ''),
    )

    it('reads a tokens file with tokens in it', () => {
      assert.ok(defined.size >= 60, `found ${defined.size} definitions in tokens.css`)
    })

    it('every property this stylesheet reads is declared by the design system', () => {
      const undefinedOnes = referenced().filter((name) => !defined.has(name))
      assert.deepEqual(
        undefinedOnes,
        [],
        `src/styles.css reads ${undefinedOnes.join(', ')}, which tokens.css does not define. ` +
          'An undefined custom property invalidates the whole declaration.',
      )
    })

    it('names none of the ten properties micro-mint-web invented', () => {
      // Spelled out so the failure message names the right file to go and read, rather than only
      // saying "undefined". These are the ones this estate has actually shipped by mistake.
      const KNOWN_BAD = [
        '--cf-border',
        '--cf-radius-md',
        '--cf-space-1',
        '--cf-space-2',
        '--cf-space-3',
        '--cf-space-4',
        '--cf-space-5',
        '--cf-status-good',
        '--cf-status-warn',
        '--cf-status-crit',
      ]
      for (const bad of KNOWN_BAD) {
        // Boundary-aware: a plain `includes('var(--cf-space-2')` also matches the REAL
        // `var(--cf-space-2xl)`, and a test that fails on a correct token is a test somebody
        // deletes.
        assert.doesNotMatch(
          CSS,
          new RegExp(`var\\(${bad}(?![a-z0-9-])`),
          `src/styles.css uses ${bad}, which does not exist. The real name is in the header of that file.`,
        )
      }
      // And none of them has quietly appeared upstream either — if one had, this list would need
      // revising rather than enforcing.
      for (const bad of KNOWN_BAD) {
        assert.ok(!defined.has(bad), `${bad} now exists upstream; this test is out of date`)
      }
    })

    it('the names the brief warned about are not tokens, and the real ones are', () => {
      /*
       * `--cf-critical` WAS ON THIS LIST AND HAS BEEN TAKEN OFF IT, AND THAT IS A CORRECTION.
       *
       * It read `['--cf-border', '--cf-critical', '--cf-warning', '--cf-font']`, and it was right
       * when it was written. @cloudsforge/ui 1.1 then added the measured severity trio —
       * `--cf-critical` `#d2543a` as the 3:1 fill step beside `--cf-critical-text` `#f86546` at
       * 4.63:1 (`tokens.css`) — so this assertion has been RED on `main` ever since, for
       * the reason the assertion beside it spells out in its own message: "now exists upstream;
       * this test is out of date". It was. Enforcing a stale list against a design system that has
       * moved is how a suite trains its readers to ignore it.
       *
       * `--cf-warning` and `--cf-font` are still nothing: the real names are `--cf-warn` and
       * `--cf-font-sans`/`--cf-font-mono`/`--cf-font-display`. `--cf-border` is still nothing
       * either — it is `--cf-line`.
       */
      for (const wrong of ['--cf-border', '--cf-warning', '--cf-font']) {
        assert.ok(!defined.has(wrong), `${wrong} is defined after all; this comment is wrong`)
      }
      for (const right of [
        '--cf-line',
        '--cf-line-strong',
        '--cf-warn',
        '--cf-font-sans',
        // The two-step pairs this stylesheet now names explicitly rather than through the
        // `--cf-success`/`--cf-danger` aliases. Both halves of each pair, because the whole point
        // of the distinction is that a fill and a word take DIFFERENT ones.
        '--cf-good',
        '--cf-good-text',
        '--cf-warn-text',
        '--cf-critical',
        '--cf-critical-text',
        '--cf-accent',
        '--cf-accent-text',
      ]) {
        assert.ok(defined.has(right), `${right} is not defined; the stylesheet is built on it`)
      }
    })

    it('uses the TEXT step wherever a token is a colour and the BASE step wherever it is not', () => {
      /*
       * THE RULE @cloudsforge/ui 1.1 EXISTS TO ENFORCE, checked on this file rather than trusted.
       *
       * `--cf-accent` and `--cf-critical` are validated at 3:1 — the WCAG floor for a border, a
       * fill, an outline or a stroke. `--cf-accent-text` and `--cf-critical-text` are the 4.5:1
       * text step. A `color:` taking the base step is illegal text that looks fine to whoever wrote
       * it, which is precisely why it needs a machine to notice.
       *
       * Scanned as declarations rather than by eye: every `color: var(--cf-…)` in the file, with
       * the four base severity/accent names refused.
       */
      const BASE_ONLY = ['--cf-accent', '--cf-good', '--cf-warn', '--cf-critical']
      const colours = [...CSS.matchAll(/(?<!-)\bcolor:\s*var\((--cf-[a-z0-9-]+)\)/g)].map(
        (m) => m[1] ?? '',
      )
      assert.ok(colours.length >= 10, `found ${colours.length} color declarations`)
      const wrong = colours.filter((name) => BASE_ONLY.includes(name))
      assert.deepEqual(
        wrong,
        [],
        `src/styles.css sets color: to ${wrong.join(', ')} — the 3:1 fill step. ` +
          'The 4.5:1 text step is the same name with `-text` on the end.',
      )
    })
  }
})

describe('no hard-coded colour, including one hiding in a fallback', () => {
  it('declares no hex literal', () => {
    const hexes = [...CSS.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0])
    assert.deepEqual(hexes, [], `src/styles.css hard-codes ${hexes.join(', ')}`)
  })

  it('declares no rgb/rgba/hsl literal', () => {
    const fns = [...CSS.matchAll(/\b(rgba?|hsla?)\(/g)].map((m) => m[0])
    assert.deepEqual(fns, [], `src/styles.css hard-codes ${fns.join(', ')}`)
  })

  it('uses no var() fallback at all, because a fallback is where a literal hides', () => {
    // `var(--cf-something, #b28e1e)` passes every "uses tokens" check ever written and is a
    // hard-coded colour. There is no legitimate use for one here: every property this file reads
    // is asserted above to exist.
    const fallbacks = [...CSS.matchAll(/var\(--cf-[a-z0-9-]+\s*,/g)].map((m) => m[0])
    assert.deepEqual(fallbacks, [], `src/styles.css uses a var() fallback: ${fallbacks.join(', ')}`)
  })
})
