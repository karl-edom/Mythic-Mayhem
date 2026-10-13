# REA — évaluation et plan d'installation

Statut : **non installé**. En attente de l'accord du porteur de projet.

## Sources consultées (2026-10-13)

- Paquet npm `rea-agents`, version `6.4.0` (dernière publiée) : `package.json` et `README.md` lus depuis l'archive du paquet, sans installation ni exécution.
- Le lien `README_fr.md` du brief n'a pas pu être lu directement : le dépôt GitHub `morluto/rea` n'est pas accessible depuis cette session. Le README anglais du paquet npm sert de référence.

## Ce qu'est REA (faits vérifiés dans le README)

- Un CLI et un serveur MCP qui donnent à un agent des outils d'inspection : binaires natifs, apps JavaScript/Electron, assemblies .NET, sites web, captures réseau HAR, APK Android, firmware, comportement de processus.
- L'analyse tourne en local. Les résultats incluent les preuves et les limites de chaque conclusion.
- Licence MIT. Le README précise que l'utilisateur est responsable d'obtenir les autorisations nécessaires.

## Prérequis

| Élément | Exigence | État de cet environnement |
| --- | --- | --- |
| Node.js | `^22.19` ou `^24.11` ou `>=26` | v22.22.0 ✅ |
| npm | requis | 10.9.4 ✅ |
| Analyse native | Hopper, Ghidra ou IDA | absent |
| Analyse web | navigateur de la famille Chrome | Chromium présent ✅ |
| Android (APK) | JADX + JDK complet | absent |

## Installation proposée (non exécutée)

```bash
npx rea-agents@latest setup   # interactif : choisir Claude Code, relire les changements, valider
# puis redémarrer Claude Code et vérifier que les outils MCP de REA apparaissent
```

Ce que ça modifie : ça ajoute un serveur MCP à la configuration de Claude Code et installe un skill d'instructions, en sauvegardant la configuration existante. Ça peut aussi proposer d'installer Hopper (à refuser par défaut).

Mise à jour : `npx rea-agents@latest setup` (via npx) ou `rea update` (installation globale).

## Pertinence pour ce projet (analyse)

Les trois références (League of Legends, Mobile Legends, Pokémon Unite) sont des **jeux en ligne protégés par des anti-triche et des CGU** qui interdisent la rétro-ingénierie de leurs clients. Les garde-fous du brief (§3.3) excluent donc l'analyse de leurs binaires, APK ou trafic réseau. Ce qui reste licite :

1. observation de parties (vidéos, captures), notes de version, wikis et guides publics ;
2. pages web publiques, où REA apporte peu par rapport à une simple lecture.

**Conclusion : REA n'apporte presque rien à l'étude des jeux de référence.** En revanche, il pourrait servir plus tard sur des cibles qu'on a le droit d'examiner : nos propres builds (par exemple pour étudier le profil réseau de notre client web) ou des moteurs et outils open source.

**Recommandation** : ne pas l'installer maintenant. La recherche de design se fera par documentation publique et observation. Installer REA le jour où une question précise et licite le justifie.

**Remarque sur l'environnement** : cette session tourne dans un conteneur cloud éphémère. Une installation faite ici ne persisterait pas. Pour un usage durable, il faut installer REA sur la machine du porteur de projet.
