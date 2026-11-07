# Spec Delta

## Purpose

Диагностический лог плагина: куда и в каком формате пишутся ошибки и предупреждения, сколько файлов хранится, какие события существуют и какие данные запрещено записывать.

## ADDED Requirements

### Requirement: Лог пишется в папку проекта

Плагин SHALL писать диагностический лог в `<корень_проекта>/.opencode/ducksay/logs/`. Папка SHALL создаваться по требованию, при первой записи, а не при загрузке плагина.

#### Scenario: Первая запись

- **WHEN** плагин впервые пишет событие, проходящее фильтр уровня
- **THEN** создаётся `<корень_проекта>/.opencode/ducksay/logs/` и в ней появляется файл лога

#### Scenario: Ошибок не было

- **WHEN** плагин загрузился и не записал ни одного события
- **THEN** папка `logs/` не создаётся

### Requirement: Логи скрыты от git

Файлы лога SHALL попадать под `.opencode/ducksay/.gitignore` со строкой `*\n`. Если файла нет, создавая папку `.opencode/ducksay/`, плагин SHALL записать `*\n`. Существующий `.gitignore` SHALL NOT изменяться. Ошибка записи SHALL игнорироваться.

#### Scenario: Первый лог в новом проекте

- **WHEN** папки `.opencode/ducksay/` ещё нет и плагин пишет первое событие
- **THEN** появляется `.opencode/ducksay/.gitignore` ровно с `*\n`, и `git status` не показывает ни логов, ни самой папки

#### Scenario: Свой `.gitignore`

- **WHEN** в `.opencode/ducksay/` уже лежит `.gitignore` с другим содержимым
- **THEN** плагин не меняет файл, а лог всё равно пишется

### Requirement: Имя файла лога

Имя файла SHALL быть `ducksay-YYYY-MM-DD-N.log`, где `YYYY-MM-DD` — локальная дата, а `N` — целое число без ведущих нулей, начиная с `1`.

#### Scenario: Первый файл дня

- **WHEN** за локальный день ещё нет файлов лога и нужна первая запись
- **THEN** создаётся `ducksay-2026-11-07-1.log`

#### Scenario: Следующий файл дня

- **WHEN** в дне уже есть файлы с `N` от `1` до `5` и нужен новый
- **THEN** создаётся `ducksay-2026-11-07-6.log`

### Requirement: Запись идёт в первый неполный файл дня

Плагин SHALL дописывать строку в первый по возрастанию `N` файл текущего дня, в который она помещается. Если такого файла нет, SHALL создаваться файл с `N = max(N) + 1`, а при отсутствии файлов дня — с `N = 1`.

#### Scenario: Первый файл заполнен

- **WHEN** `ducksay-2026-11-07-1.log` не вмещает новую строку
- **THEN** строка пишется в `ducksay-2026-11-07-2.log`

#### Scenario: Есть неполный старый файл дня

- **WHEN** `ducksay-2026-11-07-2.log` ещё вмещает строку, а `-3` уже существует
- **THEN** строка дописывается в `-2`, а `-3` не меняется

### Requirement: Размер файла ограничен

Один файл лога SHALL содержать не больше `1_048_576` байт. Строка, которая не помещается в текущий файл, SHALL писаться в следующий файл дня, а не обрезаться.

#### Scenario: Переполнение файла

- **WHEN** добавление строки превысило бы `1_048_576` байт в текущем файле
- **THEN** строка целиком пишется в следующий файл дня, а текущий остаётся без изменений

### Requirement: Хранится не больше семи файлов

В `logs/` SHALL храниться не больше `7` файлов лога. Перед созданием восьмого файла плагин SHALL удалять самый старый файл, определяя старость по имени: сначала дата `YYYY-MM-DD`, затем числовой `N`. Если файлов меньше `7`, удаление SHALL NOT выполняться.

#### Scenario: Восьмой файл

- **WHEN** в `logs/` уже семь файлов и нужен новый
- **THEN** удаляется файл с минимальной парой (дата, числовой `N`), затем создаётся новый

#### Scenario: Сравнение номеров как чисел

- **WHEN** в папке есть `ducksay-2026-11-07-2.log` и `ducksay-2026-11-07-10.log`
- **THEN** самым старым считается `-2`, а не `-10`

#### Scenario: Меньше семи файлов

- **WHEN** в `logs/` пять файлов и нужен новый
- **THEN** новый файл создаётся без удаления

### Requirement: Удаляются только файлы лога

При ротации плагин SHALL удалять только файлы, имя которых соответствует `ducksay-YYYY-MM-DD-N.log`. Файлы с другими именами SHALL NOT удаляться.

#### Scenario: Чужой файл в папке

- **WHEN** в `logs/` лежит `notes.txt` и происходит ротация
- **THEN** `notes.txt` остаётся на месте

### Requirement: Сбой удаления не мешает записи

Если самый старый файл удалить не удалось, плагин SHALL продолжить запись, не прерывая работу утки. Следующая ротация SHALL снова попытаться освободить место.

#### Scenario: Нет прав на удаление

- **WHEN** удаление старого файла завершилось ошибкой
- **THEN** новая строка всё равно записывается, а утка, тосты и снимки работают как обычно

### Requirement: Формат строки — JSON Lines

Каждое событие SHALL занимать одну строку: один JSON-объект, UTF-8, завершённый `\n`. Внутри значений SHALL NOT быть переводов строк.

#### Scenario: Два события подряд

- **WHEN** плагин пишет два события
- **THEN** в файле две строки, каждая — самостоятельный JSON-объект

### Requirement: Общие поля строки

Каждая строка SHALL содержать поля `v` = `1`, `time`, `level`, `event`, `message` и `pid`. Поле `session` SHALL присутствовать, если событие относится к сессии. Поля `error` и `data` SHALL присутствовать, только если у события есть ошибка или дополнительные данные.

#### Scenario: Событие с сессией

- **WHEN** плагин пишет `joke.request_failed` для сессии
- **THEN** строка содержит `v`, `time`, `level`, `event`, `message`, `pid` и `session`

#### Scenario: Событие конфигурации

- **WHEN** плагин пишет `config.invalid` при загрузке
- **THEN** строка не содержит `session`

### Requirement: Время локальное с offset

Поле `time` SHALL содержать локальное время в формате `YYYY-MM-DDTHH:mm:ss.SSS±HH:MM`, например `2026-11-07T18:42:10.004+03:00`. Символ `Z` SHALL NOT использоваться. Дата в имени файла SHALL совпадать с локальной датой поля `time`.

#### Scenario: Локальное время

- **WHEN** событие произошло в 18:42:10.004 по местному времени с offset +03:00
- **THEN** поле `time` содержит `2026-11-07T18:42:10.004+03:00`

### Requirement: Уровень задаётся константой

Уровень логирования SHALL задаваться константой `LOG_LEVEL = "warn"`. При ней SHALL записываться события `warn` и `error`, а `info` SHALL NOT. Пользовательской опции `logLevel` SHALL NOT существовать; переданная в опциях `logLevel` SHALL игнорироваться.

#### Scenario: info не пишется

- **WHEN** `LOG_LEVEL` равен `warn` и происходит событие `joke.aborted` уровня `info`
- **THEN** строка не появляется в логе

#### Scenario: warn пишется

- **WHEN** `LOG_LEVEL` равен `warn` и происходит событие `joke.source_missing` уровня `warn`
- **THEN** строка появляется в логе

#### Scenario: Опция logLevel игнорируется

- **WHEN** в опциях плагина передан `logLevel: "info"`
- **THEN** плагин не меняет уровень и продолжает писать только `warn` и `error`

### Requirement: Поле error

Поле `error` SHALL содержать `name` и `message`; `code` SHALL присутствовать, если ошибка его несёт; `stack` SHALL содержать не больше `10` строк.

#### Scenario: Ошибка с кодом

- **WHEN** запись лога вызвана ошибкой с `code` = `ECONNRESET`
- **THEN** объект `error` содержит `name`, `code`, `message` и не больше десяти строк `stack`

### Requirement: Обрезка полей

`error.message` SHALL обрезаться до `1_000` символов, строковые значения `data` — до `500` символов, а вся строка — до `16_384` байт. После обрезки строка SHALL оставаться валидным JSON; если уложиться нельзя, событие SHALL NOT записываться.

#### Scenario: Гигантский стек

- **WHEN** ошибка несёт стек на сто строк
- **THEN** в лог попадают только первые десять строк, а строка остаётся валидным JSON

### Requirement: В лог не попадает содержимое

Плагин SHALL NOT записывать в лог текст шутки, реплику пользователя, промпт, ответ модели, содержимое файлов, diff и вывод инструментов. Исключение — текст ошибки хоста в `error.message` и `error.stack`.

#### Scenario: Шутка не попала в лог

- **WHEN** плагин пишет `joke.request_failed` после неудачного запроса
- **THEN** в строке нет текста шутки, промпта и реплики пользователя

### Requirement: Штатные состояния не логируются

Плагин SHALL NOT писать события для `busy`, `muted`, пустого копирования, пустого снимка, узкой панели, успешной шутки, успешного снимка и успешного копирования. `joke.aborted` SHALL иметь уровень `info` и при `LOG_LEVEL = "warn"` SHALL NOT записываться.

#### Scenario: Занятая утка

- **WHEN** `/duck` отклонён потому, что утка занята
- **THEN** в лог ничего не пишется

### Requirement: Сбой логирования не ломает плагин

Любая ошибка файловой системы при создании папки, чтении каталога, записи, удалении или ротации SHALL игнорироваться. Логгер SHALL NOT бросать исключения и SHALL NOT менять поведение утки, тостов или снимков.

#### Scenario: Папка только для чтения

- **WHEN** записать лог невозможно
- **THEN** шутка, тост или снимок работают так же, как без логгера

### Requirement: Логгер не логирует собственные сбои

Сбой записи лога SHALL NOT приводить к новой попытке записать событие о сбое. Логгер SHALL NOT вызывать сам себя.

#### Scenario: Ошибка записи

- **WHEN** `appendFileSync` бросает исключение
- **THEN** плагин не пытается записать в лог событие об этой ошибке

### Requirement: Событие joke.client_missing

Плагин SHALL писать событие `joke.client_missing` уровня `error` с сообщением `The host client cannot create a joke request.`, когда у клиента хоста нет `session.create`, `session.generate` или `session.remove`.

#### Scenario: Клиент не умеет создавать шутку

- **WHEN** у клиента нет одного из методов `session.create`, `session.generate`, `session.remove`
- **THEN** в лог попадает строка с `event` = `joke.client_missing` и `level` = `error`

### Requirement: Событие joke.source_missing

Плагин SHALL писать событие `joke.source_missing` уровня `warn` с сообщением `The session needed for a joke is gone.`, когда источник шутки не находит сессию или проект.

#### Scenario: Сессия исчезла

- **WHEN** источник шутки возвращает `undefined`
- **THEN** в лог попадает строка с `event` = `joke.source_missing` и `level` = `warn`

### Requirement: Событие joke.prompt_failed

Плагин SHALL писать событие `joke.prompt_failed` уровня `error` с сообщением `The joke prompt could not be built.`, когда чтение источника или сборка промпта бросает исключение. Поле `error` SHALL содержать ошибку.

#### Scenario: Промпт не собрался

- **WHEN** `buildJokePrompt` бросает исключение
- **THEN** в лог попадает строка с `event` = `joke.prompt_failed`, `level` = `error` и объектом `error`

### Requirement: Событие joke.model_unusable

Плагин SHALL писать событие `joke.model_unusable` уровня `info` с сообщением `The configured joke model is not usable.`, когда `llmModel` непустой, но не содержит `/` либо содержит пустого провайдера или пустую модель. Поле `data.model` SHALL содержать исходное значение опции.

#### Scenario: llmModel без провайдера

- **WHEN** `llmModel` равен `haiku` и `LOG_LEVEL` равен `warn`
- **THEN** утка показывает `Quack-quack!`, а `joke.model_unusable` в лог не пишется

#### Scenario: Отладочный уровень

- **WHEN** `llmModel` равен `haiku` и `LOG_LEVEL` равен `info`
- **THEN** в лог попадает строка с `event` = `joke.model_unusable`, `level` = `info` и `data.model` = `haiku`

### Requirement: Событие joke.session_create_failed

Плагин SHALL писать событие `joke.session_create_failed` уровня `error` с сообщением `The temporary joke session could not be created.`, когда `session.create` бросает исключение. Поля `data.model` и `error` SHALL присутствовать.

#### Scenario: Временная сессия не создалась

- **WHEN** `session.create` бросает исключение
- **THEN** в лог попадает строка с `event` = `joke.session_create_failed`, `level` = `error`, `data.model` и `error`

### Requirement: Событие joke.session_create_empty

Плагин SHALL писать событие `joke.session_create_empty` уровня `error` с сообщением `The temporary joke session has no id.`, когда `session.create` не возвращает идентификатор. Поле `data.model` SHALL присутствовать.

#### Scenario: Пустой идентификатор

- **WHEN** `session.create` возвращает пустой `id`
- **THEN** в лог попадает строка с `event` = `joke.session_create_empty` и `level` = `error`

### Requirement: Событие joke.request_failed

Плагин SHALL писать событие `joke.request_failed` уровня `error` с сообщением `The joke request failed.`, когда `session.generate` бросает исключение, не являющееся таймаутом или отменой. Поля `data.model`, `data.durationMs` (в миллисекундах) и `error` SHALL присутствовать.

#### Scenario: Сервер ответил ошибкой

- **WHEN** `session.generate` бросает сетевую ошибку
- **THEN** в лог попадает строка с `event` = `joke.request_failed`, `level` = `error` и `data.durationMs`

### Requirement: Событие joke.timeout

Плагин SHALL писать событие `joke.timeout` уровня `error` с сообщением `The joke request timed out.`, когда истёк `llmTimeout`. Поля `data.model`, `data.timeoutMs` (в миллисекундах) и `data.durationMs` (в миллисекундах) SHALL присутствовать.

#### Scenario: Таймаут

- **WHEN** запрос шутки не уложился в `llmTimeout`
- **THEN** в лог попадает строка с `event` = `joke.timeout`, `level` = `error` и `data.timeoutMs`

### Requirement: Событие joke.empty_answer

Плагин SHALL писать событие `joke.empty_answer` уровня `warn` с сообщением `The model returned no usable joke.`, когда после очистки ответа не остаётся текста. Поля `data.durationMs` (в миллисекундах) и `data.rawLength` (в символах) SHALL присутствовать.

#### Scenario: Пустой ответ

- **WHEN** модель вернула пустую строку или только эмодзи
- **THEN** в лог попадает строка с `event` = `joke.empty_answer` и `level` = `warn`

### Requirement: Событие joke.cleanup_failed

Плагин SHALL писать событие `joke.cleanup_failed` уровня `warn` с сообщением `The temporary joke session could not be removed.`, когда `session.remove` бросает исключение. Поля `data.temporaryID` и `error` SHALL присутствовать.

#### Scenario: Временная сессия не удалилась

- **WHEN** `session.remove` бросает исключение
- **THEN** в лог попадает строка с `event` = `joke.cleanup_failed` и `level` = `warn`

### Requirement: Событие joke.aborted

Плагин SHALL писать событие `joke.aborted` уровня `info` с сообщением `The joke request was cancelled.`, когда запрос отменён новым ходом или размонтированием раздела. Поле `data.reason` SHALL быть `turn` или `unmount`.

#### Scenario: Новый ход отменил запрос

- **WHEN** новый ход отменяет незавершённый запрос шутки и `LOG_LEVEL` равен `info`
- **THEN** в лог попадает строка с `event` = `joke.aborted`, `level` = `info` и `data.reason` = `turn`

### Requirement: Событие screenshot.save_failed

Плагин SHALL писать событие `screenshot.save_failed` уровня `error` с сообщением `The screenshot could not be saved.`, когда запись снимка падает на рендере, создании папки или записи файла. Поля `data.path` и `data.phase` SHALL присутствовать; `phase` SHALL быть `render`, `mkdir` или `write`.

#### Scenario: Нет прав на запись

- **WHEN** запись PNG завершилась ошибкой доступа
- **THEN** в лог попадает строка с `event` = `screenshot.save_failed`, `level` = `error`, `data.phase` = `write` и объектом `error`

### Requirement: Событие screenshot.gitignore_failed

Плагин SHALL писать событие `screenshot.gitignore_failed` уровня `warn` с сообщением `The screenshot folder could not hide itself from git.`, когда не удалось записать `.gitignore`. Поля `data.path` и `error` SHALL присутствовать.

#### Scenario: `.gitignore` не записался

- **WHEN** на месте `.gitignore` стоит каталог
- **THEN** снимок всё равно сохраняется, а в лог попадает `screenshot.gitignore_failed` уровня `warn`

### Requirement: Событие screenshot.names_exhausted

Плагин SHALL писать событие `screenshot.names_exhausted` уровня `error` с сообщением `The screenshot name space for this second is exhausted.`, когда исчерпаны `1000` имён в одну секунду. В этом случае `screenshot.save_failed` SHALL NOT писаться. Поле `data.stem` SHALL присутствовать.

#### Scenario: Тысяча коллизий

- **WHEN** в одну секунду уже существует `1000` файлов снимка
- **THEN** в лог попадает `screenshot.names_exhausted`, а не `screenshot.save_failed`

### Requirement: Событие copy.failed

Плагин SHALL писать событие `copy.failed` уровня `warn` с сообщением `The clipboard did not accept the joke.`, когда OSC 52 вернул `false` или бросил исключение. Поле `data.reason` SHALL быть `unavailable` или `threw`.

#### Scenario: Терминал не принял текст

- **WHEN** копирование в буфер обмена возвращает `false`
- **THEN** в лог попадает строка с `event` = `copy.failed`, `level` = `warn` и `data.reason` = `unavailable`

### Requirement: Событие config.invalid для числовых опций

Плагин SHALL писать событие `config.invalid` уровня `warn` один раз при загрузке для каждой неверной опции `swimSpeed`, `llmTimeout`, `llmContextDepth`. Поля `option`, `value`, `effective` и `reason` SHALL присутствовать; `reason` SHALL быть `fallback` или `capped`.

#### Scenario: Некорректный swimSpeed

- **WHEN** `swimSpeed` равен `-5`
- **THEN** в лог попадает `config.invalid` с `option` = `swimSpeed`, `value` = `-5`, `effective` = `10`, `reason` = `fallback` и сообщением `The swimSpeed option is invalid.`

#### Scenario: swimSpeed выше предела

- **WHEN** `swimSpeed` равен `500`
- **THEN** в лог попадает `config.invalid` с `effective` = `120`, `reason` = `capped` и сообщением `The swimSpeed option was capped.`

#### Scenario: Некорректный llmTimeout

- **WHEN** `llmTimeout` равен `0`
- **THEN** в лог попадает `config.invalid` с `option` = `llmTimeout`, `effective` = `60000` мс, `reason` = `fallback` и сообщением `The llmTimeout option is invalid.`

#### Scenario: llmTimeout выше предела

- **WHEN** `llmTimeout` равен `500`
- **THEN** в лог попадает `config.invalid` с `effective` = `120000` мс, `reason` = `capped` и сообщением `The llmTimeout option was capped.`

#### Scenario: Некорректный llmContextDepth

- **WHEN** `llmContextDepth` равен `0`
- **THEN** в лог попадает `config.invalid` с `option` = `llmContextDepth`, `effective` = `2`, `reason` = `fallback` и сообщением `The llmContextDepth option is invalid.`

#### Scenario: llmContextDepth выше предела

- **WHEN** `llmContextDepth` равен `50`
- **THEN** в лог попадает `config.invalid` с `effective` = `10`, `reason` = `capped` и сообщением `The llmContextDepth option was capped.`

### Requirement: Событие config.invalid для llmModel

Плагин SHALL писать событие `config.invalid` уровня `warn` один раз при загрузке, когда `llmModel` непустой, но непригоден. Поля `option` = `llmModel`, `value`, `effective` = `null` и `reason` = `unusable` SHALL присутствовать. Сообщение SHALL быть `The llmModel option is not a usable provider/model reference.`

#### Scenario: llmModel без провайдера

- **WHEN** `llmModel` равен `haiku`
- **THEN** в лог попадает `config.invalid` с `option` = `llmModel`, `value` = `haiku`, `effective` = `null` и `reason` = `unusable`

### Requirement: Событие plugin.setup_failed

Плагин SHALL писать событие `plugin.setup_failed` уровня `error` с сообщением `The plugin setup failed.`, когда `setup` бросает исключение после создания логгера. Поле `error` SHALL присутствовать.

#### Scenario: Ошибка в setup

- **WHEN** `setup` бросает исключение после создания логгера
- **THEN** в лог попадает строка с `event` = `plugin.setup_failed` и `level` = `error`

### Requirement: Событие command.failed

Плагин SHALL писать событие `command.failed` уровня `error` с сообщением `A duck command failed.`, когда обработчик `/duck`, `/duck.copy` или `/duck.img` бросает исключение. Поля `data.command` и `error` SHALL присутствовать.

#### Scenario: Ошибка команды

- **WHEN** обработчик `/duck.img` бросает исключение
- **THEN** в лог попадает строка с `event` = `command.failed`, `level` = `error` и `data.command` = `duck.img`

### Requirement: Событие event.failed

Плагин SHALL писать событие `event.failed` уровня `error` с сообщением `A duck event handler failed.`, когда слушатель события хоста бросает исключение. Поля `data.event` и `error` SHALL присутствовать.

#### Scenario: Ошибка слушателя

- **WHEN** слушатель `session.execution.started` бросает исключение
- **THEN** в лог попадает строка с `event` = `event.failed`, `level` = `error` и `data.event` = `session.execution.started`
