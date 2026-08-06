/**
 * EVERY CITATION IN THIS REPOSITORY NAMES A FILE THAT EXISTS, AND NONE OF THEM NAMES A LINE.
 *
 * `test/devplatform.test.ts` proves the ROUTE citations are exactly right — it FINDS each route's
 * `define(...)`, reads the handler from there to the next one, and matches the body against the
 * mechanism that authenticates it. That is the strong check, and it covers thirty-six routes. This
 * repository carries several hundred other citations: into `devplatform/src/apikeys.ts`,
 * `devplatform/src/migrations.ts`, `devplatform/src/quotas.ts`, `deploy/gateway/dynamic/`,
 * `identity/src/organisations.ts`, `ui/packages/ui/src/surfaces.ts`, `brand/plan.ts` and more.
 *
 * ── THIS FILE USED TO REQUIRE A LINE NUMBER. IT NOW FORBIDS ONE ───────────────────────────────
 *
 * It existed to check that every `path:line` named a line inside the file, and it did that
 * correctly. The trouble is what it was protecting: a line number names a position in a file a
 * DIFFERENT repository owns and is free to edit. `micro-devplatform` inserted 32 lines above its
 * route table on 3 August and 34 before that, and every citation here went wrong at once while
 * nothing in this repository was — and nothing runs this suite when that service changes, so it
 * surfaced during a release rather than at the edit. Seven of one day's nineteen CI failures across
 * the estate were that single shape.
 *
 * So the rule is inverted rather than relaxed. What a citation is FOR is telling a reader where to
 * look, and the file does that; where the exact place matters, the sentence names the symbol, which
 * moves with the code. Forbidding the line here is what stops the practice returning by habit, and
 * checking every cited FILE still catches the failure a line number never did — this sweep only
 * ever looked at citations that carried one, so a citation naming a file that does not exist was
 * invisible to it.
 *
 * When a sibling is not checked out, the citations into it are REPORTED as unchecked rather than
 * passed over in silence, so a green run never implies more than it measured.
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

const here = fileURLToPath(new URL('..', import.meta.url))

/**
 * Every sibling repository a citation in this repository reaches into.
 *
 * Enumerated rather than globbed, because a citation into a repository nobody listed here would
 * otherwise be resolved as a path inside THIS repository, fail to exist, and be reported as broken
 * — or, worse, a repository added to the estate later would go silently unchecked.
 *
 * The estate checks each `cloudsforge-<name>` out as `<name>`, while the prose cites some of them
 * by their GitHub name, `micro-<name>`. Both spellings resolve to the same directory; see
 * `org/tools/registry.ts`, which applies that substitution once for the whole programme.
 */
const SIBLINGS: readonly string[] = [
  'devplatform',
  'identity',
  'ui',
  'brand',
  'deploy',
  'sdk',
  'web-template',
  'market',
  'org',
  'hub-api',
  'service-template',
  // `src/styles.css` and `test/tokens.test.ts` cite micro-mint-web's stylesheet, which is the
  // reference implementation of the token discipline this surface copies. Listed so those two
  // citations are CHECKED rather than resolved as paths inside this repository and reported broken.
  'mint-web',
  // `src/lib/obs.ts` cites the ingest contract it has to satisfy — `RUM_KINDS`, the `RumSample`
  // field list, the `kind` CHECK, and the line that reads `samples` — because that contract is a
  // set of line numbers in another repository and not a document. Listed here so those citations
  // are CHECKED: unlisted, they resolve as paths inside this repository, and the last time the two
  // drifted apart every browser event in the estate was silently discarded for months.
  'lantern',
]

/** Where a sibling is checked out. `micro-devplatform` and `devplatform` are the same directory. */
function siblingRoot(name: string): string | undefined {
  const bare = name.startsWith('micro-') ? name.slice('micro-'.length) : name
  if (!SIBLINGS.includes(bare)) return undefined
  if (bare === 'devplatform') {
    const configured = process.env['CLOUDSFORGE_DEVPLATFORM_DIR']
    // The env var names the server FILE, for the route test. Its repository is two levels up.
    if (configured) return join(configured, '../..')
    return join(here, '../devplatform')
  }
  return join(here, `../${bare}`)
}

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.css', '.md', '.yml', '.html'])

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...sourceFiles(full))
    else if (SOURCE_EXTENSIONS.has(extname(entry.name))) out.push(full)
  }
  return out
}

/**
 * A citation: a repository-relative path to a file. NO LINE NUMBER.
 *
 * It used to require one, and requiring one is what this file is now the record of. See the header.
 */
const CITATION = /\b((?:[a-z0-9_.-]+\/)+[A-Za-z0-9_.-]+\.(?:ts|tsx|css|yml|sol|md))\b/g

/** The same shape WITH a line, which is what the last check in this file refuses. */
const CITATION_WITH_LINE = /\b((?:[a-z0-9_.-]+\/)+[A-Za-z0-9_.-]+\.(?:ts|tsx|css|yml|sol|md)):(\d+)/g

interface Citation {
  readonly from: string
  readonly path: string
}

/**
 * Directories inside THIS repository that a citation may be rooted at.
 *
 * Without this the sweep matches every relative import (`lib/api.ts`), every package specifier
 * (`@cloudsforge/ui/tokens.css`) and every URL that happens to end in a source extension, and then
 * reports all of them as citations to files that do not exist. A citation is rooted either at a
 * sibling repository or at the top of this one; anything else is a module reference, which
 * TypeScript already resolves and does not need a second, worse checker.
 */
const LOCAL_ROOTS: readonly string[] = ['src', 'test', 'public', 'scripts', '.github']

/**
 * `docs/` is the ESTATE's, not this repository's. The ecosystem documents live one level up beside
 * every repository, so a citation to `docs/ecosystem/…` resolves there or nowhere.
 */
const ESTATE_ROOTS: readonly string[] = ['docs']

function collect(): Citation[] {
  const out: Citation[] = []
  for (const file of sourceFiles(here)) {
    const text = readFileSync(file, 'utf8')
    for (const m of text.matchAll(CITATION)) {
      const path = m[1] ?? ''
      const head = path.split('/')[0] ?? ''
      if (!SIBLINGS.includes(head) && !head.startsWith('micro-') && !LOCAL_ROOTS.includes(head) && !ESTATE_ROOTS.includes(head))
        continue
      out.push({ from: relative(here, file), path })
    }
  }
  return out
}

/** Resolve a citation's path to a file on disk, or null when its repository is not checked out. */
function resolve(path: string): string | null {
  const [head, ...rest] = path.split('/')
  const root = siblingRoot(head ?? '')
  if (root === undefined) {
    if (ESTATE_ROOTS.includes(head ?? '')) {
      const estate = join(here, '..', path)
      return existsSync(estate) ? estate : null
    }
    // Not a sibling: a path inside THIS repository.
    const local = join(here, path)
    return existsSync(local) ? local : null
  }
  if (!existsSync(root)) return null
  const full = join(root, rest.join('/'))
  return existsSync(full) ? full : null
}

const CITATIONS = collect()

describe('every citation names a file that exists, and names no line in it', () => {
  it('finds citations at all, so this cannot pass on an empty sweep', () => {
    // A regex that stopped matching would make this whole file a no-op that reads as a guarantee.
    assert.ok(CITATIONS.length >= 200, `found only ${CITATIONS.length} citations`)
  })

  it('cites more than one repository, because a client that only cites itself proves nothing', () => {
    const repos = new Set(CITATIONS.map((c) => c.path.split('/')[0]))
    assert.ok(repos.size >= 4, `citations reach only ${[...repos].join(', ')}`)
  })

  it('names a file that exists, wherever the repository is checked out', () => {
    const missing = CITATIONS.filter((c) => {
      const head = c.path.split('/')[0] ?? ''
      const root = siblingRoot(head)
      // A sibling that is not checked out is UNCHECKED, not broken. Reported below.
      if (root !== undefined && !existsSync(root)) return false
      // And the ESTATE root is absent the same way. CI clones this repository on its own, so
      // `../docs/` is not there and every ecosystem citation would be reported as naming a file
      // that does not exist — which is how this went red on correct citations while passing on a
      // machine with the whole estate checked out. Absent means unmeasured, not wrong.
      if (ESTATE_ROOTS.includes(head) && !existsSync(join(here, '..', 'docs'))) return false
      return resolve(c.path) === null
    })
    assert.deepEqual(
      missing.map((c) => `${c.from} cites ${c.path}, which does not exist`),
      [],
    )
  })

  it('carries no line numbers, because a line in another repository cannot be kept true here', () => {
    // The rule, enforced rather than described. This check used to be its exact opposite: it
    // required the cited line to be inside the file, which is a fact about a repository this one
    // neither owns nor watches. Cite the file and, if a reader needs the exact place, name the
    // symbol — `authoriseProject`, `withIdempotentRoute` — which moves with the code.
    const withLines: string[] = []
    for (const file of sourceFiles(here)) {
      const text = readFileSync(file, 'utf8')
      for (const m of text.matchAll(CITATION_WITH_LINE)) {
        withLines.push(`${relative(here, file)} cites ${m[1]}:${m[2]} — cite the file or the symbol`)
      }
    }
    assert.deepEqual(withLines, [])
  })

  it('reports which repositories were NOT available, rather than passing quietly', (t) => {
    // Not a failure: `pnpm test` has to work for somebody who cloned only this repository. But an
    // unmeasured citation must never look like a verified one, so the absence is SKIPPED and the CI
    // job that has every sibling checked out is where it becomes fatal.
    //
    // `assert.ok(true)` is what this used to end in, and that is a pass — the run reported "0
    // skipped" while a third of the citations had not been opened. `t.skip()` puts the fact in the
    // column a reader compares between runs.
    const absent = SIBLINGS.filter((name) => {
      const root = siblingRoot(name)
      return root === undefined || !existsSync(root)
    })
    if (absent.length > 0) {
      console.log(`UNCHECKED: citations into ${absent.join(', ')} — those repositories are not checked out`)
      t.skip(`citations into ${absent.join(', ')} — those repositories are not checked out`)
      return
    }
    assert.deepEqual(absent, [], 'every sibling this repository cites was on disk')
  })
})
