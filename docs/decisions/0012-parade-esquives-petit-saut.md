# 0012 — Parade, usure des esquives, petit saut ; traînées d'arme et course réparée

Date : 2026-10-15. Statut : **acceptée** (« ajoute la parade, l'usure des esquives et le petit saut. Les combats dans Smash étaient vraiment cool, s'en rapprocher devrait donner quelque chose de bon. » ; « les arcs de cercle pour voir les attaques ne sont pas très lisibles » ; « les déplacements des personnages sont hideux »).

Chiffres repris des relevés de `docs/research/smash-ultimate-donnees.md`. Smash tourne à 60 images/s comme notre simulation.

## Mécaniques (contrat de combat commun)

| Règle | Valeur | Contre-jeu | Indicateur visuel |
| --- | --- | --- | --- |
| **Parade** | relâcher le bouclier (tenu ≥ 3 images) dans les 5 images avant l'impact : coup annulé, défenseur libre aussitôt, attaquant au corps à corps étourdi 0,4 s | varier le rythme, feinter, frapper à distance | éclat blanc-cyan, anneau, « PARADE ! » |
| **Retrait du bouclier** | 11 images sans attaquer, sauf en sautant hors du bouclier | — | pose de garde qui se relâche |
| **Usure des esquives** | +1 niveau par esquive (5 au plus), −1 niveau toutes les 2 s ; par niveau : durée +12 %, invulnérabilité −15 %, distance −8 % (remplace l'attente fixe de 0,3 s) | punir l'esquive de trop | pastilles « esquive ●●○○○ » dans la barre |
| **Petit saut** | élan de 3 images ; bouton relâché pendant l'élan = 71 % de la vitesse (environ la moitié de la hauteur) | — | animation d'élan |

Le bot fait des petits sauts au contact (pour un coup aérien rapide) et des sauts complets pour franchir. Le retrait du bouclier vaut aussi pour lui. Il ne pare pas exprès, mais peut parer par hasard.

Équilibre : l'épreuve, relancée, place les six personnages entre 49 et 50 %.

Tests (`tests/brawl.test.ts`) :
- usure des esquives : durées croissantes, invulnérabilité décroissante, dissipation ;
- petit saut entre 40 et 60 % de la hauteur du saut complet ;
- parade : aucun dégât, bouclier intact, attaquant étourdi ;
- relâcher trop tôt : temps mort, et le coup passe ;
- saut hors du bouclier sans temps mort.

## Lisibilité des attaques

Les **arcs de cercle génériques et la sphère d'élan sont retirés**. À la place, une **traînée suit la lame** (de la garde à la pointe), ou l'avant-bras à mains nues. Elle est visible de 0,12 s avant que le coup devienne actif jusqu'à 0,08 s après, ainsi que pendant les spéciales et les ruées. Couleur : celle du personnage, orange pour les coups lourds et les spéciales, cœur blanc. On voit ainsi exactement où passe le coup, à l'image près où il touche (`src/client/trail.ts`). Les modèles chibi sans repères d'arme gardent l'ancien arc.

## Déplacements des avatars

Défauts constatés : bassin qui s'effondre en pleine course, foulées démesurées, pieds qui glissent. Ils viennent des cycles chibi transférés sur de longues jambes, puis amplifiés.

- **Mouvement vertical du bassin réduit** : × 0,3 pour la course, × 0,6 pour le reste.
- **Cycles de déplacement atténués autour de leur pose moyenne** (× 0,75), au lieu d'être amplifiés.
- **Vitesse de lecture calée sur la foulée mesurée** de chaque avatar : on mesure le balayage du pied sur un cycle, donc les pieds suivent le sol.

## Caméra

- Un élément de décor qui contient la caméra, ou qui est collé à elle (feuillage d'arbre compris), est **masqué entièrement**. Avant, il restait un voile de plusieurs couches semi-transparentes.

## Limites

- Les traînées sont courtes, parce que les gestes d'origine le sont. De vraies animations de combat, plus amples, les rendront spectaculaires.
- Pas encore d'esquive aérienne (une par saut dans Smash) ni de chute rapide.
- Le bot ne pare pas volontairement.
