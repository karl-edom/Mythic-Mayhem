# 0013 — Paysage généré par code autour des arènes

Date : 2026-10-16. Statut : **acceptée**. Le porteur de projet a montré une scène de trébuchet construite entièrement en code avec Claude, sans aucun modèle 3D ni texture téléchargés, et a jugé nos décors bien en dessous.

## Constat

Le décor autour des arènes était fait de primitives grossières : cônes en guise de sapins et de montagnes, sol plat uniforme, boules vertes à facettes. Les objets rigides et les paysages se construisent très bien par code ; la limite des personnages (organiques, animés, vus de près) ne s'appliquait pas au décor.

## Ce qui est fait (`src/client/landscape.ts`)

- **Relief** : un fond de vallée plat autour de l'arène, des pentes douces, puis de vraies collines au loin (bruit fractal déterministe, la même carte à chaque partie).
- **Campagne en parcelles** : une grille de champs légèrement tournée, chaque champ avec sa culture (prés, blé, chaume, labours). Des **haies** de buissons courent sur une partie des bordures. Une texture de détail donne du grain au sol de près.
- **Rivière** sinueuse, creusée dans le relief, berges plus sombres.
- **Végétation instanciée** (des centaines d'arbres pour quelques appels de rendu) :
  - feuillus en grappes bosselées, éclairés par le dessus ;
  - pins sur les hauteurs ;
  - alignements de peupliers ;
  - teinte légèrement différente pour chaque arbre.
- **Ville fortifiée** sur une colline au-delà de la rivière : courtine crénelée, tours rondes avec hourds et toits d'ardoise, maisons blanchies aux toits de tuiles, église et sa flèche.
- **Ciel et lumière** :
  - dégradé avec halo chaud vers le soleil ;
  - nuages doux en couches, ombrés par-dessous ;
  - brume de distance (perspective aérienne) ;
  - soleil d'après-midi chaud, lumière de ciel froide.
- Matériaux **physiques** (`MeshStandardMaterial`) au rendu adouci pour le décor ; les combattants restent cel-shadés au premier plan, comme un personnage anime devant un fond peint. Les arbres de jeu (dans l'arène) utilisent le même feuillu que les bois.

Aucun fichier ajouté : tout est généré au chargement, en environ 600 lignes.

## Limites

- Les personnages restent les avatars VRoid (décision 0009) : un humain animé et crédible de près ne se construit pas en primitives. Dans la scène de référence, les servants sont de petites silhouettes vues de loin.
- Pas encore d'oiseaux, de fumées de cheminée, de reflets dans l'eau ni de vent dans les arbres.
- L'intérieur des arènes (caisses, murets, sol) n'a pas encore reçu le même soin.
