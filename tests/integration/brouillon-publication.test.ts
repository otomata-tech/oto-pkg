// @vitest-environment node
// Brouillon et publication (E01-S06 : AC12 à AC20) : `open_draft` et `publish_node` sous la session de
// chaque personne, l'en-tête en attente (`node_drafts`), l'instantané (`node_versions`), les liens,
// `rules_version`. Chaque cas qui consomme un brouillon travaille sur une page à lui. Depuis E01-S08, la
// RLS n'isole que les organisations : les lectures cachées par niveau (en-tête en attente, liens,
// versions) sont retirées (HN-E01S08-9) ; `open_draft`, `publish_node` et les privilèges restent.
// Reçoit les blocs (E01-S06 : AC6 à AC11) de `blocs-rls.test.ts` (M11b), même organisation de
// référence : forme, clé, garde, verrou du brouillon et invariants de la policy, un cas par règle. Le
// verdict de la base sur chaque forme de bloc et chaque clé est prouvé par `blocs-zod.test.ts`.
// Suite portable depuis E01-S10 f2 : chaque personne par sa session (`fx.as`), sans PostgREST ni
// Supabase Auth ; le job `bare-postgres` la joue. Le statut HTTP d'un `PT409` (409), que rendait
// PostgREST, est celui de `fromDatabaseError` (`tests/unit/sql-session.test.ts`, AC-a5).
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import type { Json } from "../../packages/plateforme/server/database"
import type { PlatformDb } from "../../packages/plateforme/server/db"
import type { Tx } from "../../packages/plateforme/server/sql"
import { hex } from "../helpers/plateforme"
import { codeOf, createSqlFixtures, SQL_SKIP_REASON, sqlConfigured, type SqlFixtures, type SqlReferenceOrg, type TestSql } from "../helpers/sql"
import { privateFolderPending, privateFolderSuite } from "../helpers/pending-migrations"

// Ces tests supposent le dossier `private` en base (fiche D107) : sautés, la version nommée, tant que
// 20260928120000 n'est pas appliquée au projet (`database-patterns.md § Règles`).
const privatePending = await privateFolderPending()

const NETWORK_TIMEOUT = 60_000
const SETUP_TIMEOUT = 180_000
const SUITE = "draft and publication"

type BlockRow = { id: string; type: string; position: number | null; text: string | null; data: unknown; key: string | null; provenance: unknown; revision: number }
// Les personnes dont un cas se sert (M11b) : Léa écrit, Claire publie, Ada administre, Marc lit.
type Who = "lea" | "claire" | "ada" | "marc"

const pick = ({ id, type, position, text, data, key, revision }: BlockRow) => ({ id, type, position, text, data, key, revision })

const TABLE_META: Json = { columns: [{ name: "ref", type: "text" }, { name: "statut", type: "text" }], key: "ref" }
const UNKNOWN_NODE = "00000000-0000-4000-8000-000000000000"

/** Une ligne `blocks` : `org_id` est posé par `blocks_guard` depuis le nœud (N9) ; `data` est pris tel quel, forme invalide comprise, pour que la base la juge. */
function blockValues(sql: Tx | TestSql, fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).map(([column, value]) => [column, (column === "data" || column === "provenance") && value !== null ? sql.json(JSON.parse(JSON.stringify(value))) : value]),
  )
}

describe.skipIf(!sqlConfigured || privatePending)(privateFolderSuite(sqlConfigured ? SUITE : `${SUITE} (${SQL_SKIP_REASON})`, privatePending), { timeout: NETWORK_TIMEOUT }, () => {
  let fx: SqlFixtures
  let o: SqlReferenceOrg

  const as = (who: Who): PlatformDb => fx.as(o.people[who])

  /** Une page de Ventes à elle, publiée en révision 1 avec `count` paragraphes. */
  async function publishedPage(count = 2, parentId = o.nodes.ventes, prefix = "ventes"): Promise<string> {
    const page = await fx.createNode(o.org.id, { parentId, path: `${prefix}/page_${hex(3)}`, title: "Page" })
    await fx.publishBlocks(
      page,
      Array.from({ length: count }, (_, index) => ({ type: "paragraph" as const, text: `Bloc ${index + 1}.` })),
    )
    return page
  }

  const selectBlocks = (sql: Tx | TestSql, nodeId: string, state: "draft" | "published") =>
    sql<BlockRow[]>`select * from platform.blocks where node_id = ${nodeId} and state = ${state} order by position, id`
  const blocksOf = (nodeId: string, state: "draft" | "published") => selectBlocks(fx.admin, nodeId, state)

  const nodeRow = async (nodeId: string) =>
    (await fx.admin<{ revision: number; meta: unknown }[]>`select title, summary, kind, meta, status, revision, updated_by from platform.nodes where id = ${nodeId}`)[0]

  const hasDraft = async (nodeId: string) => (await fx.admin`select node_id from platform.node_drafts where node_id = ${nodeId}`).length === 1

  const openDraft = (who: Who, nodeId: string) =>
    as(who).tx((sql) => sql<{ base_revision: number; created: boolean }[]>`select * from platform.open_draft(${nodeId})`)

  const publish = (who: Who, nodeId: string, base: number, links?: Json) =>
    as(who)
      .tx((sql) => sql<{ revision: number }[]>`select platform.publish_node(${nodeId}, ${base}, ${links === undefined ? null : sql.json(links)}::jsonb) as revision`)
      .then(([row]) => row.revision)

  /** Un bloc de brouillon écrit sous la session de la personne. */
  const insertBlock = (who: Who, fields: Record<string, unknown>) =>
    as(who).tx((sql) => sql<{ id: string; type: string; revision: number; org_id: string }[]>`insert into platform.blocks ${sql(blockValues(sql, fields))} returning id, type, revision, org_id`)

  const updateHeader = (who: Who, nodeId: string, patch: Record<string, string>) =>
    as(who).tx((sql) => sql`update platform.node_drafts set ${sql(patch)} where node_id = ${nodeId} returning node_id`)

  beforeAll(async () => {
    fx = createSqlFixtures()
    o = await fx.buildReferenceOrg()
  }, SETUP_TIMEOUT)

  afterAll(async () => {
    await fx?.cleanup()
  }, SETUP_TIMEOUT)

  describe("open_draft (AC12)", () => {
    it("should open the draft once, copying the published blocks under the same ids", async () => {
      const page = await publishedPage(4)
      expect(await openDraft("lea", page)).toEqual([{ base_revision: 1, created: true }])
      const published = await blocksOf(page, "published")
      expect((await as("lea").tx((sql) => selectBlocks(sql, page, "draft"))).map(pick)).toEqual(published.map(pick))
      expect(await openDraft("lea", page)).toEqual([{ base_revision: 1, created: false }])
      expect(await blocksOf(page, "draft")).toHaveLength(4)
    })

    it("should copy no row when the draft of a table opens", async () => {
      const table = await fx.createNode(o.org.id, { parentId: o.nodes.ventes, path: `ventes/table_${hex(3)}`, kind: "table", title: "Table" })
      await fx.publishBlocks(table, [], { meta: TABLE_META })
      await fx.addRows(table, [{ key: "P-001", data: { ref: "P-001" } }, { key: "P-002", data: { ref: "P-002" } }])
      expect(await openDraft("claire", table)).toEqual([{ base_revision: 1, created: true }])
      expect(await blocksOf(table, "draft")).toEqual([])
      expect(await blocksOf(table, "published")).toHaveLength(2)
    })

    // Le droit d'écrire est décidé par le service avant l'appel depuis E01-S12 partie c (ADR-012 § 3) ;
    // la fonction garde l'isolation : un nœud hors des organisations de l'appelant, ou inconnu, est refusé.
    it("should refuse an unknown node (42501)", async () => {
      expect(await codeOf(openDraft("lea", UNKNOWN_NODE))).toBe("42501")
    })

    it("should drop a draft block left without its mark when a draft opens (N5)", async () => {
      const page = await publishedPage(1)
      await fx.admin`insert into platform.blocks (node_id, state, position, type, text) values (${page}, 'draft', 5000, 'paragraph', 'Orphelin.')`
      await openDraft("lea", page)
      const drafts = await blocksOf(page, "draft")
      expect(drafts.map((block) => block.text)).toEqual(["Bloc 1."])
    })
  })

  describe("pending header (AC13)", () => {
    let page: string

    beforeAll(async () => {
      page = await publishedPage()
      await openDraft("lea", page)
    }, SETUP_TIMEOUT)

    it("should let Léa change the pending title, summary and kind, updated_at following", async () => {
      const [before] = await as("lea").tx((sql) => sql<{ updated_at: Date }[]>`select updated_at from platform.node_drafts where node_id = ${page}`)
      const updated = await as("lea").tx(
        (sql) => sql<{ updated_at: Date }[]>`
          update platform.node_drafts set title = 'Relancer un devis', summary = 'Relance les devis en attente.', kind = 'procedure', updated_by = ${o.people.lea.id}
          where node_id = ${page} returning title, summary, kind, updated_at`,
      )
      expect(updated).toEqual([expect.objectContaining({ title: "Relancer un devis", summary: "Relance les devis en attente.", kind: "procedure" })])
      expect(updated[0].updated_at.getTime()).toBeGreaterThan(before.updated_at.getTime())
    })

    // Un genre refusé et un titre trop long : `kind context` et le titre blanc, mêmes contraintes,
    // sont retirés (M11b).
    it.each([
      ["kind table", { kind: "table" }],
      ["a title of 201 characters", { title: "t".repeat(201) }],
    ])("should refuse %s (23514)", async (_case, patch) => {
      expect(await codeOf(updateHeader("lea", page, patch))).toBe("23514")
    })

    it("should refuse Léa inserting or deleting a node_drafts row (42501)", async () => {
      const inserted = as("lea").tx((sql) => sql`insert into platform.node_drafts (node_id, base_revision) values (${o.nodes.devis}, 0)`)
      expect(await codeOf(inserted)).toBe("42501")
      const deleted = as("lea").tx((sql) => sql`delete from platform.node_drafts where node_id = ${page}`)
      expect(await codeOf(deleted)).toBe("42501")
      expect(await hasDraft(page)).toBe(true)
    })
  })

  describe("publish_node refusals (AC14)", () => {
    /** Une page publiée en révision 1, son brouillon ouvert par Claire. */
    async function openedPage(): Promise<string> {
      const page = await publishedPage(1)
      await openDraft("claire", page)
      return page
    }

    /** Rien n'a bougé : révision 1, brouillon ouvert, aucune version 2. */
    async function expectUnpublished(page: string) {
      expect((await nodeRow(page)).revision).toBe(1)
      expect(await hasDraft(page)).toBe(true)
      expect(await fx.admin`select revision from platform.node_versions where node_id = ${page}`).toEqual([{ revision: 1 }])
    }

    it("should refuse a node without a draft (55000)", async () => {
      const page = await publishedPage()
      expect(await codeOf(publish("claire", page, 1))).toBe("55000")
    })

    it("should refuse a pending meta on a page (22023)", async () => {
      const page = await openedPage()
      await as("claire").tx((sql) => sql`update platform.node_drafts set meta = ${sql.json({ columns: [] })} where node_id = ${page}`)
      expect(await codeOf(publish("claire", page, 1))).toBe("22023")
      await expectUnpublished(page)
    })

    // Un bloc d'un autre nœud : les autres formes refusées (objet, 1 001 liens, chemin ou clé
    // malformés) passent par le même contrôle de `publish_node` et sont retirées (M11b).
    it("should refuse links given as a block of another node (22023), publishing nothing", async () => {
      const page = await openedPage()
      const foreign = (await blocksOf(await publishedPage(1), "published"))[0].id
      expect(await codeOf(publish("claire", page, 1, [{ block_id: foreign, path: "ventes/suivi" }]))).toBe("22023")
      await expectUnpublished(page)
    })
  })

  describe("publishing a document (AC15)", () => {
    it("should publish the draft: same ids, pending header, revision 2, snapshot, no draft left", async () => {
      const page = await publishedPage(3)
      const [first, second, third] = await blocksOf(page, "published")
      await openDraft("lea", page)
      await as("lea").tx(
        (sql) => sql`update platform.blocks set text = 'Bloc 1 modifié.', revision = 2 where id = ${first.id} and state = 'draft' and revision = 1 returning id`,
      )
      const added = await insertBlock("lea", { node_id: page, state: "draft", position: 5000, type: "callout", text: "Ajouté.", created_by: o.people.lea.id })
      await as("lea").tx((sql) => sql`delete from platform.blocks where id = ${third.id} and state = 'draft' returning id`)
      await as("lea").tx((sql) => sql`update platform.node_drafts set title = 'Titre publié', summary = 'Résumé publié.' where node_id = ${page}`)

      expect(await publish("claire", page, 1)).toBe(2)

      const blocks = await blocksOf(page, "published")
      expect(blocks.map((block) => block.id)).toEqual([first.id, second.id, added[0].id])
      expect(blocks.map((block) => [block.text, block.revision])).toEqual([["Bloc 1 modifié.", 2], ["Bloc 2.", 1], ["Ajouté.", 1]])
      expect(await blocksOf(page, "draft")).toEqual([])
      expect(await hasDraft(page)).toBe(false)
      expect(await nodeRow(page)).toMatchObject({ status: "published", revision: 2, title: "Titre publié", summary: "Résumé publié.", updated_by: o.people.claire.id })

      const [version] = await fx.admin<{ blocks: unknown }[]>`select * from platform.node_versions where node_id = ${page} and revision = 2`
      expect(version).toMatchObject({ title: "Titre publié", summary: "Résumé publié.", kind: "page", meta: {}, author: o.people.claire.id })
      expect(version.blocks).toEqual(
        blocks.map(({ id, type, position, key, text, data, provenance, revision }) => ({ id, type, position, key, text, data, provenance, revision })),
      )
    })

    it("should publish a never-published page at revision 1", async () => {
      const page = await fx.createNode(o.org.id, { parentId: o.nodes.ventes, path: `ventes/neuve_${hex(3)}`, title: "Neuve" })
      await openDraft("claire", page)
      await insertBlock("claire", { node_id: page, state: "draft", position: 1024, type: "paragraph", text: "Premier.", created_by: o.people.claire.id })
      expect(await publish("claire", page, 0)).toBe(1)
      expect(await nodeRow(page)).toMatchObject({ status: "published", revision: 1 })
    })
  })

  describe("publishing a table (AC16)", () => {
    it("should apply the pending meta, keep the rows, and snapshot the meta without any block", async () => {
      const table = await fx.createNode(o.org.id, { parentId: o.nodes.ventes, path: `ventes/suivi_${hex(3)}`, kind: "table", title: "Suivi" })
      const { revision } = await fx.publishBlocks(table, [], { meta: TABLE_META })
      await fx.addRows(table, [{ key: "P-001", data: { ref: "P-001", statut: "à traiter" } }])
      const rowsBefore = await blocksOf(table, "published")
      const meta: Json = { columns: [{ name: "ref", type: "text" }, { name: "statut", type: "enum", options: ["à traiter", "qualifié"] }], key: "ref" }
      await openDraft("claire", table)
      await as("claire").tx((sql) => sql`update platform.node_drafts set meta = ${sql.json(meta)} where node_id = ${table}`)
      expect(await publish("claire", table, revision)).toBe(revision + 1)
      expect((await nodeRow(table)).meta).toEqual(meta)
      expect(await blocksOf(table, "published")).toEqual(rowsBefore)
      const version = await fx.admin`select meta, blocks from platform.node_versions where node_id = ${table} and revision = ${revision + 1}`
      expect(version).toEqual([{ meta, blocks: [] }])
    })
  })

  describe("simultaneous publications (AC17)", () => {
    // `PT409` et non `40001` (N36) : un client qui rejoue une transaction en 40001 (PostgREST le faisait)
    // rejouerait sans fin. La publication qui perd bute sur la garde d'une révision de base périmée : le cas
    // « stale base revision », même garde, y est réuni (M11b).
    it("should let one of two publications on the same base through, and refuse the other (PT409)", async () => {
      const page = await publishedPage()
      await openDraft("claire", page)
      const results = await Promise.all(
        [publish("claire", page, 1), publish("ada", page, 1)].map((publication) =>
          publication.then(
            (revision) => revision,
            (error: { code?: string }) => error.code,
          ),
        ),
      )
      expect(results.map(String).sort()).toEqual(["2", "PT409"])
      expect(await fx.admin`select revision from platform.node_versions where node_id = ${page} order by revision`).toEqual([{ revision: 1 }, { revision: 2 }])
    })
  })

  // Tâche M02 (E01-S06 N5 et N36, E03-S03 N46) : une écriture du brouillon passe entière dans la
  // publication ou est refusée (PT409), jamais perdue ; le tampon du brouillon (`updated_at`) suit
  // chaque écriture, et une publication sur un tampon périmé est refusée.
  describe("draft under lock and draft stamp (M02)", () => {
    it("should publish exactly the draft writes that passed, the others refused (PT409), writing while publishing", async () => {
      // Une page longue, pour une publication qui dure ; les connexions du pool ouvertes d'avance, pour que
      // les écritures arrivent ensemble en base (droits-noeuds.test.ts, écritures simultanées de l'arbre).
      const page = await publishedPage(120)
      const published = await blocksOf(page, "published")
      await openDraft("lea", page)
      await Promise.all(Array.from({ length: 12 }, () => as("lea").tx((sql) => sql`select node_id from platform.node_drafts where node_id = ${page}`)))
      const updated = published.slice(0, 8)
      const deleted = published.slice(8, 10)
      const inserted = ["Ajout 1.", "Ajout 2."]
      /** Une écriture passée rend sa ligne (`true`) ; une écriture refusée, son code. */
      const outcome = (write: Promise<readonly unknown[]>) =>
        write.then(
          (rows) => rows.length === 1,
          (error: { code?: string }) => error.code ?? "no code",
        )
      const [revision, ...passed] = await Promise.all([
        publish("claire", page, 1),
        ...updated.map((block) =>
          outcome(as("lea").tx((sql) => sql`update platform.blocks set text = ${`${block.text} Relu.`} where id = ${block.id} and state = 'draft' returning id`)),
        ),
        ...inserted.map((text, index) =>
          outcome(insertBlock("lea", { node_id: page, state: "draft", position: 200_000 + index, type: "paragraph", text, created_by: o.people.lea.id })),
        ),
        ...deleted.map((block) => outcome(as("lea").tx((sql) => sql`delete from platform.blocks where id = ${block.id} and state = 'draft' returning id`))),
      ])
      expect(revision).toBe(2)
      // Une écriture refusée rend PT409, ou aucune ligne quand son bloc de brouillon était déjà publié et effacé.
      expect(passed.filter((result) => typeof result === "string" && result !== "PT409")).toEqual([])
      const texts = new Set((await blocksOf(page, "published")).map((block) => block.text))
      expect([
        ...updated.map((block) => texts.has(`${block.text} Relu.`)),
        ...inserted.map((text) => texts.has(text)),
        ...deleted.map((block) => !texts.has(block.text)),
      ]).toEqual(passed.map((result) => result === true))
      expect([await blocksOf(page, "draft"), await hasDraft(page)]).toEqual([[], false])
    })

    it("should advance the draft stamp at each draft write, and refuse a publication on a stale stamp (PT409)", async () => {
      const page = await publishedPage(1)
      await openDraft("claire", page)
      // En texte, à la microseconde, passé en texte (`::text::timestamptz`, comme `server/nodes/publish.ts`) :
      // une `Date`, ou le texte converti par le pilote pour un paramètre `timestamptz`, la perdrait.
      const stamp = async () => (await fx.admin<{ stamp: string }[]>`select updated_at::text as stamp from platform.node_drafts where node_id = ${page}`)[0].stamp
      const read = await stamp()
      await insertBlock("lea", { node_id: page, state: "draft", position: 5000, type: "paragraph", text: "Ajouté.", created_by: o.people.lea.id })
      const written = await stamp()
      expect(written).not.toBe(read)
      const publishOn = (draftStamp: string) =>
        as("claire")
          .tx((sql) => sql<{ revision: number }[]>`select platform.publish_node(${page}, 1, ${draftStamp}::text::timestamptz, null::jsonb) as revision`)
          .then(([row]) => row.revision)
      expect([await codeOf(publishOn(read)), (await nodeRow(page)).revision]).toEqual(["PT409", 1])
      expect(await publishOn(written)).toBe(2)
    })
  })

  describe("links (AC18)", () => {
    let suivi: string

    beforeAll(async () => {
      suivi = await fx.createNode(o.org.id, { parentId: o.nodes.ventes, path: `ventes/suivi_${hex(3)}`, kind: "table", title: "Suivi" })
      await fx.publishBlocks(suivi, [], { meta: TABLE_META })
    }, SETUP_TIMEOUT)

    /** Une page publiée d'un bloc, son brouillon ouvert par Claire. */
    async function linkedPage() {
      const page = await publishedPage(1)
      await openDraft("claire", page)
      const [block] = await blocksOf(page, "draft")
      const [{ path: suiviPath }] = await fx.admin<{ path: string }[]>`select path from platform.nodes where id = ${suivi}`
      const links = [
        { block_id: block.id, path: suiviPath },
        { block_id: block.id, path: suiviPath, key: "P-001" },
        { block_id: block.id, path: "support/faq" },
        { block_id: block.id, path: "ventes/absente" },
      ]
      return { page, block: block.id, links, suiviPath }
    }

    const linksOf = (nodeId: string) => fx.admin<{ source_block_id: string; target_path: string; target_key: string | null; target_node_id: string | null }[]>`
      select source_block_id, target_path, target_key, target_node_id from platform.links where source_node_id = ${nodeId} order by target_path, target_key`

    // Depuis E01-S12 partie c, la cible se résout dans l'organisation sans le niveau de qui publie
    // (HN-E01S12c-3) : Claire ne lit pas `support/faq`, le lien y mène quand même ; chaque lecteur est
    // filtré à la lecture.
    it("should write one line per block and target, resolving every target of the organisation", async () => {
      const { page, block, links, suiviPath } = await linkedPage()
      expect(await codeOf(publish("claire", page, 1, links))).toBeNull()
      const written = await linksOf(page)
      expect(written).toHaveLength(4)
      expect(written.filter((link) => link.source_block_id === block)).toHaveLength(4)
      const target = Object.fromEntries(written.map((link) => [`${link.target_path}#${link.target_key ?? ""}`, link.target_node_id]))
      expect(target).toEqual({
        "support/faq#": o.nodes.faq,
        [`${suiviPath}#`]: suivi,
        [`${suiviPath}#P-001`]: suivi,
        "ventes/absente#": null,
      })
    })

    it("should replace the links with an empty list, and keep them when p_links is omitted", async () => {
      const { page, links } = await linkedPage()
      await publish("claire", page, 1, links)
      await openDraft("claire", page)
      await publish("claire", page, 2)
      expect(await linksOf(page)).toHaveLength(4)
      await openDraft("claire", page)
      await publish("claire", page, 3, [])
      expect(await linksOf(page)).toEqual([])
    })

    it("should refuse any write of links under a session (42501)", async () => {
      const { page, block, links } = await linkedPage()
      await publish("claire", page, 1, links)
      const inserted = as("claire").tx(
        (sql) => sql`insert into platform.links (org_id, source_node_id, source_block_id, target_path) values (${o.org.id}, ${page}, ${block}, 'ventes/x')`,
      )
      expect(await codeOf(inserted)).toBe("42501")
      expect(await codeOf(as("claire").tx((sql) => sql`delete from platform.links where source_node_id = ${page}`))).toBe("42501")
    })
  })

  describe("rules_version (AC19)", () => {
    /** `rules_version` relu avant et après le geste. */
    async function bumpOf(gesture: () => Promise<unknown>): Promise<number> {
      const before = await fx.rulesVersion(o.org.id)
      await gesture()
      return (await fx.rulesVersion(o.org.id)) - before
    }

    // Un Contexte d'équipe : `contexte` et un Contexte personnel suivent la même règle (le genre
    // `context`), cas retirés (M11b).
    it("should increase by exactly 1 when ventes/contexte is published", async () => {
      const node = await fx.nodeId(o.org.id, "ventes/contexte")
      expect(await bumpOf(() => fx.publishBlocks(node, [{ type: "paragraph", text: "Règle." }]))).toBe(1)
    })

    // Une page publiée : procédure, tableau, `orgs.settings`, équipe créée ou supprimée ne sont pas des
    // Contextes non plus, cas retirés (M11b).
    it("should not move when a page is published", async () => {
      expect(await bumpOf(() => publishedPage())).toBe(0)
    })
  })

  describe("node_versions is read-only (AC20)", () => {
    let ventesPage: string

    beforeAll(async () => {
      ventesPage = await publishedPage()
    }, SETUP_TIMEOUT)

    it("should refuse inserting, updating or deleting a version, even to Ada (42501)", async () => {
      const inserted = as("ada").tx(
        (sql) => sql`insert into platform.node_versions (node_id, revision, title, summary, kind) values (${ventesPage}, 9, 'T', 'R.', 'page')`,
      )
      expect(await codeOf(inserted)).toBe("42501")
      expect(await codeOf(as("ada").tx((sql) => sql`update platform.node_versions set title = 'Autre' where node_id = ${ventesPage}`))).toBe("42501")
      expect(await codeOf(as("ada").tx((sql) => sql`delete from platform.node_versions where node_id = ${ventesPage}`))).toBe("42501")
    })
  })

  // Repris de `blocs-rls.test.ts` (M11b). Depuis E01-S08, les cas de lecture et d'écriture par niveau
  // (AC9, Marc et Paul) sont retirés (HN-E01S08-9). Retirés ici : les formes et les clés refusées
  // (`blocs-zod.test.ts` rend le verdict de la base sur chacune, le rôle n'y change rien), le chemin
  // permis d'une policy (Léa insère, met à jour, supprime) et les permutations d'un même refus.
  describe("blocks (E01-S06 AC6 to AC11)", () => {
    let other: string
    let suivi: string

    const draftOf = (who: Who, nodeId: string, fields: Record<string, unknown>) =>
      insertBlock(who, { node_id: nodeId, state: "draft", position: 1024, created_by: o.people[who].id, type: "paragraph", ...fields })

    beforeAll(async () => {
      other = (await fx.createOrg()).id
      suivi = await fx.createNode(o.org.id, { parentId: o.nodes.ventes, path: "ventes/suivi", kind: "table", title: "Suivi" })
      await fx.publishBlocks(suivi, [], { meta: { columns: [{ name: "ref", type: "text" }], key: "ref" } })
    }, SETUP_TIMEOUT)

    describe("shape by type (AC6)", () => {
      beforeAll(async () => {
        await openDraft("lea", o.nodes.devis)
      }, SETUP_TIMEOUT)

      // Un bloc valide : la validité de chacun des dix types est dans `blocs-zod.test.ts`.
      it("should write a valid document block in the draft, revision 1, org_id set by the database", async () => {
        const written = await draftOf("lea", o.nodes.devis, { type: "paragraph", text: "Voir [[ventes/suivi]]." })
        expect(written.map(({ type, revision, org_id }) => ({ type, revision, org_id }))).toEqual([{ type: "paragraph", revision: 1, org_id: o.org.id }])
      })

      it("should refuse a document block without position (23514)", async () => {
        expect(await codeOf(draftOf("lea", o.nodes.devis, { text: "Sans place.", position: null }))).toBe("23514")
      })
    })

    describe("key, lease and identity (AC7)", () => {
      beforeAll(async () => {
        await openDraft("lea", o.nodes.devis)
      }, SETUP_TIMEOUT)

      it("should refuse two blocks with the same key in the draft (23505)", async () => {
        const key = `cle_${hex(3)}`
        expect(await codeOf(draftOf("lea", o.nodes.devis, { text: "Un.", key }))).toBeNull()
        expect(await codeOf(draftOf("lea", o.nodes.devis, { text: "Deux.", key }))).toBe("23505")
      })

      it("should admit the same key published and in the draft (the copy)", async () => {
        const page = await fx.createNode(o.org.id, { parentId: o.nodes.ventes, path: `ventes/cles_${hex(3)}`, title: "Clés" })
        await fx.publishBlocks(page, [{ type: "heading", text: "Étapes", data: { level: 1 }, key: "etapes" }])
        await openDraft("lea", page)
        const rows = await as("lea").tx((sql) => sql`select state, key from platform.blocks where node_id = ${page} order by state`)
        expect(rows).toEqual([
          { state: "draft", key: "etapes" },
          { state: "published", key: "etapes" },
        ])
      })

      // Une révision donnée par l'appelant : l'id, `claimed_by` et `lease_until`, même privilège de
      // colonne, sont retirés (M11b).
      it("should refuse a revision given by the caller (42501, column privileges)", async () => {
        expect(await codeOf(draftOf("lea", o.nodes.devis, { text: "Fourni.", revision: 3 }))).toBe("42501")
      })

      it("should refuse an org_id that is not the node's (23514)", async () => {
        expect(await codeOf(draftOf("lea", o.nodes.devis, { text: "Ailleurs.", org_id: other }))).toBe("23514")
      })

      it("should refuse an unknown node (23503)", async () => {
        expect(await codeOf(draftOf("lea", UNKNOWN_NODE, { text: "Nulle part." }))).toBe("23503")
      })
    })

    describe("structure (AC8)", () => {
      let key: string

      beforeAll(async () => {
        key = `P-${hex(3)}`
        await fx.addRows(suivi, [{ key, data: { ref: key } }])
        await fx.admin`select * from platform.open_draft(${o.nodes.devis})`
      }, SETUP_TIMEOUT)

      const insert = (fields: Record<string, unknown>) => fx.admin<{ id: string }[]>`insert into platform.blocks ${fx.admin(blockValues(fx.admin, fields))} returning id`
      const updateRow = (patch: Record<string, unknown>) =>
        fx.admin`update platform.blocks set ${fx.admin(patch)} where node_id = ${suivi} and key = ${key} returning id`

      it("should refuse a row in a page, another block in a table, a row in a draft (23514)", async () => {
        expect(await codeOf(insert({ node_id: o.nodes.devis, state: "published", type: "row", key: "P-X" }))).toBe("23514")
        expect(await codeOf(insert({ node_id: suivi, state: "published", type: "paragraph", text: "x", position: 1 }))).toBe("23514")
        expect(await codeOf(insert({ node_id: suivi, state: "draft", type: "row", key: "P-Y" }))).toBe("23514")
      })

      it("should refuse a row changing type, or a block becoming a row (23514)", async () => {
        expect(await codeOf(updateRow({ type: "paragraph", text: "x", position: 1 }))).toBe("23514")
        const draft = await insert({ node_id: o.nodes.devis, state: "draft", type: "paragraph", text: "Bloc.", position: 5 })
        const becoming = fx.admin`update platform.blocks set type = 'row', text = null, key = 'P-Z' where id = ${draft[0].id} returning id`
        expect(await codeOf(becoming)).toBe("23514")
        expect(await fx.admin`select type from platform.blocks where node_id = ${suivi} and key = ${key}`).toEqual([{ type: "row" }])
      })

      it("should refuse changing the key of a row (23514)", async () => {
        expect(await codeOf(updateRow({ key: `${key}-bis` }))).toBe("23514")
      })

      // `blocks_guard` compare `new.key <> old.key` : une clé mise à NULL passe ce `if` sans lever ;
      // `blocks_shape_check` (`row` → `key is not null`) ferme le cas (database-patterns.md § Migrations).
      // La contrainte vaut pour tout rôle : la connexion d'administration la prouve (le cas sous la session
      // de Léa est retiré, M11b).
      it("should refuse setting the key of a row to null by the administration connection (23514)", async () => {
        expect(await codeOf(updateRow({ key: null }))).toBe("23514")
        expect(await fx.admin`select key from platform.blocks where node_id = ${suivi} and key = ${key}`).toEqual([{ key }])
      })

      // Le privilège de colonne manque : la valeur n'est pas même lue. `org_id` suffit à le prouver :
      // l'id, l'état et le nœud, même privilège, sont retirés (M11b).
      it("should refuse changing org_id under a session (42501)", async () => {
        const update = as("lea").tx((sql) => sql`update platform.blocks set org_id = ${UNKNOWN_NODE} where node_id = ${suivi} and key = ${key} returning id`)
        expect(await codeOf(update)).toBe("42501")
      })
    })

    describe("writing a document (AC10)", () => {
      // Depuis M02, la base exige le brouillon sous verrou avant la policy (`blocks_lock_draft`) : sans
      // lui, PT409, comme une écriture qu'une publication a devancée (E03-S03 N46).
      it("should refuse a draft block before the draft is opened (PT409)", async () => {
        const page = await publishedPage()
        expect(await codeOf(draftOf("lea", page, { text: "Trop tôt." }))).toBe("PT409")
      })

      // Ada, qui administre : Claire, qui mène Ventes, suit la même garde (cas retiré, M11b).
      it("should refuse ada writing a published document block (42501 insert, 0 rows update and delete)", async () => {
        const page = await publishedPage()
        const [published] = await fx.admin<{ id: string }[]>`select id from platform.blocks where node_id = ${page} and state = 'published'`
        const insert = insertBlock("ada", { node_id: page, state: "published", position: 9000, type: "paragraph", text: "Direct.", created_by: o.people.ada.id })
        expect(await codeOf(insert)).toBe("42501")
        expect(await as("ada").tx((sql) => sql`update platform.blocks set text = 'Direct.' where id = ${published.id} returning id`)).toEqual([])
        expect(await as("ada").tx((sql) => sql`delete from platform.blocks where id = ${published.id} returning id`)).toEqual([])
      })
    })

    describe("table rows (AC11)", () => {
      const rowInsert = (who: Who, key: string) =>
        insertBlock(who, { node_id: suivi, state: "published", type: "row", key, data: { ref: key }, created_by: o.people[who].id })
      const updateAsLea = (id: string, patch: Record<string, unknown>) =>
        as("lea").tx((sql) => sql`update platform.blocks set ${sql(blockValues(sql, patch))} where id = ${id} returning id`)

      // Le bail incomplet est le sujet du cas suivant : son assertion, redite ici, est retirée (M11b).
      it("should let Léa write rows: revision 1 and org_id set, values, provenance, revision guard, lease, deletion", async () => {
        const key = `P-${hex(3)}`
        const inserted = await rowInsert("lea", key)
        expect(inserted.map(({ revision, org_id }) => ({ revision, org_id }))).toEqual([{ revision: 1, org_id: o.org.id }])
        const id = inserted[0].id
        const patch = {
          data: { ref: key, statut: "en cours" },
          provenance: { statut: { origin: "agent", at: new Date().toISOString() } },
          revision: 2,
          claimed_by: "lea",
          claimed_by_user: o.people.lea.id,
          lease_until: new Date(Date.now() + 15 * 60_000),
        }
        const updated = await as("lea").tx(
          (sql) => sql`update platform.blocks set ${sql(blockValues(sql, patch))} where id = ${id} and revision = 1 returning revision, claimed_by`,
        )
        expect(updated).toEqual([{ revision: 2, claimed_by: "lea" }])
        expect(await as("lea").tx((sql) => sql`delete from platform.blocks where id = ${id} returning id`)).toEqual([{ id }])
      })

      it("should refuse a lease without its end, or an end without its lease (23514)", async () => {
        const [{ id }] = await rowInsert("lea", `P-${hex(3)}`)
        expect(await codeOf(updateAsLea(id, { claimed_by: "lea" }))).toBe("23514")
        expect(await codeOf(updateAsLea(id, { lease_until: new Date() }))).toBe("23514")
      })
    })
  })
})
