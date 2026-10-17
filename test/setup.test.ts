import { describe, expect, test } from "bun:test"
import { render } from "@opentui/solid"
import { ManualClock, createTestRenderer } from "@opentui/core/testing"
import { RGBA } from "@opentui/core"
import type { CliRenderer } from "@opentui/core"
import type { Context } from "@opencode/plugin/tui/context"
import { DUCK_LEFT, DUCK_RIGHT, DUCK_WIDTH } from "../src/duck.ts"
import plugin from "../src/tui.tsx"

/** `SESSION_SIDEBAR_WIDTH` from OpenCode's session sidebar. */
const PANEL_WIDTH = 42

/** Where the duck can get to: the lane minus the art. */
const RIGHT_EDGE = PANEL_WIDTH - DUCK_WIDTH

/** One column at the default speed of 12 columns per second. */
const COLUMN_MS = 1000 / 12

const SESSION = "ses_duck"
const OTHER_SESSION = "ses_other"

/** A body line that starts at column 0 in both sprites, so its index is the duck's column. */
const FACING_RIGHT = DUCK_RIGHT[1]
const FACING_LEFT = DUCK_LEFT[1]

/** Both execution events carry the session and nothing else the section looks at. */
const forSession = { data: { sessionID: SESSION } }
const forOtherSession = { data: { sessionID: OTHER_SESSION } }

/** The column the duck is drawn at, read back from a captured frame. */
function columnOf(frame: string): number {
  const rows = frame.split("\n").filter((row) => row.includes(FACING_RIGHT) || row.includes(FACING_LEFT))
  expect(rows).toHaveLength(1)
  const marker = rows[0].includes(FACING_RIGHT) ? FACING_RIGHT : FACING_LEFT
  return rows[0].indexOf(marker)
}

interface Fake {
  readonly context: Context
  readonly claims: Record<string, unknown>[]
  /** Fires a captured `data.on` handler. */
  readonly emit: (type: string, event: unknown) => void
  readonly unsubscribed: () => number
  /** Event types anything has subscribed to. */
  readonly subscribed: () => string[]
  /** Session statuses `data.session.status` should answer with. */
  readonly statuses: Map<string, "idle" | "running">
}

function fake(options: { renderer?: CliRenderer; options?: Record<string, unknown> } = {}): Fake {
  const claims: Record<string, unknown>[] = []
  const handlers = new Map<string, (event: any) => void>()
  const unsubscribes = new Map<string, () => void>()
  const statuses = new Map<string, "idle" | "running">()

  const context = {
    options: options.options ?? {},
    theme: { text: { base: RGBA.fromHex("#e5e5e5") } },
    renderer: options.renderer,
    data: {
      on: (type: string, handler: (event: any) => void) => {
        handlers.set(type, handler)
        const unsubscribe = () => unsubscribes.set(type, unsubscribe)
        unsubscribes.set(type, unsubscribe)
        return unsubscribe
      },
      session: {
        status: (sessionID: string) => statuses.get(sessionID) ?? "idle",
      },
    },
    ui: {
      slot: (claim: Record<string, unknown>) => {
        claims.push(claim)
        return () => {}
      },
    },
  }

  return {
    context: context as unknown as Context,
    claims,
    emit: (type, event) => handlers.get(type)?.(event),
    unsubscribed: () => [...unsubscribes.values()].filter((stop) => stop()).length,
    subscribed: () => [...handlers.keys()],
    statuses,
  }
}

type TimerGlobals = { setInterval: typeof setInterval; clearInterval: typeof clearInterval }

/**
 * Runs the plugin's own timer on a manual clock.
 *
 * The section takes the global `setInterval` unless a `schedule` prop says
 * otherwise, and the slot's render cannot pass one: these tests mount the
 * plugin's claim, not the component. Swapping the global timers for the clock
 * for the duration of a test is what lets the swim be stepped without waiting
 * for real time.
 */
function useClockAsGlobalTimers(clock: ManualClock): () => void {
  const globals = globalThis as unknown as TimerGlobals
  const saved = { setInterval: globals.setInterval, clearInterval: globals.clearInterval }
  globals.setInterval = ((tick: () => void, ms: number) =>
    clock.setInterval(tick, ms)) as unknown as typeof setInterval
  globals.clearInterval = ((handle: never) =>
    clock.clearInterval(handle as unknown as number)) as unknown as typeof clearInterval
  return () => {
    globals.setInterval = saved.setInterval
    globals.clearInterval = saved.clearInterval
  }
}

interface Mounted {
  readonly harness: Fake
  /** Paints one frame and returns it. */
  readonly frame: () => Promise<string>
  /** Paints `frames` frames of `ms` each and returns the last one. */
  readonly swim: (frames: number, ms?: number) => Promise<string>
  readonly close: () => Promise<void>
}

/** Mounts the plugin's claim on a manual clock, the way the host renders it. */
async function mountClaim(
  options: { options?: Record<string, unknown>; running?: boolean } = {},
): Promise<Mounted> {
  const clock = new ManualClock()
  const setup = await createTestRenderer({ width: PANEL_WIDTH, height: 8, clock })
  const restoreTimers = useClockAsGlobalTimers(clock)
  const harness = fake({ renderer: setup.renderer, options: options.options })
  if (options.running === true) harness.statuses.set(SESSION, "running")
  await plugin.setup(harness.context)
  await render(
    () => (harness.claims[0]!.render as (input: unknown) => unknown)({ sessionID: SESSION }),
    setup.renderer,
  )

  const frame = async () => {
    await setup.renderOnce()
    return setup.captureCharFrame()
  }
  await frame()

  return {
    harness,
    frame,
    swim: async (frames, ms = 100) => {
      let captured = ""
      for (let index = 0; index < frames; index += 1) {
        clock.advance(ms)
        captured = await frame()
      }
      return captured
    },
    close: async () => {
      await setup.dispose()
      restoreTimers()
    },
  }
}

describe("setup", () => {
  test("claims the sidebar content slot", async () => {
    const { context, claims } = fake()
    await plugin.setup(context)

    expect(claims).toHaveLength(1)
    expect(claims[0]!.append).toBe("sidebar.content")
  })

  test("appends, so the section lands below the built-in sections", async () => {
    const { context, claims } = fake()
    await plugin.setup(context)

    const claim = claims[0]!
    expect(claim.prepend).toBeUndefined()
    expect(claim.before).toBeUndefined()
    expect(claim.after).toBeUndefined()
    expect(claim.replace).toBeUndefined()
  })

  test("returns a teardown so a reload does not leak the claim", async () => {
    const harness = fake()
    const cleanup = (await plugin.setup(harness.context)) as () => void

    expect(typeof cleanup).toBe("function")
    await cleanup()
  })

  test("leaves no subscription behind, since the section owns its own", async () => {
    const harness = fake()
    const cleanup = (await plugin.setup(harness.context)) as () => void

    expect(harness.subscribed()).toEqual([])
    await cleanup()
    expect(harness.unsubscribed()).toBe(0)
  })
})

describe("section behaviour through the plugin", () => {
  test("swims while the session is busy and docks when it goes idle", async () => {
    const mounted = await mountClaim()
    try {
      // Idle: parked at the left edge.
      expect(columnOf(await mounted.frame())).toBe(0)

      // Busy: swimming towards the right edge.
      mounted.harness.emit("session.execution.started", forSession)
      const swimming = columnOf(await mounted.swim(10))
      expect(swimming).toBeGreaterThan(0)
      expect(swimming).toBeLessThanOrEqual(RIGHT_EDGE)

      // Idle again: swims on to an edge and stops facing the middle.
      mounted.harness.emit("session.execution.succeeded", forSession)
      const docked = await mounted.swim(RIGHT_EDGE + 6)
      const column = columnOf(docked)
      expect([0, RIGHT_EDGE]).toContain(column)
      expect(docked.includes(FACING_RIGHT)).toBe(column === 0)
    } finally {
      await mounted.close()
    }
  })

  test("ignores execution events from another session", async () => {
    const mounted = await mountClaim()
    try {
      const before = await mounted.frame()

      mounted.harness.emit("session.execution.started", forOtherSession)
      const after = await mounted.swim(10)

      expect(columnOf(after)).toBe(0)
      expect(after).toBe(before)
    } finally {
      await mounted.close()
    }
  })

  test("swims on mount when the session is already running", async () => {
    // No event ever arrives: the panel was opened in the middle of a turn.
    const mounted = await mountClaim({ running: true })
    try {
      expect(columnOf(await mounted.swim(10))).toBeGreaterThan(0)
    } finally {
      await mounted.close()
    }
  })

  test("keeps the duck still when swimSpeed is zero", async () => {
    const mounted = await mountClaim({ options: { swimSpeed: 0 } })
    try {
      const before = await mounted.frame()

      mounted.harness.emit("session.execution.started", forSession)
      expect(await mounted.swim(10)).toBe(before)
    } finally {
      await mounted.close()
    }
  })

  test("falls back to the default speed for a nonsense swimSpeed", async () => {
    const mounted = await mountClaim({ options: { swimSpeed: "быстро" } })
    try {
      mounted.harness.emit("session.execution.started", forSession)
      // The default of 12 columns per second is in effect.
      expect(columnOf(await mounted.swim(10, COLUMN_MS))).toBeGreaterThan(0)
    } finally {
      await mounted.close()
    }
  })
})