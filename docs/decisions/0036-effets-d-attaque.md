# 0036 — Effets d'attaque : qualité « studio »

Date : 2026-11-14. Statut : **acceptée** (« améliore les effets d'attaques, on veut de la qualité digne d'un studio de jeu vidéo »).

C'est de l'affichage seul : rien ne change dans la simulation ni dans le contrat de combat. Les contre-jeux sont inchangés, et les indicateurs visuels existants (zones au sol, couleurs des techniques) restent en place.

## Les outils (`src/client/fxkit.ts`, `src/client/energy.ts`)

- **Particules sur la carte graphique.** Plusieurs milliers à la fois sans coût notable. Elles bougent avec traînée et gravité, s'étirent dans le sens de leur vitesse (étincelles) et prennent leur forme dans une petite planche de sprites (lueur, étincelle, fumée, flamme, étoile, anneau, éclat, poussière).
- **Lumières dynamiques.** Un petit groupe fixe de lumières est réutilisé, ce qui évite toute recompilation des shaders. Un coup, une explosion ou un projectile éclaire brièvement la rue autour de lui.
- **Marques au sol.** Brûlures et fissures qui s'effacent seules.
- **Effets d'écran.** Ondes de choc qui déforment l'image, légère aberration chromatique, flash, zoom. Une passe d'après-rendu (`ImpactShader`) les applique, et elle est coupée quand rien ne se passe.
- **Matériau d'énergie.** La lumière y vient de l'intérieur : plus vive au centre, du bruit qui défile le long de la surface, et une couleur qui passe du cœur chaud à la couleur de la technique. Il sert aux rayons, aux boules d'énergie et aux têtes de rayon.

## La règle de couleur

Le décor du village est clair (pavé, murs blancs). Une lumière ajoutée à un fond clair ne peut que l'éclaircir, et elle vire au voile blanc. D'où trois règles :

1. **Couleur approfondie** (`deepen`). La couleur d'une technique est saturée et assombrie avant d'être utilisée comme lumière. Le blanc est réservé au cœur, fin.
2. **Gaine teintée** (option `dye`). Autour d'un rayon ou d'une boule, une couche mélangée au décor, et non ajoutée, le teinte dans la couleur de la technique. Le rayon reste bleu sur un mur blanc.
3. **Peu d'éléments blancs**, petits et brefs : étincelles, cœur, flash d'impact.

## Ce qui a changé, attaque par attaque

- **Rayons** (Kamehameha, lasers) :
  - corps d'énergie dans la couleur approfondie, cœur blanc mince, gaine teintée ;
  - anneaux qui filent le long du rayon ;
  - boules d'énergie à la bouche du tir et à la tête du rayon.
- **Boules d'énergie** (le projectile par défaut, par exemple l'Aurasphère) : sphère d'énergie et gaine teintée, éclat en étoile qui tourne, anneau, traînée fine et colorée. Elles remplacent l'ancien halo blanc à pleine opacité, qui faisait un nuage blanc.
- **Impacts** :
  - flash court ;
  - étoiles d'impact dans la couleur du coup ;
  - gerbe d'étincelles étirées qui refroidissent en tombant ;
  - lumière brève ;
  - pour les gros coups, une onde qui déforme l'image.
- **Explosions** :
  - flash orangé ;
  - boule de feu qui monte et noircit en fumée ;
  - langues de flamme et braises ;
  - poussière sombre au ras du sol ;
  - brûlure au sol, rue éclairée d'orange un instant.
- **Ondes au sol** (mises au sol, relevés) : teintées et discrètes, et non plus en blanc pur.
- **Foudre** : canal principal en zigzag et trois branches. Chaque trait est un ruban tourné vers la caméra, avec un cœur blanc fin dans un halo de la couleur de l'attaque. Il scintille avant de s'éteindre et laisse une brûlure au sol.
- **Éclairs en main** (et pièges à foudre) : halo discret dans la couleur approfondie, arcs teintés.
- **Arcs de coupe** (coups sans arme) : bord d'attaque brillant, traîne qui s'estompe dans la couleur du coup.

## Vérification

Un banc d'essai, hors du dépôt, place deux combattants dans la rue du village et fait avancer la simulation image par image. Il photographie les instants clés (tir, vol, impact, après-coup). Chaque réglage a été comparé avant et après sur :
- le Kamehameha ;
- l'Aurasphère ;
- le feu de Dracaufeu ;
- la foudre d'Élektek ;
- un coup fort au corps à corps.

## Limites

- Les effets propres à certains personnages (`specialFx.ts`, décision 0032) suivent leurs propres réglages : ils n'ont été repris que là où ils passaient par les fonctions communes (ondes au sol, foudre).
- Sur une machine sans carte graphique, les lumières dynamiques et les ondes d'écran coûtent plus cher.
