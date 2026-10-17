# 0021 — Styles d'animation par arme, expressions, bō et nunchakus

Date : 2026-10-17. Statut : **acceptée**.

> « Crée une tortue avec un bandeau bleu, qui a un sabre à la place des saïs et un regard plus doux, puis une avec un bandeau violet et un bâton, et une avec un regard un peu plus fou, un bandeau orange et des nunchakus. »

> Sur un atelier de personnages intégré au jeu : « On laisse tomber. Il n'y aura pas de création de personnage intégrée dans le jeu. »

## Décisions

- **La façon de bouger dépend de l'arme tenue, plus du modèle.** Le jeu choisit le style d'après la liste `show` du personnage :

  | Style | Armes |
  | --- | --- |
  | sabre | `1H_Katana`, `2H_Odachi`, `Sakabato` |
  | bâton | `Bo`, `2H_Staff` |
  | deux armes | tout le reste |

  Un même modèle peut donc avoir plusieurs jeux de mouvements. Les clips sont calculés une fois par modèle et par style.
  - Le **sabre** reprend les poses de l'épéiste, appliquées au squelette de la tortue (le solveur de bras travaille sur les proportions de chaque modèle).
  - Le **bâton** est un nouveau jeu : les deux mains écartées de 45 cm, la longue extrémité vers l'adversaire. Il comprend :
    - une garde, des coups (estoc, balayage, coup de haut en bas, frappe lourde en diagonale, balayage aérien) ;
    - pour les spéciales : un **saut à la perche** (le bâton planté devant, le corps passe par-dessus, puis la frappe au sol), un **moulinet** (deux tours complets) et une **charge** le bâton pointé comme une lance.
  - Les **deux armes** gardent les mouvements de Raphaël.
- **Expressions** : `look.expression` peut valoir `fierce` (par défaut), `calm` ou `wild`. C'est de l'affichage seul. Sur la tortue, chaque expression a ses sourcils, ses yeux et sa bouche :

  | Expression | Sourcils | Yeux | Bouche |
  | --- | --- | --- | --- |
  | `fierce` | froncés | normaux | sourire en coin |
  | `calm` | droits | plus ronds | petit sourire doux |
  | `wild` | relevés | grands ouverts, petites pupilles qui divergent | grand sourire ouvert sur les dents |

  Les bouches sont maintenant posées sur la surface du museau ; avant, elles s'y enfonçaient à moitié.
- **Nouvelles armes** (`weapons.ts`) :
  - le **bō** : bois dur légèrement renflé au milieu, bandes de tissu aux prises et aux bouts ;
  - les **nunchakus** : le second bâton pend au bout de la chaîne comme un pendule simulé à chaque image. Il traîne derrière la main et fouette en fin de coup. C'est de l'affichage seul.

## Les trois packs (locaux, non commités)

L'épreuve (`--tune`) règle les dégâts de chacun.

| Pack | Bandeau, regard, arme | Spéciales |
| --- | --- | --- |
| Leonardo | bleu, `calm`, sabre | lame du dragon (ruée), garde du chef (contre), bond du ninja (saut plongeant) |
| Donatello | violet, `fierce`, bō | saut à la perche (saut plongeant), moulinet (zone), charge du bō (ruée) |
| Michelangelo | orange, `wild`, deux nunchakus | pizza volante (projectile), roulade (ruée), tornade (zone, avec le cri « カワバンガ » à l'écran) |

## Limites

- Leonardo n'a qu'un sabre, comme demandé, et pas de second sabre dans le dos.
- La pizza volante utilise le projectile générique (une sphère) : il n'y a pas encore de modèle de pizza.
