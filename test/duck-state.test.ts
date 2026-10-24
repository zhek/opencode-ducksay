import { describe, expect, test } from "bun:test"
import { createDuckState, createDuckStates, type DuckState } from "../src/duck-state.ts"

describe("duck state", () => {
  test("starts at the left edge, facing right, with speech idle", () => {
    const state = createDuckState({ jokeText: "Quack-quack!" })

    expect(state).toEqual({
      column: 0,
      direction: 1,
      wavePhase: 0,
      mode: "rest",
      speech: "idle",
      jokeText: "Quack-quack!",
      shown: 0,
      dotsStep: 0,
    })
  })

  test("keeps the bubble fields it is given", () => {
    const state = createDuckState({ jokeText: "Ducks fly south" })

    expect(state.jokeText).toBe("Ducks fly south")
  })

  test("keeps a waiting or ready speech state in the snapshot", () => {
    const waiting: DuckState = createDuckState({ jokeText: "Quack-quack!" })
    waiting.speech = "waiting"
    expect(waiting.speech).toBe("waiting")

    const ready: DuckState = createDuckState({ jokeText: "Quack-quack!" })
    ready.speech = "ready"
    expect(ready.speech).toBe("ready")
  })

  test("gives every plugin lifetime its own empty store", () => {
    const first = createDuckStates()
    first.set("ses_one", createDuckState({ jokeText: "Quack-quack!" }))

    expect(first.size).toBe(1)
    expect(createDuckStates().size).toBe(0)
  })
})
