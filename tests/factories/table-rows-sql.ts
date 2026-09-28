// Les lignes des tableaux de la fixture sur une vraie base (E01-S10, lot t1-c1a) : ce que la base simulée
// d'E07-S01 et d'E07-S02 refaisait à chaque cas (`fixtureDb(tables)`, `writableDb(tables, hook)`,
// `liveTables`), sur une graine par fichier (`seedTableFixture`, lot t1-0). Un cas pose les lignes des
// tableaux de O qu'il lit ou écrit (`use` : celles d'une base simulée de la fixture, `fixtureTables` ou
// ses variantes des tests ; `database` : les mêmes, et l'espion de ses requêtes ; `useRows` : des
// prospects, gardés d'un cas à l'autre quand aucun n'écrit), relit une ligne par la connexion
// d'administration (`row`, `rows`, en valeurs simulées) et joue une écriture concurrente juste avant une
// mise à jour du service (`bumpBeforeUpdate`, crochet de `dbSpy`), ou des écritures retenues jusqu'à ce
// qu'elles partent ensemble (`crossing`) ; `clientOf` donne le client de la personne d'une identité.
// Ces suites sont portables (`sqlConfigured` et `portable` de `tests/helpers/sql.ts`) : sur le projet
// comme sur le Postgres nu du job `bare-postgres` (E01-S10 f2).
import type { PlatformDb } from "../../packages/plateforme/server/db"
import type { Identity } from "../../packages/plateforme/server/identity"
import type { RowBlock } from "../../packages/plateforme/server/tables/meta"
import { nodeId } from "../helpers/reference-org"
import { keysOf, type ReferenceOrgSql } from "../helpers/reference-org-sql"
import type { Row, Tables } from "../helpers/simulated-db"
import { dbSpy, type DbSpy, type SpiedCall, type SpyHook } from "../helpers/spy-t1-c1a"
import type { SeededData } from "../helpers/sql"
import { fixtureTables, PROSPECTS, TICKETS } from "./table-fixture"

/** Une graine (`seedTableFixture`) et ses comptes de session ; son ménage, tables et comptes. */
export const SEED_TIMEOUT = 180_000
/** Un cas : une dizaine de requêtes par appel d'une fonction, et les lignes qu'il pose. */
export const CASE_TIMEOUT = 60_000
/** Un cas qui pose un tableau de plus de 5 000 lignes. */
export const BIG_TABLE_TIMEOUT = 120_000

/** Les tableaux de O dont les tests posent et écrivent les lignes. */
const ROW_TABLES = [PROSPECTS.path, TICKETS.path]

/** Le client de la personne qu'une identité de `ref.identityOf` désigne, sous l'espion s'il y en a un. */
export async function clientOf(ref: ReferenceOrgSql, identity: Identity, spy?: DbSpy): Promise<PlatformDb> {
  const person = keysOf(ref.people).find((key) => ref.people[key].id === identity.user.id)
  if (!person) throw new Error(`clientOf: ${identity.user.id} is not a person of the fixture`)
  const db = await ref.db(person)
  return spy ? spy.wrap(db) : db
}

/**
 * Crochet de `dbSpy` : les `count` premières écritures `op` de lignes (`blocks`) sont retenues jusqu'à ce
 * qu'elles soient toutes prêtes, puis partent ensemble. Des écritures lancées par `Promise.all` se
 * croisent ainsi toujours, comme sur la base simulée, où leurs requêtes alternaient ; sans lui, un appel
 * dont le client s'ouvre plus tard écrit après les autres, et la course n'a pas lieu.
 */
export function crossing(count: number, op: "insert" | "update"): SpyHook {
  const held: (() => void)[] = []
  return (call) => {
    if (call.op !== op || !call.tables.includes("blocks") || held.length >= count) return undefined
    return new Promise<void>((release) => {
      held.push(release)
      if (held.length === count) held.forEach((go) => go())
    })
  }
}

/** Les lignes des tableaux de la fixture, sur la graine d'un fichier. */
export function fixtureRows(seed: SeededData, ref: ReferenceOrgSql) {
  /** Les prospects que `useRows` a posés, tant qu'aucune autre écriture de lignes par la fixture ne les a remplacés. */
  let placed: readonly RowBlock[] | null = null
  const rows = async (key: string, path: string): Promise<Row[]> => {
    const found = await seed.admin<Row[]>`
      select id, state, org_id, node_id, position, type, text, data, key, provenance, revision, claimed_by,
             claimed_by_user, lease_until, created_by, updated_by, created_at, updated_at
        from platform.blocks where node_id = ${ref.nodeId(path)} and key = ${key} order by id`
    return ref.readable([...found])
  }
  /** Les lignes des tableaux de O remplacées par celles de `tables`, une base simulée de la fixture (la graine y est). */
  const place = async (tables: Tables = fixtureTables()): Promise<void> => {
    placed = null
    const simulated = new Set(ROW_TABLES.map(nodeId))
    await seed.admin`delete from platform.blocks where node_id in ${seed.admin(ROW_TABLES.map(ref.nodeId))} and type = 'row'`
    await ref.write({ blocks: tables.blocks.filter((row) => simulated.has(String(row.node_id))) })
  }
  return {
    use: place,
    /** Les lignes de `tables` posées (`use`), puis l'espion des requêtes d'un cas sous le crochet `before` : ce que rendait `writableDb`. */
    async database(tables: Tables = fixtureTables(), before?: SpyHook): Promise<DbSpy> {
      await place(tables)
      return dbSpy(before)
    },
    /**
     * Les prospects remplacés par `given`, les tickets de la fixture ; rien quand ce même tableau est déjà
     * posé. Pour un fichier dont aucun cas n'écrit de ligne : une écriture du service ne se voit pas ici.
     */
    async useRows(given: readonly RowBlock[]): Promise<void> {
      if (given === placed) return
      await place(fixtureTables([], given))
      placed = given
    },
    /** Les lignes d'une clé (une au plus : `uq_blocks_node_id_state_key`), relues par la connexion d'administration, en valeurs simulées. */
    rows: (key: string, path: string = PROSPECTS.path) => rows(key, path),
    /** La ligne d'une clé, comme `rows` ; `undefined` sans ligne. */
    row: async (key: string, path: string = PROSPECTS.path): Promise<Row | undefined> => (await rows(key, path)).at(0),
    /**
     * Crochet de `dbSpy` : une autre écriture passe juste avant chaque mise à jour de ligne du service (la
     * révision de la ligne visée avance), comme le crochet de `writableDb`. La ligne visée se lit parmi les
     * paramètres de l'instruction.
     */
    async bumpBeforeUpdate(call: SpiedCall): Promise<void> {
      if (call.op !== "update" || !call.tables.includes("blocks")) return
      const ids = [call.values].flat(2).filter((value): value is string => typeof value === "string")
      if (ids.length === 0) return
      await seed.admin`
        update platform.blocks set revision = revision + 1
         where node_id in ${seed.admin(ROW_TABLES.map(ref.nodeId))} and id::text in ${seed.admin(ids)} and state = 'published'`
    },
  }
}

export type FixtureRows = ReturnType<typeof fixtureRows>
