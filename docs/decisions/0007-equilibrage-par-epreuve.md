# 0007 — Équilibrage : un barème calibré, et une épreuve qui tranche

Date : 2026-10-14. Statut : **acceptée** (à confirmer manette en main).

## Question du porteur de projet

> « Si on ajoute 50 personnages, tu devras tout rééquilibrer, non ? »

Non. On n'équilibre **jamais un personnage contre les autres** (49 réglages qui se défont à chaque ajout). On l'équilibre contre une **référence fixe**. Un 51ᵉ personnage passe la même épreuve et ne touche à aucun des 50 premiers.

## Ce qui a été fait et mesuré

1. **Outil de calibrage** (`tools/brawl-field.ts`) : des centaines de kits aléatoires valides (`src/brawl/generate.ts`) s'affrontent entre bots ; une régression mesure ce que vaut réellement un point de chaque catégorie (survie, mobilité, combo, attaque lourde, chaque type de spéciale).
2. **Barème restructuré**, d'après les mesures :
   - toutes les spéciales puisent dans **la même jauge d'énergie** : la plus chère est payée en entier, les suivantes à 35 % et 20 % (avant, un kit à trois spéciales payait trois fois pour la même énergie) ;
   - le rendement d'une spéciale (dégâts par point d'énergie) a une **valeur décroissante** ;
   - l'**allonge** des coups est mieux payée, un **gros gabarit** plus pénalisé.
   - Résultat, sur 100 kits au même budget : **40 % → 55 %** des kits entre 35 et 65 % de victoires.
3. **Limite constatée** : environ la moitié des écarts vient d'interactions qu'aucune formule simple ne capte (rythme des combos, combinaisons d'effets). Le barème ne suffira jamais seul.
4. **L'épreuve** (`src/brawl/gauntlet.ts`) : un panel fixe de 40 adversaires de référence (tirés une fois pour toutes, graine 2026). Un personnage affronte chacun deux fois ; s'il gagne trop ou pas assez, on **multiplie ses dégâts** (seulement eux : timings, allonge et spéciales, c'est-à-dire son identité, ne bougent pas) jusqu'à environ 50 %.
   - Test (`node tools/brawl-field.ts --gauntlet-check 24 --seeds 4`) : 24 nouveaux kits réglés **chacun seul** contre le panel, puis mis face à face : **46 % → 83 %** équilibrés entre eux (écart-type 23,5 % → 11,7 %). Le reste est du hasard et des affrontements favorables à un style, ce qui est souhaitable.

## Décisions

- **L'épreuve est l'arbitre.** Un personnage est équilibré s'il gagne entre 40 % et 60 % contre le panel. `npm run brawl -- --tune` règle tous les packs, `--gauntlet` les mesure. Un test vérifie les personnages du dépôt.
- **Le budget devient un garde-fou large et un guide de création** : cible 95 points, plage acceptée 60–120. Il refuse les kits absurdes et donne un premier réglage instantané (dans le futur créateur de personnages), que l'épreuve affine.
- Le panel et sa graine font partie du contrat : les changer déplace tous les personnages réglés.

## Effet sur les personnages d'origine

| | Avant | Après |
| --- | --- | --- |
| Rōnin contre le panel | 76 % (dégâts réduits de moitié par l'épreuve) | 49 % |
| Kaminari contre le panel | 59 % | 50 % |
| Kaminari contre Rōnin, terrain vague / Clairière / Village | 3 % / 0 % / — | 63 % / 45 % / 40 % |

Le mage à distance profite des espaces ouverts, le sabreur des recoins : l'avantage dépend désormais de la carte, ce qui est voulu.

## Limites

- Le **bot sert d'instrument de mesure** : ce qu'il joue mal (ex. enchaîner contrôle et dégâts) est mal mesuré. Les parties entre humains corrigeront ; le bot a déjà été amélioré (spéciales plus utilisées, recharge à l'abri).
- L'épreuve se joue en terrain vague ; un personnage peut rester meilleur sur certaines cartes.
- Régler un personnage prend environ 5 s ; un kit de pack local se règle sur ton PC (`npm run brawl -- --tune`), ou je le fais pour toi.
