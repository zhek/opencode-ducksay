/**
 * How wide a character is on screen.
 *
 * The terminal spends two columns on an East Asian or emoji character and none
 * on a combining mark, so counting JavaScript characters is not counting the
 * columns the reader sees. Anything that lays text out on a fixed grid — the
 * bubble wrapping a joke, the PNG card drawing a row — has to count these
 * columns instead, or a single `鸭` shifts the frame by a column and the border
 * stops lining up.
 */

/** Code points that occupy two terminal columns. */
const WIDE: readonly (readonly [number, number])[] = [
  [0x1100, 0x115f], // Hangul Jamo initial forms
  [0x2e80, 0x303e], // CJK radicals, Kangxi, CJK punctuation
  [0x3041, 0x33ff], // Hiragana, Katakana, Bopomofo, Hangul compat, CJK symbols
  [0x3400, 0x4dbf], // CJK Unified Ideographs Extension A
  [0x4e00, 0x9fff], // CJK Unified Ideographs
  [0xa000, 0xa4cf], // Yi
  [0xa960, 0xa97f], // Hangul Jamo Extended-A
  [0xac00, 0xd7a3], // Hangul Syllables
  [0xf900, 0xfaff], // CJK Compatibility Ideographs
  [0xfe10, 0xfe19], // Vertical forms
  [0xfe30, 0xfe6f], // CJK Compatibility Forms, small form variants
  [0xff00, 0xff60], // Fullwidth forms
  [0xffe0, 0xffe6], // Fullwidth signs
  [0x1f300, 0x1f64f], // Symbols, pictographs and emoticons
  [0x1f900, 0x1f9ff], // Supplemental symbols and pictographs
  [0x20000, 0x2fffd], // CJK Extension B and friends
  [0x30000, 0x3fffd], // CJK Extension G and beyond
]

/** Code points that paint on the previous character and take no column. */
const ZERO_WIDTH: readonly (readonly [number, number])[] = [
  [0x0300, 0x036f], // Combining diacritical marks
  [0x1ab0, 0x1aff], // Combining marks extended
  [0x200b, 0x200f], // Zero-width space and the direction marks
  [0xfe00, 0xfe0f], // Variation selectors
]

/** Terminal columns one code point occupies: `2`, `1` or `0`. */
export function columnsOf(codePoint: number): number {
  if (codePoint < 0x20 || codePoint === 0x7f) return 0
  for (const [first, last] of WIDE) if (codePoint >= first && codePoint <= last) return 2
  for (const [first, last] of ZERO_WIDTH) if (codePoint >= first && codePoint <= last) return 0
  return 1
}

/** Columns a whole string occupies on screen. */
export function displayWidth(text: string): number {
  let columns = 0
  for (const character of text) columns += columnsOf(character.codePointAt(0) ?? 0)
  return columns
}

/**
 * The leading part of `text` that fits `width` columns.
 *
 * A character is never cut in half: when a two-column glyph would overflow by
 * one column, the slice stops before it, because half a `鸭` is not a character
 * the terminal can draw either.
 */
export function sliceToWidth(text: string, width: number): string {
  let out = ""
  let used = 0
  for (const character of text) {
    const span = columnsOf(character.codePointAt(0) ?? 0)
    if (used + span > width) break
    out += character
    used += span
  }
  return out
}

/** `text`, followed by spaces up to exactly `width` columns. */
export function padToWidth(text: string, width: number): string {
  const fitted = sliceToWidth(text, width)
  return fitted + " ".repeat(Math.max(0, width - displayWidth(fitted)))
}
