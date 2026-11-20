import { afterAll, describe, expect, test } from "bun:test"
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { SessionInfo } from "@opencode/client"
import type { JokeClient } from "../src/joke.ts"
import plugin from "../src/tui.tsx"
import {
  DEAD_DEFAULT,
  OTHER_SESSION,
  SESSION,
  deferredClient,
  fake,
  forOtherSession,
  forSession,
  projectInfo,
  sessionInfo,
  type Fake,
  type RegisteredCommand,
} from "./fixtures/context.ts"
import { MODEL, assistantMessage, userMessage } from "./fixtures/messages.ts"
import { COLUMN_MS, FACING_LEFT_OPEN, RIGHT_EDGE, columnOf, facesRight } from "./fixtures/timing.ts"
import { mountClaim, mountCommands, type Mounted } from "./fixtures/render.tsx"

afterAll(() => {
  rmSync(DEAD_DEFAULT, { recursive: true, force: true })
})

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

  test("uses llmModel for the request and leaves the session model alone", async () => {
    const deferred = deferredClient()
    const mounted = await mountClaim({
      running: true,
      session: sessionInfo(),
      client: deferred.client,
      options: { llmModel: "opencode/big-pickle" },
    })

    try {
      await mounted.swim(5)
      mounted.harness.emit("session.execution.succeeded", forSession)
      await settle()

      expect(deferred.createdModels).toEqual([{ providerID: "opencode", id: "big-pickle" }])
      expect(deferred.createdModels[0]).not.toEqual(MODEL)
    } finally {
      await mounted.close()
    }
  })

  test("falls back with Quack-quack! and no toast when the configured model fails", async () => {
    const failing: JokeClient = {
      session: {
        create: async () => {
          throw new Error("model not found")
        },
        generate: async () => ({ text: "never" }),
        remove: async () => {},
      },
    }
    const mounted = await mountClaim({
      running: true,
      session: sessionInfo(),
      client: failing,
      options: { llmModel: "opencode/nope" },
    })

    try {
      await mounted.swim(5)
      mounted.harness.emit("session.execution.succeeded", forSession)
      await mounted.swim(RIGHT_EDGE + 6)
      await settle()

      expect(await mounted.frame()).toContain("Quack-quack!")
      expect(mounted.harness.toasts).toEqual([])
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

describe("logging", () => {
  function logText(directory: string): string {
    const logs = join(directory, ".opencode", "ducksay", "logs")
    return existsSync(logs)
      ? readdirSync(logs).sort().map((name) => readFileSync(join(logs, name), "utf8")).join("")
      : ""
  }

  function logLines(directory: string): Record<string, any>[] {
    const text = logText(directory).trim()
    return text === "" ? [] : text.split("\n").map((line) => JSON.parse(line))
  }

  function projectSession(directory: string): SessionInfo {
    return sessionInfo({ location: { directory } })
  }

  async function waitForFallback(mounted: Mounted): Promise<string> {
    mounted.harness.emit("session.execution.succeeded", forSession)
    await settle()
    let last = ""
    for (let step = 0; step < 120; step += 1) {
      last = await mounted.swim(1, 200)
      if (last.includes("Quack-quack!")) return last
    }
    throw new Error(`the logging test never reached a rest bubble:\n${last}`)
  }

  function command(harness: Fake, id: string): RegisteredCommand {
    return harness.commands.find((entry) => entry.id === id)!
  }

  test("logs an invalid option once when the plugin loads", async () => {
    const directory = mkdtempSync(join(tmpdir(), "ducksay-log-"))
    const harness = fake({ options: { swimSpeed: -5 }, defaultDirectory: directory })
    const cleanup = (await plugin.setup(harness.context)) as () => void

    try {
      const lines = logLines(directory)
      expect(lines).toHaveLength(1)
      expect(lines[0]).toMatchObject({
        level: "warn",
        event: "config.invalid",
        message: "The swimSpeed option is invalid.",
        data: { option: "swimSpeed", value: -5, effective: 10, reason: "fallback" },
      })
    } finally {
      await cleanup()
      rmSync(directory, { recursive: true, force: true })
    }
  })

  test("an unusable llmModel says Quack-quack! and logs one config warning", async () => {
    const directory = mkdtempSync(join(tmpdir(), "ducksay-log-"))
    let calls = 0
    const client: JokeClient = {
      session: {
        create: async () => {
          calls += 1
          return { id: "temp-session" }
        },
        generate: async () => {
          calls += 1
          return { text: "Quack!" }
        },
        remove: async () => {},
      },
    }
    const mounted = await mountClaim({
      running: true,
      session: sessionInfo(),
      options: { llmModel: "haiku" },
      client,
      defaultDirectory: directory,
    })

    try {
      const frame = await waitForFallback(mounted)
      expect(frame).toContain("Quack-quack!")
      expect(calls).toBe(0)
      expect(logLines(directory)).toHaveLength(1)
      expect(logLines(directory)[0]).toMatchObject({
        level: "warn",
        event: "config.invalid",
        data: { option: "llmModel", value: "haiku", effective: null, reason: "unusable" },
      })
      expect(logText(directory)).not.toContain("joke.model_unusable")
    } finally {
      await mounted.close()
      rmSync(directory, { recursive: true, force: true })
    }
  })

  test("logs a clipboard refusal without the joke text", async () => {
    const directory = mkdtempSync(join(tmpdir(), "ducksay-log-"))
    const mounted = await mountClaim({
      running: true,
      session: sessionInfo(),
      copyResult: false,
      defaultDirectory: directory,
    })

    try {
      await waitForFallback(mounted)
      command(mounted.harness, "duck.copy").run()
      await settle()

      const line = logLines(directory).find((entry) => entry.event === "copy.failed")
      expect(line).toMatchObject({
        level: "warn",
        event: "copy.failed",
        message: "The clipboard did not accept the joke.",
        data: { reason: "unavailable" },
      })
      expect(logText(directory)).not.toContain("Quack-quack!")
    } finally {
      await mounted.close()
      rmSync(directory, { recursive: true, force: true })
    }
  })

  test("logs a clipboard exception with reason threw", async () => {
    const directory = mkdtempSync(join(tmpdir(), "ducksay-log-"))
    const mounted = await mountClaim({
      running: true,
      session: sessionInfo(),
      copyResult: () => {
        throw new Error("clipboard broke")
      },
      defaultDirectory: directory,
    })

    try {
      await waitForFallback(mounted)
      command(mounted.harness, "duck.copy").run()
      await settle()

      const line = logLines(directory).find((entry) => entry.event === "copy.failed")
      expect(line).toMatchObject({
        level: "warn",
        event: "copy.failed",
        data: { reason: "threw" },
      })
      expect(line?.error.message).toBe("clipboard broke")
    } finally {
      await mounted.close()
      rmSync(directory, { recursive: true, force: true })
    }
  })

  test("logs a .gitignore failure but still saves the picture", async () => {
    const directory = mkdtempSync(join(tmpdir(), "ducksay-log-"))
    mkdirSync(join(directory, ".opencode", "ducksay", ".gitignore"), { recursive: true })
    const mounted = await mountClaim({
      running: true,
      session: projectSession(directory),
      defaultDirectory: directory,
    })

    try {
      await waitForFallback(mounted)
      command(mounted.harness, "duck.img").run()
      await settle()

      const line = logLines(directory).find((entry) => entry.event === "screenshot.gitignore_failed")
      expect(line).toMatchObject({
        level: "warn",
        event: "screenshot.gitignore_failed",
        data: { path: join(directory, ".opencode", "ducksay", ".gitignore") },
      })
      expect(logLines(directory).some((entry) => entry.event === "screenshot.save_failed")).toBe(false)
    } finally {
      await mounted.close()
      rmSync(directory, { recursive: true, force: true })
    }
  })

  test("logs a screenshot write failure with its phase", async () => {
    const directory = mkdtempSync(join(tmpdir(), "ducksay-log-"))
    const screenshots = join(directory, ".opencode", "ducksay", "screenshots")
    mkdirSync(screenshots, { recursive: true })
    chmodSync(screenshots, 0o500)
    const mounted = await mountClaim({
      running: true,
      session: projectSession(directory),
      defaultDirectory: directory,
    })

    try {
      await waitForFallback(mounted)
      command(mounted.harness, "duck.img").run()
      await settle()

      const line = logLines(directory).find((entry) => entry.event === "screenshot.save_failed")
      expect(line).toMatchObject({
        level: "error",
        event: "screenshot.save_failed",
        message: "The screenshot could not be saved.",
        data: { phase: "write" },
      })
      expect(line?.data.path).toContain("screenshots")
    } finally {
      chmodSync(screenshots, 0o700)
      await mounted.close()
      rmSync(directory, { recursive: true, force: true })
    }
  })

  test("logs a command that throws", async () => {
    const directory = mkdtempSync(join(tmpdir(), "ducksay-log-"))
    const harness = fake({ defaultDirectory: directory })
    const toast = harness.context.ui.toast as unknown as { show: () => void }
    toast.show = () => {
      throw new Error("toast broke")
    }
    const cleanup = (await plugin.setup(harness.context)) as () => void
    const unmount = await mountCommands(harness)

    try {
      command(harness, "duck.talk").run("hello")

      const line = logLines(directory).find((entry) => entry.event === "command.failed")
      expect(line).toMatchObject({
        level: "error",
        event: "command.failed",
        message: "A duck command failed.",
        data: { command: "duck" },
      })
    } finally {
      await unmount()
      await cleanup()
      rmSync(directory, { recursive: true, force: true })
    }
  })

  test("logs an event handler that throws", async () => {
    const directory = mkdtempSync(join(tmpdir(), "ducksay-log-"))
    const harness = fake({ defaultDirectory: directory })
    const cleanup = (await plugin.setup(harness.context)) as () => void

    try {
      const event = {
        data: {
          get sessionID(): string {
            throw new Error("event broke")
          },
        },
      }
      harness.emit("session.execution.started", event)

      const line = logLines(directory).find((entry) => entry.event === "event.failed")
      expect(line).toMatchObject({
        level: "error",
        event: "event.failed",
        message: "A duck event handler failed.",
        data: { event: "session.execution.started" },
      })
    } finally {
      await cleanup()
      rmSync(directory, { recursive: true, force: true })
    }
  })

  test("logs and rethrows a setup failure", async () => {
    const directory = mkdtempSync(join(tmpdir(), "ducksay-log-"))
    const harness = fake({ defaultDirectory: directory })
    const ui = harness.context.ui as unknown as { slot: () => void }
    ui.slot = () => {
      throw new Error("slot broke")
    }

    try {
      expect(() => plugin.setup(harness.context)).toThrow("slot broke")

      const line = logLines(directory).find((entry) => entry.event === "plugin.setup_failed")
      expect(line).toMatchObject({
        level: "error",
        event: "plugin.setup_failed",
        message: "The plugin setup failed.",
      })
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  test("does not log a busy or a muted command", async () => {
    for (const options of [{ running: true, session: sessionInfo() }, { running: true, session: sessionInfo(), options: { silent: true } }]) {
      const directory = mkdtempSync(join(tmpdir(), "ducksay-log-"))
      const mounted = await mountClaim({
        ...options,
        defaultDirectory: directory,
      })

      try {
        command(mounted.harness, "duck.talk").run("hello")
        await settle()
        expect(logText(directory)).toBe("")
      } finally {
        await mounted.close()
        rmSync(directory, { recursive: true, force: true })
      }
    }
  })

  test("does not log successful copy and screenshot commands", async () => {
    const directory = mkdtempSync(join(tmpdir(), "ducksay-log-"))
    const client: JokeClient = {
      session: {
        create: async () => ({ id: "temp-session" }),
        generate: async () => ({ text: "Quack-quack!" }),
        remove: async () => {},
      },
    }
    const mounted = await mountClaim({
      running: true,
      session: projectSession(directory),
      copyResult: true,
      client,
      defaultDirectory: directory,
    })

    try {
      await waitForFallback(mounted)
      command(mounted.harness, "duck.copy").run()
      command(mounted.harness, "duck.img").run()
      await settle()

      expect(logText(directory)).toBe("")
    } finally {
      await mounted.close()
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
