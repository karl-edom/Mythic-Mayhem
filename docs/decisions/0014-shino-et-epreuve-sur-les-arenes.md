# 0014 — Shino, et une épreuve d'équilibrage qui passe par les arènes

Date : 2026-10-16. Statut : **acceptée** (« 1 et 2 en priorité » : corriger la domination de Shino sur les cartes encombrées).

## Constat

Mesures en duels de bots entre personnages d'origine, 20 duels par paire :

- Shino gagnait **environ 65 % de ses duels en terrain ouvert et 70 à 80 % sur les cartes**. Akane perdait presque tous ses duels contre elle (0 à 15 %).
- Ses dégâts venaient surtout des **spéciales** : 1 800 à 2 000 par match, contre 330 à 500 pour Akane.
- Le **kunai** coûtait 15 d'énergie pour 116 dégâts et sortait en 0,12 s. C'était le projectile le plus rentable du jeu (7,7 dégâts par point d'énergie, contre 1,6 à 4,6 pour les autres), et Shino en lançait 27 à 36 par match.
- Sur les cartes, les combats sont coupés par les obstacles : on se cache et on recharge son énergie, 3 fois plus souvent qu'en terrain ouvert (11 % du temps contre 4 %). Les spéciales y pèsent davantage, et la combattante qui a les plus rentables y gagne le plus.
- L'**épreuve** (le panel de 40 adversaires de référence) se jouait **uniquement en terrain ouvert** : elle ne voyait pas cet effet.

Pistes écartées après mesure :

| Piste | Effet |
| --- | --- |
| Recharge d'énergie plus lente (35 → 20 / s) | aucun effet mesurable |
| Vitesse, saut, taille ou vie de Shino | aucun effet mesurable sur ce duel |
| Shunpo plus lent (0,2 s) ou plus cher | Shino tombe à 22–27 % ; il faudrait monter ses autres dégâts au-delà du budget maximum (120 points) |

## Décision

1. **Kunai de Shino** : 30 d'énergie (au lieu de 15), sortie en 0,2 s (au lieu de 0,12 s).
   - Contre-jeu : le lancer se voit venir (0,2 s), et Shino ne peut plus en enchaîner plus de 3 avec une jauge pleine.
   - Indicateur visuel : inchangé (pose de lancer, projectile visible).
2. **Spéciales d'Akane** : dégâts × 1,5 par rapport à ses coups normaux, et croc à 25 d'énergie (au lieu de 30). Elle avait les spéciales les moins rentables du jeu.
3. **L'épreuve se joue en terrain ouvert et sur chaque arène du dépôt, à tour de rôle.**
   - Même nombre de duels (80 par personnage), donc même durée.
   - Un personnage qui ne brille que parmi les obstacles, ou qu'en terrain ouvert, est mesuré sur les deux.
   - Changer les arènes du dépôt déplace donc l'équilibrage : après tout ajout d'arène, relancer `node tools/brawl.ts --tune`.
   - Nouvelle option `--only <id>` pour ne régler qu'un personnage.
4. Les 6 personnages ont été réajustés sur cette épreuve : **49 à 53 %**. Shino : dégâts × 1,30, budget 119,1 (max 120).

## Résultat (duels entre personnages d'origine, % de victoires)

| | ouvert | Clairière | Village | Sanctuaire |
| --- | --- | --- | --- | --- |
| Akane | 47 | 39 | 36 | 38 |
| Hikaru | 38 | 53 | 62 | 48 |
| Kaminari | 64 | 53 | 52 | 52 |
| Rubis | 61 | 50 | 47 | 37 |
| Rōnin | 33 | 41 | 49 | 47 |
| Shino | 57 | 64 | 54 | 78 |

## Limites

- **Correction partielle.** Shino reste au-dessus de la moyenne sur les cartes, nettement au Sanctuaire, et Akane perd encore ce duel-là.
- La force restante de Shino est le **shunpo** : ruée de 9 m sortie en 0,1 s.
  - Le budget ne le compte presque pas (1,2 point), car le calibrage a trouvé les ruées faibles sur des kits aléatoires.
  - On ne peut donc pas l'affaiblir et compenser ailleurs sans dépasser le maximum.
  - Une vraie correction demande de recalibrer le prix des ruées dans le barème (`data/balance/brawl-costs.json`). C'est un changement du contrat commun, qui déplace tous les personnages : à décider.
- Les écarts entre deux personnages (par exemple Kaminari contre Rōnin, 85 %) ne sont pas mesurés par l'épreuve, qui ne regarde que la moyenne contre le panel.
- `tools/brawl-field.ts --gauntlet-check` reste en terrain ouvert : c'est un contrôle du barème, pas de l'équilibre final.
