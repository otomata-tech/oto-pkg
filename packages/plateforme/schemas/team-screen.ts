// Les réglages des tableaux de l'écran « Équipes et droits » (E05-S09, partie d1) : la recherche, le filtre
// et le tri des tableaux des personnes et des équipes, portés d'oto-frontend (`members-table.tsx`,
// `members-counters.tsx`, `teams-columns.tsx`, `schemas/member.ts`), lus dans l'adresse par la page de
// l'hôte (`tables-patterns.md § L'état de la table vit dans l'URL`). Sans ce module, la page de l'hôte et
// l'écran décriraient chacun ces paramètres, et une valeur illisible ferait tomber la page. Repris
// d'oto-frontend : chaque valeur illisible rattrapée par son défaut, le tri en énumération. Retiré : `active`
// et `atRisk` (aucune tuile n'y répond), `connections` (colonne sans source).
import * as z from "zod/v4"

/** Caractères au plus de `q` dans l'adresse ; au-delà, `q` retombe sur son défaut (aucune recherche). */
const PEOPLE_SEARCH_MAX = 100

/**
 * `q` : le nom ou l'adresse cherchés ; `filter=invitations` : les invitations en attente seules ; `sort` : la
 * colonne triée du tableau des équipes (le nom par défaut) ; `order` : croissant par défaut (noms anglais,
 * E11-S07). Une valeur illisible (trop longue, répétée, inconnue) retombe sur son défaut.
 */
export const equipesListesSchema = z.object({
  q: z.string().trim().max(PEOPLE_SEARCH_MAX).catch(""),
  filter: z.enum(["invitations"]).optional().catch(undefined),
  sort: z.enum(["team", "people"]).optional().catch(undefined),
  order: z.enum(["asc", "desc"]).catch("asc"),
})

export type ReglagesDesListes = z.output<typeof equipesListesSchema>
