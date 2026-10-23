import { describe, expect, test } from "bun:test"
import {
  DEFAULT_CONTEXT_DEPTH,
  DEFAULT_LLM_TIMEOUT_MS,
  DEFAULT_SWIM_SPEED,
  MAX_CONTEXT_DEPTH,
  MAX_LLM_TIMEOUT_MS,
  MAX_SWIM_SPEED,
  resolveContextDepth,
  resolveLlmTimeout,
  resolveSwimSpeed,
} from "../src/options.ts"

describe("resolveSwimSpeed", () => {
  test("defaults to ten columns per second", () => {
    expect(DEFAULT_SWIM_SPEED).toBe(10)
    expect(resolveSwimSpeed(undefined)).toBe(10)
  })

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
    expect(resolveSwimSpeed({ swimSpeed: 5000 })).toBe(120)
    expect(resolveSwimSpeed({ swimSpeed: "5000" })).toBe(120)
  })
})

describe("resolveLlmTimeout", () => {
  test("defaults to sixty seconds", () => {
    expect(DEFAULT_LLM_TIMEOUT_MS).toBe(60_000)
    expect(resolveLlmTimeout(undefined)).toBe(60_000)
  })

  test("falls back to sixty seconds when no options are passed at all", () => {
    expect(resolveLlmTimeout(undefined)).toBe(DEFAULT_LLM_TIMEOUT_MS)
  })

  test("falls back to sixty seconds when the option is absent or null", () => {
    expect(resolveLlmTimeout({})).toBe(DEFAULT_LLM_TIMEOUT_MS)
    expect(resolveLlmTimeout({ somethingElse: true })).toBe(DEFAULT_LLM_TIMEOUT_MS)
    expect(resolveLlmTimeout({ llmTimeout: null })).toBe(DEFAULT_LLM_TIMEOUT_MS)
  })

  test("reads seconds and returns milliseconds", () => {
    expect(resolveLlmTimeout({ llmTimeout: 5 })).toBe(5_000)
    expect(resolveLlmTimeout({ llmTimeout: 1 })).toBe(1_000)
    expect(resolveLlmTimeout({ llmTimeout: 0.5 })).toBe(500)
    expect(resolveLlmTimeout({ llmTimeout: 120 })).toBe(MAX_LLM_TIMEOUT_MS)
  })

  test("reads seconds written as a string", () => {
    expect(resolveLlmTimeout({ llmTimeout: "5" })).toBe(5_000)
    expect(resolveLlmTimeout({ llmTimeout: " 8 " })).toBe(8_000)
    expect(resolveLlmTimeout({ llmTimeout: "0.5" })).toBe(500)
  })

  test("falls back to sixty seconds for blank strings, zero and negatives", () => {
    expect(resolveLlmTimeout({ llmTimeout: "" })).toBe(DEFAULT_LLM_TIMEOUT_MS)
    expect(resolveLlmTimeout({ llmTimeout: "   " })).toBe(DEFAULT_LLM_TIMEOUT_MS)
    expect(resolveLlmTimeout({ llmTimeout: "0" })).toBe(DEFAULT_LLM_TIMEOUT_MS)
    expect(resolveLlmTimeout({ llmTimeout: 0 })).toBe(DEFAULT_LLM_TIMEOUT_MS)
    expect(resolveLlmTimeout({ llmTimeout: -4 })).toBe(DEFAULT_LLM_TIMEOUT_MS)
    expect(resolveLlmTimeout({ llmTimeout: "-4" })).toBe(DEFAULT_LLM_TIMEOUT_MS)
  })

  test("falls back to sixty seconds for values that are not timeouts", () => {
    expect(resolveLlmTimeout({ llmTimeout: Number.NaN })).toBe(DEFAULT_LLM_TIMEOUT_MS)
    expect(resolveLlmTimeout({ llmTimeout: Number.POSITIVE_INFINITY })).toBe(DEFAULT_LLM_TIMEOUT_MS)
    expect(resolveLlmTimeout({ llmTimeout: Number.NEGATIVE_INFINITY })).toBe(DEFAULT_LLM_TIMEOUT_MS)
    expect(resolveLlmTimeout({ llmTimeout: "быстро" })).toBe(DEFAULT_LLM_TIMEOUT_MS)
    expect(resolveLlmTimeout({ llmTimeout: true })).toBe(DEFAULT_LLM_TIMEOUT_MS)
    expect(resolveLlmTimeout({ llmTimeout: {} })).toBe(DEFAULT_LLM_TIMEOUT_MS)
  })

  test("caps a timeout above two minutes", () => {
    expect(resolveLlmTimeout({ llmTimeout: 121 })).toBe(120_000)
    expect(resolveLlmTimeout({ llmTimeout: "5000" })).toBe(120_000)
  })
})

describe("resolveContextDepth", () => {
  test("falls back to two when no options are passed at all", () => {
    expect(resolveContextDepth(undefined)).toBe(DEFAULT_CONTEXT_DEPTH)
  })

  test("falls back to two when the option is absent or null", () => {
    expect(resolveContextDepth({})).toBe(DEFAULT_CONTEXT_DEPTH)
    expect(resolveContextDepth({ somethingElse: true })).toBe(DEFAULT_CONTEXT_DEPTH)
    expect(resolveContextDepth({ llmContextDepth: null })).toBe(DEFAULT_CONTEXT_DEPTH)
  })

  test("reads a depth below, at and above the default", () => {
    expect(resolveContextDepth({ llmContextDepth: 1 })).toBe(1)
    expect(resolveContextDepth({ llmContextDepth: 2 })).toBe(2)
    expect(resolveContextDepth({ llmContextDepth: 3 })).toBe(3)
    expect(resolveContextDepth({ llmContextDepth: 7 })).toBe(7)
  })

  test("reads a depth written as a string", () => {
    expect(resolveContextDepth({ llmContextDepth: "1" })).toBe(1)
    expect(resolveContextDepth({ llmContextDepth: "3" })).toBe(3)
    expect(resolveContextDepth({ llmContextDepth: " 4 " })).toBe(4)
    expect(resolveContextDepth({ llmContextDepth: "2.0" })).toBe(2)
  })

  test("keeps the maximum, and caps anything above it", () => {
    expect(resolveContextDepth({ llmContextDepth: MAX_CONTEXT_DEPTH })).toBe(MAX_CONTEXT_DEPTH)
    expect(resolveContextDepth({ llmContextDepth: 11 })).toBe(MAX_CONTEXT_DEPTH)
    expect(resolveContextDepth({ llmContextDepth: "5000" })).toBe(MAX_CONTEXT_DEPTH)
  })

  test("falls back to two for zero, negatives and fractions", () => {
    expect(resolveContextDepth({ llmContextDepth: 0 })).toBe(DEFAULT_CONTEXT_DEPTH)
    expect(resolveContextDepth({ llmContextDepth: "0" })).toBe(DEFAULT_CONTEXT_DEPTH)
    expect(resolveContextDepth({ llmContextDepth: -1 })).toBe(DEFAULT_CONTEXT_DEPTH)
    expect(resolveContextDepth({ llmContextDepth: 2.5 })).toBe(DEFAULT_CONTEXT_DEPTH)
    expect(resolveContextDepth({ llmContextDepth: "2.5" })).toBe(DEFAULT_CONTEXT_DEPTH)
  })

  test("falls back to two for blank, non-finite and unrelated values", () => {
    expect(resolveContextDepth({ llmContextDepth: "" })).toBe(DEFAULT_CONTEXT_DEPTH)
    expect(resolveContextDepth({ llmContextDepth: "   " })).toBe(DEFAULT_CONTEXT_DEPTH)
    expect(resolveContextDepth({ llmContextDepth: Number.NaN })).toBe(DEFAULT_CONTEXT_DEPTH)
    expect(resolveContextDepth({ llmContextDepth: Number.POSITIVE_INFINITY })).toBe(DEFAULT_CONTEXT_DEPTH)
    expect(resolveContextDepth({ llmContextDepth: Number.NEGATIVE_INFINITY })).toBe(DEFAULT_CONTEXT_DEPTH)
    expect(resolveContextDepth({ llmContextDepth: "много" })).toBe(DEFAULT_CONTEXT_DEPTH)
    expect(resolveContextDepth({ llmContextDepth: true })).toBe(DEFAULT_CONTEXT_DEPTH)
    expect(resolveContextDepth({ llmContextDepth: {} })).toBe(DEFAULT_CONTEXT_DEPTH)
  })
})