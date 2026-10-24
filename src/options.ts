import type { PluginOptions } from "@opencode/plugin/options"

/** Columns per second the duck swims at when the user sets nothing. */
export const DEFAULT_SWIM_SPEED = 10

/** Above this the duck crosses the lane faster than it can be read. */
export const MAX_SWIM_SPEED = 120

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
  const value = options?.swimSpeed
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed === "" ? DEFAULT_SWIM_SPEED : clamp(Number(trimmed))
  }
  return clamp(value)
}

function clamp(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return DEFAULT_SWIM_SPEED
  return Math.min(value, MAX_SWIM_SPEED)
}

/** How long the duck waits for the joke before falling back, in milliseconds. */
export const DEFAULT_LLM_TIMEOUT_MS = 60_000

/** Above this the user waits too long for a resting duck to say anything. */
export const MAX_LLM_TIMEOUT_MS = 120_000

/** How many recent messages of each role the joke is built from by default. */
export const DEFAULT_CONTEXT_DEPTH = 2

/** Above this the prompt grows faster than it buys a better joke. */
export const MAX_CONTEXT_DEPTH = 10

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
  const value = options?.llmTimeout
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (trimmed === "") return DEFAULT_LLM_TIMEOUT_MS
    return timeoutFrom(Number(trimmed))
  }
  return timeoutFrom(value)
}

function timeoutFrom(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return DEFAULT_LLM_TIMEOUT_MS
  return Math.min(value * 1000, MAX_LLM_TIMEOUT_MS)
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
  const value = options?.llmContextDepth
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (trimmed === "") return DEFAULT_CONTEXT_DEPTH
    return depthFrom(Number(trimmed))
  }
  return depthFrom(value)
}

function depthFrom(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) return DEFAULT_CONTEXT_DEPTH
  return Math.min(value, MAX_CONTEXT_DEPTH)
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
