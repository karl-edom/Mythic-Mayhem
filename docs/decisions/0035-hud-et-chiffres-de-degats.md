# 0035 — Barres de vie et d'énergie, chiffres de dégâts

Date : 2026-10-21. Statut : **acceptée** (« en priorité les chiffres de dégâts, et les barres de vie et énergie qui sont trop peu stylisées ; j'aime bien la D.A. de l'écran de chargement »).

## Le panneau de chaque combattant

Il reprend la direction artistique de l'écran de chargement : fonds prune sombres, contours épais à l'encre, formes penchées, lumière or vers orange, police d'affichage cernée d'encre.

- **Portrait** du personnage dans un cadre penché, liseré d'or, sur la couleur du joueur.
- **Nom** en or, cerné d'encre, avec une lueur chaude.
- **Barre de vie** épaisse et penchée, crantée en dix. Elle est verte, puis jaune sous la moitié, puis rouge et pulsante sous le quart, avec un reflet sur le dessus. Le chiffre de vie est écrit dedans. Une traîne rose montre ce qu'on vient de perdre. Le panneau tressaute à chaque coup reçu.
- **Barre d'énergie** au dégradé or vers orange de l'écran de chargement, parcourue de lignes lumineuses, avec des encoches au coût de chaque technique et le chiffre d'énergie. Elle s'illumine quand la technique la plus chère est disponible.
- **Techniques** sous leur vrai nom, avec la touche, l'icône de leur type et leur coût. Une technique disponible est cerclée d'or ; sinon elle est terne.

## Chiffres de dégâts

Au-dessus de la tête de la cible, chaque coup qui touche affiche ses dégâts. Le chiffre surgit en grand, rétrécit, monte et s'efface en moins d'une seconde.

- Coups légers en blanc, coups forts (et mises au sol, projections, chocs contre un mur) en or, techniques à la couleur de l'attaquant.
- Les coups qui se suivent à moins d'une demi-seconde sur la même cible s'additionnent dans le même chiffre, qui surgit de nouveau : un enchaînement se lit d'un coup d'œil.
- Les dégâts bloqués s'affichent petits et gris, avec un bouclier.
- La taille grandit avec les dégâts.

C'est de l'affichage seul, calculé à partir des événements de la simulation (`hit`, `block`, `slam`) : le combat ne change pas.

## Limites

- Le chiffre est placé à l'écran au moment du coup et monte en ligne droite. Il ne suit pas la cible si la caméra bouge beaucoup.
- Les portraits sont ceux de l'écran de sélection (rendus en 3D) : ils apparaissent quand ils sont prêts.
