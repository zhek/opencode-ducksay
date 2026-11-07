import { mkdirSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"

/** The line the folder writes into its own `.gitignore`. */
export const DUCKSAY_GITIGNORE = "*\n"

/** What happened to the folder's `.gitignore`. */
export type GitignoreState = "written" | "kept" | "failed"

/** The folder the plugin keeps its local data in, and its `.gitignore` state. */
export interface DucksayFolder {
  readonly folder: string
  readonly gitignore: GitignoreState
  readonly gitignoreError?: unknown
}

/**
 * Creates `<project>/.opencode/ducksay/` and hides its contents from git.
 *
 * The folder is created on demand, the first time a screenshot or a log needs
 * it. A `.gitignore` of its own is written with `wx`: an existing file — the
 * reader's own rules, or ours from an earlier save — stays exactly as it is.
 * When the file cannot be written at all, the caller still gets the folder; a
 * project on read-only media should still be able to save a duck or a log.
 */
export function ensureDucksayFolder(project: string): DucksayFolder {
  const folder = join(project, ".opencode", "ducksay")
  mkdirSync(folder, { recursive: true })
  return hideFromGit(folder)
}

function hideFromGit(folder: string): DucksayFolder {
  try {
    writeFileSync(join(folder, ".gitignore"), DUCKSAY_GITIGNORE, { flag: "wx" })
    return { folder, gitignore: "written" }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      try {
        if (!statSync(join(folder, ".gitignore")).isDirectory()) {
          return { folder, gitignore: "kept" }
        }
      } catch {
        // Fall through: the path exists but cannot be inspected.
      }
    }
    return { folder, gitignore: "failed", gitignoreError: error }
  }
}
