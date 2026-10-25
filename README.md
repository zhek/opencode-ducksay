# OpenCode Ducksay

A small ASCII duck lives in your OpenCode sidebar. It swims while the session works, then settles at the edge and tells
a short joke about your session, written by the same model that just answered you.

[Русская версия](README.ru.md)

```text
Ducksay



        ╭───────────────────────────╮
        │ Quack-quack!              │
    __  ╰───────────────────────────╯
___( o)< ╯
\ <_. )  ~~~~     ~~~~     ~~~~     ~
     ~~~~     ~~~~     ~~~~     ~~~~
```

## Install

Add the package to `~/.config/opencode/cli.json` to enable it everywhere:

```json
{
  "plugins": ["opencode-ducksay"]
}
```

To enable it in one project only, add the same entry to that project's `opencode.json` instead.

Restart OpenCode. There is no build step.

## Documentation

- [How the duck behaves](docs/behavior.md) — swimming, jokes, questions and the water.
- [Configuration and options](docs/configuration.md) — `swimSpeed`, `silent`, `llmTimeout`, `llmContextDepth` and the
  sidebar settings.

## License

[MIT](LICENSE) © Evgeniy Arapov
