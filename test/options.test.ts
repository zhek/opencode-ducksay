import { describe, expect, test } from "bun:test"
import {
  DEFAULT_CONTEXT_DEPTH,
  DEFAULT_LLM_TIMEOUT_MS,
  DEFAULT_SWIM_SPEED,
  MAX_CONTEXT_DEPTH,
  MAX_LLM_TIMEOUT_MS,
  MAX_SWIM_SPEED,
  diagnoseOptions,
  resolveContextDepth,
  resolveLlmModel,
  resolveLlmTimeout,
  resolveSilent,
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

describe("resolveLlmModel", () => {
  test("keeps the session model when the option is absent", () => {
    expect(resolveLlmModel(undefined)).toEqual({ kind: "session" })
    expect(resolveLlmModel({})).toEqual({ kind: "session" })
    expect(resolveLlmModel({ somethingElse: true })).toEqual({ kind: "session" })
    expect(resolveLlmModel({ llmModel: null })).toEqual({ kind: "session" })
  })

  test("keeps the session model for blank strings", () => {
    expect(resolveLlmModel({ llmModel: "" })).toEqual({ kind: "session" })
    expect(resolveLlmModel({ llmModel: "   " })).toEqual({ kind: "session" })
  })

  test("keeps the session model for values that are not strings", () => {
    expect(resolveLlmModel({ llmModel: 5 })).toEqual({ kind: "session" })
    expect(resolveLlmModel({ llmModel: true })).toEqual({ kind: "session" })
    expect(resolveLlmModel({ llmModel: {} })).toEqual({ kind: "session" })
  })

  test("splits a provider and a model at the first slash", () => {
    expect(resolveLlmModel({ llmModel: "opencode/big-pickle" })).toEqual({
      kind: "model",
      model: { providerID: "opencode", id: "big-pickle" },
    })
  })

  test("trims the value at both edges", () => {
    expect(resolveLlmModel({ llmModel: " opencode/big-pickle " })).toEqual({
      kind: "model",
      model: { providerID: "opencode", id: "big-pickle" },
    })
  })

  test("keeps a colon suffix as part of the model", () => {
    // OpenRouter marks its free models with `:free`, and the suffix belongs to
    // the model id rather than to a variant the plugin knows about.
    expect(resolveLlmModel({ llmModel: "openrouter/deepseek-v3:free" })).toEqual({
      kind: "model",
      model: { providerID: "openrouter", id: "deepseek-v3:free" },
    })
  })

  test("keeps everything after the first slash as the model", () => {
    expect(resolveLlmModel({ llmModel: "provider/team/model" })).toEqual({
      kind: "model",
      model: { providerID: "provider", id: "team/model" },
    })
  })

  test("reports a value without a provider or a model as unusable", () => {
    // A non-blank value says the user meant to name a model, so the duck must
    // not quietly fall back to the session model and spend it.
    expect(resolveLlmModel({ llmModel: "opus" })).toEqual({ kind: "unusable" })
    expect(resolveLlmModel({ llmModel: "/big-pickle" })).toEqual({ kind: "unusable" })
    expect(resolveLlmModel({ llmModel: "opencode/" })).toEqual({ kind: "unusable" })
    expect(resolveLlmModel({ llmModel: "/" })).toEqual({ kind: "unusable" })
  })
})

describe("resolveSilent", () => {
  test("speaks by default when no options are passed", () => {
    expect(resolveSilent(undefined)).toBe(false)
    expect(resolveSilent({})).toBe(false)
  })

  test("reads the boolean true as silent", () => {
    expect(resolveSilent({ silent: true })).toBe(true)
  })

  test("reads true written as a string, ignoring spaces and case", () => {
    expect(resolveSilent({ silent: "true" })).toBe(true)
    expect(resolveSilent({ silent: " TRUE " })).toBe(true)
    expect(resolveSilent({ silent: "True" })).toBe(true)
  })

  test("keeps speech on for false and for values that are not true", () => {
    expect(resolveSilent({ silent: false })).toBe(false)
    expect(resolveSilent({ silent: "false" })).toBe(false)
    expect(resolveSilent({ silent: 0 })).toBe(false)
    expect(resolveSilent({ silent: "yes" })).toBe(false)
    expect(resolveSilent({ silent: {} })).toBe(false)
  })
})
describe("diagnoseOptions", () => {
  test("reports nothing for unset, null and valid values", () => {
    expect(diagnoseOptions(undefined)).toEqual([])
    expect(diagnoseOptions({})).toEqual([])
    expect(diagnoseOptions({ swimSpeed: 24, llmTimeout: 10, llmContextDepth: 3, llmModel: "opencode/big-pickle" })).toEqual([])
    expect(diagnoseOptions({ swimSpeed: null, llmTimeout: null, llmContextDepth: null, llmModel: null })).toEqual([])
  })

  test("reports a swimSpeed fallback and a cap with exact values", () => {
    expect(diagnoseOptions({ swimSpeed: -5 })).toEqual([
      {
        option: "swimSpeed",
        value: -5,
        effective: 10,
        reason: "fallback",
        message: "The swimSpeed option is invalid.",
      },
    ])
    expect(diagnoseOptions({ swimSpeed: 500 })).toEqual([
      {
        option: "swimSpeed",
        value: 500,
        effective: 120,
        reason: "capped",
        message: "The swimSpeed option was capped.",
      },
    ])
  })

  test("reports a blank string as a fallback with the raw value", () => {
    expect(diagnoseOptions({ swimSpeed: "  " })).toEqual([
      {
        option: "swimSpeed",
        value: "  ",
        effective: 10,
        reason: "fallback",
        message: "The swimSpeed option is invalid.",
      },
    ])
  })

  test("reports llmTimeout fallback and cap in milliseconds", () => {
    expect(diagnoseOptions({ llmTimeout: 0 })).toEqual([
      {
        option: "llmTimeout",
        value: 0,
        effective: 60000,
        reason: "fallback",
        message: "The llmTimeout option is invalid.",
      },
    ])
    expect(diagnoseOptions({ llmTimeout: 500 })).toEqual([
      {
        option: "llmTimeout",
        value: 500,
        effective: 120000,
        reason: "capped",
        message: "The llmTimeout option was capped.",
      },
    ])
  })

  test("reports llmContextDepth fallback and cap", () => {
    expect(diagnoseOptions({ llmContextDepth: 0 })).toEqual([
      {
        option: "llmContextDepth",
        value: 0,
        effective: 2,
        reason: "fallback",
        message: "The llmContextDepth option is invalid.",
      },
    ])
    expect(diagnoseOptions({ llmContextDepth: 50 })).toEqual([
      {
        option: "llmContextDepth",
        value: 50,
        effective: 10,
        reason: "capped",
        message: "The llmContextDepth option was capped.",
      },
    ])
  })

  test("reports an unusable llmModel with the raw value", () => {
    expect(diagnoseOptions({ llmModel: "haiku" })).toEqual([
      {
        option: "llmModel",
        value: "haiku",
        effective: null,
        reason: "unusable",
        message: "The llmModel option is not a usable provider/model reference.",
      },
    ])
  })

  test("reports every invalid option at once", () => {
    const diagnostics = diagnoseOptions({
      swimSpeed: -1,
      llmTimeout: 0,
      llmContextDepth: 99,
      llmModel: "haiku",
    })

    expect(diagnostics.map((diagnostic) => diagnostic.option)).toEqual([
      "swimSpeed",
      "llmTimeout",
      "llmContextDepth",
      "llmModel",
    ])
  })

  test("does not diagnose silent", () => {
    expect(diagnoseOptions({ silent: "maybe" })).toEqual([])
  })
})
