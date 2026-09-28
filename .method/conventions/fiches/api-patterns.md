# Fiche — api-patterns

Texte complet : `.method/conventions/api-patterns.md`. La fiche suffit pour écrire ; le texte complet se lit sur un doute, et toujours pour une revue. Chaque règle renvoie à sa section.

- Toute mutation passe par une Server Action ; un Route Handler est réservé aux webhooks, aux crons et aux intégrations qui appellent une URL. § Principe : Server Actions > Route Handlers
- Une action appelée par un formulaire rend `ActionResult<T>` : une erreur attendue se retourne (`{ error }`), elle ne se lance pas ; une auth manquante fait `redirect`. § Type de retour standard
- Aucun `redirect()` ni `notFound()` dans un `try` dont le `catch` ne commence pas par `unstable_rethrow(error)` ; le plus simple est de les appeler après le `try/catch`. § Type de retour standard
- Dans un Server Component, `headers()` et `cookies()` se lisent avant le `try`, ou le `catch` commence par `unstable_rethrow(error)`. § Type de retour standard
- Un handler client qui tient son état d'envoi dans un `useState` met `await <nom>Action(…)` sous `try … catch … finally` : le `catch` relance d'abord la redirection (`unstable_rethrow`) puis dit l'échec en `role="alert"`, le `finally` remet l'état d'envoi. § Type de retour standard
- Chaque action suit l'ordre auth, validation Zod, mutation, `revalidatePath`/`revalidateTag`, retour ; un fichier de `lib/actions/` par domaine. § Pattern Server Action standard
- Chaque Server Action revérifie l'auth en première instruction ; le middleware ne suffit pas. § Auth
- Les données se lisent dans les Server Components et passent en props ; un Client Component ne lit pas de données. § Pattern Fetch (Server Components)
- Le message rendu au client est une constante littérale ou `handleSupabaseError(error)`, jamais un champ de l'erreur (`message`, `details`, `hint`) ; l'erreur technique se journalise côté serveur. § Error Handling
- Un curseur de pagination est composite (`created_at`, `id`), avec son index `(created_at desc, id desc)` ; jamais `created_at` seul. § Cursor-based (pour l'infinite scroll)
- `count: "exact"` scanne la table à chaque page : `estimated`, ou un compte sur la première page seule, au-delà de ~50 000 lignes ; `max_rows` tronque une page sans erreur. § Cursor-based (pour l'infinite scroll)
- Filtres, tri et page vivent dans l'URL, jamais dans un state local. § Search & Filter
- Toute valeur de `searchParams` passe par un schéma Zod avant `.order()`, `.eq()`, `.select()` ou `.ilike()` ; une colonne de tri est un `z.enum`, jamais un `z.string()`. § Search & Filter
- Une recherche `ilike` échappe `%`, `_` et `\` de la saisie. § Search & Filter
- Jamais `cookies()` ni `headers()`, donc jamais le `createClient()` serveur, dans un `unstable_cache` : client anon sans cookies, donnée lisible par `anon` sous RLS. § Avec Supabase (Server Components)
- Une donnée par entité se revalide par un tag de l'entité (`revalidateTag("project:<id>")`), pas par `revalidatePath`, qui ne traverse pas les utilisateurs. § Avec Supabase (Server Components)
- Une opération groupée compare les lignes rendues (`.select("id")`) aux lignes demandées et rend l'écart : un refus de RLS est silencieux. § Bulk Operations
- Un webhook vérifie la signature sur le corps brut avant tout traitement, et répond 400 sinon. § Webhook Pattern
