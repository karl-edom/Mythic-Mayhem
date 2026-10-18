# 0022 — Menus façon jeu de combat, portraits des personnages

Date : 2026-10-18. Statut : **acceptée**.

> « On peut réviser le menu du jeu (avec Claude design et Claude motion !) Je veux les photos des personnages et des menus dignes d'un jeu pro du genre. »

Les outils cités ne sont pas disponibles dans cette session : le design et l'animation sont faits directement dans le code du jeu (CSS et Three.js), sans nouvelle dépendance.

## Photos des personnages (`src/client/portraits.ts`)

- **Un studio photo dans le jeu.** Chaque combattant est photographié à partir de son propre modèle 3D, en position de combat, avec :
  - une lumière principale chaude, une lumière de remplissage froide ;
  - deux contre-jours **à la couleur du personnage** ;
  - le même trait d'encre que dans l'arène ;
  - un fond transparent.
- **Deux cadrages** :
  - le *buste*, pour la grille, cadré sur l'os de la tête. Les modèles faits en code connaissent la hauteur de leur tête ; les avatars anime, eux, ont un cadrage fixe et serré ;
  - le *pied*, pour les panneaux, l'écran VS et la victoire. Il est rendu large, puis recadré sur la silhouette réelle : les pieds en bas, et le corps centré même quand une arme dépasse.
- Le rendu se fait en arrière-plan, une photo à la fois, avec un rendu WebGL séparé (le jeu, lui, continue). Les photos sont gardées en mémoire. En attendant la sienne, une carte affiche le médaillon à l'initiale.

## Écran de sélection

- **En haut** : le logo, le titre et un rappel de la partie (nombre de combattants, mode, victoire, arène).
- **La grille** : des portraits penchés, sur un fond à la couleur du personnage avec une trame de points, le nom sur un bandeau.
  - Au survol ou sous le curseur d'une manette : la carte se soulève, un reflet la balaie et le portrait zoome.
  - Une carte choisie prend la couleur du joueur, avec ses étiquettes (J1, CPU2…).
- **Les panneaux des joueurs**, en bas, comme dans Smash : le personnage en pied qui déborde du cadre, sur la couleur du joueur avec des rayures, le grand « 1P » ou « CPU » en filigrane, le nom en gros, l'univers, le contrôleur et l'équipe.
- **Le bandeau « Prêts ? COMBATTRE ! »** : il pulse et un reflet le parcourt.
- Au fond, le décor 3D des combattants choisis reste visible, sous des lignes de vitesse qui défilent.
- La navigation à la manette ne change pas : mêmes cartes, mêmes boutons.

## Animation

- **Entrée de l'écran**, une fois par visite : le titre tombe, les cartes apparaissent l'une après l'autre, les panneaux montent.
- **Nouveau combattant dans un panneau** : son portrait glisse depuis la droite avec un flou, et son nom s'imprime.
- **Écran « VS »** avant chaque combat (1,9 s ; un clic ou une touche le passe) :
  - les joueurs arrivent des côtés, en diagonale, sur leurs couleurs ;
  - « VS » s'abat au centre avec un éclair blanc ;
  - tout s'efface en zoomant vers l'arène.
- **Fin du combat** : le vainqueur en pied entre par la gauche, sur un halo de sa couleur.
- Si le système demande de réduire les animations, elles sont toutes coupées.

## Limites

- Au premier lancement, les photos arrivent en quelques secondes (un rendu par photo). En attendant, les cartes affichent le médaillon.
- Les photos reprennent la pose de garde : il n'y a pas encore de pose de victoire propre à chaque personnage.
