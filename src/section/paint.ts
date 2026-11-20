import {
  BUBBLE_CONTENT_ROWS,
  BUBBLE_WIDTH,
  bubbleRows,
  wrapBubbleText,
  type BubbleSide,
} from "../bubble.ts"
import { COW_TONGUE_ROW, COW_WIDTH, cowEmergence, cowFrame } from "../cow.ts"
import type { DuckState, Mode } from "../duck-state.ts"
import { BEAK_ROW, BODY_ROW, HEAD_ROW, LOWER_WATER_ROW, QUESTION_ROW } from "../layout.ts"
import { QUESTION_FRAMES, questionColumn } from "../question.ts"
import { WATER_WIDTH } from "../timing.ts"
import { hasTilde } from "../wave.ts"

/** Everything one painted frame depends on. */
export interface PaintInput {
  readonly state: DuckState
  readonly mode: Mode
  readonly frozen: boolean
  readonly questionFrame: number
  readonly sprite: readonly string[]
  readonly laneWidth: number
  readonly artWidth: number
  readonly bubbleVisible: boolean
  readonly bubbleText: string
}

/**
 * Fills `rows` with the section's nine content rows.
 *
 * `rows` must already have `BUBBLE_CONTENT_ROWS` entries; it is cleared first,
 * so a caller can reuse one array for every frame.
 */
export function composeRowsInto(rows: string[], input: PaintInput): void {
  rows.fill("")
  const { state } = input

  // The cow is drawn first, so the duck stays in front if a sprite ever reaches
  // the reserve. It is pinned to the right wall: `e` columns are visible, and
  // its left edge moves left as it comes out.
  if (input.mode !== "rest" && state.cow !== undefined) {
    const emergence = cowEmergence(state.cow.columns)
    if (emergence > 0) {
      const left = input.laneWidth - emergence
      // The mouth stays closed on the way out. The tongue appears only when the
      // cow is fully out and stays through the hold and the return.
      const tongue = state.cow.columns >= COW_WIDTH
      for (const line of cowFrame(emergence, tongue)) {
        const at = line.row === COW_TONGUE_ROW ? left + 1 : left
        rows[line.row] = overlay(rows[line.row] ?? "", line.text, at)
      }
    }
  }

  const indent = " ".repeat(state.column)
  rows[HEAD_ROW] = indent + (input.sprite[0] ?? "")
  rows[BEAK_ROW] = indent + (input.sprite[1] ?? "")
  rows[BODY_ROW] = overWater(waterLine(0, state), input.sprite[2] ?? "", state.column)
  rows[LOWER_WATER_ROW] = waterLine(1, state)

  if (input.bubbleVisible) {
    const side: BubbleSide = state.direction === 1 ? "right" : "left"
    // The bubble hugs the beak: to the right of the duck when it faces right,
    // ending at the duck's column when it faces left.
    const at = state.direction === 1 ? state.column + input.artWidth : state.column - BUBBLE_WIDTH
    const segments = bubbleRows(wrapBubbleText(input.bubbleText), side)
    for (const [index, segment] of segments.entries()) {
      if (segment !== undefined) rows[index] = overlay(rows[index] ?? "", segment, at)
    }
  }

  // The marker is drawn after the bubble because a pending form hides the
  // bubble; doing it last also keeps a stale bubble from covering it if the two
  // ever coincide.
  if (input.frozen) {
    const glyph = QUESTION_FRAMES[input.questionFrame] ?? QUESTION_FRAMES[0]
    const at = questionColumn(state.column, state.direction)
    rows[QUESTION_ROW] = overlay(rows[QUESTION_ROW] ?? "", glyph, at)
  }
}

/** The section's nine content rows as a fresh array. */
export function composeRows(input: PaintInput): string[] {
  const rows: string[] = new Array(BUBBLE_CONTENT_ROWS).fill("")
  composeRowsInto(rows, input)
  return rows
}

/**
 * One row of water.
 *
 * Generated wider than any sidebar and let `wrapMode="none"` cut it at the
 * lane's edge, rather than measured. Measuring would mean reading the lane box,
 * and the row has to be drawable before that box has a width.
 */
function waterLine(row: number, state: DuckState): string {
  let line = ""
  for (let cell = 0; cell < WATER_WIDTH; cell++) line += hasTilde(cell, state.wavePhase, row) ? "~" : " "
  return line
}

/** Lays the duck's part of a row over the water that shares it. */
function overWater(water: string, sprite: string, column: number): string {
  return water.slice(0, column) + sprite + water.slice(column + sprite.length)
}

/**
 * Puts a bubble segment on `row` at column `at`.
 *
 * A segment that starts left of the lane is cut at its left edge, the same way
 * the art and water rows are cut by `wrapMode="none"`; the rest of the row,
 * including the duck, is left alone.
 */
function overlay(row: string, segment: string, at: number): string {
  if (at < 0) {
    const visible = segment.slice(-at)
    return visible + row.slice(visible.length)
  }
  const padded = row.padEnd(at + segment.length, " ")
  return padded.slice(0, at) + segment + padded.slice(at + segment.length)
}
