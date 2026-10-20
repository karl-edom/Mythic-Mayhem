# 0025 — Village japonais à plusieurs étages et nouveau rendu

Date : 2026-10-19. Statut : **acceptée** (à valider en jeu par le porteur de projet).

> « Trouver un moyen d'améliorer considérablement les graphismes du jeu (environnement et personnages et attaques). Pour l'environnement, il faut créer quelque chose qui ressemble à un vrai village japonais sur lequel on peut grimper etc, traverser des maisons etc. On se concentre sur cette map pour le moment. […] Si on arrive à atteindre les graphismes d'un Super Smash déjà ce serait pas mal (mais c'est le minimum). »

## Ce qui change pour le joueur

- **Une nouvelle carte par défaut, « Village japonais » (64 × 48 m).**
  - **La rue principale** : les maisons de marchands (*machiya*) se font face des deux côtés, avec des treillis (*kōshi*), des rideaux de porte (*noren*) qui bougent, des lanternes et des enseignes peintes.
  - **Les maisons se traversent** : porte sur la rue, porte de derrière, sol en tatami. **Un escalier intérieur** monte à l'étage, dont les fenêtres sont à hauteur d'appui. **Les toits de tuiles sont des pentes** sur lesquelles on monte et on se bat.
  - **Au nord, un sanctuaire** : torii vermillon, escalier de pierre, terrasse, salle avec plancher et toit à deux pans.
  - **Au sud** : une rivière avec un pont en arc, des cerisiers, un puits, une tour de guet (plancher à 3,6 m, escalier) et des échoppes.
- **Tout reste cassable**, comme décidé le 2026-10-16 (décision 0006), avec des PV élevés pour le bâti. Barèmes : murs 500, planchers 600, toits 700, escaliers 400, poteaux 300, terrasse 900. Celui qui se tient sur un plancher qui casse tombe.
- **La caméra garde sa distance à l'intérieur des maisons.** Les murs, planchers et toits placés entre elle et le joueur deviennent transparents. Avant, elle se collait au dos du personnage.
- **Le rendu change** sur toutes les cartes : ombres de contact, halo lumineux sur ce qui brille, couleurs étalonnées, liseré de lumière sur les personnages (détails plus bas).

| Nouveauté | Contre-jeu | Indicateur visuel |
| --- | --- | --- |
| Étage et toits | Les techniques à distance et les sauts atteignent le haut ; on peut casser le plancher sous l'adversaire. | Le plancher se fissure à 2/3 puis à 1/3 de ses PV, puis éclate en débris. |
| Se cacher dans une maison | Les murs cassent ; les bots y entrent par les portes. | Les murs entre la caméra et un combattant s'effacent (opacité 12 %). |
| Escaliers intérieurs | Celui qui monte tourne le dos et se fait rattraper en bas. | Marches visibles, en bois clair. |

## Contrat commun : ce qui change (documenté et testé)

Le format des cartes (`data/arenas/*.json`) s'étend. Les cartes existantes restent valides sans modification.

| Champ | Effet | Bornes validées |
| --- | --- | --- |
| `y` sur un placement | L'élément commence à cette hauteur : plancher d'étage, toit, passage dessous. On peut passer **sous** l'élément, et il ne bloque ni la vue ni les coups à une autre hauteur. | 0 à 30 m |
| `w`, `d`, `h` sur un placement | Dimensions propres à ce placement : une seule sorte de mur sert à toutes les longueurs. | 0,05 à 120 m |
| `decor` | Liste d'ornements **dessinés seulement**, sans effet sur la simulation : lanternes, treillis, faîtages, eau, pétales. Un ornement attaché à un élément (`on`) disparaît avec lui. | 3 000 au plus ; l'apparence se limite aux caractères `a-z0-9-` |
| `floor` | Nom d'un sol peint (pavés, terre, herbe). Dessiné seulement. | — |

- **Plafonds.** 800 éléments par carte (contre 200 auparavant) et 3 000 ornements.
- **Bots.** Ils trouvent leur chemin (A* sur une grille de 0,5 m) : par les portes, les ruelles et les escaliers.
- **Tests (`tests/arena.test.ts`)** : plancher surélevé, mur avec porte, vue sous un toit, navigation par une porte, validation du nouveau format. La suite complète passe (92 tests).

## Rendu : la chaîne d'image

Tout repose sur les exemples officiels de three.js (`three/examples/jsm`), déjà présents dans la dépendance three : **aucune nouvelle dépendance**, même licence MIT, rien de plus à télécharger.

1. **La scène et le contour encré** des combattants.
2. **L'occlusion ambiante (GTAO)** assombrit les angles, le dessous des avant-toits et les pieds. C'est ce qui pose les objets au sol.
3. **Le bloom** fait rayonner ce qui est très lumineux : lanternes, techniques, éclairs.
4. **L'étalonnage** : un peu plus de saturation et de contraste, une teinte chaude, un léger vignettage.
5. **Le tone mapping**, sur un rendu en virgule flottante avec anticrénelage (MSAA ×4).

Le reste du rendu :

- **La lumière d'environnement** éclaire les matières PBR du village de façon cohérente avec le ciel.
- **Le liseré de lumière** (*rim light*) détache les personnages du décor, comme dans Smash.
- **Les matières du village** étaient peintes en code (enduit, bois, tuiles *kawara*, pavés, tatami), avec des **reliefs (normal maps)** tirés de la même peinture. Depuis le 2026-10-20, la plupart sont des **textures photo CC0** ; la peinture reste en repli (voir « Textures photo CC0 » plus bas).
- **La qualité s'adapte seule.** Si les images prennent plus de 24 ms en moyenne, l'occlusion s'éteint d'abord, puis le bloom et un peu de résolution.

**Correctif général.** Depuis three r151, un matériau opaque est compilé avec un shader qui force l'opacité à 1. Passer `transparent` à vrai sans reconstruire ce shader laissait donc les murs « transparents » tout à fait opaques : seul le contour du joueur restait visible. Ce défaut touchait toutes les cartes ; il est corrigé.

## Par rapport à Super Smash Bros. Ultimate : franchement

Atteint :

- un décor lisible et dense ;
- des ombres de contact ;
- un halo sur les effets ;
- des personnages détachés du fond ;
- une image propre, sans crénelage.

Pas atteint :

- Smash utilise des modèles et des textures faits à la main par des artistes (des milliers de polygones et de vraies textures peintes par personnage). Les nôtres sont **construits en code**, pour ne rien importer sous licence. Pour monter encore d'un cran, il faudra des modèles faits par vous ou sous licence libre, rangés dans `packs/local/`.
- Pas encore de flou de mouvement ni de profondeur de champ.

## Textures photo CC0

Ajout du 2026-10-20, après l'autorisation des ressources CC0 dans le dépôt.

**Ce qui change à l'écran.** Les pavés, l'enduit, le bardage, le bois, les planchers, la pierre, la terre et le gravier sont maintenant des **photos scannées** (Poly Haven, CC0 1.0), avec leur couleur, leur relief et leur rugosité. On voit le grain de la pierre, les joints irréguliers des pavés, les nœuds du bois, les taches de l'enduit. L'image avant/après compare la rue, une maison, les toits et le sanctuaire avec les mêmes caméras.

| Surface | Texture choisie | Pourquoi celle-ci |
| --- | --- | --- |
| Pavés de la rue | Rock Tile Floor (2K) | Dalles de granit rectangulaires, proches des *ishidatami* de Kyoto. |
| Enduit des murs | Plaster Grey 04 (2K) | Enduit à la chaux discret. Contraste réduit pour ne pas faire « béton ». |
| Bardage sombre | Black Painted Planks | Planches verticales, comme le bas des *machiya*. Passé en niveaux de gris puis teinté brun : la teinte d'origine virait à l'orange. |
| Poteaux et poutres | Wood Table Worn | Grain continu, sans joints de planches. |
| Planchers | Hinoki Planks | Du *hinoki*, le cyprès japonais des planchers traditionnels. |
| Pierre (terrasse, escaliers) | Japanese Stone Wall | Maçonnerie japonaise en blocs irréguliers. |
| Terre et gravier | Dirt Floor, Bicolour Gravel | Terre claire et gravier gris de sanctuaire. |

**Deux surfaces restent peintes, parce qu'elles rendent mieux ainsi :**

- **les tuiles *kawara*** : aucune photo CC0 ne montre des rangées de tuiles rondes japonaises. La meilleure candidate (Grey Roof Tiles) donnait un toit d'ardoises bleuté, couvert de lichen jaune, et on ne reconnaissait plus un toit japonais ;
- **le tatami** : la photo CC0 (Tatami Mat) existe, mais elle perd le quadrillage des bordures sombres (*heri*) qui rend le tatami peint immédiatement lisible.

**Comment c'est branché.**

- **Couleurs.** La couleur moyenne de chaque photo est ramenée à celle de la surface peinte qu'elle remplace. Les teintes par élément (`color`, multipliée par la texture) restent donc justes : mur crème, bois sombre du sanctuaire, planches claires de l'escalier.
- **Rugosité.** Les cartes sont ramenées à une moyenne de 200/255. La rugosité du matériau est divisée d'autant, si bien que la valeur réglée par élément reste la moyenne.
- **Le sol.** La peinture du sol produit aussi un **masque** : la part de pavés, de gravier et de terre à chaque pixel. Un shader mélange les trois photos, répétées en mètres, selon ce masque. L'herbe, la mousse et le lit du ruisseau restent peints. Les bords restent fondus comme avant.
- **Chargement.** Les images se chargent au démarrage, en même temps que les modèles (`loadPhotoTextures`), depuis `assets/textures/`, en chemin relatif à la page. Couleur en sRGB, normale et rugosité en linéaire, répétition, anisotropie ×8 et mipmaps.
- **Repli.** Une surface dont une image ne se charge pas reste peinte, sans bloquer les autres. C'est vérifié en coupant l'enduit et les pavés : seuls ces deux-là redeviennent peints, avec un avertissement dans la console.
- **Page publiée.** Les images de `public/assets/` doivent y être publiées comme fichiers annexes, au même chemin relatif.

**Poids : 6,6 Mo** pour 8 surfaces × 3 images WebP. Les pavés (2,0 Mo) et l'enduit (1,1 Mo) sont en 2K, le reste en 1K. Le détail par fichier est dans `public/assets/CREDITS.md`. Aucune nouvelle dépendance : la conversion utilise `sharp`, déjà présent.

**Limites.**

- Le gain se voit surtout **de près** : pavés, pierre, enduit. Vu de loin, depuis la caméra de combat, l'écart avec la peinture est modeste, car la géométrie reste simple (murs plats, toits en pente lisse).
- Le gravier n'apparaît qu'autour de la terrasse du sanctuaire. Il pèse 1,3 Mo pour peu de surface visible : c'est le premier à réduire en 512 px si le poids compte.
- Le grain du bois suit l'axe horizontal de la texture, comme avant : sur les poteaux verticaux, il est couché.
- Le chargement ajoute 6,6 Mo au premier lancement.
- Tout est vérifié dans un navigateur sans carte graphique (SwiftShader). La cadence reste à mesurer sur une vraie machine : il y a jusqu'à 9 textures de plus sur le sol.

## Limites connues

- Le rendu est vérifié dans un navigateur sans carte graphique (SwiftShader). Sur une vraie machine, il faut mesurer la cadence ; la qualité adaptative est là pour ça.
- Un toit dont les murs ont cassé reste en l'air. C'est un choix de lisibilité : la règle « on tombe si le plancher casse » s'applique, mais rien ne s'effondre en chaîne.
- Les ornements attachés à un mur (rideau, lanterne) disparaissent avec le mur. Ceux attachés à l'auvent restent tant que l'auvent tient.

## Équilibrage après ces changements

La gauntlet de référence inclut désormais le village. Elle a été relancée sur les 16 packs locaux, en tenant compte des nouvelles règles de sortie de combo (décision 0024).

- 14 packs restent dans la bande de 40 à 60 % de victoires.
- Deux en sortaient, Conker (76 %) et Donatello (66 %). Leurs dégâts ont été réduits par `--tune` : ils sont maintenant à 53 % et 50 %.

Les packs sont dans `packs/local/` et ne sont donc pas commités.
