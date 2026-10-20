# 0028 — Coups forts dirigés et « coup sec » du joystick

Date : 2026-10-20. Statut : **acceptée** (choix du porteur de projet : grille dérivée ; au clavier, la touche lourde tient lieu de coup sec).

> « Dans Smash il y a une notion de coup sec sur le joystick ou pas, qui fait des attaques plus ou moins puissantes. Cela fonctionne aussi en l'air. Si c'est implémentable, ça crée une variété de coups incroyable. »

## Ce qui a été décidé

**Le coup sec (manette)** : quand on pousse le stick du centre jusqu'au bord en moins de 70 ms, puis qu'on appuie sur A dans les 120 ms, on obtient le **coup fort**. Il se charge tant que A reste enfoncé, comme la touche X. Si on incline le stick doucement, A reste l'attaque légère. **Au clavier**, les touches sont tout ou rien : la touche du coup fort (K) joue ce rôle.

**La grille des coups**, tous calculés à partir des chiffres existants de chaque personnage : aucun champ de pack ne change et le budget n'est pas touché.

| | Coup léger (A / J) | Coup fort (coup sec + A, X / K) |
| --- | --- | --- |
| **Au sol, devant** | enchaînement jusqu'à 3 coups | coup fort chargeable (inchangé) |
| **Au sol, vers le haut** (saut pressé avec, ou adversaire au-dessus et proche) | — | coup fort au-dessus de la tête, qui soulève : un anti-aérien |
| **Au sol, vers le bas** (garde maintenue) | — | balayage bas, des deux côtés à la fois |
| **En l'air, devant** | coup aérien | coup aérien fort |
| **En l'air, vers le haut** (saut maintenu, ou visée automatique) | coup aérien vers le haut | coup aérien fort vers le haut |
| **En l'air, vers le bas** (garde maintenue, ou visée automatique) | météore | météore fort |

Le **coup aérien fort** prend la portée et la puissance du coup lourd (× 0,8 en dégâts) et part plus vite que lui (démarrage × 0,6, mais jamais avant le coup léger + 0,04 s). Il ne se charge pas. Vers le bas, il reçoit en plus le démarrage et la récupération du météore (décision 0027).

## Contre-jeu et indicateurs visuels

| Nouveauté | Contre-jeu | Indicateur visuel |
| --- | --- | --- |
| Coup fort vers le haut au sol (anti-aérien) | On ne tombe pas droit sur quelqu'un qui le prépare : on dérive, on double-saute ou on attend qu'il le lâche. Il ne touche rien devant. | Le reflet de préparation du coup lourd, puis le corps bascule en arrière, l'arc se dresse au-dessus de la tête et des traits montent sur la cible. |
| Balayage bas | On saute par-dessus. Il porte moins loin qu'un coup fort devant (80 % de la portée). | Reflet de préparation, l'attaquant s'accroupit, arc au ras du sol. |
| Coup aérien fort | Plus lent que l'aérien léger, et l'atterrissage pendant le coup coûte la même pause : on le punit au sol. | Arc et traînée plus amples, comme le coup lourd ; reflet sous les pieds vers le bas. |
| Coup sec | Rien de nouveau : c'est un autre moyen de sortir le coup fort. | Le même que le coup fort. |

## Contrat commun : ce qui change (documenté et testé)

- `Action` « heavy » porte une direction (`aim`). L'action « aerial » peut être forte (`strong`).
- En l'air, le coup fort est désormais utilisé : avant, il était ignoré.
- **Réglages** ajoutés à `BrawlConfig` : `smashUpLift`, `strongAerialDamage`, `strongAerialStartup`.
- Le coup sec est lu côté manette (`isFlick` dans `input.ts`). La simulation ne voit que la commande « coup fort » : déterminisme et réseau ne changent pas.
- **Tests** (`tests/smash.test.ts`) : détection du coup sec ; balayage qui touche devant et derrière ; anti-aérien qui vise et soulève un adversaire au-dessus ; saut et coup fort pressés ensemble au sol, qui donnent le coup vers le haut sans sauter ; coup aérien fort (dégâts et démarrage).

## Limites

- **Les gestes ne changent pas avec la direction** : le corps bascule, mais c'est la même animation de coup lourd ou de coup aérien. Des animations propres par direction et par personnage, ce serait l'étape d'après, l'option « complète » qui n'a pas été retenue pour l'instant.
- Le seuil du coup sec (70 ms, du centre au bord) est à régler en jouant, selon la manette.
- Au clavier, le coup fort au sol vers le haut se fait avec K et Espace pressés ensemble ; sinon, c'est la visée automatique qui le déclenche.
