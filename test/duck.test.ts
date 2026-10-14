import { describe, expect, test } from "bun:test"
import { DUCK } from "../src/duck.ts"

/**
 * `SESSION_SIDEBAR_WIDTH` (42) minus `paddingLeft`/`paddingRight` (2 each) and
 * the container's inner `paddingRight` (1) for the scrollbar: the width the
 * sidebar's text actually gets. Changing the panel width in OpenCode should
 * make this fail loudly rather than silently truncate the art.
 */
const PANEL_CONTENT_WIDTH = 37

describe("DUCK", () => {
  test("is exactly three non-empty lines", () => {
    expect(DUCK).toHaveLength(3)
    for (const line of DUCK) expect(line.trim()).not.toBe("")
  })

  test("has no line wider than the panel content width", () => {
    for (const line of DUCK) expect(line.length).toBeLessThanOrEqual(PANEL_CONTENT_WIDTH)
  })

  test("keeps the leading spaces that position the duck's parts", () => {
    // The art is aligned internally: the body is the widest block at 8 columns,
    // and the head sits two columns right of it because of its own leading
    // spaces. Stripping them would shift the head left.
    const leading = DUCK.map((line) => line.length - line.trimStart().length)
    expect(leading).toEqual([2, 0, 1])
  })

  test("lines fit the 37-column canary the panel layout is built on", () => {
    // Guards the width constant itself: the panel is 42 columns, so anything
    // much narrower would mean OpenCode's sidebar changed shape.
    expect(Math.max(...DUCK.map((line) => line.length))).toBe(8)
    expect(PANEL_CONTENT_WIDTH).toBe(37)
  })
})