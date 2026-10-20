import { Plugin } from "@opencode/plugin/tui"
import type { Data } from "@opencode/plugin/tui/context"
import type { BoxRenderable, CliRenderer, RGBA, TextRenderable } from "@opentui/core"
import { createEffect, createSignal, onCleanup } from "solid-js/dist/solid.js"
import {
  BUBBLE_CONTENT_ROWS,
  BUBBLE_MAX_LINES,
  BUBBLE_WIDTH,
  bubbleRows,
  wrapBubbleText,
  type BubbleSide,
} from "./bubble.ts"
import { DUCK_LEFT, DUCK_LEFT_OPEN, DUCK_RIGHT, DUCK_RIGHT_OPEN } from "./duck.ts"
import { createJokeGenerator, createJokeRequest, type JokeRequest, type JokeSource } from "./joke.ts"
import { laneLimit, msPerColumn, moveTowardsEdge, type Direction } from "./lane.ts"
import { DEFAULT_SWIM_SPEED, resolveContextDepth, resolveLlmTimeout, resolveSwimSpeed } from "./options.ts"
import { WAVE_PERIOD, hasTilde, waveSpeed } from "./wave.ts"

/**
 * What the duck is doing. `rest` is the only state that holds no timer, and it
 * is also the pose a reader expects to see: the duck parked at a lane edge,
 * nose pointing at the middle of the lane.
 */
type Mode = "rest" | "swim" | "dock"

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
 * For the same reason `isRunning` is a function rather than a boolean and
 * `sessionID` is read once: a prop value is frozen at creation, so the slot's
 * render must not read reactive state, or the host would rebuild this component
 * on every session event and throw away the duck's position.
 */
export function Ducksay(props: {
  primary: RGBA
  swimSpeed?: number
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
   * Asks for one joke at the end of a turn. Without it the bubble is the static
   * `bubbleText`, which is what the geometry tests use.
   */
  joke?: (signal: AbortSignal) => Promise<string | undefined>
}) {
  const [mode, setMode] = createSignal<Mode>("rest")
  const [busy, setBusy] = createSignal(props.isRunning?.() === true)
  // A static bubble is ready immediately. A generated one starts hidden and
  // becomes ready only when an answer or the fallback arrives.
  const [jokeReady, setJokeReady] = createSignal(props.joke === undefined)
  const [jokeText, setJokeText] = createSignal(props.bubbleText ?? DEFAULT_BUBBLE_TEXT)

  let column = 0
  let direction: Direction = 1
  let laneBox: BoxRenderable | undefined
  let wavePhase = 0
  let hasSwum = false
  let lastBusy = busy()
  let request: JokeRequest | undefined
  const lines: (TextRenderable | undefined)[] = []

  const sprites = () => props.sprites ?? DEFAULT_SPRITES
  /**
   * The bubble is shown only after the duck has actually swum: the start-up
   * pose is a rest too, and the user asked for no bubble before the first lap.
   */
  const bubbleVisible = () => mode() === "rest" && hasSwum && jokeReady()
  const art = () => {
    const set = sprites()
    if (direction === 1) return bubbleVisible() ? set.rightOpen : set.right
    return bubbleVisible() ? set.leftOpen : set.left
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
  const limit = () => laneLimit(laneBox?.width ?? 0, artWidth())

  /**
   * Parks the duck: inside the lane, nose towards the middle of it. Every route
   * into `rest` goes through here, so the pose a reader sees at rest is the same
   * whichever wall it came to rest against.
   */
  const park = () => {
    const reach = limit()
    column = Math.min(Math.max(column, 0), reach)
    direction = column * 2 <= reach ? 1 : -1
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
    for (let cell = 0; cell < WATER_WIDTH; cell++) line += hasTilde(cell, wavePhase, row) ? "~" : " "
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
    water.slice(0, column) + sprite + water.slice(column + sprite.length)

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
    const indent = " ".repeat(column)
    // Every row is rebuilt on every paint, which is also what clears a bubble
    // that has just gone away; the reserve above the duck stays blank otherwise.
    const rows: string[] = new Array(BUBBLE_CONTENT_ROWS).fill("")
    rows[HEAD_ROW] = indent + (sprite[0] ?? "")
    rows[BEAK_ROW] = indent + (sprite[1] ?? "")
    rows[BODY_ROW] = overWater(waterLine(0), sprite[2] ?? "")
    rows[LOWER_WATER_ROW] = waterLine(1)

    if (bubbleVisible()) {
      const side: BubbleSide = direction === 1 ? "right" : "left"
      // The bubble hugs the beak: to the right of the duck when it faces right,
      // ending at the duck's column when it faces left.
      const at = direction === 1 ? column + artWidth() : column - BUBBLE_WIDTH
      const segments = bubbleRows(wrapBubbleText(jokeText()), side)
      for (const [index, segment] of segments.entries()) {
        if (segment !== undefined) rows[index] = overlay(rows[index] ?? "", segment, at)
      }
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

  // Reading `busy` here is what makes the mode follow the session: a busy
  // session starts the swim, an idle one turns a swim into a dock. Any other
  // transition leaves the mode alone, so a session that goes busy again
  // mid-dock resumes swimming instead of restarting the dock.
  createEffect(() => {
    const working = busy()
    setMode((current) => (working ? "swim" : current === "swim" ? "dock" : current))
  })

  const cancelJoke = () => {
    request?.cancel()
    request = undefined
  }

  // A request belongs to the end of a turn, not to the rest pose: it starts
  // while the duck docks, so the bubble is usually ready by the time it stops.
  // Reading `busy` alone is deliberate; `mode` changes during the dock and must
  // not start a second request.
  createEffect(() => {
    const working = busy()
    if (working === lastBusy) return
    const wasBusy = lastBusy
    lastBusy = working

    if (props.joke === undefined) return
    if (working) {
      cancelJoke()
      setJokeReady(false)
      setJokeText(DEFAULT_BUBBLE_TEXT)
      return
    }

    // A duck that never moved — zero speed, or a lane narrower than the art —
    // has no turn to joke about.
    if (!wasBusy || !hasSwum) return

    const joke = props.joke
    cancelJoke()
    setJokeReady(false)
    setJokeText(DEFAULT_BUBBLE_TEXT)
    const current = createJokeRequest(joke)
    request = current
    void current.result.then((text) => {
      // A late answer from a cancelled request must not replace the bubble of
      // the turn that replaced it.
      if (request !== current) return
      request = undefined
      setJokeText(text !== undefined && text.trim() !== "" ? text : DEFAULT_BUBBLE_TEXT)
      setJokeReady(true)
    })
  })

  onCleanup(cancelJoke)

  // `paint` writes imperative lines, so a signal change needs an explicit
  // repaint and frame request: rest has no timer to do it later.
  createEffect(() => {
    jokeReady()
    jokeText()
    paint()
    props.renderer?.requestRender()
  })

  createEffect(() => {
    const renderer = props.renderer
    const swimSpeed = props.swimSpeed ?? DEFAULT_SWIM_SPEED
    // Reading `mode` here is what re-runs this effect when the duck starts or
    // stops, so the timer is started and cleared with the animation.
    if (renderer === undefined || swimSpeed <= 0 || mode() === "rest") return

    let accumulated = 0

    const tick = () => {
      // A tick that arrives after the duck came to rest moves nothing: the
      // timer is cleared as soon as the mode changes, but a tick already in
      // flight still runs, and nothing should happen to a resting duck.
      if (mode() === "rest") return

      // The water rides the duck's tick, one phase step per tick, at the tempo
      // derived from the swim speed. `waveSpeed` is zero both when the speed is
      // off and when the lane is narrower than the art, so the pattern stands
      // still exactly when the duck does: no second timer, and no second piece
      // of state that could drift out of step with the first. The phase is kept
      // inside one period, because the pattern repeats there and a float that
      // grows all session loses precision for nothing.
      wavePhase = (wavePhase + waveSpeed(swimSpeed, limit()) * (TICK_MS / 1000)) % WAVE_PERIOD

      const reach = limit()
      if (reach === 0) {
        // A lane narrower than the art has no room to swim in. Sitting at the
        // left edge, nose inwards, is the closest thing to a correct pose.
        column = 0
        if (mode() === "dock") setMode("rest")
        park()
        paint()
        renderer.requestRender()
        return
      }
      accumulated += TICK_MS
      const interval = msPerColumn(swimSpeed)
      let budget = MAX_COLUMNS_PER_TICK
      while (accumulated >= interval && budget > 0) {
        accumulated -= interval
        budget -= 1
        const move = moveTowardsEdge(column, direction, reach)
        if (move.column !== column) hasSwum = true
        column = move.column
        direction = move.direction
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
    <box flexGrow={1} flexDirection="column" alignItems="flex-start" ref={(box) => (laneBox = box)}>
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
    const llmTimeout = resolveLlmTimeout(context.options)
    const contextDepth = resolveContextDepth(context.options)
    // Read once, when the section appears: the panel may open in the middle of
    // a turn, long before the next event arrives.
    const workingNow = (sessionID: string) => context.data.session.status(sessionID) === "running"

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

    // `slot` already returns its own teardown: it unregisters the claim.
    return context.ui.slot({
      append: "sidebar.content",
      render: ({ sessionID }) => (
        <Ducksay
          primary={context.theme.text.base}
          swimSpeed={swimSpeed}
          renderer={context.renderer}
          data={context.data}
          sessionID={sessionID}
          isRunning={() => workingNow(sessionID)}
          joke={createJokeGenerator({
            client: context.client,
            sessionID,
            source: () => jokeSource(sessionID),
            depth: contextDepth,
            timeoutMs: llmTimeout,
          })}
        />
      ),
    })
  },
})
