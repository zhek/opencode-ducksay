## Summary

<!-- What the user can do after this change that they could not do before. -->

## Change

- OpenSpec change: `openspec/changes/<change-name>/`
- Branch: `feat/<change-name>`
- Issue: #<issue>

## Checklist

### Change artifacts

- [ ] `proposal.md`, `design.md`, `tasks.md` and the delta spec exist, and `openspec validate --strict <change-name>` passes.
- [ ] The delta spec names every user-visible option, command, text, default value and constant verbatim.
- [ ] Every functional task has a matching automated-test task.
- [ ] All checkboxes in `tasks.md` are ticked, including “run the automated tests” and “update the project documentation”.
- [ ] The change is archived in this PR as its last commit: `docs: archive <change-name>`; `openspec/specs/` gains the capability and the change moves to `archive/`.

### Verification

- [ ] `bun test` passes.
- [ ] `bunx tsc --noEmit` passes.
- [ ] If entrypoints or the published package changed, the packed tarball is verified: `bun pm pack`, unpack it into a temporary project's `node_modules`, add that directory to the project's `opencode.json`, and run `opencode --standalone --print-logs --log-level debug`; expect `loading plugin … index.ts` and `plugin=ducksay`, with no `Cannot find package 'react'`.

### Documentation and changelog

- [ ] `README.md` and `README.ru.md` are updated together; `docs/configuration.md` and `docs/configuration.ru.md` are updated together. Any other changed `docs/*.md` has its `docs/*.ru.md` counterpart updated too.
- [ ] The user-visible change is under `## Unreleased` in `CHANGELOG.md`, under `### Added`, `### Changed`, `### Fixed` or `### Removed`.
- [ ] `version` in `package.json` is unchanged; only a release PR moves it.
- [ ] If the plugin's visible appearance changed, `scripts/make-demo-gif.ts` and `scripts/demo-layout.ts` are updated, both `assets/ducksay-demo.gif` and `assets/ducksay-demo.ru.gif` are regenerated with `bun run demo:gif`, and `test/demo-gif.test.ts` passes.

### Commits

- [ ] Every commit carries the trailer `Change: openspec/changes/<change-name>/`.
- [ ] The spec delta is committed with `docs: add <change-name> spec` or `docs: update <change-name> spec`, not mixed with implementation.
- [ ] The archive is committed separately with `docs: archive <change-name>`.
- [ ] Feature commits include their tests in the same commit.
