import { describe, expect, test } from "bun:test"
import {
  BUBBLE_CONTENT_ROWS,
  BUBBLE_MAX_LINES,
  BUBBLE_TEXT_WIDTH,
  BUBBLE_WIDTH,
  bubbleRows,
  wrapBubbleText,
} from "../src/bubble.ts"

/** A message of `count` lines, one per element. */
const message = (count: number) => Array.from({ length: count }, (_, index) => `line ${index + 1}`)

describe("wrapBubbleText", () => {
  test("keeps a short message on one line", () => {
    expect(wrapBubbleText("Quack-quack!")).toEqual(["Quack-quack!"])
  })

  test("collapses runs of whitespace", () => {
    expect(wrapBubbleText("  quack   quack  ")).toEqual(["quack quack"])
  })

  test("an empty message is one empty line", () => {
    // The frame always has at least one text row, so the caller never has to
    // reason about a zero-line bubble.
    expect(wrapBubbleText("   ")).toEqual([""])
  })

  test("moves a word to the next line instead of splitting it", () => {
    // The fifth word still fits (24 columns); the sixth does not, and a split
    // would leave "fff" and "f" behind.
    expect(wrapBubbleText("aaaa bbbb cccc dddd eeee ffff")).toEqual(["aaaa bbbb cccc dddd eeee", "ffff"])
  })

  test("breaks a word longer than the field into 25-column pieces", () => {
    expect(wrapBubbleText("a".repeat(60))).toEqual(["a".repeat(25), "a".repeat(25), "a".repeat(10)])
  })

  test("leaves a word exactly as wide as the field whole", () => {
    expect(wrapBubbleText("a".repeat(BUBBLE_TEXT_WIDTH))).toEqual(["a".repeat(BUBBLE_TEXT_WIDTH)])
  })

  test("caps the text at five lines and marks the cut", () => {
    const lines = wrapBubbleText(Array.from({ length: 30 }, () => "quack").join(" "))
    expect(lines).toHaveLength(BUBBLE_MAX_LINES)
    expect(lines[lines.length - 1]!.endsWith("…")).toBe(true)
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(BUBBLE_TEXT_WIDTH)
  })

  test("does not mark text that fits exactly five lines", () => {
    const lines = wrapBubbleText(Array.from({ length: BUBBLE_MAX_LINES }, () => "a".repeat(25)).join(" "))
    expect(lines).toEqual(Array.from({ length: BUBBLE_MAX_LINES }, () => "a".repeat(25)))
    expect(lines.some((line) => line.includes("…"))).toBe(false)
  })

  test("never returns a line wider than the field, whatever the words", () => {
    for (const word of ["short", "x".repeat(25), "y".repeat(26), "z".repeat(80)]) {
      const lines = wrapBubbleText(`${word} ${word} ${word}`)
      for (const line of lines) expect(line.length).toBeLessThanOrEqual(BUBBLE_TEXT_WIDTH)
    }
  })
})

describe("bubbleRows", () => {
  test("always returns the section's fixed number of content rows", () => {
    for (let count = 0; count <= BUBBLE_MAX_LINES + 2; count++) {
      expect(bubbleRows(message(count), "left")).toHaveLength(BUBBLE_CONTENT_ROWS)
    }
  })

  test("keeps every frame row exactly as wide as the bubble", () => {
    for (let count = 1; count <= BUBBLE_MAX_LINES; count++) {
      for (const row of bubbleRows(message(count), "left")) {
        if (row !== undefined) expect(row).toHaveLength(BUBBLE_WIDTH)
      }
    }
  })

  test("grows the frame upwards from the duck", () => {
    // Fewer text lines leaves more empty rows above, so the frame's top edge
    // moves down towards the duck.
    const expected = [3, 2, 1, 0, 0]
    for (let count = 1; count <= BUBBLE_MAX_LINES; count++) {
      const rows = bubbleRows(message(count), "left")
      expect(rows.findIndex((row) => row?.startsWith("╭"))).toBe(expected[count - 1])
    }
  })

  test("puts the bottom border on the head row, or the beak row at full height", () => {
    for (let count = 1; count <= BUBBLE_MAX_LINES; count++) {
      const rows = bubbleRows(message(count), "left")
      const bottom = rows.findIndex((row) => row?.startsWith("╰"))
      expect(bottom).toBe(count === BUBBLE_MAX_LINES ? BUBBLE_MAX_LINES + 1 : BUBBLE_MAX_LINES)
    }
  })

  test("draws a tail only while there is a spare row", () => {
    const lastRow = (count: number, side: "left" | "right") =>
      bubbleRows(message(count), side)[BUBBLE_MAX_LINES + 1]!
    for (const side of ["left", "right"] as const) {
      for (let count = 1; count < BUBBLE_MAX_LINES; count++) {
        // The tail row carries one glyph and no border line.
        expect(lastRow(count, side)).not.toContain("─")
        expect(lastRow(count, side).trim()).toHaveLength(1)
      }
      // At full height the bottom border takes the row, so there is no tail.
      expect(lastRow(BUBBLE_MAX_LINES, side)).toContain("─")
    }
  })

  test("holds the text in a 25-column field, left aligned and space padded", () => {
    const rows = bubbleRows(["quack"], "left")
    const line = rows.find((row) => row?.includes("quack"))!
    expect(line).toBe("│ quack" + " ".repeat(BUBBLE_TEXT_WIDTH - 5) + " │")
  })

  test("turns the tail around at the right edge, one column off the frame", () => {
    const tail = BUBBLE_MAX_LINES + 1
    const atLeftEdge = bubbleRows(message(3), "left")[tail]!
    const atRightEdge = bubbleRows(message(3), "right")[tail]!
    expect(atLeftEdge.indexOf("╰")).toBe(BUBBLE_WIDTH - 2)
    expect(atLeftEdge[BUBBLE_WIDTH - 1]).toBe(" ")
    expect(atRightEdge.indexOf("╯")).toBe(1)
    expect(atRightEdge[0]).toBe(" ")
  })
})
