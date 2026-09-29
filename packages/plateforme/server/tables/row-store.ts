// Lignes d'un tableau lues et écrites par l'écriture et la file de travail (E07-S02 ; ADR-011 § 2,
// § 3 ; E01-S06 § Contrat, 1 et 7) : blocs `row` publiés du tableau, lus par clé, écrits sous garde de
// révision, sans upsert (N3). Sans ce module, `table.write`, `table.claim` et `table.release` liraient
// et écriraient chacun les blocs `row` à leur façon, garde comprise.
//
// Face SQL (E01-S10, lot c1) : chaque requête passe par `db.tx`, toute valeur liée (AC-x5) ; appelée
// pendant la transaction d'une opération (`table.write`, `table.claim`), elle y lit et y écrit
// (HN-E01S10-7). Elle rend les colonnes que rendait PostgREST, un instant en texte (`to_json`, la forme
// de PostgREST) : le bail et la dernière écriture se lisent comme avant (`leaseEnd`, `waitedSince`).
import type { Database, Json } from "../database"
import type { PlatformDb } from "../db"
import { databaseFailure, inTransaction } from "../errors"
import type { Tx } from "../sql"
import type { RowBlock } from "./meta"
import { utcClock } from "./output"
import { FORMER_MEMBER, leaseEnd } from "./rows"

/** Un bloc `row` publié, avec son identifiant et l'instant de sa dernière écriture. */
export type StoredRow = RowBlock & { id: string; updated_at: string }

type StoredRead = Omit<StoredRow, "key"> & { key: string | null }

type BlockUpdate = Database["platform"]["Tables"]["blocks"]["Update"]

/** Ce qu'écrit toute mise à jour d'une ligne (AC16 : jamais `id`, `node_id`, `state`, `org_id` ni `key`). */
type RowValues = Required<Pick<BlockUpdate, "data" | "provenance" | "revision">> & { updated_by: string }

/** Le bail d'une ligne, posé d'un coup par une réservation et vidé d'un coup par une libération (`23514` sinon). */
type LeaseValues = { claimed_by: string | null; claimed_by_user: string | null; lease_until: string | null }

function stored(row: StoredRead): StoredRow {
  // `blocks_guard` exige la clé d'un `row` : `key` nul n'arrive pas d'un bloc `row` (E01-S06 N8).
  return { ...row, key: row.key ?? "" }
}

/**
 * Les colonnes rendues d'une ligne lue ou écrite, fragment de chaque requête du module : `id` pour la
 * garde de la mise à jour, le bail et la dernière écriture pour la file (N12), en texte.
 */
function storedColumns(sql: Tx) {
  return sql`id, key, data, provenance, revision, claimed_by, claimed_by_user,
             to_json(lease_until) as lease_until, to_json(updated_at) as updated_at`
}

/** Un objet JSON écrit tel quel : `data` et `provenance` fusionnés depuis la base et des arguments validés par Zod. */
export function asJson(value: Record<string, unknown>): Json {
  // Construits à partir de valeurs JSON lues en base ou validées par Zod : du JSON par construction.
  return value as Json
}

/** Les lignes publiées des clés données, en une lecture : une clé part en valeur liée, telle qu'écrite. */
async function readRows(db: PlatformDb, nodeId: string, keys: readonly string[], context: string): Promise<StoredRow[]> {
  const rows = await inTransaction(db, context, (sql) => sql<StoredRead[]>`
      select ${storedColumns(sql)}
        from platform.blocks
       where node_id = ${nodeId} and state = ${"published"} and type = ${"row"} and key = any(${keys})`)
  return rows.map(stored)
}

/** La ligne d'une clé, relue (N2, N3) ; `null` si aucune (unicité : `uq_blocks_node_id_state_key`). */
export async function rowByKey(db: PlatformDb, nodeId: string, key: string): Promise<StoredRow | null> {
  const [row] = await readRows(db, nodeId, [key], "tables: row by key")
  return row ?? null
}

/**
 * Les lignes des clés données (N19 : 50 clés de 200 caractères au plus), en une lecture ; aucune pour
 * une liste vide. Une clé qui porte `"` ou `\` s'y lit telle qu'écrite : une valeur liée ne passe par
 * aucune liste `in` à relire.
 */
export async function rowsByKey(db: PlatformDb, nodeId: string, keys: readonly string[]): Promise<Map<string, StoredRow>> {
  const rows = keys.length === 0 ? [] : await readRows(db, nodeId, keys, "tables: rows by key")
  return new Map(rows.map((row) => [row.key, row]))
}

/** Un bail posé dont l'échéance n'est pas passée (H98) : la ligne est tenue ; échéance lue par `leaseEnd` (E07-S01). */
export function leaseActive(row: RowBlock, now: number): boolean {
  const until = leaseEnd(row)
  return until !== null && until > now
}

/**
 * Une ligne sous le bail actif d'une autre personne (AC18, AC-f4) : `table.write` et `table.delete_rows` la
 * refusent ; un bail expiré ou tenu par l'appelant ne bloque pas. `claimed_by_user` fait foi, pas le libellé (N4).
 */
export function heldByOther(row: RowBlock, userId: string, now: number): boolean {
  return leaseActive(row, now) && row.claimed_by_user !== userId
}

/** « claimed by Claire Morel (worker claude-claire) until 14:05 UTC » : le début du refus d'une ligne tenue ; qui la tient, ou `FORMER_MEMBER`. */
export function claimedBySentence(row: RowBlock, names: ReadonlyMap<string, string>): string {
  const holder = (row.claimed_by_user ? names.get(row.claimed_by_user) : undefined) ?? FORMER_MEMBER
  return `claimed by ${holder} (worker ${row.claimed_by}) until ${utcClock(row.lease_until ?? "")}`
}

/**
 * Les lignes d'un état de la file (`data->>column`), rangées par l'attente (`updated_at`) puis la clé
 * (N12) : `expiredBefore`, celles dont le bail est passé avant cet instant (index
 * `idx_blocks_node_id_lease_until`) ; `limit`, les premières seulement, toutes sans lui. L'ordre se
 * pose sur les colonnes de la table (`blocks.updated_at`) : un nom seul y lirait l'instant rendu en
 * texte sous le même nom, qu'aucun ordre ne range (42883).
 */
export async function queueRows(
  db: PlatformDb,
  nodeId: string,
  queue: { column: string; state: string; expiredBefore?: string; limit?: number },
): Promise<StoredRow[]> {
  const before = queue.expiredBefore ?? null
  const rows = await inTransaction(db, before === null ? "tables: claim waiting rows" : "tables: claim expired leases", (sql) => sql<StoredRead[]>`
      select ${storedColumns(sql)}
        from platform.blocks
       where node_id = ${nodeId} and state = ${"published"} and type = ${"row"}
         and data ->> ${queue.column} = ${queue.state}
         and (${before}::timestamptz is null or lease_until < ${before})
       order by blocks.updated_at, blocks.key
       limit ${queue.limit ?? null}`)
  return rows.map(stored)
}

/**
 * Les lignes que la file servirait encore (fiche D99, M53) : celles du premier état, et celles de l'état de
 * travail dont le bail est passé avant `at`, comptées par la base, comme `table.claim` les prend.
 */
export async function countWaiting(db: PlatformDb, nodeId: string, queue: { column: string; entry: string; working: string; at: string }): Promise<number> {
  const [row] = await inTransaction(db, "tables: claim waiting count", (sql) => sql<{ count: number }[]>`
      select count(*)::int as count
        from platform.blocks
       where node_id = ${nodeId} and state = ${"published"} and type = ${"row"}
         and (data ->> ${queue.column} = ${queue.entry}
              or (data ->> ${queue.column} = ${queue.working} and lease_until < ${queue.at}))`)
  return row?.count ?? 0
}

/**
 * Insertion d'une ligne (AC1, E01-S06 § Contrat, 7) : `{ node_id, state, type, key, data, provenance,
 * created_by, updated_by }`, jamais `id`, `org_id`, `revision` ni le bail, que la base pose ou refuse.
 * Une clé déjà prise rend `duplicate` (N3 : relire, puis écrire en mise à jour) : `on conflict do
 * nothing`, qui n'écrase rien et laisse vivante la transaction de l'appel, qu'une violation d'unicité
 * interromprait. Toute autre erreur de la base après la décision du service est une panne (`internal`,
 * code au log serveur).
 */
export async function insertRow(
  db: PlatformDb,
  row: { nodeId: string; key: string; data: Record<string, unknown>; provenance: Record<string, unknown>; userId: string },
): Promise<StoredRow | "duplicate"> {
  const [inserted] = await db
    .tx(
      (sql) => sql<StoredRead[]>`
        insert into platform.blocks (node_id, state, type, key, data, provenance, created_by, updated_by)
        values (${row.nodeId}, ${"published"}, ${"row"}, ${row.key}, ${sql.json(asJson(row.data))},
                ${sql.json(asJson(row.provenance))}, ${row.userId}, ${row.userId})
        on conflict do nothing
        returning ${storedColumns(sql)}`,
    )
    .catch((error) => {
      throw databaseFailure(error, "tables: insert row", "Internal error.")
    })
  return inserted ? stored(inserted) : "duplicate"
}

/** Une mise à jour qui pose ou vide le bail : celle d'une réservation ou d'une libération. */
function changesLease(values: RowValues | (RowValues & LeaseValues)): values is RowValues & LeaseValues {
  return "lease_until" in values
}

/**
 * Mise à jour d'une ligne gardée par la révision lue (N2, `security-patterns.md § Idempotence`), plus
 * `claimed_by` pour une libération (AC24) ; `null` quand aucune ligne n'est écrite : elle a changé
 * entre-temps. Jamais `id`, `node_id`, `state`, `org_id` ni `key` dans les valeurs (AC16) ; le bail
 * seulement s'il change. `skipLocked` : une ligne qu'une autre transaction tient encore est passée comme
 * une ligne changée, sans l'attendre (une réservation, M32) : `table.write` prend ses lignes dans l'ordre
 * de l'appel, `table.claim` dans celui de la file, et deux transactions qui s'attendraient l'une l'autre
 * sur ces lignes s'interbloqueraient (`40P01`).
 */
export async function updateRow(
  db: PlatformDb,
  row: Pick<StoredRow, "id" | "revision">,
  values: RowValues | (RowValues & LeaseValues),
  guard: { claimedBy?: string; skipLocked?: boolean } = {},
): Promise<StoredRow | null> {
  const worker = guard.claimedBy ?? null
  const written = await db
    .tx((sql) => {
      // Le bail posé ou vidé d'un coup, ou pas nommé du tout.
      const lease = changesLease(values)
        ? sql`, claimed_by = ${values.claimed_by}, claimed_by_user = ${values.claimed_by_user}, lease_until = ${values.lease_until}`
        : sql``
      // La ligne prise par la sous-requête avant la mise à jour, ou aucune si une autre transaction la tient.
      const target = guard.skipLocked ? sql`(select b.id from platform.blocks b where b.id = ${row.id} for update skip locked)` : sql`${row.id}`
      return sql<StoredRead[]>`
        update platform.blocks
           set data = ${sql.json(values.data)}, provenance = ${sql.json(values.provenance)}, revision = ${values.revision},
               updated_by = ${values.updated_by}${lease}
         where id = ${target} and state = ${"published"} and revision = ${row.revision}
           and (${worker}::text is null or claimed_by = ${worker})
        returning ${storedColumns(sql)}`
    })
    .catch((error) => {
      throw databaseFailure(error, "tables: update row", "Internal error.")
    })
  const [updated] = written
  return updated ? stored(updated) : null
}
