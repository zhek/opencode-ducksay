/** @jsxImportSource @opentui/solid */
import { Plugin } from "@opencode/plugin/tui"
import type { Data } from "@opencode/plugin/tui/context"
import type { BoxRenderable, CliRenderer, RGBA, TextRenderable } from "@opentui/core"
import {
  createComponent,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  untrack,
} from "solid-js"
import {
  BUBBLE_CONTENT_ROWS,
  BUBBLE_MAX_LINES,
  BUBBLE_WIDTH,
  bubbleRows,
  wrapBubbleText,
  type BubbleSide,
} from "./bubble.ts"
import {
  advanceCow,
  COW_CHANCE,
  cowEmergence,
  cowFrame,
  COW_TONGUE_ROW,
  COW_WIDTH,
  crossedMidline,
} from "./cow.ts"
import { DUCK_LEFT, DUCK_LEFT_OPEN, DUCK_RIGHT, DUCK_RIGHT_OPEN } from "./duck.ts"
import {
  appendExchange,
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
  createJokeRequest,
  type JokeInput,
  type JokeRequest,
  type JokeSource,
} from "./joke.ts"
import { laneLimit, msPerColumn, moveTowardsEdge } from "./lane.ts"
import { DEFAULT_SWIM_SPEED, resolveContextDepth, resolveLlmTimeout, resolveSilent, resolveSwimSpeed } from "./options.ts"
import { QUESTION_FRAMES, QUESTION_FRAME_MS, questionColumn } from "./question.ts"
import {
  THINKING_STEPS,
  THINK_FRAME_MS,
  WORD_FRAME_MS,
  beakOpen as beakOpenAt,
  bubbleWords,
  holdsAfter,
  revealText,
  thinkingText,
} from "./thinking.ts"
import { WAVE_PERIOD, hasTilde, waveSpeed } from "./wave.ts"

export interface DuckSprites {
  readonly right: readonly string[]
  readonly left: readonly string[]
  readonly rightOpen: readonly string[]
  readonly leftOpen: readonly string[]
}

const DEFAULT_SPRITES: DuckSprites = {
  right: DUCK_RIGHT,
  left: DUCK_LEFT,
  rightOpen: DUCK_RIGHT_OPEN,
  leftOpen: DUCK_LEFT_OPEN,
}

/** Roughly the frame rate the TUI runs at, in milliseconds. */
const TICK_MS = 33

/**
 * Starts a heartbeat and returns its stop. The default is a plain interval; a
 * test hands in the renderer's manual clock so the swim can be stepped without
 * waiting for real time.
 */
export type Schedule = (tick: () => void, ms: number) => () => void

const defaultSchedule: Schedule = (tick, ms) => {
  const handle = setInterval(tick, ms)
  return () => clearInterval(handle)
}

/**
 * How many columns the duck may cover in one tick. It bounds a clock jump — a
 * machine waking up from suspend — instead of teleporting the duck.
 */
const MAX_COLUMNS_PER_TICK = 8

/**
 * Columns of water generated per row. Wider than any sidebar, and cut at the
 * lane's edge by `wrapMode="none"`, so the row never has to be measured.
 */
const WATER_WIDTH = 160

/** The message the duck shows at rest; tests may override it through `bubbleText`. */
const DEFAULT_BUBBLE_TEXT = "Quack-quack!"

/** The user side recorded for a `/duck` without text. */
const SILENT_REPLY = "<silent>"

/** Shown when the duck cannot take a command, with its beak wide open. */
const BUSY_TOAST = ">(o ) The duck is mid-quack. Try later."

/** Shown when `silent` is on; the duck has nothing to say by configuration. */
const SILENT_TOAST = "<(o ) The duck keeps mum."

/** What a `/duck` call did, so `setup` knows which toast to show. */
export type DuckCommandResult = "started" | "muted" | "busy"

/** The part of the mounted section the `/duck` command drives. */
export interface DuckHandle {
  /** The session currently displayed by this mount. */
  readonly sessionID: string | undefined
  duck(text: string | undefined): DuckCommandResult
}

/**
 * Where the duck's three art lines sit inside the section, top to bottom.
 *
 * The five rows above are the bubble's reserve, so the duck stays on the same
 * rows whether or not the bubble is showing. The upper water line shares the
 * body row, and the lower water line gets its own row.
 */
const HEAD_ROW = BUBBLE_MAX_LINES
const BEAK_ROW = HEAD_ROW + 1
const BODY_ROW = HEAD_ROW + 2
const LOWER_WATER_ROW = HEAD_ROW + 3
/** The question marker sits on the row above the head, inside the reserve. */
const QUESTION_ROW = HEAD_ROW - 1

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
  let request: JokeRequest | undefined
  const lines: (TextRenderable | undefined)[] = []

  const cancelJoke = () => {
    request?.cancel()
    request = undefined
  }

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

    if (previousSessionID !== undefined && props.states !== undefined) {
      writeSnapshot()
      props.states.set(previousSessionID, state)
    }
    cancelJoke()

    const nextState = nextSessionID !== undefined ? props.states?.get(nextSessionID) : undefined
    state = nextState ?? createDuckState({
      jokeText: props.bubbleText ?? DEFAULT_BUBBLE_TEXT,
    })
    if (nextSessionID !== undefined) props.states?.set(nextSessionID, state)

    const running = props.isRunning?.() === true
    const hiddenTurn = !running && state.mode === "swim" && state.speech === "idle"
    setMode(state.mode)
    setSpeech(hiddenTurn && props.silent !== true ? (props.joke === undefined ? "ready" : "waiting") : state.speech)
    setJokeText(state.jokeText)
    setDotsStep(state.dotsStep)
    setShown(state.shown)
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
    props.renderer?.requestRender()
  })

  const sprites = () => props.sprites ?? DEFAULT_SPRITES
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
  const art = () => {
    const set = sprites()
    if (state.direction === 1) return beakOpen() ? set.rightOpen : set.right
    return beakOpen() ? set.leftOpen : set.left
  }
  const artWidth = () => {
    const { right, left, rightOpen, leftOpen } = sprites()
    return Math.max(
      0,
      ...right.map((line) => line.length),
      ...left.map((line) => line.length),
      ...rightOpen.map((line) => line.length),
      ...leftOpen.map((line) => line.length),
    )
  }

  /**
   * The box the section is laid out in. It is measured rather than derived from
   * OpenCode's panel constants, so the duck keeps working whatever width the
   * host gives it. `flexGrow` makes the box span the lane; without it the box
   * shrinks to the art and there is no room to swim at all.
   */
  const limit = () => laneLimit(laneWidth(), artWidth())

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
   * One row of water.
   *
   * Generated wider than any sidebar and let `wrapMode="none"` cut it at the
   * lane's edge, rather than measured. Measuring would mean reading the lane
   * box, and the row has to be drawable before that box has a width — the refs
   * that assign it run after the refs of the rows inside it — so a measured
   * row would paint itself empty once and never again in `rest`, where no tick
   * follows to correct it.
   */
  const waterLine = (row: number) => {
    let line = ""
    for (let cell = 0; cell < WATER_WIDTH; cell++) line += hasTilde(cell, state.wavePhase, row) ? "~" : " "
    return line
  }

  /**
   * Lays the duck's part of a row over the water that shares it.
   *
   * The art goes in at the duck's column, so it is given without the indent —
   * passing an already indented sprite would shift it by `column` a second time
   * and push it off the row entirely once the duck left the left edge.
   */
  const overWater = (water: string, sprite: string) =>
    water.slice(0, state.column) + sprite + water.slice(state.column + sprite.length)

  /**
   * Puts a bubble segment on `row` at column `at`.
   *
   * A segment that starts left of the lane is cut at its left edge, the same
   * way the art and water rows are cut by `wrapMode="none"`; the rest of the
   * row, including the duck, is left alone.
   */
  const overlay = (row: string, segment: string, at: number) => {
    if (at < 0) {
      const visible = segment.slice(-at)
      return visible + row.slice(visible.length)
    }
    const padded = row.padEnd(at + segment.length, " ")
    return padded.slice(0, at) + segment + padded.slice(at + segment.length)
  }

  /**
   * Draws the current sprite at the current column, with the water under it,
   * and lays the bubble over the rows beside the duck when it is showing.
   *
   * The upper water row shares a row with the duck's last art line: that is what
   * puts the duck in the water rather than above it, and it costs no blank row.
   * The duck is drawn first so its glyphs win the columns it occupies, including
   * the spaces inside its art. The bubble never overlaps it: 29 columns of
   * bubble plus 8 of art is the 37-column lane, so the two sit side by side.
   */
  const paint = () => {
    const sprite = art()
    const indent = " ".repeat(state.column)
    // Every row is rebuilt on every paint, which is also what clears a bubble
    // that has just gone away; the reserve above the duck stays blank otherwise.
    const rows: string[] = new Array(BUBBLE_CONTENT_ROWS).fill("")

    // The cow is drawn first, so the duck stays in front if a sprite ever
    // reaches the reserve. It is pinned to the right wall: `e` columns are
    // visible, and its left edge moves left as it comes out.
    if (mode() !== "rest" && state.cow !== undefined) {
      const emergence = cowEmergence(state.cow.columns)
      if (emergence > 0) {
        const left = laneWidth() - emergence
        // The mouth stays closed on the way out. The tongue appears only when
        // the cow is fully out and stays through the hold and the return.
        const tongue = state.cow.columns >= COW_WIDTH
        for (const line of cowFrame(emergence, tongue)) {
          const at = line.row === COW_TONGUE_ROW ? left + 1 : left
          rows[line.row] = overlay(rows[line.row] ?? "", line.text, at)
        }
      }
    }

    rows[HEAD_ROW] = indent + (sprite[0] ?? "")
    rows[BEAK_ROW] = indent + (sprite[1] ?? "")
    rows[BODY_ROW] = overWater(waterLine(0), sprite[2] ?? "")
    rows[LOWER_WATER_ROW] = waterLine(1)

    if (bubbleVisible()) {
      const side: BubbleSide = state.direction === 1 ? "right" : "left"
      // The bubble hugs the beak: to the right of the duck when it faces right,
      // ending at the duck's column when it faces left.
      const at = state.direction === 1 ? state.column + artWidth() : state.column - BUBBLE_WIDTH
      const segments = bubbleRows(wrapBubbleText(bubbleText()), side)
      for (const [index, segment] of segments.entries()) {
        if (segment !== undefined) rows[index] = overlay(rows[index] ?? "", segment, at)
      }
    }

    // The marker is drawn after the bubble because a pending form hides the
    // bubble; doing it last also keeps a stale bubble from covering it if the
    // two ever coincide. It takes the art's colour, as every content row does.
    if (frozen()) {
      const glyph = QUESTION_FRAMES[questionFrame()] ?? QUESTION_FRAMES[0]
      const at = questionColumn(state.column, state.direction)
      rows[QUESTION_ROW] = overlay(rows[QUESTION_ROW] ?? "", glyph, at)
    }

    for (const [index, text] of lines.entries()) {
      if (text !== undefined) text.content = rows[index] ?? ""
    }
  }

  /**
   * The duck follows the session it belongs to.
   *
   * `session.status` would be the precise signal, but the host does not publish
   * it: a turn produces `session.execution.*` and `session.text.*`. The swim is
   * driven by the execution events, which cover the whole turn — generation,
   * tool calls, permission prompts. Status stays subscribed to as well: on a
   * host that publishes it, a retry keeps the duck swimming, and a status event
   * simply overwrites whatever the last execution event said.
   */
  createEffect(() => {
    const data = props.data
    const sessionID = props.sessionID
    if (data === undefined || sessionID === undefined) return
    const mine = (event: { data?: { sessionID?: string } }) => event.data?.sessionID === sessionID
    const set = (value: boolean) => setBusy((current) => (current === value ? current : value))

    const stops = [
      data.on("session.execution.started", (event) => {
        if (mine(event)) set(true)
      }),
      data.on("session.execution.succeeded", (event) => {
        if (mine(event)) set(false)
      }),
      data.on("session.execution.failed", (event) => {
        if (mine(event)) set(false)
      }),
      data.on("session.execution.interrupted", (event) => {
        if (mine(event)) set(false)
      }),
      data.on("session.idle", (event) => {
        if (mine(event)) set(false)
      }),
      data.on("session.status", (event) => {
        if (mine(event)) set(event.data.status.type !== "idle")
      }),
    ]
    onCleanup(() => {
      for (const stop of stops) stop()
    })
  })

  /**
   * Form events follow the session the same way execution events do. Only the
   * displayed session counts: `global` and another session's forms must not
   * freeze the duck. Forms already open when the section mounts are read from
   * the host, with a `sync` retry when the cache has not been filled yet.
   */
  createEffect(() => {
    const data = props.data
    const sessionID = props.sessionID
    setAskedForms(new Set<string>())
    if (data === undefined || sessionID === undefined) return

    /**
     * Adds or removes one form in the pending set without disturbing the
     * others. A new set is returned only on an actual change, so repeated
     * events do not wake every effect that reads the set.
     */
    const addAsked = (id: string) => {
      setAskedForms((current) => {
        if (current.has(id)) return current
        const next = new Set(current)
        next.add(id)
        return next
      })
    }
    /**
     * Forms that closed while the list was being synced. They must not come
     * back when the synced list arrives, or the duck would stay frozen over a
     * form nobody is waiting for any more.
     */
    const closed = new Set<string>()
    const removeAsked = (id: string) => {
      closed.add(id)
      setAskedForms((current) => {
        if (!current.has(id)) return current
        const next = new Set(current)
        next.delete(id)
        return next
      })
    }

    const mine = (eventSessionID: string | undefined) => eventSessionID === sessionID
    const stops = [
      data.on("form.created", (event) => {
        const form = event.data.form
        if (!mine(form.sessionID)) return
        closed.delete(form.id)
        addAsked(form.id)
      }),
      data.on("form.replied", (event) => {
        if (!mine(event.data.sessionID)) return
        removeAsked(event.data.id)
      }),
      data.on("form.cancelled", (event) => {
        if (!mine(event.data.sessionID)) return
        removeAsked(event.data.id)
      }),
    ]

    const forms = data.session?.form
    if (forms !== undefined) {
      const apply = (listed: readonly { id: string; sessionID?: string }[] | undefined) => {
        if (props.sessionID !== sessionID || listed === undefined) return
        setAskedForms((current) => {
          const next = new Set<string>()
          // The list is asked for one session, but the filter keeps the rule
          // in one place: only a form of the displayed session is a question.
          for (const form of listed) {
            if (form.sessionID !== undefined && !mine(form.sessionID)) continue
            if (!closed.has(form.id)) next.add(form.id)
          }
          for (const id of current) if (!closed.has(id)) next.add(id)
          return next
        })
      }
      const listed = forms.list(sessionID)
      if (listed !== undefined) {
        apply(listed)
      } else {
        void forms
          .sync(sessionID)
          .then(() => apply(forms.list(sessionID)))
          .catch(() => {})
      }
    }

    onCleanup(() => {
      for (const stop of stops) stop()
    })
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
        props.renderer?.requestRender()
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
      cancelJoke()
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
   * Starts the request for the turn that has just ended, or for a direct
   * `/duck` call when `pendingReply` says so. A missing generator means the
   * static `bubbleText` is all this section shows.
   *
   * Returns false when speech is not possible at all, so the command can report
   * `busy` instead of leaving a reply stuck in the snapshot.
   */
  const startJoke = (): boolean => {
    const joke = props.joke
    if (joke === undefined || props.silent === true || limit() <= 0) return false
    cancelJoke()
    const reply = state.pendingReply
    const input: JokeInput | undefined = reply === undefined
      ? undefined
      : { text: reply === SILENT_REPLY ? undefined : reply, dialogue: state.dialogue }
    // The request is stored before the speech signal flips: `waiting` with no
    // request is what starts a joke on a later mount, and the effect that
    // watches it would otherwise start a second one from this very call.
    const current = createJokeRequest(joke, input)
    request = current
    setSpeech("waiting")
    setJokeText(DEFAULT_BUBBLE_TEXT)
    // The dots keep their frame: a request that is repeated after the sidebar
    // was rebuilt resumes the waiting bubble instead of going back to one dot.
    // A new turn resets the frame when it starts.
    setShown(0)
    void current.result.then((text) => {
      // A late answer from a cancelled request must not replace the bubble of
      // the turn that replaced it.
      if (request !== current) return
      request = undefined
      const answer = text !== undefined && text.trim() !== "" ? text : undefined
      setJokeText(answer ?? DEFAULT_BUBBLE_TEXT)
      // The first word is on screen in the same paint as the answer; the typing
      // timer only has to fetch the words after it.
      setShown(1)
      setSpeech("ready")
      // The fallback is not a joke the duck said, so only a real answer joins
      // the dialogue. A missing reply marks the automatic joke after a turn.
      if (answer !== undefined) {
        state.dialogue = appendExchange(
          state.dialogue,
          reply === undefined ? { duck: answer } : { user: reply, duck: answer },
        )
      }
      state.pendingReply = undefined
    })
    return true
  }

  /**
   * The `/duck` entry point. The checks mirror the states the section already
   * treats as busy: a running session, a dock in progress, a pending form, a
   * lane without room, or an answer still on its way.
   */
  const duck = (text: string | undefined): DuckCommandResult => {
    if (props.silent === true) return "muted"
    if (props.sessionID === undefined || limit() <= 0) return "busy"
    if (frozen() || busy() || mode() !== "rest") return "busy"
    if (speech() === "waiting" && request !== undefined) return "busy"
    const reply = text === undefined || text.trim() === "" ? SILENT_REPLY : clipUserText(text)
    state.pendingReply = reply
    if (!startJoke()) {
      state.pendingReply = undefined
      return "busy"
    }
    return "started"
  }

  // The command lives in `setup`, the speech lives here. The handle is a view
  // on this mount: `sessionID` stays reactive across tab switches, and cleanup
  // removes it so the command cannot reach a disposed section.
  props.expose?.({
    get sessionID() {
      return props.sessionID
    },
    duck,
  })
  onCleanup(() => props.expose?.(undefined))

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
    if (request !== undefined) return
    startJoke()
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
    cancelJoke()
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
    props.renderer?.requestRender()
  })

  // The marker is the only thing moving while a form waits. It starts at `?`
  // when the first form arrives and keeps its own phase until the last form
  // closes; `frozen` is a memo, so a second form does not restart the cycle.
  createEffect(() => {
    if (!frozen() || props.renderer === undefined) return
    setQuestionFrame(0)
    const tick = () => setQuestionFrame((frame) => (frame + 1) % QUESTION_FRAMES.length)
    const stop = (props.schedule ?? defaultSchedule)(tick, QUESTION_FRAME_MS)
    onCleanup(stop)
  })

  // The waiting dots run only while the duck rests with an answer still on the
  // way. `mode` and `speech` start and stop the effect; `dotsStep` is
  // deliberately not read here: advancing it must not tear down and recreate
  // the interval on every frame.
  createEffect(() => {
    const renderer = props.renderer
    if (renderer === undefined || props.joke === undefined) return
    if (!bubbleVisible() || speech() !== "waiting") return

    const tick = () => setDotsStep((step) => (step + 1) % THINKING_STEPS.length)
    const stop = (props.schedule ?? defaultSchedule)(tick, THINK_FRAME_MS)
    onCleanup(stop)
  })

  // The joke is revealed one word per tick while the duck rests. The effect
  // starts on the answer and stops itself on the last word, so a rest with the
  // whole joke on screen holds no timer. `shown` is read through `untrack`:
  // tracking it would tear down the interval on every word and lose the pause
  // flag for punctuation.
  createEffect(() => {
    const renderer = props.renderer
    if (renderer === undefined || props.joke === undefined) return
    if (!bubbleVisible() || speech() !== "ready") return

    const text = jokeText()
    const words = bubbleWords(text)
    const total = words.length
    let typed = untrack(shown)
    if (typed < 1 && total > 0) {
      // Defensive: an answer always sets the first word, but a bubble with no
      // word at all is the one frame the user must never see.
      typed = 1
      setShown(1)
    }
    if (typed >= total) return

    // The word already on screen may itself end a phrase: a restart must not
    // lose the pause that follows it.
    let hold = holdsAfter(words[typed - 1] ?? "")
    let stop: (() => void) | undefined
    const tick = () => {
      if (hold) {
        hold = false
        return
      }
      typed += 1
      setShown(typed)
      if (typed >= total) {
        // The interval must not keep ticking over a finished joke.
        stop?.()
        stop = undefined
        return
      }
      // A punctuated word stays on screen for two steps, so the pause reads as
      // speech rather than a uniform metronome.
      hold = holdsAfter(words[typed - 1] ?? "")
    }
    stop = (props.schedule ?? defaultSchedule)(tick, WORD_FRAME_MS)
    onCleanup(() => stop?.())
  })

  createEffect(() => {
    const renderer = props.renderer
    const swimSpeed = props.swimSpeed ?? DEFAULT_SWIM_SPEED
    // Reading `mode` here is what re-runs this effect when the duck starts or
    // stops, so the timer is started and cleared with the animation. `frozen`
    // is read for the same reason: a pending form stops the heartbeat
    // altogether, so the section keeps only the marker's timer while the
    // question waits, and the swim resumes from the same column afterwards.
    if (renderer === undefined || swimSpeed <= 0 || mode() === "rest" || frozen()) return

    let accumulated = 0

    const tick = () => {
      // A tick that arrives after the duck came to rest moves nothing: the
      // timer is cleared as soon as the mode changes, but a tick already in
      // flight still runs, and nothing should happen to a resting duck. A
      // pending form freezes the same way: the current column and heading stay
      // put until the form closes.
      if (mode() === "rest" || frozen()) return

      // The water rides the duck's tick, one phase step per tick, at the tempo
      // derived from the swim speed. `waveSpeed` is zero both when the speed is
      // off and when the lane is narrower than the art, so the pattern stands
      // still exactly when the duck does: no second timer, and no second piece
      // of state that could drift out of step with the first. The phase is kept
      // inside one period, because the pattern repeats there and a float that
      // grows all session loses precision for nothing.
      state.wavePhase = (state.wavePhase + waveSpeed(swimSpeed, limit()) * (TICK_MS / 1000)) % WAVE_PERIOD

      const reach = limit()
      if (reach === 0) {
        // A lane narrower than the art has no room to swim in. Sitting at the
        // left edge, nose inwards, is the closest thing to a correct pose.
        state.column = 0
        if (mode() === "dock") setMode("rest")
        park()
        paint()
        renderer.requestRender()
        return
      }

      // An existing cow moves before the duck. A cow started by this tick's
      // crossing is therefore still invisible until the next tick, which gives
      // it the same short first delay as the five-out, hold, five-back cycle.
      state.cow = advanceCow(state.cow, TICK_MS, swimSpeed)

      accumulated += TICK_MS
      const interval = msPerColumn(swimSpeed)
      let budget = MAX_COLUMNS_PER_TICK
      while (accumulated >= interval && budget > 0) {
        accumulated -= interval
        budget -= 1
        const from = state.column
        const heading = state.direction
        const move = moveTowardsEdge(state.column, state.direction, reach)
        state.column = move.column
        state.direction = move.direction

        // The cow is a rare event of a leftward crossing, not of a timer of its
        // own. Every crossing consumes one roll even while a cow is already
        // out; the hit is then ignored so only one cow can be on screen.
        if (mode() === "swim" && heading === -1 && crossedMidline(from, move.column, reach)) {
          const hit = (props.random ?? Math.random)() < COW_CHANCE
          if (hit && state.cow === undefined) {
            state.cow = { columns: 0, accumulated: 0 }
          }
        }

        if (move.turned) {
          // The turn spends the rest of the tick. Without this the leftover
          // time carries straight into the next column of the new direction and
          // the duck leaves the wall in the same tick it reached it, so the
          // turn is never actually drawn.
          accumulated = 0
          // A dock ends on the turn, which leaves the duck at a wall. The mode
          // changes before the paint, so the paint already draws the rest pose,
          // open beak and bubble included.
          if (mode() === "dock") {
            park()
            setMode("rest")
            paint()
            renderer.requestRender()
            return
          }
        }
      }
      paint()
      // One frame per tick, asked for rather than held: the renderer keeps its
      // own idle behaviour, and the plugin never keeps it alive between ticks.
      renderer.requestRender()
    }

    const stop = (props.schedule ?? defaultSchedule)(tick, TICK_MS)
    onCleanup(stop)
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
        props.renderer?.requestRender()
      }}
    >
      <text fg={props.primary}>
        <b>Ducksay</b>
      </text>
      {Array.from({ length: lineCount }, (_, index) => (
        // The ref paints its own line: `onMount` runs before refs are assigned,
        // so a single paint there would leave every line empty.
        <text wrapMode="none" ref={(text) => ((lines[index] = text), paint())} />
      ))}
    </box>
  )
}

export default Plugin.define({
  id: "ducksay",
  setup: (context) => {
    const swimSpeed = resolveSwimSpeed(context.options)
    const silent = resolveSilent(context.options)
    const llmTimeout = resolveLlmTimeout(context.options)
    const contextDepth = resolveContextDepth(context.options)
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
      const sessionID = event.data?.sessionID
      if (sessionID === undefined) return
      const state = states.get(sessionID)
      if (state === undefined) return
      state.dialogue = []
      state.pendingReply = undefined
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
        messages: context.data.session.message.list(sessionID),
      }
    }

    // The command belongs to the keymap layer, not to the section: it stays
    // available while the sidebar is rebuilt. It reaches the mounted section
    // through the handle and refuses a session other than the displayed one.
    const currentSession = () => {
      const route = context.ui.router.current()
      return route?.type === "session" ? route.sessionID : undefined
    }
    const notify = (message: string) =>
      context.ui.toast.show({ message, variant: "info", duration: 2000 })
    const duckCommand = (input: string | undefined) => {
      const sessionID = currentSession()
      const result = sessionID !== undefined && handle !== undefined && handle.sessionID === sessionID
        ? handle.duck(input)
        : "busy"
      if (result === "muted") notify(SILENT_TOAST)
      else if (result === "busy") notify(BUSY_TOAST)
    }

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
        renderer: context.renderer,
        data: context.data,
        get sessionID() {
          return input.sessionID
        },
        states,
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
            id: "ducksay.duck",
            title: "Talk to the duck",
            slash: { name: "duck", arguments: true },
            run: duckCommand,
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
  },
})
