/**
 * Pure frame logic for the demo GIF generator.
 *
 * Kept separate from `make-demo-gif.ts` so the timing, wrapping, input and
 * water rules can be tested without a canvas or a font. The renderer only turns
 * what this module returns into pixels.
 *
 * The Ducksay artwork is not copied here: the sprites, the wave pattern, the
 * bubble wrap and the bubble frame all come from `src/`, so the GIF cannot drift
 * from what the plugin draws. `sidebarRows()` composes the same nine rows as the
 * real section; tests check that composition against the plugin's own modules.
 *
 * The session content is localized: the TUI chrome stays English because that
 * is what OpenCode itself shows, while the user, the assistant and the duck
 * speak the language of the README that embeds the GIF.
 */
import {
  BUBBLE_CONTENT_ROWS,
  BUBBLE_MAX_LINES,
  BUBBLE_WIDTH,
  bubbleRows,
  wrapBubbleText,
  type BubbleSide,
} from "../src/bubble.ts"
import { DUCK_LEFT, DUCK_LEFT_OPEN, DUCK_RIGHT, DUCK_RIGHT_OPEN, DUCK_WIDTH } from "../src/duck.ts"
import { laneLimit } from "../src/lane.ts"
import { THINKING_STEPS, beakOpen, thinkingText } from "../src/thinking.ts"
import { WAVE_GAP, WAVE_PERIOD, WAVE_ROW_OFFSET, WAVE_RUN, hasTilde } from "../src/wave.ts"

export { BUBBLE_WIDTH, bubbleRows, hasTilde, wrapBubbleText, WAVE_GAP, WAVE_PERIOD, WAVE_ROW_OFFSET, WAVE_RUN }

export type Locale = "en" | "ru"

export interface DemoScenario {
  locale: Locale
  /** File under `assets/`, relative to the repository root. */
  file: string
  title: string
  user: string
  assistant: string
  firstJoke: string
  question: string
  command: string
  secondJoke: string
  firstWords: string[]
  questionWords: string[]
  secondWords: string[]
}

function scenario(input: {
  locale: Locale
  file: string
  title: string
  user: string
  assistant: string
  firstJoke: string
  question: string
  secondJoke: string
}): DemoScenario {
  return {
    ...input,
    command: `/duck ${input.question}`,
    firstWords: input.firstJoke.split(/\s+/),
    questionWords: input.question.split(/\s+/),
    secondWords: input.secondJoke.split(/\s+/),
  }
}

export const SCENARIOS: Record<Locale, DemoScenario> = {
  en: scenario({
    locale: "en",
    file: "ducksay-demo.gif",
    title: "hello",
    user: "Hello!",
    assistant: "Hello! What are we building today?",
    firstJoke: "Hello! I'd wave back, but these wings are busy swimming.",
    question: "why did the duck cross the road?",
    secondJoke: "The tokens are always juicier across the road.",
  }),
  ru: scenario({
    locale: "ru",
    file: "ducksay-demo.ru.gif",
    title: "привет",
    user: "Привет!",
    assistant: "Привет! Что сегодня делаем?",
    firstJoke: "Привет! Помахал бы, но эти крылья заняты плаванием.",
    question: "зачем утка перешла дорогу?",
    secondJoke: "Через дорогу всегда более сочные токены.",
  }),
}

export const LOCALES: readonly Locale[] = ["en", "ru"]

/** The narrowest lane that fits the bubble and the duck side by side. */
export const LANE_COLS = BUBBLE_WIDTH + DUCK_WIDTH
export const LIMIT = laneLimit(LANE_COLS, DUCK_WIDTH)

/** The four sprites, keyed the way the section chooses them. */
export const SPRITES = {
  left: { closed: DUCK_LEFT, open: DUCK_LEFT_OPEN },
  right: { closed: DUCK_RIGHT, open: DUCK_RIGHT_OPEN },
} as const

/** The section's row layout: five bubble rows, three art rows, one water row. */
const HEAD_ROW = BUBBLE_MAX_LINES
const BEAK_ROW = HEAD_ROW + 1
const BODY_ROW = HEAD_ROW + 2
const LOWER_WATER_ROW = HEAD_ROW + 3

export const TURN_OUT_FRAMES = 26
export const TURN_WAIT_FRAMES = 6
export const TURN_TYPE_FRAMES = 22
export const TURN_HOLD_FRAMES = 12

export const REST_START = TURN_OUT_FRAMES
export const FIRST_TYPE_START = REST_START + TURN_WAIT_FRAMES
export const FIRST_HOLD_START = FIRST_TYPE_START + TURN_TYPE_FRAMES
export const TURN_END = FIRST_HOLD_START + TURN_HOLD_FRAMES

export const COMMAND_MENU_FRAMES = 6
export const COMMAND_SELECT_FRAMES = 2
export const COMMAND_TYPE_FRAMES = 16
export const COMMAND_SEND_FRAMES = 2
export const SECOND_TYPE_FRAMES = 16

export const COMMAND_MENU_START = TURN_END
export const COMMAND_SELECT_START = COMMAND_MENU_START + COMMAND_MENU_FRAMES
export const COMMAND_TYPE_START = COMMAND_SELECT_START + COMMAND_SELECT_FRAMES
export const COMMAND_SEND_START = COMMAND_TYPE_START + COMMAND_TYPE_FRAMES
export const SECOND_WAIT_START = COMMAND_SEND_START + COMMAND_SEND_FRAMES
export const SECOND_TYPE_START = SECOND_WAIT_START + TURN_WAIT_FRAMES
export const SECOND_HOLD_START = SECOND_TYPE_START + SECOND_TYPE_FRAMES
export const TOTAL = SECOND_HOLD_START + TURN_HOLD_FRAMES

export interface FrameState {
  column: number
  direction: 1 | -1
  phase: number
  bubble: { text: string; open: boolean } | null
  era: "working" | "rest"
  input: string
  commandMenu: boolean
}

/**
 * Whether the water row shows a tilde at `column`.
 *
 * The upper row shares the duck's body row, and the real renderer splices the
 * eight-column sprite over it, spaces included. Water must therefore disappear
 * under the whole footprint, not just under the non-space glyphs.
 */
export function waterVisible(column: number, phase: number, row: number, duckColumn: number): boolean {
  if (row === 0 && column >= duckColumn && column < duckColumn + DUCK_WIDTH) return false
  return hasTilde(column, phase, row)
}

/** Places a segment into a row, clipping on the left the way the section does. */
function overlay(row: string, segment: string, at: number): string {
  if (at < 0) {
    const visible = segment.slice(-at)
    return visible + row.slice(visible.length)
  }
  const padded = row.padEnd(at + segment.length, " ")
  return padded.slice(0, at) + segment + padded.slice(at + segment.length)
}

function waterRow(phase: number, row: 0 | 1, duckColumn?: number): string {
  let line = ""
  for (let column = 0; column < LANE_COLS; column++) {
    const visible = duckColumn === undefined
      ? hasTilde(column, phase, row)
      : waterVisible(column, phase, row, duckColumn)
    line += visible ? "~" : " "
  }
  return line
}

/**
 * The section's nine content rows, composed exactly as the plugin's `paint()`:
 * the duck over the upper water row, the lower water row, and the plugin's own
 * bubble rows beside the duck. The renderer only draws these strings.
 */
export function sidebarRows(state: FrameState): string[] {
  const rows: string[] = new Array(BUBBLE_CONTENT_ROWS).fill("")
  const sprite = state.direction === 1
    ? (state.bubble?.open ? SPRITES.right.open : SPRITES.right.closed)
    : (state.bubble?.open ? SPRITES.left.open : SPRITES.left.closed)
  const indent = " ".repeat(state.column)

  rows[HEAD_ROW] = indent + sprite[0]
  rows[BEAK_ROW] = indent + sprite[1]
  rows[BODY_ROW] = overlay(waterRow(state.phase, 0, state.column), sprite[2], state.column)
  rows[LOWER_WATER_ROW] = waterRow(state.phase, 1)

  if (state.bubble !== null) {
    const side: BubbleSide = state.direction === 1 ? "right" : "left"
    const at = side === "right" ? state.column + DUCK_WIDTH : state.column - BUBBLE_WIDTH
    const segments = bubbleRows(wrapBubbleText(state.bubble.text), side)
    for (const [index, segment] of segments.entries()) {
      if (segment !== undefined) rows[index] = overlay(rows[index]!, segment, at)
    }
  }

  return rows
}

/** The plugin's waiting dots, including the doubled `Quack...` step. */
function quack(i: number, start: number): { text: string; open: boolean } {
  const step = THINKING_STEPS[(i - start) % THINKING_STEPS.length] ?? 1
  return { text: thinkingText(step), open: false }
}

/** A joke revealed one word every two frames, with the plugin's beak cadence. */
function typed(i: number, start: number, words: string[]): { text: string; open: boolean } {
  const count = Math.min(words.length, 1 + Math.floor((i - start) / 2))
  return { text: words.slice(0, count).join(" "), open: beakOpen(count, words.length) }
}

function firstAnswer(i: number, demo: DemoScenario): { text: string; open: boolean } {
  if (i < FIRST_TYPE_START) return quack(i, REST_START)
  if (i < FIRST_HOLD_START) return typed(i, FIRST_TYPE_START, demo.firstWords)
  return { text: demo.firstJoke, open: true }
}

function commandState(i: number, demo: DemoScenario): { input: string; commandMenu: boolean } {
  if (i < COMMAND_SELECT_START) return { input: "/", commandMenu: true }
  if (i < COMMAND_TYPE_START) return { input: "/duck ", commandMenu: false }
  if (i < COMMAND_SEND_START) {
    const count = Math.min(demo.questionWords.length, 1 + Math.floor((i - COMMAND_TYPE_START) / 2))
    return { input: `/duck ${demo.questionWords.slice(0, count).join(" ")}`, commandMenu: false }
  }
  return { input: demo.command, commandMenu: false }
}

function secondAnswer(i: number, demo: DemoScenario): { text: string; open: boolean } {
  if (i < SECOND_TYPE_START) return quack(i, SECOND_WAIT_START)
  if (i < SECOND_HOLD_START) return typed(i, SECOND_TYPE_START, demo.secondWords)
  return { text: demo.secondJoke, open: true }
}

/** Everything the renderer needs to know for frame `i`. */
export function frameState(i: number, locale: Locale = "en"): FrameState {
  const demo = SCENARIOS[locale]
  if (i < REST_START) {
    return {
      column: Math.min(LIMIT, Math.floor((i * LIMIT) / (TURN_OUT_FRAMES - 1))),
      direction: 1,
      phase: (i * WAVE_PERIOD) / (TURN_OUT_FRAMES - 1),
      bubble: null,
      era: "working",
      input: "",
      commandMenu: false,
    }
  }

  // Docked at the right edge facing left. The column never changes again and
  // never travels back left, so the cow's leftward-crossing trigger cannot fire.
  if (i < TURN_END) {
    return {
      column: LIMIT,
      direction: -1,
      phase: WAVE_PERIOD,
      bubble: firstAnswer(i, demo),
      era: "rest",
      input: "",
      commandMenu: false,
    }
  }

  // The first bubble stays on screen while the user opens `/duck`, selects it
  // and types the question. The command does not enter the transcript.
  if (i < SECOND_WAIT_START) {
    return {
      column: LIMIT,
      direction: -1,
      phase: WAVE_PERIOD,
      bubble: { text: demo.firstJoke, open: true },
      era: "rest",
      ...commandState(i, demo),
    }
  }

  return {
    column: LIMIT,
    direction: -1,
    phase: WAVE_PERIOD,
    bubble: secondAnswer(i, demo),
    era: "rest",
    input: "",
    commandMenu: false,
  }
}
