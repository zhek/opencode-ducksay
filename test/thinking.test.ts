import { describe, expect, test } from "bun:test"
import {
  BEAK_TOGGLE_WORDS,
  THINKING_BASE,
  THINKING_STEPS,
  beakOpen,
  bubbleWords,
  holdsAfter,
  revealText,
  thinkingText,
} from "../src/thinking.ts"

describe("thinking text", () => {
  test("grows one dot at a time", () => {
    expect(thinkingText(1)).toBe("Quack.")
    expect(thinkingText(2)).toBe("Quack..")
    expect(thinkingText(3)).toBe("Quack...")
  })

  test("starts from the bare word", () => {
    expect(thinkingText(0)).toBe(THINKING_BASE)
    expect(THINKING_BASE).toBe("Quack")
  })

  test("never throws on a negative count", () => {
    expect(thinkingText(-1)).toBe("Quack")
  })
})

describe("thinking steps", () => {
  test("shows one, two and three dots, holding the last frame", () => {
    expect([...THINKING_STEPS]).toEqual([1, 2, 3, 3])
  })

  test("every step is a drawable dot count", () => {
    for (const step of THINKING_STEPS) expect(step).toBeGreaterThanOrEqual(1)
    for (const step of THINKING_STEPS) expect(step).toBeLessThanOrEqual(3)
  })
})

describe("bubble words", () => {
  test("splits on any run of whitespace and drops empty words", () => {
    expect(bubbleWords("  one   two\nthree ")).toEqual(["one", "two", "three"])
  })

  test("an empty message has no words", () => {
    expect(bubbleWords("")).toEqual([])
    expect(bubbleWords("   \n ")).toEqual([])
  })
})

describe("revealing words", () => {
  const TEXT = "The parser quacks back"

  test("shows the first count words in order", () => {
    expect(revealText(TEXT, 1)).toBe("The")
    expect(revealText(TEXT, 2)).toBe("The parser")
    expect(revealText(TEXT, 4)).toBe(TEXT)
  })

  test("never shows a partial word", () => {
    const all = bubbleWords(TEXT)
    for (let count = 0; count <= all.length; count++) {
      expect(bubbleWords(revealText(TEXT, count))).toEqual(all.slice(0, count))
    }
  })

  test("clamps the count at both ends", () => {
    expect(revealText(TEXT, 0)).toBe("")
    expect(revealText(TEXT, -3)).toBe("")
    expect(revealText(TEXT, 99)).toBe(TEXT)
  })

  test("normalises the whitespace it rejoins", () => {
    expect(revealText("  one   two  ", 2)).toBe("one two")
  })
})

describe("beak cadence", () => {
  test("opens for the first two words and closes for the next two", () => {
    const total = 6
    expect(beakOpen(1, total)).toBe(true)
    expect(beakOpen(2, total)).toBe(true)
    expect(beakOpen(3, total)).toBe(false)
    expect(beakOpen(4, total)).toBe(false)
  })

  test("opens for the next pair after that", () => {
    expect(beakOpen(5, 6)).toBe(true)
  })

  test("is always open on the last word", () => {
    expect(beakOpen(3, 3)).toBe(true)
    expect(beakOpen(5, 5)).toBe(true)
    expect(beakOpen(1, 1)).toBe(true)
  })

  test("is closed before any word", () => {
    expect(beakOpen(0, 3)).toBe(false)
  })

  test("toggles every two words", () => {
    expect(BEAK_TOGGLE_WORDS).toBe(2)
  })
})

describe("punctuation pause", () => {
  test("holds after a full stop, comma, exclamation or question mark", () => {
    for (const word of ["back.", "back,", "back!", "back?", "back;", "back:", "back…", "Quack-quack!"]) {
      expect(holdsAfter(word)).toBe(true)
    }
  })

  test("does not hold after an ordinary word", () => {
    expect(holdsAfter("back")).toBe(false)
    expect(holdsAfter("")).toBe(false)
    expect(holdsAfter("quack-quack")).toBe(false)
  })
})
