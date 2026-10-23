import { describe, expect, test } from "bun:test"
import { render } from "@opentui/solid"
import { ManualClock, createTestRenderer } from "@opentui/core/testing"
import { RGBA } from "@opentui/core"
import type { CliRenderer } from "@opentui/core"
import type { ModelRef, Project, SessionInfo, SessionMessageInfo } from "@opencode/client"
import type { Context } from "@opencode/plugin/tui/context"
import { createSignal } from "solid-js/dist/solid.js"
import { DUCK_LEFT, DUCK_LEFT_OPEN, DUCK_RIGHT, DUCK_RIGHT_OPEN, DUCK_WIDTH } from "../src/duck.ts"
import type { JokeClient } from "../src/joke.ts"
import { DEFAULT_SWIM_SPEED } from "../src/options.ts"
import plugin from "../src/tui.tsx"

/** `SESSION_SIDEBAR_WIDTH` from OpenCode's session sidebar. */
const PANEL_WIDTH = 42

/** Where the duck can get to: the lane minus the art. */
const RIGHT_EDGE = PANEL_WIDTH - DUCK_WIDTH

/** One column at the plugin's default speed. */
const COLUMN_MS = 1000 / DEFAULT_SWIM_SPEED

const SESSION = "ses_duck"
const OTHER_SESSION = "ses_other"
const PROJECT = "project-1"
const MODEL: ModelRef = { providerID: "openai", id: "gpt-5" }

function sessionInfo(overrides: Partial<Record<keyof SessionInfo, unknown>> = {}): SessionInfo {
  return {
    id: SESSION,
    projectID: PROJECT,
    title: "Fix the parser",
    model: MODEL,
    time: { created: 0, updated: 0 },
    ...overrides,
  } as unknown as SessionInfo
}

function projectInfo(): Project {
  return {
    id: PROJECT,
    name: "ducksay",
    canonical: "/repo",
    time: { created: 0, updated: 0 },
    sandboxes: [],
  } as unknown as Project
}

function userMessage(text: string, created: number): SessionMessageInfo {
  return { id: `user-${created}`, type: "user", time: { created }, text } as unknown as SessionMessageInfo
}

function assistantMessage(text: string, created: number): SessionMessageInfo {
  return {
    id: `assistant-${created}`,
    type: "assistant",
    time: { created },
    agent: "build",
    model: MODEL,
    content: [{ type: "text", text }],
  } as unknown as SessionMessageInfo
}

/**
 * The middle art line, closed and open. All four versions start at column 0, so
 * its index is the duck's column.
 */
const FACING_RIGHT = DUCK_RIGHT[1]
const FACING_RIGHT_OPEN = DUCK_RIGHT_OPEN[1]
const FACING_LEFT = DUCK_LEFT[1]
const FACING_LEFT_OPEN = DUCK_LEFT_OPEN[1]
const RIGHT_MARKERS = [FACING_RIGHT, FACING_RIGHT_OPEN]
const LEFT_MARKERS = [FACING_LEFT, FACING_LEFT_OPEN]
const ALL_MARKERS = [...RIGHT_MARKERS, ...LEFT_MARKERS]

/** Both execution events carry the session and nothing else the section looks at. */
const forSession = { data: { sessionID: SESSION } }
const forOtherSession = { data: { sessionID: OTHER_SESSION } }

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

function fake(
  options: {
    renderer?: CliRenderer
    options?: Record<string, unknown>
    session?: SessionInfo
    messages?: SessionMessageInfo[]
    project?: Project
    branch?: string
    client?: JokeClient
  } = {},
): Fake {
  const claims: Record<string, unknown>[] = []
  const handlers = new Map<string, (event: any) => void>()
  const unsubscribes = new Map<string, () => void>()
  const statuses = new Map<string, "idle" | "running">()

  const context = {
    options: options.options ?? {},
    theme: { text: { base: RGBA.fromHex("#e5e5e5") } },
    renderer: options.renderer,
    client: options.client,
    data: {
      on: (type: string, handler: (event: any) => void) => {
        handlers.set(type, handler)
        const unsubscribe = () => unsubscribes.set(type, unsubscribe)
        unsubscribes.set(type, unsubscribe)
        return unsubscribe
      },
      session: {
        status: (sessionID: string) => statuses.get(sessionID) ?? "idle",
        get: (sessionID: string) => (sessionID === SESSION ? options.session : undefined),
        message: {
          list: (sessionID: string) => (sessionID === SESSION ? (options.messages ?? []) : []),
        },
      },
      project: {
        get: (projectID: string) => (projectID === PROJECT ? options.project : undefined),
      },
      location: {
        vcs: {
          info: () => (options.branch === undefined ? undefined : { branch: { current: options.branch } }),
        },
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
  /** Switches the session the slot input points at, without remounting the claim. */
  readonly setSession: (sessionID: string) => void
  readonly close: () => Promise<void>
}

/** Mounts the plugin's claim on a manual clock, the way the host renders it. */
async function mountClaim(
  options: {
    options?: Record<string, unknown>
    running?: boolean
    session?: SessionInfo
    messages?: SessionMessageInfo[]
    project?: Project
    branch?: string
    client?: JokeClient
  } = {},
): Promise<Mounted> {
  const clock = new ManualClock()
  const setup = await createTestRenderer({ width: PANEL_WIDTH, height: 12, clock })
  const restoreTimers = useClockAsGlobalTimers(clock)
  const harness = fake({
    renderer: setup.renderer,
    options: options.options,
    session: options.session,
    messages: options.messages,
    project: options.project,
    branch: options.branch,
    client: options.client,
  })
  if (options.running === true) harness.statuses.set(SESSION, "running")
  await plugin.setup(harness.context)
  // The host calls the claim render once and passes a reactive input object.
  // Keeping the element instead of re-calling `render` reproduces that: the
  // section sees a changing `sessionID` without being rebuilt by the test.
  const [session, setSession] = createSignal(SESSION)
  const claimRender = harness.claims[0]!.render as (input: unknown) => unknown
  let element: unknown
  await render(
    () => (element ??= claimRender({
      get sessionID() {
        return session()
      },
    })),
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
    setSession,
    close: async () => {
      await setup.dispose()
      restoreTimers()
    },
  }
}

interface DeferredCall {
  readonly input: { readonly sessionID: string; readonly prompt: string }
  readonly options?: { readonly signal?: AbortSignal }
  resolve: (value: { readonly text?: string }) => void
  reject: (error: Error) => void
}

/** A model client whose answers the test resolves by hand. */
function deferredClient() {
  const calls: DeferredCall[] = []
  const client: JokeClient = {
    session: {
      create: async () => ({ id: "temp-session" }),
      generate: (input, options) =>
        new Promise((resolve, reject) => {
          calls.push({ input, options, resolve, reject })
          options?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true })
        }),
      remove: async () => {},
    },
  }
  return { client, calls }
}

/** Lets request promise chains and Solid updates run. */
async function settle() {
  for (let index = 0; index < 8; index += 1) await Promise.resolve()
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
      expect(facesRight(docked)).toBe(column === 0)
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

  test("shows each session's own duck when the displayed session changes", async () => {
    const mounted = await mountClaim({ running: true })
    try {
      const column = columnOf(await mounted.swim(5))
      expect(column).toBeGreaterThan(0)

      // The host keeps the claim mounted and only updates its reactive input.
      mounted.setSession(OTHER_SESSION)
      expect(columnOf(await mounted.frame())).toBe(0)

      // Coming back restores the first session's snapshot.
      mounted.setSession(SESSION)
      expect(columnOf(await mounted.frame())).toBe(column)
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
      // The 33 ms tick means eleven 100 ms frames accumulate 1089 ms of swim
      // time: ten whole columns at ten per second. The old default of twelve
      // would cover thirteen.
      expect(columnOf(await mounted.swim(11, COLUMN_MS))).toBe(10)
    } finally {
      await mounted.close()
    }
  })
})
describe("generated jokes through the plugin", () => {
  const history = [
    userMessage("older question", 1),
    assistantMessage("older answer", 2),
    userMessage("newest question", 3),
    assistantMessage("newest answer", 4),
  ]

  test("passes the temporary session id, depth and metadata, and waits for the turn to end", async () => {
    const deferred = deferredClient()
    const mounted = await mountClaim({
      running: true,
      session: sessionInfo(),
      messages: history,
      project: projectInfo(),
      branch: "feat/jokes",
      client: deferred.client,
      options: { llmContextDepth: 1, llmTimeout: 5 },
    })

    try {
      await mounted.swim(5)
      expect(deferred.calls).toHaveLength(0)

      mounted.harness.emit("session.execution.succeeded", forSession)
      await settle()
      expect(deferred.calls).toHaveLength(1)

      const call = deferred.calls[0]!
      expect(call.input.sessionID).toBe("temp-session")
      expect(call.input.prompt).toContain("Session: Fix the parser")
      expect(call.input.prompt).toContain("Project: ducksay")
      expect(call.input.prompt).toContain("Branch: feat/jokes")
      expect(call.input.prompt).toContain("User: newest question")
      expect(call.input.prompt).toContain("Assistant: newest answer")
      expect(call.input.prompt).not.toContain("older question")
      expect(call.input.prompt).not.toContain("older answer")

      call.resolve({ text: "Context joke" })
      await settle()
      expect(await mounted.swim(RIGHT_EDGE + 6)).toContain("Context joke")
    } finally {
      await mounted.close()
    }
  })

  test("uses llmTimeout for the model call and falls back when it expires", async () => {
    const deferred = deferredClient()
    const mounted = await mountClaim({
      running: true,
      session: sessionInfo(),
      client: deferred.client,
      options: { llmTimeout: 0.01, llmContextDepth: 1 },
    })

    try {
      await mounted.swim(5)
      mounted.harness.emit("session.execution.succeeded", forSession)
      await mounted.swim(RIGHT_EDGE + 6)
      await new Promise((resolve) => setTimeout(resolve, 30))
      await settle()

      expect(deferred.calls[0]!.options?.signal?.aborted).toBe(true)
      expect(await mounted.frame()).toContain("Quack-quack!")
    } finally {
      await mounted.close()
    }
  })

  test("falls back when the client fails", async () => {
    const failing: JokeClient = {
      session: {
        create: async () => ({ id: "temp-session" }),
        generate: async () => {
          throw new Error("provider is down")
        },
        remove: async () => {},
      },
    }
    const mounted = await mountClaim({ running: true, session: sessionInfo(), client: failing })

    try {
      await mounted.swim(5)
      mounted.harness.emit("session.execution.succeeded", forSession)
      await mounted.swim(RIGHT_EDGE + 6)
      await settle()

      expect(await mounted.frame()).toContain("Quack-quack!")
    } finally {
      await mounted.close()
    }
  })

  test("survives a missing client or missing session data", async () => {
    const cases: Array<{ client?: JokeClient; session?: SessionInfo }> = [
      { session: sessionInfo() },
      { client: deferredClient().client },
    ]

    for (const entry of cases) {
      const mounted = await mountClaim({ running: true, ...entry })
      try {
        await mounted.swim(5)
        mounted.harness.emit("session.execution.succeeded", forSession)
        await mounted.swim(RIGHT_EDGE + 6)
        await settle()

        expect(await mounted.frame()).toContain("Quack-quack!")
      } finally {
        await mounted.close()
      }
    }
  })

  test("shows the joke at rest, hides it on the next turn and aborts that turn's pending request", async () => {
    const deferred = deferredClient()
    const mounted = await mountClaim({
      running: true,
      session: sessionInfo(),
      messages: history,
      project: projectInfo(),
      branch: "feat/jokes",
      client: deferred.client,
    })

    try {
      await mounted.swim(5)
      mounted.harness.emit("session.execution.succeeded", forSession)
      await mounted.swim(RIGHT_EDGE + 6)
      await settle()

      // The turn is over and the duck is at rest, but the answer is pending.
      expect(deferred.calls).toHaveLength(1)
      const waiting = await mounted.frame()
      expect(waiting).toContain("╭")
      expect(waiting).toContain("Quack")

      deferred.calls[0]!.resolve({ text: "The parser quacks" })
      await settle()
      const first = await mounted.frame()
      expect(first).toContain("The")
      expect(first).not.toContain("parser")
      expect(first).toContain(FACING_LEFT_OPEN)

      await mounted.swim(4)
      const shown = await mounted.frame()
      expect(shown).toContain("The parser quacks")
      expect(shown).toContain(FACING_LEFT_OPEN)

      // A new turn drops the bubble while the duck swims.
      mounted.harness.emit("session.execution.started", forSession)
      await settle()
      const swimming = await mounted.swim(2)
      expect(swimming).not.toContain("The parser quacks")
      expect(swimming).not.toContain("╭")

      // That turn ends and starts a second, pending request.
      mounted.harness.emit("session.execution.succeeded", forSession)
      await mounted.swim(RIGHT_EDGE + 6)
      await settle()
      expect(deferred.calls).toHaveLength(2)
      const second = deferred.calls[1]!
      expect(second.options?.signal?.aborted).toBe(false)
      const waitingAgain = await mounted.frame()
      expect(waitingAgain).toContain("╭")
      expect(waitingAgain).toContain("Quack")
      expect(waitingAgain).not.toContain("The parser quacks")

      // The next turn aborts it, and its late answer never reaches the bubble.
      mounted.harness.emit("session.execution.started", forSession)
      await settle()
      expect(second.options?.signal?.aborted).toBe(true)
      second.resolve({ text: "late answer" })
      await settle()
      const after = await mounted.frame()
      expect(after).not.toContain("late answer")
      expect(after).not.toContain("╭")
    } finally {
      await mounted.close()
    }
  })
})
