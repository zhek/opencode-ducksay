# Configuration and options

`opencode-ducksay` has one option, `swimSpeed`, which sets how fast the duck swims across the sidebar. It is optional: with
nothing configured the duck swims at 12 columns per second.

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

## `swimSpeed`

How fast the duck swims, in columns per second. The sidebar lane is about 29 columns wide, so the default of `12` takes
roughly 2.4 seconds to cross it.

The same number sets the tempo of the water: the pattern travels at a rate that completes one whole pass for each trip
across the sidebar. There is no separate option for the water, so `swimSpeed` is the only thing that controls how the
section animates.

```json
{
  "plugins": [{ "package": "opencode-ducksay", "options": { "swimSpeed": 24 } }]
}
```

| Value | Result |
| --- | --- |
| not set | `12` columns per second |
| `0` | The duck never moves, the water never travels, and the plugin runs no timer at all |
| `1` … `120` | That many columns per second; anything above `120` is capped at `120` |
| a number written as a string, `"24"` | Read as the same number |
| anything else — a negative number, a word, an empty value | Falls back to `12` |

A number without quotes is the normal way to write it. Quotes are accepted, because they are a common slip and silently
swapping a requested `24` for the default would be worse than reading what was written. An empty value is treated as "not
set" rather than as `0`, so a blank field cannot quietly freeze the duck.

A small speed makes the water slow as well as the duck, which at `1` means both barely move for the half-minute a crossing
takes. The water also stops when the sidebar is narrower than the duck's drawing, because then the duck has nowhere to
swim and the water has no crossing to pace itself against.

Variable substitution does **not** apply to `cli.json`: `"{env:DUCK_SPEED}"` reaches the plugin as that literal text, which
is not a number, so the default is used. To keep a value in one place, put it in the file rather than referencing a
variable.

Two things to know:

- The option is read while the plugin loads, so OpenCode has to be restarted after changing it.
- `{"plugins": ["opencode-ducksay"]}` stays valid — you only need the object form to pass options.

OpenCode has its own global `animations` setting in `cli.json`, which turns off interface animations. Plugins cannot read
it, so it does not affect the duck: `swimSpeed: 0` is the switch for the plugin's own animation.

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

This is an OpenCode setting, not one of the plugin's. It controls the sidebar the duck is drawn in, and it belongs in
`~/.config/opencode/cli.json` under the `session` key:

```json
{
  "session": { "sidebar": "auto" }
}
```

It does not go in `opencode.json`, which has no `session` key at all: a key that file does not know has no effect, and
nothing reports it. The plugin's own options live in the same `cli.json` and are listed above.

| Value | Result |
| --- | --- |
| `"auto"` (default) | The sidebar is shown when there is room for it. The duck appears with it. |
| `"hide"` | The sidebar is not rendered. The duck does not appear at all. |

No value forces the sidebar on, so `"auto"` still only shows it when the terminal is wide enough — see the next section.

OpenCode also exposes `session.sidebar.toggle` as a configurable keybind, in the same file under `keybinds`. Its default is
not declared in OpenCode's published configuration schema, and `Escape` does not toggle the sidebar on 2.0.17.

## When the section is absent

The duck shows up only where OpenCode shows the sidebar:

- on the session screen — it does not appear on the home screen;
- when the terminal is wide enough for the sidebar to appear at all. The exact floor is OpenCode's business and moves
  between versions; measured on 2.0.17 it is 121 columns, and 120 or fewer gets no sidebar and no message saying why.
- while the sidebar's scroll position has not moved past it.

## Local development

No configuration is required, and nothing outside the repository is touched. `.opencode/plugins/ducksay/tui.ts`
re-exports the entrypoint from `src/tui.tsx`, and OpenCode discovers that directory at startup.

To stop using the local copy, delete the `.opencode/plugins/ducksay` directory.