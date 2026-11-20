import { BUBBLE_MAX_LINES } from "./bubble.ts"

/**
 * Where the duck's three art lines sit inside the section, top to bottom.
 *
 * The five rows above are the bubble's reserve, so the duck stays on the same
 * rows whether or not the bubble is showing. The upper water line shares the
 * body row, and the lower water line gets its own row.
 */
export const HEAD_ROW = BUBBLE_MAX_LINES

export const BEAK_ROW = HEAD_ROW + 1

export const BODY_ROW = HEAD_ROW + 2

export const LOWER_WATER_ROW = HEAD_ROW + 3

/** The question marker sits on the row above the head, inside the reserve. */
export const QUESTION_ROW = HEAD_ROW - 1
