/** @jsxImportSource @opentui/solid */
import { describe, expect, test } from "bun:test"
import { render, testRender } from "@opentui/solid"
import { createTestRenderer, ManualClock } from "@opentui/core/testing"
import { RGBA } from "@opentui/core"
import type { CliRenderer } from "@opentui/core"
import type { Data } from "@opencode/plugin/tui/context"
import { DUCK_LEFT, DUCK_RIGHT, DUCK_WIDTH } from "../src/duck.ts"
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
 * A body line that starts at column 0 in both sprites, so `indexOf` on the
 * captured frame is the duck's column exactly — no leading spaces to account for.
 */
const FACING_RIGHT = DUCK_RIGHT[1]
const FACING_LEFT = DUCK_LEFT[1]

/** The column the duck is drawn at, read back from a captured frame. */
function columnOf(frame: string): number {
  const rows = frame.split("\n").filter((row) => row.includes(FACING_RIGHT) || row.includes(FACING_LEFT))
  expect(rows).toHaveLength(1)
  const marker = rows[0].includes(FACING_RIGHT) ? FACING_RIGHT : FACING_LEFT
  return rows[0].indexOf(marker)
}

/** True when the duck faces right, i.e. towards the middle from the left edge. */
function facesRight(frame: string): boolean {
  return frame.includes(FACING_RIGHT)
}

interface Harness {
  readonly renderer: CliRenderer
  /** Heartbeats the section currently holds; zero once the duck is at rest. */
  readonly activeTimers: () => number
  readonly liveRequests: () => number
  readonly setRunning: (value: boolean) => void
  /** Paints one frame and returns it. */
  readonly frame: () => Promise<string>
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
async function mount(
  options: { width?: number; running?: boolean; swimSpeed?: number; sprites?: DuckSprites } = {},
): Promise<Harness> {
  const clock = new ManualClock()
  const handlers = new Map<string, (event: unknown) => void>()
  let setRunning = (_value: boolean) => {}
  let activeTimers = 0

  const setup = await createTestRenderer({ width: options.width ?? PANEL_WIDTH, height: 8, clock })
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
      { width: PANEL_WIDTH, height: 8, clock },
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
    const sprites: DuckSprites = { right: ["  __", wide], left: ["  __", wide] }
    const clock = new ManualClock()
    const setup = await testRender(() => <Ducksay primary={PRIMARY} sprites={sprites} />, {
      width: PANEL_CONTENT_WIDTH,
      height: 8,
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
    expect(right.includes(FACING_LEFT)).toBe(true)

    const atLeftWall = await mount({ running: true })
    // Swim to the right wall, turn back, and stop while heading left.
    await atLeftWall.tick(RIGHT_EDGE + 3)
    atLeftWall.setRunning(false)
    const left = await atLeftWall.tick(RIGHT_EDGE + 2)
    expect(columnOf(left)).toBe(0)
    expect(left.includes(FACING_RIGHT)).toBe(true)
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