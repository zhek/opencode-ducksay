/** @jsxImportSource @opentui/solid */
import { Plugin } from "@opencode/plugin/tui"
import type { Context, Data } from "@opencode/plugin/tui/context"
import { TextAttributes } from "@opentui/core"
import type { BoxRenderable, CliRenderer, RGBA, TextRenderable } from "@opentui/core"
import {
  createComponent,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
} from "solid-js"
import { BUBBLE_CONTENT_ROWS } from "./bubble.ts"
import { PERSONA_SPRITES } from "./duck.ts"
import {
  createDuckState,
  createDuckStates,
  type DuckState,
  type DuckStates,
  type Mode,
  type Speech,
} from "./duck-state.ts"
import {
  clipUserText,
  createJokeGenerator,
  limitJokeMessages,
  type JokeInput,
  type JokeSource,
} from "./joke.ts"
import { laneLimit } from "./lane.ts"
import { createLogger, type Logger } from "./log.ts"
import { logConfigDiagnostic, logJokeFailure } from "./log-events.ts"
import {
  DEFAULT_SWIM_SPEED,
  diagnoseOptions,
  resolveContextDepth,
  resolveLlmModel,
  resolveLlmTimeout,
  resolvePersona,
  resolveSilent,
  resolveSwimSpeed,
} from "./options.ts"
import {
  copyGlyph,
  DEFAULT_PERSONA,
  greeting,
  nextPersona,
  toastHead,
  voice as personaVoice,
  type BeakState,
  type PersonaName,
} from "./persona.ts"
import { ScreenshotNamesExhaustedError, ScreenshotSaveError, saveScreenshot } from "./screenshot.ts"
import { startQuestionMarker, trackForms } from "./section/forms.ts"
import { createFeedback, sanitizeClipboardText } from "./section/icons.ts"
import { createJokeRunner, startSpeechTimers, SILENT_REPLY } from "./section/joke.ts"
import { composeRowsInto } from "./section/paint.ts"
import { defaultSchedule, type Schedule } from "./section/schedule.ts"
import { startSwim } from "./section/swim.ts"
import {
  THINKING_STEPS,
  beakOpen as beakOpenAt,
  bubbleWords,
  revealText,
  thinkingText,
} from "./thinking.ts"
import { COPY_FEEDBACK_MS, DEFAULT_BUBBLE_TEXT, SCREENSHOT_FEEDBACK_MS } from "./timing.ts"

export interface DuckSprites {
  readonly right: readonly string[]
  readonly left: readonly string[]
  readonly rightOpen: readonly string[]
  readonly leftOpen: readonly string[]
}

/** The words each toast carries after the persona's head. */
const BUSY_MESSAGE = "The duck is mid-quack. Try later."
const SILENT_MESSAGE = "The duck keeps mum."
const COPIED_MESSAGE = "Copied to clipboard"
const EMPTY_COPY_MESSAGE = "The duck hasn't said anything yet."
const FAILED_COPY_MESSAGE = "The terminal won't take the joke: clipboard is unavailable."
const SCREENSHOT_SAVED_MESSAGE = "Screenshot saved"
const FAILED_SCREENSHOT_MESSAGE = "Failed to save screenshot."
const NO_FRAME_MESSAGE = "The duck isn't in frame yet."

/** The copy glyph shown at the right of the heading. */
const COPY_ICON = "[copy]"

/** The screenshot glyph, one column to the left of `[copy]`. */
const IMG_ICON = "[img]"

/** The confirmation shown in the icon after a successful copy or screenshot. */
const COPY_DONE = "✓"

/** The wrapper put around a copied joke; the bubble itself stays plain. */
const COPY_SUFFIX = " (opencode-ducksay)"

/** What a copy attempt did, so both the icon and the command can report it. */
export type DuckCopyResult = "copied" | "empty" | "failed"

/** What a screenshot attempt did: written, not possible, or failed to write. */
export type DuckScreenshotResult = "saved" | "empty" | "failed"

/** What a `/duck` call did, so `setup` knows which toast to show. */
export type DuckCommandResult = "started" | "muted" | "busy"

/** The part of the mounted section the `/duck` command drives. */
export interface DuckHandle {
  /** The session currently displayed by this mount. */
  readonly sessionID: string | undefined
  duck(text: string | undefined): DuckCommandResult
  copy(): DuckCopyResult
  screenshot(): DuckScreenshotResult
  /**
   * Switches the displayed session to the next persona and returns its name,
   * or `undefined` when there is no session to switch.
   */
  cyclePersona(): PersonaName | undefined
}

/**
 * The `Ducksay` section of the session sidebar.
 *
 * The art is left-aligned within the lane and carries its own leading spaces,
 * and every line sets `wrapMode="none"` so a line stays on one row. The layout
 * is declared here rather than inherited: the sidebar's own slot container lays
 * its claims out in a row, which would otherwise run the heading and all three
 * art lines together into one line of text.
 *
 * The nine content rows — five of reserve above the duck, its three art lines
 * and the lower water line — are rendered as empty `<text>` elements and filled
 * imperatively. OpenCode transpiles plugin sources with Bun, whose JSX transform
 * is not Solid-aware: `content={line()}` would be evaluated once, at creation,
 * and the duck would never move. Effects and signals are unaffected — those are
 * real reactivity — so the frame loop below is a plain function that writes the
 * line contents and asks the renderer for a frame.
 *
 * For the same reason `isRunning` is a function rather than a boolean. The
 * slot's `sessionID` is reactive even though the host calls the claim's render
 * once, so the section watches it and swaps the per-session snapshot in place
 * instead of rebuilding its rows.
 */
export function Ducksay(props: {
  primary: RGBA
  swimSpeed?: number
  /** Turns the duck's speech off completely: no bubble, no text, no request. */
  silent?: boolean
  renderer?: CliRenderer
  data?: Data
  sessionID?: string
  /** Whether the session is already working when the section appears. */
  isRunning?: () => boolean
  schedule?: Schedule
  sprites?: DuckSprites
  /**
   * The persona a session starts with, taken from the `persona` option. A
   * session that is already in the store keeps its own character instead.
   */
  persona?: PersonaName
  /** The rest bubble's message; tests change it, the plugin never does. */
  bubbleText?: string
  /**
   * Chance source for the rare cow cameo. The plugin leaves it out and uses
   * `Math.random`; tests pass a constant so a crossing is deterministic.
   */
  random?: () => number
  /**
   * Asks for one joke at the end of a turn. Without it the bubble is the static
   * `bubbleText`, which is what the geometry tests use.
   */
  joke?: (signal: AbortSignal, input?: JokeInput) => Promise<string | undefined>
  /**
   * Writes text to the terminal clipboard. Without it the heading has no copy
   * icon, which keeps existing frame tests and the demo render unchanged.
   */
  copy?: (text: string) => boolean
  /** Reports a copy attempt made from the icon; the command reports its own. */
  notify?: (result: "copied" | "failed") => void
  /**
   * Saves the scene as a PNG. It receives the nine rows and the lane width, so
   * the picture is exactly what the section shows; without it the heading has
   * no `[img]` icon.
   */
  screenshot?: (frame: { rows: readonly string[]; width: number }) => DuckScreenshotResult
  /** Reports a screenshot attempt made from the icon; the command reports its own. */
  notifyScreenshot?: (result: DuckScreenshotResult) => void
  /** Colour of a dimmed, unavailable icon. */
  muted?: RGBA
  /** Registers the live handle the `/duck` command drives; `undefined` clears it. */
  expose?: (handle: DuckHandle | undefined) => void
  /**
   * Per-session state that outlives this component. The plugin hands in one
   * store for its whole lifetime, so a session whose sidebar was rebuilt gets
   * its duck back in the same place. Without it the section keeps its state for
   * the current mount only, which is what the static rendering tests use.
   */
  states?: DuckStates
}) {
  const initialSessionID = props.sessionID
  const stored = props.states !== undefined && initialSessionID !== undefined
    ? props.states.get(initialSessionID)
    : undefined
  let state: DuckState = stored ?? createDuckState({
    jokeText: props.bubbleText ?? DEFAULT_BUBBLE_TEXT,
    persona: props.persona ?? DEFAULT_PERSONA,
  })
  if (stored === undefined && props.states !== undefined && initialSessionID !== undefined) {
    props.states.set(initialSessionID, state)
  }
  /**
   * The session whose snapshot `state` currently holds. The host keeps the
   * section mounted and updates `sessionID` reactively, so this is what tells
   * the switch effect that the duck has to move to another session's snapshot.
   */
  let activeSessionID = initialSessionID

  // A session can finish while another tab is shown: its snapshot then still
  // says `swim` and `idle`. A fresh mount has no busy change to observe, so the
  // turn is settled here instead of being lost.
  const hiddenTurn = state.mode === "swim" && state.speech === "idle" && props.isRunning?.() !== true
  const initialSpeech: Speech =
    hiddenTurn && props.silent !== true ? (props.joke === undefined ? "ready" : "waiting") : state.speech

  const [mode, setMode] = createSignal<Mode>(state.mode)
  const [busy, setBusy] = createSignal(props.isRunning?.() === true)
  const [speech, setSpeech] = createSignal<Speech>(initialSpeech)
  const [jokeText, setJokeText] = createSignal(state.jokeText)
  // The character this session wears: the art, the toast heads and the copied
  // head all follow this one signal, and `/duck.persona` is what moves it.
  const [personaName, setPersonaName] = createSignal<PersonaName>(state.persona)
  // Index into `THINKING_STEPS`: which frame of the waiting dots is on screen.
  const [dotsStep, setDotsStep] = createSignal(state.dotsStep)
  // How many words of the joke have been shown. The answer sets it to `1`, so
  // the first word replaces the waiting dots without an empty frame.
  const [shown, setShown] = createSignal(state.shown)
  // Forms of this session that are still waiting for an answer. A set rather
  // than a counter so a repeated event for one form cannot keep the marker up
  // after that form is gone.
  const [askedForms, setAskedForms] = createSignal<ReadonlySet<string>>(new Set())
  // The marker frame starts at `?` and advances while at least one form waits.
  const [questionFrame, setQuestionFrame] = createSignal(0)
  // The icon's hover state. The confirmation lives in its own feedback timer.
  const [hovered, setHovered] = createSignal(false)
  // The screenshot icon keeps its own confirmation and hover state, so the two
  // icons can flash independently without sharing a timer.
  const [shotHovered, setShotHovered] = createSignal(false)
  // Refs are assigned after the first effect pass under Bun's JSX transform, so
  // this signal makes the icon effect run again once both nodes exist.
  const [iconReady, setIconReady] = createSignal(false)
  const [shotReady, setShotReady] = createSignal(false)
  let iconBox: BoxRenderable | undefined
  let iconText: TextRenderable | undefined
  let shotBox: BoxRenderable | undefined
  let shotText: TextRenderable | undefined
  let gapBox: BoxRenderable | undefined

  // Several effects can react to one change; ask the renderer for one frame per
  // microtask instead of one per effect.
  let renderQueued = false
  const requestRender = () => {
    if (renderQueued) return
    renderQueued = true
    queueMicrotask(() => {
      renderQueued = false
      props.renderer?.requestRender()
    })
  }

  const schedule = props.schedule ?? defaultSchedule
  const copyFeedback = createFeedback(COPY_FEEDBACK_MS, schedule, requestRender)
  const shotFeedback = createFeedback(SCREENSHOT_FEEDBACK_MS, schedule, requestRender)

  /**
   * True while the displayed session has a pending form. It is a memo so the
   * marker timer and the rest timers only restart when the state flips, not
   * every time a second form is added or removed.
   */
  const frozen = createMemo(() => askedForms().size > 0)

  // The lane is measured after the rows are built. Reading its width through a
  // signal means the first real measurement releases a bubble that was waiting
  // for the room, and a resize is followed without a special case.
  const [laneWidth, setLaneWidth] = createSignal(0)
  let laneBox: BoxRenderable | undefined
  let lastBusy = busy()
  const lines: (TextRenderable | undefined)[] = []
  /**
   * The nine rows as they were last painted. The screenshot icon hands them to
   * `props.screenshot` so the PNG is the frame the reader was looking at, not a
   * recomposition that could disagree with the screen.
   */
  let paintedRows: string[] = new Array(BUBBLE_CONTENT_ROWS).fill("")
  let workRows: string[] = new Array(BUBBLE_CONTENT_ROWS).fill("")

  const sprites = () => props.sprites ?? PERSONA_SPRITES[personaName()]
  const artWidth = createMemo(() => {
    const { right, left, rightOpen, leftOpen } = sprites()
    return Math.max(
      0,
      ...right.map((line) => line.length),
      ...left.map((line) => line.length),
      ...rightOpen.map((line) => line.length),
      ...leftOpen.map((line) => line.length),
    )
  })
  /**
   * The box the section is laid out in. It is measured rather than derived from
   * OpenCode's panel constants, so the duck keeps working whatever width the
   * host gives it. `flexGrow` makes the box span the lane; without it the box
   * shrinks to the art and there is no room to swim at all.
   */
  const limit = () => laneLimit(laneWidth(), artWidth())

  const jokeRunner = createJokeRunner({
    state: () => state,
    joke: props.joke,
    silent: props.silent === true,
    limit: () => limit(),
    setSpeech,
    setJokeText,
    setShown,
  })
  const cancelJoke = (reason: "turn" | "unmount" = "turn") => jokeRunner.cancel(reason)

  /**
   * Copies the reactive view back into the snapshot. A live request leaves
   * `speech` at `waiting`, which is what lets the next mount ask again instead
   * of sitting on dots that will never advance.
   */
  const writeSnapshot = () => {
    state.mode = mode()
    state.speech = speech()
    state.jokeText = jokeText()
    state.dotsStep = dotsStep()
    state.shown = shown()
    state.persona = personaName()
  }

  /**
   * Moves the section to another session without rebuilding its rows.
   *
   * The host calls the claim's `render` once, so `sessionID` is the only prop
   * that changes on a tab switch. Saving the departing snapshot first keeps
   * that tab where it was; loading the arriving one restores its column, pose
   * and bubble. The old request is cancelled with its debt recorded, and the
   * new session's running state is copied into `lastBusy` so the switch itself
   * is not mistaken for the end of a turn.
   */
  createEffect(() => {
    const nextSessionID = props.sessionID
    if (nextSessionID === activeSessionID) return
    const previousSessionID = activeSessionID
    activeSessionID = nextSessionID
    copyFeedback.clear()
    shotFeedback.clear()

    if (previousSessionID !== undefined && props.states !== undefined) {
      writeSnapshot()
      props.states.set(previousSessionID, state)
    }
    cancelJoke("turn")

    const nextState = nextSessionID !== undefined ? props.states?.get(nextSessionID) : undefined
    state = nextState ?? createDuckState({
      jokeText: props.bubbleText ?? DEFAULT_BUBBLE_TEXT,
      persona: props.persona ?? DEFAULT_PERSONA,
    })
    if (nextSessionID !== undefined) props.states?.set(nextSessionID, state)

    const running = props.isRunning?.() === true
    const hiddenTurn = !running && state.mode === "swim" && state.speech === "idle"
    setMode(state.mode)
    setSpeech(hiddenTurn && props.silent !== true ? (props.joke === undefined ? "ready" : "waiting") : state.speech)
    setJokeText(state.jokeText)
    setDotsStep(state.dotsStep)
    setShown(state.shown)
    setPersonaName(state.persona)
    setAskedForms(new Set<string>())
    setQuestionFrame(0)

    lastBusy = running
    setBusy(running)
    // A snapshot can say `swim` even though the session finished while another
    // tab was shown. The mode effect does not see a busy change in that case,
    // so settle the mode here the same way it would on a fresh mount.
    setMode((current) => (running ? "swim" : current === "swim" ? "dock" : current))
    // Two resting sessions can have identical signals while their columns and
    // headings differ. The snapshot swap would then wake no effect, so paint
    // the new pose explicitly.
    paint()
    requestRender()
  })

  /**
   * Whether this lane may speak at all. `silent` is the explicit switch; a lane
   * narrower than the art has no room for a bubble and stays quiet for that
   * separate reason. The turn is still tracked in both cases.
   */
  const speechAllowed = () => props.silent !== true && limit() > 0
  /**
   * The bubble is shown for the rest that follows a finished turn: either the
   * waiting dots, while the answer is on its way, or the joke itself. The duck's
   * rows and the section's height do not depend on which of the two is there.
   * The start-up rest has `speech: "idle"` and no bubble.
   */
  const bubbleVisible = () => mode() === "rest" && speech() !== "idle" && !frozen() && speechAllowed()
  /**
   * Whether the beak is open. It stays shut until there is a joke to say, so a
   * waiting duck does not look like it is talking over the dots. While the joke
   * is being typed it follows the word cadence, and the last word always leaves
   * it open. A static `bubbleText` is not animated, so it is open throughout.
   */
  const beakOpen = () => {
    if (!bubbleVisible()) return false
    if (props.joke === undefined) return true
    if (speech() !== "ready") return false
    return beakOpenAt(shown(), bubbleWords(jokeText()).length)
  }
  /**
   * What the bubble currently says. The waiting dots replace the joke text
   * until an answer arrives, so a failed or slow request never leaves the
   * previous turn's joke on screen. A generated joke is revealed word by word;
   * the static test seam is shown whole.
   */
  const bubbleText = () => {
    if (speech() === "waiting") return thinkingText(THINKING_STEPS[dotsStep()] ?? 1)
    if (props.joke === undefined) return jokeText()
    return revealText(jokeText(), shown())
  }
  /**
   * A copy needs a clipboard, a visible bubble and a finished joke. The bubble
   * already rules out `silent`, a narrow lane and an open question.
   */
  const canCopy = () =>
    props.copy !== undefined && bubbleVisible() && speech() === "ready" && jokeText().trim() !== ""
  /**
   * Copies the raw joke, not the truncated bubble. The wrapper is app-level
   * output only: it never reaches `jokeText()` or the bubble, so copying twice
   * cannot nest it. Returns the outcome and leaves all toasts to the caller.
   */
  const copyJoke = (): DuckCopyResult => {
    if (!canCopy()) return "empty"
    try {
      const accepted = props.copy?.(sanitizeClipboardText(copyGlyph(personaName()) + " " + jokeText().trim() + COPY_SUFFIX))
      if (accepted !== true) {
        copyFeedback.clear()
        return "failed"
      }
    } catch {
      copyFeedback.clear()
      return "failed"
    }
    copyFeedback.start()
    return "copied"
  }
  /**
   * A screenshot needs a lane wide enough for the duck and a writer to hand the
   * frame to. Unlike copying it does not care about the speech, the bubble or a
   * pending question: the picture is a snapshot of whatever is on screen.
   */
  const canScreenshot = () => props.screenshot !== undefined && limit() > 0
  /**
   * Writes the last painted frame. The result is returned rather than toasted,
   * so the icon and `/duck.img` show the same message from one place in
   * `setup`; `empty` means there is no section worth photographing.
   */
  const capture = (): DuckScreenshotResult => {
    if (!canScreenshot()) return "empty"
    let result: DuckScreenshotResult
    try {
      const written = props.screenshot?.({ rows: paintedRows, width: laneWidth() })
      result = written === "saved" ? "saved" : written === "empty" ? "empty" : "failed"
    } catch {
      result = "failed"
    }
    if (result === "saved") shotFeedback.start()
    else shotFeedback.clear()
    return result
  }

  const art = () => {
    const set = sprites()
    if (state.direction === 1) return beakOpen() ? set.rightOpen : set.right
    return beakOpen() ? set.leftOpen : set.left
  }

  // The icon is static JSX; Solid signals write its content, colour and
  // visibility. Hiding it with `visible` keeps the heading row one line high.
  createEffect(() => {
    const ready = iconReady()
    const available = canCopy()
    const done = copyFeedback.active()
    const over = hovered()
    const shown = props.copy !== undefined && speechAllowed()
    if (ready && iconText !== undefined) {
      iconText.content = shown ? (done ? COPY_DONE : COPY_ICON) : ""
      iconText.fg = available ? props.primary : (props.muted ?? props.primary)
      iconText.attributes = available && over ? TextAttributes.BOLD : TextAttributes.NONE
    }
    if (iconBox !== undefined) iconBox.visible = shown
    if (gapBox !== undefined) gapBox.visible = shown
    requestRender()
  })

  // The screenshot icon is always lit while the lane can hold the duck: it has
  // no "nothing to copy" state, so it never dims. Its label, confirmation and
  // hover weight are written the same imperative way as the copy icon's.
  createEffect(() => {
    const ready = shotReady()
    const done = shotFeedback.active()
    const over = shotHovered()
    const available = canScreenshot()
    if (ready && shotText !== undefined) {
      shotText.content = available ? (done ? COPY_DONE : IMG_ICON) : ""
      shotText.fg = props.primary
      shotText.attributes = available && over ? TextAttributes.BOLD : TextAttributes.NONE
    }
    if (shotBox !== undefined) shotBox.visible = available
    requestRender()
  })

  // Losing the joke, the bubble or the clipboard must not leave a stale `✓`.
  createEffect(() => {
    if (!canCopy()) copyFeedback.clear()
    if (!canScreenshot()) shotFeedback.clear()
  })

  /**
   * Parks the duck: inside the lane, nose towards the middle of it. Every route
   * into `rest` goes through here, so the pose a reader sees at rest is the same
   * whichever wall it came to rest against.
   */
  const park = () => {
    const reach = limit()
    state.column = Math.min(Math.max(state.column, 0), reach)
    state.direction = state.column * 2 <= reach ? 1 : -1
    // The cow only belongs to the swim. Reaching rest removes it rather than
    // leaving a frozen cameo over a duck that has stopped.
    state.cow = undefined
  }

  /**
   * Draws the current sprite at the current column, with the water under it,
   * and lays the bubble over the rows beside the duck when it is showing.
   *
   * Two buffers are swapped on every frame: the working array is cleared and
   * refilled in place, and `paintedRows` keeps the frame the icon will hand to
   * the screenshot writer without allocating a new array per paint.
   */
  const paint = () => {
    composeRowsInto(workRows, {
      state,
      mode: mode(),
      frozen: frozen(),
      questionFrame: questionFrame(),
      sprite: art(),
      laneWidth: laneWidth(),
      artWidth: artWidth(),
      bubbleVisible: bubbleVisible(),
      bubbleText: bubbleText(),
    })

    for (const [index, text] of lines.entries()) {
      if (text !== undefined) text.content = workRows[index] ?? ""
    }
    const previous = paintedRows
    paintedRows = workRows
    workRows = previous
  }

  /**
   * The duck follows the session it belongs to.
   *
   * `session.status` would be the precise signal, but the host does not publish
   * it: a turn produces `session.execution.*` and `session.text.*`. The swim is
   * driven by the execution events, which cover the whole turn — generation,
   * tool calls, permission prompts. Status stays subscribed to as well: on a
   * host that publishes it, a retry keeps the duck swimming, and every event
   * is applied in timestamp order. A status event is ephemeral: one can
   * arrive after the turn it described has already ended, and without the
   * ordering check it would start the swim again. The same guard keeps a late
   * idle from stopping a newer turn that has already started.
   */
  createEffect(() => {
    const data = props.data
    const sessionID = props.sessionID
    if (data === undefined || sessionID === undefined) return
    const mine = (event: { data?: { sessionID?: string } }) => event.data?.sessionID === sessionID
    const set = (value: boolean) => setBusy((current) => (current === value ? current : value))
    let latestAt = Number.NEGATIVE_INFINITY
    const apply = (event: { created?: number }, value: boolean) => {
      if (typeof event.created === "number") {
        if (event.created < latestAt) return
        latestAt = event.created
      } else if (latestAt !== Number.NEGATIVE_INFINITY) {
        // Once the host supplies timestamps, an untimed event is treated as
        // older: a late `session.status` without `created` must not restart a
        // turn that a timestamped completion already ended.
        return
      }
      set(value)
    }

    const stops = [
      data.on("session.execution.started", (event) => {
        if (mine(event)) apply(event, true)
      }),
      data.on("session.execution.succeeded", (event) => {
        if (mine(event)) apply(event, false)
      }),
      data.on("session.execution.failed", (event) => {
        if (mine(event)) apply(event, false)
      }),
      data.on("session.execution.interrupted", (event) => {
        if (mine(event)) apply(event, false)
      }),
      data.on("session.idle", (event) => {
        if (mine(event)) apply(event, false)
      }),
      data.on("session.status", (event) => {
        if (mine(event)) apply(event, event.data.status.type !== "idle")
      }),
    ]
    onCleanup(() => {
      for (const stop of stops) stop()
    })
  })

  trackForms({
    data: () => props.data,
    sessionID: () => props.sessionID,
    currentSessionID: () => props.sessionID,
    setAskedForms,
  })

  // Reading `busy` here is what makes the mode follow the session: a busy
  // session starts the swim, an idle one turns a swim into a dock. At zero
  // speed there is no dock to animate, so the duck settles straight into rest.
  // Any other transition leaves the mode alone, so a session that goes busy
  // again mid-dock resumes swimming instead of restarting the dock.
  createEffect(() => {
    const working = busy()
    const swimSpeed = props.swimSpeed ?? DEFAULT_SWIM_SPEED
    if (swimSpeed <= 0) {
      // A duck that never swims has no crossing to make a cow come out of, so
      // an active cameo is dropped instead of standing over a still duck.
      if (state.cow !== undefined) {
        state.cow = undefined
        paint()
        requestRender()
      }
      setMode(working ? "swim" : "rest")
      return
    }
    if (working) {
      setMode("swim")
      return
    }
    setMode((current) => (current === "swim" ? "dock" : current))
  })

  // A turn that ends owes speech even if the duck never moved: a short turn, a
  // zero-speed duck and a still duck all finish a turn. The lane can still be
  // too narrow for a bubble, and `silent` can turn speech off, but neither
  // changes the fact that the turn happened.
  createEffect(() => {
    const working = busy()
    if (working === lastBusy) return
    const wasBusy = lastBusy
    lastBusy = working

    if (working) {
      // A new turn replaces the turn before it: the pending request is aborted
      // and the new turn asks for its own joke when it ends. A `/duck` reply
      // belongs to the old request, so it must not survive into the new one.
      cancelJoke("turn")
      state.pendingReply = undefined
      setSpeech("idle")
      setJokeText(DEFAULT_BUBBLE_TEXT)
      setDotsStep(0)
      setShown(0)
      return
    }

    if (!wasBusy) return
    if (props.silent === true) {
      setSpeech("idle")
      return
    }
    setSpeech(props.joke === undefined ? "ready" : "waiting")
  })

  /**
   * The `/duck` entry point. The checks mirror the states the section already
   * treats as busy: a running session, a dock in progress, a pending form, a
   * lane without room, or an answer still on its way.
   */
  const duck = (text: string | undefined): DuckCommandResult => {
    if (props.silent === true) return "muted"
    if (props.sessionID === undefined || limit() <= 0) return "busy"
    if (frozen() || busy() || mode() !== "rest") return "busy"
    if (speech() === "waiting" && jokeRunner.hasRequest()) return "busy"
    const reply = text === undefined || text.trim() === "" ? SILENT_REPLY : clipUserText(text)
    state.pendingReply = reply
    if (!jokeRunner.start()) {
      state.pendingReply = undefined
      return "busy"
    }
    return "started"
  }

  /**
   * The `/duck.persona` entry point. The section owns the snapshot, so the
   * switch happens here: the signal changes, the snapshot follows at once, and
   * the art is repainted. Without a session there is nothing to switch, which
   * the command reports as `undefined`.
   */
  const cyclePersona = (): PersonaName | undefined => {
    if (props.sessionID === undefined) return undefined
    const next = nextPersona(personaName())
    // A joke belongs to the voice that said it: drop a pending request and
    // close a bubble that is still on screen, so the next words are in the new
    // character's voice instead of the old one's.
    if (speech() === "waiting" || speech() === "ready") {
      cancelJoke("turn")
      state.pendingReply = undefined
      setSpeech("idle")
      setJokeText(props.bubbleText ?? DEFAULT_BUBBLE_TEXT)
      setShown(0)
      setDotsStep(0)
    }
    setPersonaName(next)
    state.persona = next
    paint()
    requestRender()
    return next
  }

  // The command lives in `setup`, the speech lives here. The handle is a view
  // on this mount: `sessionID` stays reactive across tab switches, and cleanup
  // removes it so the command cannot reach a disposed section.
  props.expose?.({
    get sessionID() {
      return props.sessionID
    },
    duck,
    copy: copyJoke,
    screenshot: capture,
    cyclePersona,
  })
  onCleanup(() => {
    props.expose?.(undefined)
    copyFeedback.clear()
    shotFeedback.clear()
  })

  // A request belongs to the end of a turn, not to the rest pose: it starts
  // while the duck docks, so the bubble is usually ready by the time it stops.
  // A pending form holds it back until the last one closes; a turn that became
  // busy again holds it back until its own end. A `waiting` snapshot left by a
  // cancelled request starts a new request when the section comes back.
  createEffect(() => {
    const waiting = speech() === "waiting"
    const working = busy()
    const blocked = frozen()
    const allowed = speechAllowed()
    if (!waiting || working || blocked || !allowed) return
    if (jokeRunner.hasRequest()) return
    jokeRunner.start()
  })

  // The signals are the reactive view; the snapshot is what a later mount
  // reads. Writing it on every change keeps the two from drifting apart, and
  // the cleanup writes once more for a change that landed as the section went
  // away.
  createEffect(() => {
    writeSnapshot()
  })

  onCleanup(() => {
    writeSnapshot()
    // A cancelled request never delivers its answer, so `speech` stays
    // `waiting` and the next mount asks again instead of sitting on dots that
    // will never advance.
    cancelJoke("unmount")
  })

  // `paint` writes imperative lines, so a signal change needs an explicit
  // repaint and frame request. The waiting and typing timers only move signals;
  // they never paint on their own.
  createEffect(() => {
    speech()
    jokeText()
    dotsStep()
    shown()
    questionFrame()
    frozen()
    paint()
    requestRender()
  })

  startQuestionMarker({
    frozen,
    renderer: () => props.renderer,
    schedule,
    setQuestionFrame,
  })

  startSpeechTimers({
    renderer: () => props.renderer,
    joke: props.joke,
    bubbleVisible,
    speech,
    jokeText,
    shown,
    setDotsStep,
    setShown,
    schedule,
  })

  startSwim({
    state,
    mode,
    setMode,
    frozen,
    limit,
    swimSpeed: () => props.swimSpeed ?? DEFAULT_SWIM_SPEED,
    random: () => (props.random ?? Math.random)(),
    park,
    paint,
    requestRender,
    schedule,
  })

  // The reserve above the duck, the three art rows and the lower water row.
  // This never changes with the bubble: the duck must not move when it appears
  // or goes away, and the sidebar must not jump either.
  const lineCount = BUBBLE_CONTENT_ROWS

  return (
    <box
      flexGrow={1}
      flexDirection="column"
      alignItems="flex-start"
      ref={(box) => {
        laneBox = box
        setLaneWidth(box.width)
      }}
      onSizeChange={() => {
        setLaneWidth(laneBox?.width ?? 0)
        paint()
        requestRender()
      }}
    >
      <box flexDirection="row" width="100%" height={1} alignItems="center">
        <text fg={props.primary}>
          <b>Ducksay</b>
        </text>
        <box flexGrow={1} height={1} />
        <box
          width={5}
          height={1}
          flexShrink={0}
          justifyContent="center"
          alignItems="center"
          onMouseUp={(event) => {
            if (event.button !== 0) return
            const result = capture()
            if (result !== "empty") props.notifyScreenshot?.(result)
          }}
          onMouseOver={() => setShotHovered(true)}
          onMouseOut={() => setShotHovered(false)}
          ref={(box) => {
            shotBox = box
            box.visible = props.screenshot !== undefined && limit() > 0
          }}
        >
          <text
            wrapMode="none"
            fg={props.primary}
            ref={(text) => {
              shotText = text
              text.content = props.screenshot !== undefined && limit() > 0 ? IMG_ICON : ""
              text.attributes = TextAttributes.NONE
              setShotReady(true)
            }}
          >
            {IMG_ICON}
          </text>
        </box>
        {/* The one-column gap belongs to the copy icon: when it is hidden, the
            screenshot icon moves flush to the right edge instead of leaving a
            hole behind. */}
        <box
          width={1}
          height={1}
          flexShrink={0}
          ref={(box) => {
            gapBox = box
            box.visible = props.copy !== undefined && props.silent !== true && limit() > 0
          }}
        />
        <box
          width={6}
          height={1}
          flexShrink={0}
          justifyContent="center"
          alignItems="center"
          visible={props.copy !== undefined && props.silent !== true}
          onMouseUp={(event) => {
            if (event.button !== 0) return
            const result = copyJoke()
            if (result !== "empty") props.notify?.(result)
          }}
          onMouseOver={() => setHovered(true)}
          onMouseOut={() => setHovered(false)}
          ref={(box) => {
            iconBox = box
            box.visible = props.copy !== undefined && props.silent !== true && limit() > 0
          }}
        >
          <text
            wrapMode="none"
            fg={props.muted ?? props.primary}
            ref={(text) => {
              iconText = text
              text.content = props.copy !== undefined && props.silent !== true && limit() > 0 ? COPY_ICON : ""
              setIconReady(true)
            }}
          >
            {COPY_ICON}
          </text>
        </box>
      </box>
      {Array.from({ length: lineCount }, (_, index) => (
        // The ref paints its own line: `onMount` runs before refs are assigned,
        // so a single paint there would leave every line empty.
        <text
          wrapMode="none"
          ref={(text) => {
            lines[index] = text
            paint()
          }}
        />
      ))}
    </box>
  )
}

/**
 * The project root a log line belongs to: where the session works, the location
 * the TUI is showing, or the location the server calls the default.
 */
function logDirectory(context: Context, sessionID?: string): string {
  const session = sessionID === undefined ? undefined : context.data.session.get(sessionID)
  return session?.location?.directory
    ?? context.location?.directory
    ?? context.data.location.default().directory
}

function setupDucksay(context: Context, log: Logger): (() => void) | undefined {
  const swimSpeed = resolveSwimSpeed(context.options)
  const silent = resolveSilent(context.options)
  const llmTimeout = resolveLlmTimeout(context.options)
  const contextDepth = resolveContextDepth(context.options)
  const llmModel = resolveLlmModel(context.options)
  const optionPersona = resolvePersona(context.options)
  const rawLlmModel = typeof context.options?.llmModel === "string" ? context.options.llmModel : undefined
  for (const diagnostic of diagnoseOptions(context.options)) logConfigDiagnostic(log, diagnostic)
  // Read once, when the section appears: the panel may open in the middle of
  // a turn, long before the next event arrives.
  const workingNow = (sessionID: string) => context.data.session.status(sessionID) === "running"
  // One store for the whole plugin lifetime. OpenCode rebuilds the sidebar
  // when the displayed session changes, and a new section without this would
  // start from the left edge instead of coming back where it was.
  const states = createDuckStates()
  // The command runs in `setup`, the speech lives in the mounted section.
  // The handle is the bridge; it is absent while no section is mounted.
  let handle: DuckHandle | undefined

  // A new turn clears the dialogue even for a session that is not displayed:
  // the exchanges belonged to the turn that just ended. The section filters
  // execution events by its own session, so this listener is not duplicated.
  const stopDialogueReset = context.data.on("session.execution.started", (event) => {
    let sessionID: string | undefined
    try {
      sessionID = event.data?.sessionID
      if (sessionID === undefined) return
      const state = states.get(sessionID)
      if (state === undefined) return
      state.dialogue = []
      state.pendingReply = undefined
    } catch (error) {
      log.error("event.failed", "A duck event handler failed.", {
        session: sessionID,
        error,
        data: { event: "session.execution.started" },
      })
    }
  })

  // The request reads the cache when the turn ends, not when the panel opens:
  // by then `data` has the messages the turn produced. Without a session
  // there is nothing to joke about, so the generator falls back to
  // `Quack-quack!` instead of sending an empty prompt.
  const jokeSource = (sessionID: string): JokeSource | undefined => {
    const session = context.data.session.get(sessionID)
    if (session === undefined) return undefined
    const project = context.data.project.get(session.projectID)
    const vcs = context.data.location.vcs.info()
    return {
      session,
      project,
      branch: vcs?.branch.current ?? vcs?.branch.default,
      messages: limitJokeMessages(context.data.session.message.list(sessionID), contextDepth),
    }
  }

  // The command belongs to the keymap layer, not to the section: it stays
  // available while the sidebar is rebuilt. It reaches the mounted section
  // through the handle and refuses a session other than the displayed one.
  const currentSession = () => {
    const route = context.ui.router.current()
    return route?.type === "session" ? route.sessionID : undefined
  }
  const showToast = (message: string, variant: "info" | "success" | "error") =>
    context.ui.toast.show({ message, variant, duration: 2000 })
  /**
   * The persona the toasts wear: the displayed session's own character, or the
   * option's when no session is displayed. The clipboard wrapper uses the
   * section's snapshot directly, so only the toasts need this fallback.
   */
  const displayedPersona = (): PersonaName => {
    const sessionID = currentSession()
    return (sessionID === undefined ? undefined : states.get(sessionID)?.persona) ?? optionPersona
  }
  /** One toast message: the persona's head, a space, then the words. */
  const toast = (beak: BeakState, message: string): string =>
    `${toastHead(displayedPersona(), beak)} ${message}`
  const reportCopy = (result: DuckCopyResult) => {
    if (result === "copied") showToast(toast("open", COPIED_MESSAGE), "success")
    else if (result === "failed") showToast(toast("open", FAILED_COPY_MESSAGE), "error")
    else showToast(toast("closed", EMPTY_COPY_MESSAGE), "info")
  }
  const runCommand = (command: "duck" | "duck.copy" | "duck.img" | "duck.persona", run: () => void) => {
    try {
      run()
    } catch (error) {
      log.error("command.failed", "A duck command failed.", {
        session: currentSession(),
        error,
        data: { command },
      })
    }
  }
  const duckCommand = (input: string | undefined) => runCommand("duck", () => {
    const sessionID = currentSession()
    const result = sessionID !== undefined && handle !== undefined && handle.sessionID === sessionID
      ? handle.duck(input)
      : "busy"
    if (result === "muted") showToast(toast("closed", SILENT_MESSAGE), "info")
    else if (result === "busy") showToast(toast("open", BUSY_MESSAGE), "info")
  })
  /**
   * The persona switch stays out of `silent`: the toast is a UI notification,
   * not duck speech, so the character still changes and greets the user.
   */
  const personaCommand = () => runCommand("duck.persona", () => {
    const sessionID = currentSession()
    const next = sessionID !== undefined && handle !== undefined && handle.sessionID === sessionID
      ? handle.cyclePersona()
      : undefined
    if (next !== undefined) showToast(greeting(next), "success")
  })
  const copyCommand = () => runCommand("duck.copy", () => {
    const sessionID = currentSession()
    const result = sessionID !== undefined && handle !== undefined && handle.sessionID === sessionID
      ? handle.copy()
      : "empty"
    reportCopy(result)
  })
  const copyToClipboard = (text: string) => {
    try {
      const accepted = context.renderer.copyToClipboardOSC52(text)
      if (accepted !== true) {
        log.warn("copy.failed", "The clipboard did not accept the joke.", {
          session: currentSession(),
          data: { reason: "unavailable" },
        })
        return false
      }
      return true
    } catch (error) {
      log.warn("copy.failed", "The clipboard did not accept the joke.", {
        session: currentSession(),
        error,
        data: { reason: "threw" },
      })
      return false
    }
  }
  /**
   * The project root a screenshot belongs to: where the session works, or the
   * location the TUI is showing, or the location the server calls default.
   * All three are absolute paths the host hands over, so a plugin attached to
   * a remote server never writes into whatever directory the TUI happened to
   * start in. `location` is optional here because the record arrives over the
   * wire: an older or partial session must send the picture to the default
   * location rather than lose it.
   */
  const projectDirectory = (sessionID: string): string => logDirectory(context, sessionID)
  /**
   * Writes the frame the section handed over. A missing project root is a
   * failed write as far as the reader is concerned: nothing was saved.
   */
  const saveFrame = (
    sessionID: string | undefined,
    frame: { rows: readonly string[]; width: number },
  ): DuckScreenshotResult => {
    if (sessionID === undefined) return "empty"
    try {
      saveScreenshot(
        { ...frame, directory: projectDirectory(sessionID), primary: context.theme.text.base },
        {
          onWarning: (warning) => log.warn(
            "screenshot.gitignore_failed",
            "The screenshot folder could not hide itself from git.",
            {
              session: sessionID,
              error: warning.error,
              data: { path: warning.path },
            },
          ),
        },
      )
      return "saved"
    } catch (error) {
      if (error instanceof ScreenshotNamesExhaustedError) {
        log.error("screenshot.names_exhausted", "The screenshot name space for this second is exhausted.", {
          session: sessionID,
          data: { stem: error.stem },
        })
      } else if (error instanceof ScreenshotSaveError) {
        log.error("screenshot.save_failed", "The screenshot could not be saved.", {
          session: sessionID,
          error: error.cause,
          data: { path: error.path, phase: error.phase },
        })
      } else {
        log.error("screenshot.save_failed", "The screenshot could not be saved.", {
          session: sessionID,
          error,
          data: { path: projectDirectory(sessionID), phase: "write" },
        })
      }
      return "failed"
    }
  }
  const reportScreenshot = (result: DuckScreenshotResult) => {
    if (result === "saved") showToast(toast("open", SCREENSHOT_SAVED_MESSAGE), "success")
    else if (result === "failed") showToast(toast("open", FAILED_SCREENSHOT_MESSAGE), "error")
    else showToast(toast("closed", NO_FRAME_MESSAGE), "info")
  }
  const screenshotCommand = () => runCommand("duck.img", () => {
    const sessionID = currentSession()
    const result = sessionID !== undefined && handle !== undefined && handle.sessionID === sessionID
      ? handle.screenshot()
      : "empty"
    reportScreenshot(result)
  })

  // `slot` already returns its own teardown: it unregisters the claim.
  const unregisterSection = context.ui.slot({
    append: "sidebar.content",
    // The host calls `render` once and keeps the input's `sessionID` getter
    // reactive. Passing that getter straight through lets the section swap
    // snapshots on a tab switch. The two closures read the input when they
    // are called, so a new session also gets its own status and request
    // instead of the first session's.
    render: (input) => createComponent(Ducksay, {
      primary: context.theme.text.base,
      swimSpeed,
      silent,
      persona: optionPersona,
      renderer: context.renderer,
      data: context.data,
      get sessionID() {
        return input.sessionID
      },
      states,
      copy: copyToClipboard,
      notify: reportCopy,
      muted: context.theme.text.muted,
      screenshot: (frame) => saveFrame(input.sessionID, frame),
      notifyScreenshot: reportScreenshot,
      expose: (next) => {
        handle = next
      },
      isRunning: () => workingNow(input.sessionID),
      joke: (signal, jokeInput) => createJokeGenerator({
        client: context.client,
        sessionID: input.sessionID,
        source: () => jokeSource(input.sessionID),
        depth: contextDepth,
        timeoutMs: llmTimeout,
        model: llmModel,
        modelName: rawLlmModel,
        voice: () => personaVoice(states.get(input.sessionID)?.persona ?? optionPersona),
        onFailure: (failure) => logJokeFailure(log, failure, input.sessionID),
      })(signal, jokeInput),
    }),
  })

  /**
   * Registers the slash command from inside the slot tree.
   *
   * `setup` runs outside the TUI's keymap provider, so calling `layer` there
   * fails the whole plugin with `Keymap.Provider is missing`. The `app` slot
   * is mounted under that provider and lives as long as the TUI, so the
   * command stays available while the sidebar is rebuilt or no session is
   * open; disposing the slot removes the layer.
   */
  const RegisterCommands = () => {
    context.keymap.layer(() => ({
      mode: "global",
      commands: [
        {
          id: "duck.talk",
          title: "Talk to the duck",
          slash: { name: "duck", arguments: true },
          run: duckCommand,
        },
        {
          id: "duck.copy",
          title: "Copy the duck's latest joke",
          bind: false,
          slash: { name: "duck.copy" },
          run: copyCommand,
        },
        {
          id: "duck.img",
          title: "Create a screenshot of the duck",
          bind: false,
          slash: { name: "duck.img" },
          run: screenshotCommand,
        },
        {
          id: "duck.persona",
          title: "Switch the duck's persona",
          bind: false,
          slash: { name: "duck.persona" },
          run: personaCommand,
        },
      ],
    }))
    return null
  }
  const unregisterCommands = context.ui.slot({
    append: "app",
    render: () => createComponent(RegisterCommands, {}),
  })

  return () => {
    stopDialogueReset()
    unregisterCommands()
    unregisterSection()
  }
}

export default Plugin.define({
  id: "ducksay",
  setup: (context) => {
    const log = createLogger({ directory: (sessionID) => logDirectory(context, sessionID) })
    try {
      return setupDucksay(context, log)
    } catch (error) {
      log.error("plugin.setup_failed", "The plugin setup failed.", { error })
      throw error
    }
  },
})
