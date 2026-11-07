## Summary

<!-- Why this maintenance work matters. State it if any user-visible behaviour changes. -->

## Checklist

- [ ] This does not add new functionality; a feature goes through an OpenSpec change with the feature template.
- [ ] `bun test` passes.
- [ ] `bunx tsc --noEmit` passes.
- [ ] A code change comes with automated tests; a refactor keeps the existing tests green and does not change behaviour.
- [ ] `CHANGELOG.md` and `version` in `package.json` are untouched: `chore`, `docs`, `refactor` and test work have nothing for the user to notice.
- [ ] Documentation changes update English and Russian together: `README.md` with `README.ru.md`, and every changed `docs/*.md` with its `docs/*.ru.md` counterpart.
- [ ] Changes to the project rules in `AGENTS.md` or `openspec/config.yaml` are a separate `docs:` commit.
- [ ] If the plugin's visible appearance changed, `scripts/make-demo-gif.ts` and `scripts/demo-layout.ts` are updated, both `assets/ducksay-demo.gif` and `assets/ducksay-demo.ru.gif` are regenerated with `bun run demo:gif`, and `test/demo-gif.test.ts` passes.
- [ ] If entrypoints or the published package changed, the packed tarball is verified: `bun pm pack`, unpack it into a temporary project's `node_modules`, add that directory to the project's `opencode.json`, and run `opencode --standalone --print-logs --log-level debug`.
