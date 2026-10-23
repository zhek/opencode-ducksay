import { describe, expect, test } from "bun:test"
import { createDuckState, createDuckStates } from "../src/duck-state.ts"

describe("duck state", () => {
  test("starts at the left edge, facing right, before the first swim", () => {
    const state = createDuckState({ jokeReady: false, jokeText: "Quack-quack!" })

    expect(state).toEqual({
      column: 0,
      direction: 1,
      wavePhase: 0,
      hasSwum: false,
      mode: "rest",
      jokeReady: false,
      jokeText: "Quack-quack!",
      shown: 0,
      dotsStep: 0,
      owed: false,
    })
  })

  test("keeps the bubble fields it is given", () => {
    const state = createDuckState({ jokeReady: true, jokeText: "Ducks fly south" })

    expect(state.jokeReady).toBe(true)
    expect(state.jokeText).toBe("Ducks fly south")
  })

  test("gives every plugin lifetime its own empty store", () => {
    const first = createDuckStates()
    first.set("ses_one", createDuckState({ jokeReady: true, jokeText: "Quack-quack!" }))

    expect(first.size).toBe(1)
    expect(createDuckStates().size).toBe(0)
  })
})
