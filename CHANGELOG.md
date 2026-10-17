# Changelog

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

[1.1.0]: https://github.com/zhek/opencode-ducksay/releases/tag/v1.1.0
[1.0.0]: https://github.com/zhek/opencode-ducksay/releases/tag/v1.0.0