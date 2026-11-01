import { describe, expect, test } from "bun:test"
import {
  BUBBLE_TEXT_WIDTH,
  BUBBLE_WIDTH,
  BUBBLE_CONTENT_ROWS,
  BUBBLE_MAX_LINES,
  bubbleRows,
  wrapBubbleText,
} from "../src/bubble.ts"
import { DUCK_LEFT, DUCK_LEFT_OPEN, DUCK_RIGHT, DUCK_RIGHT_OPEN, DUCK_WIDTH } from "../src/duck.ts"
import { laneLimit } from "../src/lane.ts"
import { THINKING_STEPS, beakOpen, bubbleWords, revealText, thinkingText } from "../src/thinking.ts"
import { hasTilde as pluginHasTilde } from "../src/wave.ts"
import {
  COMMAND_MENU_START,
  COMMAND_SELECT_START,
  COMMAND_SEND_START,
  COMMAND_TYPE_START,
  FIRST_HOLD_START,
  FIRST_TYPE_START,
  LANE_COLS,
  LIMIT,
  LOCALES,
  REST_START,
  SCENARIOS,
  SECOND_HOLD_START,
  SECOND_TYPE_START,
  SECOND_WAIT_START,
  SPRITES,
  TOTAL,
  TURN_END,
  TURN_WAIT_FRAMES,
  frameState,
  hasTilde,
  sidebarRows,
  waterVisible,
  type FrameState,
} from "../scripts/demo-layout.ts"

const CASES = [
  {
    locale: "en" as const,
    first: ["Hello! I'd wave back, but", "these wings are busy", "swimming."],
    second: ["The tokens are always", "juicier across the road."],
  },
  {
    locale: "ru" as const,
    first: ["Привет! Помахал бы, но", "эти крылья заняты", "плаванием."],
    second: ["Через дорогу всегда более", "сочные токены."],
  },
]

describe("demo parity with the plugin", () => {
  test("uses the plugin's lane, sprites and wave module", () => {
    expect(LANE_COLS).toBe(BUBBLE_WIDTH + DUCK_WIDTH)
    expect(LIMIT).toBe(laneLimit(LANE_COLS, DUCK_WIDTH))
    expect(SPRITES.left.closed).toBe(DUCK_LEFT)
    expect(SPRITES.left.open).toBe(DUCK_LEFT_OPEN)
    expect(SPRITES.right.closed).toBe(DUCK_RIGHT)
    expect(SPRITES.right.open).toBe(DUCK_RIGHT_OPEN)
    expect(hasTilde).toBe(pluginHasTilde)
  })

  test("composes the section's nine rows from the plugin's art and bubble", () => {
    for (const locale of LOCALES) {
      for (const frame of [
        frameState(0, locale),
        frameState(FIRST_HOLD_START, locale),
        frameState(SECOND_WAIT_START, locale),
        frameState(SECOND_HOLD_START, locale),
      ]) {
        expect(sidebarRows(frame)).toHaveLength(BUBBLE_CONTENT_ROWS)
        for (const row of sidebarRows(frame)) expect(row.length).toBeLessThanOrEqual(LANE_COLS)
      }
    }
  })

  test("puts the plugin's own bubble rows beside the duck on either side", () => {
    for (const locale of LOCALES) {
      const left = frameState(FIRST_HOLD_START, locale)
      const right: FrameState = { ...left, column: 0, direction: 1 }

      for (const state of [left, right]) {
        const rows = sidebarRows(state)
        const side = state.direction === 1 ? "right" : "left"
        const at = side === "right" ? state.column + DUCK_WIDTH : state.column - BUBBLE_WIDTH
        const expected = bubbleRows(wrapBubbleText(state.bubble!.text), side)
        for (const [index, segment] of expected.entries()) {
          if (segment !== undefined) {
            expect(rows[index]!.slice(at, at + BUBBLE_WIDTH)).toBe(segment)
          }
        }
      }
    }
  })

  test("draws the plugin's sprites and water on the section rows", () => {
    const head = BUBBLE_MAX_LINES
    const beak = head + 1
    const body = head + 2
    const lower = head + 3
    const cases: ReadonlyArray<readonly [number, readonly string[]]> = [
      [0, DUCK_RIGHT],
      [FIRST_HOLD_START, DUCK_LEFT_OPEN],
      [SECOND_HOLD_START, DUCK_LEFT_OPEN],
    ]

    for (const locale of LOCALES) {
      for (const [frame, sprite] of cases) {
        const state = frameState(frame, locale)
        const rows = sidebarRows(state)
        expect(rows[head]!.slice(state.column, state.column + DUCK_WIDTH)).toBe(sprite[0])
        expect(rows[beak]!.slice(state.column, state.column + DUCK_WIDTH)).toBe(sprite[1])
        expect(rows[body]!.slice(state.column, state.column + DUCK_WIDTH)).toBe(sprite[2])
        expect(rows[body]!.length).toBe(LANE_COLS)
        expect(rows[lower]!.length).toBe(LANE_COLS)

        for (let column = 0; column < LANE_COLS; column++) {
          const underDuck = column >= state.column && column < state.column + DUCK_WIDTH
          const upper = underDuck
            ? sprite[2]![column - state.column]
            : hasTilde(column, state.phase, 0) ? "~" : " "
          expect(rows[body]![column]).toBe(upper)
          expect(rows[lower]![column]).toBe(hasTilde(column, state.phase, 1) ? "~" : " ")
        }
      }
    }
  })

  test("keeps every frame inside the plugin's row and lane count", () => {
    for (const locale of LOCALES) {
      for (let i = 0; i < TOTAL; i++) {
        const state = frameState(i, locale)
        const rows = sidebarRows(state)
        expect(rows).toHaveLength(BUBBLE_CONTENT_ROWS)
        for (const row of rows) expect(row.length).toBeLessThanOrEqual(LANE_COLS)
      }
    }
  })

  test("waits with the plugin's Quack sequence", () => {
    for (const locale of LOCALES) {
      for (const start of [REST_START, SECOND_WAIT_START]) {
        for (let step = 0; step < TURN_WAIT_FRAMES; step++) {
          const dots = THINKING_STEPS[step % THINKING_STEPS.length] ?? 1
          expect(frameState(start + step, locale).bubble).toEqual({
            text: thinkingText(dots),
            open: false,
          })
        }
      }
    }
  })

  test("reveals both answers with the plugin's text and beak cadence", () => {
    for (const locale of LOCALES) {
      const scenario = SCENARIOS[locale]
      const answers = [
        { start: FIRST_TYPE_START, hold: FIRST_HOLD_START, text: scenario.firstJoke },
        { start: SECOND_TYPE_START, hold: SECOND_HOLD_START, text: scenario.secondJoke },
      ]
      for (const { start, hold, text } of answers) {
        const words = bubbleWords(text)
        for (let i = start; i < hold; i++) {
          const count = Math.min(words.length, 1 + Math.floor((i - start) / 2))
          expect(frameState(i, locale).bubble).toEqual({
            text: revealText(text, count),
            open: beakOpen(count, words.length),
          })
        }
      }
    }
  })
})

describe("demo scenarios", () => {
  test("ships a GIF for every README language", () => {
    expect(LOCALES).toEqual(["en", "ru"])
    expect(SCENARIOS.en.file).toBe("ducksay-demo.gif")
    expect(SCENARIOS.ru.file).toBe("ducksay-demo.ru.gif")
  })

  test("the command carries the question in the scenario language", () => {
    for (const locale of LOCALES) {
      const scenario = SCENARIOS[locale]
      expect(scenario.command).toBe(`/duck ${scenario.question}`)
    }
  })
})

describe("demo water", () => {
  test("draws four tildes followed by a five-column gap", () => {
    const row = Array.from({ length: 18 }, (_, column) => pluginHasTilde(column, 0, 0))
    expect(row).toEqual([
      true, true, true, true, false, false, false, false, false,
      true, true, true, true, false, false, false, false, false,
    ])
  })

  test("offsets the lower row so the clusters stagger", () => {
    const row = Array.from({ length: 9 }, (_, column) => pluginHasTilde(column, 0, 1))
    expect(row).toEqual([false, false, false, false, false, true, true, true, true])
  })

  test("leaves the duck's whole eight-column footprint dry on its own row", () => {
    const duckColumn = 10
    for (let column = duckColumn; column < duckColumn + DUCK_WIDTH; column++) {
      expect(waterVisible(column, 0, 0, duckColumn)).toBe(false)
    }
    // Just outside the footprint the pattern is untouched, even where it would
    // otherwise draw a tilde: 9 and 18 are the nearest edge columns here.
    expect(waterVisible(9, 0, 0, duckColumn)).toBe(pluginHasTilde(9, 0, 0))
    expect(waterVisible(18, 0, 0, duckColumn)).toBe(pluginHasTilde(18, 0, 0))
  })

  test("does not remove the water row under the duck", () => {
    expect(waterVisible(14, 0, 1, 10)).toBe(pluginHasTilde(14, 0, 1))
    expect(waterVisible(10, 0, 1, 10)).toBe(pluginHasTilde(10, 0, 1))
  })
})

for (const { locale, first, second } of CASES) {
  describe(`${locale} demo timeline`, () => {
    const scenario = SCENARIOS[locale]
    const state = (i: number) => frameState(i, locale)

    test("wraps both jokes into lines that fit the bubble field", () => {
      expect(wrapBubbleText(scenario.firstJoke)).toEqual(first)
      expect(wrapBubbleText(scenario.secondJoke)).toEqual(second)
      for (const line of [...first, ...second]) {
        expect(line.length).toBeLessThanOrEqual(BUBBLE_TEXT_WIDTH)
      }
    })

    test("keeps every word of both jokes in order", () => {
      expect(wrapBubbleText(scenario.firstJoke).join(" ")).toBe(scenario.firstJoke)
      expect(wrapBubbleText(scenario.secondJoke).join(" ")).toBe(scenario.secondJoke)
    })

    test("swims right and never travels back left", () => {
      // The cow easter egg is rolled on a leftward crossing of the lane's
      // middle. The demo's duck only moves right and then stands still, so no
      // frame can trigger it. This test is the guard for that promise.
      const columns = Array.from({ length: TOTAL }, (_, i) => state(i).column)
      expect(columns[0]).toBe(0)
      expect(columns[REST_START - 1]).toBe(LIMIT)
      for (let i = 1; i < columns.length; i++) {
        expect(columns[i]!).toBeGreaterThanOrEqual(columns[i - 1]!)
      }
      expect(state(TOTAL - 1).column).toBe(LIMIT)
    })

    test("faces right only while working", () => {
      expect(state(0).direction).toBe(1)
      expect(state(REST_START - 1).direction).toBe(1)
      expect(state(REST_START).direction).toBe(-1)
      expect(state(TOTAL - 1).direction).toBe(-1)
    })

    test("is quiet while swimming and answers the first turn", () => {
      for (let i = 0; i < REST_START; i++) expect(state(i).bubble).toBeNull()
      expect(state(REST_START).bubble?.text.startsWith("Quack")).toBe(true)
      expect(state(FIRST_HOLD_START).bubble).toEqual({ text: scenario.firstJoke, open: true })
    })

    test("keeps the first bubble while the command is prepared", () => {
      for (let i = TURN_END; i < SECOND_WAIT_START; i++) {
        const frame = state(i)
        expect(frame.input.length).toBeGreaterThan(0)
        expect(frame.bubble).toEqual({ text: scenario.firstJoke, open: true })
      }
    })

    test("opens the command menu, then replaces it with the selected command", () => {
      expect(state(COMMAND_MENU_START)).toMatchObject({
        input: "/",
        commandMenu: true,
        bubble: { text: scenario.firstJoke, open: true },
      })
      expect(state(COMMAND_SELECT_START)).toMatchObject({
        input: "/duck ",
        commandMenu: false,
      })
    })

    test("types the question after the command without entering the transcript", () => {
      expect(state(COMMAND_TYPE_START).input).toBe(`/duck ${scenario.questionWords[0]}`)
      expect(state(COMMAND_SEND_START - 1).input).toBe(scenario.command)
      expect(state(COMMAND_SEND_START).input).toBe(scenario.command)
      for (let i = COMMAND_TYPE_START; i < COMMAND_SEND_START; i++) {
        expect(scenario.command.startsWith(state(i).input)).toBe(true)
      }
    })

    test("clears the prompt and shows the second answer", () => {
      expect(state(SECOND_WAIT_START)).toMatchObject({ input: "", commandMenu: false })
      expect(state(SECOND_WAIT_START).bubble?.text.startsWith("Quack")).toBe(true)
      expect(state(SECOND_TYPE_START).bubble?.text).toBe(scenario.secondWords[0])
      for (let i = SECOND_TYPE_START; i < SECOND_HOLD_START; i++) {
        expect(scenario.secondJoke.startsWith(state(i).bubble!.text)).toBe(true)
      }
      expect(state(SECOND_HOLD_START - 1).bubble).toEqual({ text: scenario.secondJoke, open: true })
      expect(state(SECOND_HOLD_START).bubble).toEqual({ text: scenario.secondJoke, open: true })
      expect(state(TOTAL - 1).bubble).toEqual({ text: scenario.secondJoke, open: true })
    })
  })
}
