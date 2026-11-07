# OpenCode Ducksay

[![Версия npm](https://img.shields.io/npm/v/opencode-ducksay)](https://www.npmjs.com/package/opencode-ducksay)
[![Лицензия MIT](https://img.shields.io/npm/l/opencode-ducksay)](https://github.com/zhek/opencode-ducksay/blob/main/LICENSE)
[![OpenCode V2](https://img.shields.io/badge/OpenCode-V2-5b8def)](https://opencode.ai/v2/docs/)

Маленькая ASCII-уточка плавает в сайдбаре OpenCode и отпускает забавные комментарии по вашей работе. Уточка использует модель вашей сессии.

[English version](https://github.com/zhek/opencode-ducksay/blob/main/README.md)

![Демонстрация Ducksay: уточка комментирует ответ и отвечает на /duck](https://raw.githubusercontent.com/zhek/opencode-ducksay/main/assets/ducksay-demo.ru.gif)

## Поговорить с уточкой

Введите `/duck <текст>` в TUI, чтобы поговорить с уточкой. Диалог не попадает в контекст или историю сессии.

## Скриншоты

Нажмите `[img]` в заголовке `Ducksay` или выполните `/duck.img` — сцена с уточкой сохранится в PNG. Файлы лежат в
`.opencode/ducksay/screenshots/` проекта. Папка приносит свой `.gitignore`, поэтому в git они не попадут.

## Выбор модели

Уточка шутит той же моделью, что и ваша сессия. Если она платная, для шуток можно указать другую:

```json
{
  "plugins": [{ "package": "opencode-ducksay", "options": { "llmModel": "opencode/big-pickle" } }]
}
```

В `llmModel` пишется модель в форме `"провайдер/модель"`. Сессия остаётся на своей модели. Если указанной модели нет,
уточка ответит `Quack-quack!` вместо шутки.

## Установка

Установите плагин одной командой:

```bash
opencode plugin add opencode-ducksay
```

Перезапустите OpenCode.

Чтобы включить его только в одном проекте, добавьте `"opencode-ducksay"` в массив `plugins` в `opencode.json` этого
проекта.

## Документация

- [Как ведёт себя уточка](https://github.com/zhek/opencode-ducksay/blob/main/docs/behavior.ru.md) — плавание, шутки,
  вопросы, разговор с уточкой и вода.
- [Конфигурация и опции](https://github.com/zhek/opencode-ducksay/blob/main/docs/configuration.ru.md) — `swimSpeed`,
  `silent`, `llmTimeout`, `llmContextDepth`, `llmModel` и настройки боковой панели.

## Лицензия

[MIT](https://github.com/zhek/opencode-ducksay/blob/main/LICENSE) © Evgeniy Arapov
