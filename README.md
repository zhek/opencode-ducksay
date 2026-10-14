# OpenCode Ducksay

A static ASCII duck in the session sidebar of the [OpenCode](https://opencode.ai) TUI.

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
`session.sidebar` setting and for the cases where the sidebar is not shown at all.

## Development

```bash
bun install
bun test            # unit and rendering tests
bunx tsc --noEmit   # typecheck
```

OpenCode auto-discovers `.opencode/plugins/ducksay/tui.ts`, which re-exports the entrypoint from `src/tui.tsx`, so
nothing outside the repository needs to change to run it locally. Editing `src/duck.ts` reloads the plugin without a
restart.