# Tasks

## 1. Общая папка и `.gitignore`

- [x] 1.1 Вынести создание `<корень_проекта>/.opencode/ducksay/` и `.gitignore` с `*\n` в `src/ducksay-folder.ts` (`ensureDucksayFolder`), перевести `src/screenshot.ts` на общий помощник без изменения поведения. Проверка: `bun test test/screenshot.test.ts` проходит.
- [x] 1.2 Добавить `test/ducksay-folder.test.ts` с проверками создания папки, содержимого `*\n`, флага `wx`, сохранения чужого `.gitignore` и игнорирования ошибки записи. Проверка: `bun test test/ducksay-folder.test.ts` проходит.

## 2. Логгер: формат, файлы и запись

- [x] 2.1 Создать `src/log.ts`: тип `LogLevel`, константа `LOG_LEVEL = "warn"`, форматтер локального времени `YYYY-MM-DDTHH:mm:ss.SSS±HH:MM`, сборка JSONL-строки с полями `v` = `1`, `time`, `level`, `event`, `message`, `pid`, необязательными `session`, `error`, `data`, и фильтрация уровней. Проверка: `test/log.test.ts` проверяет точный JSON, формат времени, обязательные поля и что при `warn` `info` не пишется.
- [x] 2.2 Реализовать выбор файла дня и ротацию: `ducksay-YYYY-MM-DD-N.log`, `N` с `1`, запись в первый неполный файл дня, предел `1_048_576` байт, не больше `7` файлов, удаление самого старого по паре (дата, числовой `N`) перед созданием восьмого, сохранение чужих файлов и продолжение записи при сбое удаления. Проверка: `test/log.test.ts` покрывает первый файл дня, переполнение, восьмой файл, сравнение `-2` и `-10`, чужой `notes.txt` и отказ удаления.
- [x] 2.3 Довести sink: ленивое создание папки, append, проглатывание всех ошибок файловой системы, запрет рекурсивного логирования, обрезка `error.message` до `1_000` символов, строк `data` до `500`, `stack` до `10` строк и всей строки до `16_384` байт с сохранением валидного JSON или отказом от записи. Проверка: `test/log.test.ts` проверяет длинный стек, длинную строку, недоступную папку и отсутствие исключений.
- [x] 2.4 Проверить, что папка `logs/` не создаётся без событий и что первый `warn`/`error` создаёт её вместе с `.opencode/ducksay/.gitignore`. Проверка: `test/log.test.ts` и `test/ducksay-folder.test.ts` проходят.

## 3. Шутка: причины отказа

- [x] 3.1 Добавить в `src/joke.ts` тип `JokeFailure` и колбэк `onFailure`, не меняя возвращаемое значение генератора. Покрыть причины `client_missing`, `source_missing`, `prompt_failed`, `model_unusable`, `session_create_failed`, `session_create_empty`, `request_failed`, `timeout`, `empty_answer`, `cleanup_failed`, `aborted` с различением таймаута, отмены и обычной ошибки запроса. Проверка: `test/joke.test.ts` проверяет каждый `kind` и отсутствие колбэка при успехе.
- [x] 3.2 Подключить `onFailure` в `setup` (`src/tui.tsx`): создать логгер, преобразовать `JokeFailure` в события `joke.*`, писать `config.invalid` для непригодного `llmModel` без `/` один раз при загрузке и `joke.model_unusable` уровнем `info`. Проверка: `test/setup.test.ts` подтверждает, что при `warn` есть только `config.invalid`, а `joke.model_unusable` появляется только при уровне `info`.
- [x] 3.3 Проверить непригодный `llmModel` без `/`: облачко показывает `Quack-quack!`, временная сессия не создаётся, запрос к модели не уходит, в дефолтном логе одна строка `config.invalid`, где `data` содержит `option` = `llmModel`, `value` = переданное значение, `effective` = `null`, `reason` = `unusable`. Проверка: `test/setup.test.ts` и `test/joke.test.ts` проходят.

## 4. Снимок, копирование, конфигурация, команды и события

- [x] 4.1 Обновить `src/screenshot.ts`: сообщать о сбое `.gitignore` через `onWarning`, различать фазы `render`, `mkdir`, `write` для `screenshot.save_failed` и писать отдельное `screenshot.names_exhausted` без дублирования `screenshot.save_failed`. Проверка: `test/screenshot.test.ts` покрывает каждую фазу и исчерпание `1000` имён.
- [x] 4.2 Логировать `copy.failed` уровня `warn` с `data.reason` = `unavailable` или `threw`, не записывая текст шутки. Проверка: `test/setup.test.ts` проверяет оба варианта и отсутствие текста шутки в строке.
- [x] 4.3 Добавить в `src/options.ts` диагностику `swimSpeed`, `llmTimeout`, `llmContextDepth` и `llmModel` с полями `option`, `value`, `effective`, `reason` и точными сообщениями из спеки; писать `config.invalid` один раз при загрузке. Проверка: `test/options.test.ts` и `test/setup.test.ts` проверяют `fallback`, `capped` и `unusable`, включая `effective` = `10`, `120`, `60000`, `120000`, `2`, `10` и `null`.
- [x] 4.4 Обернуть `setup`, обработчики `/duck`, `/duck.copy`, `/duck.img` и слушатель `session.execution.started`, чтобы неожиданное исключение давало `plugin.setup_failed`, `command.failed` или `event.failed` и не ломало TUI. Проверка: `test/setup.test.ts` проверяет каждое событие и его `data.command` / `data.event`.
- [x] 4.5 Проверить приватность и штатные состояния: в лог не попадают текст шутки, реплика пользователя, промпт, ответ модели и вывод инструментов; `busy`, `muted`, пустое копирование, пустой снимок, узкая панель и успешные операции не логируются. Проверка: `test/setup.test.ts` и `test/log.test.ts` проходят.

## 5. Финальные проверки

- [x] 5.1 Запустить автоматизированные тесты: `bun test` и `bunx tsc --noEmit`; убедиться, что все проверки проходят. Тесты отрисовки требуют Bun и под Node не запускаются.
- [x] 5.2 Обновить документацию: `docs/behavior.md`, `docs/behavior.ru.md` и запись в `## Unreleased` → `### Added` файла `CHANGELOG.md`. По решению для этого change `README.md`, `README.ru.md`, `docs/configuration.md` и `docs/configuration.ru.md` не меняются: пользовательской опции у логирования нет, а описание живёт в `docs/behavior`. Версию в `package.json` не двигать. Проверка: `bun test test/docs.test.ts` проходит, `git diff --name-only` не показывает README и configuration.
