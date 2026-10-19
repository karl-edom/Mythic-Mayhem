# 0024 — Sortir d'un combo comme dans Smash ; premiers personnages retirés

Date : 2026-10-19. Statut : **acceptée**.

> « Corriger le gameplay : quand on est attaqué on est bloqué, on ne peut pas esquiver ou parer un combo. Je ne sais pas si c'est un comportement voulu (compare avec les autres jeux, surtout Smash). »

> « Retire les premiers personnages random que tu avais faits et qu'on n'utilisera pas. »

## Le constat, mesuré

Une expérience rejoue des enchaînements de coups légers sur un défenseur qui veut esquiver. Elle sépare deux cas : un défenseur qui martèle la touche, et un joueur réel qui **appuie une seule fois, 0,2 s après chaque coup reçu**.

| Défenseur | Avant | Après |
| --- | --- | --- |
| martèle l'esquive | sort après 1 à 3 coups | idem |
| **appuie une fois par coup reçu** | **jamais libre en 6 s : 7 à 11 coups encaissés d'affilée** | sort après 1 coup (petits coups isolés), 2 (deux coups puis on recommence) ou 3 (le combo complet) |

Ce n'était donc pas voulu. Deux défauts se cumulaient :

1. **Une pression faite pendant l'étourdissement était perdue.** Seule l'attaque légère avait un tampon d'entrée. L'esquive, le saut et les techniques demandaient d'appuyer exactement à la première image libre.
2. **Les petits coups étourdissaient trop longtemps** par rapport au temps de récupération de l'attaquant. Dans Smash, l'étourdissement découle du recul (0,4 image par unité de recul) : un petit coup étourdit très peu. Chez nous, chaque coup fixe sa durée. Un coup léger étourdissait environ 0,39 s alors que l'attaquant pouvait recommencer en environ 0,44 s : il ne restait que 3 images pour réagir. S'y ajoutait 1,15 s au sol après l'éjection finale, sans aucune action possible.

## Ce que fait Smash, ce que nous reprenons

| Mécanique de Smash (Ultimate) | Chez nous (contrat de combat commun) | Contre-jeu | Indicateur |
| --- | --- | --- | --- |
| **Tampon d'entrée** (10 images) | Une esquive, un saut ou une technique appuyés pendant l'étourdissement ou le gel de l'impact sont **gardés jusqu'à la fin de l'étourdissement, plus 0,2 s**, et partent à la première image libre. La sortie d'un étourdissement ne perd plus d'image. | l'attaquant doit laisser un trou plus court, ou attraper l'esquive | le personnage esquive dès qu'il est libre |
| L'étourdissement découle du recul : les petits coups enchaînent peu | **Usure du combo** : chaque coup reçu alors qu'on est encore étourdi étourdit 15 % de moins que le précédent (au moins la moitié). Les combos de base (1-2-3) restent garantis ; les boucles s'ouvrent. | varier, finir par l'éjection | — |
| **Influence directionnelle** (DI) : jusqu'à 18° | Tenir le stick **en travers** de l'éjection, à la fin du gel de l'impact, la dévie de 18° au plus. Le tenir dans l'axe ne change rien. | lire la DI de l'adversaire pour la poursuite | la trajectoire d'éjection |
| **Récupération au sol** (*tech*) : bouclier 20 images avant de toucher le sol, invulnérable 20 images, une tentative toutes les 40 images | Garde ou esquive appuyée **0,33 s avant de toucher le sol** après une éjection : on se relève aussitôt, **invulnérable 0,33 s**. Avec une direction : **roulade** dans cette direction. Une tentative toutes les 0,67 s (marteler ne marche pas). | anticiper la roulade, attendre la fin de l'invulnérabilité | anneau blanc au sol, petit nuage de poussière |

Le **dégagement** existant reste la sortie payante (50 d'énergie, à tout moment sous les coups).

Les **bots** utilisent les mêmes outils : ils tiennent le stick en travers quand ils sont touchés, et tentent la récupération au sol selon leurs réflexes.

### Tests (`tests/brawl.test.ts`)

- une esquive pressée tôt pendant l'étourdissement part à la première image libre ;
- chaque coup reçu encore étourdi étourdit moins (facteur 0,85) ;
- la DI dévie l'éjection de 18° en travers, de 0° dans l'axe ;
- garde juste avant l'atterrissage : on se relève aussitôt, invulnérable, et un événement `tech` est émis ; sans appui, on reste au sol.

## Premiers personnages retirés

- Les six premiers personnages originaux (Akane, Hikaru, Kaminari, Rōnin, Rubis, Shino) sont **supprimés** (`data/fighters/`), avec leurs modèles : les avatars VRoid (`public/models/anime/`, 8,9 Mo) et les personnages KayKit.
- Le jeu ne charge plus que les packs de `packs/local/`.
- **Reste** `public/models/kaykit/animations.glb` : ses clips (chute, victoire, relevé…) sont encore transférés sur les modèles faits en code pour les états qu'ils n'animent pas eux-mêmes.
- Les modèles disponibles pour un pack sont maintenant `swordsman` (humain à garde-robe, animaux compris) et `turtle`. Un pack sans `look` reçoit un humain habillé selon son archétype.
- Les tests qui s'appuyaient sur ces personnages utilisent des kits générés au budget visé. Le test « les personnages d'origine sont équilibrés » disparaît avec eux. L'outil `--tune` reste la mesure d'équilibre des packs.

## Limites

- Pas encore de DI « fine » pendant le gel de l'impact (*SDI* de Smash) ni de récupération contre un mur.
- L'usure du combo est une règle à nous : Smash obtient le même effet par la formule de l'étourdissement.
