# 0017 — Combats à quatre, comme dans Smash (étape A)

Date : 2026-10-17. Statut : **acceptée**.

> « Les deux modes, mais comme dans Smash ça peut être 1 vs 3, 2 vs 2 ou 1 vs 2, on choisit. 3 vies, mais on peut aussi envisager une option où on compte le nombre de kills et l'équipe avec le plus grand nombre gagne. Caméra partagée semble OK, lance l'étape A. »

## Ce que permet l'étape A

- **2, 3 ou 4 combattants** : toi (J1) et jusqu'à 3 bots.
- **Mode** :
  - *chacun pour soi* : chacun sa couleur (rouge, bleu, jaune, vert) ;
  - *équipes* : chaque combattant est mis dans l'équipe rouge ou bleue d'un clic, ce qui donne 1 contre 1, 1 contre 2, 1 contre 3 ou 2 contre 2. Il faut au moins un combattant dans chaque équipe.
- **Victoire** :
  - *3 vies* : chacun a 3 vies ; sans vie, on est éliminé et on ne revient pas ; la dernière équipe en lice gagne ;
  - *K.-O. au temps* : on réapparaît sans fin, et à la fin du temps l'équipe qui a le plus de K.-O. gagne. Le temps est de 3 min à 3 combattants ou plus ; en duel, les 3 K.-O. terminent toujours le match.
  - À égalité, au temps : les vies restantes (ou les K.-O.), puis la part de vie restante.

## Contrat de combat (`src/brawl/world.ts`), testé

| Règle | Détail |
| --- | --- |
| `rule` : `"kills"` ou `"stock"`, `stocks` | `"kills"` reste la règle par défaut : les duels, l'épreuve et l'équilibrage ne changent pas. |
| Score par équipe, pour N équipes | Un K.-O. ne compte que contre une autre équipe. |
| Élimination (`"stock"`) | Sans vie, on ne réapparaît plus ; le match s'arrête dès qu'une seule équipe reste en lice. |
| Pas de coups entre équipiers | Déjà vrai : un coup ne touche que les autres équipes. |
| **Cible choisie** (`Command.target`) | Un combattant peut viser un ennemi précis ; sinon il vise le plus proche, comme avant. C'est une commande, donc la règle reste valable en réseau. |
| `createMatch` | Crée un match de 2 à 4 combattants ; chaque arène a maintenant **4 points d'apparition**. |

## Bots

En match à 3 ou plus, chaque bot choisit sa cible toutes les 1 à 2 s. Il prend la plus proche, mais **évite celle que d'autres attaquent déjà**, et vise un peu plus volontiers un blessé. Les bots ne s'acharnent donc pas tous sur le joueur.

## Lisibilité

- **Caméra partagée** dès 3 combattants : vue en plongée depuis un bord de l'arène.
  - Elle projette chaque combattant à l'écran et ajuste son cadrage pour que tous tiennent dans la zone libre : au-dessus des panneaux, sous le chrono.
  - Elle se rapproche quand ils se regroupent et recule quand ils s'écartent.
  - Les déplacements restent relatifs à l'écran.
  - En duel, la caméra derrière l'épaule reste.
- **Couleur de chaque combattant** : un anneau au sol et une étiquette au-dessus de la tête (J1, CPU2…), de taille fixe à l'écran.
- **Panneaux compacts** en bas de l'écran, comme dans Smash : nom, vie, énergie, et les vies (losanges de couleur) ou le nombre de K.-O. Un combattant éliminé passe en gris.
- Avec la caméra partagée, les éléments de décor deviennent transparents devant **tous** les combattants, plus seulement devant toi.
- Au passage, j'ai corrigé un bug de l'affichage : l'usure des esquives écrasait l'étiquette du dégagement et laissait une case vide.

## Limites et suite

- L'équilibrage reste mesuré en duel. À 4, les zones et les coups qui touchent plusieurs adversaires pèsent davantage : on observe avant de régler.
- Un seul humain pour l'instant. **Étape B** : plusieurs manettes sur un même écran, à faire en même temps que la question clavier ou manette.
- **Étape C** : le jeu en ligne, plus tard.
