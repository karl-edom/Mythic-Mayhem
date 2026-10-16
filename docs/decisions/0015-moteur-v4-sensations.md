# 0015 — Moteur v4 : aisance, fluidité, lisibilité

Date : 2026-10-16. Statut : **acceptée**.

Demande du porteur de projet :

> « Le principal à l'instant est d'avoir un moteur de combat fantastique. Donc une aisance à se déplacer et une fluidité dans les mouvements et les attaques ainsi qu'une lisibilité forte de ce qui se passe dans le combat (le but n'est pas d'envoyer 100 attaques/seconde en massacrant un clavier ou une manette). »

Les recalibrages du barème sont repoussés : une grande quantité de personnages arrive ensuite.

## Constat (moteur v3)

| Pilier | Problème |
| --- | --- |
| Aisance | En l'air, le personnage s'arrête net dès qu'on lâche la direction, et il se fige à l'horizontale pendant un coup aérien. |
| Aisance | Il regarde toujours l'adversaire, même en courant ailleurs : il recule ou marche en crabe. Ce sont les animations les moins belles, et elles cachent où il va. |
| Aisance | Les coups ne bougent pas : à 20 cm trop loin, on frappe dans le vide. |
| Fluidité | L'arrêt sur image à l'impact n'était qu'un gel de l'animation, alors que la simulation continuait : le recul glissait pendant que la pose restait figée. |
| Lisibilité, anti-martelage | Le combo de 3 coups continuait même dans le vide : marteler J était toujours rentable. |
| Lisibilité | Rien n'annonçait un coup lourd ou une spéciale. On ne voyait pas à quelle force on était éjecté. |

## Décision

Contrat de combat commun, dans `src/brawl/world.ts` (nouveaux paramètres de `BrawlConfig`) :

| Règle | Chiffres | Contre-jeu | Indicateur visuel |
| --- | --- | --- | --- |
| **Élan aérien** : le saut garde la vitesse de la course. En l'air, la direction oriente vers la vitesse de course ; relâchée, la vitesse s'éteint doucement. Le double saut peut repartir dans une autre direction. Remplace `airControl` (0,7 de la vitesse, sans élan). | `airAccel` 16 m/s², `airDrag` 2,5 m/s² | une trajectoire aérienne est engagée : on peut la lire et attendre la retombée | la course du saut elle-même |
| **On regarde où l'on court.** À l'arrêt, on se retourne vers l'adversaire. Coups, bouclier et spéciales visent toujours l'adversaire. | — | tourner le dos coûte un instant pour se retourner avant de frapper (le coup se tourne vers la cible à son départ) | le personnage pivote visiblement, lissé à l'écran |
| **Les coups avancent** pendant leur démarrage, et s'arrêtent dès que la cible est à portée. Pas pour les coups aériens. | légère 0,45 m, lourde 0,9 m | reculer d'un pas de plus que l'avancée | le pas en avant |
| **Gel à l'impact** (*hitlag*) : à chaque contact, l'attaquant et la cible se figent ensemble. L'étourdissement et le recul partent après. Un coup bloqué gèle moins. Projectiles et zones ne gèlent que la cible. | 3 images + 1 image par 30 dégâts, 12 images au plus ; bloqué × 0,6 | le dégagement part même pendant le gel | les deux corps figés, la cible tremble sur place |
| **Le combo ne continue que si le coup précédent a touché** : un combattant, un bouclier ou un élément cassable. Dans le vide : un seul coup, et toute sa fin de coup. | — | se tenir hors de portée punit le martelage | le coup unique et sa fin de coup |

Rendu seulement :

- **Éclat d'annonce** : une étoile brève sur l'attaquant au départ d'un coup lourd (orange) ou d'une spéciale (couleur du personnage).
- **Traînée d'éjection** : des bouffées de fumée derrière un combattant éjecté fort. Plus il va vite, plus elles sont grosses.
- **Rotation lissée** du personnage (≈ 0,1 s).
- Le gel global de l'image ne sert plus que pour les K.-O., les parades, le dégagement et les bris de bouclier ; le gel des coups vient maintenant de la simulation.

## Effets mesurés

- Tests : 5 nouveaux tests (gel à l'impact, combo au contact, orientation, élan aérien, avancée des coups) ; le test du dégagement passe, puisque le dégagement reste possible pendant le gel.
- L'équilibrage bouge nettement : avant réglage, contre le panel, Shino monte à 77 % et Hikaru à 64 %, tandis que Rubis tombe à 33 %, Akane à 36 % et Kaminari comme Rōnin à 42 %. L'avancée des coups et l'élan profitent aux combattants rapides au corps à corps.
- Après l'épreuve relancée (`node tools/brawl.ts --tune`, dégâts seuls), les 6 personnages sont entre 48 et 52 %. Facteurs appliqués : Akane × 1,19, Hikaru × 0,84, Kaminari × 1,23, Rōnin × 1,01, Rubis × 1,30, Shino × 0,79.

## Limites

- Les animations restent celles de KayKit, reciblées. Le moteur est plus fluide, mais certaines poses (coups aériens, réception) gagneraient à des animations dédiées.
- Pas encore de sprint ni de demi-tour animé : la course est à vitesse fixe.
- Les écrans de test en logiciel (sans carte graphique) ne permettent pas de juger le ressenti en mouvement : **c'est à juger manette en main**. Les chiffres sont des réglages dans `BRAWL_CONFIG`.

## Correctif : personnages « transparents » en mouvement (2026-10-16)

> « Quand on se déplace, les personnages semblent devenir un peu transparents… le mouvement est si rapide qu'il devient plus transparent. »

Trois causes, toutes corrigées (rendu seulement, la simulation ne change pas) :

1. **Pas d'interpolation entre deux pas de simulation.** La simulation avance par pas de 1/60 s, et l'image montrait la position du dernier pas. Sur un écran à plus de 60 Hz, ou dès que les images et les pas se décalent, le corps avance par sauts inégaux. L'œil voit alors deux silhouettes superposées.
   → Chaque image dessine maintenant la position intermédiaire exacte entre le pas précédent et le suivant : combattants, projectiles et caméra.
2. **L'animation basculait entre course et repos.** L'animateur mesurait la vitesse d'une image à l'autre. Une image sans pas de simulation donnait une vitesse nulle, donc le repos, puis la course repartait du début.
   → La vitesse est maintenant mesurée sur la position dessinée, et lissée.
3. **Les jambes moulinaient.** La course reciblée a de petites foulées : elle était jouée jusqu'à 2,2 fois sa vitesse, soit 5,5 pas par seconde.
   → Les foulées sont plus amples : jambes × 1,12, alors que le buste reste sobre. La cadence est plafonnée à **4 pas par seconde** (un léger glissement des pieds vaut mieux qu'un flou).
   → Le cycle est **recalé au sol** : à chaque image, le bassin descend pour que le pied d'appui touche le sol. Avant, le corps flottait sur des jambes pliées.
