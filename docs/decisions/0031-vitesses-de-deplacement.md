# 0031 — Des vitesses de déplacement plus écartées

Date : 2026-10-20. Statut : **acceptée** (« enchaîne oui » du porteur de projet).

> « Il faudra qu'on fasse varier les vitesses de déplacement entre persos aussi. »

## Ce qui a été décidé

Les vitesses existaient déjà dans les kits, de 4,6 à 8 m/s, mais l'écart se sentait peu en jeu. Elles vont désormais de 4 à 10 m/s.

- **Borne du validateur** : `moveSpeed` passe de 3,5–8 à 3,5–10 m/s.
- **Panel de référence de l'épreuve** (`generate.ts`) : ses personnages tirent maintenant leur vitesse entre 4 et 9 m/s, au lieu de 4 à 6,5 m/s. Les personnages rapides sont ainsi mesurés face à des adversaires rapides.
- **Une course qui accélère** (vitesse de pointe atteinte en maintenant la direction) a été **écartée** par le porteur de projet : trop de complications.

Vitesses retenues pour les packs locaux, en m/s :

| Profil | Personnages | Vitesse |
| --- | --- | --- |
| Lourds | Eggman | 4 |
| | Knuckles, Shredder | 5 |
| | Tediz | 5,2 |
| | Sanosuke | 5,4 |
| | Donatello | 5,6 |
| | Shishio | 5,8 |
| Moyens | Raphaël | 6 |
| | Splinter, Leonardo | 6,2 |
| | Saitō | 6,6 |
| | Vegeta, Conker | 6,8 |
| | Michelangelo, Kenshin, Goku, Naruto | 7 |
| | Sasuke | 7,2 |
| Rapides | Tails | 7,8 |
| | Metal Sonic | 8,8 |
| | Shadow | 9 |
| Très rapides | Sonic, Super Sonic | 10 |

La vitesse est payée dans le budget (ligne « mobilité »). Tous les packs sont ensuite rééquilibrés par l'épreuve, en ajustant leurs dégâts.

## Contre-jeu et indicateur visuel

Rien de neuf : un personnage rapide reste lisible, on le voit courir. Contre un personnage rapide, on garde ses distances avec les projectiles et les pièges, et on punit ses ruées et ses plongées ratées.
