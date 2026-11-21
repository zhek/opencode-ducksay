import type { PersonaName } from "./persona.ts"

/**
 * The duck, as four sprites per persona: nose left and nose right, each with a
 * closed and an open beak.
 *
 * Every sprite is three lines of exactly `DUCK_WIDTH` columns, padding
 * included: the lane limit is computed from that width, and the mirror below is
 * only defined between lines of equal length.
 *
 * The right sprite is the mirror of the left one, and the open right sprite is
 * the mirror of the open left one: every line reversed, with the glyphs that
 * have a mirrored twin swapped (`<`→`>`, `(`→`)`, `/`→`\`, `ó`→`ò`). A plain
 * reversal is not enough — `<` would end up at the right end still opening
 * rightwards, which is a duck with its head on the wrong side, and `ó` would
 * keep its accent pointing the wrong way. `test/duck.test.ts` checks both
 * relations instead of trusting them.
 *
 * The open pair differs from the closed one only in the middle line: the beak
 * opens towards the middle of the lane.
 *
 * The three personas share the top and bottom lines and differ only in the head
 * line, so switching personas cannot change the duck's outline or the lane.
 *
 * All of it stays data: mirroring happens when the art is edited, not at
 * runtime.
 */

const WIDTH = 8

export const DUCK_LEFT = ["  __    ", "<(o )___", " ( ._> /"] as const

export const DUCK_LEFT_OPEN = ["  __    ", ">(o )___", " ( ._> /"] as const

export const DUCK_RIGHT = ["    __  ", "___( o)>", "\\ <_. ) "] as const

export const DUCK_RIGHT_OPEN = ["    __  ", "___( o)<", "\\ <_. ) "] as const

export const ANGRY_LEFT = ["  __    ", "<(ó )___", " ( ._> /"] as const

export const ANGRY_LEFT_OPEN = ["  __    ", ">(ó )___", " ( ._> /"] as const

export const ANGRY_RIGHT = ["    __  ", "___( ò)>", "\\ <_. ) "] as const

export const ANGRY_RIGHT_OPEN = ["    __  ", "___( ò)<", "\\ <_. ) "] as const

export const ROBOT_LEFT = ["  __    ", "<[0 ]___", " ( ._> /"] as const

export const ROBOT_LEFT_OPEN = ["  __    ", ">[0 ]___", " ( ._> /"] as const

export const ROBOT_RIGHT = ["    __  ", "___[ 0]>", "\\ <_. ) "] as const

export const ROBOT_RIGHT_OPEN = ["    __  ", "___[ 0]<", "\\ <_. ) "] as const

/** The four sprites of one persona, in the shape the section draws. */
export interface PersonaSprites {
  readonly right: readonly string[]
  readonly left: readonly string[]
  readonly rightOpen: readonly string[]
  readonly leftOpen: readonly string[]
}

/** Every persona's four sprites, keyed by the persona name. */
export const PERSONA_SPRITES: Record<PersonaName, PersonaSprites> = {
  classic: { right: DUCK_RIGHT, left: DUCK_LEFT, rightOpen: DUCK_RIGHT_OPEN, leftOpen: DUCK_LEFT_OPEN },
  angry: { right: ANGRY_RIGHT, left: ANGRY_LEFT, rightOpen: ANGRY_RIGHT_OPEN, leftOpen: ANGRY_LEFT_OPEN },
  robot: { right: ROBOT_RIGHT, left: ROBOT_LEFT, rightOpen: ROBOT_RIGHT_OPEN, leftOpen: ROBOT_LEFT_OPEN },
}

/** The lane limit is measured against the widest sprite, so all four must match. */
export const DUCK_WIDTH = WIDTH
