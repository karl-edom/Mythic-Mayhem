# Mythic Mayhem

Jeu d'arène en équipe (MOBA court), lumineux et lisible. On peut y faire s'affronter des personnages venus de n'importe quel univers, tous soumis à un même cadre de règles et à un budget de puissance commun.

> **Branche `claude/jstars-custom-characters-fiqi08` : adaptation « J-Stars »** — brawler d'arène 3D, jouable en **1v1 contre un bot** dans le navigateur. Carte par défaut : **un village japonais** à étages (maisons traversables, toits grimpables, sanctuaire, pont ; décision 0025), décors cassables (`data/arenas/`, village généré par `node tools/village.ts`), tes personnages dans `packs/local/` (jamais commités) ; les premiers personnages d'exemple ont été retirés (décision 0024).
>
> ```bash
> npm install
> npm run dev                    # puis ouvrir http://localhost:5173
> npm run brawl -- --duels 40 --arena clairiere   # validation, budget et duels de bots
> npm run brawl -- --tune                          # équilibre chaque personnage contre le panel de référence
> ```
>
> Cadrage : `docs/decisions/0005-adaptation-jstars.md` · contrat de combat : `docs/design/combat-contract-v2.md` · arènes : `docs/decisions/0006-arenes-chantier-dedie.md` · équilibrage : `docs/decisions/0007-equilibrage-par-epreuve.md` · visuels : `docs/decisions/0008-direction-artistique-anime.md` · village et rendu : `docs/decisions/0025-village-japonais-et-nouveau-rendu.md`
>
> Personnages anime : avatars d'exemple VRoid Studio par pixiv (CC0). Animations et chibis : KayKit Adventurers par Kay Lousberg (CC0). · packs : `docs/design/fan-packs.md` · recherche : `docs/research/jstars-reverse-engineering.md`. Le reste du dépôt (`src/sim`, `src/bots`, `src/balance`) est la piste MOBA, conservée.

Statut (piste MOBA) : **reverse engineering des jeux de référence à lancer** (voir `docs/research/reverse-engineering-plan.md` et la décision 0003). Avant ça : **expérience E2 terminée** (simulation de combat sans rendu, budget de puissance, profils par rôle). Rien n'est encore jouable à l'écran. Résultats : `docs/experiments/e2-results.md`.

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
