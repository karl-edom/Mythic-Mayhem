# 0031 — Effets signature des techniques

Date : 2026-10-21. Statut : **acceptée** (ordre fixé par le porteur de projet : Naruto, Kenshin, Sasuke, les Tortues ninja, Saitō, Sanosuke, Tails, Metal Sonic).

> « On peut travailler le design des attaques de chaque personnage pour faire des choses plus professionnelles ? »

## Le mécanisme

Un nouveau champ de pack, `moves.<id>.fx`, nomme l'**effet signature** d'une technique dans une liste fermée (`SPECIAL_FX` dans `src/brawl/character.ts`). Le code des effets est dans `src/client/specialFx.ts`. Un pack ne fait que choisir un nom : il n'apporte jamais de code. Toute autre valeur est ignorée (test dans `tests/brawl.test.ts`). C'est de l'affichage seul : la simulation, le budget de puissance et le contrat de combat ne changent pas.

Un effet peut se déclencher à trois moments : au lancement de la technique, quand elle touche, et quand le contre se déclenche.

| Effet | Moment | Ce qu'on voit | Utilisé par |
| --- | --- | --- | --- |
| `spiral` | touche | une boule de vent bleue qui tourne et s'enfonce dans la cible, des anneaux, des traînées de vent, puis l'onde au sol | Naruto, Rasengan |
| `substitution` | contre | un nuage de fumée blanche là où le coup est tombé, une bûche à sa place qui bascule puis s'efface ; une bouffée de fumée là où il réapparaît | Naruto, Kawarimi |
| `clones` | lancement et touche | deux clones sortent de la fumée à ses côtés au départ ; à l'impact, quatre clones encerclent la cible puis disparaissent en fumée | Naruto, Uzumaki Rendan |
| `crescent` | touche | un grand croissant de lame tombe à travers la cible, le sol éclate (débris, poussière) | Kenshin, Ryū Tsui Sen |
| `whirl` | contre | un tour complet de lame à hauteur de taille, un anneau de lumière qui s'ouvre | Kenshin, Ryū Kan Sen |

## Pour tous

- **Images rémanentes** : chaque ruée et chaque plongée laisse derrière le personnage des copies teintées de sa couleur principale, qui s'effacent. C'est l'indicateur visuel de la ruée, qui aide aussi à lire la trajectoire d'une plongée.
- Quand une technique a son propre impact (effet signature ou entailles), l'impact générique reste petit, pour ne pas noyer l'écran sous le blanc.
- La traînée de fumée d'un combattant projeté est plus fine et plus transparente : on ne perd plus de vue la cible.
- **Bogue corrigé** : le reflet de préparation des techniques se relançait à chaque image pendant l'arrêt sur coup, si bien que des reflets blancs s'empilaient sur l'attaquant. Il ne part plus qu'une fois, pendant la mise en garde.

## Contre-jeu et indicateurs

Aucune capacité nouvelle, donc aucun contre-jeu nouveau. Les effets rendent les techniques existantes plus lisibles : la fumée et la bûche montrent qu'un contre a eu lieu et où l'attaquant s'est fait prendre, et les images rémanentes montrent d'où vient une ruée.

## Coût

Les clones sont des copies du modèle qui partagent sa géométrie et ses matières : il y en a au plus quatre, pendant moins d'une demi-seconde. Les images rémanentes sont six copies par personnage, créées à la première ruée puis réutilisées, avec une matière propre à chacune. Vérification faite seulement sous rendu logiciel.
