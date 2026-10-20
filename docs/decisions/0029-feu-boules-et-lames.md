# 0029 — Feu : boules de feu et lames ardentes

Date : 2026-10-20. Statut : **acceptée**.

> « Les flammes de Sasuke pourraient être plus belles, et Shishio, on ne voit pas le feu autour de lui ou dans ses attaques. »

## Ce qui n'allait pas

Le feu était fait de lumière **ajoutée** à l'image (mélange additif). Sur les murs crépis et les pavés clairs du village, il saturait jusqu'au blanc : la boule de feu de Sasuke et l'orbe de Shishio n'étaient que des taches blanches éblouissantes. Les flammes de la lame de Shishio étaient trop petites pour se voir, et elles n'apparaissaient que pendant ses techniques.

## Ce qui change (affichage seul)

- **Boule de feu** (`projectile: "fire"`, Sasuke et Shishio) : un corps de flammes orange qui roulent sur elles-mêmes, **peintes par-dessus** l'image plutôt qu'ajoutées, donc elles gardent leur couleur devant un mur clair. Un cœur jaune lumineux, des langues de flamme, et une traînée : des flammes qui rougissent en s'éteignant, de la fumée qui monte et des braises qui retombent.
- **Feu sur la lame ou dans la main** (`hand: "fire"`) : flammes plus grandes, doublées d'une couche orange peinte. La lame lâche des langues de feu et des braises dans le monde, si bien qu'un coup laisse un sillage brûlant.
- **Nouveau champ de pack `look.burning`** (booléen, affichage seul) : la lame principale **couve en permanence** et **s'embrase à chaque coup** (léger, aérien, lourd, technique). Des braises montent autour du corps et une lueur orange reste au sol. Activé pour Shishio (pack local) : le Mugenjin s'enflamme à chaque coup, comme dans l'œuvre.

## Contre-jeu et indicateur visuel

Aucune capacité nouvelle : la simulation ignore tout cela, le budget de puissance n'est pas touché. Pour `look.burning`, le feu plus vif pendant les coups sert justement d'indicateur : on voit la lame s'embraser au début de chaque attaque.

## Sécurité des packs

`look.burning` n'accepte que `true` ; toute autre valeur est ignorée (test dans `tests/brawl.test.ts`). Le pack reste une donnée et n'exécute aucun code.

## Coût

Une boule de feu émet environ 150 sprites par seconde, qui vivent 0,3 à 0,75 s : une centaine visibles à la fois. Une lame ardente en émet environ 70 par seconde au plus fort, 20 au repos. Seule la vérification sous rendu logiciel (SwiftShader) a été faite. Sur une machine modeste, il faudra regarder la fluidité quand plusieurs boules de feu sont à l'écran.
