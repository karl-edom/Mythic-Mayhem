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

## Arbres du village

Ajout du 2026-10-20 (étape 1 de la piste A : de vrais arbres plutôt que des volumes lisses).

**Ce qui change à l'écran.** Les cerisiers, les pins noirs et les bambous du village ne sont plus des boules et des plateaux lisses.

- **Les cerisiers** : un tronc noueux en écorce photo, 5 à 6 branches maîtresses qui se divisent en rameaux, et environ 2 200 petites grappes de fleurs détourées par arbre. On voit le ciel à travers la couronne.
- **Les pins noirs taillés** (*kuromatsu*) : un tronc penché et tordu en écorce photo, et des plateaux plats faits de touffes d'aiguilles.
- **Les bambous** : des cannes cintrées avec leurs nœuds, des rameaux latéraux et des feuilles longues qui pendent.
- **Le vent** : tout le feuillage ondule. Chaque carte bouge un peu différemment, et davantage aux extrémités.

**Comment c'est fait.**

- **Branches.** Ce sont des tubes qui s'affinent le long de courbes, avec l'écorce posée dans le sens du bois. L'écorce est une photo CC0 (Poly Haven : *Chinese Hackberry Bark* pour les cerisiers, *Pine Bark* pour les pins), avec une couleur unie en repli.
- **Feuillage.** Ce sont des centaines de petites cartes découpées par test alpha (`foliage.ts`). Les images des cartes (grappes de fleurs à cinq pétales, touffes d'aiguilles, feuilles de bambou) sont **peintes en code**. Les atlas de feuilles CC0 d'ambientCG étaient prévus, mais leur serveur de téléchargement (`acg-download.struffelproductions.com`) est bloqué par le réseau de l'environnement. Ceux de Poly Haven n'offrent ni fleurs de cerisier ni aiguilles de pin utilisables.
- **Volume.** Les normales des cartes pointent hors de leur grappe : la couronne s'éclaire comme un volume et non comme une pile de cartes plates.
- **Ombres.** Le feuillage porte des ombres, mais n'en reçoit pas : des milliers de cartes s'assombrissaient les unes les autres jusqu'au noir.
- **Coût.** Environ 28 000 cartes pour tout le village (56 000 triangles), en 3 matériaux de feuillage qui partagent le même shader.

**Deux défauts corrigés au passage (contrat de rendu commun).**

- **L'occlusion ambiante (GTAO)** dessinait les cartes découpées comme des carrés pleins, et assombrissait donc des carrés entiers. Les matériaux à test alpha sont maintenant exclus de ce passage, comme les objets transparents l'étaient déjà.
- **Le contour encré** : la mise à jour des éléments du décor (`syncProps`) le rallumait sur tous les props, même ceux construits sans (`noOutline`, c'est-à-dire tout le village). Le feuillage des cerisiers, rattaché à leur tronc, était alors encré carte par carte, d'où une couronne violet sombre. Seuls les props construits avec un contour le retrouvent désormais. Sur les maisons, l'écart est presque invisible.

| Nouveauté | Contre-jeu | Indicateur visuel |
| --- | --- | --- |
| Feuillage dense des cerisiers | Purement visuel : la collision reste celle du tronc. La caméra efface l'arbre s'il cache un combattant, comme avant. | Couronne détourée : on voit à travers. |

**Poids : 0,9 Mo** de plus (deux écorces). Le total de `public/assets/textures/` passe à 7,5 Mo.

**Limites.**

- Les fleurs et les aiguilles sont peintes, pas photographiées. De très près, ça se voit.
- Les arbres de l'arrière-plan (`landscape.ts`) sont encore les anciens volumes lisses : c'est l'étape 2.
- La cadence reste à mesurer sur une vraie machine : le test alpha de milliers de cartes coûte surtout en remplissage de pixels.

## Tuiles en relief

Ajout du 2026-10-20. Vues depuis la caméra de combat, les tuiles des toits et des auvents passent sans cesse au premier plan. Peintes à plat, elles faisaient un quadrillage brillant.

- **Les tuiles ont maintenant un vrai relief** : des rangées de tuiles rondes tous les 25 cm sur des tuiles creuses, en rangs qui descendent en gradins (33 cm), et une tuile d'about ronde au bord sous chaque rangée.
- **Le relief suit la texture peinte**, qui reste dessus (avec un relief de texture atténué), et la photo n'a pas été retenue (voir plus haut).
- **La collision ne change pas** : le relief dépasse de 5 à 10 cm au-dessus de la pente, qui reste la surface de jeu.
- **Coût** : environ 170 000 sommets pour les 1 150 m² de toits de la carte.

## Herbe et rivière

Ajout du 2026-10-20.

- **L'herbe** : au sol, une photo CC0 (*Grass Ground*, Poly Haven), 4ᵉ couche du mélange du sol (le masque passe en 4 canaux). Par-dessus, environ 4 000 touffes de brins en cartes croisées, peintes en code et agitées par le vent. Elles sont plantées seulement là où l'herbe est la peinture du dessus : ni dans le ruisseau, ni sur un chemin, ni sous un élément du décor. Elles n'ont pas d'ombre, pour rester légères.
- **La rivière** : ses rides reprenaient le relief des pavés peints, d'où un aspect « carrelé ». Elle a maintenant un vrai relief de rides en deux couches, qui dérivent à des vitesses et des échelles différentes (surface et vernis), si bien qu'aucun motif ne se répète. L'eau est aussi un peu plus profonde de teinte.
- **Poids** : 0,7 Mo (une texture). Aucun effet sur le jeu : l'herbe ne bloque ni les déplacements ni la vue.

## Usure des murs et pierre des lanternes

Ajout du 2026-10-20.

- **L'enduit vieillit** : de la terre éclaboussée au pied des murs, une bande plus sombre sous le haut du mur et des coulures de pluie de longueurs inégales. C'est calculé dans le shader de l'enduit : pas d'image en plus. L'effet est volontairement discret, pour garder les murs clairs et lisibles.
- **Les lanternes de pierre, les margelles des poteaux et les pas japonais** prennent la pierre photo à grande échelle : on voit le grain de la pierre, sans joints de maçonnerie. Avant, c'était un gris uni.

## Arbres de l'arrière-plan (étape 2)

Ajout du 2026-10-20.

- **Autour des murs**, c'est-à-dire dans un rayon d'environ 80 m, là où on les voit pendant un combat, les arbres de la campagne sont maintenant de vrais arbres, comme dans le village : des cerisiers en fleurs (tronc en écorce photo, couronne en cartes) et des bosquets de bambous denses (13 cannes par touffe, deux touffes par emplacement). Chaque espèce existe en 3 variantes, chacune dessinée une seule fois pour toutes ses copies (instanciation), avec un feuillage allégé (60 % des cartes, plus grandes). Un cèdre du Japon (*sugi*) est prêt pour les cèdres proches.
- **Au loin**, sur les collines, les arbres restent en volumes simples, noyés dans la brume. Ils sont même allégés : des sphères moins subdivisées, sans différence visible à cette distance.
- **Bilan** : la scène passe de 3,3 à 2,2 millions de triangles tout en montrant de vrais arbres (82 000 cartes de feuillage au fond, 35 000 dans le village). Les arbres du fond ne portent ni ne reçoivent d'ombre.

## Effets d'attaque

Ajout du 2026-10-20. Les effets sont comparés sur un « tableau d'effets » : le jeu est mis en pause, chaque effet est déclenché à la main et figé au même instant de sa vie, avec la même caméra.

- **Impact** : une explosion de rayons pointus façon anime (blanche, sur une gerbe à la couleur de l'attaquant), un éclair blanc bref et des étincelles qui jaillissent, retombent et s'étirent selon leur vitesse. Avant, c'était une étoile floue et des traits flous.
- **Coup bloqué** : un bouclier hexagonal translucide qui apparaît d'un coup, et des étincelles qui rebondissent dessus. Avant, c'était une lueur ronde.
- **K.-O.** : une image d'impact, c'est-à-dire une immense gerbe de rayons à la couleur du vainqueur pendant un éclair (0,2 s), par-dessus le reste.
- **Ondes de choc** (coups forts, mises à terre, contre-attaques) : un anneau dégradé à front net qui part vite et ralentit. Au sol, la poussière est projetée le long du front.
- **Traînée d'arme** : elle est lissée le long d'une courbe et non plus en segments cassés, avec une couleur pleine et un bord blanc chauffé.
- **Lisibilité d'abord** : une première version noyait les coups forts et le K.-O. dans le blanc, parce que le halo lumineux amplifie le blanc additif. Le flash a été réduit, les anneaux affinés et l'image d'impact teintée. On doit toujours voir les combattants.
- **Coût** : quelques sprites de plus par coup et 4 petites textures peintes en code. Rien ne change pour la simulation.

## Limites connues

- Le rendu est vérifié dans un navigateur sans carte graphique (SwiftShader). Sur une vraie machine, il faut mesurer la cadence ; la qualité adaptative est là pour ça.
- Un toit dont les murs ont cassé reste en l'air. C'est un choix de lisibilité : la règle « on tombe si le plancher casse » s'applique, mais rien ne s'effondre en chaîne.
- Les ornements attachés à un mur (rideau, lanterne) disparaissent avec le mur. Ceux attachés à l'auvent restent tant que l'auvent tient.

## Équilibrage après ces changements

La gauntlet de référence inclut désormais le village. Elle a été relancée sur les 16 packs locaux, en tenant compte des nouvelles règles de sortie de combo (décision 0024).

- 14 packs restent dans la bande de 40 à 60 % de victoires.
- Deux en sortaient, Conker (76 %) et Donatello (66 %). Leurs dégâts ont été réduits par `--tune` : ils sont maintenant à 53 % et 50 %.

Les packs sont dans `packs/local/` et ne sont donc pas commités.

## Correctif : on traversait les murs et les planchers (2026-10-20)

Signalé en jeu : « on peut un peu traverser les murs en sautant (sol de l'étage, mur des maisons) ». Une recherche systématique sur la carte l'a confirmé et a trouvé quatre causes. Elle lance des milliers de sauts, doubles sauts, esquives en l'air et éjections contre chacun des 159 murs du village.

| Cause | Correctif (contrat de collision commun) | Test |
| --- | --- | --- |
| Rien n'arrêtait un saut par-dessous : la tête traversait le plancher de l'étage, puis on se posait dessus | **Plafond** : en montant, la tête bute contre le dessous de ce qui est au-dessus (plancher, toit, poutre), et la montée s'arrête | « on ne traverse pas un plancher en sautant dessous » |
| En l'air, la tolérance de marche (0,45 m) laissait le corps entrer dans un volume (l'auvent) ; ce volume le recrachait ensuite par la face la plus proche, à travers le mur | La marche ne vaut qu'**au sol**. En l'air, un volume bloque dès que le corps le chevauche, et on ne se pose dessus qu'en arrivant par le dessus. Un corps resté enfoncé de moins d'une marche est remonté sur la surface | « on ne se pose pas sur un mur coiffé d'un autre mur » |
| Un corps enfoncé dans un volume épais en sortait par la face la plus proche, parfois le côté opposé | Il sort **par le côté d'où il vient** | « enfoncé dans un volume épais, on en sort par le côté d'où l'on vient » |
| Éjecté à 25-30 m/s, on parcourait 0,5 m en une image : plus que la moitié d'un mur fin | Un déplacement rapide est **découpé en petits pas**, chacun vérifié contre les murs | « éjecté à pleine vitesse contre un mur fin, on reste du bon côté » |

Il faut aussi une **hauteur libre** : on ne peut pas monter ni se tenir sur un dessus qui n'a pas la hauteur d'un corps (1,8 m) libre au-dessus, à l'endroit où l'on pose le pied. Par exemple, le haut d'un mur du rez-de-chaussée, juste sous le mur de l'étage.

**Conséquence sur la carte.** La fenêtre de l'étage ne laissait que 1,2 m de passage, alors qu'on la franchissait pour sortir sur l'auvent. Elle devient une **baie ouverte du plancher à l'avant-toit** (2 m) : le passage étage → auvent → rue reste possible, sans traverser de mur.

**Contre-jeu et indicateur.** Rien de nouveau : ce sont les murs et les planchers qui tiennent enfin. Un saut sous un plancher s'arrête net, tête contre le plancher.

**Vérification.**
- La recherche ne trouve **aucune traversée sur 6 600 essais** (11 tirages de 600), contre 3 à 6 sur 600 avant les correctifs.
- Le parcours porte → escalier → étage → baie → auvent → rue fonctionne dans les deux sens.
- Les 96 tests passent.
