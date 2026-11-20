import { expect } from "bun:test"
import {
  DUCK_LEFT,
  DUCK_LEFT_OPEN,
  DUCK_RIGHT,
  DUCK_RIGHT_OPEN,
  DUCK_WIDTH,
} from "../../src/duck.ts"
import { DEFAULT_SWIM_SPEED } from "../../src/options.ts"

/** `SESSION_SIDEBAR_WIDTH` from OpenCode's session sidebar. */
export const PANEL_WIDTH = 42

/** The sidebar's content width, one inset narrower than the panel. */
export const PANEL_CONTENT_WIDTH = 37

/** One column at the plugin's default speed. */
export const COLUMN_MS = 1000 / DEFAULT_SWIM_SPEED

/** The interval the section ticks on; see `TICK_MS` in `src/tui.tsx`. */
export const TICK_MS = 33

/** Where the duck can get to: the lane minus the art. */
export const RIGHT_EDGE = PANEL_WIDTH - DUCK_WIDTH

/**
 * The part of the head line both directions share: the right sprite pads before
 * the head, the left sprite pads after it, so only the two spaces and the two
 * underscores are common.
 */
export const HEAD = "  __"

/**
 * The middle art line, closed and open. All four versions start at column 0, so
 * `indexOf` on the captured frame is the duck's column exactly — no leading
 * spaces to account for.
 */
export const FACING_RIGHT = DUCK_RIGHT[1]
export const FACING_RIGHT_OPEN = DUCK_RIGHT_OPEN[1]
export const FACING_LEFT = DUCK_LEFT[1]
export const FACING_LEFT_OPEN = DUCK_LEFT_OPEN[1]
export const RIGHT_MARKERS = [FACING_RIGHT, FACING_RIGHT_OPEN]
export const LEFT_MARKERS = [FACING_LEFT, FACING_LEFT_OPEN]
export const ALL_MARKERS = [...RIGHT_MARKERS, ...LEFT_MARKERS]

/** The column the duck is drawn at, read back from a captured frame. */
export function columnOf(frame: string): number {
  const rows = frame.split("\n").filter((row) => ALL_MARKERS.some((marker) => row.includes(marker)))
  expect(rows).toHaveLength(1)
  const marker = ALL_MARKERS.find((candidate) => rows[0]!.includes(candidate))!
  return rows[0]!.indexOf(marker)
}

/** True when the duck faces right, i.e. towards the middle from the left edge. */
export function facesRight(frame: string): boolean {
  return RIGHT_MARKERS.some((marker) => frame.includes(marker))
}
