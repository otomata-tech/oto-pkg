// Accès aux tables de contenu (E03-S03 ; ADR-011 § 3, E01-S06) : blocs d'un état, brouillon ouvert
// (`open_draft`, `node_drafts`), écriture du brouillon, et traduction des codes de la base en refus
// (§ Contrat, point 4, N41). Aucune décision de droit ici : chaque fonction est appelée après celle du
// service. Sans lui, les accès aux tables de contenu seraient répétés dans quatre modules. Par la face
// SQL (E01-S10, partie b) : une transaction par lecture, une pour l'écriture du brouillon (AC-x4).
import { orderBlocks } from "../../schemas"
import { unknownPath } from "../access"
import type { Json } from "../database"
import type { PlatformDb } from "../db"
import { fromDatabaseError, inTransaction, PlatformError } from "../errors"
import type { Tx } from "../sql"
import { planDraftWrites, type DraftUpdate } from "./diff"
import { displayRefs, type DocBlock } from "./document"
import type { NodeRow } from "./lookup"

/**
 * Les colonnes de `blocks` que lit `docBlock`, pour `sql(…)` (E01-S10), identifiants pris dans cette liste
 * fermée ; aussi par les blocs de `context` (E03-S08). Une seule liste depuis M32 : la forme PostgREST
 * (`BLOCK_COLUMNS`) et la copie des blocs de `context` (`BLOCK_COLUMN_NAMES`) sont parties.
 */
export const BLOCK_SQL_COLUMNS: readonly string[] = ["id", "type", "text", "data", "key", "position", "revision", "provenance"]

/** Une ligne de `blocks` telle que `docBlock` la lit. */
type BlockRecord = Parameters<typeof docBlock>[0]

/** Un objet lu en base ou validé par Zod, écrit tel quel : les valeurs JSON que le type `Json` ne sait pas lire dans `unknown`. */
function asJson(value: unknown): Json {
  // Les valeurs passées ici viennent de la base ou d'un schéma Zod : du JSON par construction.
  return value as Json
}

function record(value: unknown): Record<string, unknown> {
  // `data` et `provenance` sont des objets JSON (contraintes `jsonb_typeof(…) = 'object'`).
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

/** Une ligne de `blocks` lue en bloc de document ; aussi par les blocs de `context` (E03-S08). */
export function docBlock(row: { id: string; type: string; text: string | null; data: Json; key: string | null; position: number | null; revision: number; provenance: Json }): DocBlock {
  return { ...row, data: record(row.data), provenance: record(row.provenance) }
}

/**
 * Les blocs de l'instantané d'une révision (`node_versions.blocks`, écrit par `publish_node` :
 * `{id, type, position, key, text, data, provenance, revision}` dans l'ordre du document).
 */
export function snapshotBlocks(snapshot: Json): DocBlock[] {
  return (Array.isArray(snapshot) ? snapshot : []).flatMap((value) => {
    const row = record(value)
    if (typeof row.type !== "string") return []
    return [
      {
        id: typeof row.id === "string" ? row.id : null,
        type: row.type,
        text: typeof row.text === "string" ? row.text : null,
        data: record(row.data),
        key: typeof row.key === "string" ? row.key : null,
        position: typeof row.position === "number" ? row.position : null,
        revision: typeof row.revision === "number" ? row.revision : 1,
        provenance: record(row.provenance),
      },
    ]
  })
}

/**
 * Les blocs d'un état (`published` ou `draft`) dans l'ordre du document (`position`, `id`), lus en une
 * requête : la face SQL ne coupe pas à `max_rows` comme PostgREST (N48). Ne décide rien : l'appelant a
 * décidé avant (niveau ≥ 1 pour `published`, ≥ 2 pour `draft`).
 */
export async function loadBlocks(db: PlatformDb, nodeId: string, state: "published" | "draft"): Promise<DocBlock[]> {
  const rows = await inTransaction(
    db,
    `blocks: ${state}`,
    (sql) => sql<BlockRecord[]>`select ${sql(BLOCK_SQL_COLUMNS)} from platform.blocks where node_id = ${nodeId} and state = ${state}`,
  )
  return orderBlocks(rows.map(docBlock))
}

/** Le brouillon ouvert d'un nœud (`node_drafts`) : révision de départ, en-tête en attente, tampon. */
export type DraftRow = {
  baseRevision: number
  title: string | null
  summary: string | null
  kind: string | null
  meta: Record<string, unknown> | null
  /** `node_drafts.updated_at` : le tampon du brouillon (N46). */
  stamp: string
}

/**
 * Le brouillon ouvert, ou `null` ; lu après la décision du service (niveau ≥ 2). Le tampon est le texte que
 * PostgREST rendait (`to_json`, microsecondes comprises) : une garde comparée à l'égalité, que l'écran
 * renvoie en `draft_stamp` (`supabase-patterns.md § Couplage à Supabase (ADR-012)`, `timestamptz`).
 */
export async function loadDraft(db: PlatformDb, nodeId: string): Promise<DraftRow | null> {
  type DraftRecord = { base_revision: number; title: string | null; summary: string | null; kind: string | null; meta: Json | null; updated_at: string }
  const [data] = await inTransaction(db, "node_drafts: read", (sql) => sql<DraftRecord[]>`
    select base_revision, title, summary, kind, meta, to_json(updated_at) #>> '{}' as updated_at
      from platform.node_drafts where node_id = ${nodeId}`)
  if (!data) return null
  const meta = data.meta === null ? null : record(data.meta)
  return { baseRevision: data.base_revision, title: data.title, summary: data.summary, kind: data.kind, meta, stamp: data.updated_at }
}

/** « Enregistré le » d'un brouillon : le plus récent du tampon et des `updated_at` de ses blocs. */
export async function draftSavedAt(db: PlatformDb, nodeId: string, stamp: string): Promise<string> {
  const [data] = await inTransaction(db, "blocks: draft saved at", (sql) => sql<{ updated_at: string }[]>`
    select to_json(b.updated_at) #>> '{}' as updated_at from platform.blocks b
     where b.node_id = ${nodeId} and b.state = 'draft' order by b.updated_at desc limit 1`)
  const latest = data?.updated_at
  return latest !== undefined && Date.parse(latest) > Date.parse(stamp) ? latest : stamp
}

/** La révision courante du nœud, relue après un conflit d'écriture ou de publication (N41) ; `null` s'il n'est plus lu. */
export async function currentRevision(db: PlatformDb, nodeId: string): Promise<number | null> {
  const [data] = await inTransaction(db, "nodes: revision", (sql) => sql<{ revision: number }[]>`select revision from platform.nodes where id = ${nodeId}`)
  return data?.revision ?? null
}

/** Refus d'un brouillon publié pendant l'écriture (AC25, N41) : jamais `forbidden`. */
export function publishedMeanwhile(path: string, revision: number): PlatformError {
  return new PlatformError("stale_revision", `stale revision: ${path} was published while writing, now at revision ${revision}. Read it again, then retry.`, { revision })
}

/**
 * Ouvre le brouillon d'un nœud (`open_draft`, E01-S06) : sa révision de départ, et s'il vient d'être
 * créé. `42501` après la décision du service (règle changée entre-temps) → `forbidden` ; `P0002` et
 * `23503` → `not_found`.
 */
export async function openDraft(db: PlatformDb, node: NodeRow): Promise<{ baseRevision: number; created: boolean }> {
  const [row] = await db
    .tx((sql) => sql<{ base_revision: number; created: boolean }[]>`select base_revision, created from platform.open_draft(${node.id})`)
    .catch((error: { code?: string }) => {
      if (error.code === "P0002" || error.code === "23503") throw new PlatformError("not_found", unknownPath(node.path))
      throw fromDatabaseError(error, "open_draft")
    })
  if (!row) throw new PlatformError("internal", "Internal error.")
  return { baseRevision: row.base_revision, created: row.created }
}

/** Ce que `saveDraft` écrit : le brouillon lu, le brouillon voulu, l'en-tête en attente et sa garde. */
export type DraftSave<B extends DocBlock> = {
  node: NodeRow
  orgId: string
  userId: string
  current: readonly DocBlock[]
  next: readonly B[]
  header: { title?: string; summary?: string; kind?: string } | null
  /** L'en-tête cible entier d'un tableau (`node_drafts.meta`, E07-S04), écrit avec l'en-tête en attente. */
  meta?: Record<string, unknown>
  /** Le tampon lu au début de l'appel, ou le `draft_stamp` de l'écran ; garde de l'en-tête. */
  stamp: string | null
  provenance: Record<string, unknown>
  /**
   * L'ouverture du brouillon (`openDraft`) quand l'appel n'en a lu aucun, jouée en tête de la transaction de
   * l'écriture (M32, HN-E01S10-b2-3) : un refus qui suit n'en laisse aucun ouvert. Rend le tampon qui garde
   * l'en-tête, à la place de `stamp`.
   */
  open?: () => Promise<string | null>
}

type Conflict = { what: "header" } | { what: "block"; block: DocBlock } | { what: "draft" }

function conflictCause(save: DraftSave<DocBlock>, cause: Conflict): string {
  // L'en-tête d'un tableau (E07-S04) : le refus nomme ce que l'écriture posait.
  if (cause.what === "header") return save.meta === undefined ? "its pending title, summary or kind was saved meanwhile" : "its pending header was saved meanwhile"
  if (cause.what === "draft") return "its draft was closed meanwhile"
  return `block ${displayRefs(save.current).get(cause.block) ?? "new"} was saved meanwhile`
}

/**
 * Un conflit d'écriture : publié entre-temps (révision avancée), sinon le bloc, l'en-tête ou le brouillon
 * écrits par un autre. Journalisé d'abord, le nœud nommé par son id : les portes ne journalisent pas un
 * refus (`security-patterns.md § Idempotence et mutations concurrentes`). Dit après l'annulation de
 * l'écriture (AC-x4) : rien n'a été écrit.
 */
async function conflict(db: PlatformDb, save: DraftSave<DocBlock>, cause: Conflict): Promise<PlatformError> {
  console.error(`[platform] nodes: draft of ${save.node.id} changed while writing (${cause.what})`)
  const revision = await currentRevision(db, save.node.id)
  if (revision !== null && revision !== save.node.revision) return publishedMeanwhile(save.node.path, revision)
  return new PlatformError(
    "stale_revision",
    `stale revision: ${save.node.path} changed while writing (${conflictCause(save, cause)}). Nothing was written. Read it again with draft: true, then retry.`,
    { revision: save.node.revision },
  )
}

/**
 * Un refus de la base pendant l'écriture : nœud disparu (`23503`) → introuvable ; brouillon perdu ou
 * bloc changé → conflit ; le reste tel que traduit. L'écriture est annulée (AC-x4) : une panne se rejoue
 * sans doubler un ajout, la consigne N72 d'une écriture partielle ne vaut plus.
 */
async function failure(db: PlatformDb, save: DraftSave<DocBlock>, error: { code?: string }, cause: Conflict): Promise<PlatformError> {
  // `23503` qui vise le nœud d'un bloc (`blocks_guard`, clé étrangère) : le nœud a disparu (§ Contrat, point 4, N41).
  if (error.code === "23503") return new PlatformError("not_found", unknownPath(save.node.path))
  const translated = fromDatabaseError(error, "blocks: draft write")
  // `42501` d'un invariant des blocs `draft` (brouillon effacé par une publication) ou `stale_revision`
  // d'un `PT409` (verrou de M02) : un conflit, jamais `forbidden` (N41).
  if (translated.code === "forbidden" || translated.code === "stale_revision") return conflict(db, save, cause)
  if (translated.code === "conflict") return new PlatformError("conflict", `A key of a block of ${save.node.path} is already used. Read it again with draft: true, then retry.`)
  return translated
}

/**
 * L'écriture du brouillon arrêtée dans sa transaction : 0 ligne écrite (`failure` nul) ou refus de la base.
 * Son refus se dit après l'annulation (`saveDraft`) : une transaction qu'une erreur de la base a
 * interrompue ne se lit plus, et le refus relit la révision du nœud (`conflict`).
 */
class DraftStopped extends Error {
  constructor(
    readonly conflict: Conflict,
    readonly failure: { code?: string } | null,
  ) {
    super("draft write stopped")
  }
}

/**
 * Une requête de l'écriture du brouillon, attendue par son `then` seul (ce que les espions des tests
 * retiennent ou refusent avant l'envoi) : refusée par la base, l'arrêt de l'écriture, sa cause nommée.
 */
function written<T>(query: PromiseLike<T>, conflict: Conflict): PromiseLike<T> {
  return query.then(undefined, (error: { code?: string }) => {
    throw new DraftStopped(conflict, error)
  })
}

/** Un objet JSON écrit par la face SQL : `sql.json`, jamais une chaîne sérialisée (`supabase-patterns.md § Couplage à Supabase (ADR-012)`). */
function json(sql: Tx, value: unknown) {
  return sql.json(asJson(value))
}

/** L'en-tête en attente, gardé par le tampon lu au début de l'appel (ou celui de l'écran) : 0 ligne = conflit. */
async function writeHeader(sql: Tx, save: DraftSave<DocBlock>): Promise<void> {
  if (!save.header && save.meta === undefined) return
  const meta = save.meta === undefined ? {} : { meta: json(sql, save.meta) }
  // Le tampon comparé à l'égalité repasse par un texte : une `Date` perdrait ses microsecondes.
  const rows = await written(
    sql`
      update platform.node_drafts set ${sql({ ...save.header, ...meta, updated_by: save.userId })}
       where node_id = ${save.node.id} and (${save.stamp}::text is null or updated_at = ${save.stamp}::text::timestamptz)
      returning node_id`,
    { what: "header" },
  )
  if (rows.length === 0) throw new DraftStopped({ what: "header" }, null)
}

/** Une mise à jour gardée par la révision lue (`revision = r`) : 0 ligne = le bloc a changé entre-temps. */
async function writeUpdate(sql: Tx, save: DraftSave<DocBlock>, update: DraftUpdate<DocBlock>): Promise<void> {
  const { block, expected, content } = update
  // `planDraftWrites` ne met à jour qu'un bloc lu par son id : jamais un id vide dans le filtre (`22P02`).
  if (block.id === null) throw new PlatformError("internal", "Internal error.")
  const old = save.current.find((candidate) => candidate.id === block.id) ?? block
  const values = content
    ? {
        type: block.type,
        text: block.text,
        data: json(sql, block.data),
        key: block.key,
        position: block.position,
        revision: block.revision,
        provenance: json(sql, save.provenance),
        updated_by: save.userId,
      }
    : { position: block.position }
  const rows = await written(
    sql`
      update platform.blocks set ${sql(values)}
       where id = ${block.id} and node_id = ${save.node.id} and state = 'draft' and revision = ${expected}
      returning id`,
    { what: "block", block: old },
  )
  if (rows.length === 0) throw new DraftStopped({ what: "block", block: old }, null)
}

/** Les blocs neufs, en une requête ; rend chacun avec son id et sa révision, retrouvés par leur position (unique). */
async function insertBlocks<B extends DocBlock>(sql: Tx, save: DraftSave<B>, inserts: B[]): Promise<Map<B, B>> {
  if (inserts.length === 0) return new Map()
  // Une seule fabrique, les mêmes colonnes pour chaque ligne : `sql(rows)` prend celles de la première.
  const rows = inserts.map((block) => ({
    node_id: save.node.id,
    org_id: save.orgId,
    state: "draft",
    position: block.position,
    type: block.type,
    text: block.text,
    data: json(sql, block.data),
    key: block.key,
    provenance: json(sql, save.provenance),
    created_by: save.userId,
    updated_by: save.userId,
  }))
  const created = await written(
    sql<{ id: string; position: number | null; revision: number }[]>`insert into platform.blocks ${sql(rows)} returning id, position, revision`,
    { what: "block", block: inserts[0] },
  )
  const byPosition = new Map(created.map((row) => [row.position, row]))
  return new Map(
    inserts.map((block) => {
      const row = byPosition.get(block.position)
      if (!row) throw new PlatformError("internal", "Internal error.")
      return [block, { ...block, id: row.id, revision: row.revision }]
    }),
  )
}

/**
 * Les blocs retirés, en une requête relue : un bloc qui n'y est plus (brouillon publié entre-temps, bloc
 * retiré par un autre) est un conflit, jamais un succès (AC25 ; `api-patterns.md § Bulk Operations`).
 */
async function deleteBlocks(sql: Tx, save: DraftSave<DocBlock>, deletes: DocBlock[]): Promise<void> {
  const ids = deletes.flatMap((block) => (block.id ? [block.id] : []))
  if (ids.length === 0) return
  const rows = await written(
    sql<{ id: string }[]>`delete from platform.blocks where node_id = ${save.node.id} and state = 'draft' and id in ${sql(ids)} returning id`,
    { what: "block", block: deletes[0] },
  )
  const deleted = new Set(rows.map((row) => row.id))
  const missing = ids.find((id) => !deleted.has(id))
  if (missing !== undefined) throw new DraftStopped({ what: "block", block: deletes.find((block) => block.id === missing) ?? deletes[0] }, null)
}

/**
 * Écrit le brouillon (§ Contrat, point 4 ; N18, N19) après `open_draft` (`save.open`, dans la même
 * transaction, quand l'appel n'a lu aucun brouillon) : l'en-tête en attente d'abord
 * (garde du tampon ; dès M02, chaque écriture de bloc avance ce tampon), puis les mises à jour une à une
 * (garde de révision ; révision + 1 sur un changement de contenu seulement), les insertions en une
 * requête, les suppressions en une requête. Dans une seule transaction (E01-S10, AC-x4) : une écriture
 * arrêtée au milieu n'écrit rien, et son refus se dit après l'annulation. Rend le brouillon écrit (ids
 * posés sur les blocs insérés, révisions nouvelles) et son tampon relu ; un brouillon disparu à la
 * relecture (publié entre-temps) est un conflit, jamais un succès (AC25). Appelée hors d'une transaction
 * ouverte, ses refus relisent la base après l'annulation de la sienne ; dans celle d'une création
 * (`write.ts`), aucun conflit n'arrive : le nœud neuf n'est vu de personne avant elle.
 */
export async function saveDraft<B extends DocBlock>(db: PlatformDb, save: DraftSave<B>): Promise<{ blocks: B[]; stamp: string | null }> {
  const plan = planDraftWrites(save.current, save.next)
  try {
    return await db.tx(async (sql) => {
      await writeHeader(sql, save.open ? { ...save, stamp: await save.open() } : save)
      for (const update of plan.updates) await writeUpdate(sql, save, update)
      const inserted = await insertBlocks(sql, save, plan.inserts)
      await deleteBlocks(sql, save, plan.deletes)
      const draft = await loadDraft(db, save.node.id)
      if (!draft) throw new DraftStopped({ what: "draft" }, null)
      return { blocks: plan.next.map((block) => inserted.get(block) ?? block), stamp: draft.stamp }
    })
  } catch (error) {
    // Hors d'une requête de l'écriture (BEGIN, session, COMMIT) : le refus de la base traduit (H04).
    if (!(error instanceof DraftStopped)) throw fromDatabaseError(error as { code?: string }, "blocks: draft write")
    throw error.failure ? await failure(db, save, error.failure, error.conflict) : await conflict(db, save, error.conflict)
  }
}
