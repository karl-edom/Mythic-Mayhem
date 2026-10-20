# 0027 — Attaques aériennes vers le haut et vers le bas

Date : 2026-10-20. Statut : **acceptée** (choix du porteur de projet : commande et effet du coup vers le bas).

> « Quand on saute, les attaques devraient pouvoir être vers le bas, le haut, le côté en fonction du joystick. Pour attaquer un gars par au-dessus ou par en-dessous quand il saute ou quand on saute. »

## Le problème

En l'air, l'attaque légère ne partait que devant, à hauteur de poitrine. On ne pouvait pas toucher un adversaire juste au-dessus de soi (il saute plus haut) ni juste en dessous (on lui tombe dessus).

Le joystick ne pouvait pas servir à choisir la direction : dans cette arène en 3D, il dirige déjà le déplacement et la chute. « Haut » et « bas » n'y existent pas comme dans Smash, qui est en 2D.

## Ce qui a été décidé

**Commande** (option « boutons + visée automatique ») :

| En l'air | Coup aérien |
| --- | --- |
| attaque + **saut maintenu** | vers le **haut** |
| attaque + **garde maintenue** | vers le **bas** |
| attaque seule | **devant**. Il vise tout seul vers le haut ou le bas si l'adversaire visé est nettement au-dessus ou en dessous (plus de 0,9 m) et proche (moins de 2,8 m à l'horizontale). |

Un bouton maintenu l'emporte toujours sur la visée automatique. Les bots profitent de la visée automatique sans rien changer.

**Effets** :

- **Vers le haut** : le coup est placé au-dessus de la tête, avec les chiffres du premier coup léger. Il soulève l'adversaire (vitesse verticale de 9 m/s, moins pour les lourds).
- **Vers le bas, le « météore »** (option retenue : plaquer au sol) : le coup est placé sous les pieds. Il démarre 0,08 s plus tard, sa récupération dure 0,14 s de plus et il fait 25 % de dégâts en plus. Il plaque l'adversaire au sol (chute à 14 m/s) et le met à terre, même si le coup est faible.
- **Devant** : rien ne change.

## Contre-jeu et indicateurs visuels

| Nouveauté | Contre-jeu | Indicateur visuel |
| --- | --- | --- |
| Coup vers le haut | Il ne couvre que le dessus : on l'évite en restant à hauteur ou en passant dessous. Garde et parade fonctionnent comme d'habitude. | Le corps bascule en arrière, l'arc du coup se dresse au-dessus de la tête, et des traits montent sur la cible touchée. |
| Météore (vers le bas) | Il est lent : un éclat apparaît sous les pieds de l'attaquant pendant la préparation, et on a le temps de s'écarter ou de lever la garde. Raté, il laisse l'attaquant sans défense plus longtemps (punissable à l'atterrissage). | Éclat sous les pieds avant le coup, plongée du corps vers l'avant, arc sous les pieds, puis traits vers le bas et onde au sol quand la cible est plaquée. |
| Visée automatique | Elle ne choisit qu'entre trois directions et ne suit pas pendant le coup : on l'esquive en changeant de hauteur au dernier moment. | Comme ci-dessus, selon la direction choisie. |

## Contrat commun : ce qui change (documenté et testé)

- `Action` « aerial » porte une direction : `aim` (`side`, `up` ou `down`).
- `HitSpec` et l'évènement `hit` portent `aim` quand le coup aérien est dirigé.
- **Réglages** ajoutés à `BrawlConfig` : `aerialUpLift`, `aerialDownStartup`, `aerialDownRecovery`, `aerialDownDamage`, `aerialSpikeSpeed`, `aerialAimHeight`, `aerialAimReach`.
- **Aucun champ de pack ne change** : les packs existants restent valides et le budget de puissance n'est pas touché. Les coups aériens restent dérivés du premier coup léger, comme avant.
- **Déterminisme conservé** : la visée ne dépend que de l'état du monde. C'est compatible avec le plan réseau de la décision 0026.
- **Tests** (`tests/aerial.test.ts`) : coup vers le haut qui touche au-dessus et soulève ; météore plus lent, plus fort, qui plaque et met à terre ; visée automatique (haut, bas, devant, et priorité au bouton) ; météore raté plus long à récupérer.

## Limites

- **Garder le saut enfoncé pendant toute la montée transforme l'attaque en coup vers le haut.** Pour frapper devant, il faut relâcher le saut avant d'attaquer. C'est le prix d'une commande sans joystick ; à revoir en jouant.
- L'animation de chaque coup reste celle du coup aérien actuel. C'est le corps entier qui bascule (en arrière ou en avant), sans gestes propres au haut ou au bas.
- L'équilibrage n'a pas été relancé sur les 16 packs. Le météore peut favoriser les personnages rapides en l'air : à surveiller lors de la prochaine série de matchs de référence.
