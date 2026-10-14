# Visuels : modèles, accessoires et code de rendu

Voir les décisions 0008 (rendu, chibis KayKit) et 0009 (avatars anime). Fichiers : `src/client/toon.ts` (cel-shading, textures peintes), `models.ts`, `retarget.ts` (animations reciblées), `weapons.ts` (armes par code), `animator.ts`, `vfx.ts`, `environment.ts`, `scene.ts`.

## Avatars anime (`look.model`)

| Modèle | Avatar VRoid d'origine | Silhouette |
| --- | --- | --- |
| `kaito` | HairSample_Male | garçon aux cheveux noirs, sweat blanc |
| `fumiriya` | Sakurada Fumiriya | garçon aux cheveux clairs, gilet et cravate |
| `shino` | Sendagaya Shino | fille aux longs cheveux noirs, uniforme |
| `akane` | Darkness Shibu | fille aux cheveux rouges, robe sombre |
| `vita` | Vita | fille aux cheveux blancs, tenue futuriste |
| `rubin` | Victoria Rubin | fille blonde, robe rose |

Armes (`look.show`) : `1H_Katana`, `2H_Odachi`, `Kunai`, `Kunai_Offhand`, `2H_Staff`. Teintes facultatives : `hair`, `outfit`.

## Accessoires par modèle (`look.show`)

| Modèle | Corps (toujours visibles) | Accessoires |
| --- | --- | --- |
| `knight` | Knight_Head, Body, Arm*, Leg* | 1H_Sword, 1H_Sword_Offhand, 2H_Sword, Badge_Shield, Rectangle_Shield, Round_Shield, Spike_Shield, Knight_Helmet, Knight_Cape |
| `barbarian` | Barbarian_Head… | 1H_Axe, 1H_Axe_Offhand, 2H_Axe, Barbarian_Round_Shield, Mug, Barbarian_Hat, Barbarian_Cape |
| `mage` | Mage_Head… | 1H_Wand, 2H_Staff, Spellbook, Spellbook_open, Mage_Hat, Mage_Cape |
| `rogue` | Rogue_Head… | Knife, Knife_Offhand, 1H_Crossbow, 2H_Crossbow, Throwable, Rogue_Cape |
| `rogue_hooded` | Rogue_Head_Hooded… | mêmes que `rogue` |

Style d'attaque déduit : une arme `2H_*` → deux mains ; une arme `*_Offhand` → deux armes ; `1H_*` ou `Knife` → une main ; sinon mains nues.

## Reconstruire les modèles

```bash
npm run build:models        # télécharge le pack (cache .cache/kaykit/), écrit public/models/kaykit/
npm run build:anime         # télécharge les avatars VRoid CC0 (cache .cache/vrm/), écrit public/models/anime/
```

## Crédits

- Personnages anime : **avatars d'exemple de VRoid Studio** (version bêta) par pixiv Inc., CC0 1.0. Liste dans `public/models/anime/CREDITS.txt`.
- Personnages chibis et animations : **KayKit — Adventurers Character Pack** par Kay Lousberg (kaylousberg.com), CC0 1.0.
- Polices : Bangers (Vernon Adams) et Rajdhani (Indian Type Foundry), SIL Open Font License.
