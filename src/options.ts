import type { PluginOptions } from "@opencode/plugin/options"

/** Columns per second the duck swims at when the user sets nothing. */
export const DEFAULT_SWIM_SPEED = 12

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