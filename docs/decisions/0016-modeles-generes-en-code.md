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

## Coups propres au personnage (2026-10-16)

> « Fais la course en fente et les coups au saï (avoir des coups spécifiques pour ces personnages est une bonne chose). Et ajuste son bandeau. »

- **Clips à images-clés** (`keyClip` dans `src/client/poses.ts`) : des poses clés, avec une transition douce entre elles, ou à vitesse constante pour les rotations. On peut y indiquer l'instant de l'impact (`impact`), que l'animateur fait tomber pile quand la zone de coup devient active.
- **Emplacements de coups par modèle** : un modèle qui fournit `@light0`, `@light1`, `@light2`, `@heavy`, `@aerial`, `@special:projectile`, `@special:rush`, `@special:area` ou `@rush` joue ses propres coups. Les autres gardent les animations communes. Le combat ne change pas : seul l'affichage change.
- **La tortue** :
  - **course en fente** : penchée en avant, saïs traînant derrière, grandes foulées basses ;
  - **combo** : estoc du saï droit, crochet du gauche, double estoc en fente profonde ;
  - **lourde** : les deux saïs levés au-dessus de la tête, puis abattus ;
  - **aérien** : genou volant, saïs écartés en ciseaux ;
  - **spéciales** : lancer de saï ; **roulade dans la carapace** (elle se roule en boule et fonce) ; **furie**, un tourbillon sur place.
- **Bandeau** : la bande est posée sur la surface du crâne (chaque sommet suit la tête), plus basse sur les yeux. Les pans sont du tissu recalculé à chaque image : ils quittent le nœud vers l'arrière, pendent, traînent derrière la tête quand elle bouge et ondulent.

## Licence

La tortue est une création du porteur de projet, pour un usage personnel. Le dépôt contient le modèle générique ; le pack du personnage « Raphaël » (nom, couleurs, kit) reste dans `packs/local/raphael/`, le dossier prévu pour les personnages d'usage perso.

## Limites et suite

- Les pièces sont rigides, sans peau déformable : les jointures sont couvertes par des boules (épaules, coudes). De près, on voit encore des raccords.
- Le rendu est physique (laque, acier, peau), pas cel-shadé comme les avatars anime, avec un trait d'encre fin pour rester lisible en combat.
- Prochain modèle : le **samouraï en armure**, sur le même principe : kabuto à cimier, menpō, dō laqué et lacé, sode, kusazuri, hakama.

## Finesse des coups et réactions propres (2026-10-17)

> « Il faut encore un peu plus de finesse dans les mouvements (un peu comme pour les jambes mais sur les bras et le reste lors des attaques). »

Rendu seulement : la simulation, les durées des coups et le moment de l'impact ne changent pas.

- **Les articulations partent l'une après l'autre** (`CHAIN` dans `poses.ts`) : les hanches et les jambes ouvrent le mouvement environ 45 ms avant, puis viennent le buste, l'épaule et l'avant-bras ; la main et son saï arrivent en dernier, comme un fouet. La tête suit avec un léger retard et reste tournée vers la cible. L'avant-bras garde le moment exact de l'impact.
- **Chaque coup a la même forme** : mise en tension, départ explosif qui arrive **à pleine vitesse** sur l'impact (au lieu de freiner dessus), poursuite au-delà de la cible, retour souple en garde. Les anciennes poses figées entre l'impact et le retour disparaissent.
- **La main libre se retire à la hanche** pendant qu'un saï frappe (*hikite* du karaté) ; dans la mise en tension, elle mesure la distance.
- Coup lourd : la tortue se cambre, saïs au-dessus de la tête, pendant la charge.
- Échantillonnage à 60 images/s au lieu de 30, pour des départs nets.
- **Réactions propres à la tortue**, à la place de celles de KayKit reciblées : recul sous un coup (la tête part d'abord, les bras s'ouvrent), garde repoussée, appel du saut et réception amortie, **roulades dans la carapace** pour les esquives avant et arrière, pas de côté penchés.
- Le menu met en tête les personnages des packs locaux : J1 commence sur la tortue.
