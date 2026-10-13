# Plan de reverse engineering — League of Legends, Mobile Legends, Pokémon Unite

Statut : **plan à valider**. Remplace l'approche « tout réinventer » des expériences E1 à E3 (voir la décision 0003).

## 1. Objectif

**Copier d'abord, varier ensuite.** Relever de façon exhaustive les mécaniques et les paramètres chiffrés des trois jeux, puis les comparer système par système. On choisit ensuite, pour chaque système, la version à garder (ou un mélange), et on obtient un jeu « copie mixée » complet. Ce n'est qu'après qu'on fait varier :

- les personnages, qu'on recrée ou qu'on habille selon les univers ;
- les menus, simplifiés ;
- le visuel, plus lumineux et plus jovial.

L'objectif de cette méthode est de **ne pas oublier de détails**. Les trois jeux ont des milliers d'heures d'équilibrage ; on part de leurs chiffres au lieu de les deviner.

## 2. Méthode : quoi, comment, et où est la limite

### Ce qu'on copie

- **Les mécaniques** : formules de dégâts, progression, économie, règles d'aggro, structure de carte, objectifs, timings.
- **Les paramètres chiffrés** : stats de base et par niveau, ratios, temps de recharge, portées, valeurs des objets, minuteurs.
- **Les conventions de lisibilité et de commandes** qui marchent.

### D'où viennent les données

1. **Sources officielles publiques** :
   - **Data Dragon** de Riot : JSON officiel des champions, sorts et objets de LoL ;
   - notes de patch des trois jeux ;
   - pages officielles des Pokémon et des objets de Unite.
2. **Bases communautaires**, qui ont déjà fait le relevé fin, souvent par mesure en jeu :

   | Jeu | Sources |
   | --- | --- |
   | LoL | wiki officiel (wiki.leagueoflegends.com), CommunityDragon (données extraites du client et publiées) |
   | Mobile Legends | wiki Fandom |
   | Pokémon Unite | Serebii, Dittobase, unite-db |
3. **Observation directe** de parties et de vidéos, pour ce qui n'est documenté nulle part : timings d'animation, ressenti des commandes, conventions d'interface. Chaque mesure est notée avec sa méthode et son niveau de confiance.
4. **Nos propres mesures en jeu** (en mode entraînement), pour vérifier les valeurs douteuses : chronomètre sur vidéo, dégâts affichés, distances relatives.

### Ce qu'on ne fait pas, et pourquoi ça ne nous prive de rien

- **Décompiler ou instrumenter les clients des trois jeux.** Leurs conditions d'utilisation l'interdisent, ils sont protégés par des anti-triches (Vanguard, au niveau du noyau, pour LoL), et c'est hors du cadre légal de la rétro-ingénierie. Surtout, c'est **inutile** : les chiffres que donnerait une décompilation sont déjà publiés par Riot (Data Dragon) ou relevés par les communautés.
- **Récupérer leurs assets** : modèles, textures, sons, icônes. Notre visuel sera de toute façon différent (plus lumineux).

REA reste donc inutile pour ce plan. Les sources publiques couvrent le besoin.

### Usage

**Privé, entre amis**, sans distribution ni vente (voir `docs/vision.md`). Les personnages repris de licences restent dans `packs/local/`.

### Blocage technique actuel

Le conteneur de cette session n'a pas accès à ces sites : la politique réseau de l'environnement les refuse. Deux options :

- **Recommandée** : ouvrir l'accès réseau de l'environnement aux domaines listés ci-dessous. Il faut ajouter ces hôtes dans « Allowed domains » (paramètres de l'environnement, menu Edit ; voir https://code.claude.com/docs/en/cloud-environments#network-access).
- Lancer les scripts d'extraction sur ta machine et pousser les fichiers JSON obtenus.

Domaines nécessaires :

- `ddragon.leagueoflegends.com`
- `raw.communitydragon.org`
- `wiki.leagueoflegends.com`
- `mobile-legends.fandom.com`
- `www.serebii.net`
- `www.dittobase.com`
- `unite-db.com`

## 3. Inventaire des systèmes à relever

C'est la liste de contrôle « ne rien oublier ». Chaque ligne donnera une **fiche** par jeu (voir le §4), sauf si le système n'existe pas dans ce jeu.

### A. Structure de partie

| # | Système | LoL | MLBB | Unite |
| --- | --- | --- | --- | --- |
| A1 | Format et nombre de joueurs, modes alternatifs | 5v5 (+ ARAM) | 5v5 (+ Brawl) | 5v5 (+ 3v3) |
| A2 | Durée typique, abandon, conditions de victoire | destruction du Nexus | destruction de la base | score à la fin du temps (10 min) |
| A3 | Phases de partie (début, milieu, fin) et événements minutés | ✓ | ✓ | ✓ (ex. Rayquaza à 2:00 de la fin) |
| A4 | Réapparition : délai selon le niveau et le temps | ✓ | ✓ | ✓ |

### B. Carte

| # | Système |
| --- | --- |
| B1 | Dimensions, échelle (unités de distance), symétrie |
| B2 | Voies : nombre, longueur, zones de jungle, rivière |
| B3 | Bases, fontaine (soin, zone protégée), retour à la base |
| B4 | Buissons et brouillard de guerre ; balises de vision (LoL) |
| B5 | Murs, passages, terrain modifiable |
| B6 | Vitesse sur certaines zones (couloirs d'accélération de Unite) |

### C. Unités joueurs : stats

| # | Système |
| --- | --- |
| C1 | Liste complète des stats : PV, ressource (mana ou énergie, ou aucune dans Unite), régénérations, attaque, puissance, armure, résistance magique, vitesse d'attaque, portée, vitesse de déplacement, critique, vol de vie, réduction de temps de recharge, ténacité, pénétrations |
| C2 | Stats de base et **croissance par niveau**, pour chaque personnage |
| C3 | Taille de collision et de sélection |
| C4 | Plafonds (vitesse d'attaque, réduction de recharge, vitesse de déplacement et ses paliers) |

### D. Combat : formules

| # | Système |
| --- | --- |
| D1 | Réduction par l'armure et la résistance (LoL : 100 / (100 + armure)) ; équivalents MLBB et Unite |
| D2 | Ordre d'application des pénétrations et réductions |
| D3 | Types de dégâts : physique, magique, brut ; critique |
| D4 | Boucliers, soins, réduction des soins (blessures graves) |
| D5 | Contrôles : types (étourdir, enraciner, projeter, ralentir, silence, provoquer…), ténacité, rendements décroissants, immunités |
| D6 | Attaque de base : temps de préparation, annulation d'animation, projectiles ; attaque renforcée tous les 3 coups (Unite) |
| D7 | Règles de ciblage : clic (LoL), verrouillage automatique et priorités (MLBB, Unite), assistance de visée |
| D8 | Dégâts et cible des tours, priorité d'aggro |

### E. Capacités

| # | Système |
| --- | --- |
| E1 | Structure du kit : passif, 3 sorts et un ultime (LoL et MLBB) ; 2 attaques à choix d'évolution et un Unite Move (Unite) |
| E2 | Rangs et montée de niveau des sorts ; choix d'évolution aux niveaux fixes (Unite) |
| E3 | Ratios (sur l'attaque ou la puissance), valeurs par rang, coûts, temps de recharge |
| E4 | Temps d'incantation, vitesse des projectiles, formes et tailles des zones |
| E5 | Recharge de l'ultime : par niveau (LoL, MLBB) ou par jauge (Unite) |
| E6 | Sorts d'invocateur et de combat (Flash, Soins…), objets de combat de Unite |

### F. Progression et économie

| # | Système |
| --- | --- |
| F1 | Courbe d'expérience, niveau max (18 pour LoL, 15 pour MLBB et Unite), partage d'XP, XP de rattrapage |
| F2 | Or : revenu passif, sbires, éliminations, primes et séries, partage (MLBB) |
| F3 | Boutique et objets : stats, prix, recettes, effets uniques ; **objets tenus** de Unite (3 emplacements, niveaux, pas de boutique en partie) |
| F4 | Retour à la base et achat (LoL), achat à distance (MLBB) |
| F5 | Emblèmes (MLBB) et runes (LoL) : à garder, simplifier ou supprimer |

### G. Sbires, jungle, objectifs

| # | Système |
| --- | --- |
| G1 | Vagues de sbires : apparition, composition, croissance, trajets, aggro |
| G2 | Monstres de jungle : camps, stats, délais de réapparition, récompenses, bonus (rouge et bleu ; violet et orange de MLBB) |
| G3 | Objectifs majeurs : Dragons, Héraut et Baron (LoL) ; Tortue et Seigneur (MLBB) ; Rotom, Drednaw, Zapdos ou Rayquaza (Unite). Minuteurs, effets, vol |
| G4 | Structures : tours (stats, plaques, boucliers de début, dégâts croissants), inhibiteurs, Nexus |
| G5 | **Zones de but de Unite** : marquer des points, durée de canalisation, interruption, PV des zones, boucliers |

### H. Interface et flux (à simplifier ensuite)

| # | Système |
| --- | --- |
| H1 | Parcours de menus, de l'accueil à la partie et au résultat, en nombre d'écrans et de clics |
| H2 | Sélection : draft, bannissements, rôles |
| H3 | Interface en partie : barres de vie (graduations), minimap, tableau des scores, minuteurs |
| H4 | Indicateurs : portée, zones, télégraphes ennemis, numéros de dégâts |
| H5 | Communication : signaux (pings), messages rapides |
| H6 | Fin de partie : écran de résultat, statistiques |

### I. Bots

| # | Système |
| --- | --- |
| I1 | Comportements observables des bots officiels : niveaux, priorités, rotations |

## 4. Livrables

```text
docs/research/
├── reverse-engineering-plan.md       ← ce document
├── evidence-log.md                   registre des sources, dates, versions de patch, confiance
├── lol/<système>.md                  une fiche par système (A1 … I1)
├── mlbb/<système>.md
├── unite/<système>.md
└── comparison.md                     matrice des 3 jeux, système par système
data/reference/
├── lol/      champions.json, items.json, …     extraits bruts, version de patch notée
├── mlbb/     heroes.json, items.json, …
└── unite/    pokemon.json, held-items.json, …
tools/extract/                        scripts d'extraction (relançables à chaque patch)
```

Chaque fiche suit le modèle du brief (§9) : question, source, valeur relevée, confiance, intérêt pour nous.

## 5. Étapes

| Phase | Contenu | Livrable | Point de décision avec toi |
| --- | --- | --- | --- |
| **R0** | Ouverture de l'accès réseau aux sources ; scripts d'extraction | `tools/extract/`, `data/reference/*` | — |
| **R1** | Relevé des systèmes A à G pour les 3 jeux (cœur du gameplay) | fiches + données brutes | — |
| **R2** | Matrice comparative, et **proposition de mélange** système par système | `comparison.md` | ✋ On discute du détail, système par système, et tu tranches |
| **R3** | Relevé du système H (menus, interface) et propositions de simplification | fiches H + maquettes | ✋ Validation des écrans |
| **R4** | Spécification complète de la « copie mixée » | `docs/design/rules-v1.md` | ✋ Validation finale avant développement |
| **R5** | Implémentation de la copie mixée, avec les personnages repris tels quels comme référence de test | jeu jouable contre des bots | ✋ Premières parties |
| **R6** | Variation : personnages recréés ou réhabillés par univers, visuel lumineux | packs de personnages | — |

## 6. Ce que devient le travail déjà fait

- **Conservé** :
  - le moteur de simulation sans rendu (pas fixe, même résultat pour une même graine, piloté par commandes) ;
  - les tests, la télémétrie, le principe « un personnage = un fichier de données validé ».
- **Remplacé** : le format de kit simplifié et ses chiffres inventés. Le nouveau format suivra les systèmes C à F (stats par niveau, ratios, rangs des sorts…), et les valeurs viendront des jeux de référence.
- **Repoussé** : le budget de puissance et le profil multi-axes. Dans une copie, l'équilibre vient des chiffres des jeux eux-mêmes. Ces outils resserviront pour le **créateur de personnages** : situer un personnage inventé par rapport aux vrais, et le contraindre à rester dans la moyenne.

## 7. Première proposition de mélange (à discuter en R2, pas une décision)

Selon ce qu'on sait déjà des trois jeux et ton objectif (parties courtes, lisibles, jouables à 2–3 amis + bots) :

| Système | Piste | Raison |
| --- | --- | --- |
| Durée et victoire | **Unite** (10 min, score) ou **MLBB** (environ 12–15 min, destruction) | Partie courte ; LoL est trop long (30 min et plus) |
| Carte | **MLBB** (3 voies, jungle) en version compacte, ou carte de **Unite** | Lisibilité, et jeu à 3v3 possible |
| Commandes | **MLBB / Unite** (déplacement direct, visée assistée), avec option clavier-souris | Plus accessible que le clic-pour-se-déplacer de LoL |
| Stats et formules | **LoL** (le plus documenté, le plus profond), simplifié | Profondeur sans rien inventer |
| Progression | Niveaux en partie (les 3) ; évolutions de sorts façon **Unite** | Choix clairs sans arbre complexe |
| Économie | **Objets tenus de Unite** (pas de boutique en partie), ou boutique simplifiée façon **MLBB** | Moins de menus, conforme au brief |
| Objectifs | Objectifs majeurs minutés (les 3) | Moments forts lisibles |

## 8. Questions pour toi

1. **Accès réseau** : tu ouvres les domaines listés ci-dessus dans l'environnement, ou tu préfères lancer les extractions de ton côté ?
2. **Quel jeu sert de squelette ?** Proposition :
   - Unite ou MLBB pour la structure de partie et la carte ;
   - LoL pour la profondeur des stats.
3. **Boutique ou objets tenus ?** Ça change beaucoup les menus.
4. **« Pokémon Brawl »** : c'est bien Pokémon Unite ?
