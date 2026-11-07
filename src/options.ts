import type { ModelRef } from "@opencode/client"
import type { PluginOptions } from "@opencode/plugin/options"

/** Columns per second the duck swims at when the user sets nothing. */
export const DEFAULT_SWIM_SPEED = 10

/** Above this the duck crosses the lane faster than it can be read. */
export const MAX_SWIM_SPEED = 120

/** How long the duck waits for the joke before falling back, in milliseconds. */
export const DEFAULT_LLM_TIMEOUT_MS = 60_000

/** Above this the user waits too long for a resting duck to say anything. */
export const MAX_LLM_TIMEOUT_MS = 120_000

/** How many recent messages of each role the joke is built from by default. */
export const DEFAULT_CONTEXT_DEPTH = 2

/** Above this the prompt grows faster than it buys a better joke. */
export const MAX_CONTEXT_DEPTH = 10

/** The options whose invalid values are reported in the log. */
export type ConfigOption = "swimSpeed" | "llmTimeout" | "llmContextDepth" | "llmModel"

/** Why a value was not used as written. */
export type ConfigReason = "fallback" | "capped" | "unusable"

/** One `config.invalid` line, with the exact message the log carries. */
export interface ConfigDiagnostic {
  readonly option: ConfigOption
  readonly value: unknown
  readonly effective: number | null
  readonly reason: ConfigReason
  readonly message: string
}

interface Reading<T> {
  readonly value: T
  readonly diagnostic?: ConfigDiagnostic
}

/**
 * Reads `swimSpeed` out of the plugin options and turns it into a speed.
 *
 * The host hands plugin options over unvalidated — `PluginOptions` is a plain
 * record of anything — so every rule lives here and every rule has a test:
 *
 * - no option, no `swimSpeed`, or `null` → the default;
 * - a string → parsed as a number, because quotes around a number are a common
 *   slip and quietly swapping a requested `24` for the default is worse;
 * - an empty or blank string → the default rather than `0`, so a field left
 *   blank cannot pass for a request to freeze the duck;
 * - `0` → `0`, which is the user asking for a duck that never moves;
 * - a finite number above `0` → capped at `MAX_SWIM_SPEED`;
 * - anything else — negative, `NaN`, infinite, a boolean, an object → the
 *   default, because a typo must not silently switch the feature off.
 */
export function resolveSwimSpeed(options: PluginOptions | undefined): number {
  return readSwimSpeed(options).value
}

function readSwimSpeed(options: PluginOptions | undefined): Reading<number> {
  const raw = options?.swimSpeed
  if (raw === undefined || raw === null) return { value: DEFAULT_SWIM_SPEED }
  if (typeof raw === "string") {
    const trimmed = raw.trim()
    if (trimmed === "") {
      return { value: DEFAULT_SWIM_SPEED, diagnostic: numericDiagnostic("swimSpeed", raw, DEFAULT_SWIM_SPEED, "fallback") }
    }
    return swimSpeedFrom(Number(trimmed), raw)
  }
  return swimSpeedFrom(raw, raw)
}

function swimSpeedFrom(value: unknown, raw: unknown): Reading<number> {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return { value: DEFAULT_SWIM_SPEED, diagnostic: numericDiagnostic("swimSpeed", raw, DEFAULT_SWIM_SPEED, "fallback") }
  }
  if (value > MAX_SWIM_SPEED) {
    return { value: MAX_SWIM_SPEED, diagnostic: numericDiagnostic("swimSpeed", raw, MAX_SWIM_SPEED, "capped") }
  }
  return { value }
}

/**
 * Reads `llmTimeout` out of the plugin options and turns it into milliseconds.
 *
 * The option is written in seconds, so a bare `5` is five seconds, not five
 * milliseconds. The same defensive rules as `swimSpeed` apply:
 *
 * - no option, `null`, a blank string, `0`, a negative number, `NaN`,
 *   `Infinity`, a boolean or an object → the sixty-second default;
 * - a finite positive number, or a string holding one → that many seconds;
 * - anything above one hundred twenty seconds → two minutes.
 *
 * `0` is deliberately not "wait forever": a missing bubble is worse than a
 * fallback, and the default makes that state impossible to reach by accident.
 */
export function resolveLlmTimeout(options: PluginOptions | undefined): number {
  return readLlmTimeout(options).value
}

function readLlmTimeout(options: PluginOptions | undefined): Reading<number> {
  const raw = options?.llmTimeout
  if (raw === undefined || raw === null) return { value: DEFAULT_LLM_TIMEOUT_MS }
  if (typeof raw === "string") {
    const trimmed = raw.trim()
    if (trimmed === "") {
      return {
        value: DEFAULT_LLM_TIMEOUT_MS,
        diagnostic: numericDiagnostic("llmTimeout", raw, DEFAULT_LLM_TIMEOUT_MS, "fallback"),
      }
    }
    return timeoutFrom(Number(trimmed), raw)
  }
  return timeoutFrom(raw, raw)
}

function timeoutFrom(value: unknown, raw: unknown): Reading<number> {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return {
      value: DEFAULT_LLM_TIMEOUT_MS,
      diagnostic: numericDiagnostic("llmTimeout", raw, DEFAULT_LLM_TIMEOUT_MS, "fallback"),
    }
  }
  const milliseconds = value * 1000
  if (milliseconds > MAX_LLM_TIMEOUT_MS) {
    return { value: MAX_LLM_TIMEOUT_MS, diagnostic: numericDiagnostic("llmTimeout", raw, MAX_LLM_TIMEOUT_MS, "capped") }
  }
  return { value: milliseconds }
}

/**
 * Reads `llmContextDepth` out of the plugin options.
 *
 * The depth is the number of recent messages taken from each role, so the
 * default `2` means two user messages and two assistant replies. `0` is not a
 * valid depth: without the last user message the prompt cannot follow the
 * language rule. A whole number from one to ten is used as written, a larger
 * one is capped, and everything else — a fraction, a negative number, a blank
 * string, a boolean, an object — falls back to the default.
 */
export function resolveContextDepth(options: PluginOptions | undefined): number {
  return readContextDepth(options).value
}

function readContextDepth(options: PluginOptions | undefined): Reading<number> {
  const raw = options?.llmContextDepth
  if (raw === undefined || raw === null) return { value: DEFAULT_CONTEXT_DEPTH }
  if (typeof raw === "string") {
    const trimmed = raw.trim()
    if (trimmed === "") {
      return {
        value: DEFAULT_CONTEXT_DEPTH,
        diagnostic: numericDiagnostic("llmContextDepth", raw, DEFAULT_CONTEXT_DEPTH, "fallback"),
      }
    }
    return depthFrom(Number(trimmed), raw)
  }
  return depthFrom(raw, raw)
}

function depthFrom(value: unknown, raw: unknown): Reading<number> {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    return {
      value: DEFAULT_CONTEXT_DEPTH,
      diagnostic: numericDiagnostic("llmContextDepth", raw, DEFAULT_CONTEXT_DEPTH, "fallback"),
    }
  }
  if (value > MAX_CONTEXT_DEPTH) {
    return {
      value: MAX_CONTEXT_DEPTH,
      diagnostic: numericDiagnostic("llmContextDepth", raw, MAX_CONTEXT_DEPTH, "capped"),
    }
  }
  return { value }
}

/**
 * What the joke request should do about the model.
 *
 * Three states, because two would hide a real distinction: no option means
 * "keep the session's model", while a value that cannot be read as
 * `provider/model` must silence the duck instead of quietly spending the
 * session model against the user's intent.
 */
export type LlmModelChoice =
  | { readonly kind: "session" }
  | { readonly kind: "model"; readonly model: ModelRef }
  | { readonly kind: "unusable" }

/**
 * Reads `llmModel` out of the plugin options.
 *
 * The value is one string, `"providerID/modelID"`, the shape OpenCode itself
 * uses for model references in configuration:
 *
 * - no option, `null`, an empty or blank string, a number, a boolean or an
 *   object → the session's model, exactly as before the option existed;
 * - a string is trimmed at both edges, the first `/` separates the provider
 *   from the model, and the rest is the model id as written, so an OpenRouter
 *   suffix such as `:free` survives;
 * - a non-blank string without `/`, with an empty provider or with an empty
 *   model → an unusable model, which the section turns into `Quack-quack!`.
 *
 * Existence and access are the server's business: an unknown provider or a
 * missing key fails the request and lands in the same fallback. No `variant`
 * is filled, because the option is deliberately just a model name.
 */
export function resolveLlmModel(options: PluginOptions | undefined): LlmModelChoice {
  return readLlmModel(options).value
}

function readLlmModel(options: PluginOptions | undefined): Reading<LlmModelChoice> {
  const raw = options?.llmModel
  if (typeof raw !== "string") return { value: { kind: "session" } }
  const trimmed = raw.trim()
  if (trimmed === "") return { value: { kind: "session" } }
  const slash = trimmed.indexOf("/")
  if (slash <= 0 || slash === trimmed.length - 1) {
    return {
      value: { kind: "unusable" },
      diagnostic: {
        option: "llmModel",
        value: raw,
        effective: null,
        reason: "unusable",
        message: "The llmModel option is not a usable provider/model reference.",
      },
    }
  }
  return {
    value: {
      kind: "model",
      model: { providerID: trimmed.slice(0, slash), id: trimmed.slice(slash + 1) },
    },
  }
}

/**
 * Reads `silent` out of the plugin options.
 *
 * Silence is an opt-in: only the boolean `true`, or a string that says `true`,
 * turns the duck's speech off. Everything else — a missing option, `false`,
 * `0`, a word, an object — leaves speech on. A typo must not silence the duck
 * by accident, which is the same defensive rule the numeric options follow.
 */
export function resolveSilent(options: PluginOptions | undefined): boolean {
  const value = options?.silent
  if (typeof value === "boolean") return value
  if (typeof value === "string") return value.trim().toLowerCase() === "true"
  return false
}

/** One diagnostic per option whose value was not used as written. */
export function diagnoseOptions(options: PluginOptions | undefined): ConfigDiagnostic[] {
  const readings = [
    readSwimSpeed(options),
    readLlmTimeout(options),
    readContextDepth(options),
    readLlmModel(options),
  ]
  return readings.flatMap((reading) => (reading.diagnostic === undefined ? [] : [reading.diagnostic]))
}

function numericDiagnostic(
  option: "swimSpeed" | "llmTimeout" | "llmContextDepth",
  value: unknown,
  effective: number,
  reason: "fallback" | "capped",
): ConfigDiagnostic {
  return {
    option,
    value,
    effective,
    reason,
    message: reason === "fallback"
      ? `The ${option} option is invalid.`
      : `The ${option} option was capped.`,
  }
}
