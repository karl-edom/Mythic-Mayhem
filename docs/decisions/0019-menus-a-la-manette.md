# 0019 — Menus jouables à la manette, à la Smash

Date : 2026-10-17. Statut : **acceptée** (« Yes go », pour la version à la Smash).

## Décision

Tout se fait à la manette, sans souris ni clavier.

**Écran de sélection**
- Chaque manette a **son propre jeton** à sa couleur (J2, J3…), qu'elle déplace sur la grille des personnages au stick ou à la croix. Un mouvement par poussée ; maintenir répète le mouvement après 0,38 s, puis toutes les 0,14 s.

| Bouton | Action |
| --- | --- |
| A | rejoindre (prend la place d'un bot, ou ajoute un combattant), puis **choisir** le personnage sous le jeton : le joueur passe « PRÊT » |
| X | **donner** le personnage sous le jeton à un bot (chacun son tour) |
| Y | changer d'équipe (mode équipes) |
| B | annuler le choix ; une seconde fois : rendre sa place au bot |
| ↓ sous la grille | descendre dans les **options** : un bouton en surbrillance, à la couleur du joueur. Les flèches se déplacent dans une ligne ou d'une ligne à l'autre, A appuie sur le bouton, ↑ depuis la première ligne remonte à la grille |
| Start | lancer le combat |

- Plusieurs joueurs choisissent **en même temps**, chacun avec son jeton.
- La souris et le clavier marchent toujours.

**Menu pause** (Start ou Échap) : *Reprendre*, *Aide (commandes)*, *Quitter le combat*. On se déplace avec ↑/↓, A valide, B ou Start reprend.

**Écran de fin** : A ou Start pour la revanche, B pour changer de combattants.

## Vérification

Avec une manette simulée dans le navigateur, à chaque étape :
1. rejoindre ;
2. déplacer le jeton de deux cases ;
3. choisir (PRÊT) ;
4. descendre dans les options, d'une ligne à l'autre ;
5. lancer avec Start ;
6. mettre en pause, descendre jusqu'à *Quitter le combat* et revenir au menu.

## Limites

- La grille et les options sont celles de l'écran actuel : pas encore d'écran de réglages séparé (vibration, sensibilité, affectation des boutons).
- Le clavier ne navigue pas dans les menus (la souris suffit à côté).
