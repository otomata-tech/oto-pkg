// Types métier partagés
// Ajouter ici les types custom du projet (pas les types Supabase auto-générés)

// Retour d'une Server Action : succès et erreur mutuellement exclusifs (api-patterns.md).
export type ActionResult<T> = { data: T; error?: never } | { data?: never; error: string }
