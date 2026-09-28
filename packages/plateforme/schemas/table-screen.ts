// L'écran d'un tableau (E07-S03 ; H93, H95, H99, HN-E07S03-3, HN-E07S03-4) : paramètres de la grille
// lus dans l'adresse, décision de la revue humaine, vue d'un bloc `reference` et formes que les
// lectures de l'écran rendent à `ui/`. Fichier à part de `tables.ts` (E07-S01), qu'E07-S04 complète
// dans la même vague, comme `table-write.ts` (E07-S02). Sans lui, la route de la revue et l'îlot de la
// décision valideraient chacun leur corps, et l'écran devinerait la forme des lectures.
import * as z from "zod/v4"
import { nodePathSchema, type NodeKind } from "./nodes"
import { MAX_FILTER_CLAUSES, tableRowsArgsSchema, type TableColumn, type TableRowRead } from "./tables"

/** La raison d'une décision (HN-E07S03-2) : facultative, 500 caractères au plus. */
export const REVIEW_REASON_MAX = 500

/**
 * La décision d'une personne sur une ligne de la file de revue (AC11) : la clé bornée comme celle de
 * `table.write` (E07-S02, N19), la révision lue, l'une des deux décisions, la raison facultative.
 */
export const reviewDecisionSchema = z.strictObject({
  table: nodePathSchema,
  key: z.string().trim().min(1).max(200),
  revision: z.number().int().min(1),
  decision: z.enum(["approve", "reject"]),
  reason: z.string().trim().max(REVIEW_REASON_MAX).optional(),
})

/** L'issue d'une décision (AC11, AC12) : écrite, ou sautée sans rien écrire, la ligne ayant changé. */
export type ReviewOutcome =
  | { outcome: "decided"; key: string; state: string; revision: number }
  | { outcome: "skipped"; key: string; currentState: string | null; currentRevision: number }

/** Les lignes d'une page de la grille, qu'ajoute « Charger plus », et les lignes au plus (AC7) : l'adresse, l'écran et le service. */
export const GRID_PAGE_ROWS = 20
export const GRID_ROWS_MAX = 200

/** Caractères au plus d'une recherche dans la grille : `q` dans l'adresse (AC5), et les champs de l'écran (« Chercher », « Contient »). */
export const GRID_SEARCH_MAX = 100

/**
 * Les paramètres de la grille dans l'adresse (HN-E07S03-4), forme brute : `q` (100 caractères),
 * `tri` (`-` pour décroissant), `f` répété `<colonne>:<opération>:<valeur>` (30 au plus, H95), `n` de 20
 * à 200. La validation contre les colonnes est celle de `reglagesDepuisLAdresse` (`ui/tableau/adresse.ts`).
 */
export const tableScreenParamsSchema = z.object({
  q: z.string().trim().max(GRID_SEARCH_MAX).optional(),
  tri: z.string().max(80).optional(),
  f: z.array(z.string().max(300)).max(MAX_FILTER_CLAUSES).optional(),
  n: z.coerce.number().int().min(GRID_PAGE_ROWS).max(GRID_ROWS_MAX).catch(GRID_PAGE_ROWS),
})

/** Lignes au plus d'une vue (H56). */
export const TABLE_VIEW_ROWS_MAX = 20

/** Blocs `reference` rendus en place au plus par nœud (HN-E07S03-5) : le service et l'écran ; les suivants gardent leur lien. */
export const SCREEN_REFERENCES_MAX = 10

/**
 * La vue d'un bloc `reference` (H56) : `filter`, `sort` et `columns` de `table.rows` (E07-S01, jamais
 * réécrits ici), `limit` de 20 au plus ; toute autre clé est refusée.
 */
export const tableViewSchema = z.strictObject({
  filter: tableRowsArgsSchema.shape.filter,
  sort: tableRowsArgsSchema.shape.sort,
  columns: tableRowsArgsSchema.shape.columns,
  limit: z.number().int().min(1).max(TABLE_VIEW_ROWS_MAX).optional(),
})

/** Les lignes de la grille (AC5 à AC7) : celles de la page, le nombre qui répond, le nombre du tableau. */
export type TableGridRows = { rows: TableRowRead[]; total: number; count: number }

/** Le résumé de la grille (AC8) : le compte de chaque état déclaré, zéros compris ; une somme par colonne nombre. */
export type TableGridSummary = {
  states: { state: string; count: number }[] | null
  sums: { column: string; total: number }[]
}

/**
 * La file de revue (AC10) : le nombre de lignes à l'état de revue, et les premières dans l'ordre des clés,
 * avec leur provenance, entre lesquelles la personne choisit ou passe (fiche D99, M54, P2 et P3).
 */
export type TableReviewQueue = { count: number; rows: TableRowRead[] }

/** Pourquoi un bloc `reference` ne se rend pas en place (AC15, AC16) : la raison que l'écran dit en français. */
export type ScreenReferenceProblem =
  | "not_found"
  | "not_a_table"
  | "unpublished"
  | "unknown_key"
  | "limit"
  | "unknown_column"
  | "filter"
  | "sort"
  | "too_large"

/** La vue d'un tableau (AC15) : ses colonnes, la clé d'abord, ses lignes lues (20 au plus) et leur total. */
export type ScreenView = { kind: "view"; path: string; title: string; key: string; columns: TableColumn[]; rows: TableRowRead[]; total: number }

/** La carte d'un nœud cité (AC16) ; `movedFrom` : le chemin cité, quand c'est un ancien chemin du nœud. */
export type ScreenCard = { kind: "card"; path: string; title: string; nodeKind: NodeKind; summary: string; movedFrom?: string }

/** Un bloc qui ne se rend pas en place : le code (H04) et la raison ; `detail` nomme la clé ou la colonne en cause. */
type ScreenReferenceError = { kind: "view" | "card"; path: string; error: "not_found" | "invalid_arguments"; reason: ScreenReferenceProblem; detail?: string }

/** Un bloc `reference` résolu pour l'écran (AC15, AC16 ; H56, HN-E07S03-5). */
export type ScreenReference = ScreenView | ScreenCard | ScreenReferenceError
