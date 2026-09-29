// @vitest-environment node
// Le contenu entre deux organisations (E09-S05 : AC11, AC12 ; ADR-011, E01-S06) : tout le contenu est
// dans `blocks`, lu et écrit sous la RLS d'isolation, et trois fonctions `security definer` y touchent
// sans elle (`open_draft`, `publish_node`, `search_content`) : la boucle par table ne les voit pas, elles
// se jouent ici, par un appel de fonction, sous la session de `a` (membre et administratrice d'A
// seulement), de `p` (accès plateforme à A seulement), de `c` (administratrice d'A et de B) et d'`anon`.
// Données : A et B de `donnees.ts` ; B relue par la connexion d'administration, inchangée. Depuis E01-S10
// f2, par la face SQL (`clientOf`, `withAnonSession`), plus par PostgREST.
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import type { PlatformDb } from "../../../packages/plateforme/server/db"
import { withAnonSession, type Tx } from "../../../packages/plateforme/server/sql"
import { DISCARD_DRAFT_VERSION, pendingMigrations } from "../../helpers/pending-migrations"
import { SKIP_REASON, supabaseConfigured } from "../../helpers/plateforme"
import { SQL_SKIP_REASON, sqlConfigured } from "../../helpers/sql"
import { MARKERS, preparer, type Isolation, type Row, type Who } from "./donnees"

const SETUP_TIMEOUT = 300_000
const NETWORK_TIMEOUT = 120_000
const configured = supabaseConfigured && sqlConfigured
const SUITE = "isolation of the content: blocks and search"
/** `discard_draft` (E11-S02) pas encore appliquée au projet : son refus ne se joue pas (`database-patterns.md § Règles`). */
const discardPending = (await pendingMigrations()).includes(DISCARD_DRAFT_VERSION)

/** Les marqueurs de B cherchés (AC12) : un titre, un mot d'un bloc publié, la clé d'une ligne. */
const QUERIES = { title: "ZZ Marqueur", block: MARKERS.page.word, row: MARKERS.row.key } as const

type Hit = { node_id: string; match: string; block_type: string | null; block_key: string | null }

/** Les lignes rendues, ou le code de l'erreur de la base. */
function rowsOrError<T>(run: Promise<readonly T[]>): Promise<T[] | { code: string }> {
  return run.then(
    (rows) => [...rows],
    (error: { code?: string }) => ({ code: error.code ?? "no code" }),
  )
}

describe.skipIf(!configured)(
  configured ? SUITE : `${SUITE} (${supabaseConfigured ? SQL_SKIP_REASON : SKIP_REASON})`,
  { timeout: NETWORK_TIMEOUT },
  () => {
    let data: Isolation & { nettoyer: () => Promise<void> }
    let nodesOfB: Set<string>
    let pageOfA: string
    let before: Record<string, Row[]>

    beforeAll(async () => {
      data = await preparer()
      nodesOfB = new Set((await data.scopeOf(data.b.id)).parents.nodes)
      pageOfA = await data.fx.nodeId(data.a.id, "conseil/grille_tarifaire")
      before = await data.snapshot(data.b.id)
    }, SETUP_TIMEOUT)

    afterAll(async () => {
      await data?.nettoyer()
    }, SETUP_TIMEOUT)

    /** Le nombre de lignes rendues, ou le code de l'erreur de la base. */
    const rowsOrCode = async (run: Promise<readonly unknown[]>) => {
      const answer = await rowsOrError(run)
      return Array.isArray(answer) ? `${answer.length} rows` : answer.code
    }
    /** Le code de l'erreur de la base, ou « no error ». */
    const codeOf = async (run: Promise<unknown>) =>
      run.then(
        () => "no error",
        (error: { code?: string }) => error.code ?? "no code",
      )

    /** Les cinq gestes d'AC11 sous la session de `who`, dans l'ordre : ce que chacun rend. */
    async function attempts(who: Who) {
      const db = data.clientOf(who)
      const me = data.people[who].id
      const { page, draftBlock, publishedBlock, table, tableRow } = data.ids
      const insert = (row: Row) => db.tx((sql) => sql`insert into platform.blocks ${sql(row)}`)
      const all = await rowsOrError(db.tx((sql) => sql<Row[]>`select id, state, org_id, node_id from platform.blocks`))
      const filtered = db.tx((sql) => sql`select id, state from platform.blocks where node_id = any(${[...nodesOfB]}::uuid[])`)
      const targets = [
        { id: publishedBlock, state: "published" },
        { id: draftBlock, state: "draft" },
        { id: tableRow, state: "published" },
      ]
      const updates = []
      for (const target of targets) {
        updates.push(await rowsOrCode(db.tx((sql) => sql`update platform.blocks set text = 'Intrus.' where id = ${target.id} and state = ${target.state} returning id`)))
      }
      const deletions = []
      for (const target of targets) {
        deletions.push(await rowsOrCode(db.tx((sql) => sql`delete from platform.blocks where id = ${target.id} and state = ${target.state} returning id`)))
      }
      return {
        read: Array.isArray(all) ? all.filter((row) => row.org_id === data.b.id || nodesOfB.has(String(row.node_id))).length : all.code,
        readOfB: await rowsOrCode(filtered),
        draftInB: await codeOf(insert({ node_id: page, state: "draft", position: 50_000, type: "paragraph", text: "Intrus.", created_by: me })),
        rowInB: await codeOf(insert({ node_id: table, state: "published", type: "row", key: "T-999", data: { ref: "T-999" }, created_by: me })),
        orgOfB: await codeOf(insert({ node_id: pageOfA, org_id: data.b.id, state: "draft", position: 50_000, type: "paragraph", text: "Ailleurs.", created_by: me })),
        updates,
        deletions,
        openDraft: await codeOf(db.tx((sql) => sql`select * from platform.open_draft(${page})`)),
        publish: await codeOf(db.tx((sql) => sql`select platform.publish_node(${page}, 1, null::jsonb)`)),
        // E11-S02 (AC-h4) : abandonner le brouillon d'un nœud de B, refusé par la fonction elle-même ; sauté tant
        // que sa migration manque au projet (`database-patterns.md § Règles`).
        ...(discardPending ? {} : { discard: await codeOf(db.tx((sql) => sql`select platform.discard_draft(${page}, null::timestamptz)`)) }),
      }
    }

    it("should keep every block of B, published or draft, from a and from p, and refuse their writes and the two content functions (AC11)", async () => {
      const refused = {
        read: 0,
        readOfB: "0 rows",
        draftInB: "23503",
        rowInB: "23503",
        orgOfB: "23514",
        updates: ["0 rows", "0 rows", "0 rows"],
        deletions: ["0 rows", "0 rows", "0 rows"],
        openDraft: "42501",
        publish: "42501",
        ...(discardPending ? {} : { discard: "42501" }),
      }
      expect({ a: await attempts("a"), p: await attempts("p") }).toEqual({ a: refused, p: refused })
      // Blocs, ligne du tableau, brouillon (`node_drafts`) et historique (`node_versions`) de B : identiques.
      expect(await data.snapshot(data.b.id)).toEqual(before)
    })

    it("should refuse search_content on B to a, p and anon, find no node of B from A, and find each marker on B (AC12)", async () => {
      const searchIn = (sql: Tx, org: string, query: string) => sql<Hit[]>`select * from platform.search_content(p_org => ${org}, p_query => ${query})`
      /** Les lignes de `search_content` sous la session donnée, ou le code de son refus. */
      const answered = async (run: Promise<readonly Hit[]>): Promise<Hit[] | string> => {
        const answer = await rowsOrError(run)
        return Array.isArray(answer) ? answer : answer.code
      }
      const search = (db: PlatformDb, org: string, query: string) => answered(db.tx((sql) => searchIn(sql, org, query)))
      const [a, c, p] = [data.clientOf("a"), data.clientOf("c"), data.clientOf("p")]
      const onB = await Promise.all([
        search(a, data.b.id, QUERIES.title),
        search(p, data.b.id, QUERIES.title),
        answered(withAnonSession((sql) => searchIn(sql, data.b.id, QUERIES.title))),
      ])
      expect(onB).toEqual(["42501", "42501", "42501"])

      const markers = [
        { query: QUERIES.title, found: { node_id: data.ids.page, match: "title" } },
        { query: QUERIES.block, found: { node_id: data.ids.page, match: "block", block_type: "paragraph" } },
        { query: QUERIES.row, found: { node_id: data.ids.suivi, match: "block", block_type: "row", block_key: MARKERS.row.key } },
      ]
      for (const { query, found } of markers) {
        // Le repli en OU de la recherche peut rendre des lignes d'A : seules celles de B seraient une fuite (HN-E09S05-7).
        for (const [who, db] of [["a", a], ["c", c]] as const) {
          const hits = await search(db, data.a.id, query)
          expect(typeof hits === "string" ? hits : hits.filter((hit) => nodesOfB.has(hit.node_id)), `${who} on A, « ${query} »`).toEqual([])
        }
        // Le même terme trouve B sur B : son absence côté A prouve donc quelque chose (HN-E09S05-7).
        const onItsOrg = await search(c, data.b.id, query)
        expect(typeof onItsOrg === "string" ? onItsOrg : onItsOrg.filter((hit) => !nodesOfB.has(hit.node_id)), `c on B, « ${query} »: B only`).toEqual([])
        expect(onItsOrg, `c on B, « ${query} »`).toContainEqual(expect.objectContaining(found))
      }
    })
  },
)
