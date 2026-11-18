# Иллюстрации игры

В репозитории находятся все 45 новых иллюстраций: 36 карт и 9 локаций. Файлы оптимизированы в WebP, имена приведены к нижнему регистру и совпадают с ключами карт и локаций.

- `cards/e1.webp`—`cards/e12.webp`, `cards/a1.webp`—`cards/a12.webp`, `cards/k1.webp`—`cards/k12.webp` — карты трёх фракций.
- `locations/loc_forge.webp`, `loc_waste.webp`, `loc_library.webp`, `loc_tower.webp`, `loc_well.webp`, `loc_fog.webp`, `loc_treasury.webp`, `loc_arena.webp`, `loc_observatory.webp` — локации.
- `ASSETS_MANIFEST.json` содержит исходный путь каждого файла, размер и SHA-256.

Игровой интерфейс использует эти файлы напрямую из папок `assets/cards` и `assets/locations`.
