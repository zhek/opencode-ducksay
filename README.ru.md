# OpenCode Ducksay

Статичная ASCII-уточка в боковой панели сессии TUI [OpenCode](https://opencode.ai).

```text
Ducksay
  __
<(o )___
 ( ._> /
```

Плагин добавляет один раздел ниже встроенных разделов OpenCode `Context` и `MCP`.

[English version](README.md)

## Установка

Добавьте пакет в `~/.config/opencode/cli.json`:

```json
{
  "plugins": ["opencode-ducksay"]
}
```

После этого перезапустите OpenCode. Сборки нет.

Чтобы отключить плагин, добавьте к записи префикс `-`. Настройка `session.sidebar` и случаи, когда панель вообще не
показывается, описаны в [справке по конфигурации и опциям](docs/configuration.md).

## Разработка

```bash
bun install
bun test            # юнит-тесты и тесты отрисовки
bunx tsc --noEmit   # проверка типов
```

OpenCode автообнаруживает `.opencode/plugins/ducksay/tui.ts`, который реэкспортирует точку входа из `src/tui.tsx`, так
чтобы запускать плагин локально, ничего не меняя за пределами репозитория. Правка `src/duck.ts` перезагружает плагин без
перезапуска.