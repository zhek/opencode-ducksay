/** @jsxImportSource @opentui/solid */
import { describe, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { RGBA } from "@opentui/core"
import { DUCK } from "../src/duck.ts"
import { Ducksay } from "../src/tui.tsx"

/** `SESSION_SIDEBAR_WIDTH` from OpenCode's session sidebar. */
const PANEL_WIDTH = 42
const PANEL_CONTENT_WIDTH = 37
// `fg` clones the value, so the fixture has to be a real RGBA, not a plain
// object. In the plugin the host passes `theme.text.base`, already an RGBA.
const PRIMARY = RGBA.fromHex("#e5e5e5")

async function frame(art?: readonly string[], width = PANEL_WIDTH) {
  const setup = await testRender(() => <Ducksay primary={PRIMARY} art={art} />, {
    width,
    height: 8,
  })
  await setup.waitForVisualIdle()
  const captured = setup.captureCharFrame()
  await setup.dispose()
  return captured
}

describe("Ducksay section", () => {
  test("renders the heading and every art line", async () => {
    const captured = await frame()

    expect(captured).toContain("Ducksay")
    for (const line of DUCK) expect(captured).toContain(line)
  })

  test("puts the art at the left edge of the panel, with no added indent", async () => {
    const captured = await frame()
    const rows = captured.split("\n")

    // The heading is on the first row; the three art lines follow, each starting
    // at column 0. If the plugin added a margin, these indices would shift.
    const artRows = rows.filter((row) => DUCK.some((line) => row.includes(line)))
    expect(artRows).toHaveLength(3)
    for (const line of DUCK) {
      const row = rows.find((r) => r.includes(line))!
      expect(row.indexOf(line)).toBe(0)
    }
  })

  test("keeps the heading above the art", async () => {
    const rows = (await frame()).split("\n")
    const heading = rows.findIndex((row) => row.includes("Ducksay"))
    const lastArtRow = rows.findLastIndex((row) => DUCK.some((line) => row.includes(line)))

    expect(heading).toBeGreaterThanOrEqual(0)
    expect(heading).toBeLessThan(lastArtRow)
  })

  test("stacks its lines even when the parent lays claims out in a row", async () => {
    // Regression: the sidebar's own slot container does not give us a vertical
    // direction. Inheriting its layout ran the heading and all three art lines
    // together into one line of text. The section must declare its own
    // direction rather than rely on the parent's.
    const setup = await testRender(
      () => (
        <box flexDirection="row">
          <Ducksay primary={PRIMARY} />
        </box>
      ),
      { width: PANEL_WIDTH, height: 8 },
    )
    await setup.waitForVisualIdle()
    const rows = setup.captureCharFrame().split("\n")
    await setup.dispose()

    for (const line of DUCK) {
      const row = rows.find((r) => r.includes(line))
      expect(row).toBeDefined()
      expect(row!.indexOf(line)).toBe(0)
    }
    expect(rows.find((r) => r.includes("Ducksay"))!.indexOf("Ducksay")).toBe(0)
  })

  test("does not wrap a line wider than the panel content width", async () => {
    // Rendered at the content width (37), so a line past it has to either wrap
    // or get clipped — which is exactly the difference under test.
    const wide = "W".repeat(PANEL_CONTENT_WIDTH + 18)
    const rows = (await frame(["  __", wide], PANEL_CONTENT_WIDTH)).split("\n")

    // With `wrapMode="none"` the line stays on one row (clipped at the edge);
    // the default wrap mode would spill the tail onto the next row.
    expect(rows.filter((row) => row.includes("W"))).toHaveLength(1)
  })
})