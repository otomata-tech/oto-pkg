// Écriture et file de travail des tableaux (E07-S02 ; H92, H94, H98) : arguments stricts de
// `table.write`, `table.claim` et `table.release`, servis en contrat par `read` (H21). Fichier à part
// de `tables.ts` (E07-S01), qu'E07-S04 complète dans la même vague. Sans lui, aucune des trois
// fonctions n'aurait de schéma : ni refus des arguments inconnus, ni contrat lisible avant d'écrire.
//
// Une valeur s'écrit nue, ou avec sa preuve, `{ value, comment | link }` (fiche D99, tâche M53). Une valeur
// nue (sans commentaire écrit ni lien) passe le schéma : égale à la valeur rangée, elle est ignorée ;
// différente, elle s'écrit, sauf dans un tableau qui exige la preuve (`proof`, fiche D133), où elle refuse
// l'appel entier. La colonne d'état (dans ses
// transitions permises) et la colonne clé s'écrivent nues, sans preuve. Le service en décide après
// lecture des lignes (`withoutBareValues`, décision de JB du 2026-09-27, HN-M53-5) : sans elle, une ligne
// lue puis renvoyée telle quelle serait refusée (AC29 d'E07-S02).
// `null`, seul ou en `value`, passe le schéma (fiche D49, tranchée B ; tâche M16) : il refuse sa seule
// ligne, avec la consigne d'AC4, dans `applyRowWrite`, et les autres lignes du lot s'écrivent. Les
// contrôles d'une cellule (`comment`, `link`) portent sur le chemin exact du champ : un espace réservé
// `"<…>"` d'une procédure s'y reconnaît (E03-S06, règle 4), là où l'échec d'une union ne nommerait que
// la cellule. Seul contrôle de la forme d'une écriture (`forms-patterns.md § Principe`) : `applyRowWrite`
// reçoit les opérations qu'il a validées, et ne contrôle que ce qui dépend du tableau (colonnes, types,
// états) et le `null` d'une cellule.
import * as z from "zod/v4"
import { NODE_HEAD_MAX, nodePathSchema } from "./nodes"
import { columnNameSchema, isRecord, tableColumnSchema, tableFilterSchema, tablePathArgSchema } from "./tables"

/** Raison d'un `verified_empty` (H92, AC11) : 3 à 500 caractères, espaces de bord retirés. */
const REASON_MIN = 3
const REASON_MAX = 500
const REASON_REFUSED = `verified_empty needs a reason of ${REASON_MIN} characters at least`

/** Commentaire et lien d'une cellule (N8). */
const COMMENT_MAX = 1_000
const LINK_MAX = 2_000
const LINK_REFUSED = "expected a URL starting with http:// or https://, 2,000 characters at most"
const COMMENT_REFUSED = "1,000 characters at most"

/**
 * Une URL de preuve : ancrée, chaque caractère lu une fois (`security-patterns.md § Validation des inputs`) ;
 * celle aussi d'une cellule `url` lue dans un CSV (E10-S01, `schemas/csv.ts`).
 */
export const LINK_PATTERN = /^https?:\/\/\S+$/i

/** Lignes au plus par appel (H92) ; réservations au plus par appel et durée d'un bail (H98). */
const MAX_WRITE_ROWS = 50
/** Colonnes nommées au plus par opération d'une ligne : un en-tête en déclare 100 au plus (`tableHeaderSchema`). */
const MAX_ROW_COLUMNS = 100
const MAX_CLAIM_ROWS = 5
const MAX_LEASE_MINUTES = 60
export const DEFAULT_LEASE_MINUTES = 15

/** Libellé d'un travailleur (N17) : 1 à 40 caractères ; la base en admet 100 (`claimed_by`). */
const WORKER_MAX = 40

/** Un lien de preuve accepté (N8) : `http(s)`, 2 000 caractères au plus. */
function isProofLink(link: string): boolean {
  return link.length <= LINK_MAX && LINK_PATTERN.test(link)
}

/** La valeur d'une cellule envoyée : `null` compris, que `applyRowWrite` refuse avec sa ligne (AC4, D49 B). */
const cellValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()])

/** Le refus d'une cellule qui n'a pas la forme `{ value, comment | link }` (un tableau, une clé inconnue…). */
const CELL_REFUSED =
  'expected a value, {"value": …, "comment": "…"} or {"value": …, "link": "https://…"}; a new value needs its proof when the table requires it (table.schema says it)'

/**
 * Une cellule écrite (AC3, P1) : `{ value, comment | link }`, la valeur et sa preuve ; une valeur nue, ou
 * `{ value }` sans preuve, passe ici et se juge au service contre la valeur rangée (HN-M53-5) ; `null`,
 * seul ou en `value`, refuse sa ligne (AC4, D49 B). Le commentaire et le lien sont contrôlés hors de
 * l'union, sur leur propre chemin.
 */
export const tableCellInputSchema = z
  .union([z.strictObject({ value: cellValueSchema, comment: z.string().optional(), link: z.string().optional() }), z.string(), z.number(), z.boolean(), z.null()], {
    error: CELL_REFUSED,
  })
  .superRefine((cell, context) => {
    if (!isRecord(cell)) return
    if (typeof cell.comment === "string" && cell.comment.length > COMMENT_MAX) context.addIssue({ code: "custom", message: COMMENT_REFUSED, path: ["comment"] })
    if (typeof cell.link === "string" && !isProofLink(cell.link)) context.addIssue({ code: "custom", message: LINK_REFUSED, path: ["link"] })
  })
  .describe(
    'A value (text, number, true or false), or {"value": …, "comment": "…"} or {"value": …, "link": "https://…"}: the value with a comment saying where you found it (1,000 characters at most) or the link of the source; a new value needs its proof when the table requires it (table.schema says it), except the state column, set bare within its allowed changes; a bare value equal to the stored one is ignored; a null refuses its row: use clear, or verified_empty with a reason.',
  )

export type TableCellInput = z.infer<typeof tableCellInputSchema>

/** Clé d'une ligne telle qu'envoyée : normalisée par le service (N19), puis bornée à 200 caractères. */
const rowKeyArgSchema = z.union([z.string(), z.number()])

export const tableRowWriteSchema = z.strictObject({
  key: rowKeyArgSchema.describe('The value of the key column of the row, e.g. "Boulangerie du Pont"; a new key creates the row, unless the table is closed.'),
  revision: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("The revision of the row you read, e.g. 3: if the row changed since, nothing is written and the row comes back as it is now (default: no check)."),
  set: z
    .record(columnNameSchema, tableCellInputSchema)
    .refine((set) => Object.keys(set).length <= MAX_ROW_COLUMNS, { error: `${MAX_ROW_COLUMNS} columns at most` })
    .optional()
    .describe(
      'Values by column, e.g. {"contact": {"value": "Anne Roy", "comment": "Page équipe du site"}, "email": {"value": "anne@exemple.test", "link": "https://exemple.test/contact"}}; a new value needs its proof when the table requires it (table.schema says it), except the state column, set bare within its allowed changes; a bare value equal to the stored one is ignored; a null refuses its row (default: none).',
    ),
  clear: z.array(columnNameSchema).max(MAX_ROW_COLUMNS).optional().describe('Columns to empty, e.g. ["notes"] (default: none).'),
  verified_empty: z
    .array(
      z.strictObject({
        column: columnNameSchema.describe("The column searched without result, e.g. email."),
        reason: z
          .string()
          .trim()
          .min(REASON_MIN, { error: REASON_REFUSED })
          .max(REASON_MAX)
          .describe("Where you searched, 3 to 500 characters, e.g. Aucune adresse sur le site."),
      }),
    )
    .max(MAX_ROW_COLUMNS)
    .optional()
    .describe('Columns searched without result, e.g. [{"column": "email", "reason": "Aucune adresse sur le site"}] (default: none).'),
})

export type TableRowWrite = z.infer<typeof tableRowWriteSchema>

/** Ce que dit `create_only` (E11-S01, AC-a7), dans son schéma et dans la description de `table.write`. */
export const CREATE_ONLY_HELP =
  "create_only: true only creates rows: a key that already exists is refused (conflict) with the row as it is, and nothing is written for it (default false: a known key updates its row)"

/** Refus d'une ligne qui porte `revision` dans un appel `create_only` (AC-a4) : un seul contrôle, au schéma (`forms-patterns.md § Principe`). */
const CREATE_ONLY_REVISION = "revision is for an existing row; create_only only creates rows: remove one of them"

export const tableWriteArgsSchema = z
  .strictObject({
    table: tablePathArgSchema,
    rows: z
      .array(tableRowWriteSchema)
      .min(1)
      .max(MAX_WRITE_ROWS, { error: `${MAX_WRITE_ROWS} rows at most per call; send the others in another call` })
      .describe("Rows to write, 1 to 50: each row is written or refused on its own, and the answer says which and why."),
    create_only: z.boolean().optional().describe(`${CREATE_ONLY_HELP}.`),
  })
  .superRefine((args, context) => {
    // Rejouée même quand une ligne est refusée par sa forme : `rows` et ses lignes se lisent sans les supposer valides.
    if (args.create_only !== true || !Array.isArray(args.rows)) return
    for (const [index, row] of args.rows.entries()) {
      if (isRecord(row) && row.revision !== undefined) context.addIssue({ code: "custom", message: CREATE_ONLY_REVISION, path: ["rows", index, "revision"] })
    }
  })

export type TableWriteArgs = z.infer<typeof tableWriteArgsSchema>

/** Libellé d'un travailleur (N17), repris par `table.release`. */
export const workerSchema = z.string().trim().min(1).max(WORKER_MAX).describe("Your worker name, reused in table.release, e.g. claude-claire (1 to 40 characters).")

export const tableClaimArgsSchema = z.strictObject({
  table: tablePathArgSchema,
  worker: workerSchema,
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_CLAIM_ROWS, { error: `${MAX_CLAIM_ROWS} rows at most per claim; call table.claim again for more` })
    .optional()
    .describe("Rows to reserve, 1 to 5 (default 1)."),
  lease_minutes: z.number().int().min(1).max(MAX_LEASE_MINUTES).optional().describe("Length of the lease in minutes, 1 to 60 (default 15)."),
  filter: tableFilterSchema
    .optional()
    .describe('Rows to take among those waiting, same grammar as the filter of table.rows, e.g. {"ville": "Valbrune"} (default: the oldest waiting rows).'),
})

export type TableClaimArgs = z.infer<typeof tableClaimArgsSchema>

export const tableReleaseArgsSchema = z.strictObject({
  table: tablePathArgSchema,
  key: rowKeyArgSchema.describe('The key of the row you claimed, e.g. "Mairie de Valbrune".'),
  worker: workerSchema.describe("The worker name you gave to table.claim, e.g. claude-claire."),
  state: z.string().max(100).optional().describe("The state the row goes to, e.g. à revoir (default: the first state of the work queue)."),
})

export type TableReleaseArgs = z.infer<typeof tableReleaseArgsSchema>

/** `table.delete_rows` (E11-S02, AC-f1) : les lignes désignées par leur clé, 50 au plus, comme `table.write`. */
export const tableDeleteRowsArgsSchema = z.strictObject({
  table: tablePathArgSchema,
  keys: z
    .array(rowKeyArgSchema)
    .min(1)
    .max(MAX_WRITE_ROWS, { error: `${MAX_WRITE_ROWS} keys at most per call; send the others in another call` })
    .describe('The keys of the rows to delete, 1 to 50, e.g. ["Atelier 2", "Atelier 10"].'),
})

export type TableDeleteRowsArgs = z.infer<typeof tableDeleteRowsArgsSchema>

// ------------------------------------------------------------------------ Import d'un CSV (E10-S01)
// `table.import` (AC-c1) et le corps de `POST /api/platform/tables/import` (AC-b3 à AC-b5) : deux portes
// d'un même service (`importRows`, `mcp-patterns.md § 1`). La lecture et le contrôle d'un CSV sont des
// fonctions pures de `csv.ts`, que l'écran joue avant d'envoyer et que le service rejoue.

/** Lignes, colonnes et caractères d'une cellule au plus d'un import (AC-b4, HN-E10S01-7). */
export const IMPORT_ROWS_MAX = 5_000
export const IMPORT_COLUMNS_MAX = 100
export const IMPORT_CELL_MAX = 10_000

/** Lignes par requête de l'écran (HN-E10S01-8) ; octets au plus d'un fichier lu par le navigateur. */
export const IMPORT_LOT_ROWS = 500
export const IMPORT_FILE_BYTES_MAX = 5 * 1024 * 1024

/**
 * Caractères du CSV d'un appel de `table.import` (HN-E10S01-4, D117) : la fonction le refuse en `too_large` avec
 * la consigne des morceaux (AC-c1), qu'un `.max` du schéma rendrait en `invalid_arguments`.
 */
export const IMPORT_CSV_MAX = 40_000

const oneLine = z.string().trim().min(1).max(NODE_HEAD_MAX)

export const tableImportArgsSchema = z.strictObject({
  table: tablePathArgSchema.describe("The table to fill, e.g. ventes/clients; with create, the path of the table to create."),
  csv: z
    .string()
    .min(1)
    .describe(
      "The CSV text, its header line first, 40,000 characters at most: send a longer file in pieces of about 20,000 characters, each starting with the header line. Separator: ;, tab or , (the most frequent one on the header line).",
    ),
  key: oneLine
    .optional()
    .describe("The column that identifies a row, as named on the header line, e.g. Nom (default: the key of the table; with create, the first column whose values are all present and distinct)."),
  create: z
    .strictObject({
      title: oneLine.describe("Title of the new table, e.g. Clients."),
      summary: oneLine.describe("One-line summary, 200 characters max, e.g. Les clients exportés du logiciel de facturation."),
    })
    .optional()
    .describe("Creates the table with the columns and types read from the CSV, and publishes it; needs the manage level on its parent (default: the table exists)."),
  file_name: oneLine.optional().describe("Name of the file, cited in the provenance of every value, e.g. clients.csv (default table.import)."),
})

export type TableImportArgs = z.infer<typeof tableImportArgsSchema>

/**
 * Le corps de `POST tables/import` (AC-b3, AC-b5, AC-b7) : un lot de 500 lignes au plus, en chaînes, lues par le
 * service selon le type de chaque colonne nommée ; `create`, sur le premier lot seulement, crée et publie le
 * tableau ; `file_name` pour un fichier, `converted_from` pour un tableau simple converti (sa page).
 */
export const tableImportBodySchema = z
  .strictObject({
    table: nodePathSchema,
    file_name: oneLine.optional(),
    converted_from: nodePathSchema.optional(),
    create: z
      .strictObject({
        title: oneLine,
        summary: oneLine,
        header: z.strictObject({ columns: z.array(tableColumnSchema).min(1).max(IMPORT_COLUMNS_MAX), key: columnNameSchema }),
      })
      .optional(),
    columns: z.array(columnNameSchema).min(1).max(IMPORT_COLUMNS_MAX),
    rows: z.array(z.array(z.string().max(IMPORT_CELL_MAX)).max(IMPORT_COLUMNS_MAX)).max(IMPORT_LOT_ROWS),
  })
  .refine((body) => (body.file_name === undefined) !== (body.converted_from === undefined), { error: "give file_name or converted_from" })

export type TableImportBody = z.infer<typeof tableImportBodySchema>
