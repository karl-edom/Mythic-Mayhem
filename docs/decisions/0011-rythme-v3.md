# 0011 — Rythme v3 : un combat « façon Smash »

Date : 2026-10-14. Statut : **acceptée** (« le rythme du combat devrait s'approcher plus d'un Super Smash Bros. Là c'est trop nerveux, on ne peut pas réfléchir » ; fiche `docs/design/rythme-v3.md` validée : « 1 oui, 2 oui, 3 oui, fais tout en une étape »).

## Ce qui a changé

| Domaine | v2 | v3 |
| --- | --- | --- |
| Combo léger | 1 à 5 coups, recul 1 à 3 m/s | 1 à 3 coups ; chaque coup recule ≥ 4 m/s, le dernier éjecte (≥ 12 m/s) |
| Coups ratés | fins de coup de 0,15 à 0,3 s | minimums imposés : légère 0,2 s (dernier 0,4 s), lourde 0,6 s, spéciale 0,35 s |
| Déplacement | 5,8 à 8,3 m/s | × 0,75 (4,4 à 6,2 m/s) ; bornes du validateur 3,5–8 |
| Saut | gravité 28 | gravité 18, double saut (85 %), contrôle en l'air 70 % |
| Coup aérien | — | J en l'air : un coup ; atterrir pendant le coup coûte 0,1 s |
| Garde | bulle infinie ; la lourde la brise d'un coup (1 s) | bouclier de 100 points qui s'use (voir le contrat) ; à 0, étourdi 2 s ; la lourde l'use deux fois plus |
| Recul | fixe | × (1 + 0,6 × part de vie perdue) |
| Esquive | sans attente | 0,3 s d'attente entre deux esquives |
| Temps limite | 180 s | 240 s (les combats sont plus longs : 120 à 225 s pour 3 K.-O. entre bots) |
| Tempo | 0,8 × temps réel | 1,0 : les nouveaux chiffres calment déjà le combat |
| Bot | colle et frappe | recule 0,5 à 1,3 s après chaque échange en tournant à 4–6 m, punit les coups ratés, approche par les airs, évite de lever un bouclier usé |
| Kits | `schemaVersion: 2` | `schemaVersion: 3` : les six kits réécrits (3 coups au plus, reculs et fins de coup minimaux, vitesse × 0,75) |

Chaque nouvelle règle a son contre-jeu et son indicateur visuel (contrat, section 2). Le dégagement de la décision 0010 est conservé.

## Équilibre

- **Épreuve** (arbitre, décision 0007) : panel de référence régénéré avec les règles v3, les six personnages réglés entre 46 et 51 %. Akane dominait la bataille de distance (portée 1,6 à 1,9 m, 1 150 PV) même avec ses dégâts divisés par deux : sa portée passe à 1,35 m (1,5 m pour la lourde) et sa vie à 1 000.
- **Kits neufs** (`brawl-field --gauntlet-check 20`) : 80 % finissent entre 35 et 65 % après l'épreuve (50 % au budget seul).
- **Barème** recalibré sur 6 mesures, mais il prédit mal la force d'un kit en v3 (écart-type de 25 % entre kits de même budget, contre une meilleure prédiction en v2). Le jeu à distance fait peser des choses que le barème ne mesure pas encore (portée, vitesse de projectile). Ce n'est pas bloquant : le barème est un garde-fou, l'épreuve tranche.

## Tests

`tests/brawl.test.ts` couvre :
- le bouclier : usure, lourde × 2, cassure, recharge, impossible de le lever vide ;
- le double saut, unique et rendu à l'atterrissage ;
- le coup aérien et son temps d'atterrissage ;
- le recul croissant ;
- l'attente entre deux esquives ;
- les nouvelles règles du validateur.

`tests/arena.test.ts` : le bot rejoint toujours un adversaire perché par la rampe.

## Limites et suites

- Les valeurs (bouclier 100, −20/s, gravité 18, × 0,75) sont des transpositions, pas des relevés de Smash : à juger manette en main.
- Le barème mérite un travail dédié pour la v3 (mesurer la portée et la vitesse des projectiles).
- Pas de saisie ni de projection : dans Smash, c'est la réponse au bouclier. Ici, ce rôle revient à la lourde et aux spéciales brise-garde.
