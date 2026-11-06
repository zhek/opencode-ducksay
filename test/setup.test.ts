import { describe, expect, test } from "bun:test"
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { render } from "@opentui/solid"
import { ManualClock, createTestRenderer, type TestRendererSetup } from "@opentui/core/testing"
import { RGBA } from "@opentui/core"
import type { CliRenderer } from "@opentui/core"
import type { ModelRef, Project, SessionInfo, SessionMessageInfo } from "@opencode/client"
import type { Context } from "@opencode/plugin/tui/context"
import { createSignal } from "solid-js/dist/solid.js"
import type { JSX } from "solid-js"
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

interface RegisteredCommand {
  readonly id: string
  readonly title?: string
  readonly bind?: unknown
  readonly palette?: unknown
  readonly slash?: { readonly name: string; readonly arguments?: boolean }
  run: (input?: string) => void
}

interface ShownToast {
  readonly message?: string
  readonly title?: string
  readonly variant?: string
  readonly duration?: number
}

/**
 * A default location no test should reach: it lives under the system temp
 * directory, so a fallback that is never exercised cannot write into the
 * repository the plugin is developed in.
 */
const DEAD_DEFAULT = join(tmpdir(), "ducksay-default-location")

interface Fake {
  readonly context: Context
  readonly claims: Record<string, unknown>[]
  /** Commands the plugin registered in its keymap layer. */
  readonly commands: RegisteredCommand[]
  /** Toasts the plugin asked the host to show. */
  readonly toasts: ShownToast[]
  /** Points the router at another route for the command's session lookup. */
  readonly setRoute: (route: { type: string; sessionID?: string }) => void
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
    /** Where the server's default location points; a screenshot lands there. */
    defaultDirectory?: string
  } = {},
): Fake {
  const claims: Record<string, unknown>[] = []
  const handlers = new Map<string, Set<(event: any) => void>>()
  let unsubscribedCount = 0
  const statuses = new Map<string, "idle" | "running">()
  const commands: RegisteredCommand[] = []
  const toasts: ShownToast[] = []
  let route: { type: string; sessionID?: string } = { type: "session", sessionID: SESSION }
  /**
   * Mirrors OpenCode 2.0.17: `context.keymap.layer` reads the keymap provider
   * and throws when called outside it, which is where `setup` runs. Only an
   * `app` slot render is inside the provider here.
   */
  let inKeymapProvider = false

  const context = {
    options: options.options ?? {},
    theme: { text: { base: RGBA.fromHex("#e5e5e5") } },
    renderer: options.renderer,
    client: options.client,
    data: {
      on: (type: string, handler: (event: any) => void) => {
        const listeners = handlers.get(type) ?? new Set()
        listeners.add(handler)
        handlers.set(type, listeners)
        return () => {
          listeners.delete(handler)
          unsubscribedCount += 1
        }
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
        default: () => ({ directory: options.defaultDirectory ?? DEAD_DEFAULT }),
        vcs: {
          info: () => (options.branch === undefined ? undefined : { branch: { current: options.branch } }),
        },
      },
    },
    keymap: {
      layer: (factory: () => { commands?: readonly RegisteredCommand[] }) => {
        if (!inKeymapProvider) throw new Error("Keymap.Provider is missing")
        commands.push(...(factory().commands ?? []))
        return () => {}
      },
    },
    ui: {
      slot: (claim: Record<string, unknown>) => {
        if (claim.append === "app") {
          const render = claim.render as () => unknown
          claim = {
            ...claim,
            render: () => {
              inKeymapProvider = true
              try {
                return render()
              } finally {
                inKeymapProvider = false
              }
            },
          }
        }
        claims.push(claim)
        return () => {}
      },
      router: {
        current: () => route,
      },
      toast: {
        show: (toast: ShownToast) => {
          toasts.push(toast)
        },
      },
    },
  }

  return {
    context: context as unknown as Context,
    claims,
    commands,
    toasts,
    setRoute: (next) => {
      route = next
    },
    emit: (type, event) => {
      for (const handler of handlers.get(type) ?? []) handler(event)
    },
    unsubscribed: () => unsubscribedCount,
    subscribed: () => [...handlers.entries()].filter(([, listeners]) => listeners.size > 0).map(([type]) => type),
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
  /** Text handed to the renderer's OSC 52 clipboard, in order. */
  readonly copies: readonly string[]
  /** Paints one frame and returns it. */
  readonly frame: () => Promise<string>
  /** Paints `frames` frames of `ms` each and returns the last one. */
  readonly swim: (frames: number, ms?: number) => Promise<string>
  /** Switches the session the slot input points at, without remounting the claim. */
  readonly setSession: (sessionID: string) => void
  readonly mouse: TestRendererSetup["mockMouse"]
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
    defaultDirectory?: string
    width?: number
    /** The renderer clipboard's answer; defaults to accepting every copy. */
    copyResult?: boolean | ((text: string) => boolean)
  } = {},
): Promise<Mounted> {
  const clock = new ManualClock()
  const setup = await createTestRenderer({ width: options.width ?? PANEL_WIDTH, height: 12, clock })
  const copies: string[] = []
  const copyResult = options.copyResult ?? true
  ;(setup.renderer as unknown as { copyToClipboardOSC52: (text: string) => boolean })
    .copyToClipboardOSC52 = (text: string) => {
      copies.push(text)
      return typeof copyResult === "function" ? copyResult(text) : copyResult
    }
  const restoreTimers = useClockAsGlobalTimers(clock)
  const harness = fake({
    renderer: setup.renderer,
    options: options.options,
    session: options.session,
    messages: options.messages,
    project: options.project,
    branch: options.branch,
    client: options.client,
    defaultDirectory: options.defaultDirectory,
  })
  if (options.running === true) harness.statuses.set(SESSION, "running")
  await plugin.setup(harness.context)
  // The host calls each claim's render once and passes a reactive input object.
  // Keeping the element instead of re-calling `render` reproduces that: the
  // section sees a changing `sessionID` without being rebuilt by the test.
  const [session, setSession] = createSignal(SESSION)
  const claimRender = harness.claims.find((claim) => claim.append === "sidebar.content")!
    .render as (input: unknown) => JSX.Element
  // The command layer is registered from the `app` slot, which the real host
  // mounts under the keymap provider for the whole TUI lifetime. Both claims
  // share one Solid root, the way the slot tree does.
  const commandRender = harness.claims.find((claim) => claim.append === "app")!
    .render as () => JSX.Element
  let element: JSX.Element | undefined
  let commandElement: JSX.Element | undefined
  await render(
    () => [
      (element ??= claimRender({
        get sessionID() {
          return session()
        },
      })),
      (commandElement ??= commandRender()),
    ],
    setup.renderer,
  )

  const frame = async () => {
    await setup.renderOnce()
    return setup.captureCharFrame()
  }
  await frame()

  return {
    harness,
    copies,
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
    mouse: setup.mockMouse,
    close: async () => {
      await setup.dispose()
      restoreTimers()
    },
  }
}

/**
 * Mounts only the `app` claim, which is where the plugin registers its command.
 * The real TUI keeps that slot under the keymap provider for its whole life.
 */
async function mountCommands(harness: Fake): Promise<() => Promise<void>> {
  const setup = await createTestRenderer({ width: PANEL_WIDTH, height: 12 })
  const commandRender = harness.claims.find((claim) => claim.append === "app")!
    .render as () => unknown
  let element: unknown
  await render(() => (element ??= commandRender()), setup.renderer)
  return async () => {
    await setup.dispose()
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
  test("claims the sidebar content and the app command slots", async () => {
    const { context, claims } = fake()
    await plugin.setup(context)

    expect(claims).toHaveLength(2)
    expect(claims[0]!.append).toBe("sidebar.content")
    expect(claims[1]!.append).toBe("app")
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

  test("subscribes only to the dialogue reset and drops it on teardown", async () => {
    const harness = fake()
    const cleanup = (await plugin.setup(harness.context)) as () => void

    expect(harness.subscribed()).toEqual(["session.execution.started"])
    await cleanup()
    expect(harness.unsubscribed()).toBe(1)
  })
})

describe("the /duck command", () => {
  const BUSY_TOAST = {
    message: ">(o ) The duck is mid-quack. Try later.",
    variant: "info",
    duration: 2000,
  }
  const SILENT_TOAST = {
    message: "<(o ) The duck keeps mum.",
    variant: "info",
    duration: 2000,
  }

  const duckCommand = (harness: Fake): RegisteredCommand =>
    harness.commands.find((entry) => entry.slash?.name === "duck")!
  const copyCommand = (harness: Fake): RegisteredCommand =>
    harness.commands.find((entry) => entry.id === "duck.copy")!

  test("registers a slash-only command from the app slot, not from setup", async () => {
    const harness = fake()
    // `setup` has no keymap provider: calling `layer` there throws, as it does
    // in OpenCode 2.0.17 and leaves the whole plugin unloaded.
    const cleanup = (await plugin.setup(harness.context)) as () => void
    expect(harness.commands).toHaveLength(0)
    const unmount = await mountCommands(harness)

    try {
      const command = duckCommand(harness)
      expect(command.id).toBe("duck.talk")
      expect(command.slash).toEqual({ name: "duck", arguments: true })
      expect(command.bind).toBeUndefined()
      expect(command.palette).toBeUndefined()

      const copy = copyCommand(harness)
      expect(copy.title).toBe("Copy the duck's latest joke")
      expect(copy.bind).toBe(false)
      expect(copy.palette).toBeUndefined()
      expect(copy.slash).toEqual({ name: "duck.copy" })
    } finally {
      await unmount()
      await cleanup()
    }
  })

  test("shows the busy toast when no section is mounted yet", async () => {
    const harness = fake()
    const cleanup = (await plugin.setup(harness.context)) as () => void
    const unmount = await mountCommands(harness)

    try {
      duckCommand(harness).run("hello")

      expect(harness.toasts).toEqual([BUSY_TOAST])
    } finally {
      await unmount()
      await cleanup()
    }
  })

  test("passes the command text into the prompt as a direct call", async () => {
    const deferred = deferredClient()
    const mounted = await mountClaim({ session: sessionInfo(), client: deferred.client })

    try {
      duckCommand(mounted.harness).run("hello duck")
      await settle()

      expect(deferred.calls).toHaveLength(1)
      expect(deferred.calls[0]!.input.prompt).toContain("The user has just spoken to you directly")
      expect(deferred.calls[0]!.input.prompt).toContain("User: hello duck")
      expect(mounted.harness.toasts).toHaveLength(0)
    } finally {
      await mounted.close()
    }
  })

  test("shows the busy toast while the session is working", async () => {
    const mounted = await mountClaim({ running: true })

    try {
      duckCommand(mounted.harness).run("hello")

      expect(mounted.harness.toasts).toEqual([BUSY_TOAST])
    } finally {
      await mounted.close()
    }
  })

  test("shows the busy toast while the joke is loading", async () => {
    const deferred = deferredClient()
    const mounted = await mountClaim({ session: sessionInfo(), client: deferred.client })

    try {
      duckCommand(mounted.harness).run("first")
      await settle()
      expect(deferred.calls).toHaveLength(1)

      duckCommand(mounted.harness).run("second")

      expect(mounted.harness.toasts).toEqual([BUSY_TOAST])
      expect(deferred.calls).toHaveLength(1)
    } finally {
      await mounted.close()
    }
  })

  test("shows the busy toast while a question is open", async () => {
    const deferred = deferredClient()
    const mounted = await mountClaim({ session: sessionInfo(), client: deferred.client })

    try {
      mounted.harness.emit("form.created", {
        data: { form: { id: "question-1", sessionID: SESSION, title: "Question", fields: [] } },
      })
      await settle()
      await mounted.frame()

      duckCommand(mounted.harness).run("hello")

      expect(mounted.harness.toasts).toEqual([BUSY_TOAST])
      expect(deferred.calls).toHaveLength(0)
    } finally {
      await mounted.close()
    }
  })

  test("shows the busy toast while the duck is docking", async () => {
    const deferred = deferredClient()
    const mounted = await mountClaim({ running: true, session: sessionInfo(), client: deferred.client })

    try {
      await mounted.swim(3)
      mounted.harness.emit("session.execution.succeeded", forSession)
      await settle()
      const callsBefore = deferred.calls.length

      duckCommand(mounted.harness).run("hello")

      expect(mounted.harness.toasts).toEqual([BUSY_TOAST])
      expect(deferred.calls).toHaveLength(callsBefore)
    } finally {
      await mounted.close()
    }
  })

  test("shows the busy toast when the lane is narrower than the art", async () => {
    const deferred = deferredClient()
    const mounted = await mountClaim({ width: 5, session: sessionInfo(), client: deferred.client })

    try {
      duckCommand(mounted.harness).run("hello")

      expect(mounted.harness.toasts).toEqual([BUSY_TOAST])
      expect(deferred.calls).toHaveLength(0)
    } finally {
      await mounted.close()
    }
  })

  test("shows the busy toast when the router is not on a session", async () => {
    const mounted = await mountClaim()

    try {
      mounted.harness.setRoute({ type: "home" })
      duckCommand(mounted.harness).run("hello")

      expect(mounted.harness.toasts).toEqual([BUSY_TOAST])
    } finally {
      await mounted.close()
    }
  })

  test("follows the displayed session", async () => {
    const mounted = await mountClaim({ session: sessionInfo() })

    try {
      mounted.setSession(OTHER_SESSION)
      mounted.harness.setRoute({ type: "session", sessionID: OTHER_SESSION })
      duckCommand(mounted.harness).run("for the other tab")
      await settle()
      await mounted.frame()

      expect(mounted.harness.toasts).toHaveLength(0)
    } finally {
      await mounted.close()
    }
  })

  test("keeps mum instead of asking when silent is on, busy or not", async () => {
    for (const running of [false, true]) {
      const deferred = deferredClient()
      const mounted = await mountClaim({
        running,
        session: sessionInfo(),
        client: deferred.client,
        options: { silent: true },
      })

      try {
        duckCommand(mounted.harness).run("hello")

        expect(deferred.calls).toHaveLength(0)
        expect(mounted.harness.toasts).toEqual([SILENT_TOAST])
      } finally {
        await mounted.close()
      }
    }
  })
})

describe("the duck.copy command", () => {
  const COPIED_TOAST = {
    message: ">(o ) Copied to clipboard",
    variant: "success",
    duration: 2000,
  }
  const EMPTY_TOAST = {
    message: "<(o ) The duck hasn't said anything yet.",
    variant: "info",
    duration: 2000,
  }
  const FAILED_TOAST = {
    message: ">(o ) The terminal won't take the joke: clipboard is unavailable.",
    variant: "error",
    duration: 2000,
  }

  const copyCommand = (harness: Fake): RegisteredCommand =>
    harness.commands.find((entry) => entry.id === "duck.copy")!

  /** Ends a turn, waits for the fallback joke and the dock, returns the bubble. */
  async function rest(mounted: Mounted): Promise<string> {
    mounted.harness.emit("session.execution.succeeded", forSession)
    await settle()
    let last = ""
    for (let step = 0; step < 120; step += 1) {
      last = await mounted.swim(1, 200)
      if (last.includes("Quack-quack!")) return last
    }
    throw new Error(`the copy command test never reached a rest bubble:\n${last}`)
  }

  test("copies the displayed joke and reports success", async () => {
    const mounted = await mountClaim({ running: true, session: sessionInfo(), copyResult: true })

    try {
      await rest(mounted)
      copyCommand(mounted.harness).run()
      await settle()
      const after = await mounted.frame()

      expect(mounted.copies).toEqual(["( o)< Quack-quack! (opencode-ducksay)"])
      expect(mounted.harness.toasts).toEqual([COPIED_TOAST])
      expect(after).toContain("✓")
    } finally {
      await mounted.close()
    }
  })

  test("shows the clipboard error and leaves the icon alone", async () => {
    const mounted = await mountClaim({ running: true, session: sessionInfo(), copyResult: false })

    try {
      await rest(mounted)
      copyCommand(mounted.harness).run()
      await settle()
      const after = await mounted.frame()

      expect(mounted.copies).toHaveLength(1)
      expect(mounted.harness.toasts).toEqual([FAILED_TOAST])
      expect(after).not.toContain("✓")
    } finally {
      await mounted.close()
    }
  })

  test("reports an empty command when no section is mounted", async () => {
    const harness = fake()
    const cleanup = (await plugin.setup(harness.context)) as () => void
    const unmount = await mountCommands(harness)

    try {
      copyCommand(harness).run()

      expect(harness.toasts).toEqual([EMPTY_TOAST])
    } finally {
      await unmount()
      await cleanup()
    }
  })

  test("reports an empty command before the duck has joked", async () => {
    const mounted = await mountClaim({ session: sessionInfo(), copyResult: true })

    try {
      await settle()
      copyCommand(mounted.harness).run()

      expect(mounted.copies).toHaveLength(0)
      expect(mounted.harness.toasts).toEqual([EMPTY_TOAST])
    } finally {
      await mounted.close()
    }
  })

  test("does not copy another session's joke", async () => {
    const mounted = await mountClaim({ running: true, session: sessionInfo(), copyResult: true })

    try {
      await rest(mounted)
      mounted.setSession(OTHER_SESSION)
      mounted.harness.setRoute({ type: "session", sessionID: OTHER_SESSION })
      copyCommand(mounted.harness).run()

      expect(mounted.copies).toHaveLength(0)
      expect(mounted.harness.toasts).toEqual([EMPTY_TOAST])
    } finally {
      await mounted.close()
    }
  })

  test("reports an empty command under silent and in a narrow lane", async () => {
    for (const options of [{ options: { silent: true } }, { width: 5 }]) {
      const mounted = await mountClaim({ session: sessionInfo(), copyResult: true, ...options })

      try {
        await settle()
        copyCommand(mounted.harness).run()

        expect(mounted.copies).toHaveLength(0)
        expect(mounted.harness.toasts).toEqual([EMPTY_TOAST])
      } finally {
        await mounted.close()
      }
    }
  })

  test("reports an empty command while the joke is still loading", async () => {
    const deferred = deferredClient()
    const mounted = await mountClaim({
      running: true,
      session: sessionInfo(),
      client: deferred.client,
      copyResult: true,
    })

    try {
      mounted.harness.emit("session.execution.succeeded", forSession)
      await settle()
      copyCommand(mounted.harness).run()

      expect(mounted.copies).toHaveLength(0)
      expect(mounted.harness.toasts).toEqual([EMPTY_TOAST])
    } finally {
      await mounted.close()
    }
  })

  test("reports an empty command while a question waits", async () => {
    const mounted = await mountClaim({ running: true, session: sessionInfo(), copyResult: true })

    try {
      mounted.harness.emit("form.created", {
        data: { form: { id: "question-1", sessionID: SESSION, title: "Question", fields: [] } },
      })
      await settle()
      copyCommand(mounted.harness).run()

      expect(mounted.copies).toHaveLength(0)
      expect(mounted.harness.toasts).toEqual([EMPTY_TOAST])
    } finally {
      await mounted.close()
    }
  })
})

describe("the duck.img command", () => {
  const SAVED_TOAST = {
    message: ">(o ) Screenshot saved",
    variant: "success",
    duration: 2000,
  }
  const FAILED_TOAST = {
    message: ">(o ) Failed to save screenshot.",
    variant: "error",
    duration: 2000,
  }
  const NO_FRAME_TOAST = {
    message: "<(o ) The duck isn't in frame yet.",
    variant: "info",
    duration: 2000,
  }

  const screenshotCommand = (harness: Fake): RegisteredCommand =>
    harness.commands.find((entry) => entry.id === "duck.img")!

  /** The screenshots the plugin wrote under a temp project, sorted. */
  function shots(directory: string): string[] {
    const folder = join(directory, ".opencode", "ducksay", "screenshots")
    return existsSync(folder) ? readdirSync(folder).sort() : []
  }

  /** A temp project whose session reports it as its working directory. */
  function projectWithSession() {
    const directory = mkdtempSync(join(tmpdir(), "ducksay-img-"))
    return { directory, session: sessionInfo({ location: { directory } }) }
  }

  /** Ends a turn, waits for the fallback joke and the dock, returns the bubble. */
  async function rest(mounted: Mounted): Promise<string> {
    mounted.harness.emit("session.execution.succeeded", forSession)
    await settle()
    let last = ""
    for (let step = 0; step < 120; step += 1) {
      last = await mounted.swim(1, 200)
      if (last.includes("Quack-quack!")) return last
    }
    throw new Error(`the duck.img test never reached a rest bubble:\n${last}`)
  }

  test("registers /duck.img without a default key or a palette entry", async () => {
    const harness = fake()
    const cleanup = (await plugin.setup(harness.context)) as () => void
    const unmount = await mountCommands(harness)

    try {
      const command = screenshotCommand(harness)
      expect(command.title).toBe("Create a screenshot of the duck")
      expect(command.bind).toBe(false)
      expect(command.palette).toBeUndefined()
      expect(command.slash).toEqual({ name: "duck.img" })
    } finally {
      await unmount()
      await cleanup()
    }
  })

  test("saves the displayed frame and reports success", async () => {
    const project = projectWithSession()
    const mounted = await mountClaim({ running: true, session: project.session })

    try {
      await rest(mounted)
      screenshotCommand(mounted.harness).run()
      await settle()

      const files = shots(project.directory)
      expect(files).toHaveLength(1)
      expect(files[0]).toMatch(/^ducksay-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.png$/)
      const saved = readFileSync(join(project.directory, ".opencode", "ducksay", "screenshots", files[0]!))
      expect([...saved.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
      expect(mounted.harness.toasts).toEqual([SAVED_TOAST])
      expect(await mounted.frame()).toContain("✓")
    } finally {
      await mounted.close()
      rmSync(project.directory, { recursive: true, force: true })
    }
  })

  /**
   * A session the host's cache does not carry has no working directory of its
   * own, and the project's recorded path is not a place the reader is looking
   * at. The screenshot belongs to the location the server calls default —
   * `/repo`, where the fake project claims to live, must stay untouched.
   */
  test("falls back to the default location when the session names none", async () => {
    const directory = mkdtempSync(join(tmpdir(), "ducksay-default-"))
    const mounted = await mountClaim({
      running: true,
      session: sessionInfo({ location: undefined }),
      defaultDirectory: directory,
    })

    try {
      await rest(mounted)
      screenshotCommand(mounted.harness).run()
      await settle()

      expect(shots(directory)).toHaveLength(1)
      expect(mounted.harness.toasts).toEqual([SAVED_TOAST])
      expect(existsSync(join("/repo", ".opencode"))).toBe(false)
    } finally {
      await mounted.close()
      rmSync(directory, { recursive: true, force: true })
    }
  })

  test("saves from the command while the duck is swimming", async () => {
    const project = projectWithSession()
    const mounted = await mountClaim({ running: true, session: project.session })

    try {
      // A few frames in the duck is on its way and nothing has been said yet.
      const frame = await mounted.swim(3, 200)
      expect(frame).toContain("__")
      screenshotCommand(mounted.harness).run()
      await settle()

      expect(shots(project.directory)).toHaveLength(1)
      expect(mounted.harness.toasts).toEqual([SAVED_TOAST])
      expect(await mounted.frame()).toContain("✓")
    } finally {
      await mounted.close()
      rmSync(project.directory, { recursive: true, force: true })
    }
  })

  test("saves the frame from a click on the icon", async () => {
    const project = projectWithSession()
    const mounted = await mountClaim({ running: true, session: project.session })

    try {
      const frame = await rest(mounted)
      const column = frame.split("\n")[0]!.indexOf("[img]")
      expect(column).toBeGreaterThanOrEqual(0)
      await mounted.mouse.click(column, 0, 0)
      await settle()

      expect(shots(project.directory)).toHaveLength(1)
      expect(mounted.harness.toasts).toEqual([SAVED_TOAST])
    } finally {
      await mounted.close()
      rmSync(project.directory, { recursive: true, force: true })
    }
  })

  test("reports a failed write and leaves the icon alone", async () => {
    // A regular file where the project directory should be makes `mkdir` fail.
    const file = join(mkdtempSync(join(tmpdir(), "ducksay-img-")), "not-a-directory")
    writeFileSync(file, "")
    const mounted = await mountClaim({ session: sessionInfo({ location: { directory: file } }) })

    try {
      screenshotCommand(mounted.harness).run()
      await settle()

      expect(mounted.harness.toasts).toEqual([FAILED_TOAST])
      const frame = await mounted.frame()
      expect(frame).toContain("[img]")
      expect(frame).not.toContain("✓")
    } finally {
      await mounted.close()
      rmSync(file, { force: true })
      rmSync(join(file, ".."), { recursive: true, force: true })
    }
  })

  test("reports an empty command when no section is mounted", async () => {
    const harness = fake()
    const cleanup = (await plugin.setup(harness.context)) as () => void
    const unmount = await mountCommands(harness)

    try {
      screenshotCommand(harness).run()
      expect(harness.toasts).toEqual([NO_FRAME_TOAST])
    } finally {
      await unmount()
      await cleanup()
    }
  })

  test("does not save another session's frame", async () => {
    const project = projectWithSession()
    const mounted = await mountClaim({ running: true, session: project.session })

    try {
      await rest(mounted)
      // The route points at another session while the mounted section still
      // shows its own: the command must refuse to photograph a tab it is not
      // looking at.
      mounted.harness.setRoute({ type: "session", sessionID: OTHER_SESSION })
      screenshotCommand(mounted.harness).run()
      await settle()

      expect(shots(project.directory)).toHaveLength(0)
      expect(mounted.harness.toasts).toEqual([NO_FRAME_TOAST])
    } finally {
      await mounted.close()
      rmSync(project.directory, { recursive: true, force: true })
    }
  })

  test("reports an empty command in a lane too narrow for the duck", async () => {
    const project = projectWithSession()
    const mounted = await mountClaim({ session: project.session, width: 5 })

    try {
      screenshotCommand(mounted.harness).run()
      await settle()

      expect(shots(project.directory)).toHaveLength(0)
      expect(mounted.harness.toasts).toEqual([NO_FRAME_TOAST])
    } finally {
      await mounted.close()
      rmSync(project.directory, { recursive: true, force: true })
    }
  })
})

describe("dialogue lifecycle through the plugin", () => {
  const duckCommand = (harness: Fake): RegisteredCommand =>
    harness.commands.find((entry) => entry.slash?.name === "duck")!
  const copyCommand = (harness: Fake): RegisteredCommand =>
    harness.commands.find((entry) => entry.id === "duck.copy")!

  test("clears the dialogue when the shown session starts a new turn", async () => {
    const deferred = deferredClient()
    const mounted = await mountClaim({ running: true, session: sessionInfo(), client: deferred.client })

    try {
      await mounted.swim(5)
      mounted.harness.emit("session.execution.succeeded", forSession)
      await mounted.swim(RIGHT_EDGE + 6)
      await settle()
      expect(deferred.calls).toHaveLength(1)
      deferred.calls[0]!.resolve({ text: "first joke" })
      await settle()

      duckCommand(mounted.harness).run("remember this")
      await settle()
      expect(deferred.calls).toHaveLength(2)
      deferred.calls[1]!.resolve({ text: "second joke" })
      await settle()

      mounted.harness.emit("session.execution.started", forSession)
      await settle()
      mounted.harness.emit("session.execution.succeeded", forSession)
      await settle()

      expect(deferred.calls).toHaveLength(3)
      const prompt = deferred.calls[2]!.input.prompt
      expect(prompt).not.toContain("first joke")
      expect(prompt).not.toContain("second joke")
      expect(prompt).not.toContain("remember this")
    } finally {
      await mounted.close()
    }
  })

  test("clears a background session's dialogue on its new turn", async () => {
    const deferred = deferredClient()
    const mounted = await mountClaim({ session: sessionInfo(), client: deferred.client })

    try {
      duckCommand(mounted.harness).run("keep me")
      await settle()
      deferred.calls[0]!.resolve({ text: "kept joke" })
      await settle()

      mounted.setSession(OTHER_SESSION)
      mounted.harness.setRoute({ type: "session", sessionID: OTHER_SESSION })
      await settle()
      mounted.harness.emit("session.execution.started", forSession)
      await settle()
      mounted.setSession(SESSION)
      mounted.harness.setRoute({ type: "session", sessionID: SESSION })
      await settle()

      duckCommand(mounted.harness).run("again")
      await settle()

      expect(deferred.calls).toHaveLength(2)
      expect(deferred.calls[1]!.input.prompt).not.toContain("kept joke")
      expect(deferred.calls[1]!.input.prompt).not.toContain("keep me")
    } finally {
      await mounted.close()
    }
  })

  test("keeps the dialogue across a tab switch and back", async () => {
    const deferred = deferredClient()
    const mounted = await mountClaim({ session: sessionInfo(), client: deferred.client })

    try {
      duckCommand(mounted.harness).run("keep me")
      await settle()
      deferred.calls[0]!.resolve({ text: "kept joke" })
      await settle()

      mounted.setSession(OTHER_SESSION)
      mounted.harness.setRoute({ type: "session", sessionID: OTHER_SESSION })
      await settle()
      mounted.setSession(SESSION)
      mounted.harness.setRoute({ type: "session", sessionID: SESSION })
      await settle()

      duckCommand(mounted.harness).run("next")
      await settle()

      expect(deferred.calls).toHaveLength(2)
      const prompt = deferred.calls[1]!.input.prompt
      expect(prompt).toContain("User: keep me")
      expect(prompt).toContain("Duck: kept joke")
      expect(prompt).toContain("User: next")
    } finally {
      await mounted.close()
    }
  })

  test("starts a fresh plugin lifetime with an empty dialogue", async () => {
    const first = deferredClient()
    const one = await mountClaim({ session: sessionInfo(), client: first.client })
    try {
      duckCommand(one.harness).run("remember me")
      await settle()
      first.calls[0]!.resolve({ text: "first joke" })
      await settle()
    } finally {
      await one.close()
    }

    const second = deferredClient()
    const two = await mountClaim({ session: sessionInfo(), client: second.client })
    try {
      duckCommand(two.harness).run("hello again")
      await settle()

      const prompt = second.calls[0]!.input.prompt
      expect(prompt).not.toContain("first joke")
      expect(prompt).not.toContain("remember me")
    } finally {
      await two.close()
    }
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

  test("does not ask for a joke when silent is true", async () => {
    const deferred = deferredClient()
    const mounted = await mountClaim({
      running: true,
      session: sessionInfo(),
      client: deferred.client,
      options: { silent: true },
    })
    try {
      await mounted.swim(5)
      mounted.harness.emit("session.execution.succeeded", forSession)
      const frame = await mounted.swim(RIGHT_EDGE + 2)

      expect(deferred.calls).toHaveLength(0)
      expect(frame).not.toContain("╭")
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
