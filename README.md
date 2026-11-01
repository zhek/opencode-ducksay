# OpenCode Ducksay

[![npm version](https://img.shields.io/npm/v/opencode-ducksay)](https://www.npmjs.com/package/opencode-ducksay)
[![License: MIT](https://img.shields.io/npm/l/opencode-ducksay)](https://github.com/zhek/opencode-ducksay/blob/main/LICENSE)
[![OpenCode V2](https://img.shields.io/badge/OpenCode-V2-5b8def)](https://opencode.ai/v2/docs/)

A tiny ASCII duck paddles around your OpenCode sidebar and drops funny remarks about your work. It uses your session's model.

[Русская версия](https://github.com/zhek/opencode-ducksay/blob/main/README.ru.md)

![Ducksay demo: the duck comments on a turn and answers /duck](https://raw.githubusercontent.com/zhek/opencode-ducksay/main/assets/ducksay-demo.gif)

## Talk to the duck

Type `/duck <text>` in the TUI to talk to the duck. The dialogue never enters the session's context or transcript.

## Install

Install the plugin with one command:

```bash
opencode plugin add opencode-ducksay
```

Restart OpenCode.

To enable it in one project only, add `"opencode-ducksay"` to the `plugins` array in that project's `opencode.json`
instead.

## Documentation

- [How the duck behaves](https://github.com/zhek/opencode-ducksay/blob/main/docs/behavior.md) — swimming, jokes,
  questions, talking to the duck and the water.
- [Configuration and options](https://github.com/zhek/opencode-ducksay/blob/main/docs/configuration.md) — `swimSpeed`,
  `silent`, `llmTimeout`, `llmContextDepth` and the sidebar settings.

## License

[MIT](https://github.com/zhek/opencode-ducksay/blob/main/LICENSE) © Evgeniy Arapov
