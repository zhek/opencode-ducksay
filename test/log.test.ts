import { describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  LOG_LEVEL,
  LOG_MAX_DATA_VALUE_CHARS,
  LOG_MAX_FILE_BYTES,
  LOG_MAX_MESSAGE_CHARS,
  LOG_MAX_STACK_LINES,
  LOG_SCHEMA_VERSION,
  compareLogFiles,
  createLogger,
  formatLogDate,
  formatLogFileName,
  formatLogLine,
  formatLogTime,
  parseLogFileName,
  type LogFile,
} from "../src/log.ts"
import { logConfigDiagnostic, logJokeFailure } from "../src/log-events.ts"
import type { JokeFailure } from "../src/joke.ts"
import { diagnoseOptions } from "../src/options.ts"

const NOW = new Date(2026, 10, 7, 18, 42, 10, 4)
const PID = 4242

function inProject(run: (directory: string) => void): void {
  const directory = mkdtempSync(join(tmpdir(), "ducksay-log-"))
  try {
    run(directory)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

function expectedOffset(date: Date): string {
  const offset = -date.getTimezoneOffset()
  const sign = offset >= 0 ? "+" : "-"
  const absolute = Math.abs(offset)
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`
}

function logLines(directory: string): string[] {
  const file = join(directory, ".opencode", "ducksay", "logs", "ducksay-2026-11-07-1.log")
  return readFileSync(file, "utf8").trimEnd().split("\n")
}

function entry(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    v: LOG_SCHEMA_VERSION,
    time: formatLogTime(NOW),
    level: "warn",
    event: "joke.source_missing",
    message: "The session needed for a joke is gone.",
    pid: PID,
    ...overrides,
  }
}

describe("log formatting", () => {
  test("formats the local date and time with an explicit offset", () => {
    expect(formatLogDate(NOW)).toBe("2026-11-07")
    expect(formatLogTime(NOW)).toBe(`2026-11-07T18:42:10.004${expectedOffset(NOW)}`)
    expect(formatLogTime(NOW)).not.toContain("Z")
    expect(formatLogFileName("2026-11-07", 10)).toBe("ducksay-2026-11-07-10.log")
  })

  test("parses only the logger's own names", () => {
    expect(parseLogFileName("ducksay-2026-11-07-1.log")).toEqual({ date: "2026-11-07", index: 1 })
    expect(parseLogFileName("ducksay-2026-11-07-10.log")).toEqual({ date: "2026-11-07", index: 10 })
    expect(parseLogFileName("ducksay-2026-11-07-0.log")).toBeUndefined()
    expect(parseLogFileName("ducksay-2026-11-07.log")).toBeUndefined()
    expect(parseLogFileName("notes.txt")).toBeUndefined()
  })

  test("writes one JSON object per line with the common fields", () => {
    const line = formatLogLine(
      {
        level: "error",
        event: "joke.request_failed",
        message: "The joke request failed.",
        session: "ses_1",
        error: Object.assign(new Error("socket hang up"), { code: "ECONNRESET" }),
        data: { model: "openai/gpt-5", durationMs: 1534 },
      },
      NOW,
      PID,
    )

    expect(line?.endsWith("\n")).toBe(true)
    const parsed = JSON.parse(line!)
    expect(parsed).toEqual({
      ...entry({
        level: "error",
        event: "joke.request_failed",
        message: "The joke request failed.",
        session: "ses_1",
      }),
      error: {
        name: "Error",
        code: "ECONNRESET",
        message: "socket hang up",
        stack: expect.any(String),
      },
      data: { model: "openai/gpt-5", durationMs: 1534 },
    })
  })

  test("omits session, error and data when a line has none", () => {
    const parsed = JSON.parse(formatLogLine({ level: "warn", event: "joke.source_missing", message: "x" }, NOW, PID)!)

    expect(parsed).toEqual(entry({ message: "x" }))
    expect(parsed.error).toBeUndefined()
    expect(parsed.data).toBeUndefined()
  })

  test("truncates the message, the stack and string data", () => {
    const error = new Error("e".repeat(LOG_MAX_MESSAGE_CHARS + 50))
    error.stack = Array.from({ length: 100 }, (_, index) => `line ${index}`).join("\n")

    const parsed = JSON.parse(
      formatLogLine(
        {
          level: "error",
          event: "event.failed",
          message: "m".repeat(LOG_MAX_MESSAGE_CHARS + 50),
          error,
          data: { long: "d".repeat(LOG_MAX_DATA_VALUE_CHARS + 50) },
        },
        NOW,
        PID,
      )!,
    )

    expect(parsed.message).toHaveLength(LOG_MAX_MESSAGE_CHARS)
    expect(parsed.error.message).toHaveLength(LOG_MAX_MESSAGE_CHARS)
    expect(parsed.error.stack.split("\n")).toHaveLength(LOG_MAX_STACK_LINES)
    expect(parsed.data.long).toHaveLength(LOG_MAX_DATA_VALUE_CHARS)
  })

  test("drops a line that cannot fit the byte budget", () => {
    const data: Record<string, string> = {}
    for (let index = 0; index < 100; index++) data[`key${index}`] = "x".repeat(LOG_MAX_DATA_VALUE_CHARS)

    expect(formatLogLine({ level: "warn", event: "config.invalid", message: "x", data }, NOW, PID)).toBeUndefined()
  })
})

describe("the logger", () => {
  test("does not create the logs folder until a line passes the level", () => {
    inProject((directory) => {
      const logger = createLogger({ directory: () => directory, now: () => NOW, pid: PID })
      expect(existsSync(join(directory, ".opencode", "ducksay"))).toBe(false)

      logger.info("joke.aborted", "The joke request was cancelled.")
      expect(existsSync(join(directory, ".opencode", "ducksay"))).toBe(false)

      logger.warn("joke.source_missing", "The session needed for a joke is gone.")
      expect(existsSync(join(directory, ".opencode", "ducksay", "logs", "ducksay-2026-11-07-1.log"))).toBe(true)
    })
  })

  test("writes warn and error at the default level and filters info", () => {
    inProject((directory) => {
      const logger = createLogger({ directory: () => directory, now: () => NOW, pid: PID })
      expect(LOG_LEVEL).toBe("warn")

      logger.info("joke.aborted", "The joke request was cancelled.")
      logger.warn("joke.source_missing", "The session needed for a joke is gone.")
      logger.error("joke.request_failed", "The joke request failed.")

      const lines = logLines(directory).map((line) => JSON.parse(line))
      expect(lines.map((line) => line.event)).toEqual(["joke.source_missing", "joke.request_failed"])
      expect(lines.map((line) => line.level)).toEqual(["warn", "error"])
    })
  })

  test("writes info when the logger is asked for it", () => {
    inProject((directory) => {
      const logger = createLogger({ directory: () => directory, now: () => NOW, pid: PID, level: "info" })
      logger.info("joke.aborted", "The joke request was cancelled.", { data: { reason: "turn" } })

      const line = JSON.parse(logLines(directory)[0]!)
      expect(line.event).toBe("joke.aborted")
      expect(line.level).toBe("info")
      expect(line.data).toEqual({ reason: "turn" })
    })
  })

  test("creates the folder and its .gitignore on the first line", () => {
    inProject((directory) => {
      const logger = createLogger({ directory: () => directory, now: () => NOW, pid: PID })
      logger.warn("joke.source_missing", "The session needed for a joke is gone.")

      const folder = join(directory, ".opencode", "ducksay")
      expect(readFileSync(join(folder, ".gitignore"), "utf8")).toBe("*\n")
    })
  })

  test("appends every event as its own JSON line", () => {
    inProject((directory) => {
      const logger = createLogger({ directory: () => directory, now: () => NOW, pid: PID })
      logger.warn("joke.source_missing", "The session needed for a joke is gone.")
      logger.error("joke.request_failed", "The joke request failed.")

      const lines = logLines(directory)
      expect(lines).toHaveLength(2)
      expect(lines.map((line) => JSON.parse(line).event)).toEqual(["joke.source_missing", "joke.request_failed"])
    })
  })

  test("rotates to the next index when the file is full", () => {
    inProject((directory) => {
      const logs = join(directory, ".opencode", "ducksay", "logs")
      mkdirSync(logs, { recursive: true })
      writeFileSync(join(logs, "ducksay-2026-11-07-1.log"), "x".repeat(LOG_MAX_FILE_BYTES))

      const logger = createLogger({ directory: () => directory, now: () => NOW, pid: PID })
      logger.warn("joke.source_missing", "The session needed for a joke is gone.")

      expect(readdirSync(logs).sort()).toEqual(["ducksay-2026-11-07-1.log", "ducksay-2026-11-07-2.log"])
      expect(readFileSync(join(logs, "ducksay-2026-11-07-2.log"), "utf8")).toContain("joke.source_missing")
    })
  })

  test("keeps no more than seven files and deletes the oldest by name", () => {
    inProject((directory) => {
      const logs = join(directory, ".opencode", "ducksay", "logs")
      mkdirSync(logs, { recursive: true })
      for (let day = 1; day <= 7; day++) {
        writeFileSync(join(logs, `ducksay-2026-10-${String(day).padStart(2, "0")}-1.log`), "old\n")
      }

      const logger = createLogger({ directory: () => directory, now: () => NOW, pid: PID })
      logger.warn("joke.source_missing", "The session needed for a joke is gone.")

      const names = readdirSync(logs).sort()
      expect(names).toHaveLength(7)
      expect(names).not.toContain("ducksay-2026-10-01-1.log")
      expect(names).toContain("ducksay-2026-11-07-1.log")
    })
  })

  test("compares the suffix as a number, so -2 is older than -10", () => {
    const files: LogFile[] = [
      { path: "ten", date: "2026-11-07", index: 10, size: 0 },
      { path: "two", date: "2026-11-07", index: 2, size: 0 },
    ]

    expect(files.sort(compareLogFiles).map((file) => file.index)).toEqual([2, 10])
  })

  test("leaves foreign files in the logs folder alone", () => {
    inProject((directory) => {
      const logs = join(directory, ".opencode", "ducksay", "logs")
      mkdirSync(logs, { recursive: true })
      writeFileSync(join(logs, "notes.txt"), "keep me")
      for (let day = 1; day <= 7; day++) {
        writeFileSync(join(logs, `ducksay-2026-10-${String(day).padStart(2, "0")}-1.log`), "old\n")
      }

      const logger = createLogger({ directory: () => directory, now: () => NOW, pid: PID })
      logger.warn("joke.source_missing", "The session needed for a joke is gone.")

      expect(existsSync(join(logs, "notes.txt"))).toBe(true)
      expect(readFileSync(join(logs, "notes.txt"), "utf8")).toBe("keep me")
    })
  })

  test("still writes when the oldest file cannot be deleted", () => {
    inProject((directory) => {
      const logs = join(directory, ".opencode", "ducksay", "logs")
      mkdirSync(logs, { recursive: true })
      mkdirSync(join(logs, "ducksay-2026-09-01-1.log"))
      for (let day = 1; day <= 6; day++) {
        writeFileSync(join(logs, `ducksay-2026-10-${String(day).padStart(2, "0")}-1.log`), "old\n")
      }

      const logger = createLogger({ directory: () => directory, now: () => NOW, pid: PID })
      logger.warn("joke.source_missing", "The session needed for a joke is gone.")

      expect(existsSync(join(logs, "ducksay-2026-11-07-1.log"))).toBe(true)
      expect(existsSync(join(logs, "ducksay-2026-09-01-1.log"))).toBe(true)
    })
  })

  test("swallows an unwritable project and never throws", () => {
    inProject((directory) => {
      const file = join(directory, "not-a-directory")
      writeFileSync(file, "")

      const logger = createLogger({ directory: () => file, now: () => NOW, pid: PID })
      expect(() => logger.warn("joke.source_missing", "The session needed for a joke is gone.")).not.toThrow()
    })
  })
})

describe("log events", () => {
  test("does not write an info model failure at the default level", () => {
    inProject((directory) => {
      const logger = createLogger({ directory: () => directory, now: () => NOW, pid: PID })
      logJokeFailure(logger, { kind: "model_unusable", model: "haiku" }, "ses_1")

      expect(existsSync(join(directory, ".opencode", "ducksay"))).toBe(false)
    })
  })

  test("writes the info model failure when the logger is at info", () => {
    inProject((directory) => {
      const logger = createLogger({ directory: () => directory, now: () => NOW, pid: PID, level: "info" })
      logJokeFailure(logger, { kind: "model_unusable", model: "haiku" }, "ses_1")

      const line = JSON.parse(logLines(directory)[0]!)
      expect(line).toMatchObject({
        level: "info",
        event: "joke.model_unusable",
        message: "The configured joke model is not usable.",
        session: "ses_1",
        data: { model: "haiku" },
      })
    })
  })

  test("maps a failed request to an error line with metadata only", () => {
    inProject((directory) => {
      const logger = createLogger({ directory: () => directory, now: () => NOW, pid: PID })
      const failure: JokeFailure = {
        kind: "request_failed",
        model: "openai/gpt-5",
        durationMs: 1534,
        error: new Error("socket hang up"),
      }
      logJokeFailure(logger, failure, "ses_1")

      const line = JSON.parse(logLines(directory)[0]!)
      expect(line).toMatchObject({
        level: "error",
        event: "joke.request_failed",
        message: "The joke request failed.",
        session: "ses_1",
        data: { model: "openai/gpt-5", durationMs: 1534 },
      })
      expect(line.error.message).toBe("socket hang up")
      expect(JSON.stringify(line)).not.toContain("prompt")
      expect(JSON.stringify(line)).not.toContain("Quack")
    })
  })

  test("maps a config diagnostic with its exact message and data", () => {
    inProject((directory) => {
      const logger = createLogger({ directory: () => directory, now: () => NOW, pid: PID })
      const [diagnostic] = diagnoseOptions({ llmModel: "haiku" })
      logConfigDiagnostic(logger, diagnostic!)

      const line = JSON.parse(logLines(directory)[0]!)
      expect(line).toMatchObject({
        level: "warn",
        event: "config.invalid",
        message: "The llmModel option is not a usable provider/model reference.",
        data: {
          option: "llmModel",
          value: "haiku",
          effective: null,
          reason: "unusable",
        },
      })
    })
  })
})
