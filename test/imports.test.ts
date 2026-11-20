import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

/**
 * The host rewrites the bare `solid-js` specifier to its own runtime, which is
 * what lets the plugin share the renderer's owner tree. A subpath such as
 * `solid-js/dist/solid.js` is not rewritten, so it loads a second Solid
 * instance whose effects the host cannot dispose. `test/host-runtime.test.tsx`
 * covers the component itself; this scan keeps every other source file from
 * reintroducing the subpath.
 */

const ROOT = resolve(import.meta.dir, "..")
const SRC = join(ROOT, "src")
const FORBIDDEN =
  /(?:from\s*|import\s*\(\s*|require\s*\(\s*)["'](solid-js\/(?:dist\/solid\.js|store\/dist\/store\.js))["']/g

function sourceFiles(directory: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...sourceFiles(path))
    } else if (entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name)) {
      files.push(path)
    }
  }
  return files
}

describe("source imports", () => {
  test("does not load Solid through a subpath", () => {
    const offenders: string[] = []
    for (const file of sourceFiles(SRC)) {
      const source = readFileSync(file, "utf8")
      for (const match of source.matchAll(FORBIDDEN)) {
        offenders.push(`${relative(ROOT, file)} imports ${match[1]}`)
      }
    }

    expect(offenders).toEqual([])
  })
})
