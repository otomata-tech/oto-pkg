# Fiche — state-management

Texte complet : `.method/conventions/state-management.md`. La fiche suffit pour écrire ; le texte complet se lit sur un doute, et toujours pour une revue. Chaque règle renvoie à sa section.

- Une donnée serveur se lit dans un Server Component, jamais par `useEffect`, `fetch` et `useState` ; seule exception écrite : la carte d'un fichier joint demande une fois montée si le stockage sert encore son objet (`GET files/<id>?check`). § Règle d'or
- Un état partageable (filtres, tri, page, recherche) vit dans l'URL. § Hiérarchie des sources de state · § URL State (recommandé pour les filtres)
- Une écriture d'URL déclenchée par une frappe passe par `router.replace` dans `startTransition`, jamais `push`. § URL State (recommandé pour les filtres)
- Tout composant qui appelle `useSearchParams()` est rendu sous un `<Suspense>`. § URL State (recommandé pour les filtres)
- `useState` sert l'interface locale et temporaire : ouverture, saisie en cours, animation. § React State (local)
- Un fournisseur de contexte par préoccupation, placé au plus bas, sans lecture de données. § Context (état global léger)
- Une valeur dérivée se calcule au rendu, jamais stockée ; deux niveaux de props ne justifient pas un contexte. § Quand NE PAS utiliser de state
- `useMemo` seulement pour un calcul coûteux aux dépendances stables ; `useCallback` seulement pour un composant mémoïsé ou une dépendance d'effet. § Memo / useCallback / useMemo
