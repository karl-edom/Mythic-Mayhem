# Contrat de combat v2 — brawler d'arène (adaptation J-Stars)

Statut : **v0 implémentée** (`src/brawl/`), testée (`tests/brawl.test.ts`), jouable en 1v1 contre un bot (`npm run dev`). Chiffres **provisoires**, non calibrés. Décision de référence : 0005.

## 1. Règles communes (`BRAWL_CONFIG`, `src/brawl/world.ts`)

| Règle | Valeur | Pourquoi |
| --- | --- | --- |
| Simulation | 60 ticks/s, déterministe, sans rendu, pilotée par des commandes | jeu en réseau plus tard, bots, tests |
| Arène | rectangle fermé par un mur, avec des éléments de décor (décision 0006) ; données dans `data/arenas/` | J-Stars : arènes fermées et destructibles |
| Victoire | 3 K.-O. remplissent la jauge de victoire | J-Stars |
| Fin au temps | 180 s ; plus de K.-O., puis plus de vie restante | J-Stars |
| Réapparition | après 3 s, invulnérable 2 s | J-Stars |
| Énergie | max 100, départ 50, +4/s ; +35/s en rechargeant (immobile) | spéciales sur jauge |

## 2. Actions, contre-jeu et indicateur visuel

Règle du projet : toute capacité précise son contre-jeu et son indicateur visuel.

| Action | Effet | Contre-jeu | Indicateur visuel |
| --- | --- | --- | --- |
| Attaque légère (J) | chaîne de 1 à 5 coups ; appuyer pendant la récupération enchaîne le coup suivant (mémoire de 0,2 s) | garde ; démarrage ≥ 0,08 s | contour de la zone de frappe pendant l'élan, sphère pleine quand elle touche |
| Attaque lourde (K, maintenir) | se charge (dégâts × bonus), **brise la garde** (assomme 1 s, 50 % des dégâts) | esquive ou recul ; démarrage ≥ 0,35 s | orbe orange qui grossit pendant la charge, zone de frappe orange |
| Garde (L, maintenir) | ne prend que 10 % des dégâts, court blocage de 0,2 s | attaque lourde, spéciale brise-garde | bulle bleue |
| Garde brisée | assommé 1 s | — (punition) | étoiles jaunes qui tournent + bannière |
| Esquive (Maj) | 3,5 m en 0,3 s, invulnérable les 0,2 premières s, coûte 15 d'énergie | attendre la fin de l'esquive | personnage penché, clignotement |
| Saut (Espace) | évite les zones au sol | frapper en l'air (les zones ne touchent pas au-dessus de 1,5 m) | ombre au sol qui rétrécit |
| Recharge (E, maintenir) | +35 énergie/s, immobile et sans garde | frapper | colonne d'aura colorée |
| Spéciale projectile | part vers la cible, touche le premier ennemi | esquive latérale, garde | sphère colorée |
| Spéciale ruée | le personnage fonce, s'arrête au premier ennemi touché | esquive, garde | le déplacement lui-même |
| Spéciale zone | cercle posé vers la cible, frappe après un délai | sortir du cercle, sauter | anneau au sol qui se remplit jusqu'à l'impact |
| Mise au sol | recul ≥ 9 m/s (après poids) : à terre, puis relevé invulnérable 0,4 s | — (fin de combo garantie) | personnage allongé |
| K.-O. | remplit un cran de la jauge adverse | — | bannière + pastille orange |

## 3. Garde-fous du validateur (`src/brawl/validate.ts`)

- bornes sur chaque nombre (PV 700–1600, vitesse 4–9 m/s, etc.) ;
- au plus 5 coups légers, 1 à 3 spéciales ;
- premier coup léger : démarrage ≥ 0,08 s ; attaque lourde : démarrage ≥ 0,35 s ;
- spéciale brise-garde : télégraphe (démarrage + délai) ≥ 0,4 s ;
- **pas de boucle infinie** : le dernier coup du combo met au sol, ou laisse la cible récupérer avant le premier coup suivant ;
- budget entre 60 et 120 points (`data/balance/brawl-costs.json`), puis épreuve entre 40 % et 60 % de victoires (décision 0007).

## 4. Budget et épreuve

Le budget (`data/balance/brawl-costs.json`, calibré par `tools/brawl-field.ts`) estime la puissance d'un kit en points : survie, mobilité, combo, attaque lourde, et les spéciales (la plus chère payée en entier, les suivantes à prix réduit, car elles partagent la même jauge). Cible 95 points, plage acceptée 60–120. `npm run brawl` affiche le détail.

L'arbitre de l'équilibre est l'**épreuve** : 40 adversaires de référence fixes ; un personnage est équilibré s'il en bat 40 à 60 %. `npm run brawl -- --tune` ajuste ses dégâts pour y arriver. Voir la décision 0007.

## 5. Pas encore fait

Ultime / mode « burst », personnage de soutien, 2v2, combat aérien spécifique, manette testée sur matériel réel.

Les règles de décor (se cacher, casser, monter dessus, ramasser et lancer, chocs contre les murs) sont décrites dans la décision 0006.
