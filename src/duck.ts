/**
 * The duck, as three lines of ASCII art.
 *
 * The art is internally aligned — line widths are 4, 8 and 8 — so the leading
 * spaces carry the position of the duck's parts. Never strip them, never center
 * the block: the section renders left-aligned with no added indent.
 */
export const DUCK = ["  __", "<(o )___", " ( ._> /"] as const