# Changelog

## Unreleased

### Added

- A speech bubble at the duck's beak when it comes to rest after swimming: `Quack-quack!`, with the beak open. The bubble
  faces the duck, stays for the whole rest and disappears when the duck swims again.
- The bubble is 29 columns wide with a 25-column text field. Text wraps by word into up to five lines, a longer word is
  broken, and a message that does not fit ends with `…`.

### Changed

- The section is now ten lines tall — five of them reserved for the bubble — so the duck keeps its rows when the bubble
  appears or goes away.
- The first rest after the plugin starts has no bubble and a closed beak; the beak opens only while the bubble is shown.

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

[1.2.0]: https://github.com/zhek/opencode-ducksay/releases/tag/v1.2.0
[1.1.0]: https://github.com/zhek/opencode-ducksay/releases/tag/v1.1.0
[1.0.0]: https://github.com/zhek/opencode-ducksay/releases/tag/v1.0.0