# Visuels : modèles, accessoires et code de rendu

Voir la décision 0008 pour les choix. Fichiers : `src/client/toon.ts` (cel-shading, textures peintes), `models.ts`, `animator.ts`, `vfx.ts`, `environment.ts`, `scene.ts`.

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
```

## Crédits

- Personnages et animations : **KayKit — Adventurers Character Pack** par Kay Lousberg (kaylousberg.com), CC0 1.0.
- Polices : Bangers (Vernon Adams) et Rajdhani (Indian Type Foundry), SIL Open Font License.
