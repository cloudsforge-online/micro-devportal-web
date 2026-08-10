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

/**
 * `ui.css` out of the same checkout, because a CLASS the design system does not declare fails
 * exactly as quietly as a property it does not declare.
 *
 * This file has always checked the properties and never the classes, and the gap is not
 * theoretical: `micro-explorer-web` reached for `.cf-input`, `.cf-select` and `.cf-btn--primary`
 * by reflex, ui.css declared none of the three, and the controls rendered with the browser's own
 * chrome on a dark substrate with nothing anywhere reporting it. Now that this repository's
 * section strip is a shared component rather than a local block, the class names it hands that
 * component are load-bearing in exactly the same way.
 *
 * Derived from `TOKENS` rather than resolved independently, so the two halves can never end up
 * reading different checkouts and disagreeing about what upstream contains.
 */
const UI_CSS = TOKENS?.replace(/tokens\.css$/, 'ui.css')

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

    it('the four names the brief warned about are not tokens, and the real ones are', () => {
      // Asserted in both directions so a reader can see which is which without opening tokens.css.
      // `--cf-critical` came off this list: the design system added it as a real severity token
      // with a measured `-text` step, so asserting its absence pinned a fact that had stopped
      // being true and turned this suite red on the design system being right.
      for (const wrong of ['--cf-border', '--cf-warning', '--cf-font']) {
        assert.ok(!defined.has(wrong), `${wrong} is defined after all; this comment is wrong`)
      }
      assert.ok(defined.has('--cf-critical'), '--cf-critical is the severity token; it must exist')
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

describe('the section strip is the design system’s, and this repository keeps no copy', () => {
  if (UI_CSS === undefined || !existsSync(UI_CSS)) {
    // Same reasoning as the skip above, and deliberately the same opening words: ci.yml greps the
    // output for `SKIPPED: no micro-ui checkout` and fails the build if it appears on a runner
    // that checked micro-ui out, so this half is covered by that guard too rather than needing a
    // second one.
    it('SKIPPED: no micro-ui checkout — CI checks one out and requires this to run', (t) => {
      t.skip('micro-ui is not checked out; ui.css was never read')
    })
  } else {
    const ui = readFileSync(UI_CSS, 'utf8')

    it('reads a ui.css with classes in it', () => {
      const all = new Set([...ui.matchAll(/\.(cf-[a-z0-9_-]+)/g)].map((m) => m[1] ?? ''))
      assert.ok(all.size >= 20, `found ${all.size} cf- classes in ui.css`)
    })

    it('the shared sub-nav exists and the local copy is gone', () => {
      /*
       * Both halves, off a real census.
       *
       * Measured 2026-08-10: ten frontends declared the section strip in their own stylesheet
       * under six class prefixes, from what was plainly one original. This repository's copy was
       * among the better ones — it scrolled (`overflow-x: auto` on the inner, `white-space: nowrap`
       * on the link) and it took its measure from `--cf-max-w` rather than the 76rem five of the
       * ten wrote — and it had still drifted where a private copy always drifts:
       * `.dp-subnav__link.is-active` marked the current section in ink and underline only, where
       * the estate's rule is three channels, and its gutter stayed `--cf-space-xl` under 560px
       * while the bar directly above it narrowed to `--cf-space-md`.
       *
       * The shared classes must EXIST, because a `className` naming a class ui.css does not
       * declare fails as silently as an undefined custom property. And the local block must be
       * GONE, because the whole point of adopting a shared thing is that there is no second copy
       * left to age beside it.
       */
      const declared = new Set([...ui.matchAll(/\.(cf-[a-z0-9_-]+)/g)].map((m) => m[1] ?? ''))
      for (const present of [
        'cf-subnav',
        'cf-subnav__inner',
        'cf-subnav__link',
        'cf-subnav__link--current',
      ]) {
        assert.ok(declared.has(present), `.${present} is missing from ui.css`)
      }

      // Not one `.dp-subnav*` selector, not the block and not an element of it. `CSS` has had its
      // comments stripped, so the note in src/styles.css explaining the deletion does not match —
      // the same reason that stripping exists at the top of this file.
      const survivors = [...CSS.matchAll(/\.dp-subnav[a-z0-9_-]*/g)].map((m) => m[0])
      assert.deepEqual(
        survivors,
        [],
        `src/styles.css still declares ${survivors.join(', ')}; the strip is SubNav's now`,
      )

      /*
       * And the modifier really did move: `is-active` was this repository's spelling for the
       * current section and the shared one is `cf-subnav__link--current`.
       *
       * SCOPED TO `subnav`, NOT A BLANKET BAN ON `is-active`. This stylesheet legitimately spells
       * one other thing that way — `.dp-sections__link.is-active`, the tab strip INSIDE a single
       * project's page (`src/pages/project.tsx`), which is a different control: it is not sticky,
       * it takes no measure, it is labelled "Project sections", and it is nothing `SubNav` claims
       * to be. A check that goes red on a correct file is a check somebody deletes.
       */
      const stale = [...CSS.matchAll(/\.[a-z0-9_-]*subnav[a-z0-9_-]*\.is-active/g)].map((m) => m[0])
      assert.deepEqual(stale, [], `${stale.join(', ')} is the local current-section marker, back`)
    })

    it('does not reach back in and restyle the shared strip locally', () => {
      // The other way a private copy comes back: not as `.dp-subnav` but as a local override of
      // `.cf-subnav*`, which is worse, because it drifts from the shared rule while claiming its
      // name. Anything genuinely local to this surface gets a `dp-` class of its own.
      const overrides = [...CSS.matchAll(/\.cf-subnav[a-z0-9_-]*\s*(?:,|\{|:)/g)].map((m) => m[0])
      assert.deepEqual(
        overrides,
        [],
        `src/styles.css restyles ${overrides.join(', ')}; that is the drift being removed`,
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
