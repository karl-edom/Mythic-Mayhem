# 0029 — Le bond et la zone remplacés : plongée, explosion, piège

Date : 2026-10-20. Statut : **acceptée** (« ok go, dans cet ordre » du porteur de projet, sur la proposition ci-dessous).

> « Il faudra revoir ensuite l'idée des attaques suivantes : zones et bond, qui sont trop lents pour fonctionner. Je n'en ai jamais collé. Autant les remplacer par autre chose, voire les supprimer. Peut-être en supprimer le bond et revoir la mécanique de la zone pour qu'elle soit plus efficace. »

## Le constat, mesuré

160 duels de bots entre les 23 packs locaux, moitié en terrain ouvert, moitié dans le village. On compte la part des spéciales lancées qui touchent :

| Livraison | Lancées | Touchent |
| --- | --- | --- |
| bond (`leap`) | 821 | **3 %** |
| zone (`area`) | 185 | **10 %** |
| ruée (`rush`) | 1 076 | 14 % |
| contre (`counter`) | 26 | 23 % |
| projectile | 2 369 | 35 % |

Les deux ont un défaut commun : **la cible voit le coup venir pendant trop longtemps**.
- Le bond reste en l'air de 1,2 à 1,6 s, avec son cercle d'atterrissage affiché dès l'envol.
- La zone ajoute un délai de 0,35 à 1 s après le démarrage.

Il suffit de marcher pour s'en sortir.

## Ce qui a été décidé

**Le bond est supprimé, remplacé par la plongée (`dive`).** Après le démarrage, le personnage fonce en ligne droite sur le corps de la cible, en 3D, sur `distance` mètres au plus et à `speed` m/s.
- Elle part du sol comme des airs : on saute, puis on plonge sur l'adversaire.
- Elle s'arrête au premier ennemi touché, contre un mur, un plafond ou au sol.
- Depuis le sol, elle ne descend jamais dans le sol : elle reste à l'horizontale.
- La visée est prise à la sortie de la spéciale, sans correction en vol.

**La zone est coupée en deux.**
- **Explosion (`burst`)** : elle frappe tout autour du personnage (`radius`), à l'instant où la spéciale sort. Pas de délai : le démarrage est le seul avertissement.
- **Piège (`trap`)** : posé au sol vers la cible, jusqu'à `castRange`.
  - Il s'arme en `arm` secondes.
  - Il explose dès qu'un ennemi y entre, ou tout seul au bout de `lifetime` secondes.
  - Il n'y en a qu'un par spéciale : le reposer remplace l'ancien.
  - Un adversaire en esquive (invulnérable) le traverse sans le déclencher.

Pour l'explosion comme pour le piège, rien ne touche au-dessus de 1,2 m : un saut passe par-dessus.

## Contre-jeu et indicateurs visuels

| Livraison | Contre-jeu | Indicateur visuel |
| --- | --- | --- |
| Plongée | Esquiver au bon moment, garder, ou se déplacer pendant le démarrage : la visée ne suit pas. Une plongée ratée laisse sa récupération entière. | La pose d'envol pendant le démarrage, puis le corps qui file en ligne droite. Les animations des anciens bonds (vrille de Sonic, saut du Dragon de Kenshin…) sont jouées sur la durée de la plongée. |
| Explosion | S'éloigner ou garder pendant le démarrage, au moins 0,22 s, et 0,4 s si elle brise la garde. Sauter. | La pose de préparation, puis une onde au sol et un anneau de la taille de l'explosion (avec flammes et éclats pour les techniques « feu » ou « explosion »). |
| Piège | Ne pas y marcher : il est visible dès qu'il est posé. Le contourner, sauter par-dessus, ou le traverser en esquive. S'il brise la garde, son temps d'armement compte dans les 0,4 s de télégraphe. | Un cercle à la couleur de la technique, qui se remplit pendant l'armement, et un noyau lumineux qui tourne au centre. Une fois armé, il clignote deux fois par seconde, puis huit fois dans sa dernière seconde. |

## Après le changement

Mêmes 160 duels, mêmes graines, packs convertis mais pas encore rééquilibrés :

| Livraison | Lancées | Touchent |
| --- | --- | --- |
| plongée (`dive`) | 971 | **19 %** (le bond : 3 %) |
| explosion (`burst`) | 53 | **30 %** (la zone : 10 %) |
| piège (`trap`) | 67 | **42 %** |
| ruée | 1 127 | 18 % |
| projectile | 2 590 | 34 % |

Les bots lancent peu d'explosions : ils ne les tentent qu'au contact.

## Conversion des packs (locaux)

- **Chaque bond devient une plongée** :
  - `distance` = l'ancienne portée, entre 6 et 14 m ; vitesse 30 m/s ;
  - taille du coup : 3/4 de l'ancien rayon d'atterrissage, entre 0,7 et 1,1 m ;
  - démarrage d'au moins 0,18 s, et 0,4 s si la plongée brise la garde.
  - Personnages concernés : Kenshin, Leonardo, Donatello, Saitō, Sanosuke, Naruto, Shredder, Splinter, Tediz, Sonic, Super Sonic, Tails, Knuckles.
- **Chaque zone centrée sur soi, ou à 3 m au plus, devient une explosion** :
  - rayon : 90 % de l'ancien, 3,2 m au plus ;
  - démarrage : l'ancien + 0,1 s, entre 0,22 et 0,45 s.
  - Techniques concernées : moulinet, tornade, furie, tourbillon, senpū, futae no kiwami, guren kaina, quake punch, chaos blast, chaos burst.
- **Les zones lancées au loin deviennent des pièges** : egg mine, ring bomb, grenade.
  - Rayon : 85 % de l'ancien, 2 m au plus.
  - Armement 0,6 s, durée 5 s.
- **Genkidama et Big Bang deviennent des projectiles** : ce sont des boules lancées, pas des pièges.
  - Genkidama est lente et énorme (14 m/s, 1,6 m). Elle brise la garde, donc son démarrage passe à 0,6 s.
  - Big Bang va à 22 m/s et mesure 1 m.

Tous les packs sont ensuite rééquilibrés par l'épreuve (`node tools/brawl.ts --tune`, 40 à 60 % de victoires, décision 0007). Le panel de référence est tiré par `generate.ts`, qui produit maintenant ces nouvelles livraisons : le panel change, et les packs non convertis sont donc aussi réglés à nouveau.

## Contrat commun : ce qui change (documenté et testé)

- `SpecialDelivery` :
  - retire `area` et `leap` ;
  - ajoute `dive {distance, speed, size}`, `burst {radius}` et `trap {castRange, radius, arm, lifetime}`.
  - Le format reste en version 3 : un pack qui emploie encore `leap` ou `area` est refusé, avec un message qui dit par quoi les remplacer.
- `Action` « leap » devient « dive ».
- `Zone` (les pièges) gagne `armedAt` et perd `leap`.
- Nouvel événement `blast` (explosion ou piège qui part), pour l'affichage.
- **Bornes du validateur** :

  | Livraison | Bornes |
  | --- | --- |
  | Plongée | distance 2 à 14 m, vitesse 12 à 45 m/s |
  | Explosion | rayon 0,8 à 4 m |
  | Piège | portée 0 à 12 m, rayon 0,8 à 3,5 m, armement 0,3 à 2 s, durée 1 à 8 s |

- **Budget** (`brawl-costs.json`) :
  - plongée : comme une ruée (`diveDistanceFactor`) ;
  - explosion : selon son rayon ;
  - piège : comme l'ancienne zone (portée, rayon, remise pour l'armement), plus un prix par seconde de durée (`trapLifetimeFactor`).
  - Les facteurs par livraison sont provisoires (plongée 0,5, explosion et piège 0,69). L'épreuve tranche.
- **Bots** :
  - ils plongent à portée de plongée ;
  - ils explosent au contact ;
  - ils posent un piège à portée, s'ils n'en ont pas déjà un.
- **Animations** : les clips `@leap`, `:leap` et `@special:leap` sont renommés `@dive`, `:dive` et `@special:dive`. Le clip de vol est joué sur la durée de la plongée, puis `:land` au coup.
- **Tests** (`tests/brawl.test.ts`) :
  - l'explosion frappe à la sortie, pas avant, et pas au-delà de son rayon ;
  - le piège se pose sur la cible, ne part pas sous un adversaire en l'air, part dès qu'on y entre une fois armé, explose seul à la fin de sa durée, et un nouveau remplace l'ancien ;
  - la plongée part des airs vers le bas et l'avant, touche, s'arrête sur le coup, et se pose au sol quand la cible est partie ;
  - un pack avec un bond est refusé.

## Limites

- La plongée ne suit pas sa cible. Si elle reste trop facile à éviter, la prochaine étape serait une légère correction en vol, à décider.
- La pose d'envol des anciens bonds dure le temps du démarrage, désormais plus court : certaines animations sont plus nerveuses qu'avant. À revoir en jeu.
