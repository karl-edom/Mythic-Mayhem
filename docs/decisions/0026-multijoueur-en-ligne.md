# 0026 — Multijoueur en ligne : options et plan proposé

Date : 2026-10-20. Statut : **acceptée en partie**. Décidé : 4 joueurs, tous dans le même pays, modèle B (délai d'entrée). Mise en relation : PeerJS. Reste ouvert : l'accès des amis à la page.

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

## Arbitrage du 2026-10-20

> « 4 joueurs, même pays, ok délai d'entrée, go étape 1 »

- **Jusqu'à 4 joueurs**, tous dans le même pays : un délai d'entrée de 2 à 3 images devrait suffire.
- **Modèle B** (délai d'entrée), avec une liaison directe entre chaque paire de joueurs (WebRTC).
- **Encore ouvertes :** la mise en relation (question 3) et l'accès des amis à la page (question 4).

## Étape 1 faite : la simulation est la même dans tous les navigateurs

- **Fonctions mathématiques.**
  - Les 30 `Math.hypot` de la simulation (`world.ts`, `bot.ts`, `arena.ts`, `nav.ts`, `sim/math.ts`) passent par `hyp()`, qui calcule la racine carrée de la somme des carrés.
  - La puissance `**` (usure du combo) passe par `powi()`, une multiplication répétée.
  - Le sinus et le cosinus (influence de trajectoire) passent par `cosSin()`, une série de Taylor. Écart avec `Math.sin` et `Math.cos` : moins de 2 × 10⁻⁷ au pire, bien moins pour les petits angles employés.
  - Ces fonctions sont dans `src/sim/math.ts`. Elles n'utilisent que les opérations arrondies à l'identique partout (+, −, ×, ÷, `Math.sqrt`, `Math.round`).
- **Stick sur 8 bits.** À l'entrée de chaque image (`quantizeCommand`), chaque axe du stick est arrondi sur 255 crans. Une manette locale et une commande reçue du réseau donnent donc exactement la même simulation.
- **Tests (`tests/determinism.test.ts`).**
  - Aucune fonction à risque dans les fichiers de la simulation : le test lit le code et refuse `Math.hypot`, `sin`, `pow`, `**`, `random`…
  - Précision de `cosSin`.
  - Arrondi du stick.
  - **Rejeu** : une partie de 20 s à 4 joueurs dans le village, rejouée à partir de ses commandes passées par du JSON (comme sur le réseau), donne la même empreinte d'état.
- **Ce qui n'est pas prouvé ici.** Seul Chromium est disponible pour les tests. L'étape 2 (empreinte d'état échangée en partie) détectera tout écart réel entre vos navigateurs.

**Prochaine étape (2 et 3) :** l'empreinte d'état, puis la boucle à délai d'entrée, testée d'abord sans réseau : plusieurs mondes dans la même page, avec latence, pertes et gigue simulées.

## Arbitrage du 2026-10-20 (suite) : PeerJS

> « go étape 2, et PeerJS pour la mise en relation »

**Mise en relation : PeerJS.**
- La bibliothèque PeerJS (licence MIT, environ 30 Ko) et son serveur public gratuit font se rencontrer les navigateurs.
- Ensuite, les joueurs échangent directement entre eux (WebRTC) : le serveur ne voit passer aucune donnée de jeu.
- Limite connue : c'est un service tiers sans garantie de disponibilité. S'il tombe, on pourra héberger le même serveur (PeerServer, MIT) sans changer le jeu.

## Étape 2 faite : empreinte d'état et pas synchronisé, testés sur un réseau simulé

Code : `src/net/`, indépendant du transport ; le transport et l'interface viennent à l'étape 3.

- **`hash.ts` : empreinte d'état.**
  - Elle couvre tout ce qui décide de la suite : combattants, éléments du décor, projectiles, zones, scores, tick.
  - Les données fixes (kits, catalogue) et l'affichage (événements) n'y entrent pas.
  - Le texte JSON écrit les nombres de la même façon dans tous les navigateurs ; l'empreinte est un FNV-1a sur 32 bits.
- **`lockstep.ts` : pas synchronisé avec délai d'entrée.**
  - **Horloge locale** : elle avance d'une image par frame, et la partie ne la dépasse jamais. Une commande tapée maintenant est prévue `délai` images plus tard et envoyée aux autres.
  - **Attente** : la partie n'avance qu'avec les commandes de tous. Pendant une attente, l'horloge s'arrête et les appuis (saut, coup, esquive, saisie, technique) sont gardés pour la commande suivante : rien n'est perdu.
  - **Pertes** : chaque message répète les 8 dernières images envoyées, donc une perte isolée ne coûte rien.
  - **Désynchronisation** : chacun envoie son empreinte toutes les 60 images (une fois par seconde), et le premier écart est signalé.
  - **Bots** : ils tournent sur chaque machine à l'identique, rien n'est envoyé pour eux.
  - **`delayFor(latence)`** choisit le délai : nombre d'images que met une commande à arriver, plus une. Entre amis d'un même pays (15 à 25 ms) : **3 images, soit 50 ms**.
- **Tests (`tests/lockstep.test.ts`, 8 tests).** Ils simulent quatre machines, chacune avec sa copie de la partie et un joueur joué par un bot local, reliées par des liens avec latence, gigue et pertes.

| Conditions | Résultat |
| --- | --- |
| 4 joueurs, 20 ms ± 8, 1 % de pertes, délai 3 | même empreinte partout ; la partie tourne à plus de 94 % de la vitesse normale |
| 40 ms ± 10, 1 % de pertes, délai 4 | identique ; plus de 94 % |
| 5 % de pertes | identique ; quelques ralentissements |
| latence (120 ms) plus longue que le délai | identique ; la partie attend les commandes en retard |
| 2 joueurs et 2 bots | identique |
| une machine faussée volontairement (1 PV de moins) | **désynchronisation détectée sur toutes les machines en moins d'une seconde** |

**Ce qu'on a appris en route.** Sans horloge, la partie consommait d'un coup ses images d'avance au départ. Toute la marge du délai disparaissait et la partie tournait à 26 % de sa vitesse. L'horloge locale l'empêche.

**Prochaine étape (3) : le vrai réseau.**
- Le transport PeerJS.
- Un salon : code de salle, choix des personnages, envoi des packs choisis, mesure de la latence pour régler le délai, départ commun.
- Le branchement de la boucle de jeu, avec un message clair en cas de désynchronisation ou de déconnexion.

## Étape 3 (2026-10-21) : le vrai réseau et le salon

> « go jeu en ligne étape 3 »

### Un changement par rapport à PeerJS, et pourquoi

La page publiée sur claude.ai offre une capacité **« room »** : un canal en temps réel entre toutes les personnes qui ont la page ouverte au même moment. Elle remplit le rôle prévu pour PeerJS (se trouver par un code de salle), sans serveur tiers ni dépendance à ajouter. Elle sert aussi de **relais** quand la liaison directe ne s'établit pas.

| | PeerJS (choix initial) | Salle de la page (retenu) |
| --- | --- | --- |
| Mise en relation | serveur public gratuit de PeerJS, sans garantie | la page elle-même, rien à héberger |
| Dépendance | bibliothèque PeerJS (MIT, ~30 Ko) | aucune |
| Si la liaison directe échoue (4G, réseau strict) | rien, sauf à payer un relais TURN | la partie passe par la salle (30 envois/s), plus lente mais jouable |
| Qui peut entrer | quiconque a le code | les personnes avec qui la page est partagée sur claude.ai |

La liaison directe reste du **WebRTC** (canal de données intégré au navigateur, adresse publique trouvée par le serveur STUN gratuit de Google).

### Ce qui est codé

- **`src/net/room.ts` : la salle.**
  - Sur claude.ai, c'est la capacité « room » de la page, avec une salle nommée par code (`mm-1234`).
  - En développement, une salle de remplacement relie les onglets d'un même navigateur (BroadcastChannel) : on peut tester le salon et une partie sans claude.ai.
  - Seule la **présence** est utilisée : un petit objet par joueur (4 Ko au plus), que tous lisent, Viewers compris.
- **`src/net/link.ts` : les liaisons.**
  - **Directe** : un canal WebRTC par paire de joueurs, sans ordre ni renvoi (un paquet en retard ne sert à rien : le suivant le répète). La poignée de main passe par la présence, réduite à l'essentiel pour tenir dans les 4 Ko.
  - **Relais** : le dernier message de chaque sorte reste aussi dans la présence de l'envoyeur. Le récepteur garde le premier arrivé des deux (la boucle ignore ce qu'elle a déjà).
  - **Mesure de la latence** : aller-retour toutes les demi-secondes, par la liaison directe et par la salle.
  - **Méfiance** : tout ce qui arrive est vérifié et reconstruit champ par champ (`cleanMessage`). Une commande n'est acceptée que de la page qui tient ce combattant.
- **`src/client/online.ts` : le salon** (bouton « 🌐 En ligne » de l'écran de sélection).
  - **Créer une salle** donne un code à transmettre aux amis ; **Rejoindre** demande ce code.
  - On voit qui est là, son combattant, sa liaison (directe ou relais) et sa latence.
  - Chacun choisit son combattant. L'hôte choisit l'arène, des bots en plus, leur niveau, la règle de victoire, puis lance.
  - **Délai d'entrée** choisi au lancement : le pire aller-retour mesuré, divisé par deux, plus une marge (`delayFor`).
  - Le lancement est refusé tant que quelqu'un a une **autre version de la page** (empreinte des kits différente) : sinon les parties divergeraient.
- **La partie** (`main.ts`) : la boucle à délai d'entrée (étape 2) remplace l'avancée locale.
  - Les bots tournent sur chaque page à l'identique, avec la graine de l'hôte.
  - **Pause** : le menu s'ouvre, mais la partie continue pour les autres.
  - **Fin anticipée**, avec un message clair : désynchronisation, joueur parti, ou plus rien reçu depuis 10 s (« CONNEXION… » s'affiche dès 1,5 s d'attente).
  - Après la partie : **retour au salon**, où l'hôte peut relancer.

### Tests

**`tests/online.test.ts`** reproduit une salle comme celle de la plateforme : présence fusionnée champ par champ, envoyée 30 fois par seconde, avec latence et gigue. La partie y passe **par le seul relais**, le cas le plus défavorable (aucune liaison directe).

| Conditions (relais seul) | Délai choisi | Résultat |
| --- | --- | --- |
| 4 joueurs, 20 ms ± 5 | 4 images (67 ms) | 1 800 images sur 1 800, même partie partout |
| 4 joueurs, 40 ms ± 10 | 5 images (83 ms) | 1 800 sur 1 800, même partie partout |
| 2 joueurs, 80 ms ± 20 | 8 images (133 ms) | 1 800 sur 1 800, même partie partout |

Les tests vérifient aussi :
- le nettoyage des messages reçus (champs inconnus, nombres absurdes, tailles excessives) ;
- les codes de salle ;
- la réduction des descriptions WebRTC.

### Limites et ce qui reste

- **La latence réelle de la salle claude.ai n'est pas mesurable d'ici.** Le salon l'affiche pour chaque joueur : c'est le premier chiffre à regarder lors du premier essai entre amis.
- **La liaison directe** peut être bloquée par le cadre de la page sur claude.ai : le salon l'indique (« direct » ou « relais »). La partie marche dans les deux cas.
- **Accès** : tes amis doivent avoir accès à la page (menu Partager de claude.ai) et l'ouvrir dans claude.ai, pas en page seule.
- Pas encore de mode **équipes** en ligne, ni de choix de personnage en direct dans la grille (on choisit dans une liste).
