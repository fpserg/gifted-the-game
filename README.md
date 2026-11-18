# GIFTED: The Game — Битва куполов

Карточная игра для экосистемы токена GIFTED (TON).

**Состояние:** браузерный прототип переведён на отдельные HTML, CSS и JavaScript-файлы; новые иллюстрации включены в проект. Игровая механика и параметры карт не менялись.

## Структура
- [index.html](index.html) — экран игры.
- [styles.css](styles.css) — стили, включая мобильную раскладку и поддержку безопасных отступов iPhone.
- [game.js](game.js) — данные карт, правила и логика игры.
- [assets/cards](assets/cards) — 36 иллюстраций карт в WebP.
- [assets/locations](assets/locations) — 9 иллюстраций локаций в WebP.
- [assets/ASSETS_MANIFEST.json](assets/ASSETS_MANIFEST.json) — исходные имена и контрольные суммы изображений.
- [docs/gifted-brief.md](docs/gifted-brief.md) — принятые решения и ограничения.
- [docs/gifted-cards.md](docs/gifted-cards.md) — карты и локации.
- [docs/art-prompts.md](docs/art-prompts.md) — промпты новых иллюстраций.
- [docs/WORK_HANDOFF.md](docs/WORK_HANDOFF.md) — порядок передачи разработки.
- [legacy/gifted-domes-game-original.html](legacy/gifted-domes-game-original.html) — исходная самодостаточная версия.

## Принципы
Не менять токеномику GIFTED; награды — из выручки игры; без pay-to-win. Изменения механик согласовывать с геймдизайнером. После изменения карт обновлять `docs/gifted-cards.md`. Разработка ведётся через ветки и PR.

Ожидаемый адрес GitHub Pages: https://fpserg.github.io/gifted-the-game/ — публикация этой версии ещё не проверена.
