# Endless Sky Operations

## Frontend Redesign Roadmap

Этот документ фиксирует целевую переработку фронта без абстракций и без "перепишем потом".
Он же служит рабочим порядком внедрения на ближайшие итерации.
План привязан к текущим страницам, текущим данным и текущим файлам проекта.

Основные файлы, которые будут затрагиваться:

- `/Users/ilia/Projects/endless-sky-trade-app/public/index.html`
- `/Users/ilia/Projects/endless-sky-trade-app/public/app.js`
- `/Users/ilia/Projects/endless-sky-trade-app/public/style.css`

Серверные расширения, если понадобятся:

- `/Users/ilia/Projects/endless-sky-trade-app/server.mjs`

Локальные игровые данные уже должны считаться основным источником, а не GitHub:

- `/Users/ilia/Projects/endless-sky-trade-app/cache/game-data`
- `/Users/ilia/Projects/endless-sky-trade-app/cache/game-source`

## 1. Product goals

Новая версия фронта должна решать пять задач:

1. `Planner` должен быть компактным, читаться без вертикального листания и не превращать карту в гигантский бесполезный блок.
2. `Atlas` должен стать живой картой мира и текущей доступности, а не просто длинным списком с таблицами.
3. `Fleet` должен быть плотным и полезным: флот, лицензии, стендинги, mission occupancy, без пустых колонок и без "мертвых" панелей.
4. `Fitter` должен работать как игровой экран:
   - слева выбор корабля / фитов / модулей;
   - справа компактный ship sheet;
   - всё важное помещается в один экран по высоте;
   - левая часть скроллится независимо от правой.
5. Должна появиться отдельная `Wiki`, которая вытягивает описания, изображения, sale state и сюжетные / лицензионные ограничения из локальных игровых данных и текущего save state.

## 2. Scope boundaries

Что входит в этот план:

- переработка layout и UX
- переработка карт
- фильтрация "только доступное сейчас" по сейву
- debug mode
- новая `Wiki`
- более строгая информационная архитектура

Что не входит в первую волну:

- упаковка в desktop app
- глубокий маршрутный оптимизатор с многошаговыми циклами
- редактирование save file
- полноценная база миссий и диалогов

## 3. Information architecture target

Целевая верхняя навигация:

- `Planner`
- `Atlas`
- `Fleet`
- `Fitter`
- `Wiki`

Целевая глобальная модель интерфейса:

- верхняя строка: save, location, fleet, jumps, debug toggle
- summary strip: только действительно важные карточки для текущей страницы
- каждая страница: одна доминирующая задача, без "панель внутри панели внутри панели"

Глобальные UI-правила:

- меньше вложенных card-on-card конструкций
- меньше огромных пустых областей
- больше фиксированной высоты и внутренних скроллов
- явные состояния:
  - `available now`
  - `known but unavailable now`
  - `locked by reputation`
  - `locked by license`
  - `blocked by story state`
  - `debug only`

## 4. Map redesign

### 4.1 Основная проблема

Сейчас локальная карта и мини-карта портятся из-за дальних outlier systems:

- 2-3 точки где-то далеко раздувают bounds;
- локальная область визуально сжимается;
- мини-карта становится бессмысленной;
- constellation вокруг текущего маршрута теряет читаемость;
- крупные точки портят локальный рисунок соседних систем.

### 4.2 Целевое поведение

#### Planner map

- большая карта живёт справа, а не отдельным огромным блоком сверху;
- карта имеет фиксированную высоту в пределах viewport;
- слева находится компактный planning stack;
- справа sticky rail с картой;
- локальная карта показывает только полезный cluster;
- mini galaxy показывает общий контекст;
- локальная и глобальная карты используют одну и ту же ориентацию.

#### Atlas map

- Atlas тоже получает локальную карту с той же логикой фильтрации;
- рядом остаётся компактный galaxy overview;
- при выборе системы карта фокусируется на её cluster, а не на всей галактике сразу;
- full-galaxy режим остаётся доступен как переключатель, а не как дефолт.

### 4.3 Алгоритм фильтрации карты

Нужно заменить текущий принцип "покажи всё, что попало в bounds" на cluster-first логику.

Правило:

1. Выделить anchor systems:
   - current system
   - tracked route origin / destination
   - active selected atlas system
2. Построить route corridor:
   - shortest path между ключевыми точками
   - плюс `N-hop neighborhood` вокруг каждой системы на пути
3. Разбить видимые системы на connected components.
4. Оставить только:
   - компоненту, в которой есть current system;
   - если current system вне выборки, компоненту, в которой есть origin;
   - для atlas режима компоненту выбранной системы.
5. Все мелкие disconnected islands вне целевой компоненты не участвуют в local bounds.
6. Mini galaxy показывает всю карту, но outlier islands не должны влиять на local zoom window.

Дополнительное правило для дальних маршрутов:

- если маршрут реально уходит далеко, local map переключается в `corridor mode`;
- corridor mode включает только путь и небольшой соседний слой вокруг него;
- обзор всей галактики остаётся справа как контекст.

### 4.4 Visual changes for maps

- уменьшить размер обычных system nodes;
- current / origin / destination оставить акцентными, но не огромными;
- тоньше базовые links;
- локальную карту уменьшить по высоте;
- mini map сделать меньше и чище;
- убрать ситуацию, где карта заставляет прокручивать страницу прежде, чем пользователь видит routes.

## 5. Planner redesign

### 5.1 Основные проблемы

- карта слишком доминирует;
- planner визуально расползается вниз;
- активный route и tracker слишком слабо организуют экран;
- слишком много route blocks одинакового веса;
- выбор маршрута вручную сейчас даёт шум, а не помогает.

### 5.2 Целевая структура

Левая колонка:

- `Active plan`
- `Best direct markets`
- `Best current cargo exits`
- `Best loops from here`
- `Reachable loops`
- `Risky but profitable`
- `Loop tracker`

Правая колонка:

- sticky `Route map`
- `Galaxy overview`

### 5.3 UX changes

- убрать свободный "manual select any route" как основную механику;
- активная карта должна следовать одному из источников приоритета:
  1. tracked loop
  2. лучший безопасный loop
  3. лучший безопасный direct market
  4. current system neighborhood
- route card остаётся кликабельной только как secondary action: `Focus`.
- `Travel plan` не показывать вообще, если route не выбран и tracker не активен.
- risky routes вынести в отдельный блок, а не смешивать с нормальными.

### 5.4 Compact route cards

Route cards должны стать плотнее:

- 1 строка заголовка
- 1 строка ключевых метрик
- 1 строка buy / sell summary
- warning line только при необходимости
- action row только для tracker / focus

Acceptance criteria:

- на 1440px по высоте первая экранная область показывает:
  - summary strip
  - active plan
  - минимум 2 route sections
  - sticky map справа
- без вертикального скролла до начала анализа маршрутов

## 6. Fleet redesign

### 6.1 Основные проблемы

- в целом страница уже полезна, но блоки ещё выглядят слишком тяжёлыми;
- standings занимают слишком много места;
- licenses создают пустую колонку;
- нет хорошего "at a glance" состояния по роли кораблей и fit status.

### 6.2 Целевая структура

Верх:

- mission occupancy
- cargo ledger

Середина:

- fleet roster cards

Низ:

- `Standings` слева
- `Licenses` справа, но в компактном icon-grid виде

### 6.3 Standings

По умолчанию показывать:

- major factions
- factions with non-zero / meaningful current relevance
- factions affecting current route access

Добавить:

- `Show all` toggle
- compact colored delta badges

### 6.4 Licenses

Вместо длинного пустого столбца:

- сетка license cards с иконками
- owned licenses первыми
- locked but relevant ниже
- на карточке:
  - image
  - name
  - owned / locked
  - short unlock hint
  - top 1-2 purchase / unlock leads

Отдельный режим:

- `Relevant to current save`
- `Show all licenses` через debug mode

Acceptance criteria:

- экран не должен иметь огромного пустого right column;
- минимум 6-8 license cards должны укладываться компактной сеткой;
- standings не должны по дефолту показывать весь мусорный список hostile test factions.

## 7. Fitter redesign

### 7.1 Основные проблемы

- левая колонка слишком длинная;
- она не держится в viewport и отрывается от правого ship sheet;
- правая колонка чрезмерно большая и пустая;
- выбор кораблей и fit browser смешаны неудачно;
- модульный каталог живёт слишком глубоко вниз;
- нет хорошей логики "только то, что уже доступно по сейву".

### 7.2 Целевая структура

Левая колонка должна быть шире правой.

Предлагаемая сетка:

- левая колонка: `minmax(0, 1.45fr)`
- правая колонка: `minmax(360px, 0.95fr)`

Левая колонка имеет три верхних таба:

- `Ships`
- `Fits`
- `Modules`

#### Ships tab

- scroll внутри блока
- список только доступных кораблей по сейву
- сортировки:
  - owned
  - buyable now
  - known but unavailable
- поисковая строка
- кнопка `Show all` только в debug mode

#### Fits tab

- если справа выбран корабль, по умолчанию показывать fits только для него
- кнопка `Clear ship filter`
- поиск по fit name / role / ship
- разделение:
  - built-in fits
  - saved fits

#### Modules tab

- grid по группам:
  - Guns
  - Turrets
  - Secondary Weapons
  - Ammunition
  - Power
  - Systems
  - Hand to Hand
- только доступные сейчас модификации по сейву
- отдельный toggle:
  - `Installed / Sold now / All visible`
- в debug mode можно увидеть вообще всё

### 7.3 Right panel

Правая колонка должна помещаться в одну экранную высоту без модульного каталога.

Состав:

- selected outfit inspector
- compact ship hero
- ship description + sale state + cost
- compact stat sheet
- installed loadout with внутренним scroll

Что уменьшить:

- hero image
- вертикальные gap
- пустые верхние и нижние отступы
- overly tall stat blocks

### 7.4 Fit rules

Уже есть:

- outfit / weapon / engine / gun / turret checks
- sustain metrics

Нужно сохранить и дооформить:

- disabled add button с понятной причиной
- install state color
- `battery empty in X`
- `overheats in X`
- `stable` только если реально stable
- fit total price в видимом месте

### 7.5 Fit visibility rules

По умолчанию fitter должен показывать только то, что актуально для этого save:

#### Ships default visibility

- owned ships
- ships sold right now
- ships with live known availability and доступом по репутации / лицензии

Не показывать по умолчанию:

- полностью закрытые сюжетно или faction-locked корпуса
- event-only ships
- test / mission-only entities

#### Outfits default visibility

- installed on owned ships
- sold right now
- доступные в live outfitter groups текущего состояния мира

Не показывать по умолчанию:

- полностью недоступные модули
- mission-only / test entries

#### Debug mode

Debug mode должен:

- включать полный каталог
- показывать скрытые sale locations
- показывать why locked
- маркировать debug-only записи

Acceptance criteria:

- слева можно листать корабли / fits / modules независимо;
- при прокрутке модулей пользователь всё ещё видит ship sheet справа;
- правый блок укладывается в один экран по высоте без ощущения пустоты;
- fitter больше не превращается в бесконечную страницу вниз.

## 8. Atlas redesign

### 8.1 Цель страницы

`Atlas` должен стать страницей ответа на вопросы:

- где это покупается сейчас?
- где это покупалось обычно?
- можно ли это купить именно в моём текущем сейве?
- что в этой системе продаётся прямо сейчас?
- какая тут репутационная / сюжетная блокировка?

### 8.2 Целевая структура

Левая колонка:

- system search
- filters
- result list

Правая часть:

- local map + mini galaxy
- system snapshot
- live prices
- planets and services
- ships now
- outfits now

### 8.3 New features

Нужно добавить:

- ship lookup
- outfit lookup
- `available now / known / blocked` state
- explicit story-state notes
  - например кейсы уровня `Geminus after bombing`
- buyability status по выбранной планете:
  - `can land`
  - `rep too low`
  - `service removed by story`

Acceptance criteria:

- пользователь может открыть систему и сразу понять:
  - цены
  - планеты
  - shipyard / outfitter state
  - что реально покупается сейчас
  - что заблокировано

## 9. New Wiki page

### 9.1 Роль

`Wiki` это не копия GitHub wiki.
Это локальная in-app knowledge layer поверх официальных игровых данных и текущего save state.

### 9.2 Начальный scope

Первая версия `Wiki` должна содержать:

- `Ships`
- `Outfits`
- `Licenses`
- `Governments / access`
- `Story-gated locations`

### 9.3 Ship wiki card

Для каждого корабля:

- image
- category
- official description
- base stats
- licenses
- cost
- stock fit summary
- sold now
- known vanilla sale locations
- blocked now by story / reputation if applicable

### 9.4 Outfit wiki card

Для каждого модуля:

- image
- official description
- category
- relevant stats
- sold now
- known sale groups
- currently unavailable reason if applicable

### 9.5 License wiki card

- image
- description / hint
- what it unlocks
- where it is currently obtainable if applicable
- why it is blocked otherwise

### 9.6 Story / world-state notes

Минимальная первая версия:

- curated derived notes for known dynamic cases
- example:
  - `Cruiser`
  - `Geminus`
  - `available before bombing`
  - `restored after Geminus Rebuilt`

Это уже partly supported текущими save-aware data layers, но нужно оформить в UI.

## 10. Debug mode

Нужен глобальный `Debug mode`, а не случайные локальные фильтры.

Где живёт:

- toggle в topbar
- persisted in `localStorage`

Что делает:

- показывает все корабли и модули, даже если они недоступны
- показывает скрытые / debug-only sale locations
- показывает why hidden / why blocked
- снимает default filter по текущему сейву
- в Atlas и Wiki показывает vanilla-known entries рядом с live state

Чего не делает:

- не ломает нормальный default UX
- не становится обязательным режимом для обычного пользователя

## 11. Required backend support

Часть работы требует не только CSS/HTML, но и новых полей из сервера.

### 11.1 Needed for ships

Для каждого ship entity нужны derived fields:

- `ownedNow`
- `buyableNow`
- `knownSaleLocations`
- `currentSaleLocations`
- `licenseOwned`
- `reputationOk`
- `storyBlocked`
- `debugHiddenReason`

### 11.2 Needed for outfits

Для каждого outfit entity нужны derived fields:

- `installedNow`
- `soldNow`
- `knownSaleLocations` или sale groups
- `buyableNow`
- `licenseOwned`
- `reputationOk`
- `storyBlocked`
- `debugHiddenReason`

### 11.3 Needed for systems / planets

- `canLandNow`
- `blockedReason`
- `serviceState`
- `shipyardState`
- `outfitterState`

### 11.4 Needed for wiki

- normalized description blocks
- image URLs
- current vs known availability
- source path metadata when useful

## 12. CSS direction

Нынешний стиль уже ушёл от "случайного AI-градиента", но ещё не дожал product feel.

Новая визуальная цель:

- ближе к `EDDB` / utilitarian sci-fi ops tools
- меньше декоративной атмосферы
- меньше крупных градиентных пустот
- больше структуры, grid, density
- тонкие акценты, не "showcase panels"

Что меняем:

- уменьшаем visual weight background effects
- делаем карту функциональным инструментом, а не hero block
- нормализуем радиусы, border contrast и spacing scale
- сокращаем количество разных card styles
- приводим все таблицы, pills, cards и tiles к одной системе отступов

Типографика:

- page title крупный
- section titles средние
- body copy короче
- служебные подписи мельче и однотипнее

## 13. Recommended implementation order

Порядок важен. Идти лучше так:

### Phase A. Layout skeleton

- переписать `Planner` shell
- переписать `Fitter` shell
- переписать `Fleet` lower area
- добавить заготовку `Wiki`

Результат:

- страницы уже компактнее
- карта справа
- fitter не бесконечный вниз

### Phase B. Map logic

- внедрить cluster-based local map filtering
- исправить outlier systems
- синхронизировать planner / atlas map logic
- уменьшить node scale

Результат:

- карты не ломаются из-за дальних 2-3 систем

### Phase C. Save-aware visibility

- фильтрация ships / outfits по сейву
- relevant-only licenses
- standings default filter
- global debug mode

Результат:

- интерфейс перестаёт показывать мусор по умолчанию

### Phase D. Fitter UX

- tabs `Ships / Fits / Modules`
- ship-scoped fits
- clear fit filter
- internal scroll areas
- compact right inspector

Результат:

- fitter становится рабочим инструментом, а не длинной витриной

### Phase E. Atlas + Wiki

- richer atlas detail
- item / ship lookup
- wiki cards
- story-state messaging

Результат:

- приложение превращается не только в planner, но и в полезную локальную базу по игре

## 14. Risks and coordination

### Server coordination

Сейчас другая модель может параллельно трогать backend.
Поэтому фронтовые изменения надо разделить на два типа:

- frontend-only
- frontend + additive backend fields

Нельзя делать большой одновременный rewrite `server.mjs` без синхронизации.

### Performance

Риски:

- слишком тяжёлый rerender больших списков
- большие SVG с лишними nodes
- перегруженный wiki search

Меры:

- виртуализировать длинные списки только если реально понадобится
- сначала решить фильтрацию и layout
- держать mini maps простыми

## 15. Definition of done

Первая "нормальная" версия считается готовой, когда:

- Planner больше не требует скроллить вниз из-за карты
- локальная карта не ломается от outlier systems
- mini map и atlas map выглядят осмысленно
- Fleet не содержит пустых тяжёлых колонок
- Licenses показываются компактными полезными карточками
- Fitter помещается в одну viewport-композицию:
  - слева scrollable browser
  - справа compact ship sheet
- По умолчанию видны только доступные корабли и модули
- Debug mode показывает всё остальное
- Atlas отвечает на вопрос "можно ли купить это сейчас"
- Wiki показывает корабли / модули / лицензии с картинками, описаниями и current-state availability

## 16. Immediate next implementation slice

Если делать следующий реальный рабочий кусок, а не расползаться во всё сразу, брать надо вот это:

1. `Planner`:
   - перенести карту вправо в sticky rail
   - уменьшить её высоту
   - убрать ручной selection-first UX
   - выделить risky routes в отдельный блок
2. `Map logic`:
   - убрать disconnected outlier systems из local bounds
   - сохранить full galaxy только в overview
3. `Fitter shell`:
   - поменять пропорции колонок
   - сделать левую часть независимым scroll region
   - разбить на tabs `Ships / Fits / Modules`
4. `Fleet cleanup`:
   - компактные licenses
   - standings по умолчанию только relevant

Это даст самый большой визуальный и UX эффект без того, чтобы сразу влезать во всю `Wiki`.
