/**
 * The PNG card the `[img]` button saves.
 *
 * The picture is not a screen capture: it is the section's nine content rows,
 * drawn again with an antialiased cell font laid out at the demo GIF's sidebar
 * metrics — a 28 px face on a 38 px line, twice the GIF's 14 px on 19 px —
 * and painted one picture pixel per cell pixel, so the card is large without a
 * single enlarged block. The result is a self-contained PNG with a title of its
 * own. Keeping the work here — and not in `tui.tsx` — means the section only
 * hands over the rows and the lane width, and everything about
 * pixels, filenames and files stays testable without a renderer.
 */
import { deflateSync } from "node:zlib"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { CELL_HEIGHT, CELL_WIDTH, TITLE_WIDTH, cellAlpha, titleCellAlpha } from "./screenshot-font.ts"
import { columnsOf } from "./width.ts"

/** The title printed above the scene. */
export const SCREENSHOT_TITLE = "OpenCode Ducksay"

/** How many scene rows the card holds, the same nine the section draws. */
export const SCREENSHOT_ROWS = 9

/** The card's background: the sidebar panel's tone the demo GIF draws. */
export const SCREENSHOT_BACKGROUND = "#0a0d13"

/** The outline colour that separates the card from a dark page. */
export const SCREENSHOT_BORDER = "#30363d"

/** Ink used when the caller has no theme colour at hand. */
export const SCREENSHOT_INK = "#e6edf3"

/**
 * Space between the outline and the content, in picture pixels.
 *
 * The demo GIF insets the lane 14 px into the sidebar panel and the card is
 * that picture drawn at double the size, so the margin doubles with it.
 */
export const SCREENSHOT_PADDING = 28

/**
 * The card's outline, in picture pixels.
 *
 * The GIF draws the window and the hint pill with a one-pixel line; at the
 * card's double size the same weight is two pixels.
 */
export const SCREENSHOT_OUTLINE = 2

/** A colour the card can draw with; `RGBA` from OpenTUI satisfies it. */
export interface ScreenshotColor {
  toInts(): [number, number, number, number]
}

/** An RGBA bitmap, ready to be encoded or inspected by tests. */
export interface ScreenshotBitmap {
  readonly width: number
  readonly height: number
  /** `width * height * 4` bytes, RGBA, row-major. */
  readonly pixels: Uint8Array
}

export interface ScreenshotFrame {
  /** The nine content rows of the section, top to bottom. */
  readonly rows: readonly string[]
  /** The lane width in columns; anything past it is clipped, as in the TUI. */
  readonly width: number
  /** Colour of the text and the duck. */
  readonly primary: ScreenshotColor
}

/**
 * The file stem for a moment in local time: `ducksay-2026-11-05-14-30-15`.
 *
 * The extension and the collision suffix are `saveScreenshot`'s business, so
 * this stays a pure function of the clock.
 */
export function formatScreenshotStem(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0")
  const day = [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join("-")
  const time = [pad(date.getHours()), pad(date.getMinutes()), pad(date.getSeconds())].join("-")
  return `ducksay-${day}-${time}`
}

/** The card's pixels, without encoding them. */
export function renderScreenshotBitmap(frame: ScreenshotFrame): ScreenshotBitmap {
  const rowColumns = Math.max(1, Math.trunc(frame.width))
  // The heading is set in its own narrower cells, and a lane narrower than the
  // title would push the title into the padding, so the content area is at
  // least as wide as the words printed above the scene.
  const sceneWidth = rowColumns * CELL_WIDTH
  const titleWidth = Math.ceil(SCREENSHOT_TITLE.length * TITLE_WIDTH)
  const contentWidth = Math.max(sceneWidth, titleWidth)
  const ink = toRgba(frame.primary)
  const background = parseHex(SCREENSHOT_BACKGROUND)
  const border = parseHex(SCREENSHOT_BORDER)

  const width = SCREENSHOT_PADDING * 2 + contentWidth + SCREENSHOT_OUTLINE * 2
  const height = SCREENSHOT_PADDING * 2 + (SCREENSHOT_ROWS + 1) * CELL_HEIGHT + SCREENSHOT_OUTLINE * 2
  const pixels = new Uint8Array(width * height * 4)
  fill(pixels, width, height, background)

  // The outline sits on the outermost pixels; the padding keeps text away from
  // it, and the card still reads as a card on a white or dark page.
  drawRect(pixels, width, height, 0, 0, width, SCREENSHOT_OUTLINE, border)
  drawRect(pixels, width, height, 0, height - SCREENSHOT_OUTLINE, width, SCREENSHOT_OUTLINE, border)
  drawRect(pixels, width, height, 0, 0, SCREENSHOT_OUTLINE, height, border)
  drawRect(pixels, width, height, width - SCREENSHOT_OUTLINE, 0, SCREENSHOT_OUTLINE, height, border)

  const left = SCREENSHOT_OUTLINE + SCREENSHOT_PADDING
  const top = SCREENSHOT_OUTLINE + SCREENSHOT_PADDING
  drawLine(pixels, width, height, SCREENSHOT_TITLE, left, top, ink, TITLE_WIDTH, titleCell, Math.floor(contentWidth / TITLE_WIDTH))

  for (let row = 0; row < SCREENSHOT_ROWS; row++) {
    const y = top + (row + 1) * CELL_HEIGHT
    drawLine(pixels, width, height, frame.rows[row] ?? "", left, y, ink, CELL_WIDTH, glyph, rowColumns)
  }

  return { width, height, pixels }
}

/** The card as a PNG file, byte for byte. */
export function renderScreenshotPng(frame: ScreenshotFrame): Uint8Array {
  return encodePng(renderScreenshotBitmap(frame))
}

/**
 * Writes the card and returns its absolute path.
 *
 * The directory is created on demand, together with a `.gitignore` of its own
 * that keeps the folder's contents out of the reader's repository. A second
 * picture in the same second gets `-2`, `-3` and so on, so a fast double click
 * never overwrites the first file. The caller passes the project root; the
 * screenshot folder lives under `.opencode/ducksay/screenshots`, the project's
 * local OpenCode data.
 */
export function saveScreenshot(
  frame: ScreenshotFrame & { readonly directory: string; readonly now?: Date },
): string {
  const png = renderScreenshotPng(frame)
  const folder = join(frame.directory, ".opencode", "ducksay")
  const directory = join(folder, "screenshots")
  mkdirSync(directory, { recursive: true })
  hideFromGit(folder)

  const stem = formatScreenshotStem(frame.now ?? new Date())
  for (let attempt = 1; attempt <= 1000; attempt++) {
    const path = join(directory, attempt === 1 ? `${stem}.png` : `${stem}-${attempt}.png`)
    try {
      // `wx` is the atomic check: it fails instead of replacing a file that
      // appeared between the test and the write.
      writeFileSync(path, png, { flag: "wx" })
      return path
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
    }
  }
  throw new Error("the screenshot name space for this second is exhausted")
}

/** The line the screenshot folder writes into its own `.gitignore`. */
const GITIGNORE = "*"

/**
 * Keeps the folder's contents out of version control, the way the folder came
 * to exist in the first place: by itself, without the reader editing anything.
 *
 * `wx` is also the check for an existing file — the reader's own rules, or ours
 * from an earlier save, stay exactly as they are. When the file cannot be
 * written at all the picture still matters and this does not, so the failure is
 * dropped rather than reported: a project on read-only media should still be
 * able to save a duck.
 */
function hideFromGit(folder: string): void {
  try {
    writeFileSync(join(folder, ".gitignore"), `${GITIGNORE}\n`, { flag: "wx" })
  } catch {
    // Nothing to undo: the file simply is not there.
  }
}

/**
 * Copies a run of text into the picture, one character per terminal column span.
 *
 * `columns` is the width of the cells `cellOf` returns and the step between two
 * characters: the scene draws 17-column cells, the heading 13-column ones, both
 * 38 rows tall, because the GIF sets the section label smaller than its rows.
 * A character may span two of them — see `columnsOf` — and a row stops at the
 * lane edge, exactly where the terminal cuts it.
 */
function drawLine(
  pixels: Uint8Array,
  width: number,
  height: number,
  text: string,
  x: number,
  y: number,
  ink: readonly number[],
  columns: number,
  cellOf: (codePoint: number, span: number) => readonly number[],
  maxColumns: number,
): void {
  let column = 0
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0x20
    const span = columnsOf(codePoint)
    if (span === 0) continue
    if (column + span > maxColumns) break
    drawCell(pixels, width, height, cellOf(codePoint, span), columns * span, x + column * columns, y, ink)
    column += span
  }
}

/**
 * The scene cell for one code point, two cells wide when the character is, and
 * a hollow box for anything the font does not carry.
 *
 * The built-in face has no East Asian glyphs — a subset that covers them would
 * be megabytes, not a table this plugin ships as source — so `鸭` comes out as a
 * box standing in the two columns the terminal spends on it. The joke stays
 * where the reader saw it; only the letter is missing.
 */
function glyph(codePoint: number, span: number): readonly number[] {
  if (span > 1) return outlineBox(CELL_WIDTH * span)
  if (codePoint < 0x20 || codePoint === 0x7f) return SPACE
  const cell = cellAlpha(codePoint)
  if (cell === undefined) return MISSING
  return STRETCHED.includes(codePoint) ? stretchRule(cell) : cell
}

/** The heading cell: the bold weight of the same face, in narrower cells. */
function titleCell(codePoint: number, span: number): readonly number[] {
  return titleCellAlpha(codePoint) ?? outlineBox(TITLE_WIDTH * span)
}

/**
 * The frame glyphs whose vertical stroke does not reach the bottom of the cell.
 *
 * The GIF's line is taller than the font's own box-drawing stroke — five rows
 * of empty cell under every rule — and rows stack cell against cell, so the
 * bubble border would break at each join. A terminal stretches these glyphs to
 * the line, and the card does the same by repeating the stroke's last solid row
 * down to the edge.
 */
const STRETCHED: readonly number[] = [0x2502, 0x256d, 0x256e]

/** Coverage at which a row counts as part of a solid stroke, not an edge. */
const SOLID = 14

/** Repeats a cell's last solid row down to the bottom edge of the cell. */
function stretchRule(cell: readonly number[]): readonly number[] {
  const out = [...cell]
  let last = 0
  for (let row = 0; row < CELL_HEIGHT; row++) {
    let strongest = 0
    for (let column = 0; column < CELL_WIDTH; column++) {
      strongest = Math.max(strongest, out[row * CELL_WIDTH + column] ?? 0)
    }
    if (strongest >= SOLID) last = row
  }
  for (let row = last + 1; row < CELL_HEIGHT; row++) {
    for (let column = 0; column < CELL_WIDTH; column++) {
      out[row * CELL_WIDTH + column] = out[last * CELL_WIDTH + column] ?? 0
    }
  }
  return out
}

/**
 * Blends one cell into the picture at one image pixel per cell pixel, so the
 * strokes keep the smooth antialiased edges of the font instead of turning
 * into blocks.
 */
function drawCell(
  pixels: Uint8Array,
  width: number,
  height: number,
  cell: readonly number[],
  columns: number,
  x: number,
  y: number,
  ink: readonly number[],
): void {
  for (let row = 0; row < CELL_HEIGHT; row++) {
    for (let column = 0; column < columns; column++) {
      const coverage = cell[row * columns + column] ?? 0
      if (coverage === 0) continue
      blend(pixels, width, height, x + column, y + row, coverage, ink)
    }
  }
}

/** Mixes the ink into one pixel by its 0..15 coverage. */
function blend(
  pixels: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  coverage: number,
  ink: readonly number[],
): void {
  if (x < 0 || x >= width || y < 0 || y >= height) return
  const at = (y * width + x) * 4
  const alpha = coverage / 15
  pixels[at] = Math.round(pixels[at]! * (1 - alpha) + ink[0]! * alpha)
  pixels[at + 1] = Math.round(pixels[at + 1]! * (1 - alpha) + ink[1]! * alpha)
  pixels[at + 2] = Math.round(pixels[at + 2]! * (1 - alpha) + ink[2]! * alpha)
  pixels[at + 3] = 255
}

/** A run of rows by a run of columns; anything outside the picture is skipped. */
function drawRect(
  pixels: Uint8Array,
  width: number,
  height: number,
  left: number,
  top: number,
  columns: number,
  rows: number,
  color: readonly number[],
): void {
  for (let y = top; y < top + rows; y++) {
    if (y < 0 || y >= height) continue
    for (let x = left; x < left + columns; x++) {
      if (x < 0 || x >= width) continue
      const at = (y * width + x) * 4
      pixels[at] = color[0]!
      pixels[at + 1] = color[1]!
      pixels[at + 2] = color[2]!
      pixels[at + 3] = color[3]!
    }
  }
}

function fill(pixels: Uint8Array, width: number, height: number, color: readonly number[]): void {
  for (let at = 0; at < width * height * 4; at += 4) {
    pixels[at] = color[0]!
    pixels[at + 1] = color[1]!
    pixels[at + 2] = color[2]!
    pixels[at + 3] = color[3]!
  }
}

function toRgba(color: ScreenshotColor): readonly number[] {
  const [r, g, b, a] = color.toInts()
  return [r, g, b, a]
}

function parseHex(hex: string): readonly number[] {
  const value = Number.parseInt(hex.replace("#", ""), 16)
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff, 0xff]
}

/**
 * Encodes RGBA pixels as a PNG with every scanline unfiltered.
 *
 * The card is flat colour with antialiased glyphs and no filtering between
 * scanlines, which keeps the encoder short enough to read.
 */
export function encodePng(bitmap: ScreenshotBitmap): Uint8Array {
  const { width, height, pixels } = bitmap
  const stride = width * 4
  const raw = new Uint8Array((stride + 1) * height)
  for (let row = 0; row < height; row++) {
    raw[row * (stride + 1)] = 0
    raw.set(pixels.subarray(row * stride, (row + 1) * stride), row * (stride + 1) + 1)
  }

  const ihdr = new Uint8Array(13)
  writeUint32(ihdr, 0, width)
  writeUint32(ihdr, 4, height)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // truecolour with alpha
  ihdr[10] = 0 // deflate
  ihdr[11] = 0 // adaptive filtering
  ihdr[12] = 0 // no interlace

  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", new Uint8Array(0)),
  ]
  const total = parts.reduce((size, part) => size + part.length, 0)
  const png = new Uint8Array(total)
  let at = 0
  for (const part of parts) {
    png.set(part, at)
    at += part.length
  }
  return png
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  writeUint32(out, 0, data.length)
  for (let index = 0; index < 4; index++) out[4 + index] = type.charCodeAt(index)
  out.set(data, 8)
  writeUint32(out, 8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

function writeUint32(out: Uint8Array, at: number, value: number): void {
  out[at] = (value >>> 24) & 0xff
  out[at + 1] = (value >>> 16) & 0xff
  out[at + 2] = (value >>> 8) & 0xff
  out[at + 3] = value & 0xff
}

let crcTable: Uint32Array | undefined

function crc32(bytes: Uint8Array): number {
  const table = (crcTable ??= buildCrcTable())
  let crc = 0xffffffff
  for (const byte of bytes) crc = (crc >>> 8) ^ table[(crc ^ byte) & 0xff]!
  return (crc ^ 0xffffffff) >>> 0
}

function buildCrcTable(): Uint32Array {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index++) {
    let value = index
    for (let bit = 0; bit < 8; bit++) {
      value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[index] = value >>> 0
  }
  return table
}

/** A glyph with no ink, used for control characters. */
const SPACE: readonly number[] = new Array(CELL_WIDTH * CELL_HEIGHT).fill(0)

/**
 * A hollow box for a character the card cannot draw.
 *
 * A visible placeholder is better than silence: the reader can see that
 * something was there, and no code path has to throw over an odd character.
 * The box sits in the middle of the cell and is drawn as an outline, so it
 * reads as a missing glyph instead of a filled block.
 */
function outlineBox(columns: number): readonly number[] {
  const built = BOXES.get(columns)
  if (built !== undefined) return built
  const cell = Array.from({ length: columns * CELL_HEIGHT }, (_, at) => {
    const row = Math.floor(at / columns)
    const column = at % columns
    const inBox = row >= 4 && row <= CELL_HEIGHT - 6 && column >= 3 && column <= columns - 4
    if (!inBox) return 0
    const edge = row === 4 || row === CELL_HEIGHT - 6 || column === 3 || column === columns - 4
    return edge ? 15 : 0
  })
  BOXES.set(columns, cell)
  return cell
}

/** One box per cell width, built on demand and never redrawn. */
const BOXES = new Map<number, readonly number[]>()

/** The placeholder for a scene cell the font has no glyph for. */
const MISSING: readonly number[] = outlineBox(CELL_WIDTH)
