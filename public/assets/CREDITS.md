# Crédits des ressources

Toutes les ressources de ce dossier sont dans le **domaine public (CC0 1.0)**. Elles sont autorisées dans le dépôt depuis la décision du 2026-10-20 (voir `CLAUDE.md`).

## Textures photo du village japonais

Source : [Poly Haven](https://polyhaven.com), licence [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) (aucune attribution exigée ; on la donne quand même). Téléchargées le 2026-10-20 (écorces : le même jour, pour les arbres du village).

Chaque dossier contient trois images WebP : `diffuse.webp` (couleur, sRGB), `normal.webp` (relief, convention OpenGL, linéaire) et `rough.webp` (rugosité, linéaire, en niveaux de gris). La normale et la rugosité font 1024 px.

**Modifications** : la couleur moyenne de chaque diffuse a été ramenée à celle de la surface peinte qu'elle remplace, pour que les teintes de chaque élément restent les mêmes. La rugosité est ramenée à une moyenne de 200/255. Conversion faite avec `sharp`, déjà présent dans les dépendances de développement.

| Dossier | Usage | Texture Poly Haven | Auteurs | Licence | Taille et traitement | Diffuse | Normale | Rugosité | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `textures/plaster/` | Enduit des murs (étage, pignons) | [Plaster Grey 04](https://polyhaven.com/a/plaster_grey_04) | Rob Tuytel | CC0 1.0 | 2048 px ; diffuse calibrée, contraste réduit à 55 % | 638 Ko | 366 Ko | 110 Ko | 1114 Ko |
| `textures/boards/` | Bardage sombre (bas des murs) | [Black Painted Planks](https://polyhaven.com/a/black_painted_planks) | Dimitrios Savva | CC0 1.0 | 1024 px ; diffuse passée en niveaux de gris puis teintée | 144 Ko | 120 Ko | 13 Ko | 277 Ko |
| `textures/timber/` | Bois des poteaux, poutres, garde-corps | [Wood Table Worn](https://polyhaven.com/a/wood_table_worn) | Dimitrios Savva, Rico Cilliers | CC0 1.0 | 1024 px ; diffuse calibrée | 227 Ko | 152 Ko | 148 Ko | 527 Ko |
| `textures/paving/` | Pavés de la rue, dessus de la terrasse | [Rock Tile Floor](https://polyhaven.com/a/rock_tile_floor) | Charlotte Baglioni | CC0 1.0 | 2048 px ; diffuse calibrée | 1532 Ko | 339 Ko | 93 Ko | 1964 Ko |
| `textures/ashlar/` | Pierre (murs de la terrasse, escaliers du sanctuaire, puits) | [Japanese Stone Wall](https://polyhaven.com/a/japanese_stone_wall) | Charlotte Baglioni, Dario Barresi, Rico Cilliers | CC0 1.0 | 1024 px ; diffuse calibrée | 386 Ko | 346 Ko | 96 Ko | 828 Ko |
| `textures/planks/` | Planchers, marches en bois | [Hinoki Planks](https://polyhaven.com/a/hinoki_planks) | Charlotte Baglioni | CC0 1.0 | 1024 px ; diffuse calibrée | 62 Ko | 34 Ko | 4 Ko | 100 Ko |
| `textures/dirt/` | Terre (sol) | [Dirt Floor](https://polyhaven.com/a/dirt_floor) | eye-candy.xyz | CC0 1.0 | 1024 px ; diffuse calibrée | 269 Ko | 412 Ko | 8 Ko | 689 Ko |
| `textures/gravel/` | Gravier (sol du sanctuaire) | [Bicolour Gravel](https://polyhaven.com/a/bicolour_gravel) | Dimitrios Savva | CC0 1.0 | 1024 px ; diffuse calibrée | 499 Ko | 541 Ko | 241 Ko | 1282 Ko |
| `textures/bark-sakura/` | Écorce des cerisiers | [Chinese Hackberry Bark](https://polyhaven.com/a/chinese_hackberry_bark) | Charlotte Baglioni | CC0 1.0 | 1024 px ; diffuse passée en niveaux de gris puis teintée | 96 Ko | 208 Ko | 2 Ko | 306 Ko |
| `textures/bark-pine/` | Écorce des pins | [Pine Bark](https://polyhaven.com/a/pine_bark) | Dimitrios Savva | CC0 1.0 | 1024 px ; diffuse calibrée | 111 Ko | 397 Ko | 58 Ko | 566 Ko |

**Poids total : 7,5 Mo** (7835950 octets).
