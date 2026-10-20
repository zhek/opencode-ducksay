/** @jsxImportSource @opentui/solid */
import { describe, expect, test } from "bun:test"
import { render, testRender } from "@opentui/solid"
import { createTestRenderer, ManualClock, type TestRendererSetup } from "@opentui/core/testing"
import { RGBA } from "@opentui/core"
import type { CliRenderer } from "@opentui/core"
import type { Data } from "@opencode/plugin/tui/context"
import { BUBBLE_MAX_LINES, BUBBLE_TEXT_WIDTH, BUBBLE_WIDTH } from "../src/bubble.ts"
import { DUCK_LEFT, DUCK_LEFT_OPEN, DUCK_RIGHT, DUCK_RIGHT_OPEN, DUCK_WIDTH } from "../src/duck.ts"
import { WAVE_PERIOD, waveSpeed } from "../src/wave.ts"
import { Ducksay, type DuckSprites } from "../src/tui.tsx"

/** The session the mounted panel belongs to. */
const SESSION = "ses_duck"

/** `SESSION_SIDEBAR_WIDTH` from OpenCode's session sidebar. */
const PANEL_WIDTH = 42
const PANEL_CONTENT_WIDTH = 37

/**
 * `fg` clones the value, so the fixture has to be a real RGBA, not a plain
 * object. In the plugin the host passes `theme.text.base`, already an RGBA.
 */
const PRIMARY = RGBA.fromHex("#e5e5e5")

/** One column at the default speed of 12 columns per second. */
const COLUMN_MS = 1000 / 12

/** The interval the section ticks on; see `TICK_MS` in `src/tui.tsx`. */
const TICK_MS = 33

/** Where the duck can get to: the lane minus the art. */
const RIGHT_EDGE = PANEL_WIDTH - DUCK_WIDTH

/**
 * The middle art line, closed and open. All four versions start at column 0, so
 * `indexOf` on the captured frame is the duck's column exactly — no leading
 * spaces to account for.
 */
const FACING_RIGHT = DUCK_RIGHT[1]
const FACING_RIGHT_OPEN = DUCK_RIGHT_OPEN[1]
const FACING_LEFT = DUCK_LEFT[1]
const FACING_LEFT_OPEN = DUCK_LEFT_OPEN[1]
const RIGHT_MARKERS = [FACING_RIGHT, FACING_RIGHT_OPEN]
const LEFT_MARKERS = [FACING_LEFT, FACING_LEFT_OPEN]
const ALL_MARKERS = [...RIGHT_MARKERS, ...LEFT_MARKERS]

/**
 * The part of the head line both directions share: the right sprite pads before
 * the head, the left sprite pads after it, so only the two spaces and the two
 * underscores are common.
 */
const HEAD = "  __"

/** The column the duck is drawn at, read back from a captured frame. */
function columnOf(frame: string): number {
  const rows = frame.split("\n").filter((row) => ALL_MARKERS.some((marker) => row.includes(marker)))
  expect(rows).toHaveLength(1)
  const marker = ALL_MARKERS.find((candidate) => rows[0]!.includes(candidate))!
  return rows[0]!.indexOf(marker)
}

/** True when the duck faces right, i.e. towards the middle from the left edge. */
function facesRight(frame: string): boolean {
  return RIGHT_MARKERS.some((marker) => frame.includes(marker))
}

interface Harness {
  readonly renderer: CliRenderer
  /** Heartbeats the section currently holds; zero once the duck is at rest. */
  readonly activeTimers: () => number
  readonly liveRequests: () => number
  readonly setRunning: (value: boolean) => void
  /** Paints one frame and returns it. */
  readonly frame: () => Promise<string>
  /** The same frame with colours, for checking what a row was drawn in. */
  readonly spans: () => ReturnType<TestRendererSetup["captureSpans"]>
  /** Advances the manual clock, paints the single frame it produces, returns it. */
  readonly advance: (ms: number) => Promise<string>
  /** Paints `frames` frames of `msPerFrame` each, returns the last one. */
  readonly tick: (frames: number, msPerFrame?: number) => Promise<string>
  readonly dispose: () => Promise<void>
}

/**
 * Renders the section on a manual clock.
 *
 * The renderer is built before the tree is mounted, because OpenCode's JSX
 * transform — Bun's, which is not Solid-aware — evaluates prop values once: a
 * renderer handed over after mounting would arrive as `undefined` and stay
 * frozen there. The section's own inputs follow the same rule: `data` stands in
 * for the event source the component subscribes to, and `schedule` hands it the
 * manual clock so a tick does not have to wait for real time.
 */
interface MountOptions {
  width?: number
  running?: boolean
  swimSpeed?: number
  sprites?: DuckSprites
  bubbleText?: string
}

async function mount(options: MountOptions = {}): Promise<Harness> {
  const clock = new ManualClock()
  const handlers = new Map<string, (event: unknown) => void>()
  let setRunning = (_value: boolean) => {}
  let activeTimers = 0

  const setup = await createTestRenderer({ width: options.width ?? PANEL_WIDTH, height: 12, clock })
  await render(
    () => {
      const data = {
        on: (type: string, handler: (event: unknown) => void) => {
          handlers.set(type, handler)
          return () => handlers.delete(type)
        },
      } as unknown as Data
      setRunning = (value: boolean) => {
        handlers.get("session.execution.started")?.({ data: { sessionID: SESSION } })
        if (!value) handlers.get("session.execution.succeeded")?.({ data: { sessionID: SESSION } })
      }
      return (
        <Ducksay
          primary={PRIMARY}
          renderer={setup.renderer}
          swimSpeed={options.swimSpeed ?? 12}
          data={data}
          sessionID={SESSION}
          isRunning={() => options.running === true}
          schedule={(tick, ms) => {
            activeTimers += 1
            const handle = clock.setInterval(tick, ms)
            return () => {
              clock.clearInterval(handle)
              activeTimers -= 1
            }
          }}
          sprites={options.sprites}
          bubbleText={options.bubbleText}
        />
      )
    },
    setup.renderer,
  )

  const frame = async () => {
    await setup.renderOnce()
    return setup.captureCharFrame()
  }
  await frame()

  // The duck advances on a timer, so time is moved a tick at a time: one step
  // of the clock is one tick of the animation, as it would be in the terminal.
  const advance = async (ms: number) => {
    let left = ms
    while (left > 0) {
      const step = Math.min(TICK_MS, left)
      clock.advance(step)
      left -= step
    }
    return frame()
  }

  return {
    renderer: setup.renderer,
    spans: () => setup.captureSpans(),
    activeTimers: () => activeTimers,
    liveRequests: () => setup.renderer.liveRequestCount,
    setRunning,
    frame,
    advance,
    // Frames of 100 ms, which is the pace a real frame loop would deliver at
    // low frame rates and leaves the duck one column per frame at the default
    // speed. Jumping the clock in one go would not be the same thing: a single
    // frame never carries the duck further than its catch-up budget.
    tick: async (frames: number, msPerFrame = 100) => {
      let captured = ""
      for (let index = 0; index < frames; index += 1) captured = await advance(msPerFrame)
      return captured
    },
    dispose: () => setup.dispose(),
  }
}

describe("Ducksay section", () => {
  test("renders the heading and every art line", async () => {
    const harness = await mount()
    const captured = await harness.frame()
    await harness.dispose()

    expect(captured).toContain("Ducksay")
    for (const line of DUCK_RIGHT) expect(captured).toContain(line.trimEnd())
  })

  test("puts the resting art at the left edge of the panel, with no added indent", async () => {
    const harness = await mount()
    const rows = (await harness.frame()).split("\n")
    await harness.dispose()

    for (const line of DUCK_RIGHT) {
      const row = rows.find((candidate) => candidate.includes(line.trimEnd()))
      expect(row).toBeDefined()
      expect(row!.indexOf(line.trimEnd())).toBe(0)
    }
  })

  test("keeps the heading above the art", async () => {
    const harness = await mount()
    const rows = (await harness.frame()).split("\n")
    await harness.dispose()
    const heading = rows.findIndex((row) => row.includes("Ducksay"))
    const lastArtRow = rows.findLastIndex((row) => DUCK_RIGHT.some((line) => row.includes(line.trimEnd())))

    expect(heading).toBeGreaterThanOrEqual(0)
    expect(heading).toBeLessThan(lastArtRow)
  })

  test("stacks its lines even when the parent lays claims out in a row", async () => {
    // Regression: the sidebar's own slot container does not give us a vertical
    // direction. Inheriting its layout ran the heading and all three art lines
    // together into one line of text. The section must declare its own
    // direction rather than rely on the parent's.
    const clock = new ManualClock()
    const setup = await testRender(
      () => (
        <box flexDirection="row">
          <Ducksay primary={PRIMARY} />
        </box>
      ),
      { width: PANEL_WIDTH, height: 12, clock },
    )
    await setup.renderOnce()
    const rows = setup.captureCharFrame().split("\n")
    await setup.dispose()

    for (const line of DUCK_RIGHT) {
      const row = rows.find((candidate) => candidate.includes(line.trimEnd()))
      expect(row).toBeDefined()
      expect(row!.indexOf(line.trimEnd())).toBe(0)
    }
    expect(rows.find((row) => row.includes("Ducksay"))!.indexOf("Ducksay")).toBe(0)
  })

  test("does not wrap a line wider than the panel content width", async () => {
    // Rendered at the content width (37), so a line past it has to either wrap
    // or get clipped — which is exactly the difference under test.
    const wide = "W".repeat(PANEL_CONTENT_WIDTH + 18)
    const sprites: DuckSprites = {
      right: ["  __", wide],
      left: ["  __", wide],
      rightOpen: ["  __", wide],
      leftOpen: ["  __", wide],
    }
    const clock = new ManualClock()
    const setup = await testRender(() => <Ducksay primary={PRIMARY} sprites={sprites} />, {
      width: PANEL_CONTENT_WIDTH,
      height: 12,
      clock,
    })
    await setup.renderOnce()
    const rows = setup.captureCharFrame().split("\n")
    await setup.dispose()

    // With `wrapMode="none"` the line stays on one row (clipped at the edge);
    // the default wrap mode would spill the tail onto the next row.
    expect(rows.filter((row) => row.includes("W"))).toHaveLength(1)
  })
})

describe("swimming", () => {
  test("moves towards the right edge while the session is running", async () => {
    const harness = await mount({ running: true })

    const start = columnOf(await harness.frame())
    const later = columnOf(await harness.advance(COLUMN_MS * 3))

    expect(later).toBeGreaterThan(start)
    expect(facesRight(await harness.frame())).toBe(true)
  })

  test("turns around at the edge and swims back in the mirrored sprite", async () => {
    const harness = await mount({ running: true })

    expect(facesRight(await harness.advance(COLUMN_MS * 4))).toBe(true)

    // Swim until the far wall is reached and the duck has turned. The moment is
    // observed while it happens, because a longer run ends up on the way back.
    let reachedEdge = false
    let last = ""
    for (let step = 0; step < RIGHT_EDGE + 4; step += 1) {
      last = await harness.advance(100)
      if (columnOf(last) === RIGHT_EDGE && !facesRight(last)) reachedEdge = true
    }

    expect(reachedEdge).toBe(true)
    // Back on its way, still wearing the mirrored sprite.
    expect(columnOf(last)).toBeLessThan(RIGHT_EDGE)
    expect(facesRight(last)).toBe(false)
  })

  test("swims on to an edge when the session goes idle, then stops facing the middle", async () => {
    const harness = await mount({ running: true })
    expect(columnOf(await harness.advance(COLUMN_MS * 5))).toBeGreaterThan(0)

    harness.setRunning(false)
    const docked = await harness.tick(RIGHT_EDGE + 2)

    // Stopped on a wall…
    const dockedColumn = columnOf(docked)
    expect([0, RIGHT_EDGE]).toContain(dockedColumn)
    // …with its nose towards the middle of the lane.
    expect(facesRight(docked)).toBe(dockedColumn === 0)

    // And it stays there.
    expect(columnOf(await harness.tick(5))).toBe(dockedColumn)
  })

  test("stands still while the session is idle", async () => {
    const harness = await mount({ running: false })
    const before = await harness.frame()

    const after = await harness.advance(COLUMN_MS * 10)

    expect(after).toBe(before)
    expect(columnOf(after)).toBe(0)
  })

  test("keeps the art on its own rows while swimming at the lane limit", async () => {
    const harness = await mount({ running: true, width: PANEL_CONTENT_WIDTH })
    const rows = (await harness.tick(PANEL_CONTENT_WIDTH + 4)).split("\n")

    // Each sprite line appears on at most one row: at the lane limit the art
    // ends on the panel's last column rather than spilling over.
    for (const line of [DUCK_LEFT[1], DUCK_LEFT[2]]) {
      expect(rows.filter((row) => row.includes(line.trimEnd())).length).toBeLessThanOrEqual(1)
    }
    expect(columnOf(rows.join("\n"))).toBeLessThanOrEqual(PANEL_CONTENT_WIDTH - DUCK_WIDTH)
  })

  test("ends up facing the middle whichever wall it rests against", async () => {
    // Docking at the right wall and docking at the left one must leave the same
    // pose: at a wall, nose inwards.
    const atRightWall = await mount({ running: true })
    atRightWall.setRunning(false)
    const right = await atRightWall.tick(RIGHT_EDGE + 2)
    expect(columnOf(right)).toBe(RIGHT_EDGE)
    expect(facesRight(right)).toBe(false)

    const atLeftWall = await mount({ running: true })
    // Swim to the right wall, turn back, and stop while heading left.
    await atLeftWall.tick(RIGHT_EDGE + 3)
    atLeftWall.setRunning(false)
    const left = await atLeftWall.tick(RIGHT_EDGE + 2)
    expect(columnOf(left)).toBe(0)
    expect(facesRight(left)).toBe(true)
  })

  test("stands still when the lane is narrower than the art", async () => {
    const harness = await mount({ running: true, width: DUCK_WIDTH - 2 })
    const before = await harness.frame()

    // The art is wider than the lane, so its right half is clipped and the full
    // marker line cannot appear at all — the pose is read from what is visible.
    expect(await harness.tick(6)).toBe(before)
    expect(before).toContain(DUCK_RIGHT[1].slice(0, DUCK_WIDTH - 2))
  })

  test("never leaves the lane at the fastest speed", async () => {
    const harness = await mount({ running: true, swimSpeed: 120 })

    for (let lap = 0; lap < 3; lap += 1) {
      const frame = await harness.tick(RIGHT_EDGE + 2)
      expect(columnOf(frame)).toBeGreaterThanOrEqual(0)
      expect(columnOf(frame)).toBeLessThanOrEqual(RIGHT_EDGE)
    }
  })
})

describe("animation timers", () => {
  test("does not tick at all when the speed is zero", async () => {
    const harness = await mount({ running: true, swimSpeed: 0 })

    const before = await harness.frame()
    const after = await harness.advance(COLUMN_MS * 10)

    expect(after).toBe(before)
    expect(columnOf(after)).toBe(0)
    expect(harness.activeTimers()).toBe(0)
    expect(harness.liveRequests()).toBe(0)
  })

  test("stops the timer once the duck has stopped", async () => {
    const harness = await mount({ running: true })
    await harness.advance(COLUMN_MS * 2)
    expect(harness.activeTimers()).toBe(1)

    harness.setRunning(false)
    const docked = await harness.tick(RIGHT_EDGE + 2)

    expect(harness.activeTimers()).toBe(0)
    expect(harness.liveRequests()).toBe(0)
    expect(columnOf(await harness.advance(COLUMN_MS * 5))).toBe(columnOf(docked))
  })

  // Disposal itself is not testable here: `testRender` resolves with the
  // renderer already built, so the tree can only be mounted through `render`,
  // whose dispose handle is not exported, and the reconciler resolves `solid-js`
  // to its server build under Bun's default conditions, where owner disposal
  // does not run cleanups. The live check covers a hidden sidebar instead; the
  // cleanup path itself is covered by the test above, which tears the timer down
  // through the same `onCleanup`.
})

describe("water", () => {
  /** The duck's last art line, which shares a row with the upper water row. */
  const LAST_ART = DUCK_RIGHT[DUCK_RIGHT.length - 1].trimEnd()

  const rows = (frame: string) => frame.split("\n")

  /** Indexes of the rows carrying a tilde, which is every water row and nothing else. */
  const waterIndexes = (frame: string) =>
    rows(frame).flatMap((row, index) => (row.includes("~") ? [index] : []))

  /** Index of the row that carries the duck's last art line and the upper water row. */
  const sharedIndex = (frame: string) =>
    rows(frame).findIndex((row) => row.includes(LAST_ART))

  /** The lower water row, which holds no art and so is pure pattern. */
  const openWater = (frame: string) => rows(frame)[sharedIndex(frame) + 1] ?? ""

  /** Same row padded out, so two frames can be compared column by column. */
  const padded = (row: string) => row.padEnd(PANEL_WIDTH)

  /**
   * How far the pattern travelled between two water rows, or -1 when the new
   * row is not the old one shifted. The pattern only ever translates, so this
   * catches a wrong direction as well as a pattern that changed shape.
   */
  const shiftOf = (before: string, after: string) => {
    const from = padded(before)
    const to = padded(after)
    for (let shift = 0; shift < WAVE_PERIOD; shift++) {
      if (from.slice(shift) === to.slice(0, PANEL_WIDTH - shift)) return shift
    }
    return -1
  }

  test("draws two rows of water, the upper one shared with the duck", async () => {
    const harness = await mount()
    const captured = await harness.frame()
    await harness.dispose()

    const shared = sharedIndex(captured)
    expect(shared).toBeGreaterThanOrEqual(0)
    // The upper water row shares a row with the duck's last art line and the
    // second row sits directly under it. Nothing else in the section carries a
    // tilde, so this also pins down that neither row wrapped onto another.
    expect(waterIndexes(captured)).toEqual([shared, shared + 1])
  })

  test("keeps the duck in the columns it occupies", async () => {
    const harness = await mount()
    const captured = await harness.frame()
    await harness.dispose()

    const shared = rows(captured)[sharedIndex(captured)]
    const at = shared.indexOf(LAST_ART)
    // The duck is drawn over the water, the spaces inside its art included, so
    // its own cells never read as water.
    expect(shared.slice(at, at + LAST_ART.length)).toBe(LAST_ART)
    expect(shared.slice(at, at + LAST_ART.length)).not.toContain("~")
  })

  test("puts the duck's last line at the duck's own column, away from the edge", async () => {
    // Regression, found on a live TUI: the shared row was handed an art line
    // that already carried its indent, so it got shifted by the duck's column a
    // second time and walked off the row. At the left edge the indent is empty,
    // so the bug hid behind the resting pose and every rest-state check passed.
    const harness = await mount({ running: true })
    await harness.advance(COLUMN_MS * 6)
    const captured = await harness.frame()
    await harness.dispose()

    const column = columnOf(captured)
    expect(column).toBeGreaterThan(0)
    expect(rows(captured)[sharedIndex(captured)].indexOf(LAST_ART)).toBe(column)
  })

  test("draws the water in the same colour as the art", async () => {
    const harness = await mount()
    await harness.frame()
    const captured = harness.spans()
    await harness.dispose()

    const colourOf = (needle: string) => {
      for (const line of captured.lines) {
        for (const span of line.spans) {
          if (span.text.includes(needle)) return span.fg
        }
      }
      return undefined
    }
    const art = colourOf(LAST_ART)
    const water = colourOf("~")
    expect(art).toBeDefined()
    expect(water).toBeDefined()
    expect(water!.equals(art!)).toBe(true)
  })

  test("travels with the duck, always in one direction", async () => {
    const harness = await mount({ running: true })
    const before = openWater(await harness.frame())
    await harness.advance(1000)
    const after = openWater(await harness.frame())
    await harness.dispose()

    // A second of clock is a second of swimming, and `advance` steps the clock a
    // tick at a time, so the tempo the section derives is what is under test:
    // one period per crossing, whatever the lane width.
    const ticks = Math.ceil(1000 / TICK_MS)
    const expected = Math.floor(waveSpeed(12, RIGHT_EDGE) * ticks * (TICK_MS / 1000))
    const shift = shiftOf(before, after)
    expect(shift).toBe(expected)
    expect(shift).toBeGreaterThan(0)
  })

  test("stands still at rest", async () => {
    const harness = await mount()
    const before = await harness.frame()
    await harness.tick(6)
    const after = await harness.frame()
    await harness.dispose()

    expect(shiftOf(openWater(before), openWater(after))).toBe(0)
    expect(harness.activeTimers()).toBe(0)
  })

  test("stands still at zero speed, with no timer at all", async () => {
    const harness = await mount({ swimSpeed: 0 })
    const before = await harness.frame()
    await harness.tick(6)
    const after = await harness.frame()
    await harness.dispose()

    expect(shiftOf(openWater(before), openWater(after))).toBe(0)
    expect(harness.activeTimers()).toBe(0)
    // The water belongs to the section whether or not it moves: a frozen duck
    // still sits in the water.
    expect(waterIndexes(after)).toHaveLength(2)
  })

  test("stands still in a lane narrower than the art", async () => {
    // The duck is pinned to the left edge, so a crossing takes no time and the
    // derived tempo would divide by zero. The art is also clipped here, which is
    // why the duck is placed by its visible bottom line rather than by the body
    // line `columnOf` looks for.
    // Seven columns is still narrower than the eight the art needs, and still wide
    // enough for its last line to be drawn whole, which is what places the duck.
    const harness = await mount({ width: 7, running: true })
    const before = await harness.frame()
    await harness.tick(6)
    const after = await harness.frame()
    await harness.dispose()

    expect(shiftOf(openWater(before), openWater(after))).toBe(0)
    expect(rows(after)[sharedIndex(after)].indexOf(LAST_ART)).toBe(0)
  })
})

describe("rest bubble", () => {
  /** A message that wraps to exactly `count` lines: one 25-column word per line. */
  const lines = (count: number) =>
    Array.from({ length: count }, (_, index) => String.fromCharCode(97 + index).repeat(BUBBLE_TEXT_WIDTH)).join(" ")

  /**
   * Swims a little, then docks at `wall` and returns the frame where the duck
   * has come to rest with the bubble showing.
   */
  async function restAt(wall: "left" | "right", options: MountOptions = {}) {
    const harness = await mount({ running: true, ...options })
    if (wall === "left") {
      // Swim to the right wall, turn back, and stop while heading left.
      await harness.tick(RIGHT_EDGE + 3)
    } else {
      await harness.advance(COLUMN_MS * 3)
    }
    harness.setRunning(false)
    const frame = await harness.tick(RIGHT_EDGE + 2)
    return { harness, frame }
  }

  const rowOf = (frame: string, needle: string) =>
    frame.split("\n").findIndex((row) => row.includes(needle))

  test("shows no bubble before the first swim", async () => {
    const harness = await mount()
    const captured = await harness.frame()
    await harness.dispose()

    expect(captured).not.toContain("╭")
    expect(captured).not.toContain("╰")
    expect(captured).not.toContain("╯")
    expect(captured).toContain(FACING_RIGHT)
    expect(captured).not.toContain(FACING_RIGHT_OPEN)
  })

  test("shows the bubble and opens the beak when the duck comes to rest", async () => {
    const { harness, frame } = await restAt("right")
    expect(frame).toContain("Quack-quack!")
    expect(frame).toContain("╭")
    expect(frame).toContain(FACING_LEFT_OPEN)
    expect(frame).not.toContain(FACING_LEFT)
    await harness.dispose()
  })

  test("keeps the bubble for as long as the duck rests", async () => {
    const { harness, frame } = await restAt("right")
    expect(await harness.tick(10)).toBe(frame)
    expect(harness.activeTimers()).toBe(0)
    await harness.dispose()
  })

  test("drops the bubble and closes the beak when the duck swims again", async () => {
    const { harness } = await restAt("right")
    harness.setRunning(true)
    const swimming = await harness.advance(TICK_MS)

    expect(swimming).not.toContain("╭")
    expect(swimming).not.toContain("╰")
    expect(swimming).not.toContain("╯")
    expect(swimming).toContain(FACING_LEFT)
    expect(swimming).not.toContain(FACING_LEFT_OPEN)
    await harness.dispose()
  })

  test("never shows the bubble when the duck cannot swim", async () => {
    const harness = await mount({ running: true, swimSpeed: 0 })
    await harness.tick(5)
    const frame = await harness.frame()
    await harness.dispose()

    expect(frame).not.toContain("╭")
    expect(frame).toContain(FACING_RIGHT)
  })

  test("puts the bubble against the beak with a one-column tail gap", async () => {
    const left = await restAt("left")
    const leftRows = left.frame.split("\n")
    const leftBeak = rowOf(left.frame, FACING_RIGHT_OPEN)
    const leftColumn = columnOf(left.frame)
    expect(leftColumn).toBe(0)
    // The duck ends at `column + DUCK_WIDTH`; the tail is one column past it.
    expect(leftRows[leftBeak]!.indexOf("╯") - (leftColumn + DUCK_WIDTH)).toBe(1)
    await left.harness.dispose()

    const right = await restAt("right")
    const rightRows = right.frame.split("\n")
    const rightBeak = rowOf(right.frame, FACING_LEFT_OPEN)
    const rightColumn = columnOf(right.frame)
    expect(rightColumn).toBe(RIGHT_EDGE)
    // The beak starts at `column`; the tail is one column before the gap.
    expect(rightColumn - 1 - rightRows[rightBeak]!.indexOf("╰")).toBe(1)
    await right.harness.dispose()
  })

  test("draws a 29-column frame around a 25-column text field", async () => {
    const { harness, frame } = await restAt("left")
    const rows = frame.split("\n")
    const top = rows[rowOf(frame, "╭")]!
    const topAt = top.indexOf("╭")
    const border = top.slice(topAt, topAt + BUBBLE_WIDTH)
    expect(border).toHaveLength(BUBBLE_WIDTH)
    expect(border.startsWith("╭")).toBe(true)
    expect(border.endsWith("╮")).toBe(true)
    expect(border.slice(1, -1)).toBe("─".repeat(BUBBLE_WIDTH - 2))

    const text = rows[rowOf(frame, "Quack-quack!")]!
    const textAt = text.indexOf("│")
    const box = text.slice(textAt, textAt + BUBBLE_WIDTH)
    expect(box).toHaveLength(BUBBLE_WIDTH)
    const field = box.slice(2, 2 + BUBBLE_TEXT_WIDTH)
    expect(field).toHaveLength(BUBBLE_TEXT_WIDTH)
    expect(field.trimEnd()).toBe("Quack-quack!")
    expect(box.slice(-2)).toBe(" │")
    await harness.dispose()
  })

  test("rests the bottom border on the head row for one to four lines", async () => {
    for (let count = 1; count < BUBBLE_MAX_LINES; count++) {
      const { harness, frame } = await restAt("left", { bubbleText: lines(count) })
      const rows = frame.split("\n")
      const head = rowOf(frame, HEAD)
      const beak = rowOf(frame, FACING_RIGHT_OPEN)
      expect(head).toBeGreaterThanOrEqual(0)
      // The bottom border shares the head row with the duck's head…
      expect(rows[head]).toContain("╰")
      expect(rows[head]).toContain("╯")
      // …and the tail shares the beak row, without a border line.
      expect(rows[beak]!.indexOf("╯")).toBeGreaterThan(0)
      expect(rows[beak]).not.toContain("─")
      await harness.dispose()
    }
  })

  test("puts the bottom border on the beak row and drops the tail at five lines", async () => {
    const { harness, frame } = await restAt("left", { bubbleText: lines(BUBBLE_MAX_LINES) })
    const rows = frame.split("\n")
    const beak = rowOf(frame, FACING_RIGHT_OPEN)

    expect(rows[beak]).toContain("╰")
    expect(rows[beak]).toContain("╯")
    expect(rows[beak]).toContain("─")
    // No row carries a lone tail glyph.
    expect(rows.filter((row) => (row.includes("╯") || row.includes("╰")) && !row.includes("─"))).toHaveLength(0)
    await harness.dispose()
  })

  test("keeps the duck on the same rows when the bubble appears", async () => {
    const still = await mount()
    const before = await still.frame()
    const headBefore = rowOf(before, HEAD)
    await still.dispose()

    const { harness, frame } = await restAt("right")
    const rows = frame.split("\n")
    expect(rowOf(frame, HEAD)).toBe(headBefore)
    expect(rows[headBefore + 1]).toContain(FACING_LEFT_OPEN)
    expect(rows[headBefore + 2]).toContain(DUCK_LEFT[2].trimEnd())
    await harness.dispose()
  })
})
