# Configuration and options

`opencode-ducksay` has four options: `swimSpeed`, `silent`, `llmTimeout` and `llmContextDepth`. All are optional. With
nothing configured the duck swims at 10 columns per second, speaks, waits sixty seconds for a joke, and reads two recent
messages of each role.

At rest after a finished turn the duck asks the model of the current session for a short joke. The request is built
locally from recent messages, the session title, the project and the branch; tool output, file contents and diffs are not
sent. The request uses the model selected in the session, or the server's default model when none is selected, and it
does not add a message to the transcript. While the answer is pending the bubble says `Quack` with a growing ellipsis,
and if the request fails, returns nothing or times out, the duck says `Quack-quack!`. `silent: true` is the switch that
turns speech off. Before the first turn finishes, the duck rests silently: a finished turn, not a first swim, is what
starts the joke.

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

How fast the duck swims, in columns per second. The sidebar lane is about 29 columns wide, so the default of `10` takes
roughly 2.9 seconds to cross it.

The same number sets the tempo of the water: the pattern travels at a rate that completes one whole pass for each trip
across the sidebar. There is no separate option for the water, so `swimSpeed` is the only thing that controls how the
duck and the water move. It does not decide whether the duck speaks.

```json
{
  "plugins": [{ "package": "opencode-ducksay", "options": { "swimSpeed": 24 } }]
}
```

| Value | Result |
| --- | --- |
| not set | `10` columns per second |
| `0` | The duck never moves and the water never travels; speech still works and the question marker keeps moving |
| `1` … `120` | That many columns per second; anything above `120` is capped at `120` |
| a number written as a string, `"24"` | Read as the same number |
| anything else — a negative number, a word, an empty value | Falls back to `10` |

A number without quotes is the normal way to write it. Quotes are accepted, because they are a common slip and silently
swapping a requested `24` for the default would be worse than reading what was written. An empty value is treated as "not
set" rather than as `0`, so a blank field cannot quietly freeze the duck.

At `0` the duck and the water stand still, but the speech bubble keeps working: the waiting dots and the typed joke run
on their own timers, and the marker above the beak keeps changing while a question waits for an answer. To make the duck
silent as well, set `silent: true`.

A small speed makes the water slow as well as the duck, which at `1` means both barely move for the half-minute a crossing
takes. The water also stops when the sidebar is narrower than the duck's drawing, because then the duck has nowhere to
swim and the water has no crossing to pace itself against. A sidebar narrower than the drawing also leaves no room for a
bubble, so the duck does not ask for a joke there; the question marker still works.

## `silent`

Turns the duck's speech off. The default is `false`: after a finished turn the duck asks the model for a joke and shows
the bubble. With `true` there is no bubble, no text and no model request. The duck and the water still move according to
`swimSpeed`.

```json
{
  "plugins": [{ "package": "opencode-ducksay", "options": { "silent": true } }]
}
```

| Value | Result |
| --- | --- |
| not set | `false` — the duck speaks after a finished turn |
| `false` | The duck speaks |
| `true` | The duck is silent: no bubble, no text, no request |
| the string `"true"`, in any case and with surrounding spaces | Read as `true` |
| `0`, `"false"`, another word, an object | Speech stays on; a typo cannot silence the duck by accident |

The option is read while the plugin loads, like the other options, so restart OpenCode after changing it. The question
marker is independent of `silent`: while a form waits for an answer, the marker keeps moving even when the duck is silent.

To get a duck that neither moves nor speaks, combine both options: `{ "swimSpeed": 0, "silent": true }`. Before this
option existed, `swimSpeed: 0` also stopped the jokes; that is no longer the case.

## `llmTimeout`

How long the duck waits for the joke, in seconds. The timeout starts when the request goes to the model, not while the
plugin is reading the session locally, so a large context does not eat into the answer time.

```json
{
  "plugins": [{ "package": "opencode-ducksay", "options": { "llmTimeout": 10 } }]
}
```

| Value | Result |
| --- | --- |
| not set | `60` seconds |
| a finite positive number | That many seconds |
| a number written as a string, `"10"` | Read as the same number |
| `0`, a negative number, a blank value or anything that is not a number | Falls back to `60` seconds |
| a value above `120` | Capped at `120` seconds |

When the timeout expires, the request is cancelled and the bubble shows `Quack-quack!`. There is no retry until the next
turn.

## `llmContextDepth`

How many recent messages of each role go into the joke prompt: user messages and assistant replies are counted
separately, so the default of `2` means two user messages and two assistant replies. The session title, project and branch
are added whenever they are available, whatever the depth.

```json
{
  "plugins": [{ "package": "opencode-ducksay", "options": { "llmContextDepth": 3 } }]
}
```

| Value | Result |
| --- | --- |
| not set | `2` messages of each role |
| a whole number from `1` to `10` | That many messages of each role |
| a number written as a string, `"3"` | Read as the same number |
| a value above `10` | Capped at `10` |
| `0`, a negative number, a fraction, a blank value or anything that is not a number | Falls back to `2` |

Only message text is sent. Reasoning, tool calls, tool output, file contents and diffs are left out. The joke is written in
the language of the last user message, or in the language of the previous messages when that one is unclear.

Variable substitution does **not** apply to `cli.json`: `"{env:DUCK_SPEED}"` reaches the plugin as that literal text, which
is not a number, so the default is used. To keep a value in one place, put it in the file rather than referencing a
variable.

Two things to know:

- The options are read while the plugin loads, so OpenCode has to be restarted after changing them.
- `{"plugins": ["opencode-ducksay"]}` stays valid — you only need the object form to pass options.

OpenCode has its own global `animations` setting in `cli.json`, which turns off interface animations. Plugins cannot read
it, so it does not affect the duck: `swimSpeed: 0` is the switch for the duck and water animation, while `silent: true`
is the switch for speech.

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