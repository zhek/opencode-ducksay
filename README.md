# OpenCode Ducksay

An ASCII duck in the session sidebar of the [OpenCode](https://opencode.ai) TUI. It swims from side to side on the
water while a session is working.

```text
Ducksay
    __
___( o)>
\ <_. )  ~~~~     ~~~~     ~~~~     ~~~~
     ~~~~     ~~~~     ~~~~     ~~~~     ~
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