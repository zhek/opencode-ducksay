import { appendFileSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs"
import { join } from "node:path"
import { ensureDucksayFolder } from "./ducksay-folder.ts"

/** The severity of one log line. */
export type LogLevel = "error" | "warn" | "info"

/**
 * What the plugin writes. `info` is a developer level: the constant is the only
 * switch, and there is deliberately no plugin option for it.
 */
export const LOG_LEVEL: LogLevel = "warn"

/** The schema version carried by every line. */
export const LOG_SCHEMA_VERSION = 1

/** How many log files are kept, regardless of how many days they span. */
export const LOG_MAX_FILES = 7

/** The largest one log file may grow, in bytes. */
export const LOG_MAX_FILE_BYTES = 1_048_576

/** The largest one serialized line may grow, in bytes. */
export const LOG_MAX_LINE_BYTES = 16_384

/** How much of `message` survives truncation, in characters. */
export const LOG_MAX_MESSAGE_CHARS = 1_000

/** How many lines of a stack survive truncation. */
export const LOG_MAX_STACK_LINES = 10

/** How much of one string in `data` survives truncation, in characters. */
export const LOG_MAX_DATA_VALUE_CHARS = 500

/** A normalized error object, ready for JSON. */
export interface LogErrorRecord {
  readonly name: string
  readonly code?: string
  readonly message: string
  readonly stack?: string
}

/** Everything one line carries besides the time and pid. */
export interface LogLineInput {
  readonly level: LogLevel
  readonly event: string
  readonly message: string
  readonly session?: string
  readonly error?: unknown
  readonly data?: Record<string, unknown>
}

/** The optional part of a logger call. */
export interface LogLineExtra {
  readonly session?: string
  readonly error?: unknown
  readonly data?: Record<string, unknown>
}

/** Where a logger writes, resolved per event from the session it belongs to. */
export interface LoggerOptions {
  readonly directory: (sessionID?: string) => string | undefined
  readonly now?: () => Date
  readonly level?: LogLevel
  readonly pid?: number
}

/** The sink the plugin talks to; it never throws. */
export interface Logger {
  error(event: string, message: string, extra?: LogLineExtra): void
  warn(event: string, message: string, extra?: LogLineExtra): void
  info(event: string, message: string, extra?: LogLineExtra): void
}

/** One log file on disk, with its name parsed. */
export interface LogFile {
  readonly path: string
  readonly date: string
  readonly index: number
  readonly size: number
}

const LOG_FILE_PATTERN = /^ducksay-(\d{4}-\d{2}-\d{2})-(\d+)\.log$/

const LEVEL_WEIGHT: Readonly<Record<LogLevel, number>> = {
  error: 0,
  warn: 1,
  info: 2,
}

/** Local date in the filename form, `YYYY-MM-DD`. */
export function formatLogDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Local time with an explicit offset, `YYYY-MM-DDTHH:mm:ss.SSS±HH:MM`. */
export function formatLogTime(date: Date): string {
  const offset = -date.getTimezoneOffset()
  const sign = offset >= 0 ? "+" : "-"
  const absolute = Math.abs(offset)
  return `${formatLogDate(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`
}

/** The file name for one day and one sequence number. */
export function formatLogFileName(date: string, index: number): string {
  return `ducksay-${date}-${index}.log`
}

/** Parses a file name that belongs to the logger; anything else is `undefined`. */
export function parseLogFileName(name: string): { readonly date: string; readonly index: number } | undefined {
  const match = LOG_FILE_PATTERN.exec(name)
  if (match === null) return undefined
  const index = Number(match[2])
  if (!Number.isSafeInteger(index) || index < 1) return undefined
  return { date: match[1]!, index }
}

/** Orders files the way the ring deletes them: date first, then numeric index. */
export function compareLogFiles(left: LogFile, right: LogFile): number {
  if (left.date !== right.date) return left.date < right.date ? -1 : 1
  return left.index - right.index
}

/** All log files in `directory`, oldest first; foreign names are ignored. */
export function listLogFiles(directory: string): LogFile[] {
  const files: LogFile[] = []
  for (const name of readdirSync(directory)) {
    const parsed = parseLogFileName(name)
    if (parsed === undefined) continue
    const path = join(directory, name)
    try {
      files.push({ path, date: parsed.date, index: parsed.index, size: statSync(path).size })
    } catch {
      // A file that vanished between readdir and stat is not our business.
    }
  }
  return files.sort(compareLogFiles)
}

/** One JSON line, or `undefined` when even a truncated line would not fit. */
export function formatLogLine(input: LogLineInput, now: Date, pid: number): string | undefined {
  const record: Record<string, unknown> = {
    v: LOG_SCHEMA_VERSION,
    time: formatLogTime(now),
    level: input.level,
    event: input.event,
    message: truncate(input.message, LOG_MAX_MESSAGE_CHARS),
    pid,
  }
  if (input.session !== undefined) record.session = input.session
  const error = normalizeError(input.error)
  if (error !== undefined) record.error = error
  const data = normalizeData(input.data)
  if (data !== undefined) record.data = data

  let line: string
  try {
    line = `${JSON.stringify(record)}\n`
  } catch {
    return undefined
  }
  return Buffer.byteLength(line, "utf8") > LOG_MAX_LINE_BYTES ? undefined : line
}

/** Appends one prepared line to the project's log, rotating when needed. */
export function appendLogLine(directory: string, line: string, now: Date): void {
  try {
    const prepared = ensureDucksayFolder(directory)
    const logs = join(prepared.folder, "logs")
    mkdirSync(logs, { recursive: true })

    const date = formatLogDate(now)
    const bytes = Buffer.byteLength(line, "utf8")
    const files = listLogFiles(logs)
    const target = files.find((file) => file.date === date && file.size + bytes <= LOG_MAX_FILE_BYTES)
    if (target !== undefined) {
      appendFileSync(target.path, line, "utf8")
      return
    }

    const dayFiles = files.filter((file) => file.date === date)
    const index = dayFiles.length === 0 ? 1 : Math.max(...dayFiles.map((file) => file.index)) + 1

    // Make room before creating the eighth file. A failed unlink is not fatal:
    // the line still matters more than the cap, and the next rotation retries.
    while (files.length >= LOG_MAX_FILES) {
      const oldest = files.shift()
      if (oldest === undefined) break
      try {
        unlinkSync(oldest.path)
      } catch {
        break
      }
    }

    appendFileSync(join(logs, formatLogFileName(date, index)), line, "utf8")
  } catch {
    // A log line must never break the duck.
  }
}

/** Creates the sink the plugin uses. Every filesystem error is swallowed. */
export function createLogger(options: LoggerOptions): Logger {
  const threshold = options.level ?? LOG_LEVEL
  const now = options.now ?? (() => new Date())
  const pid = options.pid ?? process.pid

  const write = (level: LogLevel, event: string, message: string, extra?: LogLineExtra): void => {
    if (!passes(level, threshold)) return
    try {
      const directory = options.directory(extra?.session)
      if (directory === undefined || directory === "") return
      const at = now()
      const line = formatLogLine({ level, event, message, ...extra }, at, pid)
      if (line === undefined) return
      appendLogLine(directory, line, at)
    } catch {
      // A log line must never break the duck.
    }
  }

  return {
    error: (event, message, extra) => write("error", event, message, extra),
    warn: (event, message, extra) => write("warn", event, message, extra),
    info: (event, message, extra) => write("info", event, message, extra),
  }
}

function passes(level: LogLevel, threshold: LogLevel): boolean {
  return LEVEL_WEIGHT[level] <= LEVEL_WEIGHT[threshold]
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, "0")
}

function truncate(value: string, limit: number): string {
  return value.length <= limit ? value : value.slice(0, limit)
}

function normalizeError(error: unknown): LogErrorRecord | undefined {
  if (error === undefined || error === null) return undefined
  if (typeof error === "string") {
    return { name: "Error", message: truncate(error, LOG_MAX_MESSAGE_CHARS) }
  }

  const message = error instanceof Error
    ? error.message
    : typeof (error as { message?: unknown }).message === "string"
      ? (error as { message: string }).message
      : String(error)
  const name = error instanceof Error && error.name !== "" ? error.name : "Error"
  const code = (error as NodeJS.ErrnoException).code
  const stack = error instanceof Error && typeof error.stack === "string"
    ? error.stack.split(/\r?\n/).slice(0, LOG_MAX_STACK_LINES).join("\n")
    : undefined

  return {
    name,
    ...(typeof code === "string" && code !== "" ? { code } : {}),
    message: truncate(message, LOG_MAX_MESSAGE_CHARS),
    ...(stack === undefined || stack === "" ? {} : { stack }),
  }
}

function normalizeData(data: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (data === undefined) return undefined
  const normalized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue
    normalized[key] = normalizeValue(value)
  }
  return Object.keys(normalized).length === 0 ? undefined : normalized
}

function normalizeValue(value: unknown): unknown {
  if (typeof value === "string") return truncate(value, LOG_MAX_DATA_VALUE_CHARS)
  if (value === null || typeof value === "number" || typeof value === "boolean") return value
  try {
    return truncate(JSON.stringify(value) ?? String(value), LOG_MAX_DATA_VALUE_CHARS)
  } catch {
    return truncate(String(value), LOG_MAX_DATA_VALUE_CHARS)
  }
}
