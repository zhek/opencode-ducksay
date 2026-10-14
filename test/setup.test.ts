import { describe, expect, test } from "bun:test"
import type { Context } from "@opencode/plugin/tui/context"
import plugin from "../src/tui.tsx"

/** Records every slot claim made by `setup`, so the test can inspect placement. */
function fakeContext() {
  const claims: Record<string, unknown>[] = []
  const context = {
    theme: { text: { base: { r: 0.2, g: 0.2, b: 0.2 } } },
    ui: {
      slot: (claim: Record<string, unknown>) => {
        claims.push(claim)
        return () => {}
      },
    },
  } as unknown as Context
  return { context, claims }
}

describe("setup", () => {
  test("claims the sidebar content slot", async () => {
    const { context, claims } = fakeContext()
    await plugin.setup(context)

    expect(claims).toHaveLength(1)
    expect(claims[0]!.append).toBe("sidebar.content")
  })

  test("appends, so the section lands below the built-in sections", async () => {
    const { context, claims } = fakeContext()
    await plugin.setup(context)

    const claim = claims[0]!
    expect(claim.prepend).toBeUndefined()
    expect(claim.before).toBeUndefined()
    expect(claim.after).toBeUndefined()
    expect(claim.replace).toBeUndefined()
  })

  test("returns the slot teardown so a reload does not leak the claim", async () => {
    const { context } = fakeContext()
    const cleanup = await plugin.setup(context)

    expect(typeof cleanup).toBe("function")
  })
})