/**
 * The duck, as four sprites: nose left and nose right, each with a closed and
 * an open beak.
 *
 * All four are three lines of exactly `DUCK_WIDTH` columns, padding included:
 * the lane limit is computed from that width, and the mirror below is only
 * defined between lines of equal length.
 *
 * `DUCK_RIGHT` is the mirror of `DUCK_LEFT`, and `DUCK_RIGHT_OPEN` is the
 * mirror of `DUCK_LEFT_OPEN`: every line reversed, with the glyphs that have a
 * mirrored twin swapped (`<`→`>`, `(`→`)`, `/`→`\`). A plain reversal is not
 * enough — `<` would end up at the right end still opening rightwards, which is
 * a duck with its head on the wrong side. `test/duck.test.ts` checks both
 * relations instead of trusting them.
 *
 * The open pair differs from the closed one only in the middle line: the beak
 * opens towards the middle of the lane.
 *
 * All four stay data: mirroring happens when the art is edited, not at runtime.
 */

const WIDTH = 8

export const DUCK_LEFT = ["  __    ", "<(o )___", " ( ._> /"] as const

export const DUCK_LEFT_OPEN = ["  __    ", ">(o )___", " ( ._> /"] as const

export const DUCK_RIGHT = ["    __  ", "___( o)>", "\\ <_. ) "] as const

export const DUCK_RIGHT_OPEN = ["    __  ", "___( o)<", "\\ <_. ) "] as const

/** The lane limit is measured against the widest sprite, so all four must match. */
export const DUCK_WIDTH = WIDTH