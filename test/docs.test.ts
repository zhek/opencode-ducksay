import { describe, expect, test } from "bun:test"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"

const ROOT = resolve(import.meta.dir, "..")
const DOCS = join(ROOT, "docs")

const DOCUMENTS = [
  "README.md",
  "README.ru.md",
  ...readdirSync(DOCS)
    .filter(name => name.endsWith(".md"))
    .sort()
    .map(name => `docs/${name}`),
]

function text(file: string): string {
  return readFileSync(join(ROOT, file), "utf8")
}

function relativeLinks(file: string): string[] {
  return [...text(file).matchAll(/\]\(([^)\s]+)\)/g)]
    .map(match => match[1]!)
    .filter(href => !/^[a-z][a-z0-9+.-]*:/i.test(href) && !href.startsWith("#"))
    .map(href => href.split("#")[0]!)
}

describe("documentation links", () => {
  test.each(DOCUMENTS)("%s links only to files that exist", file => {
    for (const href of relativeLinks(file)) {
      expect(existsSync(join(ROOT, dirname(file), href)), `${file} → ${href}`).toBe(true)
    }
  })
})

describe("Russian documentation", () => {
  const englishDocs = readdirSync(DOCS)
    .filter(name => name.endsWith(".md") && !name.endsWith(".ru.md"))
    .sort()

  test("every document in docs has a Russian counterpart", () => {
    expect(englishDocs.length).toBeGreaterThan(0)

    for (const name of englishDocs) {
      const counterpart = name.replace(/\.md$/, ".ru.md")
      expect(existsSync(join(DOCS, counterpart)), `docs/${name} needs docs/${counterpart}`).toBe(true)
    }
  })

  test("the Russian README links only to Russian documents", () => {
    const links = relativeLinks("README.ru.md").filter(href => href.startsWith("docs/"))
    expect(links.length).toBeGreaterThan(0)

    for (const href of links) {
      expect(href.endsWith(".ru.md"), `README.ru.md → ${href} is not Russian`).toBe(true)
    }
  })

  test("the Russian README links to the counterpart of every document", () => {
    const links = relativeLinks("README.md").filter(href => href.startsWith("docs/"))
    expect(links.length).toBeGreaterThan(0)

    const russian = text("README.ru.md")
    for (const href of links) {
      const counterpart = href.replace(/\.md$/, ".ru.md")
      expect(russian.includes(`](${counterpart})`), `README.ru.md is missing a link to ${counterpart}`).toBe(true)
    }
  })

  test("every Russian document links back to its English original", () => {
    for (const name of englishDocs) {
      const russian = `docs/${name.replace(/\.md$/, ".ru.md")}`
      expect(relativeLinks(russian), russian).toContain(name)
    }
  })
})
