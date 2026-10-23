/** @jsxImportSource @opentui/solid */
import { describe, expect, test } from "bun:test"
import { createComponent, render, testRender } from "@opentui/solid"
import { createTestRenderer, ManualClock, type TestRendererSetup } from "@opentui/core/testing"
import { RGBA } from "@opentui/core"
import type { CliRenderer } from "@opentui/core"
import type { Data } from "@opencode/plugin/tui/context"
import { createSignal, Show } from "solid-js/dist/solid.js"

/**
 * `Show`'s two overloads are hard to pick through the manual `createComponent`
 * call below, so the test uses the non-keyed shape explicitly.
 */
const Conditional = Show as unknown as (props: {
  when: boolean
  keyed?: false
  children: (shown: boolean) => unknown
}) => unknown
import { BUBBLE_MAX_LINES, BUBBLE_TEXT_WIDTH, BUBBLE_WIDTH } from "../src/bubble.ts"
import { DUCK_LEFT, DUCK_LEFT_OPEN, DUCK_RIGHT, DUCK_RIGHT_OPEN, DUCK_WIDTH } from "../src/duck.ts"
import { createDuckStates, type DuckStates } from "../src/duck-state.ts"
import { DEFAULT_SWIM_SPEED } from "../src/options.ts"
import { QUESTION_FRAME_MS } from "../src/question.ts"
import { THINK_FRAME_MS, WORD_FRAME_MS } from "../src/thinking.ts"
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

/** One column at the plugin's default speed. */
const COLUMN_MS = 1000 / DEFAULT_SWIM_SPEED

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

/** A question marker found in a captured frame. */
interface FoundMarker {
  readonly glyph: string
  readonly row: number
  readonly column: number
}

/**
 * Finds the marker above the duck. The bubble is hidden while a form waits, so
 * the only `?`, `!` or `⸮` in the frame is the marker.
 */
function questionMarker(frame: string): FoundMarker | undefined {
  const rows = frame.split("\n")
  for (const [row, line] of rows.entries()) {
    for (const glyph of ["⸮", "?", "!"]) {
      const column = line.indexOf(glyph)
      if (column >= 0) return { glyph, row, column }
    }
  }
  return undefined
}

/** The column the marker must occupy for the duck in this frame. */
function expectedMarkerColumn(frame: string): number {
  return columnOf(frame) + (facesRight(frame) ? DUCK_WIDTH - 2 : 1)
}

/** A form the fake host already has when the section mounts. */
interface PendingForm {
  readonly id: string
  /** Defaults to the mounted session; pass another id to seed a foreign form. */
  readonly sessionID?: string
}

/** Lets promise callbacks and the repaint effect run. */
async function flushEffects() {
  for (let index = 0; index < 8; index += 1) await Promise.resolve()
}

interface Harness {
  readonly renderer: CliRenderer
  /** Heartbeats the section currently holds; zero once the duck is at rest. */
  readonly activeTimers: () => number
  readonly liveRequests: () => number
  readonly setRunning: (value: boolean) => void
  /**
   * Switches the displayed session. The prop is a getter, so the section sees
   * the new id the way a host that re-renders the sidebar would.
   */
  readonly setSession: (sessionID: string) => void
  /** Emits one host event through the same subscription the section uses. */
  readonly emit: (type: string, event: unknown) => void
  /** Form events for the mounted session unless another session is passed. */
  readonly formCreated: (id: string, sessionID?: string) => void
  readonly formReplied: (id: string, sessionID?: string) => void
  readonly formCancelled: (id: string, sessionID?: string) => void
  /** Paints one frame and returns it. */
  readonly frame: () => Promise<string>
  /** The same frame with colours, for checking what a row was drawn in. */
  readonly spans: () => ReturnType<TestRendererSetup["captureSpans"]>
  /** Advances the manual clock, paints the single frame it produces, returns it. */
  readonly advance: (ms: number) => Promise<string>
  /** Paints `frames` frames of `msPerFrame` each, returns the last one. */
  readonly tick: (frames: number, msPerFrame?: number) => Promise<string>
  /** Removes the section from the tree, which runs its `onCleanup`. */
  readonly unmount: () => Promise<void>
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
  joke?: (signal: AbortSignal) => Promise<string | undefined>
  sessionID?: string
  pendingForms?: readonly PendingForm[]
  /**
   * When false, the first `form.list` call returns `undefined`, so the section
   * has to call `sync` and read the list again.
   */
  formsReady?: boolean
  /**
   * State shared between mounts. Passing one is what a rebuilt sidebar does;
   * leaving it out gives every mount its own fresh duck.
   */
  states?: DuckStates
}

async function mount(options: MountOptions = {}): Promise<Harness> {
  const clock = new ManualClock()
  const handlers = new Map<string, (event: unknown) => void>()
  const [session, setSession] = createSignal(options.sessionID ?? SESSION)
  const forms = new Map<string, { id: string; sessionID: string }[]>()
  for (const form of options.pendingForms ?? []) {
    const sessionID = form.sessionID ?? session()
    const list = forms.get(sessionID) ?? []
    list.push({ id: form.id, sessionID })
    forms.set(sessionID, list)
  }
  let formsReady = options.formsReady ?? true
  let setRunning = (_value: boolean) => {}
  let activeTimers = 0

  const emit = (type: string, event: unknown) => handlers.get(type)?.(event)
  const removeForm = (id: string, sessionID: string) => {
    const list = forms.get(sessionID) ?? []
    forms.set(sessionID, list.filter((form) => form.id !== id))
  }
  const formCreated = (id: string, sessionID = session()) => {
    const list = forms.get(sessionID) ?? []
    if (!list.some((form) => form.id === id)) list.push({ id, sessionID })
    forms.set(sessionID, list)
    emit("form.created", { data: { form: { id, sessionID, title: "Question", fields: [] } } })
  }
  const formReplied = (id: string, sessionID = session()) => {
    removeForm(id, sessionID)
    emit("form.replied", { data: { id, sessionID, answer: {} } })
  }
  const formCancelled = (id: string, sessionID = session()) => {
    removeForm(id, sessionID)
    emit("form.cancelled", { data: { id, sessionID } })
  }

  const setup = await createTestRenderer({ width: options.width ?? PANEL_WIDTH, height: 12, clock })
  const [mounted, setMounted] = createSignal(true)
  await render(
    () => {
      const data = {
        on: (type: string, handler: (event: unknown) => void) => {
          handlers.set(type, handler)
          return () => handlers.delete(type)
        },
        session: {
          form: {
            list: (sessionID: string) => (formsReady ? (forms.get(sessionID) ?? []) : undefined),
            sync: async (_sessionID: string) => {
              formsReady = true
            },
          },
        },
      } as unknown as Data
      setRunning = (value: boolean) => {
        handlers.get("session.execution.started")?.({ data: { sessionID: session() } })
        if (!value) handlers.get("session.execution.succeeded")?.({ data: { sessionID: session() } })
      }
      // `Show` is created manually because Bun's JSX transform evaluates props
      // once: a getter is the only way to make the conditional reactive. It
      // gives the tests a real unmount path, which disposing the renderer does
      // not run under Bun's server build of Solid.
      return createComponent(Conditional, {
        keyed: false,
        get when() {
          return mounted()
        },
        get children() {
          return (_shown: boolean) =>
            // The section is created by hand for the same reason: the session
            // id has to be a getter, so the tests can switch the session the
            // way a host that re-renders the sidebar would.
            createComponent(Ducksay, {
              primary: PRIMARY,
              renderer: setup.renderer,
              swimSpeed: options.swimSpeed ?? DEFAULT_SWIM_SPEED,
              data,
              get sessionID() {
                return session()
              },
              isRunning: () => options.running === true,
              schedule: (tick: () => void, ms: number) => {
                activeTimers += 1
                const handle = clock.setInterval(tick, ms)
                return () => {
                  clock.clearInterval(handle)
                  activeTimers -= 1
                }
              },
              sprites: options.sprites,
              bubbleText: options.bubbleText,
              joke: options.joke,
              states: options.states,
            })
        },
      })
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
    setSession,
    emit,
    formCreated,
    formReplied,
    formCancelled,
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
    unmount: async () => {
      setMounted(false)
      await frame()
    },
    dispose: () => setup.dispose(),
  }
}

/**
 * Tears the section down and mounts a fresh one over the same state store,
 * which is what OpenCode does when it rebuilds the sidebar for another session
 * and then comes back.
 */
async function rebuild(previous: Harness, options: MountOptions): Promise<Harness> {
  await previous.unmount()
  await previous.dispose()
  return mount(options)
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

describe("rebuilding the section", () => {
  test("puts the duck back where it was after the sidebar is rebuilt", async () => {
    // Regression: OpenCode rebuilds the sidebar when the displayed session
    // changes, which used to send the duck back to the start on return.
    const states = createDuckStates()
    const harness = await mount({ running: true, states })
    const before = await harness.tick(5)
    const column = columnOf(before)
    const heading = facesRight(before)
    expect(column).toBeGreaterThan(0)

    const rebuilt = await rebuild(harness, { running: true, states })
    const after = await rebuilt.frame()

    expect(columnOf(after)).toBe(column)
    expect(facesRight(after)).toBe(heading)
    expect(after.split("\n").filter((row) => row.includes("~")))
      .toEqual(before.split("\n").filter((row) => row.includes("~")))
    await rebuilt.dispose()
  })

  test("keeps a waiting question over the same column across a rebuild", async () => {
    const states = createDuckStates()
    const harness = await mount({ running: true, states })
    await harness.advance(COLUMN_MS * 4)
    harness.formCreated("form-1")
    const frozen = await harness.frame()
    const column = columnOf(frozen)
    const heading = facesRight(frozen)
    const marker = questionMarker(frozen)
    expect(column).toBeGreaterThan(0)
    expect(marker).toBeDefined()

    const rebuilt = await rebuild(harness, {
      running: true,
      states,
      pendingForms: [{ id: "form-1" }],
    })
    const after = await rebuilt.frame()

    expect(columnOf(after)).toBe(column)
    expect(facesRight(after)).toBe(heading)
    expect(questionMarker(after)?.glyph).toBe("?")
    expect(questionMarker(after)?.column).toBe(column + (heading ? DUCK_WIDTH - 2 : 1))
    await rebuilt.dispose()
  })

  test("does not bring back a question answered before the rebuild", async () => {
    const states = createDuckStates()
    const harness = await mount({ running: true, states })
    await harness.advance(COLUMN_MS * 4)
    harness.formCreated("form-1")
    expect(questionMarker(await harness.frame())).toBeDefined()

    harness.formReplied("form-1")
    const closed = await harness.frame()
    expect(questionMarker(closed)).toBeUndefined()

    const rebuilt = await rebuild(harness, { running: true, states })
    expect(questionMarker(await rebuilt.frame())).toBeUndefined()
    await rebuilt.dispose()
  })

  test("keeps each session's place apart", async () => {
    const states = createDuckStates()
    const first = await mount({ running: true, states, sessionID: "ses_one" })
    const column = columnOf(await first.tick(5))
    expect(column).toBeGreaterThan(0)

    const second = await rebuild(first, { running: false, states, sessionID: "ses_two" })
    const frame = await second.frame()

    expect(columnOf(frame)).toBe(0)
    expect(facesRight(frame)).toBe(true)

    const back = await rebuild(second, { running: false, states, sessionID: "ses_one" })
    expect(columnOf(await back.frame())).toBe(column)
    await back.dispose()
  })

  test("keeps the bubble with the session that owns it", async () => {
    // Switching tabs must not carry the duck or its bubble into the next
    // session, and coming back must show the same place and the same bubble.
    const states = createDuckStates()
    const harness = await mount({ states, sessionID: "ses_one", bubbleText: "Quack-quack!" })
    harness.setRunning(true)
    await harness.advance(COLUMN_MS * 3)
    harness.setRunning(false)
    const before = await harness.tick(RIGHT_EDGE + 2)
    expect(before).toContain("Quack-quack!")
    const column = columnOf(before)
    const heading = facesRight(before)

    harness.setSession("ses_two")
    const other = await harness.frame()
    expect(columnOf(other)).toBe(0)
    expect(other).not.toContain("Quack-quack!")
    expect(other).not.toContain("╭")

    harness.setSession("ses_one")
    const after = await harness.frame()
    expect(columnOf(after)).toBe(column)
    expect(facesRight(after)).toBe(heading)
    expect(after).toContain("Quack-quack!")
    await harness.dispose()
  })

  test("keeps the default pace across a tab switch", async () => {
    const states = createDuckStates()
    const harness = await mount({ states, sessionID: "ses_one", running: true })
    await harness.tick(2)
    const before = columnOf(await harness.frame())

    harness.setSession("ses_two")
    await harness.frame()
    harness.setSession("ses_one")
    await harness.frame()

    const after = columnOf(await harness.advance(1000))
    expect(after - before).toBe(9)
    expect(harness.activeTimers()).toBe(1)
    await harness.dispose()
  })

  test("docks a session that went idle while another tab was shown", async () => {
    // The snapshot still says `swim`, but the turn ended while another tab was
    // visible. Returning must finish the dock instead of swimming on.
    const states = createDuckStates()
    const harness = await mount({ states, sessionID: "ses_one" })
    harness.setRunning(true)
    const column = columnOf(await harness.tick(3))
    expect(column).toBeGreaterThan(0)

    harness.setSession("ses_two")
    await harness.frame()
    harness.setSession("ses_one")
    const after = await harness.tick(RIGHT_EDGE + 2)

    expect(columnOf(after)).toBe(RIGHT_EDGE)
    expect(facesRight(after)).toBe(false)
    expect(after).toContain("╭")
    expect(harness.activeTimers()).toBe(0)
    await harness.dispose()
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

describe("question marker", () => {
  const rowOf = (frame: string, needle: string) =>
    frame.split("\n").findIndex((row) => row.includes(needle))

  /** The rows carrying water; the marker and duck never contain a tilde. */
  const waterRows = (frame: string) => frame.split("\n").filter((row) => row.includes("~"))

  /** Rests the duck against `wall`, returning the frame with its bubble. */
  async function restAt(wall: "left" | "right", options: MountOptions = {}) {
    const harness = await mount({ running: true, ...options })
    if (wall === "left") {
      await harness.tick(RIGHT_EDGE + 3)
    } else {
      await harness.advance(COLUMN_MS * 3)
    }
    harness.setRunning(false)
    const frame = await harness.tick(RIGHT_EDGE + 2)
    return { harness, frame }
  }

  /** Rests with a request that has not answered yet. */
  async function restWithJoke(
    joke: (signal: AbortSignal) => Promise<string | undefined>,
    options: MountOptions = {},
  ) {
    const harness = await mount({ running: true, joke, ...options })
    await harness.advance(COLUMN_MS * 3)
    harness.setRunning(false)
    let frame = ""
    for (let step = 0; step < (RIGHT_EDGE + 2) * 4; step += 1) {
      frame = await harness.advance(TICK_MS)
      if (frame.includes("╭")) break
    }
    return { harness, frame }
  }

  test("freezes at the first question with ? over the bracket", async () => {
    const harness = await mount()
    harness.formCreated("form-1")
    const frame = await harness.frame()

    const marker = questionMarker(frame)
    expect(marker?.glyph).toBe("?")
    expect(marker?.column).toBe(expectedMarkerColumn(frame))
    expect(marker?.row).toBe(rowOf(frame, HEAD) - 1)
    expect(frame).not.toContain("╭")
    expect(harness.activeTimers()).toBe(1)

    await harness.dispose()
  })

  test("sits over the opening bracket of a left-facing duck", async () => {
    const { harness, frame: resting } = await restAt("right")
    expect(resting).toContain("╭")
    expect(facesRight(resting)).toBe(false)

    harness.formCreated("form-1")
    const frame = await harness.frame()
    const marker = questionMarker(frame)

    expect(marker?.glyph).toBe("?")
    expect(marker?.column).toBe(columnOf(frame) + 1)
    expect(marker?.column).toBe(expectedMarkerColumn(frame))
    expect(frame).toContain(FACING_LEFT)
    expect(frame).not.toContain(FACING_LEFT_OPEN)
    expect(frame).not.toContain("╭")
    await harness.dispose()
  })

  test("sits over the closing bracket of a right-facing duck", async () => {
    const { harness } = await restAt("left")
    harness.formCreated("form-1")
    const frame = await harness.frame()
    const marker = questionMarker(frame)

    expect(facesRight(frame)).toBe(true)
    expect(marker?.column).toBe(columnOf(frame) + DUCK_WIDTH - 2)
    expect(marker?.column).toBe(expectedMarkerColumn(frame))
    expect(frame).not.toContain("╭")
    await harness.dispose()
  })

  test("shows the marker before the first swim and at zero speed", async () => {
    const harness = await mount({ swimSpeed: 0 })
    harness.formCreated("form-1")
    const frame = await harness.frame()

    expect(questionMarker(frame)?.glyph).toBe("?")
    expect(frame).not.toContain("╭")
    expect(columnOf(frame)).toBe(0)
    expect(harness.activeTimers()).toBe(1)

    const next = await harness.advance(QUESTION_FRAME_MS * 2)
    expect(questionMarker(next)?.glyph).toBe("!")
    expect(columnOf(next)).toBe(0)
    await harness.dispose()
  })

  test("cycles ? -> ? -> ! -> ⸮ -> ⸮ -> ! without moving its column", async () => {
    const harness = await mount()
    harness.formCreated("form-1")

    const frames = [await harness.frame()]
    const glyphs = [questionMarker(frames[0]!)?.glyph]
    for (let index = 0; index < 6; index += 1) {
      frames.push(await harness.advance(QUESTION_FRAME_MS))
      glyphs.push(questionMarker(frames[frames.length - 1]!)?.glyph)
    }

    expect(glyphs).toEqual(["?", "?", "!", "⸮", "⸮", "!", "?"])
    const columns = frames.map((frame) => questionMarker(frame)!.column)
    expect(new Set(columns)).toEqual(new Set([columns[0]]))
    await harness.dispose()
  })

  test("keeps the cycle running while a second form is open", async () => {
    const harness = await mount()
    harness.formCreated("form-1")
    await harness.advance(QUESTION_FRAME_MS * 2)
    const before = await harness.frame()
    expect(questionMarker(before)?.glyph).toBe("!")

    harness.formCreated("form-2")
    const still = await harness.frame()
    expect(questionMarker(still)?.glyph).toBe("!")
    expect(questionMarker(still)?.column).toBe(questionMarker(before)?.column)

    const next = await harness.advance(QUESTION_FRAME_MS)
    expect(questionMarker(next)?.glyph).toBe("⸮")

    harness.formReplied("form-1")
    expect(questionMarker(await harness.frame())?.glyph).toBe("⸮")
    expect(harness.activeTimers()).toBe(1)

    harness.formCancelled("form-2")
    expect(questionMarker(await harness.frame())).toBeUndefined()
    expect(harness.activeTimers()).toBe(0)
    await harness.dispose()
  })

  test("ignores forms of other sessions, global and permission requests", async () => {
    const harness = await mount({ pendingForms: [{ id: "own" }] })
    harness.formReplied("own")
    await harness.frame()

    harness.formCreated("other", "ses_other")
    harness.formCreated("global", "global")
    harness.emit("permission.asked", { data: { sessionID: SESSION } })

    const frame = await harness.frame()
    expect(questionMarker(frame)).toBeUndefined()
    expect(harness.activeTimers()).toBe(0)

    harness.formCreated("own")
    expect(questionMarker(await harness.frame())?.glyph).toBe("?")
    harness.formReplied("own")
    expect(questionMarker(await harness.frame())).toBeUndefined()
    await harness.dispose()
  })

  test("removes the marker on reply and on cancellation", async () => {
    for (const close of ["replied", "cancelled"] as const) {
      const harness = await mount()
      harness.formCreated("form-1")
      expect(questionMarker(await harness.frame())?.glyph).toBe("?")

      if (close === "replied") harness.formReplied("form-1")
      else harness.formCancelled("form-1")

      expect(questionMarker(await harness.frame())).toBeUndefined()
      expect(harness.activeTimers()).toBe(0)
      await harness.dispose()
    }
  })

  test("a cancelled form leaves the duck exactly where a replied one does", async () => {
    const frames: string[] = []
    for (const close of ["replied", "cancelled"] as const) {
      const harness = await mount({ running: true })
      await harness.advance(COLUMN_MS * 4)
      harness.formCreated("form-1")
      const frozen = await harness.frame()
      expect(questionMarker(frozen)).toBeDefined()

      if (close === "replied") harness.formReplied("form-1")
      else harness.formCancelled("form-1")
      const resumed = await harness.frame()

      expect(questionMarker(resumed)).toBeUndefined()
      expect(columnOf(resumed)).toBe(columnOf(frozen))
      expect(facesRight(resumed)).toBe(facesRight(frozen))
      frames.push(resumed.split("\n").slice(5).join("\n"))
      await harness.dispose()
    }

    // The duck's own rows are the same after an answer and after a cancel.
    expect(frames[1]).toBe(frames[0])
  })

  test("reads forms that were already open when the section mounted", async () => {
    const harness = await mount({ pendingForms: [{ id: "form-1" }] })
    const frame = await harness.frame()

    expect(questionMarker(frame)?.glyph).toBe("?")
    expect(harness.activeTimers()).toBe(1)
    await harness.dispose()
  })

  test("syncs and reads again when the form cache has no list yet", async () => {
    const harness = await mount({ pendingForms: [{ id: "form-1" }], formsReady: false })
    await flushEffects()
    const frame = await harness.frame()

    expect(questionMarker(frame)?.glyph).toBe("?")
    expect(harness.activeTimers()).toBe(1)
    await harness.dispose()
  })

  test("does not carry another session's forms into the mounted section", async () => {
    const harness = await mount({ sessionID: "ses_other", pendingForms: [{ id: "form-1" }] })
    const frame = await harness.frame()
    expect(questionMarker(frame)?.glyph).toBe("?")

    harness.formReplied("form-1", "ses_other")
    expect(questionMarker(await harness.frame())).toBeUndefined()

    // A form of the previous session id must not freeze this one.
    harness.formCreated("form-old", SESSION)
    expect(questionMarker(await harness.frame())).toBeUndefined()
    await harness.dispose()
  })

  test("rebuilds the form set when the displayed session changes", async () => {
    const harness = await mount({ pendingForms: [{ id: "form-1" }] })
    expect(questionMarker(await harness.frame())?.glyph).toBe("?")

    // The new session has no form of its own, so the marker goes away even
    // though the old session's form is still open.
    harness.setSession("ses_other")
    await flushEffects()
    expect(questionMarker(await harness.frame())).toBeUndefined()

    // A form of the new session freezes the duck, and the old session's form
    // is ignored again.
    harness.formCreated("form-2", "ses_other")
    expect(questionMarker(await harness.frame())?.glyph).toBe("?")
    harness.formReplied("form-1", SESSION)
    expect(questionMarker(await harness.frame())?.glyph).toBe("?")
    await harness.dispose()
  })

  test("freezes a swimming duck's column, heading and water", async () => {
    const harness = await mount({ running: true })
    const before = await harness.advance(COLUMN_MS * 4)
    const column = columnOf(before)
    const heading = facesRight(before)

    harness.formCreated("form-1")
    const frozen = await harness.frame()
    const after = await harness.advance(1000)

    expect(questionMarker(frozen)).toBeDefined()
    expect(columnOf(after)).toBe(column)
    expect(facesRight(after)).toBe(heading)
    expect(waterRows(after)).toEqual(waterRows(frozen))
    expect(columnOf(after)).toBeGreaterThan(0)
    await harness.dispose()
  })

  test("freezes a docking duck and resumes the dock after the answer", async () => {
    const harness = await mount({ running: true })
    await harness.advance(COLUMN_MS * 3)
    harness.setRunning(false)
    const docking = await harness.advance(TICK_MS * 3)
    const column = columnOf(docking)
    const heading = facesRight(docking)

    harness.formCreated("form-1")
    const frozen = await harness.frame()
    expect(questionMarker(frozen)).toBeDefined()
    expect(columnOf(await harness.advance(1000))).toBe(column)
    expect(facesRight(await harness.frame())).toBe(heading)

    harness.formReplied("form-1")
    // One column plus one tick: the default 100 ms column interval is longer
    // than the three 33 ms ticks that make up 99 ms.
    const resumed = await harness.advance(COLUMN_MS + TICK_MS)
    expect(columnOf(resumed)).not.toBe(column)
    await harness.dispose()
  })

  test("pauses the waiting dots and resumes from the same frame", async () => {
    const joke = () => new Promise<string | undefined>(() => {})
    const { harness, frame: resting } = await restWithJoke(joke)
    const dots = resting.match(/Quack\.*/)?.[0]
    expect(dots).toBeDefined()
    expect(harness.activeTimers()).toBe(1)

    harness.formCreated("form-1")
    const paused = await harness.advance(1000)
    expect(paused).not.toContain("Quack")
    expect(questionMarker(paused)).toBeDefined()
    expect(harness.activeTimers()).toBe(1)

    harness.formReplied("form-1")
    const resumed = await harness.frame()
    expect(resumed).toContain(dots!)
    expect(resumed).toContain("╭")
    await harness.dispose()
  })

  test("pauses typing without losing the word already on screen", async () => {
    const joke = async () => "One two three"
    const { harness, frame } = await restWithJoke(joke)
    expect(frame).toContain("One")
    expect(frame).not.toContain("two")

    harness.formCreated("form-1")
    const paused = await harness.advance(WORD_FRAME_MS * 4)
    expect(paused).not.toContain("╭")
    expect(paused).not.toContain("One")
    expect(questionMarker(paused)).toBeDefined()

    harness.formReplied("form-1")
    const resumed = await harness.frame()
    expect(resumed).toContain("One")
    expect(resumed).not.toContain("two")

    const next = await harness.advance(WORD_FRAME_MS)
    expect(next).toContain("One two")
    await harness.dispose()
  })

  test("draws the marker in the art's colour and keeps the section's height", async () => {
    const harness = await mount()
    const before = await harness.frame()
    const height = before.split("\n").length
    const head = rowOf(before, HEAD)

    harness.formCreated("form-1")
    await harness.frame()
    const spans = harness.spans()
    const frame = await harness.frame()
    const marker = questionMarker(frame)!

    const colourOf = (needle: string) => {
      for (const line of spans.lines) {
        for (const span of line.spans) {
          if (span.text.includes(needle)) return span.fg
        }
      }
      return undefined
    }
    const art = colourOf(FACING_RIGHT)
    const question = colourOf(marker.glyph)
    expect(art).toBeDefined()
    expect(question).toBeDefined()
    expect(question!.equals(art!)).toBe(true)
    expect(frame.split("\n").length).toBe(height)
    expect(rowOf(frame, HEAD)).toBe(head)
    expect(marker.row).toBe(head - 1)
    await harness.dispose()
  })

  test("keeps only the marker timer while a form waits", async () => {
    const harness = await mount({ running: true })
    await harness.advance(COLUMN_MS * 2)
    expect(harness.activeTimers()).toBe(1)

    harness.formCreated("form-1")
    const frozen = await harness.frame()
    expect(questionMarker(frozen)).toBeDefined()
    // The swim heartbeat is gone; the marker's timer is the only one left.
    expect(harness.activeTimers()).toBe(1)

    const next = await harness.advance(QUESTION_FRAME_MS * 2)
    expect(questionMarker(next)?.glyph).toBe("!")
    expect(harness.activeTimers()).toBe(1)
    await harness.dispose()
  })

  test("drops every timer when the section is unmounted during a question", async () => {
    const harness = await mount({ running: true })
    await harness.advance(COLUMN_MS * 2)
    harness.formCreated("form-1")
    await harness.frame()
    expect(harness.activeTimers()).toBe(1)

    await harness.unmount()
    expect(harness.activeTimers()).toBe(0)
    await harness.dispose()
  })

  test("does not throw in a lane narrower than the art", async () => {
    const harness = await mount({ running: true, width: DUCK_WIDTH - 2 })
    await harness.advance(COLUMN_MS * 3)
    const swimTimers = harness.activeTimers()
    harness.formCreated("form-1")

    const frame = await harness.frame()
    expect(frame).toContain(DUCK_RIGHT[1].slice(0, DUCK_WIDTH - 2))
    expect(harness.activeTimers()).toBe(1)

    const later = await harness.advance(1000)
    expect(later).toContain(DUCK_RIGHT[1].slice(0, DUCK_WIDTH - 2))
    harness.formReplied("form-1")
    await harness.frame()
    expect(questionMarker(await harness.frame())).toBeUndefined()
    expect(harness.activeTimers()).toBe(swimTimers)
    await harness.dispose()
  })
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
    const expected = Math.floor(waveSpeed(DEFAULT_SWIM_SPEED, RIGHT_EDGE) * ticks * (TICK_MS / 1000))
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

describe("generated joke", () => {
  interface PendingJoke {
    readonly signal: AbortSignal
    resolve: (value: string | undefined) => void
    reject: (error: Error) => void
  }

  function controlledJoke() {
    const calls: PendingJoke[] = []
    const joke = (signal: AbortSignal) =>
      new Promise<string | undefined>((resolve, reject) => {
        calls.push({ signal, resolve, reject })
      })
    return { joke, calls }
  }

  /** Lets the request promise, the signal update and the repaint effect run. */
  async function settle() {
    for (let index = 0; index < 8; index += 1) await Promise.resolve()
  }

  async function dockWithJoke(
    joke: (signal: AbortSignal) => Promise<string | undefined>,
    options: MountOptions = {},
  ) {
    const harness = await mount({ running: true, joke, ...options })
    await harness.advance(COLUMN_MS * 3)
    harness.setRunning(false)
    const frame = await harness.tick(RIGHT_EDGE + 2)
    return { harness, frame }
  }

  /**
   * Docks at the right wall and stops the clock on the first frame that has
   * the bubble. A whole-tick jump would already be several frames into the
   * waiting cycle, so the step is `TICK_MS` and the loop breaks at the bubble.
   */
  async function restWithJoke(
    joke: (signal: AbortSignal) => Promise<string | undefined>,
    options: MountOptions = {},
  ) {
    const harness = await mount({ running: true, joke, ...options })
    await harness.advance(COLUMN_MS * 3)
    harness.setRunning(false)
    let frame = ""
    for (let step = 0; step < (RIGHT_EDGE + 2) * 4; step += 1) {
      frame = await harness.advance(TICK_MS)
      if (frame.includes("╭")) break
    }
    return { harness, frame }
  }

  test("shows the waiting dots and a closed beak while the joke is pending", async () => {
    const pending = controlledJoke()
    const { harness, frame } = await restWithJoke(pending.joke)

    expect(frame).toContain("╭")
    expect(frame).toContain("Quack.")
    expect(frame).not.toContain("Quack..")
    expect(frame).toContain(FACING_LEFT)
    expect(frame).not.toContain(FACING_LEFT_OPEN)
    expect(pending.calls).toHaveLength(1)
    expect(harness.activeTimers()).toBe(1)

    await harness.dispose()
  })

  test("grows the ellipsis one dot at a time and holds the third frame", async () => {
    const pending = controlledJoke()
    const { harness, frame } = await restWithJoke(pending.joke)
    expect(frame).toContain("Quack.")
    expect(frame).not.toContain("Quack..")

    const two = await harness.advance(THINK_FRAME_MS)
    expect(two).toContain("Quack..")
    expect(two).not.toContain("Quack...")

    const three = await harness.advance(THINK_FRAME_MS)
    expect(three).toContain("Quack...")

    // The triple is held for a second step, so the loop back to one dot reads
    // as a cycle rather than a flicker.
    const held = await harness.advance(THINK_FRAME_MS)
    expect(held).toBe(three)

    const again = await harness.advance(THINK_FRAME_MS)
    expect(again).toContain("Quack.")
    expect(again).not.toContain("Quack..")

    await harness.dispose()
  })

  test("stops the waiting timer when the answer is fully shown", async () => {
    const pending = controlledJoke()
    const { harness } = await restWithJoke(pending.joke)
    expect(harness.activeTimers()).toBe(1)

    pending.calls[0]!.resolve("One joke")
    await settle()
    await harness.advance(WORD_FRAME_MS * 3)

    expect(await harness.frame()).toContain("One joke")
    expect(harness.activeTimers()).toBe(0)
    await harness.dispose()
  })

  test("keeps the finished joke and the rest pose across a rebuild", async () => {
    const states = createDuckStates()
    const pending = controlledJoke()
    const { harness } = await restWithJoke(pending.joke, { states })
    pending.calls[0]!.resolve("One joke")
    await settle()
    await harness.advance(WORD_FRAME_MS * 3)
    const before = await harness.frame()
    expect(before).toContain("One joke")
    expect(before).not.toContain("Quack.")

    const rebuilt = await rebuild(harness, { running: false, states, joke: pending.joke })
    const after = await rebuilt.frame()

    expect(after).toContain("One joke")
    expect(after).not.toContain("Quack.")
    expect(after.includes(FACING_LEFT_OPEN) || after.includes(FACING_RIGHT_OPEN)).toBe(true)
    await rebuilt.dispose()
  })

  test("asks again when a rebuild interrupts the request", async () => {
    const states = createDuckStates()
    const pending = controlledJoke()
    const { harness } = await restWithJoke(pending.joke, { states })
    expect(pending.calls).toHaveLength(1)

    const rebuilt = await rebuild(harness, { running: false, states, joke: pending.joke })

    // The old request is cancelled with the section, so the new one has to ask
    // again; otherwise the bubble would wait for an answer that never comes.
    expect(pending.calls[0]!.signal.aborted).toBe(true)
    expect(pending.calls).toHaveLength(2)
    pending.calls[1]!.resolve("Rebuilt joke")
    await settle()
    const after = await rebuilt.advance(WORD_FRAME_MS * 3)
    expect(after).toContain("Rebuilt joke")
    expect(after).toContain("╭")
    await rebuilt.dispose()
  })

  test("keeps the waiting dots frame across a rebuild", async () => {
    const states = createDuckStates()
    const pending = controlledJoke()
    const { harness } = await restWithJoke(pending.joke, { states })
    const two = await harness.advance(THINK_FRAME_MS)
    expect(two).toContain("Quack..")
    expect(two).not.toContain("Quack...")

    const rebuilt = await rebuild(harness, { running: false, states, joke: pending.joke })
    const after = await rebuilt.frame()

    expect(after).toContain("Quack..")
    expect(after).not.toContain("Quack...")
    pending.calls[1]!.resolve("Later joke")
    await settle()
    await rebuilt.dispose()
  })

  test("drops the waiting bubble when the duck swims again", async () => {
    const pending = controlledJoke()
    const { harness } = await restWithJoke(pending.joke)

    harness.setRunning(true)
    const swimming = await harness.advance(TICK_MS)

    expect(swimming).not.toContain("╭")
    expect(swimming).toContain(FACING_LEFT)
    expect(swimming).not.toContain(FACING_LEFT_OPEN)
    // Only the swim heartbeat is left; the waiting timer is gone with the rest.
    expect(harness.activeTimers()).toBe(1)
    await harness.dispose()
  })

  describe("typing", () => {
    /** A joke short enough to stay on one 25-column line. */
    const JOKE = "One two three four five"
    const WORDS = ["One", "One two", "One two three", "One two three four", JOKE]

    /** Rests, then answers, and returns the harness with the first word shown. */
    async function startTyping(text = JOKE) {
      const pending = controlledJoke()
      const { harness, frame } = await restWithJoke(pending.joke)
      expect(frame).toContain("Quack")
      pending.calls[0]!.resolve(text)
      await settle()
      return harness
    }

    /** Captures the first frame and one frame per word after it. */
    async function framesPerWord(harness: Harness, words: number) {
      const frames = [await harness.frame()]
      for (let index = 1; index < words; index += 1) {
        await harness.advance(WORD_FRAME_MS)
        frames.push(await harness.frame())
      }
      return frames
    }

    test("puts the first word where the waiting dots were", async () => {
      const harness = await startTyping()
      const first = await harness.frame()

      expect(first).toContain("One")
      expect(first).not.toContain("two")
      expect(first).not.toContain("Quack")
      expect(first).toContain(FACING_LEFT_OPEN)
      expect(first).not.toContain(FACING_LEFT)
      await harness.dispose()
    })

    test("reveals whole words in order and leaves the full text", async () => {
      const harness = await startTyping()
      const frames = await framesPerWord(harness, WORDS.length)

      for (const [index, text] of WORDS.entries()) {
        expect(frames[index]).toContain(text)
        const next = WORDS[index + 1]
        if (next !== undefined) expect(frames[index]).not.toContain(next)
      }
      expect(harness.activeTimers()).toBe(0)
      // A finished joke is not repainted by a timer any more.
      expect(await harness.tick(10)).toBe(frames[WORDS.length - 1])
      await harness.dispose()
    })

    test("flaps the beak every two words and opens it on the last", async () => {
      const harness = await startTyping()
      const frames = await framesPerWord(harness, WORDS.length)

      expect(frames[0]).toContain(FACING_LEFT_OPEN)
      expect(frames[1]).toContain(FACING_LEFT_OPEN)
      expect(frames[2]).toContain(FACING_LEFT)
      expect(frames[2]).not.toContain(FACING_LEFT_OPEN)
      expect(frames[3]).toContain(FACING_LEFT)
      expect(frames[3]).not.toContain(FACING_LEFT_OPEN)
      expect(frames[4]).toContain(FACING_LEFT_OPEN)
      expect(frames[4]).not.toContain(FACING_LEFT)
      await harness.dispose()
    })

    test("opens the beak on the last word even when the cadence would close it", async () => {
      const harness = await startTyping("One two three")
      await harness.advance(WORD_FRAME_MS * 3)
      const done = await harness.frame()

      expect(done).toContain("One two three")
      expect(done).toContain(FACING_LEFT_OPEN)
      expect(done).not.toContain(FACING_LEFT)
      expect(harness.activeTimers()).toBe(0)
      await harness.dispose()
    })

    test("grows to five lines without moving the duck and drops the tail", async () => {
      // One full-width word per line, so the joke fills exactly five lines.
      const joke = Array.from({ length: BUBBLE_MAX_LINES }, (_, index) =>
        String.fromCharCode(97 + index).repeat(BUBBLE_TEXT_WIDTH),
      ).join(" ")
      const harness = await startTyping(joke)
      const first = await harness.frame()
      const headRow = first.split("\n").findIndex((row) => row.includes(HEAD))
      expect(headRow).toBeGreaterThan(0)
      // A short bubble hangs its tail on the beak row, below the bottom border.
      expect(
        first
          .split("\n")
          .filter((row) => (row.includes("╯") || row.includes("╰")) && !row.includes("─")),
      ).toHaveLength(1)

      await harness.advance(WORD_FRAME_MS * (BUBBLE_MAX_LINES + 1))
      const done = await harness.frame()
      const rows = done.split("\n")

      // The bubble grows up, not down: the duck keeps its rows.
      expect(rows.findIndex((row) => row.includes(HEAD))).toBe(headRow)
      const beak = rows.findIndex((row) => row.includes(FACING_LEFT_OPEN))
      expect(beak).toBe(headRow + 1)
      expect(rows[beak]).toContain("╰")
      expect(rows[beak]).toContain("╯")
      expect(rows[beak]).toContain("─")
      // At five lines the bottom border is on the beak row, so no lone tail is
      // left anywhere.
      expect(
        rows.filter((row) => (row.includes("╯") || row.includes("╰")) && !row.includes("─")),
      ).toHaveLength(0)
      expect(harness.activeTimers()).toBe(0)
      await harness.dispose()
    })

    test("holds a word with punctuation for two steps", async () => {
      const harness = await startTyping("Wait, now go")
      const first = await harness.frame()
      expect(first).toContain("Wait,")
      expect(first).not.toContain("now")

      const held = await harness.advance(WORD_FRAME_MS)
      expect(held).toBe(first)

      const next = await harness.advance(WORD_FRAME_MS)
      expect(next).toContain("Wait, now")
      await harness.dispose()
    })

    test("starts typing at once when the answer came before the duck stopped", async () => {
      const harness = await mount({ running: true, joke: async () => JOKE })
      await harness.advance(COLUMN_MS * 3)
      harness.setRunning(false)

      let frame = ""
      for (let step = 0; step < (RIGHT_EDGE + 2) * 4; step += 1) {
        frame = await harness.advance(TICK_MS)
        if (frame.includes("╭")) break
      }

      expect(frame).not.toContain("Quack")
      expect(frame).toContain("One")
      expect(frame).not.toContain("two")
      expect(frame).toContain(FACING_LEFT_OPEN)
      await harness.dispose()
    })

    test("keeps the timer while typing and drops it when the duck swims away", async () => {
      const harness = await startTyping()
      await harness.advance(WORD_FRAME_MS)
      expect(harness.activeTimers()).toBe(1)

      harness.setRunning(true)
      const swimming = await harness.advance(TICK_MS)
      expect(swimming).not.toContain("╭")
      expect(swimming).toContain(FACING_LEFT)
      expect(swimming).not.toContain(FACING_LEFT_OPEN)
      // The swim heartbeat is the only one left.
      expect(harness.activeTimers()).toBe(1)
      await harness.dispose()
    })

    test("stops the typing timer when the section is unmounted", async () => {
      const harness = await startTyping()
      await harness.advance(WORD_FRAME_MS)
      expect(harness.activeTimers()).toBe(1)

      await harness.unmount()
      expect(harness.activeTimers()).toBe(0)
      await harness.dispose()
    })
  })

  test("shows a successful joke and opens the beak", async () => {
    const { harness } = await dockWithJoke(async () => "The parser quacks back")
    await settle()
    // The answer may have landed while docking; give every word its turn.
    await harness.advance(WORD_FRAME_MS * 4)
    const shown = await harness.frame()

    expect(shown).toContain("The parser quacks back")
    expect(shown).toContain(FACING_LEFT_OPEN)
    expect(shown).not.toContain(FACING_LEFT)
    expect(shown).not.toContain("Quack-quack!")
    await harness.dispose()
  })

  test("falls back to Quack-quack for an error, an empty answer or a timeout", async () => {
    const answers = [
      async () => {
        throw new Error("provider is down")
      },
      async () => "",
      async () => undefined,
    ]

    for (const answer of answers) {
      const { harness } = await dockWithJoke(answer)
      await settle()
      const shown = await harness.frame()

      expect(shown).toContain("Quack-quack!")
      expect(shown).toContain(FACING_LEFT_OPEN)
      expect(shown).not.toContain(FACING_LEFT)
      await harness.dispose()
    }
  })

  test("does not request a joke before the duck has swum", async () => {
    let calls = 0
    const harness = await mount({
      running: false,
      joke: async () => {
        calls += 1
        return "late"
      },
    })

    await harness.frame()
    await harness.tick(5)

    expect(calls).toBe(0)
    await harness.dispose()
  })

  test("does not request a joke when the duck cannot swim", async () => {
    for (const options of [{ swimSpeed: 0 }, { width: DUCK_WIDTH - 2 }] as const) {
      let calls = 0
      const harness = await mount({
        running: true,
        ...options,
        joke: async () => {
          calls += 1
          return "late"
        },
      })
      await harness.tick(5)
      harness.setRunning(false)
      await harness.tick(RIGHT_EDGE + 2)

      expect(calls).toBe(0)
      await harness.dispose()
    }
  })

  test("asks exactly once per turn, not once more when the duck reaches rest", async () => {
    const pending = controlledJoke()
    const { harness } = await dockWithJoke(pending.joke)

    expect(pending.calls).toHaveLength(1)
    await harness.tick(10)
    expect(pending.calls).toHaveLength(1)

    pending.calls[0]!.resolve("One joke")
    await settle()
    await harness.frame()
    expect(pending.calls).toHaveLength(1)
    await harness.dispose()
  })

  test("does not cancel a request already in flight when a form appears", async () => {
    const pending = controlledJoke()
    const { harness } = await restWithJoke(pending.joke)
    expect(pending.calls).toHaveLength(1)
    const call = pending.calls[0]!

    harness.formCreated("form-1")
    await harness.advance(THINK_FRAME_MS * 3)
    expect(call.signal.aborted).toBe(false)
    expect(pending.calls).toHaveLength(1)

    call.resolve("One joke")
    await settle()
    const hidden = await harness.frame()
    expect(hidden).not.toContain("╭")
    expect(hidden).not.toContain("One joke")

    harness.formReplied("form-1")
    const shown = await harness.frame()
    expect(shown).toContain("╭")
    expect(shown).toContain("One")
    expect(pending.calls).toHaveLength(1)
    await harness.dispose()
  })

  test("defers the joke of a turn that ended while a form was waiting", async () => {
    const pending = controlledJoke()
    const harness = await mount({ running: true, joke: pending.joke })
    await harness.advance(COLUMN_MS * 3)

    harness.formCreated("form-1")
    harness.setRunning(false)
    await harness.tick(RIGHT_EDGE + 2)
    expect(pending.calls).toHaveLength(0)

    harness.formReplied("form-1")
    await settle()
    await harness.frame()
    expect(pending.calls).toHaveLength(1)

    pending.calls[0]!.resolve("Deferred joke")
    await settle()
    const frame = await harness.tick(RIGHT_EDGE + 2)
    expect(frame).toContain("Deferred")
    await harness.dispose()
  })

  test("keeps the deferred joke until the last form and the next turn's end", async () => {
    const pending = controlledJoke()
    const harness = await mount({ running: true, joke: pending.joke })
    await harness.advance(COLUMN_MS * 3)

    harness.formCreated("form-1")
    harness.formCreated("form-2")
    harness.setRunning(false)
    await settle()
    expect(pending.calls).toHaveLength(0)

    harness.formReplied("form-1")
    await settle()
    expect(pending.calls).toHaveLength(0)

    // The session starts another turn before the second form closes. The
    // deferred request must wait for that turn to end as well.
    harness.setRunning(true)
    harness.formReplied("form-2")
    await settle()
    expect(pending.calls).toHaveLength(0)

    harness.setRunning(false)
    await settle()
    expect(pending.calls).toHaveLength(1)
    await harness.dispose()
  })

  test("a new turn aborts the pending request and ignores its late answer", async () => {
    const pending = controlledJoke()
    const { harness } = await dockWithJoke(pending.joke)
    expect(pending.calls).toHaveLength(1)
    const first = pending.calls[0]!

    harness.setRunning(true)
    await settle()
    expect(first.signal.aborted).toBe(true)

    first.resolve("late joke")
    await settle()
    const swimming = await harness.frame()
    expect(swimming).not.toContain("late joke")
    expect(swimming).not.toContain("╭")

    harness.setRunning(false)
    const docked = await harness.tick(RIGHT_EDGE + 2)
    expect(pending.calls).toHaveLength(2)
    expect(docked).not.toContain("late joke")
    // The new turn asks again, so the rest shows the waiting dots, not the old
    // joke and not a hidden bubble.
    expect(docked).toContain("╭")
    expect(docked).toContain("Quack")
    expect(docked).not.toContain(FACING_RIGHT_OPEN)

    pending.calls[1]!.resolve("second joke")
    await settle()
    await harness.advance(WORD_FRAME_MS * 3)
    const shown = await harness.frame()
    expect(shown).toContain("second joke")
    expect(shown).not.toContain("late joke")
    expect(shown.includes(FACING_LEFT_OPEN) || shown.includes(FACING_RIGHT_OPEN)).toBe(true)
    expect(shown).not.toContain("Quack-quack!")
    await harness.dispose()
  })

  test("unmounting aborts the pending request and stops the waiting timer", async () => {
    const pending = controlledJoke()
    const { harness } = await dockWithJoke(pending.joke)
    const signal = pending.calls[0]!.signal

    expect(signal.aborted).toBe(false)
    expect(harness.activeTimers()).toBe(1)
    await harness.unmount()
    expect(signal.aborted).toBe(true)
    expect(harness.activeTimers()).toBe(0)
    await harness.dispose()
  })
})
