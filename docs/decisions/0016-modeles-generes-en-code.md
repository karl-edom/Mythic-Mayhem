# 0016 — Personnages modélisés en code

Date : 2026-10-16. Statut : **acceptée**.

> « Et tu veux me faire croire que t'es pas capable de faire un samouraï en 3D ? » puis : « Fais une tortue d'abord » (avec une planche de référence de tortue ninja).

## Décision

Un personnage peut être **modélisé entièrement en code**, sans fichier 3D. Premier modèle : la **tortue guerrière** (`src/client/turtle.ts`, modèle `"turtle"`).

- **Squelette** : il porte les noms d'os humanoïdes VRM (`hips`, `spine`, `chest`, `head`, `leftUpperArm`…), en pose en T face à +Z. Toutes les animations partagées sont reciblées dessus comme sur les avatars anime : course, coups, saut, chute, etc.
- **Corps** : des pièces rigides portées par les os. C'est juste pour une tortue : la carapace et le plastron sont rigides comme sur l'animal.
  - Membres musclés : deltoïdes, biceps, triceps, avant-bras, quadriceps, mollets.
  - Tête au museau large, yeux expressifs, sourcils froncés.
- **Matériaux physiques**, avec textures peintes en code (canvas) et cartes de relief (*bump*) :
  - peau à petites écailles ;
  - carapace à écailles hexagonales en relief : la géométrie elle-même est bombée par plaque, avec des sillons entre elles ;
  - plastron à plaques ;
  - bandes de cuir ;
  - bandeau en tissu dont les pans flottent.
  - Les reflets viennent d'un environnement de studio calculé par three.js (`RoomEnvironment`), sans fichier.
- **Générique** : la couleur du bandeau vient de la couleur `outfit` du personnage, les armes de sa liste `show`. Un pack de personnage reste de la donnée.
- **Nouvelle arme** : le **saï** (`Sai`, `Sai_Offhand`), en acier poli.
- **Vitrine** (`vitrine.html`), outil de développement : un modèle sur fond de studio, qui tourne et joue une animation. Exemple : `vitrine.html?model=turtle&outfit=%23b8121a&clip=Running_A`.

## Fidélité à la planche de référence (2026-10-16)

> « Pourquoi tu n'as pas pris mes photos avec les poses ? Il s'agissait d'une tortue que j'ai faite moi. »

- Le look suit la planche du porteur de projet :
  - ceinture de tissu enroulée deux fois, nouée devant, avec un long pan entre les cuisses ;
  - bandes larges aux poignets, tibias entièrement bandés, genouillères ;
  - peau olive marbrée, plastron ocre, carapace brun-olive.
- **Poses de la planche** (`src/client/poses.ts`) : des clips faits à la main remplacent, pour ce modèle seulement, les animations reciblées du même nom :
  - **repos** = garde basse, jambes écartées, saïs croisés ;
  - **bouclier** = garde haute, saï levé devant le visage ;
  - **en l'air** = bond, genou ramené haut.
  - Chaque pose respire en boucle (léger va-et-vient entre deux variantes).
- Le principe vaut pour tout modèle généré : une planche de poses peut devenir des clips propres au personnage.

## Licence

La tortue est une création du porteur de projet, pour un usage personnel. Le dépôt contient le modèle générique ; le pack du personnage « Raphaël » (nom, couleurs, kit) reste dans `packs/local/raphael/`, le dossier prévu pour les personnages d'usage perso.

## Limites et suite

- Les pièces sont rigides, sans peau déformable : les jointures sont couvertes par des boules (épaules, coudes). De près, on voit encore des raccords.
- Le rendu est physique (laque, acier, peau), pas cel-shadé comme les avatars anime, avec un trait d'encre fin pour rester lisible en combat.
- Prochain modèle : le **samouraï en armure**, sur le même principe : kabuto à cimier, menpō, dō laqué et lacé, sode, kusazuri, hakama.
