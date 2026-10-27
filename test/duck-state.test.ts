import { describe, expect, test } from "bun:test"
import {
  appendExchange,
  createDuckState,
  createDuckStates,
  type DuckExchange,
  type DuckState,
} from "../src/duck-state.ts"

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
      dialogue: [],
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

  test("gives every snapshot its own dialogue", () => {
    const first = createDuckState({ jokeText: "Quack-quack!" })
    const second = createDuckState({ jokeText: "Quack-quack!" })

    first.dialogue.push({ duck: "Only the first duck said this" })

    expect(first.dialogue).toHaveLength(1)
    expect(second.dialogue).toHaveLength(0)
  })
})

describe("duck dialogue", () => {
  const exchange = (index: number): DuckExchange => ({ user: `question ${index}`, duck: `answer ${index}` })

  test("keeps the exchanges in the order they happened", () => {
    const dialogue = appendExchange(appendExchange([], exchange(1)), exchange(2))

    expect(dialogue.map((entry) => entry.duck)).toEqual(["answer 1", "answer 2"])
  })

  test("keeps at most five exchanges and drops the oldest one whole", () => {
    let dialogue: DuckExchange[] = []
    for (let index = 1; index <= 6; index += 1) dialogue = appendExchange(dialogue, exchange(index))

    expect(dialogue).toHaveLength(5)
    expect(dialogue[0]).toEqual({ user: "question 2", duck: "answer 2" })
    expect(dialogue[4]).toEqual({ user: "question 6", duck: "answer 6" })
    expect(dialogue.some((entry) => entry.user === "question 1")).toBe(false)
  })

  test("keeps a silent reply and an automatic joke distinguishable", () => {
    const automatic = appendExchange([], { duck: "nobody asked" })
    const silent = appendExchange([], { user: "<silent>", duck: "still here" })

    expect(automatic[0]!.user).toBeUndefined()
    expect(silent[0]!.user).toBe("<silent>")
  })
})
