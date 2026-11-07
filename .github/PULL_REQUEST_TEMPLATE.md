<!--
Pick the template that matches this pull request:

  feature.md      an OpenSpec change          feat/<change-name>
  bugfix.md       a bug fix                   fix/<slug>
  maintenance.md  chore, docs, refactor, test chore/<slug>
  release.md      a release                   chore/release-<version>

Append `?template=<file>` to the compare URL and open it again, for example:

  https://github.com/zhek/opencode-ducksay/compare/main...my-branch?expand=1&template=feature.md

Then delete this comment.
-->

## Summary

<!-- Why this change exists and what changes for the user. -->

## Type

- [ ] Feature — an OpenSpec change, `feat/<change-name>`
- [ ] Bug fix — `fix/<slug>`
- [ ] Maintenance — `chore`, `docs`, `refactor`, `test`, `perf`, `chore/<slug>`
- [ ] Release — `chore/release-<version>`

## Checklist

- [ ] The PR title is a Conventional Commit (`feat: …`, `fix: …`, `docs: …`, `chore: …`) and has no scope; squash-merge turns it into the commit on `main`.
- [ ] The branch is named as shown above, one branch per change.
- [ ] `bun test` passes.
- [ ] `bunx tsc --noEmit` passes.
- [ ] New behaviour and bug fixes come with automated tests in the same PR.
- [ ] English and Russian documentation is updated together: `README.md` with `README.ru.md`, and every `docs/*.md` with its `docs/*.ru.md` counterpart.
- [ ] If the plugin's visible appearance changed, the demo GIF generator is updated and both `assets/ducksay-demo.gif` and `assets/ducksay-demo.ru.gif` are regenerated with `bun run demo:gif`.
- [ ] If entrypoints or the published package changed, the packed tarball is verified.
- [ ] A user-visible change is under `## Unreleased` in `CHANGELOG.md`; `version` in `package.json` is unchanged. A release PR is the only exception.
- [ ] `main` stays green: every `tasks.md` checkbox is ticked and no active change is left behind.

## Change

<!-- For an OpenSpec change only; every commit of the change carries this trailer. -->

Change: openspec/changes/<change-name>/
