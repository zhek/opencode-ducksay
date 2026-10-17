/**
 * The duck, as two sprites: nose left and nose right.
 *
 * Both sprites are three lines of exactly `DUCK_WIDTH` columns, padding
 * included: the lane limit is computed from that width, and the mirror below is
 * only defined between lines of equal length.
 *
 * `DUCK_RIGHT` is the mirror of `DUCK_LEFT`: every line reversed, with the
 * glyphs that have a mirrored twin swapped (`<`→`>`, `(`→`)`, `/`→`\`). A plain
 * reversal is not enough — `<` would end up at the right end still opening
 * rightwards, which is a duck with its head on the wrong side.
 * `test/duck.test.ts` checks that relation instead of trusting it.
 *
 * Both stay data: mirroring happens when the art is edited, not at runtime.
 */

const WIDTH = 8

export const DUCK_LEFT = ["  __    ", "<(o )___", " ( ._> /"] as const

export const DUCK_RIGHT = ["    __  ", "___( o)>", "\\ <_. ) "] as const

/** The lane limit is measured against the widest sprite, so both must match. */
export const DUCK_WIDTH = WIDTH