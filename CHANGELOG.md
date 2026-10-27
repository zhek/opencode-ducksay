# Changelog

## Unreleased

### Added

- `/duck` talks to the duck in the sidebar: it answers with a joke, and `/duck <text>` continues a short dialogue. The duck
  keeps the last five exchanges of the session, starts the dialogue over with each new turn, and never adds it to the
  session's context or transcript.
- `/duck` without text asks for another joke without a line from you. While the session is busy, a joke is loading, a
  question is open, the duck is docking or the sidebar has no room, the command only shows a short notice; `silent: true`
  shows that the duck keeps mum instead.

## [1.3.0] — 2026-10-25

### Added

- A joke in the rest bubble, written by the current session's model from the last user messages and assistant replies,
  plus the session title, project and branch. The joke follows the language of your last message.
- The duck reads only message text locally: tool output, file contents and diffs are not sent. It uses the model selected
  in the session, or the server's default when none is selected, and the request does not add a message to the transcript.
- `llmTimeout` sets how long the duck waits for the model, in seconds. The default is `60`, only the model response counts,
  `0`, a blank value or anything that is not a number means `60`, and anything above `120` means `120`.
- `llmContextDepth` sets how many recent messages of each role are read. The default is `2`, a whole number from `1` to
  `10` is used as written, anything above `10` means `10`, and `0`, a fraction or anything that is not a number means `2`.
- If the request fails, returns nothing or times out, the bubble says `Quack-quack!`. There is no retry until the next
  turn.
- The `silent` option turns the duck's speech off: no bubble, no text and no model request. Only `true`, or the string
  `"true"`, counts; leaving it out, `false`, `0` or another value keeps speech on.
- While the joke is on its way, the bubble says `Quack` with an ellipsis that grows one dot at a time and then loops.
- The joke appears word by word. The beak opens and closes every couple of words, pauses a little longer after
  punctuation, and always stops open on the last word.
- The bubble is 29 columns wide with a 25-column text field. Text wraps by word into up to five lines, a longer word is
  broken, and a message that does not fit ends with `…`.
- A marker above the duck's beak while the session waits for an answer to a question: `?` and `⸮` hold for 300 ms, while
  each `!` flashes for 150 ms between them, so a full turn takes 900 ms. It stands exactly over the bracket next to the
  beak and keeps its column while the frames change.
- The duck stops while a question of the shown session is open: the water stops with it, the bubble is hidden and the beak
  is closed. When the question closes, the duck continues from the same column, direction and water phase, and the joke
  picks up from the same ellipsis or word.
- The marker shows before the first finished turn as well, and it keeps working at `swimSpeed: 0` and with `silent: true`.
- Only a question of the session shown in the panel counts: permission requests and the assistant's own questions leave the
  duck alone.
- While a question is open the duck does not ask for a new joke. A request already on its way is not cancelled because of the
  question, and a turn that ended during a question asks for its joke once the question closes and the session is free.
- A single project can enable the plugin on its own: the same `plugins` entry goes into that project's `opencode.json`
  instead of the global `cli.json`, and the duck appears only there.

### Changed

- The default `swimSpeed` is now `10` columns per second, down from `12`, so the duck and the water move a little slower
  out of the box.
- The section is now ten lines tall — five of them reserved for the bubble — so the duck keeps its rows when the bubble
  appears or goes away.
- The rest bubble is no longer fixed text: it is visible while the answer is pending and shows `Quack` with the growing
  ellipsis, then types the generated joke word by word, or `Quack-quack!` when no joke arrives.
- The start-up rest, before any turn has finished, has no bubble. The beak stays closed while the duck waits and then flaps
  with the typed words, ending open.
- The duck now asks for a joke after any finished turn, whether or not it moved. A turn shorter than one animation tick
  and a turn while the duck is not moving both get their joke.
- `swimSpeed` controls only the duck and the water. `0` freezes both but leaves speech on; use `silent: true` to stop the
  jokes. A sidebar narrower than the drawing still has no room for a bubble and does not request one.
- The joke request runs in a temporary empty session created with the current session's model, so only the recent messages
  and metadata go to the model; the rest of the session history is not sent.

### Fixed

- Switching to another session no longer carries the previous session's duck and bubble into the new tab: each session
  keeps its own duck, position, heading, water phase and rest bubble.
- The duck keeps its column, heading, water phase and rest bubble when the sidebar is rebuilt, for example after switching
  to another session and back, instead of starting again from the left edge; an open question keeps its marker over the
  same column.
- Switching tabs no longer leaves an old duck swimming beside the visible one: the duck keeps its usual pace in every tab,
  and the end of a turn stops it even after switching away and back.

## [1.2.0] — 2026-10-18

The duck now swims on water.

### Added

- Two rows of water under the duck. The lower line of the drawing shares a row with the first line of water, so the duck is
  in the water rather than above it, and the second line runs underneath.
- The water travels while the session is working, at a tempo taken from `swimSpeed` — one full pass per trip across the
  sidebar.

### Changed

- The section is one line taller.
- `swimSpeed: 0` now also stops the water, not just the duck. The water still appears; it simply stands still.
- `swimSpeed` sets the tempo of the water as well as the speed of the duck, so a slow `swimSpeed` gives slow water.

## [1.1.0] — 2026-10-17

The duck swims while a session is working.

### Added

- The duck moves across the sidebar for the whole turn — generation, tool calls, permission prompts — turns around at
  the edges of the sidebar, and swims on to an edge when the turn ends, coming to rest facing the middle of the sidebar.
- A `swimSpeed` plugin option, in columns per second. Default `12`, `0` keeps the duck still.

### Changed

- At rest the duck faces the middle of the sidebar, so it stands at the left edge turned around rather than as it did in
  1.0.0.

## [1.0.0] — 2026-10-14

First release. CLI/TUI-only plugin: no server entrypoint.

### Added

- A `Ducksay` section with a static ASCII duck in the session sidebar, below the built-in sections.

[1.3.0]: https://github.com/zhek/opencode-ducksay/releases/tag/v1.3.0
[1.2.0]: https://github.com/zhek/opencode-ducksay/releases/tag/v1.2.0
[1.1.0]: https://github.com/zhek/opencode-ducksay/releases/tag/v1.1.0
[1.0.0]: https://github.com/zhek/opencode-ducksay/releases/tag/v1.0.0