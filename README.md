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

## Talk to the duck

Type `/duck <text>` in the TUI to talk to the duck. The dialogue never enters the session's context or transcript.

## Documentation

- [How the duck behaves](https://github.com/zhek/opencode-ducksay/blob/main/docs/behavior.md) — swimming, jokes,
  questions, talking to the duck and the water.
- [Configuration and options](https://github.com/zhek/opencode-ducksay/blob/main/docs/configuration.md) — `swimSpeed`,
  `silent`, `llmTimeout`, `llmContextDepth` and the sidebar settings.

## License

[MIT](LICENSE) © Evgeniy Arapov
