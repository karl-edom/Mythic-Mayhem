# Vision du porteur de projet

Complète `product-brief.md` et prime sur lui en cas de divergence.

> « Pouvoir importer des personnages de n'importe quel univers, et à terme permettre au joueur d'en créer lui-même, contraint en force et en faiblesse pour rester dans le scope moyen. L'objectif : jouer à un jeu qui me plaît, avec mes amis, dans l'univers qui me plaît. »

## Conséquences pour la conception

1. **Le budget de puissance devient le cœur du produit, pas un simple outil interne.** Si les joueurs construisent leurs personnages, l'équilibre ne peut pas venir d'un réglage manuel au cas par cas. Il faut un système de coûts : chaque statistique et chaque primitive de capacité (dégâts, portée, contrôle, mobilité…) consomme des points d'un budget fixe. Les faiblesses (vie basse, temps de recharge long, télégraphe long) rendent des points. Le validateur refuse tout personnage hors budget.
2. **Un personnage = un pack de données.** Un fichier de données décrit le kit (couches B à D du brief), à côté de l'identité (couche A : nom, visuel, sons). Importer Goku, Geralt ou un personnage maison revient à associer une identité à un kit qui respecte le budget. Le moteur n'exécute jamais de code fourni par un pack.
3. **Le multijoueur entre amis est un besoin central**, pas une option tardive. Un prototype contre des bots reste utile pour valider les sensations, mais l'architecture doit être pensée pour le réseau dès le départ : simulation séparée du rendu et pilotée par des commandes.
4. **Usage privé.** Des personnages de licences existantes sont acceptables pour jouer entre amis, sans distribution. Pour rester propre :
   - le dépôt ne contient que des personnages originaux et des exemples ;
   - les packs « fan » (images, noms de licences) vivent dans un dossier local ignoré par git (`packs/local/`) ou sont partagés directement entre amis ;
   - rien n'est publié ni vendu avec ces contenus.
