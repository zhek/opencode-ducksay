import { describe, expect, test } from "bun:test"
import { columnsOf, displayWidth, padToWidth, sliceToWidth } from "../src/width.ts"

describe("columnsOf", () => {
  test("gives one column to the characters a terminal counts once", () => {
    for (const character of "aA9 _~()[]{}#?!.,;:'\"`|\\/@%&*+-=<>") {
      expect(columnsOf(character.codePointAt(0)!), character).toBe(1)
    }
    for (const character of "ПриветЁёјљњћџіїєґ") {
      expect(columnsOf(character.codePointAt(0)!), character).toBe(1)
    }
    for (const character of "╭╮╰╯─│…⸮✓—«»") {
      expect(columnsOf(character.codePointAt(0)!), character).toBe(1)
    }
  })

  test("gives two columns to East Asian and emoji characters", () => {
    for (const character of "鸭曰代码能跑あいう漢字한글ＡＢＣ１２３）") {
      expect(columnsOf(character.codePointAt(0)!), character).toBe(2)
    }
    expect(columnsOf("😀".codePointAt(0)!)).toBe(2)
  })

  test("counts East Asian ambiguous signs as one column", () => {
    // `…`, `±` and the like are ambiguous: a terminal may draw them narrow or
    // wide, and the default is narrow — the same call the bubble and the card
    // make, so the two never disagree with each other.
    for (const character of "…±°§×÷") expect(columnsOf(character.codePointAt(0)!), character).toBe(1)
  })

  test("gives no column to combining marks and invisible controls", () => {
    expect(columnsOf(0x0301)).toBe(0) // combining acute
    expect(columnsOf(0xfe0f)).toBe(0) // emoji variation selector
    expect(columnsOf(0x200d)).toBe(0) // zero-width joiner
    expect(columnsOf(0x00)).toBe(0)
  })
})

describe("displayWidth", () => {
  test("counts columns, not characters", () => {
    expect(displayWidth("duck")).toBe(4)
    expect(displayWidth("鸭曰代码能跑")).toBe(12)
    expect(displayWidth("鸭 duck")).toBe(7)
    // The accent hangs on the `e`, so the pair still occupies one column.
    expect(displayWidth("é")).toBe(1)
  })
})

describe("sliceToWidth", () => {
  test("never cuts a two-column character in half", () => {
    expect(sliceToWidth("鸭曰", 3)).toBe("鸭")
    expect(sliceToWidth("鸭曰", 4)).toBe("鸭曰")
    expect(sliceToWidth("a鸭", 1)).toBe("a")
    expect(sliceToWidth("a鸭", 3)).toBe("a鸭")
  })

  test("keeps ordinary text byte for byte within the limit", () => {
    expect(sliceToWidth("quack quack", 5)).toBe("quack")
    expect(sliceToWidth("quack quack", 20)).toBe("quack quack")
  })
})

describe("padToWidth", () => {
  test("pads by columns so the frame closes where it should", () => {
    expect(padToWidth("duck", 10)).toBe("duck      ")
    expect(padToWidth("鸭曰", 10)).toBe("鸭曰      ")
    expect(padToWidth("a鸭", 4)).toBe("a鸭 ")
    expect(displayWidth(padToWidth("鸭曰代码能跑", 25))).toBe(25)
  })

  test("truncates what is already too wide and still closes the field", () => {
    // Twelve whole glyphs fit in 25 columns; the thirteenth would need two.
    expect(padToWidth("鸭".repeat(20), 25)).toBe("鸭".repeat(12) + " ")
  })
})
