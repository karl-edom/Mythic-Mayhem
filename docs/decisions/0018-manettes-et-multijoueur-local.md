# 0018 — Manettes et multijoueur local (étape B)

Date : 2026-10-17. Statut : **acceptée**.

> « Attaque le sujet des manettes oui (le clavier c'est chiant). »

## Décision

- **Jusqu'à 4 manettes et le clavier en même temps**, chacun pilotant son combattant sur le même écran.
  - Dans le menu, chaque combattant a un bouton *Clavier / Manette N / Bot*.
  - **Rejoindre à la Smash** : appuyer sur **A** sur une manette prend la première place tenue par un bot. S'il n'y en a pas, la manette ajoute un combattant, dans la limite de 4.
  - **B** rend la place au bot ; **stick ←/→** change de personnage ; **Start** lance le combat.
  - En fin de match : A ou Start pour la revanche, B pour revenir au choix des combattants.
- **Disposition des boutons**, à la Smash (noms Xbox ; sur PlayStation, A = ✕, B = ○, X = □, Y = △) :

| Bouton | Action |
| --- | --- |
| Stick gauche | se déplacer, plus ou moins vite selon l'inclinaison (zone morte circulaire, puis montée progressive) ; la croix aussi |
| A | attaque légère, coup aérien en l'air |
| X (maintenir) | attaque lourde chargeable |
| B | spéciale 1 ; **B + stick incliné** : spéciale 2 |
| LT | spéciale 3 |
| Y | saut (maintenu : saut complet ; tapé : petit saut ; en l'air : double saut) |
| RB (maintenir) | bouclier ; relâché juste avant l'impact : parade |
| RT | esquive ; sous les coups : dégagement |
| LB | ramasser, puis lancer |
| Croix bas (maintenir) | recharger l'énergie |
| Start / Select | pause / aide |

- **Vibration** quand on touche (légère) et quand on est touché (plus forte pour un coup lourd, un bris de bouclier ou un K.-O.), si le navigateur la gère.
- **Caméra partagée** dès que deux joueurs humains jouent, même en duel : c'est la seule qui marche à plusieurs sur un même écran. Avec un seul humain en duel, la caméra derrière l'épaule reste.
- **Écran** :
  - étiquettes J1 à J4 pour les humains, CPU2 à CPU4 pour les bots ;
  - chaque panneau affiche les boutons de *son* joueur (touches du clavier ou boutons de manette) ;
  - l'aide (Select ou H) montre la disposition de la manette dès qu'une manette est branchée.
- La simulation ne change pas : chaque joueur produit les mêmes commandes qu'un bot.

## Tests

4 tests (`tests/input.test.ts`) :
- la zone morte et la montée progressive du stick ;
- la disposition des boutons ;
- B seul, B avec le stick incliné, puis LT donnent les spéciales 1, 2, 3 ;
- deux manettes pilotent chacune leur combattant.

Vérifié aussi dans le navigateur avec une manette simulée : rejoindre avec A, changer de personnage au stick, lancer avec Start, se déplacer au stick.

## Limites

- Le menu reste à la souris pour les réglages (nombre de combattants, mode, arène). Les manettes peuvent seulement rejoindre, choisir leur personnage et lancer.
- La vibration n'existe pas dans tous les navigateurs (Firefox l'ignore).
- Pas encore d'écran pour changer l'affectation des boutons.

## Correctif : recharge à la manette (2026-10-17)

> « Il semblerait que la touche pour recharger l'énergie ne fonctionne pas. »

- Au clavier (E maintenu) comme avec une manette standard (croix bas maintenue), la recharge marchait dans nos essais.
- Mais beaucoup de manettes non standard (Bluetooth, PlayStation dans certains navigateurs) donnent la croix directionnelle comme un **axe** et non comme des boutons. Leur « croix bas » n'était donc jamais lue. Le jeu lit maintenant la croix de ces manettes sous ses deux formes courantes : l'axe « chapeau » (n° 9), ou la paire d'axes 6 et 7. Cela vaut pour le combat comme pour les menus.
- Seconde façon de recharger, valable sur toutes les manettes : **maintenir le clic du stick gauche**. On est immobile pendant la recharge, donc le pouce est libre.
- Testé : `tests/input.test.ts`.
