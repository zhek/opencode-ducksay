# AGENTS.md

`ducksay` — an OpenCode **TUI/CLI plugin** (TypeScript, Node + npm). Repo is greenfield: no `package.json` or source yet.

## Non-negotiable rules

- **All code must be covered by automated tests.** New functionality and bug fixes always get one — a bug-fix test must
  reproduce the original defect (fails before the fix, passes after). An implementation task without tests is not done.
- **Every OpenSpec `tasks.md` ends with two mandatory tasks** — run the automated tests, and update the project
  documentation (`README.md`, `README.ru.md`, `CHANGELOG.md`, config/options reference). Documentation is part of the task,
  not a follow-up.
- **Documentation language.** OpenSpec artifacts in **Russian**; project documentation in **English**. `README.ru.md` is
  maintained in parallel with `README.md` and must change in the same task. Code, identifiers, and file names are always
  English.

### Where these rules live

The authoritative copies are in `openspec/config.yaml` — `rules.tasks` for authoring `tasks.md`, `operations.apply.guidance`
for implementation. Edit there first, then mirror here; the two must not drift.

## Commands

```bash
npx tsx --test            # full suite
npx tsx --test path/to/x.test.ts   # single file
npx tsc --noEmit          # typecheck
```

These are placeholders until `package.json` exists — wire `npm test` to `tsx --test` and commit it, so the documented
command and the real one stay identical.

### `node --test` cannot run `.ts` here

The installed Node (v22.22.1) is **not compiled with TypeScript support**, so `node --test foo.test.ts` fails with
`ERR_UNKNOWN_FILE_EXTENSION`, and `--experimental-strip-types` fails with `ERR_NO_TYPESCRIPT`. This is an environment
limitation, not a code bug — don't debug the test file. Always invoke the runner through `tsx` (`tsx` is a devDependency).

## No build step — do not add one

OpenCode loads `index.ts` **directly as the plugin entrypoint**. There is no compile, bundle, or watch step for the plugin
to run, and adding one (tsc/build scripts run before testing) is wasted work.

Verified locally: a `.ts` plugin loaded via `entrypoint=file://.../index.ts` and its `setup` ran with no build performed.

`@opencode/plugin` must be installed in the repo (`npm i`) — it is a real dependency, not a global. Without it OpenCode
fails the plugin with:

```
failed to load plugin ... Cannot find package '@opencode/plugin'
```

Verify a change actually loaded, rather than assuming:

```bash
opencode plugin list          # expects a row with SOURCE = this repo's path
opencode --standalone --print-logs --log-level debug 2>&1 | grep -i "loading plugin\|failed to load"
```

A stale cached server can hide edits. Use `--standalone` for a private server, and note OpenCode installs as a compiled
binary — it is not a Node process, so a debugger on *your* Node process will not catch plugin code. Debug via logs and
`console.error` in `setup`.

## Plugin structure that matters

- CLI/TUI plugins are imported from **`@opencode/plugin/tui`** and OpenCode resolves that import at runtime — do not add
  an absolute path or vendor it. Core plugin surface is `@opencode/plugin`.
- While developing, put the plugin under `.opencode/plugins/<name>/` in the repo — that directory is auto-discovered, so it
  needs no `opencode.json(c)` entry. Discovery watches the file and reloads on change.
- The package must expose the TUI entry through the **`./tui` export** (e.g. `"./tui": "./src/tui.tsx"`) next to the main
  export, otherwise it is never auto-loaded.
- `@opencode/plugin` is a `dependency`; **`@opentui/core`, `@opentui/solid`, and `solid-js` are `peerDependencies`**
  (only if JSX is rendered). Getting this wrong yields runtime resolution failures in the TUI, not build errors.
- CLI plugins are loaded via **`cli.json`** (`~/.config/opencode/cli.json`) to stay active against remote servers. There is
  **no project-local `cli.json`** — CLI preferences are global-only, so local overrides do not exist for this file.
- `setup(ctx)` may return a cleanup function. Event subscriptions (`ctx.data.on` / `ctx.data.listen`) must be aborted or
  unsubscribed there, or they leak across plugin reloads.
- `ctx.keymap.layer(...)` factories must be **pure**. Layers are torn down when the plugin reloads, is disabled, or the
  component that created them is disposed — do not rely on layer state persisting.

## Git conventions

Commit messages are **English**, Conventional Commits.

Types: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `chore`. Dependency bumps, build/config changes, and formatting
land under `chore`.

```text
<type>(<scope>): <description>

Change: openspec/changes/<name>/
```

- `<scope>` is the OpenSpec change name — identical to the branch and to the directory under `openspec/changes/`. Omit the
  scope when there is no change (`chore: bump tsx`).
- Keep the body short. The code says *what*; the commit says *why*. Long bodies go stale faster than short ones.

Rules:

- **`main` is always green** — all tests pass, every checkbox in `tasks.md` is ticked, no active change is left behind.
- **One branch per change**, named exactly like its directory: change `openspec/changes/add-duck-say/` lives on branch
  `add-duck-say`. No prefix — `--change <name>` appears in every OpenSpec command and a prefix would have to be stripped
  each time. Work that is not a change goes on `chore/<slug>` or `fix/<slug>`.
- **`feat:` and `fix:` carry their tests in the same commit** — either the test itself, or a pointer to the task that
  covers it. This is the commit-level enforcement of the rule above.
- **`docs:` changes `README.md` and `README.ru.md` together**, in one commit, so the two versions cannot drift apart in
  history.
- **Squash-merge** the PR into `main`; the PR title becomes the commit message.
- **Archive after the merge**, as its own commit. `/opsx-archive` moves the change to `archive/` and updates the main
  specs — that is spec work and does not belong inside a code PR.

## OpenSpec workflow

The project is spec-driven; planning and implementation are separate phases.

- Planning commands: `/opsx-propose`, `/opsx-explore`. Implementation: `/opsx-apply`. Then `/opsx-verify`, `/opsx-sync`,
  `/opsx-archive`.
- **`/opsx-propose` creates planning artifacts only.** It must not edit project code, even if the request asks it to build
  something. Stop after artifacts and wait for a separate apply request.
- `openspec status --change <name> --json` reflects **file existence only**. A `done` artifact does not mean its
  dependencies exist — walk the `requires` edges transitively to find the real required set.
- Specs live in `openspec/specs/<capability-path>/spec.md`; a change's spec file is a **delta**, not the full spec.
  Preserve an existing capability's full path when adding to it.
- `openspec/config.yaml` `context` holds the **documentation language rule** (OpenSpec artifacts in Russian, project docs in
  English with `README.ru.md`) and reaches both artifact generation and apply. `rules.tasks` holds what applies while
  **authoring** `tasks.md`; `operations.apply.guidance` is the only channel that reaches the **apply** phase — put
  implementation-time rules there, or they will not be seen while the code is being written. `AGENTS.md` mirrors all
  three; edit the config first.

## Docs

- Official V2 docs only: `https://opencode.ai/v2/docs/`. The V1 paths (`opencode.ai/docs/`) describe the old API — avoid.
- Plugin guides: `/v2/docs/build/plugins` (core) and `/v2/docs/build/plugins/cli` (TUI, used here).
