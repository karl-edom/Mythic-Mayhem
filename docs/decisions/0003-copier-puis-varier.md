# 0003 — Copier les jeux de référence, puis varier

Date : 2026-10-13. Statut : **acceptée** par le porteur de projet. Le détail du mélange reste à discuter (phase R2).

## Contexte

Le brief demandait une œuvre « originale » qui n'étudie les références que pour en tirer des principes. J'ai donc d'abord reconstruit un système de combat depuis zéro (expérience E2). Le porteur de projet précise son intention : **reprendre fidèlement les mécaniques et les paramètres de League of Legends, Mobile Legends et Pokémon Unite, les mélanger, puis faire varier les personnages, les menus et le visuel.** Repartir de zéro fait oublier trop de détails que ces jeux ont déjà réglés.

## Décision

1. Le gameplay est une **copie mixée** des trois jeux : mêmes systèmes, mêmes formules, mêmes ordres de grandeur.
2. Les variations portent sur trois points :
   - les **personnages**, recréés ou habillés selon les univers voulus ;
   - les **menus**, simplifiés ;
   - le **visuel**, plus lumineux et plus jovial.
3. Le relevé suit `docs/research/reverse-engineering-plan.md`. Il s'appuie sur les sources officielles et communautaires publiques et sur l'observation, sans décompiler les clients ni reprendre d'assets.
4. Le jeu est à **usage privé entre amis**.

## Conséquences

- Les expériences E1 à E3 et les principes « originalité » du brief (§1, §3.3 pour la partie copie d'interface) sont remplacés par le plan de reverse engineering.
- Le moteur sans rendu, les tests et la télémétrie sont conservés. Le format de kit et ses chiffres inventés seront remplacés par un format calqué sur les systèmes des jeux de référence.
- Le budget de puissance et le profil multi-axes sont repoussés : ils serviront au créateur de personnages.
