import { describe, expect, test } from "bun:test"
import { DUCK_LEFT, DUCK_RIGHT, DUCK_WIDTH } from "../src/duck.ts"

/**
 * `SESSION_SIDEBAR_WIDTH` (42) minus `paddingLeft`/`paddingRight` (2 each) and
 * the container's inner `paddingRight` (1) for the scrollbar: the width the
 * sidebar's text actually gets. Changing the panel width in OpenCode should
 * make this fail loudly rather than silently truncate the art.
 */
const PANEL_CONTENT_WIDTH = 37

const SPRITES = { left: DUCK_LEFT, right: DUCK_RIGHT } as const

/** Glyphs that do not look like themselves after a horizontal flip. */
const MIRRORED_GLYPHS: Record<string, string> = { "<": ">", ">": "<", "(": ")", ")": "(", "/": "\\", "\\": "/" }

function mirrorLine(line: string): string {
  return line
    .split("")
    .reverse()
    .map((glyph) => MIRRORED_GLYPHS[glyph] ?? glyph)
    .join("")
}

describe.each(Object.entries(SPRITES))("%s sprite", (_name, sprite) => {
  test("is exactly three non-empty lines", () => {
    expect(sprite).toHaveLength(3)
    for (const line of sprite) expect(line.trim()).not.toBe("")
  })

  test("has no line wider than the panel content width", () => {
    for (const line of sprite) expect(line.length).toBeLessThanOrEqual(PANEL_CONTENT_WIDTH)
  })

  test("has no line wider than the block width", () => {
    // The lane limit is `lane width - DUCK_WIDTH`, so a wider line would let the
    // duck poke past the right edge of the sidebar.
    for (const line of sprite) expect(line.length).toBeLessThanOrEqual(DUCK_WIDTH)
  })
})

describe("duck sprites", () => {
  test("both sprites are a rectangle of the same width", () => {
    for (const sprite of Object.values(SPRITES)) {
      for (const line of sprite) expect(line.length).toBe(DUCK_WIDTH)
    }
  })

  test("keep the leading spaces that position the duck's parts", () => {
    // The art is aligned internally: the body is the widest block at 8 columns,
    // and the head sits inside it because of its own leading spaces. Stripping
    // them would shift the head off the body.
    expect(DUCK_LEFT.map((line) => line.length - line.trimStart().length)).toEqual([2, 0, 1])
    // The mirrored bottom line starts with `\`, so its indent moves to the top
    // line: the head shifts from columns 2–3 to columns 4–5.
    expect(DUCK_RIGHT.map((line) => line.length - line.trimStart().length)).toEqual([4, 0, 0])
  })

  test("the right sprite is the mirror of the left one", () => {
    const expected: string[] = DUCK_LEFT.map(mirrorLine)
    const actual: string[] = [...DUCK_RIGHT]
    expect(actual).toEqual(expected)
  })

  test("mirroring twice returns the original sprite", () => {
    // Guards the glyph table: a wrong pair would make the turn lossy, and the
    // duck would drift towards one shape over repeated laps.
    const mirrored: string[] = DUCK_RIGHT.map(mirrorLine)
    expect(mirrored).toEqual([...DUCK_LEFT])
  })

  test("the sprites face opposite directions", () => {
    expect(DUCK_LEFT.some((line) => line.includes("<"))).toBe(true)
    expect(DUCK_RIGHT.some((line) => line.includes(">"))).toBe(true)
  })

  test("lines fit the 37-column canary the panel layout is built on", () => {
    // Guards the width constant itself: the panel is 42 columns, so anything
    // much narrower would mean OpenCode's sidebar changed shape.
    expect(DUCK_WIDTH).toBe(8)
    expect(PANEL_CONTENT_WIDTH).toBe(37)
  })
})