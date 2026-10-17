import { describe, expect, test } from "bun:test"
import { DEFAULT_SWIM_SPEED, MAX_SWIM_SPEED, resolveSwimSpeed } from "../src/options.ts"

describe("resolveSwimSpeed", () => {
  test("falls back to the default when no options are passed at all", () => {
    expect(resolveSwimSpeed(undefined)).toBe(DEFAULT_SWIM_SPEED)
  })

  test("falls back to the default when the option is absent", () => {
    expect(resolveSwimSpeed({})).toBe(DEFAULT_SWIM_SPEED)
    expect(resolveSwimSpeed({ somethingElse: true })).toBe(DEFAULT_SWIM_SPEED)
  })

  test("falls back to the default for an explicit null", () => {
    expect(resolveSwimSpeed({ swimSpeed: null })).toBe(DEFAULT_SWIM_SPEED)
  })

  test("keeps a zero speed, which is how the duck is told not to move", () => {
    // Guards the `||` trap: a falsy check turns 0 into the default and makes
    // the static duck unreachable.
    expect(resolveSwimSpeed({ swimSpeed: 0 })).toBe(0)
    expect(resolveSwimSpeed({ swimSpeed: "0" })).toBe(0)
  })

  test("reads a number", () => {
    expect(resolveSwimSpeed({ swimSpeed: 30 })).toBe(30)
    expect(resolveSwimSpeed({ swimSpeed: 1 })).toBe(1)
    expect(resolveSwimSpeed({ swimSpeed: MAX_SWIM_SPEED })).toBe(MAX_SWIM_SPEED)
  })

  test("reads a number written as a string", () => {
    // Quotes around a number are a common slip, and quietly answering the
    // default would be worse than reading what was written.
    expect(resolveSwimSpeed({ swimSpeed: "24" })).toBe(24)
    expect(resolveSwimSpeed({ swimSpeed: " 8 " })).toBe(8)
  })

  test("reads an empty or blank string as unset rather than as zero", () => {
    // `Number("")` is 0, and `Number("   ")` is 0 too, so a field left blank
    // would read as a request to freeze the duck.
    expect(resolveSwimSpeed({ swimSpeed: "" })).toBe(DEFAULT_SWIM_SPEED)
    expect(resolveSwimSpeed({ swimSpeed: "   " })).toBe(DEFAULT_SWIM_SPEED)
  })

  test("falls back to the default for a negative number", () => {
    expect(resolveSwimSpeed({ swimSpeed: -4 })).toBe(DEFAULT_SWIM_SPEED)
    expect(resolveSwimSpeed({ swimSpeed: "-4" })).toBe(DEFAULT_SWIM_SPEED)
  })

  test("falls back to the default for values that are not speeds at all", () => {
    expect(resolveSwimSpeed({ swimSpeed: Number.NaN })).toBe(DEFAULT_SWIM_SPEED)
    expect(resolveSwimSpeed({ swimSpeed: Number.POSITIVE_INFINITY })).toBe(DEFAULT_SWIM_SPEED)
    expect(resolveSwimSpeed({ swimSpeed: "быстро" })).toBe(DEFAULT_SWIM_SPEED)
    expect(resolveSwimSpeed({ swimSpeed: true })).toBe(DEFAULT_SWIM_SPEED)
    expect(resolveSwimSpeed({ swimSpeed: {} })).toBe(DEFAULT_SWIM_SPEED)
  })

  test("caps an absurdly high speed", () => {
    expect(resolveSwimSpeed({ swimSpeed: 5000 })).toBe(MAX_SWIM_SPEED)
    expect(resolveSwimSpeed({ swimSpeed: "5000" })).toBe(MAX_SWIM_SPEED)
  })
})