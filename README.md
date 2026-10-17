# OpenCode Ducksay

An ASCII duck in the session sidebar of the [OpenCode](https://opencode.ai) TUI. It swims from side to side while a
session is working.

```text
Ducksay
  __
<(o )___
 ( ._> /
```

The plugin adds one section below OpenCode's own `Context` and `MCP` sections.

[Русская версия](README.ru.md)

## Install

Add the package to `~/.config/opencode/cli.json`:

```json
{
  "plugins": ["opencode-ducksay"]
}
```

Restart OpenCode afterwards. There is no build step.

Prefix the entry with `-` to disable the plugin. See [configuration and options](docs/configuration.md) for the
`swimSpeed` option, the `session.sidebar` setting, and the cases where the sidebar is not shown at all.

## Swimming

The duck swims for as long as the session is working — not only while text arrives, but through tool calls, permission
prompts and retries. When the turn ends it swims on to the edge of the sidebar, turns around, and stops there nose towards
the middle. At rest it always stands at an edge, on the left one when the plugin starts.

`swimSpeed` sets how fast it swims, in columns per second:

```json
{
  "plugins": [{ "package": "opencode-ducksay", "options": { "swimSpeed": 24 } }]
}
```

The default is `12`. Set it to `0` for a duck that never moves.

## Development

```bash
bun install
bun test            # unit and rendering tests
bunx tsc --noEmit   # typecheck
```

OpenCode auto-discovers `.opencode/plugins/ducksay/tui.ts`, which re-exports the entrypoint from `src/tui.tsx`, so
nothing outside the repository needs to change to run it locally. Editing `src/duck.ts` reloads the plugin without a
restart — the redrawn art shows up in the open sidebar straight away.

Restart OpenCode after changing the animation itself. A reload re-reads the plugin and redraws the art, but a section
that is already on screen keeps the component it was built from, so it keeps swimming the way it did before. The duck
picks up the new behavior on the next start.