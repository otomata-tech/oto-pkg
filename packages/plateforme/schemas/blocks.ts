// Blocs du contenu (ADR-011 § 2, E01-S06) : les onze types, la clé d'un bloc, la forme minimale de
// `text` et de `data` par type, et la référence courte d'un bloc. Mêmes bornes que la base
// (`blocks_shape_check`, colonnes `text` et `key`), pas plus : le test de parité (AC36) confronte les
// deux. `position`, `revision`, `provenance`, `org_id` et l'identité sont posées par le service et la
// base : ils restent hors de ce schéma. `zod/v4` comme les autres schémas partagés (H21).
//
// Repris d'oto-frontend (`src/schemas/block.ts`, `ContentBlock`) : `id` fabriqué par le serveur,
// jamais par le client ; `items` ; `ordered` pour une étape numérotée ; les clés inconnues de `data`
// traversent sans perte. Retiré : `type` libre (liste fermée ici), `refs` servies et `content` d'un
// encart (→ bloc `reference`).
import * as z from "zod/v4"
import { NODE_PATH_PATTERN } from "./nodes"

/** Les onze types de la V1, dans l'ordre du contrat d'E01-S06 ; une migration additive en ajoute. */
export const BLOCK_TYPES = [
  "heading",
  "paragraph",
  "list",
  "checklist",
  "code",
  "call",
  "mermaid",
  "image",
  "callout",
  "reference",
  "row",
] as const

export const blockTypeSchema = z.enum(BLOCK_TYPES)

export type BlockType = z.infer<typeof blockTypeSchema>

/**
 * Longueur en caractères, comme `char_length` de Postgres : une paire de substitution compte pour un.
 * Exportée pour les tailles de `server/nodes/` (E03-S03), qui comptent comme la base.
 */
export function chars(value: string): number {
  return value.length - (value.match(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g)?.length ?? 0)
}

/**
 * `btrim` de Postgres sans second argument : il ne retire que les espaces, pas les tabulations. Par
 * boucle : l'expression ` +$` repart de chaque espace d'une longue suite, en temps quadratique
 * (5,4 s pour 100 000 caractères venus d'un client, E03-S03 ; `security-patterns.md § Validation des inputs`).
 */
function btrim(value: string): string {
  let start = 0
  let end = value.length
  while (start < end && value[start] === " ") start++
  while (end > start && value[end - 1] === " ") end--
  return value.slice(start, end)
}

const within = (min: number, max: number) => (value: string) => chars(value) >= min && chars(value) <= max

/** Texte de tout bloc : 100 000 caractères au plus (`blocks.text`). */
const blockText = z.string().refine(within(0, 100_000), "Text: 100 000 characters at most.")

/** Là où la base veut `text` nul (`list`, `checklist`, `call`, `reference`, `row`). */
const noText = z.null().optional()

/** `data` sans forme imposée : un objet. */
const anyData = z.record(z.string(), z.unknown())

/**
 * Clé d'un bloc (ancre lisible, clé métier d'une ligne) : 1 à 500 caractères, sans espace de bord
 * ni caractère de contrôle (`[[:cntrl:]]` de la base : U+0000 à U+001F, U+007F à U+009F).
 */
export const blockKeySchema = z
  .string()
  .refine(within(1, 500), "Key: 1 to 500 characters.")
  .refine((value) => btrim(value) === value, "Key: no leading or trailing space.")
  .refine((value) => !/\p{Cc}/u.test(value), "Key: no control character.")

const optionalKey = blockKeySchema.nullable().optional()

const heading = z.object({
  type: z.literal("heading"),
  text: blockText
    .refine((value) => within(1, 200)(btrim(value)), "Heading: 1 to 200 characters.")
    .refine((value) => !/[\r\n]/.test(value), "Heading: a single line."),
  data: z.looseObject({ level: z.union([z.literal(1), z.literal(2), z.literal(3)]) }),
  key: optionalKey,
})

const paragraph = z.object({ type: z.literal("paragraph"), text: blockText, data: anyData.optional(), key: optionalKey })

const list = z.object({
  type: z.literal("list"),
  text: noText,
  data: z.looseObject({
    items: z.array(z.string()).min(1).max(500),
    ordered: z.boolean().optional(),
    start: z.number().min(1).optional(),
  }),
  key: optionalKey,
})

const checklist = z.object({
  type: z.literal("checklist"),
  text: noText,
  data: z.looseObject({ items: z.array(z.looseObject({ text: z.string(), checked: z.boolean() })).min(1).max(500) }),
  key: optionalKey,
})

const code = z.object({
  type: z.literal("code"),
  text: blockText,
  data: z.looseObject({ language: z.string().optional() }).optional(),
  key: optionalKey,
})

const call = z.object({
  type: z.literal("call"),
  text: noText,
  data: z.looseObject({ function: z.string().refine(within(1, 100), "Function: 1 to 100 characters."), args: anyData }),
  key: optionalKey,
})

const mermaid = z.object({
  type: z.literal("mermaid"),
  text: blockText.refine((value) => btrim(value) !== "", "Mermaid: not blank."),
  data: anyData.optional(),
  key: optionalKey,
})

const image = z.object({
  type: z.literal("image"),
  text: blockText.nullable().optional(),
  data: z.looseObject({ src: z.string().refine(within(1, 2000), "Source: 1 to 2 000 characters."), alt: z.string().optional() }),
  key: optionalKey,
})

const callout = z.object({
  type: z.literal("callout"),
  text: blockText,
  data: z.looseObject({ tone: z.string().optional() }).optional(),
  key: optionalKey,
})

const reference = z.object({
  type: z.literal("reference"),
  text: noText,
  data: z.looseObject({
    path: z.string().max(1000).regex(NODE_PATH_PATTERN, "Path: lowercase letters, digits and _ separated by /."),
    view: anyData.optional(),
  }),
  key: optionalKey,
})

/** Ligne d'un tableau : sa clé métier est obligatoire ; aucun type de cellule contrôlé ici (E07-S01). */
const row = z.object({ type: z.literal("row"), text: noText, data: anyData.optional(), key: blockKeySchema })

/** Un bloc à écrire : `text`, `data` et `key` selon son type (contrat d'E01-S06, § 2). */
export const blockInputSchema = z.discriminatedUnion("type", [
  heading,
  paragraph,
  list,
  checklist,
  code,
  call,
  mermaid,
  image,
  callout,
  reference,
  row,
])

export type BlockInput = z.infer<typeof blockInputSchema>

/**
 * Référence courte d'un bloc (ADR-011 § 5) : sa clé, sinon les 8 premiers caractères hexadécimaux
 * de son `id`. Elle se résout dans un nœud et un état : la clé exacte d'abord, puis le préfixe d'`id`
 * s'il est unique (E03-S03).
 */
export function blockRef(block: { id: string; key: string | null }): string {
  return block.key ?? block.id.replace(/-/g, "").slice(0, 8)
}
