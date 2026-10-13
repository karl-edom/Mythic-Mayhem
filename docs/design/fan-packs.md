# Packs « fan » : personnages de tes univers

Statut : **règles d'organisation**, le format de kit `schemaVersion: 2` reste à écrire (décision 0005).

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
2. Le kit passe par le même validateur et le même budget que les personnages originaux. Un personnage « culte » n'a pas de passe-droit : sa puissance s'exprime dans le budget commun.
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
