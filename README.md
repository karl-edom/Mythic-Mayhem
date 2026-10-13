# Mythic Mayhem

Jeu d'arène en équipe (MOBA court), lumineux et lisible. On peut y faire s'affronter des personnages venus de n'importe quel univers, tous soumis à un même cadre de règles et à un budget de puissance commun.

Statut : **reverse engineering des jeux de référence à lancer** (voir `docs/research/reverse-engineering-plan.md` et la décision 0003). Avant ça : **expérience E2 terminée** (simulation de combat sans rendu, budget de puissance, profils par rôle). Rien n'est encore jouable à l'écran. Résultats : `docs/experiments/e2-results.md`.

```bash
npm install && npm test     # Node ≥ 22.18, aucune dépendance d'exécution
npm run budget              # budget et profil de chaque personnage
npm run e2 -- --teams 3     # matchs 3v3 entre bots + télémétrie
```

- `docs/research/reverse-engineering-plan.md` : **plan en cours**
- `docs/product-brief.md` : brief initial
- `docs/vision.md` : intention du porteur de projet et conséquences
- `docs/decisions/` : décisions prises et à prendre
- `docs/design/character-system.md` : contrat de personnage et budget de puissance
- `docs/design/prototype-experiments.md` : plan d'expérimentation
- `docs/experiments/e2-results.md` : résultats de l'expérience E2
- `docs/research/rea-setup.md` : évaluation de REA
