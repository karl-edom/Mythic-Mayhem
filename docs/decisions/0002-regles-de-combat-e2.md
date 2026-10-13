# 0002 — Règles de combat introduites pendant E2

Date : 2026-10-13. Statut : **proposée**. Ces règles sont nées des mesures de E2 et restent à valider manette en main (expérience E1).

## Contexte

Les premières simulations basculaient en tout-ou-rien selon le comportement des bots :

- **Tireur qui fuit en tirant.** S'il peut tirer en reculant sans aucun coût, le corps-à-corps ne gagne jamais (99 % de défaites).
- **Corps-à-corps qui ne s'arrête jamais.** S'il poursuit sans s'arrêter pour frapper, c'est l'inverse (100 % de défaites pour le tireur).

## Décisions

1. **L'attaque de base est automatique mais ne part qu'à l'arrêt.** Se déplacer, c'est renoncer à attaquer. Pousser contre un mur ne compte pas comme un déplacement.
2. **Après chaque attaque de base, l'unité reste immobile 0,25 s** (`basicAttackLock`, valeur commune à tous). C'est le prix du « tir en reculant », et ce qui laisse sa chance au corps-à-corps.
3. **Un dash peut ne porter aucun effet.** C'est alors un outil de mobilité pure, une fuite ou un repositionnement, payé par sa distance.
4. **Budget : une fourchette de 90 à 100 points** plutôt qu'une valeur exacte, pour laisser de la souplesse aux concepteurs.
5. **Le budget est calibré par simulation, pas à la main.** Des centaines de kits aléatoires au même budget s'affrontent. Une régression mesure ce que vaut réellement chaque catégorie de points, et les coefficients de `data/balance/costs.json` sont ajustés en conséquence (`tools/e2-field.ts`).

## Contre-jeu et lisibilité

- **Règles 1 et 2.** Un tireur qui tire est immobile un court instant, ce qui crée une fenêtre pour l'atteindre. Côté affichage (E1), il faudra montrer ce temps d'immobilité par une courte animation de recul de l'arme.
- **Règle 3.** Un dash est toujours visible, puisque la trajectoire se voit pendant le déplacement. Aucun indicateur supplémentaire n'est requis.
