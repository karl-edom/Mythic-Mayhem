# 0006 — Arènes : un chantier à part entière

Date : 2026-10-14. Statut : **acceptée pour A1 et A2** (faites) ; étapes suivantes **proposées**. Règle de K.-O. tranchée : on **garde la barre de vie** (J-Stars), pas l'éjection façon Smash.

## Demande du porteur de projet

> « Dans le jeu de base, il y a des décors. L'idée, c'est d'avoir un J-Stars qui est finalement une version 3D d'un Super Smash Bros. Pouvoir s'éclipser dans un coin de la map quelques secondes fait partie du jeu. Donc il faut des maps plus grandes, avec des éléments cassables, jetables, lançables et qui infligent des dégâts. »

## Décision

Les arènes deviennent un **chantier dédié**, au même titre que les personnages : des **données validées** (`data/arenas/*.json`), construites à partir d'un **catalogue d'éléments** commun (`data/arenas/props.json`). Ajouter une carte = écrire un fichier, sans code. Le validateur refuse une carte mal formée (élément inconnu, élément qui dépasse des murs, point d'apparition encombré).

Le chantier avance par étapes courtes et jouables :

| Étape | Contenu | Statut |
| --- | --- | --- |
| **A1** | cartes plus grandes (56 × 40 m et 62 × 44 m, contre un disque de 32 m), obstacles solides, éléments cassables, on peut monter sur les petits, on peut se cacher | **faite** |
| **A2** | **ramasser et lancer** une caisse ou un tonneau (touche F) ; **projeter l'adversaire contre un mur** ou un élément inflige des dégâts en plus | **faite** |
| A3 | éléments **dangereux** : tonneau explosif (dégâts de zone quand il casse), objets qui tombent | proposée |
| A4 | **hauteur** : toits et plateformes où grimper, plusieurs niveaux | proposée |
| A5 | **éditeur de cartes** (d'abord le format de données documenté, puis un éditeur visuel) | proposée |

## Règles introduites par A1, avec contre-jeu et indicateur visuel

| Règle | Contre-jeu | Indicateur visuel |
| --- | --- | --- |
| Les éléments hauts (≥ 1,6 m) **cachent** : un bot qui ne te voit plus suit ta dernière position 4 s, puis fouille la carte | les spéciales de **zone** se posent à travers les murs ; à moins de 2,5 m on se sent toujours ; celui qui se cache n'attaque pas | étiquette « Hors de vue » dans ton panneau |
| Les éléments **arrêtent les projectiles** | contourner, ou casser l'élément | — (l'impact se voit) |
| Les éléments marqués cassables **perdent des PV** sous les coups, projectiles et zones, puis disparaissent | — | ils foncent à mesure qu'ils s'abîment, puis éclatent en débris |
| On peut **sauter sur** les éléments bas (caisse 1,1 m, tonneau 1,2 m, barrière 1 m) | frapper : celui qui est dessus tombe si l'élément casse | ombre portée sur le dessus |
| Un recul qui envoie contre un élément s'y arrête net | — | — |

S'éclipser sert aujourd'hui à **recharger son énergie** (touche E) à l'abri. La caméra rend transparents les éléments qui cachent ton propre personnage, jamais ceux qui cachent l'adversaire, pour garder l'intérêt de se cacher en multijoueur.

## Règles introduites par A2, avec contre-jeu et indicateur visuel

| Règle | Contre-jeu | Indicateur visuel |
| --- | --- | --- |
| **Ramasser** (F, à moins de 0,9 m d'une caisse ou d'un tonneau) : levée de 0,35 s, vulnérable | frapper pendant la levée : l'objet se brise | l'objet monte au-dessus de la tête ; invite « F · ramasser » |
| **Porter** : vitesse × 0,75, ni garde, ni esquive, ni autre attaque ; frappé, on lâche l'objet qui se brise | attaquer le porteur | l'objet au-dessus de la tête ; invite « F · lancer » |
| **Lancer** (F ou J) : démarrage 0,25 s, l'objet file vers la cible (20 m/s, 22 m) ; caisse 90 dégâts, tonneau 70 ; se brise à l'impact | garde (10 % des dégâts), esquive, se mettre derrière un obstacle | l'objet lui-même, qui tournoie |
| **Choc contre un mur** : projeté à plus de 7 m/s contre un mur ou un élément, on prend 60 à 90 dégâts en plus ; un élément cassable heurté encaisse le double | ne pas se battre dos au mur | bannière « Contre le mur ! » ; le personnage s'arrête net |

Les objets à lancer sont décrits dans le catalogue (`throwable` dans `data/arenas/props.json`) : en ajouter un se fait sans code. Ils font partie du décor, pas du kit : ils ne comptent pas dans le budget des personnages.

Mesure (bots, 20 duels par carte) : environ 4 lancers, 5 à 6 chocs contre un mur et 8 objets cassés par match.
