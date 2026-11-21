# Spec Delta

## ADDED Requirements

### Requirement: Промпт шутки получает голос характера

Плагин SHALL строить промпт шутки с голосом характера отображаемой сессии и SHALL NOT включать в него имя характера. Остальные строки промпта SHALL оставаться прежними, включая правило языка, ограничение длины и запрет шутить о пользователе. Голос SHALL применяться и к шутке в конце хода, и к ответу на `/duck`.

#### Scenario: Голос classic
- **WHEN** характер отображаемой сессии — `classic`
- **THEN** промпт содержит строку `Write one short, kind joke in the duck's voice, with warm irony. Reply with the joke text only, on one line:`

#### Scenario: Голос angry
- **WHEN** характер отображаемой сессии — `angry`
- **THEN** промпт содержит строку `Write one short joke in the duck's voice, with sarcasm about workarounds, crutches and duct tape. Reply with the joke text only, on one line:`

#### Scenario: Голос robot
- **WHEN** характер отображаемой сессии — `robot`
- **THEN** промпт содержит строку `Write one short joke in the duck's voice, as a telegraphic machine report about CI, builds and metrics: short factual fragments, no filler. Use normal sentence case, never all caps. Reply with the joke text only, on one line:`

#### Scenario: Имя характера не попадает в промпт
- **WHEN** промпт построен для любого характера
- **THEN** его строка инструкции не содержит `classic`, `angry` или `robot`

#### Scenario: Ответ на /duck использует тот же голос
- **WHEN** пользователь вызывает `/duck <текст>` при характере `robot`
- **THEN** промпт содержит строку голоса `robot` и вступление о прямом обращении к утке

#### Scenario: Остальные правила на месте
- **WHEN** промпт построен для любого характера
- **THEN** он по-прежнему содержит правило языка последнего сообщения, ограничение в 100 символов и запрет шутить о пользователе

## MODIFIED Requirements

### Requirement: Игнорированная команда показывает тост о занятости

Плагин SHALL показывать при игноре короткий тост без заголовка: сообщение и кнопка закрытия в одной строке, три строки всего, вариант `info`, длительность 2000 мс. Сообщение SHALL быть `<открытый глиф характера> The duck is mid-quack. Try later.`

#### Scenario: Текст сообщения
- **WHEN** команда проигнорирована из-за занятости
- **THEN** тост показывает `<открытый глиф характера> The duck is mid-quack. Try later.`

#### Scenario: Оформление тоста
- **WHEN** тост показан
- **THEN** у него нет заголовка, вариант `info`, длительность 2000 мс, а сообщение и `x` стоят в одной строке

### Requirement: silent отключает команду полностью

При `silent: true` плагин SHALL NOT запрашивать шутку, показывать облачко или менять диалог. Вместо этого SHALL показываться тост `<закрытый глиф характера> The duck keeps mum.` независимо от занятости утки.

#### Scenario: Свободная утка при silent
- **WHEN** `silent: true` и утка в покое, пользователь вызывает `/duck`
- **THEN** запрос к модели не выполняется, а тост показывает `<закрытый глиф характера> The duck keeps mum.`

#### Scenario: Занятая утка при silent
- **WHEN** `silent: true` и сессия занята
- **THEN** показывается тост `<закрытый глиф характера> The duck keeps mum.`, а не тост о занятости
