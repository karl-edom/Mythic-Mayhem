# 0020 — L'épéiste : modèle en code, saut plongeant, contre, noms des techniques

Date : 2026-10-17. Statut : **acceptée**.

> « On va construire le personnage Kenshin. Le pantalon est rouge/bordeaux, sinon le reste est fidèle. […] Une attaque aérienne où il saute très haut dans le ciel et tranche vers le bas (la flèche du dragon). L'Éclat de la Spirale du Dragon : une attaque en rotation à 360° utilisée pour esquiver une charge et contre-attaquer dans le dos. Le Dragon à Neuf Têtes : frappe simultanément les neuf points vitaux en une fraction de seconde. […] On pourrait animer ses attaques avec de petits signes japonais (le nom de l'attaque ?). »

## Ce qui est commité, et ce qui reste local

- **Commité (générique)** :
  - le modèle `swordsman` : gi, hakama plissé, obi, tabi et zōri, fourreau à la ceinture, mèches en pointes et queue de cheval ;
  - le sabre `Sakabato` (tranchant inversé) ;
  - deux nouvelles livraisons de spéciales ;
  - les noms de techniques affichés à l'écran.

  Rien de tout cela ne nomme ni ne fixe un personnage. Les couleurs des cheveux et du hakama viennent du `look`, et la cicatrice en croix est une pièce optionnelle (`Scar_Cross`) qui n'apparaît que si le pack la demande.
- **Local, non commité** (`packs/local/kenshin/`) : le nom, la description, les couleurs (cheveux roux, hakama bordeaux), le kit et les noms en kanji des trois techniques.

## Contrat de combat (`src/brawl/world.ts`), testé

| Livraison | Effet | Contre-jeu | Indicateur visuel |
| --- | --- | --- | --- |
| **`leap`** (`range`, `height`, `radius`) : le saut plongeant | Après le démarrage, le combattant saute à `height` m et retombe sur la cible (jusqu'à `range` m) en suivant un arc fixe. Il frappe tout ce qui est dans le cercle `radius` à l'atterrissage. | Le cercle d'atterrissage est visible dès l'envol : sortir du cercle, ou garder. On peut aussi le toucher en l'air, ce qui annule la frappe et efface le cercle. | Le cercle au sol, le saut lui-même, le sabre levé au-dessus de la tête |
| **`counter`** (`window`) : le contre en rotation | Pendant `window` s, un coup porté au contact (corps à corps ou ruée) est esquivé. Le combattant passe dans le dos de l'attaquant et frappe. Après un contre réussi, la récupération est réduite de moitié. | Ne pas frapper au contact pendant la posture : les projectiles et les zones la traversent. Une posture qui n'attrape rien laisse toute sa récupération, qui se punit. | Une colonne pâle qui respire autour du combattant, et sa posture basse, sabre le long de la hanche. Au contre : éclair blanc et anneau. |

- **Budget** :
  - le saut est compté comme une zone lancée à la même distance, dont le délai est le temps de vol ;
  - le contre est compté à `1 + fenêtre × 0,5` ;
  - facteurs de livraison provisoires : 0,69 pour le saut, 0,6 pour le contre (`data/balance/brawl-costs.json`).
- **Validation** : distance 0 à 15 m, hauteur 1 à 12 m, fenêtre 0,1 à 1,2 s. Pour une spéciale brise-garde, le temps de vol du saut compte dans le télégraphe.
- **Bots** : ils sautent quand la cible est à portée. Ils ne prennent la posture de contre qu'en réponse à un coup déjà lancé.
- **Événement de coup** : il porte désormais le numéro de la spéciale (`slot`), pour l'affichage.
- **Tests** :
  - saut : cercle visible dès l'envol, frappe à l'arrivée, et rien si le sauteur est touché en l'air ;
  - contre : esquive, passage dans le dos et frappe ; récupération entière si la fenêtre ne prend rien ;
  - lecture des noms de techniques.

Le Dragon à neuf têtes réutilise la ruée existante, en brise-garde, avec un démarrage de 0,4 s qui sert de télégraphe.

## Noms des techniques à l'écran

`character.json` peut décrire ses spéciales dans `moves`, une entrée par identifiant de spéciale. C'est de l'affichage seul, nettoyé à la lecture :

- `callout` : **n'est plus affiché depuis le 2026-10-20** (choix du porteur de projet : « on arrête avec les noms jap qui s'affichent quand on attaque »). Le champ reste accepté pour que les packs restent valides, mais il est ignoré. Avant : le texte écrit au lancement, 8 lettres au plus. Il s'écrit de haut en bas, en caractères pleins cernés de blanc, sur un coup de pinceau de la couleur du personnage. Il s'imprime, tient un instant, puis s'efface.
- `slashes` : le nombre d'entailles tracées sur la cible quand la spéciale touche (de 0 à 12). Le Dragon à neuf têtes en trace neuf, l'une après l'autre en un éclair.

## Animation

- Les poses viennent de la planche : garde basse et large, sabre à deux mains, jōdan au-dessus de la tête, fente.
- **Les bras sont calculés** (`swordPoses.ts`) : une pose dit où est la main du sabre et où pointe la lame. Un solveur à deux os place le bras et ferme la main gauche sur la poignée, juste sous la droite. Les manches restent tombantes.
- Les rotations des bras ainsi calculées sont mélangées par le plus court chemin (quaternions). Les autres os restent en angles, comme pour la tortue.
- **Coups** : coupe horizontale, coupe montante, coupe verticale avec un grand pas ; pour le lourd, hassō tenu pendant la charge puis coupe en diagonale ; coup aérien en tourbillon.
- **Spéciales** : accroupi, envol sabre dressé, sommet, plongée, puis frappe genou à terre ; posture d'attente puis tour complet ; fente puis course sabre en avant.
- La queue de cheval se balance et traîne derrière la tête.

## Équilibrage

Kenshin est rapide et léger : 780 PV, vitesse 6,6, poids 0,75. L'épreuve (`--tune --only kenshin`) a multiplié ses dégâts par 1,14 et l'amène à **49 %**, pour 99,5 points de budget.

## Limites

- Les kanji dépendent des polices japonaises du système (présentes sur Windows, macOS, Android et iOS).
- Le ressenti en mouvement reste à juger manette en main.

## Reprise de la finesse du modèle (2026-10-17)

> « Tu peux faire beaucoup plus fin que ça… le mec a des cônes sur la tête. »

- **Cheveux en mèches.** Chaque mèche est un ruban effilé, aplati contre le crâne, qui suit une courbe. Il y en a environ 130 :
  - deux couches de mèches devant, les plus longues au milieu, jusqu'aux yeux ;
  - de longues mèches qui encadrent le visage et tombent sur les oreilles ;
  - des mèches tirées du sommet et de la nuque jusqu'à l'attache, en suivant le crâne ;
  - quelques mèches courtes sur la nuque et quelques brins rebelles ;
  - une queue de cheval de 26 mèches qui s'écartent vers les pointes.
- **Tête d'un seul tenant**, sculptée à partir d'une sphère : crâne plein, mâchoire qui s'affine vers un petit menton, arête du nez. Les joues et le menton ne sont plus des boules ajoutées.
- **Visage peint**, posé point par point sur la surface de la tête :
  - yeux en amande avec l'ombre de la paupière, iris violet foncé en haut, pupille et deux reflets ;
  - trait de cils épais qui s'étire vers l'extérieur, cils du bas fins, pli de la paupière ;
  - sourcils fins de la couleur des cheveux, ombre du nez, petite bouche ;
  - cicatrice fine en croix si le pack la demande.
- **Gi** : un buste tourné (épaules qui tombent vers le cou, poitrine plus pleine), un col plat qui passe derrière la nuque et se croise gauche sur droite, des plis en relief sur le gi et le hakama.
- **Hakama sans raccord au genou** : chaque jambe est un seul tube de tissu *skinné*. Chaque point suit un mélange de la hanche, de la cuisse et du tibia selon sa hauteur, si bien que le tissu se plie au genou au lieu de se couper en deux pièces rigides.
