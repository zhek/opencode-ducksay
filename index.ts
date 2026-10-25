import { Plugin } from "@opencode/plugin"

/**
 * Server half of the plugin. It registers nothing: it exists so that a plugin
 * configured in a project's `opencode.json` becomes active on the server. The
 * CLI takes the active plugin list from the server and only then loads the TUI
 * half, so without this entry a per-project install silently does nothing.
 */
export default Plugin.define({
  id: "ducksay",
  setup() {},
})
