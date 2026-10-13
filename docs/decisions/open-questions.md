# Décisions structurantes à prendre

Chaque ligne bloque un choix d'architecture. Les recommandations sont des hypothèses réversibles, pas des décisions.

| # | Question | Recommandation | Pourquoi |
| --- | --- | --- | --- |
| D1 | Plateforme et technologie | **Jeu web en TypeScript** (rendu 2D en vue de dessus inclinée, par ex. PixiJS ; serveur Node + WebSocket) | Les amis rejoignent via un lien, sans installation. Ça tourne sur PC et sur navigateur mobile. Le même code de simulation s'exécute sur le client, le serveur et les tests. Tout est déjà disponible dans l'environnement. Alternative sérieuse : Godot (meilleur outillage pour le jeu, export web possible, multijoueur intégré), au prix d'un éditeur à installer et de tests moins simples à automatiser. |
| D2 | Multijoueur | **Simulation à pas fixe, autoritaire côté serveur, dès le premier jalon.** Premier jalon jouable en local contre des bots, deuxième jalon en ligne entre amis. | Le jeu entre amis est le but. Concevoir la simulation « commandes → état » dès le départ évite une réécriture complète. Le réseau robuste (prédiction côté client, etc.) vient ensuite. |
| D3 | Format | **3v3**, places vides comblées par des bots | Ça s'adapte à la taille du groupe d'amis, avec une charge cognitive raisonnable. |
| D4 | Caméra et commandes | Vue du dessus inclinée, clavier/souris (ZQSD + visée souris), 1 attaque de base + 2 capacités | Le tactile vient plus tard si le mobile devient prioritaire. |
| D5 | Ton artistique | Formes simples et colorées générées par le code (aucun asset au départ) ; les packs apportent leurs images | Lisibilité d'abord, aucun problème de droits. |
| D6 | Objectif de victoire | Contrôle de zone + score (voir l'expérience E3) | Partie courte (6 à 10 min) et objectif lisible. |
| D7 | But du premier prototype | **Base technique extensible validant le fun** : simulation testable, 3 kits définis par données, validateur de budget | Le fil rouge : « ajouter un personnage sans toucher au moteur ». |
| D8 | REA | Ne pas installer pour l'instant (voir `research/rea-setup.md`) | Inutilisable de façon licite sur les jeux de référence. |
| D9 | « Pokémon Brawl » (cité dans le brief) | À préciser : Pokémon Unite, ou un autre jeu ? | Change seulement la recherche de références. |
