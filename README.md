# OpenCode Ducksay

An ASCII duck in the session sidebar of the [OpenCode](https://opencode.ai) TUI. It swims from side to side on the
water while a session is working. When the turn ends it comes to rest and says a short joke in a speech bubble, using the
model of the current session: while the answer is on its way it waits with a growing ellipsis, then speaks the joke word
by word. If no joke arrives, it falls back to `Quack-quack!`. While a question of the session waits for an answer, the
duck stops and shows a marker above its beak.

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
water line. The reserve stays empty only before the first swim; during a rest it holds the waiting dots or the joke, so
the duck keeps the same rows throughout.

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
`swimSpeed`, `llmTimeout` and `llmContextDepth` options, the `session.sidebar` setting, and the cases where the sidebar is
not shown at all.

## Swimming

The duck swims for as long as the session is working — not only while text arrives, but through tool calls, permission
prompts and retries. When the turn ends it swims on to the edge of the sidebar, turns around, and stops there nose towards
the middle. At rest it always stands at an edge, on the left one when the plugin starts.

## A question

When the session asks you something and waits for your answer, the duck stops where it is: the water stops with it, the
bubble is hidden and the beak is closed. Above the beak a marker appears and changes every 300 ms — `?`, `!`, `⸮`, `!` —
until the question is answered or cancelled. The marker stands exactly over the bracket next to the beak, so it is right
above the duck's mouth whichever way it faces, and it stays in that column while the frames change.

Nothing is lost while the duck waits. The joke keeps the frame it had — the same ellipsis, the same word — and when the
question closes the duck carries on from the same column, in the same direction, with the water at the same phase. If the
session is still working, it swims on; if the turn has ended, it swims to the edge and rests as usual.

The marker shows even before the first swim, and at `swimSpeed: 0` it is the only thing that moves. Only a question of the
session shown in the panel counts: permission requests and the assistant's own questions leave the duck alone.

While a question is open, the duck does not ask for a new joke. A request that is already on its way is not cancelled
because of the question, and its answer is used once the question closes. If the turn ends while the question is still
open, the request waits for the question to close and the session to be free again.

## Rest

After the duck has swum at least once, every stop ends with a speech bubble at its beak. The duck asks the model of the
current session for a short joke about the session: the last few messages from you and the assistant, plus the session
title, project and branch. The request is built from what OpenCode already has locally; tool output, file contents and
diffs are not sent. The joke is written in the language of your last message, or in the language of the previous messages
when that one is unclear.

While the joke is on its way, the bubble is already there: the duck says `Quack` with an ellipsis that grows one dot at a
time — `Quack.`, `Quack..`, `Quack...` — then starts again, and the beak stays closed. When the answer arrives, the first
word replaces the dots and the rest follow one word at a time, as if the duck were saying them. The beak opens and closes
every couple of words and always stops open on the last word; a word followed by a full stop, comma, exclamation or
question mark stays on screen a little longer. If the request fails, comes back empty or takes too long, the duck says
`Quack-quack!` instead. It does not retry until the next turn. The bubble stands on the side the duck faces — to the right
of a duck at the left edge, to the left of a duck at the right edge — and its tail points at the beak from one column
away. It stays for the whole rest and disappears as soon as the duck swims again, taking the waiting or typing with it and
closing the beak. The very first rest, right after the plugin starts, has no bubble.

The bubble is 29 columns wide with a 25-column text field. Text wraps by word into at most five lines; a word longer
than the field is broken, and text that does not fit ends with `…`. A generated answer is shortened to what the bubble can
show.

There is no separate on/off switch. `llmTimeout` sets how many seconds the duck waits for the model — twenty-five by default,
counting only the model's answer; `0`, a blank value or a value that is not a number means twenty-five, and anything above 120
means 120. `llmContextDepth` sets how many recent messages of each role are read — two by default, a whole number from 1 to
10; a value above 10 means 10, while `0`, a fraction or a value that is not a number means two. The full tables are in
[configuration and options](docs/configuration.md).

With the default `swimSpeed` the duck always swims before it rests. At `swimSpeed: 0` it never moves, so no joke is
requested and no bubble appears; the same is true when the sidebar is narrower than the drawing.

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