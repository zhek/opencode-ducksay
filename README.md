# OpenCode Ducksay

An ASCII duck in the session sidebar of the [OpenCode](https://opencode.ai) TUI. It swims from side to side on the
water while a session is working. When the turn ends it comes to rest and says `Quack-quack!` in a speech bubble.

```text
Ducksay



        ╭───────────────────────────╮
        │ Quack-quack!              │
    __  ╰───────────────────────────╯
___( o)< ╯
\ <_. )  ~~~~     ~~~~     ~~~~     ~
     ~~~~     ~~~~     ~~~~     ~~~~
```

The section is always ten lines tall: the heading, five rows reserved for the bubble, three rows of duck and the lower
water line. The reserve stays empty while the bubble is hidden, so the duck keeps the same rows throughout.

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

## Rest

After the duck has swum at least once, every stop ends with a speech bubble at its beak: `Quack-quack!`, with the beak
open. The bubble stands on the side the duck faces — to the right of a duck at the left edge, to the left of a duck at
the right edge — and its tail points at the beak from one column away. It stays for the whole rest and disappears as
soon as the duck swims again, closing the beak with it. The very first rest, right after the plugin starts, has no
bubble.

The bubble is 29 columns wide with a 25-column text field. Text wraps by word into at most five lines; a word longer
than the field is broken, and text that does not fit ends with `…`. The message is fixed: the capacity is there for a
longer line later, not as an option now.

With the default `swimSpeed` the duck always swims before it rests. At `swimSpeed: 0` it never moves, so no bubble
appears.

## The water

The duck is in the water, not above it: the lower line of the drawing shares a row with the first line of the water, and a
second line runs underneath. The water is drawn as clusters of four tildes with a gap of five columns between them, and the
two lines are offset so their clusters do not line up.

While the session is working the water travels in one direction, at a tempo taken from `swimSpeed` — one full pattern per
trip across the sidebar. When the turn ends the water stops where it is, which is the one sign that says the session is
done: a duck parked at an edge means either the turn ended or it happens to be at an edge, but water that has come to a
stop means one thing only.

`swimSpeed` sets how fast both the duck and the water move, in columns per second:

```json
{
  "plugins": [{ "package": "opencode-ducksay", "options": { "swimSpeed": 24 } }]
}
```

The default is `12`. Set it to `0` for a duck that never moves and water that never travels.

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