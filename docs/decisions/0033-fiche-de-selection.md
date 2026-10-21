# 0033 — Fiche des personnages à l'écran de sélection

Date : 2026-10-21. Statut : **acceptée** (demande du porteur de projet, sans aperçu des techniques au survol).

> « Peut-être s'attaquer au menu de sélection dans lequel on voit les caractéristiques des personnages ? »

## Ce qu'on voit

Le panneau de chaque joueur, en bas de l'écran, porte désormais la **fiche** de son personnage :

- son **style** (Rapide, Polyvalent, Lourd, À distance), tiré de l'archétype du kit ;
- **cinq jauges de 1 à 5** : Puissance, Vitesse, Portée, Résistance, Mobilité ;
- ses **trois techniques**, avec une icône de type (tir ➶, ruée », plongée ⤓, explosion ✸, piège ◎, contre ↺) et leur coût en énergie. Le pointeur posé sur une technique dit ce qu'elle fait, si elle brise la garde, et comment la contrer.

Quand on survole une carte (à la souris ou au curseur de la manette), le panneau du joueur qui choisit montre la fiche de ce personnage, marquée « Aperçu ». Il revient à son choix dès que le pointeur quitte la carte.

## D'où viennent les jauges

Elles sont **calculées à partir des chiffres du kit**, jamais saisies à la main (`src/brawl/profile.ts`, testé dans `tests/profile.test.ts`). Elles restent donc toujours vraies, même après un rééquilibrage :

| Jauge | Mesures (chacune classée contre tout le roster, puis moyennées) |
| --- | --- |
| Puissance | dégâts par seconde de l'enchaînement léger, dégâts du coup fort, dégâts moyens des techniques |
| Vitesse | vitesse de déplacement |
| Portée | portée du corps à corps (portée et taille de la zone de frappe), portée du tir, du piège ou de l'explosion |
| Résistance | vie × √poids |
| Mobilité | force du saut, longueur de la plus grande ruée ou plongée |

Le plus faible du roster vaut 1 et le plus fort 5. Ajouter un personnage peut donc décaler un peu les jauges des autres : c'est voulu, la fiche compare entre eux les combattants qu'on peut choisir.

## Mise en page

- Les cartes rétrécissent aussi selon la hauteur de l'écran, pour que tout tienne en 1280 × 720.
- Le panneau grandit avec sa fiche (la scène 3D au-dessus cède la place).
- **Bogue corrigé** : la rangée des options (nombre de combattants, mode, victoire, arène, bots) et le bouton « Combattre ! » restaient invisibles à la première ouverture de l'écran, parce que leur animation d'entrée jouait à l'envers et finissait transparente.

## Retraits

Saitō, Sanosuke, Shishio et Vegeta sont marqués `retired` (personnages sans avatar VRM, à la demande du porteur de projet). Ils restent dans la page mais n'apparaissent plus à l'écran de sélection.
