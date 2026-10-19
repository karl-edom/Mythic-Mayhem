# 0023 — Garde-robe du personnage en code, combat à mains nues, créatures et effets des techniques

Date : 2026-10-18. Statut : **acceptée**.

> « Quelques nouvelles planches pour créer des personnages. Utilise ce que tu sais d'eux pour faire des attaques appropriées (Sangoku, Vegeta, personnages de Bad Fur Day (armes variables caractéristiques : tronçonneuse, sniper entre autres), Shishio (qui attaque avec des flammes)). »

> « Sanosuke Sagara en noir doit en fait être habillé en blanc avec bandeau rouge sur la tête. »

## Pourquoi

Onze personnages d'un coup : refaire un modèle par personnage aurait été long et fragile. Le personnage construit en code (celui de Kenshin) devient une **base unique avec une garde-robe** : chaque pièce est construite une fois, puis affichée ou non selon la liste `show` du pack, et colorée par ses canaux de couleur. Il n'y a toujours **pas d'atelier de création dans le jeu**. Les personnages restent des données dans `packs/local/`.

## Garde-robe (`swordsman.ts`, `humanParts.ts`, `creatureParts.ts`)

- **Une pièce par catégorie** : haut, bas, pieds, cheveux, tête, carrure. Si le pack n'en nomme pas, celle de Kenshin s'applique (gi, hakama, zōri…). Les autres pièces (armes, bandeaux, emblèmes, queues…) s'ajoutent librement.
- **Canaux de couleur du `look`** :

  | Canal | Usage |
  | --- | --- |
  | `outfit` | vêtement principal |
  | `accent` | vêtement secondaire |
  | `trim` | bordures, bandeau, ceinture |
  | `hair` | cheveux, barbe, sourcils |
  | `skin` | peau, ou fourrure pour les animaux |
  | `eyes` | iris |
  | `emblem` | quelques lettres, ou `spiral` / `fan` |

- **Pièces disponibles** :
  - **Hauts** : Gi, Haori (bord en dents de scie), Gi_Short, Vest, Jacket, Shirt_Collar, Bodysuit, Armor_Saiyan, Robe_Tattered, Armor_Shredder, Hoodie, Top_None.
  - **Bas** : Hakama, Pants_Baggy, Pants_Short, Pants_Ninja, Bodysuit_Legs, Bottom_None.
  - **Pieds** : Zori, Boots_Martial, Boots_White, Boots_Black, Sandals_Ninja, Sandals_Wrapped, Sneakers, Feet_Paws.
  - **Cheveux** : Hair_Kenshin, Hair_Saito, Hair_Goku, Hair_Vegeta, Hair_Spiky, Hair_Sasuke, Hair_Shishio, Hair_None.
  - **Têtes** : Head_Human, Head_Rat, Head_Squirrel, Head_Teddy.
  - **Carrures** : Build_Lean, Build_Muscular, Build_Plush.
  - **Accessoires** : Apron_Waist (tablier et corde à la taille), Headband, Headband_Plate, Helmet_Spiked, Mask_Lower, Wristbands, Gloves_White, Gloves_Black, Hand_Wraps, Bracers, Gauntlets, Shin_Guards, Emblem, Emblem_Back, Saya (fourreau), Tail_Rat, Tail_Squirrel, Tail_Teddy, Patches, Zipper.
  - **Détails du visage** : Scar_Cross, Whiskers, Bandaged (Bandaged enveloppe aussi toute la peau de bandages).
- **Corps musclé** : les pectoraux et les abdominaux en relief ne se voient que si le torse est découvert (Vest, Top_None). Sinon ils traverseraient les vêtements.
- **Créatures** : avec une tête d'animal, toute la peau devient de la fourrure (`skin`). Le museau et le ventre prennent automatiquement une teinte plus claire.
- **Kenshin** : son fourreau est désormais une pièce (`Saya`), ajoutée à son pack. Son apparence ne change pas.

## Styles de combat

Le style d'animation dépend toujours de l'arme (décision 0021). Deux styles s'ajoutent :

| Style | Armes | Mouvements |
| --- | --- | --- |
| **mains nues** (nouveau) | aucune | garde de boxe, direct, crochet du bras arrière, coup de pied haut, coup de poing chargé depuis la hanche, coup de pied sauté |
| **une main** (nouveau) | poêle, bouteille | les mouvements du sabre tenus d'une main, l'autre bras en garde devant |
| sabre | sabres, Mugenjin, chokutō | ceux de Kenshin |
| bâton | bō, bâton noueux | ceux de Donatello |
| deux armes | griffes, saïs, nunchakus | ceux de Raphaël |

Poses des techniques en style mains nues :

| Type de technique | Pose |
| --- | --- |
| projectile | mains jointes à la hanche, puis poussées en avant (Kamehameha) |
| ruée | vol poing en avant |
| saut plongeant | les deux poings levés, puis frappe au sol |
| zone | montée d'aura, poings serrés et tête levée |
| contre | garde immobile, puis revers tournant dans le dos de l'attaquant |

Deux techniques manquaient au style sabre :
- **projectile** : une coupe montante qui lance l'onde (ou la flamme) ; en style une main, l'arme est épaulée et visée à deux mains, avec un recul au tir ;
- **zone** : deux tours complets, la lame à bout de bras.

## Effets des techniques (`moves` dans character.json, `moveFx.ts`)

Tout est **de l'affichage seul**, choisi dans des listes fermées. Un pack ne fournit que des noms, une couleur et des lettres, jamais de code.

| Champ | Valeurs | Ce qu'on voit | Contre-jeu |
| --- | --- | --- | --- |
| `projectile` | `beam` | colonne de lumière des mains à la tête du rayon | se décaler latéralement : le rayon reste un projectile en ligne droite |
| | `fire` | boule de flammes qui laisse de la fumée et explose à l'arrivée | idem |
| | `bullet` | trait lumineux et éclair au canon | visée longue (sniper : 0,75 s de préparation, arme épaulée bien visible) |
| | `rocket` | roquette qui tourne avec une flamme, explosion à l'arrivée | lente (14 m/s) |
| | `pizza` | inchangé | |
| `zone` | `fire` | flammes qui montent dans le cercle jusqu'à l'impact | le cercle reste annoncé comme avant |
| | `blast` | cercle rouge, explosion à l'impact | le cercle reste annoncé comme avant |
| `hand` | `ki` | boule de lumière dans le poing | |
| | `orb` | Rasengan : sphère et anneaux qui tournent | |
| | `lightning` | Chidori : arcs électriques qui crépitent | |
| | `fire` | flammes le long de la lame, ou autour du poing | |
| `color` | `#rrggbb` | couleur de la lumière de la technique | |
| `weapon` | nom d'arme | arme prise en main le temps de la technique ; l'arme habituelle disparaît | |

- Les effets dans la main durent du début de la technique à sa fin (préparation, ruée, saut, attente du contre). Ils servent d'**indicateur** : l'adversaire voit ce qui arrive.
- Le saut d'un personnage peut avoir une zone `blast` (kamikaze de Tediz). L'explosion ne se produit que si le saut arrive au sol : coupé en l'air, il ne montre rien.

## Nouvelles armes (`weapons.ts`)

Mugenjin (lame dentelée), chokutō (droit), griffes (tekko-kagi, une par main), bâton noueux, poêle, bouteille cassée, tronçonneuse, fusil de précision, pistolet-mitrailleur, bazooka.

## Le contrat de combat ne change pas

Aucun nouveau type de technique. Les rayons sont des projectiles, les explosions des zones. Les budgets et l'épreuve (`--tune`) s'appliquent tels quels.

## Packs (locaux, non commités)

| Pack | Style | Techniques |
| --- | --- | --- |
| Saitō | sabre | Gatotsu (ruée), Gatotsu Sanshiki (saut plongeant), Gatotsu Zeroshiki (ruée courte qui brise la garde) |
| Shishio | sabre (Mugenjin) | Homura Dama (boule de feu), Guren Kaina (explosion), Kagutsuchi (ruée de la lame en feu) |
| Goku | mains nues | Kamehameha (rayon bleu), Kaiō-ken (ruée, aura rouge), Genkidama (zone à distance) |
| Vegeta | mains nues | Galick Ho (rayon violet), Big Bang (explosion à distance), Final Flash (rayon jaune, lent et puissant) |
| Sanosuke | mains nues | Futae no Kiwami (explosion au contact), Sanjū no Kiwami (saut et frappe au sol), coup de tête (ruée). Vêtu de blanc, bandeau rouge, 悪 dans le dos. |
| Naruto | mains nues | Rasengan (ruée, orbe dans la main), Kawarimi (substitution : contre), Uzumaki Rendan (saut) |
| Sasuke | sabre (chokutō) | Chidori (ruée, éclairs dans la main), Gōkakyū (boule de feu), Sharingan (contre) |
| Shredder | deux armes (griffes) | ruée, tourbillon (zone), griffe plongeante (saut qui brise la garde) |
| Splinter | bâton noueux | tourbillon (zone), Aiki (contre), saut du maître |
| Conker | une main (poêle) | tronçonneuse (ruée), sniper (balle, longue visée), bazooka (roquette) ; chaque arme apparaît le temps de la technique |
| Tediz | une main (bouteille) | rafale (pistolet-mitrailleur), grenade (zone qui explose), kamikaze (saut qui explose) |

## Limites

- Tous les personnages ont la même taille : Conker n'est pas plus petit que Vegeta.
- La fourrure est une texture, pas des poils en volume.
- Les visages humains sont peints. Les animaux ont des yeux en relief, mais pas d'expressions.
- Le Rasengan et le Chidori sont tenus dans la main droite, quelle que soit la pose.

## Ajout : des techniques propres à chaque épéiste

> « Il faudra bien faire des attaques spéciales spécifiques pour chaque épéiste. Mais on peut laisser la même attaque de base. »

- **Les coups de base restent communs** au style sabre. **Les techniques ont chacune leur animation** : `moves.{id}.pose` choisit l'animation de la technique dans une liste fermée (`signaturePoses.ts`). Sans `pose`, la technique garde celle du style (celles de Kenshin pour le sabre).
- Une technique se joue en phases : la préparation, puis selon son type la course (`rush`), le saut et l'atterrissage (`leap`), l'attente, la riposte ou le retour au calme (`counter`). Chaque phase absente reprend celle du style.
- `weapon: "None"` range l'arme le temps de la technique (mudras, coup à main nue).

| Personnage | Technique | Animation |
| --- | --- | --- |
| Saitō | Gatotsu | garde de profil, la poignée tirée près de la tête, la lame à plat pointée sur l'adversaire, l'autre main qui la vise ; puis la course, bras d'épée tendu, l'autre bras rejeté en arrière |
| | Gatotsu Sanshiki | accroupi, la pointe vers le haut ; en l'air, l'estoc monte, puis la pointe se retourne et il retombe comme un pieu ; à l'arrivée, la lame plantée dans le sol |
| | Gatotsu Zeroshiki | le buste tordu loin en arrière, la main libre tendue vers l'adversaire ; puis tout le haut du corps se déroule d'un coup, les pieds bougent à peine |
| Shishio | Homura Dama | la lame raclée au sol derrière lui (le frottement l'enflamme), puis un grand arc montant qui lance le feu |
| | Guren Kaina | la main gantée tendue pour saisir l'adversaire, l'épée tenue basse derrière ; l'explosion part de cette main |
| | Kagutsuchi | la lame en feu levée au-dessus de la tête, puis la charge en la portant haut |
| Sasuke | Chidori | sabre rangé, accroupi, la main droite basse et en arrière qui crépite, la gauche serrant son poignet ; puis la course, main en avant |
| | Gōkakyū | les mudras devant la bouche, une inspiration (buste et tête en arrière), puis le feu soufflé, corps projeté vers l'avant (sabre rangé) |
| | Sharingan | droit et immobile, le sabre pointe en bas le long de l'avant-bras ; touché, un demi-tour et un revers |
| Leonardo | Lame du dragon | le sabre ramené bas en arrière, puis une vrille de tout le corps derrière la lame tenue à plat |
| | Garde du chef | la lame verticale devant le visage, à deux mains ; touché, un pas et une coupe montante dans le dos de l'attaquant |
| | Bond du ninja | un salto avant en l'air, le sabre replié, puis la coupe à l'atterrissage |

Kenshin garde les siennes (ce sont celles du style sabre). Les contre-jeux ne changent pas : ce sont les mêmes types de techniques, avec la même préparation.

## Ajout : des techniques propres à Goku, Vegeta et Naruto

> « Fais pareil pour Goku, Vegeta et Naruto. »

Même principe que pour les épéistes : leurs coups de base restent ceux du style mains nues, et chaque technique a son animation.

| Personnage | Technique | Animation |
| --- | --- | --- |
| Goku | Kamehameha | « Ka-me » : les mains jointes ramenées loin en arrière à la hanche droite, accroupi ; « ha-me » : il tient ; « HA ! » : les bras tendus, paumes vers l'adversaire, d'où part le rayon |
| | Kaiō-ken | un cri, poings serrés aux hanches et torse bombé (l'aura rouge éclate), puis il vole tête la première, le poing devant |
| | Genkidama | les deux bras levés vers le ciel, puis la sphère ramenée et lancée par-dessus la tête |
| Vegeta | Galick Ho | de profil, les deux paumes jointes ramenées près de l'épaule droite, puis pivot et bras tendus vers l'adversaire |
| | Big Bang Attack | le bras droit tendu, main ouverte vers l'adversaire, le poing gauche en bas |
| | Final Flash | les bras grands ouverts sur les côtés pendant la longue préparation, puis réunis droit devant, paumes en avant |
| Naruto | Rasengan | accroupi, la main droite tendue paume vers le haut, la gauche qui tourne au-dessus pour former la sphère ; puis la course, la sphère tenue devant |
| | Kawarimi | le mudra tenu devant la poitrine ; touché, il est déjà dans le dos de l'attaquant et enchaîne un coup de pied circulaire |
| | Uzumaki Rendan | accroupi, un saut avec deux saltos avant, la jambe droite levée au-dessus de la tête, puis le talon abattu sur l'adversaire |

**Correction des saltos** : un salto était décrit par des angles, et l'interpolation les faisait revenir à zéro en tournant à l'envers à la fin (salto de Leonardo, roulades d'esquive). Les rotations complètes passent maintenant par des quaternions, un tiers de tour par étape : le corps tourne dans le bon sens et se retrouve droit.
