# Fiche de reverse engineering — J-Stars Victory VS+

Statut : **première passe**, construite à partir de sources publiques (wikis, guides). Les valeurs chiffrées restent à relever par observation de vidéos (méthode du plan `reverse-engineering-plan.md`, section 2). Chaque ligne indique son niveau de confiance.

Jeu de référence : *J-Stars Victory VS* (Spike Chunsoft / Bandai Namco, 2014 ; version occidentale *VS+* en 2015). Crossover des héros du Weekly Shōnen Jump, combat en arène 3D.

## 1. Structure d'un match

| Élément | Comportement observé | Confiance |
| --- | --- | --- |
| Format | surtout 2v2 ; aussi 1v1 et 3v1 ; plus un emplacement de **personnage de soutien** par équipe | élevée |
| Victoire | **jauge de victoire** par équipe, 3 crans en général ; chaque personnage adverse mis K.-O. remplit un cran ; la première équipe à remplir la jauge gagne | élevée |
| Fin au temps | l'équipe qui a le plus de crans gagne ; à égalité, la vie restante départage | élevée |
| Réapparition | un personnage K.-O. revient après quelques secondes à un point de la carte, avec une courte invulnérabilité | élevée |
| Combo entre alliés | les coups d'un coéquipier ne prolongent pas le combo en cours | moyenne |
| Arène | arène 3D fermée, avec éléments destructibles et murs contre lesquels on projette l'adversaire | moyenne |

## 2. Actions d'un personnage

| Action | Rôle | Confiance |
| --- | --- | --- |
| Attaque légère | point de départ de tous les combos, enchaînable | élevée |
| Attaque forte | lente et risquée (laisse ouvert), gros impact, se **charge** ; brise la garde | élevée |
| Attaques spéciales | plusieurs par personnage, coûtent de la jauge d'énergie | moyenne |
| Coup final / ultime | lié à un mode renforcé (« burst ») | faible — à vérifier |
| Garde | bloque les attaques légères | moyenne |
| Esquive / pas de côté | évitement court | moyenne |
| Dash, saut | déplacement rapide, combat aérien | moyenne |
| Verrouillage de cible | caméra et attaques orientées vers la cible verrouillée | moyenne |
| Appel du soutien | le personnage de soutien entre, fait une action, repart ; temps de recharge | moyenne |

## 3. Interface (HUD)

| Élément | Rôle | Confiance |
| --- | --- | --- |
| Vie | par personnage | élevée |
| Jauge de victoire | par équipe, en haut de l'écran | élevée |
| Jauge d'énergie | alimente les spéciales | moyenne |
| Jauge « Voltage » / burst | active le mode renforcé et l'ultime | faible — à vérifier |
| Icône de soutien | prêt / en recharge | moyenne |

## 4. Points encore inconnus (à relever)

- Fonctionnement exact du mode burst et de la jauge Voltage : comment elle se remplit, ce qu'elle débloque, sa durée.
- Recharge manuelle de la jauge d'énergie (bouton maintenu ?) et vitesse de recharge.
- Durées : combo complet, temps de récupération après une attaque forte, durée d'invulnérabilité à la réapparition, délai de réapparition.
- Ordres de grandeur des dégâts : combien de combos pour un K.-O.
- Durée par défaut d'un match.

## Sources

- [J-Stars Victory VS — Wikipédia (anglais)](https://en.wikipedia.org/wiki/J-Stars_Victory_VS)
- [J-Stars Victory VS — JoJo Wiki](https://jojowiki.com/J-Stars_Victory_VS)
- [Guide des joueurs — forums Dustloop](https://www.forums.dustloop.com/forums/topic/8519-j-stars-victory-vs-players-guide-discussion/) (section HUD, règles et commandes à exploiter)
- [Test de la version Vita — Dual Pixels](https://dualpixels.com/everyone-including-the-kitchen-sink-j-stars-victory-vs-vita-review/)
