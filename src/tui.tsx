import { Plugin } from "@opencode/plugin/tui"
import type { RGBA } from "@opentui/core"
import { DUCK } from "./duck.ts"

/**
 * The `Ducksay` section of the session sidebar.
 *
 * The art is left-aligned with no added indent: the lines carry their own
 * leading spaces, and every line sets `wrapMode="none"` so a wide line stays on
 * one row instead of being reflowed inside the panel.
 *
 * `primary` is the theme's main text color, resolved by `setup` and passed in —
 * that keeps the component a plain function of its props, so a test can render
 * it without the host's plugin context.
 */
export function Ducksay(props: { primary: RGBA; art?: readonly string[] }) {
  return (
    // The direction is declared here, never inherited: the sidebar's own slot
    // container lays its claims out in a row, which would otherwise run the
    // heading and all three art lines together into one line of text.
    <box flexDirection="column">
      <text fg={props.primary}>
        <b>Ducksay</b>
      </text>
      {(props.art ?? DUCK).map((line) => (
        <text wrapMode="none">{line}</text>
      ))}
    </box>
  )
}

export default Plugin.define({
  id: "ducksay",
  setup: (context) => {
    // `slot` already returns its own teardown: it unregisters the claim.
    return context.ui.slot({
      append: "sidebar.content",
      render: () => <Ducksay primary={context.theme.text.base} />,
    })
  },
})