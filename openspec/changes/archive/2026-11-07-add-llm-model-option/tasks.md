# Tasks

## 1. Резолвер опции `llmModel`

- [x] 1.1 Добавить в `src/options.ts` тип `LlmModelChoice` (`{ kind: "session" }`, `{ kind: "model"; model: ModelRef }`, `{ kind: "unusable" }`) и функцию `resolveLlmModel(options): LlmModelChoice`: опция отсутствует, `null`, пустая или пробельная строка, не строка → `session`; строка обрезается по краям, первая `/` делит её на провайдера и модель, остаток (включая `:free`) целиком становится `id`, `variant` не заполняется; строка без `/`, с пустым провайдером или пустой моделью → `unusable`. Проверка: `bunx tsc --noEmit` проходит.
- [x] 1.2 Добавить в `test/options.test.ts` проверки `resolveLlmModel`: отсутствие опции, `null`, пустая и пробельная строка, число, булево и объект дают `session`; `"opencode/big-pickle"` даёт `{ providerID: "opencode", id: "big-pickle" }`; пробелы по краям отбрасываются; `"openrouter/deepseek-v3:free"` даёт модель `deepseek-v3:free`; `"opus"`, `"/big-pickle"` и `"opencode/"` дают `unusable`. Проверка: `bun test test/options.test.ts` проходит.

## 2. Модель в генераторе шутки

- [x] 2.1 Добавить в `JokeGeneratorOptions` поле `model?: LlmModelChoice` и учесть его в `createJokeGenerator` (`src/joke.ts`): `unusable` возвращает `undefined` сразу, до создания временной сессии и любых вызовов клиента; `model` передаёт свой `ModelRef` в `session.create`; `session` или отсутствие поля оставляют `model: source.session?.model`, как сейчас. Проверка: `bunx tsc --noEmit` проходит.
- [x] 2.2 Добавить в `test/joke.test.ts` проверки: при `model` временная сессия создаётся с разобранным `ModelRef`, а модель сессии не используется; при `session` поведение прежнее (существующая проверка сохраняется); при `unusable` запрос возвращает `undefined`, `session.create` не вызывается и временная сессия не убирается. Проверка: `bun test test/joke.test.ts` проходит.

## 3. Проводка в `setup` и поведение раздела

- [x] 3.1 Прочитать `resolveLlmModel(context.options)` в `setup` (`src/tui.tsx`) и передать результат в `createJokeGenerator` рядом с `depth` и `timeoutMs`. Проверка: `bunx tsc --noEmit` проходит.
- [x] 3.2 Добавить в `test/setup.test.ts` проверки: смонтированный с `options: { llmModel: "opencode/big-pickle" }` плагин создаёт временную сессию с моделью `big-pickle` провайдера `opencode`, а не с моделью сессии; когда `session.create` отвечает ошибкой, облачко показывает `Quack-quack!` и тост не появляется. Проверка: `bun test test/setup.test.ts` проходит.

## 4. Проверка и документация

- [x] 4.1 Запустить автоматизированные тесты: выполнить `bun test` и `bunx tsc --noEmit` и убедиться, что все проверки проходят.
- [x] 4.2 Обновить проектную документацию: в `docs/configuration.md` и `docs/configuration.ru.md` добавить раздел опции `llmModel` (формат `"провайдер/модель"`, отсутствие значения по умолчанию, пример экономии `{ "options": { "llmModel": "opencode/big-pickle" } }`, пустое и непригодное значение, `Quack-quack!` при ошибке); в `README.md` и `README.ru.md` добавить раздел об опции сразу после раздела скриншотов с примером `"llmModel": "opencode/big-pickle"` и имя опции в перечне (только абсолютные ссылки); в `CHANGELOG.md` добавить запись в `## Unreleased` → `### Added`, не меняя `version` в `package.json`. Проверка: `bun test test/docs.test.ts` проходит, обе языковые версии обновлены в одной задаче.
