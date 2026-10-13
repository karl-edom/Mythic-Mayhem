# 0005 — Adaptation « J-Stars » : brawler d'arène crossover

Date : 2026-10-13. Statut : **proposée**. Branche : `claude/jstars-custom-characters-fiqi08`.

## Demande du porteur de projet

> « Je veux une copie du jeu J-Stars mais en y ajoutant des personnages de mes univers (Kenshin, Shinsengumi, Naruto, Super Smash Bros, Pokémon, etc.) et on reverra à terme la structure du gameplay. »

## Ce que ça change par rapport à la piste MOBA (décisions 0003 et 0004)

| Sujet | Piste MOBA (branche précédente) | Adaptation J-Stars (cette branche) |
| --- | --- | --- |
| Genre | MOBA court, vue du dessus | brawler d'arène 3D, caméra derrière le personnage avec verrouillage de cible |
| Format | 3v3 puis 5v5, voies, tours | 2v2 (+ 1 personnage de soutien appelable par équipe), petite arène fermée |
| Condition de victoire | détruire la base / objectifs | **jauge de victoire** : chaque K.-O. adverse remplit un cran, 3 crans = victoire |
| Attaque de base | automatique, à l'arrêt | combo manuel (attaque légère enchaînable) + attaque forte qui brise la garde |
| Défense | placement, esquive des télégraphes | garde, pas de côté (esquive), dash, saut |
| Ressource | temps de recharge | jauge d'énergie consommée par les spéciales, rechargeable à la main |
| Progression en partie | niveaux, objets | aucune (ou presque) : le personnage est complet dès le début |
| Référence de copie | LoL, MLBB, Pokémon Unite | J-Stars Victory VS+ (voir `docs/research/jstars-reverse-engineering.md`) |

La méthode de la décision 0003 reste valable : **copier d'abord, varier ensuite**. On copie la structure de J-Stars, puis on retouche le gameplay plus tard, comme demandé.

## Ce qu'on garde tel quel

1. **Un personnage = identité + kit de données**, validé contre un budget de puissance. Le moteur n'exécute jamais de code fourni par un pack.
2. **Simulation séparée du rendu, pilotée par des commandes**, pour le multijoueur entre amis.
3. **Bots et simulation sans rendu** pour calibrer le budget (méthode E2).
4. **Licences** : le dépôt ne contient que des personnages originaux d'exemple. Les personnages de Kenshin, Naruto, Smash, Pokémon… vivent dans `packs/local/` (ignoré par git). Voir `docs/design/fan-packs.md`.
   - Cas particulier du Shinsengumi : c'est un groupe historique réel, donc libre en tant que tel. Mais sa représentation dans *Kenshin* (Saitō, Okita version Watsuki…) ou dans *Gintama* est sous licence. On pourra créer des versions **originales** inspirées de l'histoire et les commiter ; les versions issues d'un manga restent locales.

## Ce qu'il faut refaire

- **Le contrat de combat (couche B)** : combo, attaque forte, garde, esquive, saut, spéciales sur jauge, ultime, soutien. C'est un changement du contrat commun : il sera documenté et testé (règle du `CLAUDE.md`).
- **Le format de kit** passe en `schemaVersion: 2` (le format 1 reste lisible par la branche MOBA, pas par celle-ci).
- **Le budget** : nouvelles primitives à chiffrer (fenêtres d'ouverture, brise-garde, super-armure, coût en énergie).
- **Le rendu** : la 3D devient nécessaire. Proposition à valider : **Three.js** (licence MIT, gratuit, ~600 Ko minifié, standard du web 3D). Alternative : Babylon.js (Apache 2.0, plus lourd, moteur plus complet). Rien n'est installé tant que ce choix n'est pas validé.

## Arbitrages à trancher par le porteur de projet

1. **Repartir du code de la branche MOBA ou d'une base neuve ?** Recommandation : garder `src/data`, `src/sim/validate.ts`, `src/sim/budget.ts` et l'outillage de calibrage (ils valent pour n'importe quel genre), et réécrire `src/sim/world.ts` et `src/bots/` pour le brawler.
2. **3D complète ou 2,5D ?** J-Stars est en 3D libre. Une 2,5D (sol plat, saut simple, caméra fixe) se code bien plus vite et garde l'essentiel des sensations. Recommandation : **3D avec sol plat et saut**, caméra derrière le joueur ; pas d'escalade ni d'étages au début.
3. **Format de départ** : 1v1 d'abord (valider les sensations), puis 2v2. Recommandation : 1v1 dans le premier prototype, le 2v2 dès que le 1v1 est agréable.
4. **Soutiens** : garder les personnages de soutien appelables (spécificité de J-Stars) ? Recommandation : oui, mais après le 2v2.
5. **Mode aventure (« J-Adventure »)** : hors périmètre au début. À rediscuter.

## Prochaine étape proposée

Une fois ces arbitrages validés :

1. compléter la fiche de reverse engineering avec les chiffres mesurés (durées de combo, dégâts, taille de jauges), à partir de vidéos et du guide communautaire ;
2. écrire le contrat de combat v2 et le format de kit `schemaVersion: 2`, avec ses tests de validation ;
3. simulation 1v1 sans rendu entre deux bots, puis premier rendu jouable.
