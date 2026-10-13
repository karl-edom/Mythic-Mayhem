# E2 — Personnages différents dans un même cadre de règles : résultats

Date : 2026-10-13. Statut : **première itération terminée, critères partiellement atteints.**

## Ce qui a été construit

| Élément | Fichier | Rôle |
| --- | --- | --- |
| Simulation sans rendu | `src/sim/world.ts` | Tourne à pas fixe (30 ticks/s), même résultat pour la même graine, pilotée par des commandes |
| Format de kit v1 | `src/sim/kit.ts` | Stats, attaque de base, 2 capacités, construites à partir de 5 livraisons et 7 effets |
| Validateur | `src/sim/validate.ts` | Structure → règles de contre-jeu → profil → budget, avec des messages en français |
| Budget de puissance | `src/sim/budget.ts` + `data/balance/costs.json` | Coût en points, coefficients centralisés |
| **Profil multi-axes** | `src/balance/profile.ts` + `data/balance/profile.json` | 6 axes en points + la portée en mètres, avec des bornes par rôle |
| Bot générique | `src/bots/bot.ts` | Lit les données du kit, jamais son nom ; imparfait comme un humain (visée, réaction, esquives ratées) |
| **Télémétrie** | `src/balance/telemetry.ts` | 11 mesures par personnage, pas seulement les victoires |
| Générateur de kits aléatoires | `src/balance/generate.ts` | Kits valides à budget exact, pour éprouver le modèle |
| Ajustement automatique | `src/balance/fit.ts` | Met un kit au budget sans toucher à son identité |
| Outils | `tools/*.ts` | `budget`, `fit`, `e2-duels` (1v1 et 3v3), `e2-field` (champ + calibrage), `trace` |

## Pas un seul score : les paramètres qui décrivent un personnage

Un personnage est contrôlé et mesuré sur **plusieurs niveaux**.

1. **Paramètres du kit** (environ 20 à 30 valeurs). Ce sont les réglages fins des forces et faiblesses :
   - stats : PV, vitesse, armure, taille ;
   - attaque de base : portée, dégâts, cadence, vitesse du projectile ;
   - pour chaque capacité : temps de recharge, forme et dimensions de la livraison, délai du télégraphe, effets et leurs valeurs.
2. **Budget en 14 catégories.** Il dit combien de points vont dans chaque type de puissance :
   - stats : PV, vitesse, armure, taille ;
   - attaque de base : au corps-à-corps ou à distance ;
   - effets : dégâts, soin, bouclier, ralentissement, étourdissement, repoussement, accélération ;
   - mobilité des dashs.
3. **Profil en 7 axes**, lisible par un joueur : survie, dégâts continus, burst, mobilité, contrôle, soutien, portée. Les règles qui s'y appliquent :
   - aucun axe ne dépasse 50 % du budget ;
   - au plus 3 points forts (au moins 20 % chacun) ;
   - **au moins 2 vraies faiblesses** (8 % ou moins) ;
   - **bornes par rôle** : par exemple, un tireur a une portée d'au moins 5 m et une survie d'au plus 15 %.
4. **Budget total** de 90 à 100 points.
5. **Télémétrie de match**, mesurée et non prédite. Pour chaque personnage :
   - victoires ;
   - dégâts infligés et subis ;
   - soin et boucliers donnés ;
   - secondes d'étourdissement et de ralentissement infligées ;
   - touches par lancer de capacité ;
   - temps de survie ;
   - morts et éliminations.

Le profil et les bornes par rôle sont des **données** (`data/balance/profile.json`), modifiables sans toucher au code. C'est la base du futur créateur de personnages.

## Résultats

### Critère 2 — un 4ᵉ personnage sans toucher au moteur : ✅ atteint

Lame (assassin) n'est qu'un fichier JSON. Un test vérifie aussi qu'un kit généré au hasard, déposé dans le dossier, joue immédiatement contre tous les autres. Un autre test vérifie qu'aucun nom de personnage n'apparaît dans `src/`.

### Critère 3 — un kit hors règles est refusé clairement : ✅ atteint

Le validateur refuse, avec un message lisible, chacun de ces cas :

- hors budget, par excès ou par défaut ;
- axe dominant ;
- pas assez de faiblesses ;
- bornes du rôle non respectées ;
- étourdissement non esquivable ;
- deux contrôles forts ;
- soin porté par un projectile ;
- données malformées.

19 tests automatisés passent (`npm test`).

### Critère 1 — aucun affrontement au-delà de 65 % de victoires : ❌ pas atteint, mais la mesure a beaucoup appris

**Le modèle de coût, testé sur des kits aléatoires** (`tools/e2-field.ts`, plusieurs centaines de kits au même budget) :

| Format | Coefficients | Écart-type des taux de victoire | Kits entre 35 et 65 % |
| --- | --- | --- | --- |
| 1v1 | hypothèses de départ | 26 % | 36 % |
| 1v1 | après 8 tours de calibrage | 21 % | 50 % |
| 3v3 | calibrés en 3v3 (5 tours) | 13 % (dont environ 4 % de bruit) | 76 % |
| 3v3 | + règles de profil + bot qui cible le plus faible | 13–14 % | 71 % |

**Les 4 personnages conçus**, sur 1 000 combats par affiche :

| | Étincelle | Lame | Rempart | Sève |
| --- | --- | --- | --- | --- |
| Victoires en 1v1 (moyenne de ses duels) | 74 % | 50 % | 34 % | 43 % |
| Victoires en 3v3 (compositions mixtes) | 51 % | 38 % | 64 % | 47 % |

- **En 1v1, c'est du pierre-feuille-ciseaux.** Rempart bat Lame (100 %), Lame bat Sève (100 %), Sève bat Rempart (100 %). Ce sont les contres naturels de chaque rôle.
- **En 3v3, les personnages se resserrent** entre 38 et 64 %. Mais les compositions sans tank perdent trop nettement (26 à 33 %).

### Enseignements

1. **Le 1v1 n'est pas la bonne mesure pour un jeu d'équipe.** Le format 3v3 lisse les contres et rend le budget environ deux fois plus prédictif. Proposition : mesurer le critère 1 sur les **taux de victoire par personnage en 3v3 mixte** (cible : 40 à 60 %). On conserverait le 1v1 seulement pour repérer les contres absolus (100 %), qui méritent une décision de design.
2. **La première calibration a corrigé les erreurs de prix suivantes** (prix relatifs après calibration, par rapport à l'hypothèse de départ) :

   | Catégorie | Correction |
   | --- | --- |
   | Vitesse de déplacement | prix divisé par 10 |
   | Portée de l'attaque de base | valeur divisée par 5 environ |
   | PV | −20 % |
   | Soin | +15 % |
   | Bouclier | −30 % |
3. **Contrôles et mobilité ne sont pas mesurables avec ces bots.** Leur valeur mesurée est nulle ou négative, parce que les bots n'enchaînent jamais « j'étourdis, nous frappons tous ». Leurs prix restent **gelés** sur l'hypothèse de départ, en proportion des dégâts, jusqu'à ce qu'on ait de meilleurs bots ou des parties humaines (E1).
4. **La valeur des stats dépend du niveau des bots.** Quand les bots se sont mis à concentrer leurs coups sur la cible la plus faible, PV et armure sont passés de « bien payés » à « 2× sous-payés ». **Toute calibration est relative à un niveau de jeu** : il faudra la refaire après chaque changement de bot, et la confronter à de vraies parties.
5. **Le générateur produit surtout des « combattants »** (99 sur 150). Les autres rôles sont trop peu représentés pour être mesurés de façon fiable.
6. **Un budget juste en moyenne n'empêche pas un kit précis d'être fort.** L'attaque de base d'Étincelle à 6 m s'est révélée plus forte que son prix. La télémétrie l'a montré (2 558 dégâts par match en 3v3), et un ajustement interne au budget l'a ramenée à 51 %.

## Règles de combat ajoutées

Voir `docs/decisions/0002-regles-de-combat-e2.md` :

- l'attaque de base ne part qu'à l'arrêt, puis immobilise 0,25 s ;
- un dash peut ne porter aucun effet (mobilité pure) ;
- fourchette de budget de 90 à 100 points ;
- calibrage du budget par simulation.

## Prochaines étapes proposées

1. **Générateur par rôle**, pour que chaque rôle soit représenté dans le champ et ait sa propre mesure.
2. **Recalibrer en 3v3** avec le bot actuel, puis réajuster les 4 kits. C'est un calcul d'environ 7 minutes, automatisé.
3. **Bots d'équipe** : ils suivent les contrôles d'un allié et protègent leurs tireurs. C'est la condition pour mesurer contrôles et mobilité.
4. Passer ensuite à **E1** (lisibilité, avec un rendu jouable). Les vraies parties fourniront la mesure qui manque aux bots.

## Reproduire

```bash
npm install
npm test                                   # 19 tests
npm run budget                             # budget + profil de chaque kit
npm run e2 -- --n 1000                     # duels 1v1 + télémétrie
npm run e2 -- --n 1000 --teams 3           # 3v3 mixtes + télémétrie
npm run e2:field -- --kits 150 --team 3 --matches 15000   # qualité du modèle de coût
npm run e2:field -- --kits 150 --team 3 --matches 15000 --rounds 5 --write   # recalibrage
npm run fit -- data/kits/x.json --write    # remettre un kit au budget
```
