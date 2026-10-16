# 0006 — Arènes : un chantier à part entière

Date : 2026-10-14. Statut : **A1, A2 et A4 faites** ; A3 (objets dangereux) **écartée** par le porteur de projet ; prochaines étapes : refonte visuelle, puis A5. Règle de K.-O. tranchée : on **garde la barre de vie** (J-Stars), pas l'éjection façon Smash.

## Demande du porteur de projet

> « Dans le jeu de base, il y a des décors. L'idée, c'est d'avoir un J-Stars qui est finalement une version 3D d'un Super Smash Bros. Pouvoir s'éclipser dans un coin de la map quelques secondes fait partie du jeu. Donc il faut des maps plus grandes, avec des éléments cassables, jetables, lançables et qui infligent des dégâts. »

## Décision

Les arènes deviennent un **chantier dédié**, au même titre que les personnages : des **données validées** (`data/arenas/*.json`), construites à partir d'un **catalogue d'éléments** commun (`data/arenas/props.json`). Ajouter une carte = écrire un fichier, sans code. Le validateur refuse une carte mal formée (élément inconnu, élément qui dépasse des murs, point d'apparition encombré).

Le chantier avance par étapes courtes et jouables :

| Étape | Contenu | Statut |
| --- | --- | --- |
| **A1** | cartes plus grandes (56 × 40 m et 62 × 44 m, contre un disque de 32 m), obstacles solides, éléments cassables, on peut monter sur les petits, on peut se cacher | **faite** |
| **A2** | **ramasser et lancer** une caisse ou un tonneau (touche F) ; **projeter l'adversaire contre un mur** ou un élément inflige des dégâts en plus | **faite** |
| A3 | éléments **dangereux** : tonneau explosif (dégâts de zone quand il casse), objets qui tombent | **écartée** |
| **A4** | **hauteur** : plateformes, terrasses et tours, reliées par des rampes et des escaliers | **faite** |
| A5 | **éditeur de cartes** (d'abord le format de données documenté, puis un éditeur visuel) | proposée |

## Règles introduites par A1, avec contre-jeu et indicateur visuel

| Règle | Contre-jeu | Indicateur visuel |
| --- | --- | --- |
| Les éléments hauts (≥ 1,6 m) **cachent** : un bot qui ne te voit plus suit ta dernière position 4 s, puis fouille la carte | les spéciales de **zone** se posent à travers les murs ; à moins de 2,5 m on se sent toujours ; celui qui se cache n'attaque pas | étiquette « Hors de vue » dans ton panneau |
| Les éléments **arrêtent les projectiles** | contourner, ou casser l'élément | — (l'impact se voit) |
| **Tout est cassable** (mise à jour du 2026-10-16) : chaque élément du catalogue a des PV (tonneau 40, barrière 50, caisse 60, arbre 220, escalier 300 à 400, muret 300, colonne 350, rampe 400, rocher et terrasse 500, plateforme et tour de guet 600, maison 800). Il en perd sous les coups, projectiles et zones, puis disparaissent ; celui qui est dessus tombe | se mettre à l'abri derrière un élément solide coûte du temps à l'adversaire ; casser la tour de celui qui s'y est perché | l'élément tremble à chaque coup (poussière au-delà de 20 dégâts). **Deux paliers d'usure** (mise à jour du 2026-10-16) : sous 2/3 de ses PV il se fissure ; sous 1/3 les fissures s'étendent. À chaque palier, des pièces se détachent et tombent en débris (merlons, tuiles d'avant-toit, cadres, toits de lanternes), et les éléments hauts (colonnes, torii, lanternes, arbres) se mettent à pencher. Rampes et escaliers se fissurent sans perdre de marches. Il fonce un peu à mesure qu'il s'abîme, puis éclate en débris de sa couleur, plus nombreux pour un gros élément |
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

## Règles introduites par A4 (la hauteur), avec contre-jeu et indicateur visuel

| Règle | Contre-jeu | Indicateur visuel |
| --- | --- | --- |
| **Rampes et escaliers** (`"type": "ramp"` dans le catalogue, `"dir"` dans la carte) : on les monte en marchant ; toute marche de 45 cm au plus se franchit sans sauter, et on suit une pente en descendant | — | pente ou marches dessinées |
| **Plateformes** (tour de ruines 3 m, terrasse 1,5 m, tour de guet 4 m) : au-delà de la hauteur de saut (~1,8 m), on n'y accède que par une rampe ; on tombe de leurs bords | monter par la rampe, ou tirer d'en bas | rebord clair sur le dessus |
| **Ligne de vue en 3D** : on voit par-dessus un muret depuis une hauteur | se mettre sous un toit ou derrière un élément plus haut | étiquette « Hors de vue » |
| **Les tirs visent la cible en hauteur** (projectiles et objets lancés partent vers son corps) ; un bord de plateforme peut arrêter un tir trop rasant | se cacher derrière le rebord | trajectoire visible |
| **Les zones frappent un seul niveau** : celui de la cible (ou du sol à l'endroit visé) | changer d'étage avant l'impact | l'anneau s'affiche à cet étage |
| Le **bot** rejoint un adversaire perché par la rampe la plus proche, et contourne les obstacles hauts par leurs coins | — | — |

Cartes mises à jour : la Clairière a deux tours de ruines avec rampes et une terrasse centrale à escaliers ; le Village a deux tours de guet (grands escaliers) et deux terrasses.

Effet mesuré sur l'équilibre (bots, 20 duels) : Kaminari contre Rōnin passe à 35 % (Clairière) et 33 % (Village) — les hauteurs et les recoins favorisent le sabreur. C'est un effet de carte ; l'épreuve d'équilibrage se joue en terrain vague et n'est pas affectée.

## Troisième carte : le Sanctuaire des cerisiers (2026-10-16)

Carte japonaise de 60 × 42 m (`data/arenas/sanctuaire.json`), au thème « japan » (choisi par l'identifiant de la carte) : sanctuaire sur estrade avec escaliers vermillon, deux torii, deux yagura (tours de guet) et deux ishigaki (socles de pierre) avec rampes, machiya, murets dobei, clôtures de bambou, cerisier central, tonneaux de saké.

Nouvel élément au catalogue, **lanterne de pierre** (`lantern`, cylindre 0,45 m × 2,2 m, 150 PV) : obstacle étroit qui arrête les tirs et, haut de 2,2 m, cache celui qui se tient derrière (règle des éléments ≥ 1,6 m) ; contre-jeu : la casser (150 PV) ou la contourner ; indicateur : la lanterne elle-même, qui tremble sous les coups et éclate en débris. Les autres éléments réutilisent le catalogue existant avec un habillage japonais : la simulation est identique d'une carte à l'autre.

Autour : rizières en terrasses dans la vallée, bambouseraies, cèdres sur les hauteurs, cerisiers en fleur, deux pagodes à cinq étages et un temple sur la colline, un pont arqué vermillon sur la rivière, un volcan enneigé à l'horizon.

Mesure (bots, 20 duels par paire) : tous les duels se terminent ; comme sur la Clairière et le Village, Shino gagne la plupart de ses duels (75 à 95 % ici). C'est un déséquilibre de personnage sur cartes encombrées, pas propre à cette carte.
