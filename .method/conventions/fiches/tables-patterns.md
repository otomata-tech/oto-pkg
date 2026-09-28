# Fiche — tables-patterns

Texte complet : `.method/conventions/tables-patterns.md`. La fiche suffit pour écrire ; le texte complet se lit sur un doute, et toujours pour une revue. Chaque règle renvoie à sa section.

- `DataTable` existe (`src/components/data-table.tsx`) : en réécrire une est un défaut HAUTE. § Le composant existe
- Tri, filtres, page et recherche vivent dans l'URL (`useQueryParams`), jamais dans un `useState` ; la table est un Server Component, seuls ses contrôles sont clients. § L'état de la table vit dans l'URL
- Une valeur de tri est un `z.enum` ; l'en-tête trié porte `aria-sort`. § Tri
- La sélection est un state local ; « tout sélectionner » ne coche que la page ; une action groupée destructive se confirme en annonçant le nombre d'éléments, rend « X faits, Y refusés », puis vide la sélection. § Sélection multiple et actions groupées
- Chargement en `<Skeleton>` aux dimensions des lignes ; vide par `<EmptyState>`, qui distingue « aucune donnée » de « aucun résultat pour ce filtre » ; erreur avec un réessai. § Les 3 états, toujours
- `<table>`, `<thead>`, `<th scope="col">`, cases de sélection nommées. § Accessibilité
- Le défilement horizontal vit dans un conteneur `overflow-x-auto` positionné (`.oto-table-wrap` par `TableServeur`), sous des ancêtres flex en `min-w-0` : à 1 280 px, la page ne défile jamais latéralement. § Accessibilité
- Une table posée dans une colonne de largeur fixe n'a pas de largeur minimale (`min-w-max`) : ses cellules vont à la ligne. § Accessibilité
- Aucune pagination côté client sur un jeu non borné (`.slice()` d'une lecture complète) ; au-delà de ~50 lignes visibles, virtualiser. § Règles
