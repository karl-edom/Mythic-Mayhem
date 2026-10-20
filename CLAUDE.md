# Instructions pour Claude Code

- Lire `docs/vision.md` (qui prime) et `docs/product-brief.md` avant toute décision structurante. Le porteur de projet décide ; expliquer les arbitrages.
- Documentation et échanges en français. Code et identifiants en anglais.
- Avancer par étapes courtes et testables. Après chaque étape, résumer les fichiers modifiés, les tests exécutés, les limites et la prochaine décision attendue.
- Ne jamais commiter d'assets ou de personnages sous licence. Les packs « fan » restent dans `packs/local/` (ignoré par git).
- Les ressources **CC0** (domaine public : textures, ciels HDRI, modèles, par exemple Poly Haven, ambientCG, Kenney, Quaternius) sont autorisées dans le dépôt (décision du 2026-10-20). Pour chacune, noter sa source, sa licence et son poids dans `public/assets/CREDITS.md`.
- Les packs de personnages sont des données validées contre le budget de puissance. Ils n'exécutent jamais de code.
- Toute nouvelle capacité précise son contre-jeu et son indicateur visuel.
- Tout changement du contrat de combat commun est documenté et testé.
- Aucune dépendance sans justifier son utilité, sa licence et son coût.

## Page jouable (artefact)

- **Un seul artefact**, toujours le même : https://claude.ai/artifact/74oM5qGR8uTv4dTqCf1oTw. Ne jamais en créer un autre : on le met à jour à cette adresse (outil Artifact, avec `url`).
- **La source de vérité est la branche Git.** L'artefact n'est qu'une compilation de la branche telle qu'elle est poussée, plus les packs locaux.
- **Les packs locaux ne vivent que dans l'artefact** (décision du 2026-10-20, option a). Si `packs/local/` est vide, les récupérer d'abord : lire la page publiée (outil Artifact, `read` avec `path: "index.html"`), puis `npm run artifact:packs -- <fichier enregistré>`. Ne pas écraser des packs locaux existants sans `--force` et sans raison.
- **Pour publier :**
  1. `git pull` sur la branche ;
  2. tout commiter et pousser : `npm run artifact` refuse de compiler sinon ;
  3. lancer `npm run artifact`, qui produit `dist/artifact/index.html` et la liste `dist/artifact/files.json` ;
  4. publier `dist/artifact/index.html` à l'adresse ci-dessus, avec `root: "dist/artifact"` et les fichiers de `files.json` (seulement ceux qui ont changé suffisent : les autres restent en place).
- **Tout changement de `packs/local/`** (réglage, nouveau personnage) doit être suivi d'une publication. Sinon il est perdu à la fin de la session.
- Dire au porteur de projet quel commit a été publié.
