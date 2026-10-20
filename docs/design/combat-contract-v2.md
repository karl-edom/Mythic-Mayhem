# Contrat de combat v3 — brawler d'arène, rythme « façon Smash »

Statut : **v3 implémentée** (`src/brawl/`), testée (`tests/brawl.test.ts`), jouable en 1v1 contre un bot (`npm run dev`). Décisions de référence : 0005 (adaptation J-Stars), 0010 (dégagement), **0011 (rythme v3)**, **0012 (parade, usure des esquives, petit saut)**. Le nom du fichier est conservé pour les liens existants ; les kits sont au format `schemaVersion: 3`.

## 1. Règles communes (`BRAWL_CONFIG`, `src/brawl/world.ts`)

| Règle | Valeur | Pourquoi |
| --- | --- | --- |
| Simulation | 60 ticks/s, déterministe, sans rendu, pilotée par des commandes | jeu en réseau plus tard, bots, tests |
| Arène | rectangle fermé par un mur, avec des éléments de décor (décision 0006) ; données dans `data/arenas/` | J-Stars : arènes fermées et destructibles |
| Victoire | 3 K.-O. remplissent la jauge de victoire | J-Stars |
| Fin au temps | 240 s ; plus de K.-O., puis plus de vie restante | rythme v3 : les échanges sont plus posés |
| Gravité | 18 m/s² (environ 1,1 s en l'air pour un saut) | rythme v3 : jeu aérien |
| Recul | × (1 + 0,6 × part de vie perdue) | rythme v3 : clin d'œil au pourcentage de Smash |
| Réapparition | après 3 s, invulnérable 2 s | J-Stars |
| Énergie | max 100, départ 50, +4/s ; +35/s en rechargeant (immobile) | spéciales sur jauge |

## 2. Actions, contre-jeu et indicateur visuel

Règle du projet : toute capacité précise son contre-jeu et son indicateur visuel.

| Action | Effet | Contre-jeu | Indicateur visuel |
| --- | --- | --- | --- |
| Attaque légère (J) | chaîne de **1 à 3 coups** ; chaque coup recule d'au moins 4 m/s, le dernier **éjecte** (≥ 12 m/s) | bouclier ; démarrage ≥ 0,08 s ; un coup raté laisse ≥ 0,2 s (≥ 0,4 s pour le dernier) | contour de la zone de frappe pendant l'élan, sphère pleine quand elle touche |
| Coup aérien (J en l'air) | un seul coup, avec les chiffres du premier coup léger ; atterrir pendant le coup immobilise 0,1 s | bouclier ; frapper l'atterrissage | traînée de l'arme |
| Attaque lourde (K, maintenir) | se charge (dégâts × bonus) ; contre un bouclier, l'**use deux fois plus** | esquive ou recul ; démarrage ≥ 0,35 s ; fin ≥ 0,6 s | orbe orange qui grossit pendant la charge, zone de frappe orange |
| Bouclier (L, maintenir) | ne prend que 10 % des dégâts, court blocage de 0,2 s ; **100 points**, −20/s tenu, +15/s relâché (après 0,5 s) ; un coup bloqué retire dégâts × 0,3 (× 2 lourde, × 3 spéciale brise-garde) | le vider : lourde, spéciale brise-garde, pression | bulle bleue qui **rétrécit et rougit** en se vidant |
| Retrait du bouclier (relâcher L) | **11 images** (0,18 s) sans pouvoir attaquer ; sauter hors du bouclier l'évite | — (c'est le prix du bouclier) | pose de garde qui se relâche |
| **Parade** (relâcher L juste avant l'impact) | bouclier tenu ≥ 3 images, impact dans les **5 images** qui suivent le relâchement : coup annulé (ni dégâts ni usure), on agit aussitôt, un attaquant au corps à corps est **étourdi 0,4 s** | changer de rythme, feinter, frapper à distance (un projectile paré n'étourdit pas son lanceur) | éclat blanc-cyan, anneau, bannière « PARADE ! » |
| Bouclier brisé | à 0 : **étourdi 2 s** (même s'il s'est vidé tout seul) | — (punition) | étoiles jaunes qui tournent + bannière « BOUCLIER BRISÉ » |
| Esquive (Maj) | 3,5 m en 0,3 s, invulnérable les 0,2 premières s, coûte 15 d'énergie. **Usure** : chaque esquive ajoute un niveau (5 au plus), qui retombe d'un niveau toutes les 2 s ; par niveau, +12 % de durée, −15 % d'invulnérabilité, −8 % de distance | attendre la fin de l'esquive ; punir la deuxième ou la troisième, plus lentes | personnage penché, clignotement ; pastilles « esquive ●●○○○ » dans la barre |
| Dégagement (Maj pendant qu'on encaisse des coups, un coup bloqué ou en garde) | coûte **50 d'énergie** ; repousse tout ennemi à moins de 3 m (vitesse 12 ÷ poids) et l'interrompt 0,35 s, **sans aucun dégât** (ni choc contre un mur) ; invulnérable pendant 0,4 s. Impossible au sol ou garde brisée (décision 0010) | relâcher la pression pour le pousser à dépenser sa jauge, puis punir ; le garder à court d'énergie (il ne peut plus lancer de spéciale) | onde de choc blanche à la taille de sa portée, bannière « DÉGAGEMENT », pastille « dégagement » allumée dans la barre quand elle est disponible |
| Saut (Espace) | élan de **3 images**, puis : bouton maintenu = saut complet, bouton relâché = **petit saut** (71 % de la vitesse, ~la moitié de la hauteur) ; évite les explosions et les pièges au sol ; **double saut** en l'air (85 % de la force), contrôle en l'air à 70 % | frapper en l'air, attendre la retombée (explosions et pièges ne touchent pas au-dessus de 1,2 m) | ombre au sol qui rétrécit ; anneau d'air sous les pieds au double saut |
| Recharge (E, maintenir) | +35 énergie/s, immobile et sans garde | frapper | colonne d'aura colorée |
| Vie basse (< 35 %) | les coups reçus repoussent plus loin | se tenir loin des murs, jouer prudemment | halo rouge pulsant autour du personnage |
| Spéciale projectile | part vers la cible, touche le premier ennemi | esquive latérale, garde | sphère colorée |
| Spéciale ruée | le personnage fonce, s'arrête au premier ennemi touché | esquive, garde | le déplacement lui-même |
| Spéciale plongée (décision 0029) | après le démarrage, fonce en ligne droite sur le corps de la cible, en 3D, depuis le sol ou les airs ; s'arrête au premier ennemi touché, contre un mur ou au sol | esquive au bon moment, garde, ou se déplacer pendant le démarrage (la visée est prise à la sortie, sans correction en vol) | la pose d'envol pendant le démarrage, puis le corps qui file |
| Spéciale explosion (décision 0029) | frappe tout autour du personnage, à la sortie de la spéciale | s'éloigner ou garder pendant le démarrage, sauter (rien au-dessus de 1,2 m) | la pose de préparation, puis une onde au sol de la taille de l'explosion |
| Spéciale piège (décision 0029) | posé au sol vers la cible ; armé après un délai, il explose quand un ennemi y entre, sinon tout seul à la fin de sa durée ; un seul par spéciale | ne pas y marcher, le contourner, sauter par-dessus, le traverser en esquive (invulnérable, il ne se déclenche pas) | cercle qui se remplit pendant l'armement et noyau lumineux ; armé, il clignote, plus vite dans sa dernière seconde |
| Mise au sol | recul ≥ 9 m/s (après poids) : à terre, puis relevé invulnérable 0,4 s | — (fin de combo garantie) | personnage allongé |
| K.-O. | remplit un cran de la jauge adverse | — | bannière + pastille orange |

## 3. Garde-fous du validateur (`src/brawl/validate.ts`)

- bornes sur chaque nombre (PV 700–1600, vitesse 3,5–10 m/s, etc.) ;
- au plus **3 coups légers**, 1 à 3 spéciales ;
- premier coup léger : démarrage ≥ 0,08 s ; attaque lourde : démarrage ≥ 0,35 s ;
- chaque coup léger recule ≥ 4, le dernier **éjecte** (recul ≥ 12) : l'échange finit toujours à distance, donc pas de boucle infinie ;
- **coups ratés punissables** : fin de coup léger ≥ 0,2 s (dernier ≥ 0,4 s), lourde ≥ 0,6 s, spéciale ≥ 0,35 s ;
- spéciale brise-garde : télégraphe ≥ 0,4 s (démarrage, plus l'armement pour un piège) ;
- livraisons « leap » (bond) et « area » (zone) retirées (décision 0029) : un pack qui les emploie est refusé, avec la marche à suivre ;
- budget entre 60 et 120 points (`data/balance/brawl-costs.json`), puis épreuve entre 40 % et 60 % de victoires (décision 0007).

## 4. Budget et épreuve

Le budget (`data/balance/brawl-costs.json`, calibré par `tools/brawl-field.ts`) estime la puissance d'un kit en points : survie, mobilité, combo, attaque lourde, et les spéciales (la plus chère payée en entier, les suivantes à prix réduit, car elles partagent la même jauge). Cible 95 points, plage acceptée 60–120. `npm run brawl` affiche le détail.

L'arbitre de l'équilibre est l'**épreuve** : 40 adversaires de référence fixes ; un personnage est équilibré s'il en bat 40 à 60 %. `npm run brawl -- --tune` ajuste ses dégâts pour y arriver. Voir la décision 0007.

## 5. Pas encore fait

Ultime / mode « burst », personnage de soutien, 2v2, manette testée sur matériel réel, barème recalibré finement pour la v3 (voir décision 0011).

Les règles de décor (se cacher, casser, monter dessus, ramasser et lancer, chocs contre les murs) sont décrites dans la décision 0006.
