# Système de personnages — brouillon v0

Statut : **v0 implémentée** (`src/sim/`), validée par le porteur de projet. Les chiffres sont calibrés par l'expérience E2 (voir `docs/experiments/e2-results.md`).

## 1. Un personnage = identité + kit

```text
pack/
├── character.json   # identité : nom, univers d'origine, couleurs, portrait (optionnel)
└── kit.json         # kit : stats + attaque de base + 2 capacités, construits à partir de primitives
```

Le moteur ne lit que `kit.json`. L'identité ne sert qu'à l'affichage. Deux personnages d'univers différents peuvent partager le même kit.

## 2. Contrat de combat commun (couche B)

Chaque personnage possède :

- **Stats** : `hp`, `moveSpeed`, `armor` (réduction en %), `radius` (taille de collision).
- **Attaque de base** : obligatoire. Elle part automatiquement sur l'ennemi le plus proche à portée, **uniquement à l'arrêt**, puis immobilise 0,25 s (voir la décision 0002).
- **Capacités actives** : 2 dans le prototype, une ultime plus tard.
- **États subis** : ralenti, étourdi, repoussé, protégé (bouclier), invulnérable (seulement à la réapparition).
- **Cycle de vie** : vivant → mort → réapparition après un délai, avec une courte invulnérabilité.

Le moteur émet des événements structurés (`damage`, `heal`, `statusApplied`, `death`, `objectiveTick`…). L'affichage, les statistiques et l'équilibrage s'appuient dessus.

## 3. Primitives de capacité (couche D)

Une capacité se compose d'une **livraison** (comment elle atteint sa cible) et d'**effets** (ce qu'elle fait à l'impact).

| Livraison | Paramètres | Télégraphe obligatoire |
| --- | --- | --- |
| `projectile` | portée, vitesse, largeur, traverse ou non | ligne de visée pour le lanceur |
| `line` | longueur, largeur, délai | rectangle au sol pendant le délai |
| `circle` | portée de pose, rayon, délai | cercle au sol pendant le délai |
| `dash` | distance, vitesse ; effets facultatifs (mobilité pure) | flèche pour le lanceur ; trajectoire visible pour l'ennemi |
| `self` | — | aura sur le lanceur |

| Effet | Paramètres | Contre-jeu |
| --- | --- | --- |
| `damage` | montant | esquive, bouclier |
| `heal` | montant | interrompre, se concentrer sur le soigneur |
| `shield` | montant, durée | attendre l'expiration |
| `slow` | %, durée (plafond 50 % / 2 s) | dash |
| `stun` | durée (plafond 1,25 s) | uniquement par une livraison avec délai, donc toujours télégraphié |
| `knockback` | distance | se placer dos à l'espace ouvert |
| `haste` | %, durée | ralentir |

Garde-fous codés dans le validateur, pas seulement documentés :

- un `stun` exige une livraison avec délai d'au moins 0,4 s, ou un projectile esquivable ;
- un dash ne peut pas porter de `stun` ;
- un seul contrôle fort par kit.

## 4. Budget de puissance (couche C)

Chaque kit doit coûter **entre 90 et 100 points**. Le validateur refuse un kit qui dépasse 100 points ou qui descend sous 90 points (pour éviter les personnages inutilement faibles).

Principe des coûts, à calibrer :

- **Stats** : on paie l'écart par rapport à une base de référence. Exemple : +10 % de points de vie coûte X points. Une stat sous la base rend des points (faiblesse choisie), avec un plancher.
- **Capacités** : une capacité a une valeur estimée, appelée **valeur par seconde**. On additionne la valeur de ses effets (dégâts, soin, contrôle × durée…), on la multiplie par des coefficients liés à la livraison, puis on divise par le temps de recharge.
  - Facilité : longue portée, zone large, délai court et projectile rapide augmentent le coût.
  - Fiabilité : un effet esquivable coûte moins cher qu'un effet garanti.
- **Coefficients centralisés** : ils vivent tous dans un seul fichier, `balance/costs.json`. L'expérience E2 ajuste ces coefficients, pas les personnages un par un.

Le budget n'est qu'une **estimation**. Les simulations automatiques bot contre bot de E2 servent à vérifier que l'estimation colle à la réalité. Quand ce n'est pas le cas, on corrige les coefficients.

Outils :

- `npm run budget` : détail des points de chaque kit ;
- `npm run fit -- <kit.json> --write` : met un kit au budget en ajustant seulement ses dégâts, soins et boucliers ;
- `npm run e2:field` : mesure la qualité du modèle de coût sur des centaines de kits aléatoires, et peut le recalibrer.

## 5. Profil de forces et faiblesses (au-delà du budget total)

Le budget dit **combien** un kit est fort. Le profil dit **en quoi** il l'est. Les points sont regroupés en 6 axes, plus la portée :

| Axe | Contenu |
| --- | --- |
| survie | PV, armure, taille, soins et boucliers sur soi |
| degats | attaque de base (dégâts continus) |
| burst | dégâts des capacités |
| mobilite | vitesse, dashs, accélérations |
| controle | ralentissements, étourdissements, repoussements |
| soutien | soins et boucliers de zone (pour l'équipe) |
| portee | portée de l'attaque de base, en mètres |

Règles (`data/balance/profile.json`, modifiables sans code) :

- aucun axe ne dépasse 50 % du budget ;
- au plus 3 points forts (20 % ou plus) ;
- **au moins 2 faiblesses** (8 % ou moins) ;
- **bornes par rôle**. Par exemple :
  - Avant-garde : survie ≥ 30 %, contrôle ≥ 8 %, dégâts ≤ 35 % ;
  - Tireur : dégâts ≥ 30 %, portée ≥ 5 m, survie ≤ 15 %.

`npm run budget` affiche le profil de chaque kit sous forme de barres.

## 6. Trois kits originaux pour E2

| Kit | Rôle | Attaque de base | Capacité 1 | Capacité 2 | Faiblesse payée |
| --- | --- | --- | --- | --- | --- |
| **Rempart** | Avant-garde | mêlée, courte portée | dash + repoussement | cercle autour de soi avec délai 0,6 s → étourdissement court | lent, pas de dégâts à distance |
| **Étincelle** | Tireur | projectile longue portée | ligne de dégâts avec délai | dash de repli | peu de points de vie |
| **Lame** (4ᵉ, ajouté uniquement par données) | Assassin | mêlée rapide | dash offensif | bouclier + accélération sur soi | fragile, doit tout engager |
| **Sève** | Soutien | projectile moyen | zone de soin pour les alliés | projectile ralentissant | dégâts faibles |

## 7. Créateur de personnages (plus tard)

Le créateur est une interface posée sur ce même validateur. Le joueur choisit un rôle, sa base de stats, ses primitives et leurs paramètres. Il voit en direct son budget restant, son profil sur les 7 axes et les bornes de son rôle. Le moteur ne fait aucune différence entre un personnage officiel et un personnage créé par un joueur.
