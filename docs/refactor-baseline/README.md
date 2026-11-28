# Эталон поведения для рефакторинга GIFTED-004E (этап B0, Issue #48)

Эталон снят на main `ebf36575d7a609b7d6856326949df6fd5ba79ba1`. Он служит шлюзом для пакетов B1–B4: изоляция обучения, UI, RNG и ИИ без изменения поведения.

Игровой код, CI, зависимости и защищённая инфраструктура в B0 не менялись. Все инструменты только читают код.

## Состав шлюза
Пакет считается эквивалентным, только если выполнены **все** пункты.

1. **Контракт реализации Новичка** — `node scripts/check-novice-contract.cjs`. Нужен коммит `2923eaf`: `git fetch --no-tags --depth=1 origin 2923eafca24d8b23ec0b3de71306ca555919b782`.
   - Тело `noviceAiPlan` побайтно равно телу `aiPlan` в фиксированной базе `2923eaf`.
   - Ветка выбора legacy в `aiChoose` использует ровно два редуктора `2923eaf`.
   - Строки диспетчеризации, `AI_BASELINE` и регистрации закреплены и встречаются ровно по одному разу.
   - Это прямой контракт. Он ловит изменения, которые сыгранная выборка может не увидеть, — например константу `1.3 → 1.31`.
2. **Эталон поведения** — `node scripts/behaviour-baseline.cjs --check=docs/refactor-baseline/behaviour-baseline.json`. Около 20 мин в среде Builder (2 CPU). Параметры зафиксированы в файле эталона, другие значения отвергаются.

   | Компонент | Что сравнивается | Объём |
   |---|---|---|
   | `novice` | части контракта п. 1 | — |
   | `rules` | каждая карта × каждая локация: фиксированная позиция 5-го хода (Новичок против Новичка, seed из хеша `карта|локация`), карта стороны своей фракции на линии 0 с этой локацией, раскрытие настоящим `endTurn`; стол, суммы, руки, колоды, сброс, энергия, скидки, блокировки, журнал, состояние RNG | 36 × 9 = 324 позиции |
   | `tutorial` | «Первая битва» при обоих жребиях инициативы: `G`, `tutorialState`, DOM-заглушка и `localStorage` после каждого действия (выбор, розыгрыш, отмена, раскрытие, следующий урок) | 56 шагов |
   | `ui` | заставка, выбор героя, 4 вкладки библиотеки, меню, по одной партии за каждого героя до экрана результата; каждый элемент DOM (HTML, классы, видимость, стиль, атрибуты) и состояние RNG после каждого шага; часы детерминированы; выбор цели человека-Астромантки — первый вариант | 70 шагов |
   | `ai` | 6 пар (Н/Н, Т/Н, С/Н, Т/Т, С/Т, С/С) × 2 режима (pve и symmetric 004D) × 18 конфигураций × 10 партий: полная запись харнесса аттестации без времени решений и состояние RNG матча после партии; хеш по каждой конфигурации | 2 160 партий |
   | `balance` | симулятор баланса: Новичок против Новичка, 3 пары фракций, seed `20261118`, без времени и SHA источника | 3 000 партий |

3. **Существующие проверки** — все проверки из `docs/audit-004e/test-baseline.tsv`, включая обязательный CI, `check-ai-architecture 2923eaf`, мутационные наборы 16/16, 25/25, 14/14 (столько же мутантов, все обнаружены; якоря переносятся вместе с кодом без ослабления) и `attest-verify` на коммите данных 004D.
   - **`check-initiative-regression`** запускается с исторической базой:
     ```
     git fetch --no-tags --depth=1 origin ba06a99a68108cc9374d91b7f8b98dac5bfe58f1
     node scripts/check-initiative-regression.cjs ba06a99a68108cc9374d91b7f8b98dac5bfe58f1
     ```
     `ba06a99` — родитель изменения инициативы `2923eaf` (#39). Результат на `ebf3657`: PASS — 90/90 различий объяснены правилом инициативы, с прежним правилом 0/90. С `origin/main` по умолчанию сценарий не применим: изменение уже в main, тест даёт ожидаемый FAIL. В критерий этот вариант не входит.
   - `check-gadalka-regression` и `check-normal-regression` по умолчанию сравнивают с `origin/main`, то есть с состоянием до пакета, и остаются в критерии.
4. **Отрицательные контроли шлюза** — `node scripts/check-behaviour-controls.cjs`. Каждое из 14 малых изменений во временной копии должен быть обнаружен. Неизменённая копия на быстрых компонентах даёт IDENTICAL.

## Границы вывода
- **Только сыгранные сценарии.** Совпадение хешей доказывает одинаковое поведение в перечисленных позициях, партиях, шагах и seed — и только в них. Это не доказательство эквивалентности на всех возможных партиях.
- **Вне выборки** изменения ловят:
  - прямой контракт Новичка;
  - мутационные наборы ИИ и аттестации;
  - `check-ai-architecture`;
  - целевые проверки правил, обучения и UI.
- **Время решений** не входит в эталон. Производительность сравнивается отдельно: Node `attest-ai` и доверенный браузерный измеритель — для пакетов, которые трогают ИИ или загрузку.
- **Режим symmetric** — испытательный контур 004D. Он работает через два текстовых патча `attest-lib` (`PATCHES`). Если пакет меняет эти строки `game.js`, `attest-lib` откажет: патч должен совпасть ровно один раз. Якоря тогда переносятся в том же пакете, с отдельной проверкой.
- **Полный турнир 360 072 партий** не нужен для пакетов без изменения поведения: шлюз и проверки п. 3 заменяют его на уровне сыгранных сценариев. Турнир нужен для пакетов, которые меняют поведение, — например исправление #63, и только по отдельному согласованию.

## Обновление эталона
Эталон снимается заново только на main после принятого изменения поведения, отдельным согласованным шагом:
```
node scripts/behaviour-baseline.cjs --write=docs/refactor-baseline/behaviour-baseline.json --games=10 --balance=1000
```
Пакеты B1–B4 эталон не обновляют.

## Результаты B0 (main `ebf3657`, среда Builder: 2 CPU, Node 22)
| Проверка | Итог |
|---|---|
| `check-novice-contract` | PASS: тело `noviceAiPlan` = тело `aiPlan` в `2923eaf` (SHA-256 `292745d4…`) |
| `behaviour-baseline --write` (`--games=10 --balance=1000`) | итог `d4661097d0165d0caa0a994d4477be3b65f16c373a6a25977ad70370c0b57002`, 20 мин |
| `behaviour-baseline --check` того же кода | **IDENTICAL**: все 6 компонентов, 28 мин; повтор детерминирован |
| `check-behaviour-controls` | **PASS**: положительный контроль IDENTICAL, 14/14 изменений обнаружены (26 мин) |
| `check-initiative-regression ba06a99` | PASS: 90/90 различий объяснены инициативой, с прежним правилом 0/90 |

**Отрицательные контроли** — какой компонент первым увидел изменение. Остальные после первого различия не считались, так как режим `--fail-fast`.

| Контроль | Область | Ожидаемый компонент | Результат шлюза | с | Итог |
|---|---|---|---|---|---|
| positive (unchanged copy) | — | IDENTICAL expected | IDENTICAL | 1 | PASS |
| novice-constant | Новичок | novice | novice: contract broken (noviceAiPlan body differs from aiPlan at 2923eaf) (not computed after the first difference: rules, tutorial, ui, ai, balance) | 0 | PASS |
| novice-threshold | Новичок | novice | novice: contract broken (noviceAiPlan body differs from aiPlan at 2923eaf) (not computed after the first difference: rules, tutorial, ui, ai, balance) | 0 | PASS |
| tactician-constant | Тактик | ai | ai strategist-novice-pve: differs in configurations 4,7 (not computed after the first difference: balance) | 182 | PASS |
| tactician-uncertainty | Тактик (модель линии) | ai | ai tactician-novice-pve: differs in configurations 0,11,12,15,17 (not computed after the first difference: balance) | 9 | PASS |
| strategist-seed | Стратег | ai | ai strategist-novice-pve: differs in configurations 0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17 (not computed after the first difference: balance) | 177 | PASS |
| sandbox-rng | RNG песочницы ИИ | ai | ai tactician-novice-pve: differs in configurations 15 (not computed after the first difference: balance) | 9 | PASS |
| match-rng-draw | RNG матча (лишний вызов) | rules/ui/ai/balance | rules: ab025e6a890eb5f7 → 4737d61919232fc8 (not computed after the first difference: tutorial, ui, ai, balance) | 1 | PASS |
| initiative-tie | Правило инициативы | rules/tutorial/ui/ai/balance | rules: ab025e6a890eb5f7 → d8883414f6cb96f9 (not computed after the first difference: tutorial, ui, ai, balance) | 1 | PASS |
| card-cost | Правило карты (стоимость k1) | rules/ui/ai/balance | rules: ab025e6a890eb5f7 → 8b9697a63b729530 (not computed after the first difference: tutorial, ui, ai, balance) | 1 | PASS |
| location-effect | Правило локации (Кузня) | rules/ui/ai/balance | rules: ab025e6a890eb5f7 → 0b243cc4f7cd5233 (not computed after the first difference: tutorial, ui, ai, balance) | 1 | PASS |
| astro-target | Выбор цели (Астромантка) | rules/ui/ai/balance | balance: 14194abcb75b3700 → 5aea5b0ccf85b8c7 | 1180 | PASS |
| tutorial-text | Обучение (текст урока) | tutorial | tutorial: 657dd943eb12ccfb → 8e8e24f904fcc6bd (not computed after the first difference: ui, ai, balance) | 1 | PASS |
| ui-render | UI стола (разметка) | tutorial/ui | tutorial: 657dd943eb12ccfb → a89e66f47c66a9c4 (not computed after the first difference: ui, ai, balance) | 1 | PASS |
| ui-library | UI библиотеки (текст) | ui | ui: fd611c2766271aed → 5ce52779d5308f23 (not computed after the first difference: ai, balance) | 1 | PASS |
PASS: positive control identical, 14/14 changes detected

**Что показали контроли:**
- **Изменения Новичка видит только прямой контракт.** Изменение `1.3 → 1.31` в инспекции #64 не изменило ни одной из 216 партий с Новичком, а `check-ai-architecture` прошёл.
- **Изменение веса сильных карт в оценке Тактика** (`Math.min(power, 8 → 7)`) не проявилось в сериях Т/Н и Т/Т. Его увидела только серия С/Н, где Стратег использует оценку Тактика.
- **Изменение оценки цели Астромантки** (`laneTotal*.05 → .06`, режим блокировки) не изменило ни 324 позиции правил, ни шаги UI, ни 2 160 партий ИИ. Его увидел только симулятор баланса на 3 000 партиях.
- **Вывод:** обнаружение — свойство всего шлюза. Отдельный компонент не доказывает эквивалентность, и ни один пункт состава шлюза нельзя пропускать.
