# Super Smash Bros. Ultimate — relevés de données et comparaison avec le rythme v3

Date : 2026-10-15. Demande : « regarde si tu peux trouver des relevés / de la donnée sur internet » (après la décision 0011, dont les valeurs étaient des transpositions).

## Méthode et fiabilité

- Recherches web uniquement. Les sites spécialisés (SmashWiki, Ultimate Frame Data, Dragdown, Kurogane Hammer) n'ont pas pu être ouverts directement depuis l'environnement de travail. Les chiffres viennent des extraits renvoyés par la recherche.
- **Aucune source officielle de Nintendo.** Tout vient de la communauté, qui mesure le jeu image par image (*data mining*, *frame data*). Ces chiffres sont reconnus et utilisés en compétition, mais ils restent non officiels.
- Smash tourne à **60 images/s** (1 image = 1/60 s), comme notre simulation : les durées se comparent directement.
- Les **distances** de Smash sont en « unités » de jeu, sans conversion connue en mètres. On compare donc des **rapports** (le plus rapide / le plus lent, par exemple), pas des valeurs brutes.

Légende : ✅ observé dans plusieurs sources concordantes ; 🟡 une seule source, ou une source d'un autre épisode ; ❓ non trouvé.

## Bouclier

| Donnée | Smash Ultimate | Fiabilité | Notre v3 |
| --- | --- | --- | --- |
| Points de bouclier | **50** | 🟡 (tableau SmashWiki) | 100 |
| Usure quand on le tient | **0,15 / image = 9 / s** : vide en ~5,6 s | 🟡 | 20 / s : vide en 5 s ✔ proche |
| Recharge | **0,08 / image = 4,8 / s** : plein en ~10,4 s | 🟡 | 15 / s : plein en 6,7 s, **plus rapide** |
| Dégâts au bouclier | dégâts de l'attaque × **1,19** (constante qui augmente les dégâts au bouclier depuis Smash 4) | 🟡 | × 0,3 (× 2 lourde, × 3 brise-garde) |
| Après bris | le bouclier repart à **25 / 50 (50 %)** | 🟡 | repart à 0 |
| Étourdissement au bris | **400 − pourcentage** images (Brawl et suivants), plancher 90 images (1,5 s) ; marteler les boutons le réduit (3 images par appui) | ✅ formule, 🟡 pour Ultimate | 2 s fixes |
| Lâcher le bouclier | **11 images** (0,18 s) ; sauter hors du bouclier : 3 images, sans ce délai | 🟡 | instantané |
| Parade (*perfect shield*) | lâcher le bouclier juste avant l'impact : tenu ≥ 3 images, impact dans une fenêtre de **5 images** ; aucun dégât au bouclier, on agit plus tôt | ✅ | — |

## Esquives

| Donnée | Smash Ultimate | Fiabilité | Notre v3 |
| --- | --- | --- | --- |
| Esquive sur place | invulnérable **dès l'image 3** pour presque tout le monde | ✅ | invulnérable 0,2 s au début |
| Esquives répétées | **usure des esquives** : chaque esquive ajoute un niveau (5 au plus), qui retombe d'un niveau toutes les **2 s**. Une esquive usée est plus lente, moins invulnérable et va moins loin. | ✅ | 0,3 s d'attente fixe |
| Esquive aérienne | **une par saut**, rendue en touchant le sol ; l'esquive en diagonale a un fort temps d'atterrissage | ✅ | — |

## Coups et recul

| Donnée | Smash Ultimate | Fiabilité | Notre v3 |
| --- | --- | --- | --- |
| Étourdissement après un coup | **0,4 image par unité de recul** : il découle du recul, il n'est pas choisi par coup | ✅ (Melee à Ultimate) | choisi par coup dans le kit |
| Vitesse d'éjection | recul × **0,03** | ✅ | recul ÷ poids, en m/s |
| Freinage après éjection | la vitesse baisse de **0,051 par image** : départ très rapide, puis ralentissement (« comme un ballon ») | 🟡 | frottement de 30 m/s² |
| Seuil de « vol » (*tumble*) | recul > **80** (~32 images d'étourdissement) | ✅ | mise au sol à 9 m/s |
| Formule du recul | dépend des **dégâts du coup, du pourcentage de la cible, de son poids**, d'un recul de base et d'un facteur de croissance (structure stable depuis Melee) ; constantes exactes d'Ultimate non confirmées | ✅ structure, ❓ constantes | recul × (1 + 0,6 × vie perdue) ÷ poids |
| Coups rapides (*jab*) | Captain Falcon : 1er coup actif à l'image **3**, 2e à **9**, 3e à **17–18** ; Shulk : image 5 | ✅ | démarrage ≥ 0,08 s (5 images) |

## Déplacements et sauts

| Donnée | Smash Ultimate | Fiabilité | Notre v3 |
| --- | --- | --- | --- |
| Vitesse de course | **1,12** (Piranha, la plus lente) à **3,85** (Sonic) ; Mario 1,76, Captain Falcon 2,552 : un rapport **× 3,4** entre extrêmes | ✅ | 4,35 à 6,23 m/s : un rapport × 1,4 seulement |
| Durée d'un saut (Mario) | saut complet **56 images** (0,93 s), petit saut **40** (0,67 s) ; avec chute rapide : 39 et 28 | 🟡 | ~1,1 s, pas de petit saut |
| Chute rapide (Mario) | 1,5 → **2,4** (+ 60 %) | ✅ | — |
| Gravité | de ~0,07 à **0,23** (Fox, la plus forte) : chaque personnage a la sienne | 🟡 | 18 m/s² pour tous |
| Temps de départ d'un saut | 3 images pour tout le monde (souvent cité, non confirmé ici) | ❓ | immédiat |

## Durée des combats

| Donnée | Smash | Fiabilité | Notre v3 |
| --- | --- | --- | --- |
| Règle de tournoi | **3 vies, 6 à 8 minutes** (7 min le plus fréquent) | ✅ (règlements) | 3 K.-O., 4 minutes |
| Durée mesurée | Smash 4 seulement : un match à 2 vies dure en moyenne **3 min 08** (petit échantillon), soit ~1 min 35 par vie | 🟡 | entre bots : 40 à 75 s par K.-O. |

## Ce que ça dit de notre v3

1. **Ce qui est déjà juste :** l'usure du bouclier tenu (vide en ~5 s), le principe du recul qui grandit avec les dégâts, les combos courts.
2. **Ce qui est trop généreux chez nous :**
   - le bouclier se **recharge 1,5 × trop vite** et **repart de zéro** au lieu de 50 % ;
   - l'étourdissement au bris est **court** (2 s contre 1,5 à 6,7 s dans Smash, où un bris coûte souvent une vie).
3. **Ce qui manque et ferait « Smash » :**
   - la **parade** : lâcher le bouclier au bon moment, un contre-jeu au timing ;
   - l'**usure des esquives**, plus juste que notre attente fixe de 0,3 s ;
   - **une esquive aérienne par saut** ;
   - le **petit saut** et la **chute rapide** ;
   - des **vitesses bien plus contrastées** entre personnages (× 3,4 contre × 1,4).
4. **Une piste de fond :** dans Smash, l'**étourdissement découle du recul** (0,4 image par unité), au lieu d'être fixé coup par coup. Chez nous, c'est le kit qui fixe les deux séparément. Les relier rendrait le système plus lisible (un coup qui envoie loin étourdit longtemps) et réduirait le nombre de chiffres qu'un créateur de personnage doit régler.
5. **Rythme des K.-O. :** nos bots marquent un K.-O. toutes les 40 à 75 s, contre ~1 min 30 par vie dans Smash. Notre combat reste plus rapide que Smash. C'est cohérent avec la barre de vie, mais c'est à juger en jouant.

## Sources

- SmashWiki : [Shield](https://www.ssbwiki.com/Shield), [Stun](https://www.ssbwiki.com/Stun), [Shieldstun](https://www.ssbwiki.com/Shieldstun), [Perfect shield](https://www.ssbwiki.com/Perfect_shield), [Out of shield](https://www.ssbwiki.com/Out_of_shield), [Dodge staling](https://www.ssbwiki.com/Dodge_staling), [Roll](https://ssbwiki.com/Roll), [Hitstun](https://www.ssbwiki.com/Hitstun), [Knockback](https://www.ssbwiki.com/Knockback), [Gravity](https://www.ssbwiki.com/Gravity), [Captain Falcon (SSBU)/Neutral attack](https://ssbwiki.com/Captain_Falcon_(SSBU)/Neutral_attack), [Shulk (SSBU)/Neutral attack](https://ssbwiki.com/Shulk_(SSBU)/Neutral_attack), [Time](https://www.ssbwiki.com/Time)
- Kurogane Hammer : [run speed](https://kuroganehammer.com/Ultimate/runspeed), [fall speed](https://kuroganehammer.com/Ultimate/FallSpeed), [walk speed](https://kuroganehammer.com/Ultimate/WalkSpeed), [Smash 4 formulas](https://kuroganehammer.com/Smash4/Formulas)
- [Ultimate Frame Data — Stats](https://ultimateframedata.com/stats.php)
- Dragdown : [SSBU Hitting the Opponent](https://dragdown.wiki/wiki/SSBU/System_Mechanics/Hitting_the_Opponent), [SSBU Defense](https://dragdown.wiki/wiki/SSBU/System_Mechanics/Defense)
- [Smashboards — Knockback, Launch Speed, Hitstun… calculation tool](https://smashboards.com/threads/tool-knockback-launch-speed-hitstun-hitlag-shieldstun-calculation-v1-11.324878/), [Average match time calculations (Smash 4)](https://smashboards.com/threads/average-match-time-calculations-from-tournaments.368523/)
- [Event Hubs — run speed rankings](https://www.eventhubs.com/news/2018/nov/30/here-are-run-speeds-rankings-super-smash-bros-ultimates-entire-roster/), [Event Hubs — knockback « like hitting a balloon »](https://www.eventhubs.com/news/2018/jun/25/knockback-will-work-differently-super-smash-bros-ultimate-almost-hitting-balloon/)
- [Dignitas — How to Perfect Shield/Parry](https://dignitas.gg/articles/how-to-perfect-shield-parry-in-smash-ultimate), [GameFAQs — tournament stock/time standards](https://gamefaqs.gamespot.com/boards/234547-super-smash-bros-ultimate/77238085)
