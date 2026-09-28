# Tables Patterns — listes, tri, filtres, sélection

> Requêtes serveur (pagination, `.order()`, `.eq()`) : `api-patterns.md § Pagination` et
> `§ Search & Filter`. Ce fichier couvre le composant.

## Le composant existe

`DataTable` est au registry (`src/components/data-table.tsx`). Vérifier ses props avant d'en
écrire un autre — réimplémenter une table est un défaut HAUTE.

## L'état de la table vit dans l'URL

Tri, filtres, page, recherche : tous en query params, jamais en `useState`. Le lien devient
partageable et le bouton retour du navigateur fonctionne.

```tsx
// Hook défini dans state-management.md, section « URL State »
const { searchParams, setParam, isPending } = useQueryParams()
setParam("sort", "name:asc")
```

Corollaire : la table est un **Server Component** qui lit `searchParams` et fetch les données.
Seuls les contrôles (inputs de filtre, en-têtes cliquables) sont des Client Components.

## Tri

Les valeurs de tri sont une **énumération** validée par Zod, jamais une chaîne libre : un nom
de colonne venu de l'URL et passé à `.order()` laisse énumérer le schéma
(`api-patterns.md § Search & Filter`).

```tsx
// L'en-tête porte l'état de tri pour les lecteurs d'écran
<th aria-sort={sort === "name:asc" ? "ascending" : sort === "name:desc" ? "descending" : "none"}>
  <button onClick={() => setParam("sort", nextSort)}>Nom</button>
</th>
```

## Sélection multiple et actions groupées

```tsx
// La sélection est un state LOCAL (elle ne survit pas à un refresh, c'est voulu)
const [selected, setSelected] = useState<Set<string>>(new Set())
```

Règles :
- La case « tout sélectionner » ne coche que **la page courante**. Si une action peut porter
  sur l'ensemble du jeu filtré, le dire explicitement à l'utilisateur.
- Toute action groupée destructive passe par une confirmation (`feedback-patterns.md § Dialogs`)
  qui **annonce le nombre d'éléments** concernés.
- Le résultat d'une action groupée est **partiel par nature** : RLS peut refuser certaines
  lignes sans lever d'erreur. Afficher « X supprimés, Y refusés », jamais « supprimé » seul
  (`api-patterns.md § Bulk Operations`).
- Vider la sélection après l'action réussie.

## Les 3 états, toujours

- **loading** — `<Skeleton>` aux dimensions des lignes, pas un spinner centré (évite le CLS)
- **empty** — `<EmptyState>`, en distinguant « aucune donnée » de « aucun résultat pour ce filtre » (dans ce cas, proposer de réinitialiser les filtres)
- **error** — message + action de réessai, jamais un tableau vide silencieux

## Accessibilité

- `<table>` sémantique avec `<thead>`, `<th scope="col">` — pas une grille de `<div>`
- `aria-sort` sur l'en-tête trié
- Les cases de sélection ont un label accessible (`aria-label="Sélectionner la ligne X"`)
- Le tableau scrolle horizontalement dans un conteneur `overflow-x-auto` : le corps de page ne doit jamais scroller latéralement. Deux conditions, sans lesquelles la page défile quand même : chaque ancêtre qui est un élément flex peut rétrécir (`min-w-0`, sinon il s'élargit à la table), et le conteneur est positionné (`.oto-table-wrap` du design system : une table d'écran serveur passe par `TableServeur`, `packages/plateforme/ui/components/table-serveur.tsx`, aucune classe de table écrite en utilitaires), sinon un texte `sr-only` d'une cellule (position absolue) échappe à son découpage. **Vérifiable :** à 1 280 px, `document.documentElement.scrollWidth` égale la largeur de la fenêtre sur la page de la table.
- Une table posée dans une colonne de largeur fixe (les annexes d'un Contexte, `20rem`) ne prend pas de largeur minimale (`min-w-max`) : ses cellules vont à la ligne, sinon ses dernières colonnes passent derrière un défilement. **Vérifiable :** aucune table rendue dans une colonne de largeur fixe n'a de largeur minimale ; à 1 280 px, toutes les colonnes de la table y sont visibles sans défiler.

## Règles

- **Vérifiable :** aucun `useState` pour le tri, les filtres ou la page — ils sont dans l'URL.
- **Vérifiable :** aucune pagination côté client sur un jeu de données non borné (pas de `.slice()` sur un fetch complet).
- Au-delà de ~50 colonnes-lignes visibles simultanément, virtualiser plutôt que paginer plus fin.
