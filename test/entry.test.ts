import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import entry from "../index.ts"

const ROOT = resolve(import.meta.dir, "..")
const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"))

describe("package entry", () => {
  test("is a plugin definition the server accepts", () => {
    expect(entry.id).toBe("ducksay")
    expect(typeof entry.setup).toBe("function")
  })

  test("setup registers nothing and returns no cleanup", async () => {
    expect(await entry.setup({} as never)).toBeUndefined()
  })
})

describe("package layout", () => {
  test("exposes the server and TUI entries", () => {
    expect(pkg.exports["."]).toBe("./index.ts")
    expect(pkg.exports["./tui"]).toBe("./src/tui.tsx")
  })

  test("ships every entry the package points to", () => {
    expect(pkg.files).toContain("index.ts")
    expect(pkg.files).toContain("tui.ts")
    expect(pkg.files).toContain("src")
  })

  test("TUI source sets its own JSX runtime", () => {
    // OpenCode compiles a plugin installed into node_modules with the default
    // JSX runtime and ignores its tsconfig, so the pragma is what keeps the
    // published package loadable.
    const source = readFileSync(resolve(ROOT, "src/tui.tsx"), "utf8")
    expect(source.startsWith("/** @jsxImportSource @opentui/solid */")).toBe(true)
  })
})
