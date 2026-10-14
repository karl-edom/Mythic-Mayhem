# Packs « fan » : personnages de tes univers

Statut : **utilisable**. Le format de kit est `schemaVersion: 2` (voir `combat-contract-v2.md` ; exemples : `data/fighters/ronin/`, `data/fighters/kaminari/`). Un pack posé dans `packs/local/` apparaît dans le menu au prochain `npm run dev` ; s'il est refusé, le menu affiche pourquoi.

## Où ils vivent

```text
packs/local/            # ignoré par git : rien ici n'est jamais commité
├── kenshin/
│   └── <personnage>/
│       ├── character.json   # identité : nom, univers, couleurs, portrait, sons
│       └── kit.json         # kit validé contre le budget
├── naruto/
├── smash/
├── pokemon/
└── shinsengumi/
```

Ces packs se partagent directement entre amis (archive, clé USB, dossier partagé), jamais via le dépôt.

## Règles

1. Un pack ne contient que des **données** (JSON, images, sons). Aucun script.
2. Le kit passe par le même validateur et le même budget que les personnages originaux, puis par la même **épreuve** (`npm run brawl -- --tune`, décision 0007) qui ajuste ses dégâts pour qu'il gagne environ la moitié de ses duels contre le panel de référence. Un personnage « culte » n'a pas de passe-droit, et en ajouter un ne demande jamais de retoucher les autres.
3. Le dépôt peut contenir des personnages **originaux inspirés** d'un archétype (le sabreur rapide, le ninja à clones, l'élémentaire…), jamais un nom ni un visuel sous licence.

## Univers demandés par le porteur de projet

Liste de travail, à compléter par toi : quels personnages, dans quel ordre.

| Univers | Archétypes de combat évidents | Remarque |
| --- | --- | --- |
| Kenshin | sabreur rapide, contre-attaquant, frappe en dégainé | proche de l'esprit J-Stars (Kenshin y était jouable) |
| Shinsengumi | escrimeurs disciplinés, estoc, formations à deux | groupe historique réel : version originale commitable possible |
| Naruto | ninja mobile, clones, projectiles, transformations | Naruto et Sasuke étaient jouables dans J-Stars |
| Super Smash Bros | personnages très variés (épéistes, tireurs, poids lourds) | univers lui-même crossover : une bonne vitrine du budget commun |
| Pokémon | élémentaires, types et faiblesses | un Pokémon peut aussi servir de **soutien** appelable |
