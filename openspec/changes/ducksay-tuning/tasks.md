# Tasks

## 1. Значения по умолчанию

- [x] 1.1 Добавить в `test/options.test.ts` явные проверки значений по умолчанию `10` и `60_000`, а также проверку, что значения больше `120` по-прежнему ограничиваются. Убедиться, что новые проверки падают на текущих `12` и `25_000`: `bun test test/options.test.ts`.
- [x] 1.2 Изменить `DEFAULT_SWIM_SPEED` на `10`, а `DEFAULT_LLM_TIMEOUT_MS` на `60_000` в `src/options.ts`, не трогая логику `resolveSwimSpeed`, `resolveLlmTimeout`, `MAX_SWIM_SPEED` и `MAX_LLM_TIMEOUT_MS`. Проверить, что `bun test test/options.test.ts` проходит.
- [x] 1.3 Перевести фикстуры `test/section.test.tsx` и `test/setup.test.ts` с жёсткой скорости `12` на `DEFAULT_SWIM_SPEED` и `COLUMN_MS = 1000 / DEFAULT_SWIM_SPEED`; убрать комментарии про «скорость по умолчанию 12» и проверить оставшиеся жёсткие `12` (включая тест темпа воды). Проверить, что `bun test test/section.test.tsx test/setup.test.ts` проходит и геометрия кадров не разъехалась.
- [x] 1.4 Проверить интеграцию новых значений через существующий тест `falls back to the default speed for a nonsense swimSpeed`: он должен подтверждать движение, соответствующее `10` колонкам в секунду, а не только «сдвинулось с места». Проверить командой `bun test test/setup.test.ts`.

## 2. Маркер ожидающего вопроса

- [x] 2.1 Обновить `test/question.test.ts` и `test/section.test.tsx` под новую каденцию: шесть кадров `?`, `?`, `!`, `⸮`, `⸮`, `!`, шаг `150` мс, выдержки лица `300` мс, ребра `150` мс и полный цикл `900` мс. Тесты должны падать на текущих четырёх кадрах и интервале `300` мс: `bun test test/question.test.ts test/section.test.tsx`.
- [x] 2.2 Изменить `QUESTION_FRAMES` на `["?", "?", "!", "⸮", "⸮", "!"]` и `QUESTION_FRAME_MS` на `150` в `src/question.ts`; обновить комментарий, объясняющий выдержку лиц и быстрое ребро. Проверить, что маркер по-прежнему стартует с `?`, вторая форма не сбрасывает цикл, а колонка не меняется: `bun test test/question.test.ts test/section.test.tsx`.
- [x] 2.3 Проверить, что маркер остаётся единственной работающей анимацией при `swimSpeed: 0`, при закрытии последней формы таймер снимается, а высота раздела не меняется. Проверить соответствующими сценариями в `test/section.test.tsx`: `bun test test/section.test.tsx`.

## 3. Обязательные завершающие задачи

- [x] 3.1 Запустить автоматизированные тесты: выполнить `bun test` и `bunx tsc --noEmit`; все проверки должны проходить. Тесты отрисовки запускать только через Bun, потому что они опираются на нативные модули OpenTUI.
- [x] 3.2 Обновить проектную документацию: `README.md`, `README.ru.md`, `docs/configuration.md`, `CHANGELOG.md`. В README и `docs/configuration.md` указать скорость `10`, таймаут `60` и время пересечения около `2,9` секунды; в README и README.ru описать выдержки маркера — лица по `300` мс, ребро `150` мс, цикл `900` мс. В `CHANGELOG.md` добавить `12 → 10` для `swimSpeed` в `Unreleased` → `### Changed`, обновить существующие пункты `Unreleased` про `llmTimeout` и маркер, не создавать заголовок новой версии, не менять ссылки релизов и `version` в `package.json`. Проверить, что README.md и README.ru.md не расходятся, а в changelog нет новой версии.

## Workflow follow-up

- Работать на ветке `feat/ducksay-tuning`; имя ветки совпадает с директорией change после префикса.
- После реализации и ревью архивировать change последним коммитом PR: `docs: archive ducksay-tuning`.
- Перед архивацией выполнить `openspec validate --strict ducksay-tuning` и убедиться, что все чекбоксы отмечены.
- Главная спека `openspec/specs/ducksay-sidebar/spec.md` обновляется при архивации из delta-спеки; вручную в этом change её не редактировать.
