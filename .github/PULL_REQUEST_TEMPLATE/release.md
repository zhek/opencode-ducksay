## Release

- Version: `X.Y.Z`
- Branch: `chore/release-<version>`
- Release date: `YYYY-MM-DD`

A feature raises the minor version; a fix raises the patch version.

## Checklist

- [ ] `## Unreleased` is renamed to `## [X.Y.Z] — YYYY-MM-DD` with today's date.
- [ ] `[X.Y.Z]: https://github.com/zhek/opencode-ducksay/releases/tag/vX.Y.Z` is appended to `CHANGELOG.md`.
- [ ] `version` in `package.json` is `X.Y.Z`.
- [ ] Everything that was under `## Unreleased` is carried into the release; nothing is left behind to ship silently with the next release.
- [ ] The version bump matches the accumulated entries: a feature raises the minor, a fix raises the patch.
- [ ] The PR carries no OpenSpec artifacts: a release is not a change.
- [ ] `bun test` passes.
- [ ] `bunx tsc --noEmit` passes.
- [ ] The packed tarball is verified: `bun pm pack`, unpack it into a temporary project's `node_modules`, add that directory to the project's `opencode.json`, and run `opencode --standalone --print-logs --log-level debug`; expect `loading plugin … index.ts` and `plugin=ducksay`, with no `Cannot find package 'react'`.
- [ ] `main` is green: no active change is left, and every archived change's capability is present in `openspec/specs/`.
