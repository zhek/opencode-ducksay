/**
 * Generates the README demo GIFs: a "Hello!" turn in which the duck swims while
 * the answer is produced, docks at the right edge and comments on the greeting,
 * then a `/duck` dialogue about why the duck crossed the road.
 *
 * The session content is localized for every README: English goes to
 * `assets/ducksay-demo.gif`, Russian to `assets/ducksay-demo.ru.gif`. The TUI
 * chrome stays English because that is what OpenCode itself renders.
 *
 * This is a dev-only tool, not part of the plugin and not shipped. Its
 * dependencies are devDependencies, so after the usual install:
 *
 *   bun install
 *   bun run demo:gif        # both locales
 *   bun run demo:gif ru     # one locale
 *
 * The pure frame logic is in `demo-layout.ts` and is covered by
 * `test/demo-gif.test.ts`.
 *
 * The cow easter egg is deliberately absent: there is no cow drawing code, and
 * the duck only swims right and docks at the right edge, so the leftward
 * midline crossing that triggers the cow never happens.
 */
import { existsSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { createCanvas, GlobalFonts } from "@napi-rs/canvas"
import { GIFEncoder, quantize, applyPalette } from "gifenc"
import {
  COMMAND_MENU_START,
  COMMAND_SEND_START,
  COPY_ICON,
  IMG_ICON,
  LANE_COLS,
  LANE_INSET,
  LOCALES,
  SCENARIOS,
  SIDEBAR_BACKGROUND,
  SIDEBAR_FONT,
  SIDEBAR_LABEL,
  SIDEBAR_LINE,
  SIDEBAR_TEXT,
  SECOND_HOLD_START,
  TOTAL,
  copyIcon,
  frameState,
  imgIcon,
  sidebarRows,
  type DemoScenario,
  type FrameState,
  type Locale,
} from "./demo-layout.ts"

const W = 800
const H = 450
const DELAY = 80
const SIZE = 12
// The sidebar's own metrics live in `demo-layout.ts`, because the PNG card the
// plugin saves copies them at double size and a test keeps the two in step.
const SIDE_SIZE = SIDEBAR_FONT
const SIDE_LH = SIDEBAR_LINE
const SCALE = 2

/** Use a monospace face with box-drawing-free art; the art itself is ASCII. */
const FONT_CANDIDATES: ReadonlyArray<readonly [regular: string, bold: string, family: string]> = [
  [
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf",
    "DejaVu Sans Mono",
  ],
  [
    "/usr/share/fonts/TTF/DejaVuSansMono.ttf",
    "/usr/share/fonts/TTF/DejaVuSansMono-Bold.ttf",
    "DejaVu Sans Mono",
  ],
  ["/System/Library/Fonts/Menlo.ttc", "/System/Library/Fonts/Menlo.ttc", "Menlo"],
  ["C:\\Windows\\Fonts\\consola.ttf", "C:\\Windows\\Fonts\\consolab.ttf", "Consolas"],
]

let family = "monospace"
for (const [regular, bold, candidate] of FONT_CANDIDATES) {
  if (!existsSync(regular)) continue
  GlobalFonts.registerFromPath(regular, candidate)
  if (existsSync(bold)) GlobalFonts.registerFromPath(bold, candidate)
  family = candidate
  break
}
const FONT = `"${family}", monospace`

/**
 * The GIF sits on a white Markdown page, so only the canvas around the window
 * is white. The OpenCode window itself stays in its dark theme.
 */
const C = {
  bg: "#ffffff",
  window: "#0d1117",
  bar: "#161b22",
  border: "#30363d",
  line: "#21262d",
  text: SIDEBAR_TEXT,
  muted: "#8b949e",
  dim: "#6e7681",
  accent: "#58a6ff",
  green: "#3fb950",
}

const out = createCanvas(W, H)
const octx = out.getContext("2d")
octx.imageSmoothingEnabled = true
octx.imageSmoothingQuality = "high"

const scene = createCanvas(W * SCALE, H * SCALE)
const sctx = scene.getContext("2d")
sctx.scale(SCALE, SCALE)
sctx.font = `${SIZE}px ${FONT}`
const CHAR = sctx.measureText("M").width
sctx.font = `${SIDE_SIZE}px ${FONT}`
const CHAR_SIDE = sctx.measureText("M").width

const LANE_W = LANE_COLS * CHAR_SIDE
const WINDOW = { x: 16, y: 14, w: 768, h: 422, r: 14 }
const BODY_TOP = 48
const SIDEBAR_X = W - 16 - 18 - (LANE_W + 28)
const LANE_X = SIDEBAR_X + LANE_INSET

const ROW_HEAD = 162
const ROW0 = 180
const rowY = (n: number) => ROW0 + n * SIDE_LH

function roundRect(g: any, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2)
  g.beginPath()
  g.moveTo(x + radius, y)
  g.lineTo(x + w - radius, y)
  g.quadraticCurveTo(x + w, y, x + w, y + radius)
  g.lineTo(x + w, y + h - radius)
  g.quadraticCurveTo(x + w, y + h, x + w - radius, y + h)
  g.lineTo(x + radius, y + h)
  g.quadraticCurveTo(x, y + h, x, y + h - radius)
  g.lineTo(x, y + radius)
  g.quadraticCurveTo(x, y, x + radius, y)
  g.closePath()
}

function text(g: any, str: string, x: number, y: number, color: string, opts: any = {}) {
  g.save()
  g.font = `${opts.weight ?? 400} ${opts.size ?? SIZE}px ${FONT}`
  g.fillStyle = color
  g.textBaseline = "middle"
  g.textAlign = opts.align ?? "left"
  g.fillText(str, x, y)
  g.restore()
}

function measure(str: string, size: number): number {
  sctx.save()
  sctx.font = `${size}px ${FONT}`
  const width = sctx.measureText(str).width
  sctx.restore()
  return width
}

function drawBackground(demo: DemoScenario) {
  const g = sctx
  g.fillStyle = C.bg
  g.fillRect(0, 0, W, H)

  g.save()
  g.shadowColor = "rgba(0,0,0,0.7)"
  g.shadowBlur = 34
  g.shadowOffsetY = 14
  g.fillStyle = C.window
  roundRect(g, WINDOW.x, WINDOW.y, WINDOW.w, WINDOW.h, WINDOW.r)
  g.fill()
  g.restore()

  g.save()
  roundRect(g, WINDOW.x, WINDOW.y, WINDOW.w, WINDOW.h, WINDOW.r)
  g.clip()
  g.fillStyle = C.bar
  g.fillRect(WINDOW.x, WINDOW.y, WINDOW.w, 34)
  g.fillStyle = C.line
  g.fillRect(WINDOW.x, WINDOW.y + 34, WINDOW.w, 1)
  g.restore()

  g.fillStyle = SIDEBAR_BACKGROUND
  g.fillRect(SIDEBAR_X, BODY_TOP, WINDOW.x + WINDOW.w - SIDEBAR_X, WINDOW.h - 34)

  g.strokeStyle = C.border
  g.lineWidth = 1
  roundRect(g, WINDOW.x + 0.5, WINDOW.y + 0.5, WINDOW.w - 1, WINDOW.h - 1, WINDOW.r)
  g.stroke()

  for (const [i, color] of ["#ff5f56", "#ffbd2e", "#27c93f"].entries()) {
    g.beginPath()
    g.arc(WINDOW.x + 20 + i * 16, WINDOW.y + 17, 5, 0, Math.PI * 2)
    g.fillStyle = color
    g.fill()
  }

  text(g, `opencode — ${demo.title}`, W / 2, WINDOW.y + 18, C.muted, { align: "center", size: 11 })
  text(g, `~/${demo.title}`, WINDOW.x + 20, 70, C.muted, { size: 11 })
  text(g, " main", WINDOW.x + 20 + measure(`~/${demo.title}`, 11), 70, C.green, { size: 11 })

  g.fillStyle = C.line
  g.fillRect(WINDOW.x + 20, 84, SIDEBAR_X - WINDOW.x - 40, 1)
  g.fillRect(SIDEBAR_X - 1, BODY_TOP, 1, WINDOW.h - 34)
}

function drawChat(state: FrameState, i: number, demo: DemoScenario) {
  const g = sctx
  const x = WINDOW.x + 20
  const right = SIDEBAR_X - 18

  text(g, "You", x, 108, C.accent, { size: 11, weight: 600 })
  text(g, demo.user, x, 128, C.text)

  text(g, "Assistant", x, 164, C.green, { size: 11, weight: 600 })
  text(g, demo.assistant, x, 184, C.text)

  if (state.era === "working") {
    const spinner = ["|", "/", "-", "\\"]
    const glyph = spinner[Math.floor(i / 4) % spinner.length]!
    text(g, glyph, x, 236, C.accent, { size: 13 })
    text(g, "Working…", x + 20, 236, C.muted, { size: 11 })
    text(g, "esc to interrupt", right, 236, C.dim, { size: 10, align: "right" })
  } else {
    text(g, "✓", x, 236, C.green, { size: 12 })
    text(g, "Done", x + 20, 236, C.green, { size: 11 })
    text(g, "1.1s · 0 tool calls", right, 236, C.dim, { size: 10, align: "right" })
  }

  if (state.commandMenu) drawCommandMenu()

  g.fillStyle = "#0b1018"
  roundRect(g, x, 364, right - x, 40, 8)
  g.fill()
  g.strokeStyle = C.border
  g.lineWidth = 1
  roundRect(g, x + 0.5, 364.5, right - x - 1, 39, 8)
  g.stroke()
  text(g, "›", x + 12, 384, C.accent, { size: 14 })
  const placeholder = "Ask anything…"
  text(g, state.input === "" ? placeholder : state.input, x + 30, 384, state.input === "" ? C.dim : C.text, {
    size: 11,
  })
  if (i % 16 < 9) {
    g.fillStyle = C.accent
    g.fillRect(x + 30 + measure(state.input === "" ? placeholder : state.input, 11) + 1, 376, 1.5, 16)
  }

  text(g, "tab agents", x, 430, C.dim, { size: 10 })
  text(g, "ctrl+p commands", right, 430, C.dim, { size: 10, align: "right" })
}

/** The one-row command palette shown after the user types `/`. */
function drawCommandMenu() {
  const g = sctx
  const x = WINDOW.x + 20
  const right = SIDEBAR_X - 18
  const top = 306
  const height = 42

  g.fillStyle = "#0b1018"
  roundRect(g, x, top, right - x, height, 8)
  g.fill()
  g.strokeStyle = C.border
  g.lineWidth = 1
  roundRect(g, x + 0.5, top + 0.5, right - x - 1, height - 1, 8)
  g.stroke()

  g.fillStyle = "#132033"
  roundRect(g, x + 4, top + 4, right - x - 8, height - 8, 6)
  g.fill()
  g.fillStyle = C.accent
  g.fillRect(x + 4, top + 4, 3, height - 8)

  text(g, "Talk to the duck", x + 16, top + height / 2, C.text, { size: 11 })
  text(g, "/duck", right - 12, top + height / 2, C.muted, { size: 10, align: "right" })
}

function drawSectionLabel(label: string, y: number, primary = false) {
  // The plugin's own section title is `theme.text.base`; it is not accented.
  text(sctx, label, LANE_X, y, primary ? C.text : C.muted, { size: SIDEBAR_LABEL, weight: 600 })
}

/**
 * The screenshot and copy icons at the right end of the `Ducksay` heading.
 *
 * The real section puts a five-cell `[img]` box left of a one-column gap and a
 * six-cell `[copy]` box; this right-aligns both glyphs to the same edges. The
 * screenshot icon is always `theme.text.base`; the copy icon is `theme.text.muted`
 * while the duck is still swimming or waiting, matching `canCopy()`.
 */
function drawHeadingIcons(state: FrameState) {
  const copyWidth = measure(COPY_ICON, 11)
  const copyColor = copyIcon(state) === "active" ? C.text : C.muted
  text(sctx, COPY_ICON, LANE_X + LANE_W - copyWidth, ROW_HEAD, copyColor, { size: 11 })

  const gap = measure(" ", 11)
  const imgWidth = measure(IMG_ICON, 11)
  const imgColor = imgIcon(state) === "active" ? C.text : C.muted
  text(sctx, IMG_ICON, LANE_X + LANE_W - copyWidth - gap - imgWidth, ROW_HEAD, imgColor, { size: 11 })
}

function drawSidebar(state: FrameState, demo: DemoScenario) {
  const g = sctx
  drawSectionLabel("Session", 74)
  text(g, demo.title, LANE_X, 92, C.text, { size: 10 })
  drawSectionLabel("MCP", 118)
  text(g, "no servers", LANE_X, 136, C.dim, { size: 10 })
  drawSectionLabel("Ducksay", ROW_HEAD, true)
  drawHeadingIcons(state)

  // The section takes one colour: the plugin paints every content row with the
  // theme's text colour, so there is no yellow duck, blue water or orange beak.
  // The rows themselves come from the plugin's sprites, wave and bubble modules.
  for (const [index, row] of sidebarRows(state).entries()) {
    text(g, row, LANE_X, rowY(index), C.text, { size: SIDE_SIZE })
  }

  const hintY = 360
  g.fillStyle = "#11161f"
  roundRect(g, LANE_X, hintY, 38, 20, 5)
  g.fill()
  g.strokeStyle = C.border
  g.lineWidth = 1
  roundRect(g, LANE_X + 0.5, hintY + 0.5, 37, 19, 5)
  g.stroke()
  text(g, "/duck", LANE_X + 19, hintY + 10, C.text, { size: 10, align: "center" })
  text(g, "talk to the duck", LANE_X + 46, hintY + 10, C.dim, { size: 10 })
}

function render(i: number, demo: DemoScenario) {
  const state = frameState(i, demo.locale)
  sctx.save()
  sctx.setTransform(SCALE, 0, 0, SCALE, 0, 0)
  drawBackground(demo)
  drawChat(state, i, demo)
  drawSidebar(state, demo)
  sctx.restore()
  octx.drawImage(scene, 0, 0, W, H)
}

const HERE = dirname(fileURLToPath(import.meta.url))
const ASSETS = join(HERE, "../assets")
const log = (message: string) => process.stdout.write(message + "\n")

const requested = process.argv[2]
if (requested !== undefined && !LOCALES.includes(requested as Locale)) {
  console.error(`unknown locale "${requested}"; expected ${LOCALES.join(", ")}`)
  process.exit(1)
}
const selected: readonly Locale[] = requested === undefined ? LOCALES : [requested as Locale]

async function generate(locale: Locale) {
  const demo = SCENARIOS[locale]
  const outFile = join(ASSETS, demo.file)

  log(`${locale}: rendering ${TOTAL} frames at ${W}x${H}, char ${CHAR.toFixed(3)}px`)

  const samples: Uint8Array[] = []
  for (const i of [
    0,
    10,
    25,
    28,
    35,
    45,
    COMMAND_MENU_START,
    COMMAND_SEND_START,
    SECOND_HOLD_START,
    TOTAL - 1,
  ]) {
    render(i, demo)
    const data = octx.getImageData(0, 0, W, H).data
    const sample = new Uint8Array((data.length / 4) * 3)
    let at = 0
    for (let p = 0; p < data.length; p += 4 * 2) {
      sample[at++] = data[p]!
      sample[at++] = data[p + 1]!
      sample[at++] = data[p + 2]!
    }
    samples.push(sample)
  }
  const merged = new Uint8Array(samples.reduce((n, s) => n + s.length, 0))
  let offset = 0
  for (const sample of samples) {
    merged.set(sample, offset)
    offset += sample.length
  }

  log(`${locale}: quantizing palette…`)
  const palette = quantize(merged, 160, { format: "rgb565" })
  log(`${locale}: palette: ${palette.length} colors`)

  const gif = GIFEncoder()
  for (let i = 0; i < TOTAL; i++) {
    render(i, demo)
    const data = octx.getImageData(0, 0, W, H).data
    const index = applyPalette(data, palette, "rgb565")
    gif.writeFrame(index, W, H, {
      palette: i === 0 ? palette : undefined,
      delay: DELAY,
      repeat: 0,
    } as any)
    if (i % 10 === 0) log(`${locale}: frame ${i + 1}/${TOTAL}`)
  }
  gif.finish()
  const bytes = gif.bytes()
  mkdirSync(dirname(outFile), { recursive: true })
  await Bun.write(outFile, bytes)
  log(`${locale}: wrote ${outFile} (${(bytes.length / 1024).toFixed(0)} KiB, ${TOTAL} frames)`)
}

for (const locale of selected) await generate(locale)
