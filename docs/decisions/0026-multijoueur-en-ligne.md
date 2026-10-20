# 0026 — Multijoueur en ligne : options et plan proposé

Date : 2026-10-20. Statut : **proposée** (en attente d'arbitrage du porteur de projet).

> « Préparer la version multijoueur en ligne (pour jouer avec mes amis). »

La vision (`docs/vision.md`, point 3) fait du multijoueur entre amis un **besoin central**. Elle demandait une simulation séparée du rendu et pilotée par des commandes : c'est le cas aujourd'hui. Ce document mesure où nous en sommes, compare les modèles réseau et propose un plan. **Rien n'est codé tant que les questions de la fin ne sont pas tranchées.**

## Où en est le moteur (mesuré le 2026-10-20)

Les mesures portent sur une partie à 4 combattants pilotés par des bots, dans le village (289 éléments), pendant 60 s. Elles sont faites avec Node 22, donc le moteur V8 de Chrome. Script : `exp/netcost.ts` dans le scratchpad de la session.

| Point | Mesure | Ce que ça permet |
| --- | --- | --- |
| Simulation à pas fixe | 60 images/s, `step(monde, commandes)` | base de tous les modèles réseau |
| Entrées | une `Command` par joueur et par image : stick, boutons appuyés ou tenus | quelques octets par image, faciles à envoyer |
| Hasard | aucun `Math.random` dans la simulation ; les bots ont un générateur avec graine | une partie se rejoue à l'identique |
| **Rejeu** | deux parties avec les mêmes commandes donnent **le même état**, à l'octet près | déterminisme établi sur un même navigateur |
| Coût d'une image | médiane **0,34 ms**, 95e centile 0,85 ms, 99e centile 1,75 ms | rejouer 8 images coûte environ 3 ms en temps normal |
| Copie de l'état | **0,9 ms** ; environ **17 Ko** en JSON | une sauvegarde par image est possible ; un envoi d'état complet 60 fois/s est trop lourd |

**Le risque principal : le déterminisme entre navigateurs.**
- Les opérations de base (+, −, ×, ÷, `Math.sqrt`) donnent exactement le même résultat partout (norme IEEE 754).
- En revanche, la norme JavaScript laisse les navigateurs **arrondir à leur façon** `Math.hypot` (30 appels dans la simulation), `Math.sin` et `Math.cos` (1 appel).
- Un ami sur Safari ou Firefox pourrait donc voir sa partie **diverger** peu à peu de celle d'un ami sur Chrome.
- Le correctif est simple et sans dépendance : remplacer ces appels par `Math.sqrt(x*x + y*y)` et un sinus et un cosinus écrits dans le projet.

## Les trois modèles réseau

| | **A. Hôte qui fait autorité** | **B. Pas synchronisé avec délai d'entrée** (*lockstep*) | **C. Retour en arrière** (*rollback*, comme GGPO ou Smash en ligne) |
| --- | --- | --- | --- |
| Principe | Un joueur fait tourner la vraie partie ; les autres envoient leurs commandes et reçoivent l'état | Chacun fait tourner la partie ; on attend les commandes de tous avant d'avancer, avec 2 à 4 images de délai fixe | Chacun avance avec ses propres commandes et devine celles des autres ; si la supposition était fausse, on revient en arrière et on rejoue |
| Ressenti | Ses propres coups arrivent avec un aller-retour de retard. Ce qui touche est décidé chez l'hôte : « je l'ai touché, mais non » | Constant et juste ; un léger retard de commande (33 à 66 ms) | Le meilleur : réponse immédiate, corrections parfois visibles (un adversaire qui « saute ») |
| Déterminisme entre navigateurs | **pas nécessaire** | **indispensable** | **indispensable** |
| Données échangées | l'état (≈ 17 Ko, à réduire par des différences) | les commandes (quelques octets par image) | les commandes |
| Si la connexion se dégrade | l'hôte continue ; les autres voient des saccades | tout le monde ralentit | les corrections deviennent plus grandes |
| Complexité | moyenne : prédiction de son propre personnage, interpolation des autres | **faible** | élevée : sauvegarder et restaurer l'état, rejouer, rendu tolérant aux corrections |
| Quand il convient | grosses parties, connexions inégales | amis proches (≤ 60 ms d'aller-retour), 2 à 4 joueurs | jeu de combat exigeant, joueurs éloignés |

## Ce que je recommande

**B d'abord, puis C seulement si le ressenti l'exige.** B demande les mêmes fondations que C : déterminisme, entrées compactes, transport, salon de jeu, détection de désynchronisation. Il est bien plus simple. Entre amis d'un même pays, 2 à 3 images de délai passent presque inaperçues dans un brawler. Si ce n'est pas assez réactif, C s'ajoute par-dessus sans rien jeter.

**Topologie.** Chaque joueur est relié à chacun des autres (2 à 4 joueurs) par **WebRTC**, un canal de données intégré aux navigateurs, sans dépendance. Les messages ne sont pas garantis : chaque paquet répète donc les dernières commandes, pour qu'une perte ne bloque pas la partie.

## Ce qu'il faut construire (étapes courtes et testables)

1. **Déterminisme garanti**
   - Remplacer `Math.hypot`, `sin` et `cos` dans `src/brawl/` ; interdire leur usage par un test.
   - Arrondir les commandes (stick sur 8 bits) avant de les simuler, chez soi comme chez les autres.
   - Test : un rejeu enregistré donne la même empreinte d'état.
2. **Empreinte d'état** toutes les secondes, échangée entre joueurs : une désynchronisation est détectée tout de suite (message clair, partie arrêtée proprement plutôt que deux parties différentes).
3. **Boucle à délai d'entrée**, testée d'abord **sans réseau**, entre deux mondes dans la même page et avec une latence simulée (pertes, gigue).
4. **Transport WebRTC** et **salon** :
   - un code de salle ; l'hôte choisit la carte et les règles ; chacun choisit son personnage ;
   - la partie démarre avec une graine commune.
5. **Personnages partagés** : l'hôte envoie aux autres les données des packs choisis (`kit`, `look`, `moves`), qui sont revalidés à l'arrivée. Les packs sont des données, jamais du code : c'est sûr, et tes amis n'ont rien à installer.
6. **Bots en ligne** : ils tournent chez chacun à l'identique (générateur avec graine), sans rien envoyer.
7. Plus tard, si besoin : **retour en arrière** (C), en sauvegardant l'état à chaque image (0,9 ms aujourd'hui, à réduire).

## Ce qui reste hors du code : à décider

- **La mise en relation (« signalisation »).** Deux navigateurs ont besoin d'un intermédiaire pour se trouver avant de se parler directement. Options :
  1. **un service gratuit existant**, par exemple le serveur public de PeerJS (bibliothèque MIT, environ 30 Ko). Rien à héberger, mais un service tiers sans garantie ;
  2. **Trystero** (MIT) : il passe par des réseaux publics existants, sans compte ni serveur à nous, mais dépend d'eux ;
  3. **un mini-serveur à nous** (par exemple Cloudflare Workers, dont l'offre gratuite suffit pour quelques amis). Fiable, mais il faut un compte et un petit déploiement ;
  4. à étudier : les capacités d'**état partagé** de la page publiée sur claude.ai. Rien à héberger, mais la latence et les limites ne sont pas vérifiées.
- **Les réseaux difficiles.** Certaines connexions (4G, réseaux d'entreprise) empêchent le lien direct. Il faut alors un **relais TURN**, qui a souvent un coût au volume. On peut commencer sans et voir si un de tes amis est concerné.
- **Où tes amis ouvrent le jeu.**
  - La page publiée est **privée** : il faudra la partager avec eux depuis claude.ai (menu Partager).
  - Elle contient les packs fan : un partage privé entre amis reste dans l'esprit de la règle « jamais dans le dépôt », mais c'est à toi de juger.

## Questions pour le porteur de projet

1. **Combien de joueurs en ligne** : 2 (duel) ou jusqu'à 4 ? Êtes-vous dans le même pays ?
2. **Modèle** : d'accord pour commencer par **B (délai d'entrée)**, puis passer au **retour en arrière** seulement si le ressenti ne suffit pas ?
3. **Mise en relation** : service gratuit existant (PeerJS ou Trystero), mini-serveur à nous (Cloudflare), ou essai de l'état partagé de la page claude.ai ?
4. **Accès** : on partage la page publiée avec tes amis ?

En attendant ta réponse, l'étape 1 (déterminisme garanti) est utile quel que soit le choix, sauf l'option A. C'est par elle que je commencerais.
