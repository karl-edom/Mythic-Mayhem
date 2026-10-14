# Rythme v3 — vers un combat « façon Smash » (proposition)

Statut : **acceptée et implémentée** (« 1 oui, 2 oui, 3 oui, fais tout en une étape »). Voir la décision 0011 pour ce qui a été fait et les écarts avec cette fiche.

Demande : « le rythme du combat devrait s'approcher plus d'un Super Smash Bros. Là c'est trop nerveux, on ne peut pas réfléchir. » La barre de vie est conservée (pas d'éjection hors de l'arène, décision de l'étape arènes).

## Le diagnostic

Le combat actuel suit J-Stars : on se colle à l'adversaire et on enchaîne. Trois choses empêchent de réfléchir :

1. **Personne ne se sépare.** Les coups légers reculent de 1 à 3 m/s : après un échange, les deux combattants sont encore au contact, et l'échange suivant commence aussitôt.
2. **Rater ne coûte rien.** Les fins de coup durent 0,15 à 0,3 s : on peut frapper dans le vide sans risque, donc tout le monde frappe.
3. **Les combos sont longs.** Jusqu'à 5 coups, et un coup bloqué immobilise plus longtemps qu'il n'en faut à l'attaquant pour recommencer.

Ce qui fait réfléchir dans Smash : la **distance** (le « jeu de jambes » pour entrer ou sortir de portée), la **punition des coups ratés** et le **bouclier qui s'use**. Les chiffres ci-dessous en sont des transpositions. Ce sont des hypothèses à juger manette en main, pas des valeurs relevées dans Smash.

## Les changements proposés

| # | Domaine | Aujourd'hui | Proposé | Ce que ça change en jeu |
| --- | --- | --- | --- | --- |
| 1 | Combo léger | 1 à 5 coups | **1 à 3 coups** ; le dernier **éjecte** (recul ≥ 12 m/s, soit environ 4 à 5 m) | un échange dure moins d'une seconde, puis on se retrouve à distance |
| 2 | Coup isolé | recul 1 à 3 m/s | recul **4 m/s** (environ 0,5 m) | impossible d'enchaîner au-delà du combo prévu |
| 3 | Coups ratés | fin de coup 0,15 à 0,3 s | **minimums du validateur** : coup léger ≥ 0,2 s (dernier ≥ 0,4 s), lourde ≥ 0,6 s, spéciale ≥ 0,35 s | un coup dans le vide se punit : on choisit ses attaques |
| 4 | Déplacement | 5,8 à 8,3 m/s | **× 0,75** (4,4 à 6,2 m/s) | on voit venir l'adversaire, on peut jouer avec la portée |
| 5 | Saut | gravité 28, ~0,7 s en l'air | **gravité 18**, ~1,1 s en l'air, **double saut**, contrôle en l'air à 70 % | un vrai jeu aérien pour esquiver et approcher |
| 6 | Attaque en l'air | aucune | J en l'air = **un coup aérien** (pas de chaîne), petit temps d'atterrissage 0,1 s | punir un saut, approcher par les airs |
| 7 | Garde | bulle infinie, brisée d'un coup par la lourde | **Bouclier de 100 points** : −20/s tenu, +15/s relâché. Un coup bloqué retire ses dégâts (×2 pour la lourde, ×3 pour une spéciale brise-garde). À 0, il casse : **étourdi 2 s**. | on ne peut plus camper en garde, et la lourde n'est plus un « bris gratuit » |
| 8 | Esquive | 15 d'énergie | inchangée, plus **0,3 s d'attente** entre deux esquives | fin de l'esquive en boucle |
| 9 | Dégagement | 50 d'énergie | conservé (filet de sécurité) | — |
| 10 | Recul selon la vie perdue | fixe | **recul × (1 + 0,6 × part de vie perdue)** (clin d'œil au pourcentage de Smash) | en fin de vie on vole plus loin, plus de chocs contre les murs : des fins de manche spectaculaires |
| 11 | Tempo global | 0,8 × temps réel | **retour à 1,0** (les chiffres ralentissent déjà le jeu), à rejuger | — |
| 12 | Bot | colle et frappe | **recule après un échange**, attend les ouvertures, punit les coups ratés | il joue la distance au lieu de harceler |

Les nouvelles règles ont un contre-jeu et un indicateur visuel :

| Règle | Contre-jeu | Indicateur visuel |
| --- | --- | --- |
| Bouclier qui s'use | le relâcher à temps ; l'attaquant le vide à coups de lourde | la bulle rétrécit et rougit en se vidant, éclat de verre quand elle casse |
| Coup aérien | bouclier, ou frapper l'atterrissage | traînée de l'arme en l'air |
| Double saut | attendre la retombée | petit anneau d'air sous les pieds |
| Recul croissant | garder sa vie, se méfier des murs | barre de vie basse = halo rouge autour du personnage |

## Ce que ça coûte

- **Contrat de combat v3**, documenté et testé : combo, bouclier, saut, coup aérien, recul.
- **Validateur** : 3 coups légers au plus, temps de fin de coup minimaux. Les six kits sont réécrits pour s'y conformer.
- **Barème recalibré** (`npm run brawl:field -- --write`), puis **épreuve** relancée pour les six personnages.
- **Bot** revu, et animations : saut double, coup aérien, bouclier qui se vide.
- **Taille** : une grosse étape, ou deux moyennes (A : combo, punition, déplacement, bouclier ; B : saut, aérien, recul croissant, bot).

## Questions au porteur de projet

1. **Recul croissant avec la vie perdue (n° 10)** : on le prend ? C'est le plus « Smash » de la liste, mais il change la fin des manches.
2. **Le jeu aérien (n° 5 et 6)** : dans cette étape, ou dans l'étape suivante ?
3. **Le bouclier remplace la garde actuelle (n° 7)** : d'accord ?
