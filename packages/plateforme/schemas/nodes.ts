// Chemins de nœuds, opérations de `write` et entrées de `read` et `write` (H51, H54 ; E03-S01,
// E03-S03), composés par les entrées des outils MCP (`mcp/schemas.ts`) et par le corps de l'API
// (`node-body.ts`), et types de lecture partagés avec `ui/` (E05-S02). `zod/v4` : un schéma v3 ne
// s'imbrique pas dans un objet v4, et `z.toJSONSchema` n'existe qu'en v4 (H21, N12).
//
// Contrat MCP étendu par ajout seulement (ADR-002 § 1, N16) : aucune borne du service ici (lignes
// uniques, 40 000 caractères par opération, 50 opérations, bornes de la page, champs propres à chaque
// opération), pour que le JSON Schema servi ne change que par les ajouts de la story.
import * as z from "zod/v4"
import type { BlockType } from "./blocks"

export const NODE_PATH_PATTERN = /^[a-z0-9_]+(\/[a-z0-9_]+)*$/

export const nodePathSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(NODE_PATH_PATTERN, "Path: lowercase letters, digits and _ separated by /, e.g. ventes/relance_devis")

/** Les cinq opérations par section d'E03-S01, dans leur ordre. */
export const SECTION_OPS = ["replace_section", "append", "add_section", "delete_section", "replace_text"] as const

/** Les quatre opérations par bloc (ADR-011 § 5), ajoutées après celles d'E03-S01 (N16). */
export const BLOCK_OPS = ["replace_block", "insert_after", "delete_block", "move_block"] as const

export const WRITE_OPS = [...SECTION_OPS, ...BLOCK_OPS] as const

/** Un élément de `write.ops` : une opération par section (titre) ou par bloc (référence). */
export const writeOpSchema = z.object({
  op: z
    .enum(WRITE_OPS)
    .describe(
      "replace_section, append, add_section, delete_section or replace_text. By block: replace_block, insert_after, delete_block or move_block.",
    ),
  section: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .optional()
    .describe('Title of the section it applies to, e.g. "Étapes". Section operations only.'),
  text: z
    .string()
    .optional()
    .describe("New text (markdown); required by every op except delete_section. delete_block and move_block take no text either."),
  find: z.string().min(1).optional().describe("replace_text only: exact words to replace, appearing once in the section."),
  after: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .optional()
    .describe("add_section only: title of the section to insert after (default: at the end)."),
  block: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .optional()
    .describe('Block operations: reference of the block, from read with refs: true, e.g. "3f9a2c1b" or a key such as "etapes".'),
  after_block: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .optional()
    .describe("move_block only: reference of the block to put it after (default: the start of the page)."),
})

export type WriteOp = z.infer<typeof writeOpSchema>

/** Les genres d'un nœud (ADR-011 § 1) ; `context` est posé par la base, jamais demandé. */
export const NODE_KINDS = ["page", "procedure", "context", "table"] as const

export type NodeKind = (typeof NODE_KINDS)[number]

/** Les genres qu'on peut demander à `write` (même JSON Schema que `write.kind` d'E03-S01). */
export const nodeKindSchema = z.enum(["page", "procedure", "table"])

/** L'entrée de `read`, sans `ctx` : les champs d'E03-S01 à l'identique, puis `refs`. */
export const readNodeSchema = z.object({
  path: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .describe("Path of a page, procedure or table (e.g. ventes/relance_devis), journal, or a function name (e.g. table.rows)."),
  section: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .optional()
    .describe(`Title of one section to read, e.g. "Étapes" (default: the whole page, or its outline if long).`),
  outline: z.boolean().optional().describe("true: only the section titles with their sizes (default false)."),
  since_revision: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Only what changed after this revision, e.g. 3 (default: the current content)."),
  draft: z.boolean().optional().describe("true: read the pending draft instead of the published revision (default false)."),
  cursor: z
    .string()
    .min(1)
    .max(500)
    .optional()
    .describe("Cursor given by a previous result cut at 45,000 characters, to read what follows (default: from the start)."),
  refs: z
    .boolean()
    .optional()
    .describe("true: each block comes with its reference, e.g. <!-- ref: 3f9a2c1b -->, for the block operations of write (default false)."),
})

export type ReadNodeInput = z.infer<typeof readNodeSchema>

/**
 * L'entrée de `write`, sans `ctx` : les champs d'E03-S01 à l'identique, sauf les éléments de `ops`
 * (`writeOpSchema`) et `header`, décrit sans préfixe (`mcp/schemas.ts` pose la description préfixée).
 */
export const writeNodeSchema = z.object({
  path: nodePathSchema.describe("Path of the page, procedure or table to create or edit, e.g. conseil/cr_client_2026_09."),
  base_revision: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Revision you read, e.g. 4; required to edit an existing node, a stale one is refused (default: none, for a creation)."),
  title: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .optional()
    .describe(`Title, 200 characters max, e.g. "Compte rendu Mairie de Valbrune"; required to create (default: unchanged). A new title, once published, moves the path to follow it; the old path still leads here.`),
  summary: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .optional()
    .describe("One-line summary, 200 characters max; required to create (default: unchanged)."),
  kind: nodeKindSchema.optional().describe("Kind of a new node: page, procedure or table (default page)."),
  ops: z
    .array(writeOpSchema)
    .optional()
    .describe(
      "Operations on sections addressed by title, applied in order; the first that fails refuses them all (default: none). Block operations address a block by its reference instead.",
    ),
  header: z.record(z.string(), z.unknown()).optional().describe("Header of a table (default: unchanged)."),
  publish: z
    .boolean()
    .optional()
    .describe("true: publish after applying ops; publishing needs the manage level (default false: draft only)."),
})

export type WriteNodeInput = z.infer<typeof writeNodeSchema>

/**
 * Le déplacement d'un nœud (E03-S07, AC14, P12) : un seul schéma pour la route
 * `POST /api/plateforme/nodes/move`, le formulaire « Déplacer… » d'E05-S02 et `moveNode`. Sans lui,
 * la route et le formulaire valideraient chacun leur chemin.
 */
export const moveNodeSchema = z.strictObject({ path: nodePathSchema, new_path: nodePathSchema })

export type MoveNodeInput = z.infer<typeof moveNodeSchema>

/** Un bloc tel que l'écran le lit (AC35) : id complet, référence servie, contenu, révision. */
export type BlockView = {
  id: string
  ref: string
  type: BlockType
  text: string | null
  data: Record<string, unknown>
  key: string | null
  position: number
  revision: number
  provenance: Record<string, unknown>
}

/** Un nœud complet pour l'écran de page (AC35, E05-S02) : sans plan servi ni plafond. */
export type NodeView = {
  id: string
  path: string
  title: string
  summary: string
  kind: NodeKind
  status: "draft" | "published"
  revision: number
  updatedAt: string
  updatedByName: string | null
  owner: { kind: "org" | "team" | "user"; teamName?: string; leadName?: string; userName?: string; you?: boolean }
  level: 1 | 2 | 3
  parent: { path: string; title: string } | null
  children: { path: string; title: string; summary: string; kind: NodeKind; status: "draft" | "published" }[]
  childrenTotal: number
  blocks: BlockView[]
  outline: { blockId: string; title: string; level: number; chars: number }[]
  draft: {
    baseRevision: number
    savedAt: string
    draftStamp: string
    blocks: BlockView[]
    title: string | null
    summary: string | null
    kind: "page" | "procedure" | null
    meta: Record<string, unknown> | null
  } | null
  meta: Record<string, unknown>
  /** Les lignes d'un tableau, comptées à la lecture du nœud (méta « <n> lignes », E07-S03 AC1) ; absent hors d'un tableau. */
  rowsTotal?: number
}

/** Un nœud de l'arbre des écrans (AC36) : triés par chemin, rattachés à l'ancêtre visible. */
export type TreeNode = { path: string; title: string; kind: NodeKind; status: "draft" | "published"; children: TreeNode[] }

/**
 * Le paramètre `version` de la page d'un nœud (E05-S02, AC9) : `publiee` montre la version publiée à
 * un rédacteur ; toute autre valeur, ou son absence, le brouillon. Sans lui, la page lirait un
 * paramètre d'adresse sans schéma (`api-patterns.md § Search & Filter`).
 */
export const nodeVersionParamSchema = z.enum(["publiee"]).optional().catch(undefined)
