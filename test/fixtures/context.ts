import { tmpdir } from "node:os"
import { join } from "node:path"
import { RGBA } from "@opentui/core"
import type { CliRenderer } from "@opentui/core"
import type { ModelRef, Project, SessionInfo, SessionMessageInfo } from "@opencode/client"
import type { Context } from "@opencode/plugin/tui/context"
import type { JokeClient } from "../../src/joke.ts"
import { MODEL } from "./messages.ts"

export const SESSION = "ses_duck"
export const OTHER_SESSION = "ses_other"
export const PROJECT = "project-1"

/**
 * A default location no test should reach: it lives under the system temp
 * directory, so a fallback that is never exercised cannot write into the
 * repository the plugin is developed in.
 */
export const DEAD_DEFAULT = join(tmpdir(), "ducksay-default-location")

/** Both execution events carry the session and nothing else the section looks at. */
export const forSession = { data: { sessionID: SESSION } }
export const forOtherSession = { data: { sessionID: OTHER_SESSION } }

export function sessionInfo(overrides: Partial<Record<keyof SessionInfo, unknown>> = {}): SessionInfo {
  return {
    id: SESSION,
    projectID: PROJECT,
    title: "Fix the parser",
    model: MODEL,
    time: { created: 0, updated: 0 },
    ...overrides,
  } as unknown as SessionInfo
}

export function projectInfo(): Project {
  return {
    id: PROJECT,
    name: "ducksay",
    canonical: "/repo",
    time: { created: 0, updated: 0 },
    sandboxes: [],
  } as unknown as Project
}

export interface RegisteredCommand {
  readonly id: string
  readonly title?: string
  readonly bind?: unknown
  readonly palette?: unknown
  readonly slash?: { readonly name: string; readonly arguments?: boolean }
  run: (input?: string) => void
}

export interface ShownToast {
  readonly message?: string
  readonly title?: string
  readonly variant?: string
  readonly duration?: number
}

export interface Fake {
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

export function fake(
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

export interface DeferredCall {
  readonly input: { readonly sessionID: string; readonly prompt: string }
  readonly options?: { readonly signal?: AbortSignal }
  resolve: (value: { readonly text?: string }) => void
  reject: (error: Error) => void
}

/** A model client whose answers the test resolves by hand. */
export function deferredClient() {
  const calls: DeferredCall[] = []
  const createdModels: (ModelRef | undefined)[] = []
  const client: JokeClient = {
    session: {
      create: async (input) => {
        createdModels.push(input.model)
        return { id: "temp-session" }
      },
      generate: (input, options) =>
        new Promise((resolve, reject) => {
          calls.push({ input, options, resolve, reject })
          options?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true })
        }),
      remove: async () => {},
    },
  }
  return { client, calls, createdModels }
}
