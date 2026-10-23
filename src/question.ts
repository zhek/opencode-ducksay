import { DUCK_WIDTH } from "./duck.ts"
import type { Direction } from "./lane.ts"

/**
 * The marker the duck shows while a form waits for an answer.
 *
 * The frames are data and the column is a pure function, like `thinking.ts`
 * and `lane.ts`: the section owns the clock and asks what to draw.
 */

/**
 * The frames the marker cycles through, in order.
 *
 * A face repeats so it stays on screen for two 150 ms steps (300 ms), while
 * the edge `!` appears for one step. The whole turn is 900 ms.
 */
export const QUESTION_FRAMES = ["?", "?", "!", "⸮", "⸮", "!"] as const

/** How long one marker frame stays on screen, in milliseconds. */
export const QUESTION_FRAME_MS = 150

/**
 * The column of the marker over the bracket by the beak.
 *
 * The sprite is left-aligned at `column`. A duck facing left has its `(` at
 * offset 1; one facing right has its `)` at `DUCK_WIDTH - 2`. The marker sits
 * exactly over that bracket, so it does not move when the frame changes.
 */
export function questionColumn(column: number, direction: Direction): number {
  return column + (direction === 1 ? DUCK_WIDTH - 2 : 1)
}
