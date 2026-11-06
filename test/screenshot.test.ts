import { describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { inflateSync } from "node:zlib"
import { CELL_HEIGHT, CELL_WIDTH, TITLE_WIDTH, cellAlpha, titleCellAlpha } from "../src/screenshot-font.ts"
import {
  SCREENSHOT_BACKGROUND,
  SCREENSHOT_BORDER,
  SCREENSHOT_ROWS,
  SCREENSHOT_TITLE,
  formatScreenshotStem,
  renderScreenshotBitmap,
  renderScreenshotPng,
  saveScreenshot,
  type ScreenshotBitmap,
  type ScreenshotColor,
} from "../src/screenshot.ts"

const INK: ScreenshotColor = { toInts: () => [230, 237, 243, 255] }

function primary(): ScreenshotColor {
  return INK
}

function frame(rows: readonly string[], width = 20) {
  return { rows, width, primary: primary() }
}

function blankRows(): string[] {
  return new Array(SCREENSHOT_ROWS).fill("")
}

function rgb(bitmap: ScreenshotBitmap, x: number, y: number): readonly number[] {
  const at = (y * bitmap.width + x) * 4
  return [bitmap.pixels[at]!, bitmap.pixels[at + 1]!, bitmap.pixels[at + 2]!, bitmap.pixels[at + 3]!]
}

function hex(bitmap: ScreenshotBitmap, x: number, y: number): string {
  const [r, g, b] = rgb(bitmap, x, y)
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`
}

function isInk(bitmap: ScreenshotBitmap, x: number, y: number): boolean {
  const [r, g, b] = rgb(bitmap, x, y)
  return r > 0x40 || g > 0x40 || b > 0x40
}

/** The content area starts two pixels of outline and 28 pixels of padding in. */
function contentLeft(): number {
  return 2 + 28
}

function contentTop(): number {
  return 2 + 28
}

/** The ink bounding box of a cell: the rows and columns it actually paints. */
function box(cell: readonly number[], columns: number): { rows: number; columns: number; ink: number } {
  let top = CELL_HEIGHT
  let bottom = 0
  let left = columns
  let right = 0
  let ink = 0
  for (let row = 0; row < CELL_HEIGHT; row++) {
    for (let column = 0; column < columns; column++) {
      if ((cell[row * columns + column] ?? 0) <= 0) continue
      ink += 1
      top = Math.min(top, row)
      bottom = Math.max(bottom, row)
      left = Math.min(left, column)
      right = Math.max(right, column)
    }
  }
  return { rows: bottom - top + 1, columns: right - left + 1, ink }
}

// The card's grid in picture pixels: the demo GIF's sidebar geometry — a 14 px
// face on a 19 px line — drawn twice as large, one picture pixel per cell pixel.
const CELL = 17
const ROW = 38
// The heading's own cells: the GIF sets the section label at 11 px, so the card
// prints its title in narrower, smaller cells than the scene.
const HEADING = 13

interface Decoded {
  width: number
  height: number
  pixels: Uint8Array
  chunks: string[]
}

/** Minimal PNG reader for the only dialect this card writes: RGBA, filter 0. */
function decodePng(bytes: Uint8Array): Decoded {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  expect([...bytes.subarray(0, 8)]).toEqual(signature)

  const chunks: string[] = []
  const idat: Uint8Array[] = []
  let width = 0
  let height = 0
  let at = 8
  while (at < bytes.length) {
    const length = readUint32(bytes, at)
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8))
    const data = bytes.subarray(at + 8, at + 8 + length)
    chunks.push(type)
    if (type === "IHDR") {
      width = readUint32(data, 0)
      height = readUint32(data, 4)
      expect(data[8]).toBe(8)
      expect(data[9]).toBe(6)
    } else if (type === "IDAT") {
      idat.push(data)
    }
    at += 12 + length
    if (type === "IEND") break
  }

  const raw = inflateSync(Buffer.concat(idat.map((part) => Buffer.from(part))))
  const stride = width * 4
  const pixels = new Uint8Array(stride * height)
  for (let row = 0; row < height; row++) {
    const filter = raw[row * (stride + 1)]
    expect(filter).toBe(0)
    pixels.set(raw.subarray(row * (stride + 1) + 1, (row + 1) * (stride + 1)), row * stride)
  }
  return { width, height, pixels, chunks }
}

function readUint32(bytes: Uint8Array, at: number): number {
  return ((bytes[at]! << 24) | (bytes[at + 1]! << 16) | (bytes[at + 2]! << 8) | bytes[at + 3]!) >>> 0
}

describe("screenshot filename", () => {
  test("formats local date and time with hyphens", () => {
    expect(formatScreenshotStem(new Date(2026, 10, 5, 14, 30, 15))).toBe("ducksay-2026-11-05-14-30-15")
    expect(formatScreenshotStem(new Date(2026, 0, 9, 4, 5, 6))).toBe("ducksay-2026-01-09-04-05-06")
  })
})

describe("the screenshot card", () => {
  test("fills the background, draws the outline and keeps the padding", () => {
    const bitmap = renderScreenshotBitmap(frame(blankRows()))

    expect(bitmap.width).toBe(20 * CELL + 4 + 56)
    expect(bitmap.height).toBe((SCREENSHOT_ROWS + 1) * ROW + 4 + 56)
    expect(hex(bitmap, 0, 0)).toBe(SCREENSHOT_BORDER)
    expect(hex(bitmap, bitmap.width - 1, bitmap.height - 1)).toBe(SCREENSHOT_BORDER)
    // The outline is one terminal pixel thick, two picture pixels at this
    // density: what lies just inside it is the theme background.
    expect(hex(bitmap, 1, 1)).toBe(SCREENSHOT_BORDER)
    expect(hex(bitmap, 2, 2)).toBe(SCREENSHOT_BACKGROUND)
    expect(hex(bitmap, 2, 0)).toBe(SCREENSHOT_BORDER)
    expect(hex(bitmap, 0, 2)).toBe(SCREENSHOT_BORDER)
    // And the margin is the GIF's lane inset, doubled, so nothing touches it.
    expect(hex(bitmap, contentLeft() - 1, contentTop())).toBe(SCREENSHOT_BACKGROUND)
  })

  test("prints its own title and leaves the rest of the heading band empty", () => {
    expect(SCREENSHOT_TITLE).toBe("OpenCode Ducksay")
    const bitmap = renderScreenshotBitmap(frame(blankRows()))

    let lastInk = -1
    for (let y = contentTop(); y < contentTop() + ROW; y++) {
      for (let x = contentLeft(); x < bitmap.width - 1; x++) {
        if (isInk(bitmap, x, y)) lastInk = Math.max(lastInk, x - contentLeft())
      }
    }
    expect(lastInk).toBeGreaterThan(0)
    // Sixteen heading cells of title, in the heading's own narrower advance,
    // with no `[img]` or `[copy]` pushed in after it.
    expect(lastInk).toBeLessThan(SCREENSHOT_TITLE.length * HEADING)

    for (let row = 0; row < SCREENSHOT_ROWS; row++) {
      const top = contentTop() + (row + 1) * ROW
      for (let y = top; y < top + ROW; y++) {
        for (let x = contentLeft(); x < bitmap.width - 1; x++) {
          expect(isInk(bitmap, x, y), `blank row ${row} has ink at ${x},${y}`).toBe(false)
        }
      }
    }
  })

  test("sets the heading smaller and heavier than the scene, as the GIF does", () => {
    const O = 0x4f
    const heading = box(titleCellAlpha(O)!, TITLE_WIDTH)
    const scene = box(cellAlpha(O)!, CELL_WIDTH)

    // The GIF prints the section label at 11 px and the rows at 14 px, both in
    // the middle of the line. The card copies that: a shorter, narrower glyph
    // that nevertheless paints more ink per cell it covers — the bold weight,
    // not the regular one shrunk or smeared.
    expect(TITLE_WIDTH).toBe(HEADING)
    expect(heading.rows).toBeLessThan(scene.rows)
    expect(heading.columns).toBeLessThan(scene.columns)
    expect(heading.ink / (heading.rows * heading.columns)).toBeGreaterThan(
      scene.ink / (scene.rows * scene.columns),
    )
  })

  test("draws ink for every visible character, cyrillic and symbols included", () => {
    const sample = "abXYZ 019 Привет јљњћЏ ёЁ ╭─╮│╰╯ … ⸮  ✓ ^_()oO\\U"
    const rows = [sample, ...blankRows().slice(1)]
    const bitmap = renderScreenshotBitmap(frame(rows, sample.length))

    for (let row = 0; row < SCREENSHOT_ROWS; row++) {
      const text = row === 0 ? sample : ""
      for (const [column, character] of [...text].entries()) {
        if (character === " ") continue
        const left = contentLeft() + column * CELL
        const top = contentTop() + (row + 1) * ROW
        let lit = false
        for (let y = top; y < top + ROW && !lit; y++) {
          for (let x = left; x < left + CELL; x++) {
            if (isInk(bitmap, x, y)) {
              lit = true
              break
            }
          }
        }
        expect(lit, `no ink for ${JSON.stringify(character)} at column ${column}`).toBe(true)
      }
    }
  })

  test("covers every mark the plugin can put in a scene row", () => {
    // The card draws what the section draws, so the font must carry every
    // special character the plugin owns. A gap here is invisible in a rendered
    // joke and shows up as a placeholder box in a saved picture.
    const marks = "јљњћЋђѓќѕџіїєґҐ╭╮╯╰─│…⸮✓—–«»„“”’^_()<>\\/~oOU"
    for (const character of marks) {
      expect(cellAlpha(character.codePointAt(0)!), `the font has no cell for ${character}`).toBeDefined()
    }
  })

  test("gives a wide character the two columns the terminal gives it", () => {
    const bitmap = renderScreenshotBitmap(frame(["鸭x"], 6))
    const top = contentTop() + ROW
    const inkIn = (cell: number) => {
      let lit = 0
      const from = contentLeft() + cell * CELL
      for (let y = top; y < top + ROW; y++) {
        for (let x = from; x < from + CELL; x++) if (isInk(bitmap, x, y)) lit++
      }
      return lit
    }

    // One box, two cells: the placeholder spans the pair the glyph occupies, so
    // the `x` that follows lands in the third cell and not the second.
    expect(inkIn(0)).toBeGreaterThan(0)
    expect(inkIn(1)).toBeGreaterThan(0)
    expect(inkIn(2)).toBeGreaterThan(0)
    expect(inkIn(3)).toBe(0)
  })

  test("counts a wide character twice when it clips a row at the lane edge", () => {
    const bitmap = renderScreenshotBitmap(frame(["鸭鸭鸭鸭鸭鸭"], 5))
    const top = contentTop() + ROW
    const inkIn = (cell: number) => {
      let lit = 0
      const from = contentLeft() + cell * CELL
      for (let y = top; y < top + ROW; y++) {
        for (let x = from; x < from + CELL; x++) if (isInk(bitmap, x, y)) lit++
      }
      return lit
    }

    // A five-column lane holds two whole glyphs — four columns — and the third
    // one starts past the edge, so the fifth cell stays empty. Counting
    // characters would have squeezed five boxes into those five columns.
    for (const cell of [0, 1, 2, 3]) expect(inkIn(cell), `cell ${cell} of a wide run`).toBeGreaterThan(0)
    expect(inkIn(4)).toBe(0)
  })

  test("lets a combining mark share the column of the character it hangs on", () => {
    const bitmap = renderScreenshotBitmap(frame(["e\u0301x"], 4))
    const top = contentTop() + ROW
    const inkIn = (cell: number) => {
      let lit = 0
      const from = contentLeft() + cell * CELL
      for (let y = top; y < top + ROW; y++) {
        for (let x = from; x < from + CELL; x++) if (isInk(bitmap, x, y)) lit++
      }
      return lit
    }

    // `e` plus a combining acute (U+0301) is still one column, so `x` keeps the
    // second cell instead of sliding one to the right.
    expect(inkIn(0)).toBeGreaterThan(0)
    expect(inkIn(1)).toBeGreaterThan(0)
    expect(inkIn(2)).toBe(0)
  })

  test("keeps the duck's underline attached to its brackets", () => {
    function firstInkRow(codePoint: number): number {
      const cell = cellAlpha(codePoint)!
      for (let row = 0; row < CELL_HEIGHT; row++) {
        for (let column = 0; column < CELL_WIDTH; column++) if ((cell[row * CELL_WIDTH + column] ?? 0) > 2) return row
      }
      return CELL_HEIGHT
    }
    function lastInkRow(codePoint: number): number {
      const cell = cellAlpha(codePoint)!
      for (let row = CELL_HEIGHT - 1; row >= 0; row--) {
        for (let column = 0; column < CELL_WIDTH; column++) if ((cell[row * CELL_WIDTH + column] ?? 0) > 2) return row
      }
      return 0
    }

    // `<(o )___` is one figure only while the underscore sits on the row right
    // under the brackets. The font drops it a row lower at this size, which
    // reads as a letter with a separate underline, so the cell lifts it up.
    expect(firstInkRow(0x5f)).toBe(lastInkRow(0x28) + 1)
    expect(firstInkRow(0x5f)).toBe(lastInkRow(0x29) + 1)
  })

  test("falls back to a visible box for a character the font lacks", () => {
    const bitmap = renderScreenshotBitmap(frame(["一"], 4))
    const top = contentTop() + ROW
    let lit = 0
    for (let y = top; y < top + ROW; y++) {
      for (let x = contentLeft(); x < contentLeft() + CELL; x++) if (isInk(bitmap, x, y)) lit++
    }
    expect(lit).toBeGreaterThan(0)
    // An outline, not a filled block: the middle of the cell stays the card's
    // background colour.
    expect(isInk(bitmap, contentLeft() + 8, top + 19)).toBe(false)
  })

  test("clips a row to the lane width", () => {
    const bitmap = renderScreenshotBitmap(frame(["#".repeat(40)], 10))
    const top = contentTop() + ROW
    for (let y = top; y < top + ROW; y++) {
      for (let x = contentLeft() + 10 * CELL; x < bitmap.width - 1; x++) {
        expect(isInk(bitmap, x, y)).toBe(false)
      }
    }
  })

  test("keeps the bubble frame continuous between rows", () => {
    const rows = ["", "", "╭───╮", "│ a │", "│   │", "╰───╯", "", "", ""]
    const bitmap = renderScreenshotBitmap(frame(rows, 10))

    // The vertical stroke must run from where the top corner has turned down
    // into the rule to where the bottom corner turns back, without a single
    // missing pixel row, or the border reads as a dashed line.
    const x = contentLeft() + 8
    const top = contentTop() + 3 * ROW + 19
    const bottom = contentTop() + 6 * ROW + 12
    const shades: number[] = []
    for (let y = top; y <= bottom; y++) {
      expect(isInk(bitmap, x, y), `gap in the bubble frame at y=${y}`).toBe(true)
      shades.push(rgb(bitmap, x, y)[0]!)
    }

    // Lit is not enough: the font's own rule starts a couple of picture rows
    // below the top of the cell, and the faint rows read as a notch at every
    // join even though they are technically ink. Every row of the stroke is as
    // bright as the brightest one, give or take an antialiasing step.
    const solid = Math.max(...shades)
    for (const [index, shade] of shades.entries()) {
      expect(shade, `the bubble frame dims at y=${top + index}`).toBeGreaterThanOrEqual(solid - 20)
    }
  })

  test("draws the scene from a 17x38 cell at one pixel per cell pixel", () => {
    expect(CELL_WIDTH).toBe(CELL)
    expect(CELL_HEIGHT).toBe(ROW)

    const bitmap = renderScreenshotBitmap(frame(["│"], 4))
    const top = contentTop() + ROW
    const x = contentLeft() + 8
    // The vertical stroke is the two cell columns it rasterizes to, and each of
    // them is one picture pixel wide: no block of four stands in for one.
    expect(isInk(bitmap, x, top + 5)).toBe(true)
    expect(isInk(bitmap, x + 1, top + 5)).toBe(true)
    expect(isInk(bitmap, x + 2, top + 5)).toBe(false)
    // Rows stack without a gap: the cell's own first row is ink.
    expect(isInk(bitmap, x, top)).toBe(true)
    expect(isInk(bitmap, x, top - 1)).toBe(false)
  })

  test("sizes the card for a 37-column lane at 689 by 440 pixels", () => {
    const bitmap = renderScreenshotBitmap(frame(blankRows(), 37))
    expect(bitmap.width).toBe(689)
    expect(bitmap.height).toBe(440)
  })
})

describe("the screenshot folder", () => {
  /** A project in a temporary directory, removed again after the test. */
  function inProject(body: (directory: string) => void): void {
    const directory = mkdtempSync(join(tmpdir(), "ducksay-ignore-"))
    try {
      body(directory)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  }

  test("ships a .gitignore of its own when the first picture is saved", () => {
    inProject((directory) => {
      saveScreenshot({ ...frame(["quack"]), directory })

      const ignore = join(directory, ".opencode", "ducksay", ".gitignore")
      expect(existsSync(ignore), "the folder the plugin creates must hide itself from git").toBe(true)
      expect(readFileSync(ignore, "utf8")).toBe("*\n")
    })
  })

  test("writes it once and never touches it again", () => {
    inProject((directory) => {
      const ignore = join(directory, ".opencode", "ducksay", ".gitignore")
      saveScreenshot({ ...frame(["quack"]), directory })
      writeFileSync(ignore, "*\n# kept by hand\n")
      saveScreenshot({ ...frame(["quack"]), directory })

      expect(readFileSync(ignore, "utf8")).toBe("*\n# kept by hand\n")
    })
  })

  test("leaves a .gitignore the reader wrote alone", () => {
    inProject((directory) => {
      const folder = join(directory, ".opencode", "ducksay")
      mkdirSync(folder, { recursive: true })
      writeFileSync(join(folder, ".gitignore"), "!screenshots/keep-me.png\n")

      const saved = saveScreenshot({ ...frame(["quack"]), directory })

      expect(readFileSync(join(folder, ".gitignore"), "utf8")).toBe("!screenshots/keep-me.png\n")
      expect(existsSync(saved)).toBe(true)
    })
  })

  test("still saves the picture when the ignore file cannot be written", () => {
    inProject((directory) => {
      // A directory standing where the file belongs: writing it is impossible,
      // but that is no reason to refuse the picture the reader asked for.
      mkdirSync(join(directory, ".opencode", "ducksay", ".gitignore"), { recursive: true })

      const saved = saveScreenshot({ ...frame(["quack"]), directory })

      expect(existsSync(saved)).toBe(true)
      expect([...readFileSync(saved).subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
    })
  })
})

describe("the PNG", () => {
  test("encodes a readable RGBA image that matches the bitmap", () => {
    const bitmap = renderScreenshotBitmap(frame(["╭─╮", "│x│", "╰─╯"], 12))
    const decoded = decodePng(renderScreenshotPng(frame(["╭─╮", "│x│", "╰─╯"], 12)))

    expect(decoded.chunks).toEqual(["IHDR", "IDAT", "IEND"])
    expect(decoded.width).toBe(bitmap.width)
    expect(decoded.height).toBe(bitmap.height)
    expect([...decoded.pixels.subarray(0, 400)]).toEqual([...bitmap.pixels.subarray(0, 400)])
  })
})

describe("saving a screenshot", () => {
  test("creates the project folder and adds -2 when the same second repeats", () => {
    const project = mkdtempSync(join(tmpdir(), "ducksay-shot-"))
    const now = new Date(2026, 10, 5, 14, 30, 15)
    try {
      const first = saveScreenshot({ ...frame(["hello"], 20), directory: project, now })
      const second = saveScreenshot({ ...frame(["hello"], 20), directory: project, now })

      expect(first).toBe(join(project, ".opencode", "ducksay", "screenshots", "ducksay-2026-11-05-14-30-15.png"))
      expect(second).toBe(join(project, ".opencode", "ducksay", "screenshots", "ducksay-2026-11-05-14-30-15-2.png"))

      const saved = readFileSync(first)
      expect([...saved.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
      expect(readFileSync(second).length).toBeGreaterThan(0)
    } finally {
      rmSync(project, { recursive: true, force: true })
    }
  })
})
