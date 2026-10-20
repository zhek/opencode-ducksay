/**
 * The speech bubble the duck shows when it comes to rest.
 *
 * The bubble is a rounded frame 29 columns wide: a border, a 25-column text
 * field and a border. The text is wrapped by words into at most five lines and
 * clipped with an ellipsis when it does not fit, so the frame never grows past
 * the space reserved for it above the duck.
 *
 * Everything here stays data and pure functions, the way `lane.ts` and
 * `wave.ts` do: the section asks what a row looks like, and nothing here knows
 * about the duck, the renderer or Solid.
 */

/** The frame's full width, borders and padding included. */
export const BUBBLE_WIDTH = 29

/** The columns one wrapped line may occupy inside the frame. */
export const BUBBLE_TEXT_WIDTH = 25

/** The most text lines the bubble holds. */
export const BUBBLE_MAX_LINES = 5

/** Art lines the section draws under the bubble's reserved area. */
const ART_ROWS = 3

/** The lower water line, which the duck's bottom art line does not share. */
const WATER_ROWS = 1

/**
 * How many content rows the section draws: the reserved bubble area above the
 * duck, its three art lines and the lower water line.
 *
 * The upper water line shares a row with the duck's bottom art line, so it adds
 * no row. This count is fixed whatever the bubble shows, which is what keeps
 * the duck on the same rows when the bubble appears or goes away.
 */
export const BUBBLE_CONTENT_ROWS = BUBBLE_MAX_LINES + ART_ROWS + WATER_ROWS

const TOP = "╭" + "─".repeat(BUBBLE_WIDTH - 2) + "╮"
const BOTTOM = "╰" + "─".repeat(BUBBLE_WIDTH - 2) + "╯"

/** Which side of the duck the bubble sits on. */
export type BubbleSide = "left" | "right"

/**
 * Wraps the message into lines no wider than the text field.
 *
 * Words stay whole when they fit; a word longer than the field is cut into
 * chunks of the field's width, because there is no other way to show it. Only
 * the first `BUBBLE_MAX_LINES` lines survive, and the last one ends with an
 * ellipsis when the rest was dropped, so a clipped message reads as clipped
 * rather than complete.
 */
export function wrapBubbleText(text: string): string[] {
  const lines: string[] = []
  for (const word of words(text)) {
    for (const chunk of cut(word, BUBBLE_TEXT_WIDTH)) {
      const current = lines[lines.length - 1]
      if (current !== undefined && current.length + 1 + chunk.length <= BUBBLE_TEXT_WIDTH) {
        lines[lines.length - 1] = current + " " + chunk
      } else {
        lines.push(chunk)
      }
    }
  }
  if (lines.length === 0) return [""]
  if (lines.length <= BUBBLE_MAX_LINES) return lines
  const kept = lines.slice(0, BUBBLE_MAX_LINES)
  kept[kept.length - 1] = withEllipsis(kept[kept.length - 1]!)
  return kept
}

/** Splits on any run of whitespace, dropping empty words. */
function words(text: string): string[] {
  return text.split(/\s+/).filter((word) => word !== "")
}

/** Cuts a word into pieces no wider than `width`. */
function cut(word: string, width: number): string[] {
  if (word.length <= width) return [word]
  const pieces: string[] = []
  for (let at = 0; at < word.length; at += width) pieces.push(word.slice(at, at + width))
  return pieces
}

/** Replaces the tail of an overlong line with an ellipsis. */
function withEllipsis(line: string): string {
  return line.slice(0, BUBBLE_TEXT_WIDTH - 1) + "…"
}

/**
 * The bubble's rows, one entry per content row of the section.
 *
 * `undefined` means the row carries no bubble. Every defined entry is a segment
 * `BUBBLE_WIDTH` columns wide, positioned by the caller next to the duck. The
 * frame grows upwards from the duck: at full height the bottom border sits on
 * the beak row, and with a spare line or more the bottom border sits on the
 * head row while the tail points at the beak from the beak's own row.
 */
export function bubbleRows(lines: readonly string[], side: BubbleSide): (string | undefined)[] {
  const count = Math.min(Math.max(lines.length, 1), BUBBLE_MAX_LINES)
  const rows: (string | undefined)[] = new Array(BUBBLE_CONTENT_ROWS).fill(undefined)
  const text = (index: number) => textRow(lines[index] ?? "")
  if (count === BUBBLE_MAX_LINES) {
    rows[0] = TOP
    for (let index = 0; index < count; index++) rows[1 + index] = text(index)
    rows[count + 1] = BOTTOM
    return rows
  }
  const top = BUBBLE_MAX_LINES - 1 - count
  rows[top] = TOP
  for (let index = 0; index < count; index++) rows[top + 1 + index] = text(index)
  rows[BUBBLE_MAX_LINES] = BOTTOM
  rows[BUBBLE_MAX_LINES + 1] = tailRow(side)
  return rows
}

/** One text line of the frame, padded out to the field's width. */
function textRow(line: string): string {
  return "│ " + line.slice(0, BUBBLE_TEXT_WIDTH).padEnd(BUBBLE_TEXT_WIDTH, " ") + " │"
}

/**
 * The one-glyph row that points the bubble at the beak.
 *
 * The tail sits one column from the beak, on the side facing the duck: index 1
 * when the bubble is to the duck's right, and index `BUBBLE_WIDTH - 2` when it
 * is to the left.
 */
function tailRow(side: BubbleSide): string {
  if (side === "right") return " ╯" + " ".repeat(BUBBLE_WIDTH - 2)
  return " ".repeat(BUBBLE_WIDTH - 2) + "╰ "
}
