/** @jsxImportSource @opentui/solid */
import { afterEach } from "bun:test"
import { createComponent, render } from "@opentui/solid"
import { createTestRenderer, ManualClock, type TestRendererSetup } from "@opentui/core/testing"
import { RGBA } from "@opentui/core"
import type { CliRenderer } from "@opentui/core"
import type { Data } from "@opencode/plugin/tui/context"
import type { Project, SessionInfo, SessionMessageInfo } from "@opencode/client"
import { createSignal, Show } from "solid-js/dist/solid.js"
import type { JSX } from "solid-js"
import type { DuckStates } from "../../src/duck-state.ts"
import type { JokeClient, JokeInput } from "../../src/joke.ts"
import { DEFAULT_SWIM_SPEED } from "../../src/options.ts"
import plugin, {
  Ducksay,
  type DuckCommandResult,
  type DuckCopyResult,
  type DuckHandle,
  type DuckScreenshotResult,
  type DuckSprites,
} from "../../src/tui.tsx"
import { SESSION, fake, type Fake } from "./context.ts"
import { PANEL_WIDTH, TICK_MS } from "./timing.ts"

/**
 * `Show`'s two overloads are hard to pick through the manual `createComponent`
 * call below, so the fixture uses the non-keyed shape explicitly.
 */
const Conditional = Show as unknown as (props: {
  when: boolean
  keyed?: false
  children: (shown: boolean) => unknown
}) => unknown

/**
 * `fg` clones the value, so the fixture has to be a real RGBA, not a plain
 * object. In the plugin the host passes `theme.text.base`, already an RGBA.
 */
export const PRIMARY = RGBA.fromHex("#e5e5e5")
export const MUTED = RGBA.fromHex("#666666")

/** A form the fake host already has when the section mounts. */
export interface PendingForm {
  readonly id: string
  /** Defaults to the mounted session; pass another id to seed a foreign form. */
  readonly sessionID?: string
}

export interface Harness {
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
  /** Drives the section the way the `/duck` command does. */
  readonly duck: (text?: string) => DuckCommandResult | undefined
  /** The session the live handle belongs to; absent once unmounted. */
  readonly handleSessionID: () => string | undefined
  /** Drives the section the way the palette copy command does. */
  readonly copy: () => DuckCopyResult | undefined
  /** Text handed to the section's clipboard callback, in order. */
  readonly copies: readonly string[]
  /** Copy outcomes the section reported from the icon. */
  readonly notifies: readonly ("copied" | "failed")[]
  /** Drives the section the way the palette screenshot command does. */
  readonly screenshot: () => DuckScreenshotResult | undefined
  /** Frames handed to the screenshot writer, in order. */
  readonly screenshots: readonly { rows: readonly string[]; width: number }[]
  /** Screenshot outcomes the section reported from the icon. */
  readonly shotNotifies: readonly DuckScreenshotResult[]
  readonly mouse: TestRendererSetup["mockMouse"]
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
export interface MountOptions {
  width?: number
  running?: boolean
  swimSpeed?: number
  silent?: boolean
  sprites?: DuckSprites
  bubbleText?: string
  joke?: (signal: AbortSignal, input?: JokeInput) => Promise<string | undefined>
  /** Enables the copy icon; its return value is the clipboard's answer. */
  copy?: (text: string) => boolean
  /** Enables the screenshot icon; its return value is the writer's answer. */
  screenshot?: (frame: { rows: readonly string[]; width: number }) => DuckScreenshotResult
  /** Makes the 1/50 cow roll deterministic in a test. */
  random?: () => number
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

/**
 * Harnesses that are still holding a renderer. `dispose()` removes its own
 * harness, and `afterEach` closes anything a test forgot, so a forgotten
 * teardown cannot leak a `TerminalConsoleCache` listener into the next test.
 */
const liveHarnesses = new Set<Harness>()

afterEach(async () => {
  for (const harness of [...liveHarnesses]) await harness.dispose()
})

export async function mount(options: MountOptions = {}): Promise<Harness> {
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
  let handle: DuckHandle | undefined
  const copies: string[] = []
  const notifies: ("copied" | "failed")[] = []
  const screenshots: { rows: readonly string[]; width: number }[] = []
  const shotNotifies: DuckScreenshotResult[] = []

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
              silent: options.silent,
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
              copy: options.copy === undefined
                ? undefined
                : (text: string) => {
                    copies.push(text)
                    return options.copy!(text)
                  },
              notify: (result) => notifies.push(result),
              screenshot: options.screenshot === undefined
                ? undefined
                : (frame) => {
                    screenshots.push(frame)
                    return options.screenshot!(frame)
                  },
              notifyScreenshot: (result) => shotNotifies.push(result),
              muted: MUTED,
              random: options.random,
              states: options.states,
              expose: (next) => {
                handle = next
              },
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

  const harness: Harness = {
    renderer: setup.renderer,
    spans: () => setup.captureSpans(),
    activeTimers: () => activeTimers,
    liveRequests: () => setup.renderer.liveRequestCount,
    setRunning,
    setSession,
    emit,
    duck: (text) => handle?.duck(text),
    handleSessionID: () => handle?.sessionID,
    copy: () => handle?.copy(),
    copies,
    notifies,
    screenshot: () => handle?.screenshot(),
    screenshots,
    shotNotifies,
    mouse: setup.mockMouse,
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
    dispose: async () => {
      if (!liveHarnesses.delete(harness)) return
      await setup.dispose()
    },
  }
  liveHarnesses.add(harness)
  return harness
}

/**
 * Tears the section down and mounts a fresh one over the same state store,
 * which is what OpenCode does when it rebuilds the sidebar for another session
 * and then comes back.
 */
export async function rebuild(previous: Harness, options: MountOptions): Promise<Harness> {
  await previous.unmount()
  await previous.dispose()
  return mount(options)
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
export function useClockAsGlobalTimers(clock: ManualClock): () => void {
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

export interface Mounted {
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
export async function mountClaim(
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
    () => {
      const content = element ?? claimRender({
        get sessionID() {
          return session()
        },
      })
      const commands = commandElement ?? commandRender()
      element = content
      commandElement = commands
      return [content, commands]
    },
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
export async function mountCommands(harness: Fake): Promise<() => Promise<void>> {
  const setup = await createTestRenderer({ width: PANEL_WIDTH, height: 12 })
  const commandRender = harness.claims.find((claim) => claim.append === "app")!
    .render as () => unknown
  let element: unknown
  await render(() => (element ??= commandRender()), setup.renderer)
  return async () => {
    await setup.dispose()
  }
}
