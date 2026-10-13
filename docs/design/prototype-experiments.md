# Plan d'expérimentation (3 expériences maximum)

Coût relatif : S < M < L. Ordre conseillé : E2 → E1 → E3. E2 valide l'idée centrale du projet (des personnages hétérogènes dans un même cadre) et produit le socle dont E1 et E3 ont besoin.

## E2 — Personnages hétérogènes dans un même cadre de règles (coût M)

- **Hypothèse** : un catalogue d'environ 10 primitives de capacité (projectile, dash, zone, bouclier, soin, ralentissement, étourdissement court, poussée…) avec un budget de points suffit pour exprimer des personnages très différents. Le budget suffit aussi pour que ces personnages restent dans un même ordre de puissance.
- **Contenu** : une simulation sans rendu, 3 kits originaux (Avant-garde, Tireur, Soutien) écrits en données, un validateur de budget et des duels automatiques bot contre bot (des milliers de combats simulés).
- **Réussite** :
  1. aucun duel 1v1 ne dépasse 65 % de victoires sur 1 000 combats ;
  2. un 4e personnage s'ajoute par un seul fichier de données, sans modifier le moteur ;
  3. un kit hors budget est refusé avec un message clair.

## E1 — Lisibilité d'un combat chargé (coût M)

- **Hypothèse** : avec une hiérarchie visuelle stricte, un joueur identifie un danger avant l'impact même en 3v3 avec toutes les capacités actives. Les règles : télégraphes ennemis en rouge avec motif hachuré, alliés en bleu plein, particules plafonnées, équipes distinguées aussi par la forme du contour et pas seulement par la couleur.
- **Contenu** : rendu de E2, 6 personnages contrôlés par des bots, un joueur humain.
- **Réussite** :
  1. sur 5 testeurs, au moins 4 esquivent une capacité télégraphiée dès la première partie ;
  2. le jeu tient 60 images/s dans un navigateur standard ;
  3. un mode « effets réduits » existe.

## E3 — Intérêt tactique de l'objectif (coût L)

- **Hypothèse** : un objectif de contrôle de zone produit des combats groupés et des décisions de rotation, et pas un simple massacre. Le principe : des zones qui s'activent à tour de rôle, et il faut les tenir pour marquer.
- **Contenu** : arène compacte, 2 à 3 zones, score, fin de partie et relance rapide.
- **Réussite** :
  1. durée médiane d'une partie entre 6 et 10 min ;
  2. au moins 60 % des éliminations ont lieu près d'un objectif ;
  3. les testeurs savent expliquer pourquoi ils ont gagné ou perdu.
