# Configuration and options

`opencode-ducksay` has no options of its own. There is nothing to pass in `cli.json` beyond enabling the plugin, and no
entry to add to an OpenCode config file.

## Enabling the plugin

`~/.config/opencode/cli.json`:

```json
{
  "plugins": ["opencode-ducksay"]
}
```

`cli.json` is global only — there is no project-local equivalent. CLI preferences live in that one file, so enabling the
plugin there keeps it active against a remote server as well as a local one.

Restart OpenCode after editing the file. Entry forms accepted by OpenCode for a published package are
`opencode-ducksay` and `opencode-ducksay@<version>`.

## Disabling the plugin

Prefix the entry with `-`:

```json
{
  "plugins": ["-opencode-ducksay"]
}
```

This disables the plugin without uninstalling it, and works alongside a wildcard:

```json
{
  "plugins": ["*", "-opencode-ducksay"]
}
```

To remove it entirely, delete the entry and restart. No project state is written, so there is nothing to migrate back.

## `session.sidebar`

This is an OpenCode setting, not one of the plugin's. It controls the sidebar the duck is drawn in.

| Value | Result |
| --- | --- |
| `"auto"` (default) | The sidebar is shown when the terminal is wide enough. The duck appears with it. |
| `"hide"` | The sidebar is not rendered. The duck does not appear at all. |

The sidebar can also be closed with `Escape` for the current screen.

## When the section is absent

The duck shows up only where OpenCode shows the sidebar:

- on the session screen — it does not appear on the home screen;
- when the terminal is wide enough for a 42-column sidebar;
- while the sidebar's scroll position has not moved past it.

## Local development

No configuration is required, and nothing outside the repository is touched. `.opencode/plugins/ducksay/tui.ts`
re-exports the entrypoint from `src/tui.tsx`, and OpenCode discovers that directory at startup.

To stop using the local copy, delete the `.opencode/plugins/ducksay` directory.