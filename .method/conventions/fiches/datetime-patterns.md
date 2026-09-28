# Fiche — datetime-patterns

Texte complet : `.method/conventions/datetime-patterns.md`. La fiche suffit pour écrire ; le texte complet se lit sur un doute, et toujours pour une revue. Chaque règle renvoie à sa section.

- Formater par l'API `Intl` ; `date-fns` seulement pour les calculs (ajout de jours, écarts) ; jamais `moment`. § Principe · § Règles
- Une date se stocke en UTC, `timestamptz`, au format ISO 8601. § Stockage (base de données)
- Une date s'affiche dans la locale de l'utilisateur par les fonctions partagées (`formatDate`, `formatDateTime`, `formatRelativeTime` de `lib/utils/format-date.ts`), jamais par `.toLocaleDateString()` sans options. § Formatage (affichage) · § Règles
- Nombres et pourcentages par `Intl.NumberFormat` (`formatNumber`, `formatPercent`). § Nombres
- Un montant se stocke en centimes entiers, jamais en flottant, et s'affiche par `formatCurrency`. § Devises
- Le schéma d'un montant est `z.number().int().min(0)`, sa devise un `z.enum`. § Schema Zod pour les montants
- Une plage de dates se valide par un `refine` (fin après début), l'erreur posée sur la date de fin. § Validation des dates dans les formulaires
