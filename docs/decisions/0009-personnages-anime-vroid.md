# 0009 — Personnages anime : avatars VRoid CC0 et animations reciblées

Date : 2026-10-14. Statut : **acceptée** (« prends des assets gratuits trouvés sur le web pour faire des personnages stylés, intègre au jeu direct »).

## Contexte

Les chibis KayKit (décision 0008) ont été jugés trop éloignés du rendu J-Stars (« un samouraï de Minecraft »). Les générateurs 3D par IA sont payants ou inutilisables ici : Hunyuan3D exclut l'Union européenne dans sa licence, et TRELLIS demande 16 Go de mémoire vidéo. Le porteur de projet décidera plus tard s'il paie un générateur.

## Ce qui a été fait

| Domaine | Avant | Après |
| --- | --- | --- |
| Modèles | 5 chibis KayKit | **6 avatars anime** aux proportions réalistes : les modèles d'exemple de VRoid Studio (pixiv), publiés en **CC0**. Ils ont des visages dessinés et des cheveux en mèches, et sont cel-shadés comme dans un jeu anime. |
| Animations | 44 clips KayKit, uniquement sur les chibis | Les **mêmes 44 clips sont reciblés** sur le squelette humanoïde des avatars, au chargement, sans fichier d'animation supplémentaire. Le calage sur la simulation (impact = zone de frappe active) est conservé. |
| Mains | — | Les avatars ferment le poing par code, car les clips KayKit ne bougent pas les doigts. |
| Armes | maillages KayKit, trop massifs | **Armes construites par code** : katana courbe à tsuba, ōdachi, kunai à anneau, bâton à cristal. Elles sont tenues comme les armes KayKit, pour que les animations de coup restent justes. |
| Ombrage | rampe toon grise commune | **Rampe par matériau reprise de l'avatar** (couleur d'ombre MToon) : ombres rosées sur la peau, bleutées sur les vêtements. Contours sur peau, vêtements et cheveux, pas sur les yeux. |
| Roster | 2 combattants | **6 combattants originaux**. Chacun est réglé par l'épreuve (décision 0007), avec 50 % de victoires ±1 point. |
| Menu | caméra parfois dans un élément du décor | Les éléments entre la caméra et les combattants sont masqués, et la caméra est plus proche. |

## Les combattants

| Nom | Modèle | Archétype | Arme | Spéciales |
| --- | --- | --- | --- | --- |
| Rōnin | `kaito` | rushdown | katana | iai (ruée), croissant (projectile), tourbillon (zone, brise-garde) |
| Kaminari | `vita` | zoner | bâton | éclair, orage (brise-garde), décharge |
| Akane | `akane` | heavy | ōdachi | fente (ruée brise-garde), croc, cercle pourpre (brise-garde) |
| Shino | `shino` | rushdown | deux kunai | kunai (projectile rapide), shunpo (longue ruée), fumée (zone) |
| Hikaru | `fumiriya` | balanced | poings | boule de feu, météore (ruée), éruption (zone à distance, brise-garde) |
| Rubis | `rubin` | zoner | bâton | éclat, piège-cristal (zone lointaine brise-garde), repousse |

Aucune nouvelle capacité : ces kits n'utilisent que les livraisons existantes du contrat v2 (projectile, ruée, zone), avec leur contre-jeu et leur indicateur visuel déjà documentés. Le contrat de combat commun n'est pas modifié.

## Comment marche le reciblage (`src/client/retarget.ts`)

Les deux squelettes sont au repos en pose en T, tournés vers +Z (les avatars VRM 0.x regardent vers −Z et sont donc retournés). Le transfert se fait os par os :

- on mesure de combien l'os source a tourné par rapport à son repos, dans l'espace du modèle (Δ) ;
- on applique cette même rotation à l'os cible, depuis son propre repos ;
- les os absents de la source (cou, épaules, haut du torse, doigts) gardent leur repos par rapport à leur parent ;
- les hanches reprennent le déplacement de la source, mis à l'échelle de la longueur des jambes ;
- les bras sont abaissés de 0,5 rad, parce que les chibis écartent les bras de leur gros corps.

Tests (`tests/retarget.test.ts`) : rotation transmise exacte quel que soit le repos des os, hanches à l'échelle, source intacte, poings fermés vers la paume.

## Apparence d'un personnage (`character.json`)

```json
"look": { "model": "shino", "show": ["Kunai", "Kunai_Offhand"], "tint": "#ffffff", "hair": "#ff8080", "outfit": "#6b78c8" }
```

- `model` : `kaito`, `fumiriya`, `shino`, `akane`, `vita`, `rubin` (anime) ou un modèle KayKit ;
- `show` : pour les avatars anime, les armes `1H_Katana`, `2H_Odachi`, `Kunai`, `Kunai_Offhand`, `2H_Staff` ;
- `hair` et `outfit` (facultatifs) : teinte multipliée sur les cheveux et sur les vêtements. Elle est visible sur les couleurs claires (cheveux blancs ou blonds, chemise blanche).

Sans `look`, le client choisit un avatar anime d'après l'archétype.

**Ajout du 2026-10-20** : `look.height` (mètres, de 0,8 à 2,4 ; 1,8 par défaut) fixe la taille du personnage à l'écran, par exemple un petit Sonic (1,25) à côté d'un grand Eggman (2,0). Le changement est **purement visuel** : le corps que la simulation frappe reste le même pour tous, et l'équilibrage n'en dépend pas. La foulée des animations suit la taille, pour que les pieds ne glissent pas.

## Licences et coûts

- **Avatars** : VRoid Studio, préréglages de la version bêta, par pixiv Inc., **CC0 1.0**. L'outil de construction vérifie la mention `CC0` dans les métadonnées VRM de chaque fichier avant d'écrire quoi que ce soit. Source : copie GitHub `madjin/vrm-samples`. Crédits dans `public/models/anime/CREDITS.txt`. Ce ne sont pas des personnages sous licence : ils sont commitables.
- **Poids** : 9 Mo pour les 6 avatars (15 à 20 Mo chacun à l'origine). Textures en WebP 1024 px, géométrie quantifiée, expressions faciales retirées. Les ~100 morceaux de cheveux sont fusionnés par matériau, donc un seul appel de rendu.
- **Nouvelle dépendance de développement** : `sharp` 0.34.4 (Apache-2.0). Elle sert à réduire et convertir les textures dans `tools/build-anime.ts`. Elle n'est utilisée qu'à la construction et n'est jamais chargée par le jeu. Coût : ~10 Mo dans `node_modules`, binaires précompilés.
- **Pas de nouvelle dépendance d'exécution** : on n'utilise pas `@pixiv/three-vrm`. Les avatars sont lus comme de simples glTF par le chargeur déjà présent.

## Limites

- **Visages figés** : pas d'expressions (cris, grimaces) pour l'instant, elles ont été retirées pour le poids.
- **Cheveux et jupes rigides** : la physique de mèches (« spring bones ») de VRM n'est pas simulée.
- **Animations chibi** : les clips KayKit restent pensés pour des chibis. Les gestes sont corrects, mais moins amples et moins stylés que les animations d'un vrai jeu de combat anime. C'est désormais le premier écart visible avec J-Stars.
- **Tenues** : ce sont des tenues de tous les jours (sweat, uniforme, robe). Elles ne disent pas « samouraï » ou « ninja » au premier coup d'œil. Des tenues dédiées demandent VRoid Studio (gratuit), un générateur, ou un artiste.
- **Personnages fan** (Kenshin, Naruto…) : la même chaîne les accepte. Un avatar VRoid fait par le porteur de projet dans VRoid Studio, déposé dans `packs/local/`, passerait par le même reciblage.

## Prochaines décisions

1. Des animations de combat plus amples : Mixamo (gratuit, à garder en local) ou des packs CC0 d'animations humanoïdes. Le reciblage sait déjà les accueillir.
2. La physique des cheveux et les expressions faciales (`@pixiv/three-vrm`, MIT) : à décider selon le coût en performances.
3. Créer ses propres personnages dans VRoid Studio, gratuit et sans IA, avec des tenues de samouraï ou de ninja et des coiffures fidèles.
