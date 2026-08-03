/**
 * EVERY `path:line` IN THIS REPOSITORY NAMES A LINE THAT EXISTS.
 *
 * `test/devplatform.test.ts` proves the ROUTE citations are exactly right — it reads the handler at
 * each cited line, matches its `define(...)`, and matches the body against the mechanism that
 * authenticates it. That is the strong check, and it covers thirty-one routes. This repository
 * carries several hundred other citations: into `devplatform/src/apikeys.ts`,
 * `devplatform/src/migrations.ts`, `devplatform/src/quotas.ts`, `deploy/gateway/dynamic/`,
 * `identity/src/organisations.ts`, `ui/packages/ui/src/surfaces.ts`, `brand/plan.ts` and more.
 *
 * A citation is the estate's unit of evidence and it decays silently. Three of the four sources
 * this programme inherited had drifted, and the README template says why it matters in one line: "A
 * claim nobody can check is worse than no claim, because it is believed."
 *
 * This file is the cheap, total check under the strong, narrow one. It cannot tell whether a
 * citation means what the sentence around it says — no mechanical check can, and this repository
 * found two citations in `micro-worlds-web/src/lib/api.ts` that name lines which exist and no
 * longer say anything about the claim. What it catches is the failure that actually happens: a file
 * growing or shrinking under a line number nobody re-read. When a sibling is not checked out, the
 * citations into it are REPORTED as unchecked rather than passed over in silence, so a green run
 * never implies more than it measured.
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
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
 * `org/tools/registry.ts:8-11`, which applies that substitution once for the whole programme.
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

/** A citation: a repository-relative path, a colon, and one line number or a range. */
const CITATION = /\b((?:[a-z0-9_.-]+\/)+[A-Za-z0-9_.-]+\.(?:ts|tsx|css|yml|sol|md))\/?:(\d+)(?:-(\d+))?/g

interface Citation {
  readonly from: string
  readonly path: string
  readonly first: number
  readonly last: number
}

function collect(): Citation[] {
  const out: Citation[] = []
  for (const file of sourceFiles(here)) {
    const text = readFileSync(file, 'utf8')
    for (const m of text.matchAll(CITATION)) {
      const path = m[1] ?? ''
      const first = Number(m[2])
      out.push({ from: relative(here, file), path, first, last: m[3] ? Number(m[3]) : first })
    }
  }
  return out
}

/** Resolve a citation's path to a file on disk, or null when its repository is not checked out. */
function resolve(path: string): string | null {
  const [head, ...rest] = path.split('/')
  const root = siblingRoot(head ?? '')
  if (root === undefined) {
    // Not a sibling: a path inside THIS repository.
    const local = join(here, path)
    return existsSync(local) ? local : null
  }
  if (!existsSync(root)) return null
  const full = join(root, rest.join('/'))
  return existsSync(full) ? full : null
}

const CITATIONS = collect()

describe('every citation names a line that exists', () => {
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
      const root = siblingRoot(c.path.split('/')[0] ?? '')
      // A sibling that is not checked out is UNCHECKED, not broken. Reported below.
      if (root !== undefined && !existsSync(root)) return false
      return resolve(c.path) === null
    })
    assert.deepEqual(
      missing.map((c) => `${c.from} cites ${c.path}, which does not exist`),
      [],
    )
  })

  it('names a line INSIDE that file', () => {
    const broken: string[] = []
    for (const c of CITATIONS) {
      const file = resolve(c.path)
      if (file === null) continue
      if (!statSync(file).isFile()) continue
      const lines = readFileSync(file, 'utf8').split('\n').length
      if (c.first < 1 || c.last > lines || c.last < c.first) {
        broken.push(`${c.from} cites ${c.path}:${c.first}-${c.last}, but that file has ${lines} lines`)
      }
    }
    assert.deepEqual(broken, [])
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
