import { describe, expect, test } from "bun:test"
import { COPY_LIMIT, sanitizeClipboardText } from "../src/section/icons.ts"

describe("sanitizeClipboardText", () => {
  test("collapses control characters and whitespace to one line", () => {
    expect(sanitizeClipboardText("a\u0000b\n c\t d")).toBe("a b c d")
    expect(sanitizeClipboardText("  spaced  ")).toBe("spaced")
  })

  test("keeps ordinary text untouched", () => {
    expect(sanitizeClipboardText("( o)< Quack! (opencode-ducksay)")).toBe("( o)< Quack! (opencode-ducksay)")
  })

  test("caps the whole string at the clipboard limit", () => {
    const result = sanitizeClipboardText("x".repeat(COPY_LIMIT + 100))
    expect(result).toHaveLength(COPY_LIMIT)
    expect(result).toBe("x".repeat(COPY_LIMIT))
  })
})
