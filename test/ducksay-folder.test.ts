import { describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DUCKSAY_GITIGNORE, ensureDucksayFolder } from "../src/ducksay-folder.ts"

function inProject(run: (directory: string) => void): void {
  const directory = mkdtempSync(join(tmpdir(), "ducksay-folder-"))
  try {
    run(directory)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

describe("the ducksay folder", () => {
  test("creates the folder with its own .gitignore", () => {
    inProject((directory) => {
      const prepared = ensureDucksayFolder(directory)
      const folder = join(directory, ".opencode", "ducksay")

      expect(prepared).toEqual({ folder, gitignore: "written" })
      expect(existsSync(folder)).toBe(true)
      expect(readFileSync(join(folder, ".gitignore"), "utf8")).toBe(DUCKSAY_GITIGNORE)
      expect(DUCKSAY_GITIGNORE).toBe("*\n")
    })
  })

  test("leaves the reader's .gitignore alone", () => {
    inProject((directory) => {
      const folder = join(directory, ".opencode", "ducksay")
      mkdirSync(folder, { recursive: true })
      writeFileSync(join(folder, ".gitignore"), "!screenshots/keep-me.png\n")

      const prepared = ensureDucksayFolder(directory)

      expect(prepared.gitignore).toBe("kept")
      expect(readFileSync(join(folder, ".gitignore"), "utf8")).toBe("!screenshots/keep-me.png\n")
    })
  })

  test("reports a .gitignore that cannot be written and still returns the folder", () => {
    inProject((directory) => {
      const folder = join(directory, ".opencode", "ducksay")
      mkdirSync(join(folder, ".gitignore"), { recursive: true })

      const prepared = ensureDucksayFolder(directory)

      expect(prepared.folder).toBe(folder)
      expect(prepared.gitignore).toBe("failed")
      expect(prepared.gitignoreError).toBeDefined()
      expect(existsSync(folder)).toBe(true)
    })
  })

  test("throws when the project cannot hold the folder", () => {
    inProject((directory) => {
      const file = join(directory, "not-a-directory")
      writeFileSync(file, "")

      expect(() => ensureDucksayFolder(file)).toThrow()
    })
  })
})
