## Summary

<!-- What went wrong and what should happen instead. -->

Fixes #<issue>

PR title: `fix: <description>` — squash-merge turns it into the commit on `main`.
Branch: `fix/<slug>`

## Reproduction

<!-- Steps, input or environment that shows the defect. -->

## Checklist

- [ ] A regression test reproduces the defect: it fails before the fix and passes after.
- [ ] The test and the fix are in the same commit.
- [ ] `bun test` passes.
- [ ] `bunx tsc --noEmit` passes.
- [ ] If the fix is user-visible, it is under `### Fixed` in `## Unreleased` of `CHANGELOG.md`.
- [ ] `version` in `package.json` is unchanged; only a release PR moves it.
- [ ] User-facing documentation is updated in both languages: `README.md` with `README.ru.md`, and every changed `docs/*.md` with its `docs/*.ru.md` counterpart.
- [ ] If the fix changes what the README GIF shows, `scripts/make-demo-gif.ts` and `scripts/demo-layout.ts` are updated, both `assets/ducksay-demo.gif` and `assets/ducksay-demo.ru.gif` are regenerated with `bun run demo:gif`, and `test/demo-gif.test.ts` passes.
- [ ] If entrypoints or the published package changed, the packed tarball is verified: `bun pm pack`, unpack it into a temporary project's `node_modules`, add that directory to the project's `opencode.json`, and run `opencode --standalone --print-logs --log-level debug`.
- [ ] If the fix changes a requirement, the spec delta is included and the change workflow is followed; a routine fix adds no OpenSpec artifacts.
