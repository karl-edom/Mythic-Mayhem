# 0001 — Stack, multijoueur, format, REA

Date : 2026-10-13. Statut : **acceptée** par le porteur de projet.

## Décisions

1. **Jeu web en TypeScript.** Condition posée : pouvoir passer plus tard à un vrai moteur (Godot, Unity…) sans tout refaire.
2. **Bots d'abord, réseau prévu.** Jalon 1 : jouable en local contre des bots. Jalon 2 : en ligne entre amis.
3. **Format.** Les sessions réunissent 2 à 3 amis, mais le jeu doit viser le 5v5 à terme. Le prototype part en 3v3, avec des bots pour combler les places vides.
4. **REA : pas maintenant** (voir `../research/rea-setup.md`).

## Conséquences pour l'architecture

### Rester transposable vers un moteur

Ce qui passera tel quel dans un autre moteur :

- **Packs de personnages** en JSON, avec un schéma versionné. Ils ne dépendent d'aucune technologie.
- **Règles de combat** documentées dans `docs/design/` : formules, budget, effets d'état.
- **Scénarios de test** décrits en données (« état initial + commandes → résultat attendu »). On pourra les rejouer contre une nouvelle implémentation pour vérifier qu'elle se comporte pareil.

Ce qu'il faudrait réécrire :

- le code TypeScript lui-même (le cœur de simulation, environ quelques milliers de lignes) ;
- le rendu et l'interface.

Le cœur de simulation n'a aucune dépendance au navigateur ni au rendu. Il fonctionne à pas fixe et sa logique est déterministe. Ce cœur est la partie à porter, et sa spécification est écrite d'avance.

### Taille des équipes en paramètre

Le nombre de joueurs par équipe, la taille de l'arène et le nombre d'objectifs sont des valeurs de configuration. Rien ne suppose « 3 » dans le moteur.

### Réseau prévu dès le départ

La simulation consomme des commandes horodatées par tick (« se déplacer vers », « lancer la capacité X vers… ») et produit un état et des événements. Les bots, le clavier local et plus tard le réseau passent tous par ces mêmes commandes.
