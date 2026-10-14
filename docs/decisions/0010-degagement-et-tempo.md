# 0010 — Dégagement, tempo ralenti, animations amplifiées

Date : 2026-10-14. Statut : **acceptée** (« le harcèlement est trop puissant… on ne peut jamais se défaire d'un ennemi qui commence à nous agresser, surtout Shino ; réduire la vitesse du jeu et remédier à ce problème » ; « les mouvements sont trop restreints pour être crédibles »).

## Le problème

Un combattant rapide enchaîne ses coups légers plus vite que la fin de l'étourdissement ou du blocage de l'adversaire : un coup bloqué immobilise 0,2 s, et le coup suivant de Shino démarre en 0,08 s. Une fois sous pression, la victime n'avait aucune action disponible avant la mise au sol : ni garde, ni esquive, ni contre.

## Ce qui change

| Domaine | Avant | Après |
| --- | --- | --- |
| Sortie de pression | aucune | **Dégagement** (règle commune, `BRAWL_CONFIG.breaker*`) : Maj pendant qu'on encaisse des coups, un coup bloqué ou en garde. Il coûte 50 d'énergie, repousse les ennemis proches sans dégât et rend invulnérable 0,4 s. |
| Tempo | temps réel | **80 %** : la simulation à pas fixe avance à 0,8 × le temps réel (`GAME_SPEED`, client). Tout ralentit ensemble, donc l'équilibre n'est pas touché. |
| Bot | subissait sans réagir | Le bot utilise aussi le dégagement, plus souvent quand il est réactif. Sans cela, l'épreuve d'équilibrage mesurerait un monde où personne ne se dégage. |
| Équilibre | réglé sans dégagement | Réglé à nouveau par l'épreuve : Shino passe de 63 % à 50 % (dégâts × 0,83), les autres entre 48 et 50 %. |
| Animations des avatars | amplitude des chibis | **Amplifiées** : chaque articulation va plus loin de la pose de départ du clip. Coups et sorts × 1,5, coups reçus, esquives et chutes × 1,3, course × 1,2, attente inchangée. Le minutage de l'impact est inchangé. |
| Caméra | le joueur paraissait transparent en se déplaçant | Les rayons s'arrêtent 0,8 m avant le joueur (l'escalier ou la caisse sous ses pieds ne compte plus comme obstacle). Les éléments qui cachent le joueur passent à 12 % d'opacité au lieu de 30 %. La caméra évite aussi le feuillage des arbres. |

## Pourquoi ces choix

- **Une ressource, pas un bouton gratuit.** Le dégagement coûte une demi-jauge, soit le prix d'une grosse spéciale. Le choix « me dégager ou garder mon énergie pour attaquer » appartient au défenseur, et l'agresseur garde un moyen de jouer contre : relâcher, attendre la dépense, punir.
- **Sans dégâts.** Le dégagement achète de l'espace, pas des points de vie, pour ne pas devenir une attaque déguisée.
- **Pas depuis le sol ni garde brisée.** La mise au sol se termine déjà par un relevé invulnérable. La garde brisée est la récompense d'une attaque lourde lisible, et le dégagement ne doit pas l'annuler.
- **Ralentir l'affichage plutôt que les chiffres.** Changer toutes les vitesses obligerait à recalibrer le barème. Ralentir l'horloge garde la simulation, les tests et l'épreuve identiques.

## Tests

`tests/brawl.test.ts` : le dégagement repousse sans dégâts, coûte 50 et interrompt l'agresseur. Il est impossible sans énergie ou depuis le sol, possible depuis la garde, et invulnérable pendant l'onde. `tests/retarget.test.ts` : l'amplification donne le bon angle, laisse la pose de départ intacte et ne modifie pas le clip source.

## Limites

- Le réglage 80 % et le coût 50 sont des premiers jets. Ils sont à juger manette en main.
- L'amplification exagère aussi certains défauts des clips chibi (bras qui passent dans le torse sur quelques images). De vraies animations de combat restent la vraie solution.
