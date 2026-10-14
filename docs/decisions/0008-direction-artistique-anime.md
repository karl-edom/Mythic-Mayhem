# 0008 — Direction artistique : anime cel-shading, modèles CC0

Date : 2026-10-14. Statut : **acceptée** (« style anime, rendu professionnel ; OK pour des modèles CC0 »). Les personnages sont désormais les avatars anime de la décision 0009 ; les chibis KayKit restent disponibles et fournissent les animations.

## Ce qui a été fait

| Domaine | Avant | Après |
| --- | --- | --- |
| Personnages | capsules colorées | modèles 3D animés **KayKit Adventurers** (Kay Lousberg, **CC0**) : chevalier, barbare, mage, voleur, voleur à capuche, avec leurs armes et accessoires |
| Animations | aucune | 44 animations partagées (attaques à une ou deux mains, sorts, garde, esquives, coups reçus, mise au sol et relevé, saut, ramassage, lancer, victoire), **calées sur la simulation** : l'image d'impact d'un coup tombe à l'instant exact où sa zone de frappe devient active |
| Rendu | couleurs plates | **cel-shading** (3 tons francs) et **contours encrés** sur tout ce qui est solide |
| Décor | blocs multicolores | ciel en dégradé, nuages, montagnes, lisière de forêt, sols peints (prairie, pavés), murailles crénelées, maisons à colombages, tonneaux cerclés, tours de guet |
| Effets | sphères | étoiles d'impact, traînées, onde de choc, **arc de lame** à chaque coup, lignes de vitesse, poussière, cercles magiques pour les zones, **arrêt sur image** à l'impact, **tremblement de caméra**, **ralenti** au K.-O. |
| Interface | panneaux arrondis | barres de vie inclinées avec trace des dégâts récents, chrono hexagonal, jauge de victoire en losanges, bannières « K.-O. ! », compteur de combo, police Bangers (titres) et Rajdhani (texte) |
| Menu | formulaire | écran de sélection posé sur la scène 3D : les deux combattants choisis se tiennent dans l'arène choisie |
| Caméra | parfois dans les murs | **bras de caméra** : un élément entre la tête du joueur et la caméra la rapproche ; ce qui cache encore le joueur devient transparent |

## Apparence d'un personnage (`character.json`)

```json
"look": { "model": "knight", "show": ["1H_Sword", "Knight_Cape"], "tint": "#ffe0e0" }
```

- `model` : `knight`, `barbarian`, `mage`, `rogue`, `rogue_hooded` ;
- `show` : accessoires à afficher (noms dans `docs/design/visuels.md`) ; le style d'attaque (une main, deux mains, deux armes, mains nues) en découle ;
- `tint` : teinte multipliée sur le corps.

Sans `look`, le client choisit d'après l'archétype du kit. Un pack fan peut donc habiller Kenshin ou Naruto avec ces modèles en attendant des modèles dédiés (qui resteraient dans `packs/local/`).

## Licences et coûts

- **Modèles** : KayKit Adventurers 1.0, CC0 1.0 (domaine public, aucune attribution exigée ; on crédite quand même). Licence copiée dans `public/models/kaykit/LICENSE.txt`. Ce ne sont pas des personnages sous licence : ils sont commitables.
- **Poids** : 2,6 Mo pour 5 modèles et 44 animations (3,6 Mo par modèle à l'origine ; animations partagées, géométrie quantifiée, aucun décodeur nécessaire).
- **Outils de construction** (dev seulement, MIT) : `@gltf-transform/core`, `functions`, `extensions`, `meshoptimizer`. Script : `npm run build:models`.
- **Polices** : Google Fonts (Bangers, Rajdhani — licence OFL), chargées en ligne, avec repli système.

## Limites

- Tous les personnages partagent 5 silhouettes : les univers fan auront besoin de modèles dédiés pour être reconnaissables.
- Pas de post-traitement (bloom) : les contours encrés et le bloom ne se combinent pas simplement ; les lueurs sont faites en additif.
- Performances non mesurées sur machine modeste (ombres 2048², contours = 2 passes de rendu).
