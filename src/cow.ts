import type { CowCameo } from "./duck-state.ts"
import { msPerColumn } from "./lane.ts"

/** How many columns of the cow are visible when it is fully out. */
export const COW_WIDTH = 5

/**
 * Chance that a leftward crossing starts the cow: one crossing in fifty.
 *
 * Kept here rather than written into the swim tick, so the rare-event rate has
 * one named home and a test can pin it down.
 */
export const COW_CHANCE = 1 / 50

/** Five columns out and five back. */
export const COW_CYCLE_COLUMNS = 10

/**
 * How many full-out intervals the cow holds before returning.
 *
 * The pause is measured in the same unit as a column step: one interval of
 * `3000 / swimSpeed` ms. With the default speed that is 300 ms.
 */
export const COW_HOLD_STEPS = 1

/** The cow's top line is one row below the blank reserve row. */
export const COW_TOP_ROW = 1

/** The tongue shares the row with the question marker. */
export const COW_TONGUE_ROW = 4

/** One line of the cow, positioned by its content row. */
export interface CowLine {
  readonly row: number
  readonly text: string
}

/**
 * True when a leftward step crossed the middle of the lane.
 *
 * The comparison is half-open: a step that lands exactly on the middle counts,
 * while one that starts there does not. The caller checks the direction, so a
 * rightward step through the same point never triggers the cow.
 */
export function crossedMidline(from: number, to: number, limit: number): boolean {
  if (limit <= 0) return false
  const middle = limit / 2
  return from > middle && to <= middle
}

/**
 * How many cow columns are visible at a step of the cycle.
 *
 * The cow goes out over the first five columns and back over the next five, so
 * columns 6..9 mirror 4..1. Zero and ten mean "not visible".
 */
export function cowEmergence(columns: number): number {
  if (columns <= 0 || columns >= COW_CYCLE_COLUMNS) return 0
  return columns <= COW_WIDTH ? columns : COW_CYCLE_COLUMNS - columns
}

/**
 * The cow's art for a given emergence.
 *
 * `tongue` is a phase, not just an emergence: the cow comes out with its mouth
 * closed, puts the tongue out only when fully out, and keeps it while going
 * back until only two columns are left. On tongue frames the eyes change from
 * `oo` to `oO`; at two columns the wall hides `O`, which is why the visible
 * face there is `(o`.
 */
export function cowFrame(emergence: number, tongue: boolean): readonly CowLine[] {
  const visible = Math.max(0, Math.min(COW_WIDTH, Math.trunc(emergence)))
  if (visible === 0) return []

  const showTongue = tongue && visible >= 2
  const lines: CowLine[] = [
    { row: COW_TOP_ROW, text: "^__^" },
    { row: COW_TOP_ROW + 1, text: showTongue ? "(oO)\\" : "(oo)\\" },
    { row: COW_TOP_ROW + 2, text: "(__)\\" },
  ]
  if (showTongue) lines.push({ row: COW_TONGUE_ROW, text: "U" })
  return lines
}

/**
 * Advances a cow by one swim tick.
 *
 * The cow moves at a third of the duck's pace. Time is accumulated in whole
 * milliseconds and the loop can spend more than one column after a short tick,
 * so the cycle keeps its duration instead of being rounded down to the tick.
 * At full reach the cow first spends `COW_HOLD_STEPS` intervals on the same
 * frame, then starts back. Reaching ten columns removes the cow.
 */
export function advanceCow(
  cow: CowCameo | undefined,
  elapsedMs: number,
  swimSpeed: number,
): CowCameo | undefined {
  if (cow === undefined) return undefined

  const interval = msPerColumn(swimSpeed / 3)
  if (!Number.isFinite(interval) || interval <= 0 || elapsedMs <= 0) return cow

  let columns = cow.columns
  let held = cow.held ?? 0
  let accumulated = cow.accumulated + elapsedMs
  while (accumulated >= interval && columns < COW_CYCLE_COLUMNS) {
    accumulated -= interval
    if (columns < COW_WIDTH) {
      columns += 1
    } else if (columns === COW_WIDTH && held < COW_HOLD_STEPS) {
      held += 1
    } else {
      columns += 1
    }
  }

  if (columns >= COW_CYCLE_COLUMNS) return undefined
  return held > 0 ? { columns, accumulated, held } : { columns, accumulated }
}
