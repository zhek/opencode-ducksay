import { describe, expect, test } from "bun:test"
import { DUCK_LEFT, DUCK_RIGHT, DUCK_WIDTH } from "../src/duck.ts"
import { QUESTION_FRAMES, QUESTION_FRAME_MS, questionColumn } from "../src/question.ts"

describe("question frames", () => {
  test("cycles through question, exclamation, mirrored question, exclamation", () => {
    expect([...QUESTION_FRAMES]).toEqual(["?", "!", "⸮", "!"])
  })

  test("stays on each frame for 300 milliseconds", () => {
    expect(QUESTION_FRAME_MS).toBe(300)
  })
})

describe("questionColumn", () => {
  test("sits over the left duck's opening bracket", () => {
    expect(questionColumn(0, -1)).toBe(DUCK_LEFT[1].indexOf("("))
    expect(questionColumn(10, -1)).toBe(10 + DUCK_LEFT[1].indexOf("("))
  })

  test("sits over the right duck's closing bracket", () => {
    expect(questionColumn(0, 1)).toBe(DUCK_RIGHT[1].indexOf(")"))
    expect(questionColumn(10, 1)).toBe(10 + DUCK_RIGHT[1].indexOf(")"))
  })

  test("uses the art width for the right-facing offset", () => {
    expect(questionColumn(0, 1)).toBe(DUCK_WIDTH - 2)
    expect(questionColumn(0, -1)).toBe(1)
  })

  test("does not depend on the current frame", () => {
    for (const direction of [1, -1] as const) {
      const columns = QUESTION_FRAMES.map(() => questionColumn(7, direction))
      expect(new Set(columns)).toEqual(new Set([columns[0]]))
    }
  })
})
