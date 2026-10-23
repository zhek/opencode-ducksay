/** @jsxImportSource @opentui/solid */
import { afterAll, describe, expect, test } from "bun:test"
import { createComponent, render } from "@opentui/solid"
import { createTestRenderer, ManualClock } from "@opentui/core/testing"
import { RGBA } from "@opentui/core"
import { createSignal, Show } from "solid-js/dist/solid.js"
import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

/**
 * The host loads plugins with two module rules that matter here:
 *
 * - `solid-js` is rewritten to the host's own Solid runtime, so the plugin and
 *   the host share one owner tree and one signal graph;
 * - `solid-js/dist/solid.js` is not in that map, so a plugin that imports the
 *   subpath gets a second Solid instance of its own.
 *
 * The second instance still runs effects, but the host cannot dispose them when
 * the sidebar is rebuilt. Its swim timer then keeps moving a snapshot that the
 * next mount also moves, which is what makes the duck speed up and never stop.
 *
 * This test loads the real component through a copy of the source with the
 * import rewritten the way the host would: the subpath becomes a separate
 * runtime, the bare package becomes the host runtime. It therefore fails if
 * the source goes back to the subpath and passes only when the component shares
 * the renderer's owner tree.
 */
const Conditional = Show as unknown as (props: {
  when: boolean
  keyed?: false
  children: (shown: boolean) => unknown
}) => unknown

const ROOT = resolve(import.meta.dir, "..")
const HOST_SOLID = resolve(ROOT, "node_modules/solid-js/dist/solid.js")
const PLUGIN_SOLID_DIR = mkdtempSync(join(tmpdir(), "ducksay-solid-"))
const PLUGIN_SOLID = join(PLUGIN_SOLID_DIR, "solid.mjs")
copyFileSync(HOST_SOLID, PLUGIN_SOLID)

afterAll(() => {
  rmSync(PLUGIN_SOLID_DIR, { recursive: true, force: true })
})

async function loadTui() {
  const source = readFileSync(resolve(ROOT, "src/tui.tsx"), "utf8")
  const specifier = source.includes('from "solid-js/dist/solid.js"')
    ? pathToFileURL(PLUGIN_SOLID).href
    : pathToFileURL(HOST_SOLID).href
  const rewritten = source.replace(
    /from "solid-js(?:\/dist\/solid\.js)?"/,
    `from ${JSON.stringify(specifier)}`,
  )
  const temp = resolve(ROOT, `src/.host-runtime-tui-${process.pid}-${Date.now()}.tsx`)
  writeFileSync(temp, rewritten)
  try {
    return await import(`${pathToFileURL(temp).href}?v=${Date.now()}`)
  } finally {
    unlinkSync(temp)
  }
}

describe("host runtime", () => {
  test("cleans up a swim timer on unmount when the plugin shares the host's Solid", async () => {
    const { Ducksay } = await loadTui()
    const clock = new ManualClock()
    const setup = await createTestRenderer({ width: 42, height: 12, clock })
    const [mounted, setMounted] = createSignal(true)
    let timers = 0
    const data = {
      on: (_type: string, _handler: (event: unknown) => void) => () => {},
      session: {
        form: {
          list: () => [],
          sync: async () => {},
        },
      },
    }
    await render(
      () =>
        createComponent(Conditional, {
          keyed: false,
          get when() {
            return mounted()
          },
          get children() {
            return (_shown: boolean) =>
              createComponent(Ducksay, {
                primary: RGBA.fromHex("#e5e5e5"),
                renderer: setup.renderer,
                data,
                sessionID: "ses_scratch",
                isRunning: () => true,
                schedule: (tick: () => void, ms: number) => {
                  timers += 1
                  const handle = clock.setInterval(tick, ms)
                  return () => {
                    clock.clearInterval(handle)
                    timers -= 1
                  }
                },
              })
          },
        }),
      setup.renderer,
    )
    for (let index = 0; index < 20; index += 1) await Promise.resolve()
    expect(timers).toBe(1)

    setMounted(false)
    for (let index = 0; index < 20; index += 1) await Promise.resolve()
    expect(timers).toBe(0)

    await setup.renderer.destroy()
  })
})
