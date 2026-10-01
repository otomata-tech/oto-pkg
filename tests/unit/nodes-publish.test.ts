// @vitest-environment node
// Publication sur une base réelle (E03-S03, AC29, AC30, AC32, AC33, AC39 ; E01-S10, lot t1-b) : l'écriture
// décidée par le service avant `publish_node` (E11-S02, AC-a1 : écrire publie) ; les textes des refus de `publish_node` (`PT409`, lu par
// `errors.ts`) ; Contextes et document long. Chaque cas écrit ses tables simulées sur l'organisation O de la
// graine du fichier (`replaceContent`) ; une course est une vraie écriture de la connexion d'administration
// juste avant `publish_node` (l'espion, `spyDb`) : une autre publication, ou le brouillon enregistré de
// nouveau, que `publish_node` refuse lui-même. Les règles de `publish_node` (atomicité, instantané, liens)
// sont prouvées sur la base par E01-S06 (`brouillon-publication.test.ts`), jamais retestées ici. Mode de
// transition : sur le projet, sous une vraie session (`ref.db`), tant que la lecture des nœuds
// (`lookup.ts`), les liens (`link-resolution.ts`) et les droits (`access.ts`) passent par PostgREST.
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { renderBlocks, type BlockInput } from "../../packages/plateforme/schemas"
import { readNode } from "../../packages/plateforme/server/nodes/read"
import { writeNode, type WriteOrigin } from "../../packages/plateforme/server/nodes/write"
import { addBlocks, CONTENT_AT, contentTables, identityOf, nodeId, openDraftRow, type Person } from "../helpers/reference-org"
import { seedReferenceOrg, type ReferenceOrgSql } from "../helpers/reference-org-sql"
import type { Tables } from "../helpers/simulated-db"
import { functionCalls, replaceContent, sameInstant, spyDb, type SpiedCall, type SpyHook } from "../helpers/spy-t1-b"
import { sqlConfigured, seedWithAdmin, type SeededData, portable } from "../helpers/sql"

const NETWORK_TIMEOUT = 60_000
const SETUP_TIMEOUT = 180_000

const heading = (text: string): BlockInput => ({ type: "heading", text, data: { level: 1 } })
const paragraph = (text: string): BlockInput => ({ type: "paragraph", text, data: {} })

const publishCalls = (calls: SpiedCall[]) => functionCalls(calls, "publish_node")

/** Les arguments de `publish_node` dans l'ordre de sa signature, que la face SQL lui passe par leurs noms (`publish.ts`, partie b2). */
const PUBLISH_ARGS = ["p_node", "p_base_revision", "p_draft_stamp", "p_links"]
/** Une valeur liée, `p_links` lu dans le `Parameter` de `sql.json` qui le porte (`publish.ts`). */
const bound = (value: unknown) => (value !== null && typeof value === "object" && "type" in value && "value" in value ? value.value : value)
/** Un appel de `publish_node` par ses arguments nommés, lus dans les valeurs liées de l'instruction. */
const publishArgs = (call: SpiedCall) => (call.kind === "sql" ? Object.fromEntries(call.values.map((value, rank) => [PUBLISH_ARGS[rank], bound(value)])) : call)

function base(nodes: Parameters<typeof contentTables>[1] = []): Tables {
  return contentTables([], [{ path: "ventes", title: "Ventes" }, ...nodes])
}

/** Le brouillon de Léa sur `ventes/cr_test` (AC19) : « Décisions » et son paragraphe, révision 0. */
function crTest(): Tables {
  const tables = base([{ path: "ventes/cr_test", title: "CR de test", summary: "Compte rendu de test", status: "draft", revision: 0 }])
  openDraftRow(tables, "ventes/cr_test", { title: "CR de test final" })
  addBlocks(tables, "ventes/cr_test", "draft", [heading("Décisions"), paragraph("Lancer la pré-étude.")])
  return tables
}

/** Une ligne de `blocks` relue par la connexion d'administration. */
type BlockRow = { id: string; state: string; type: string; text: string | null; data: unknown }

describe.skipIf(!sqlConfigured)(portable("publishing on a real database"), { timeout: NETWORK_TIMEOUT }, () => {
  let seed: SeededData
  let ref: ReferenceOrgSql

  beforeAll(async () => {
    seed = seedWithAdmin()
    ref = await seedReferenceOrg(seed)
  }, SETUP_TIMEOUT)

  afterAll(async () => {
    await seed?.cleanup()
  }, SETUP_TIMEOUT)

  /** L'identité de la personne dans O, préfixe `acme` des textes servis (l'organisation simulée, son identifiant réel). */
  const who = (person: Person) => ref.identityOf(person, { org: identityOf(person).org })
  const content = (tables: Tables) => replaceContent(seed, ref, tables)

  /** `write` publiant par défaut (E11-S02, AC-b1), une entrée qui ne nomme pas `publish` garde ici le brouillon. */
  async function write(person: Person, input: Record<string, unknown>, hook?: SpyHook, origin: WriteOrigin = { kind: "agent", ctx: null }) {
    const spied = spyDb(await ref.db(person), hook)
    const body = "publish" in input ? input : { ...input, publish: false }
    const outcome = await writeNode(spied.db, who(person), body, origin).then(
      (result) => ({ result, error: null }),
      (error: unknown) => ({ result: null, error }),
    )
    return { ...outcome, calls: spied.calls }
  }

  /** Les blocs d'un nœud de O, tous états, dans l'ordre du document, relus par la connexion d'administration. */
  async function blocksOf(path: string): Promise<BlockRow[]> {
    return seed.admin<BlockRow[]>`
      select b.id, b.state, b.type, b.text, b.data
        from platform.blocks b join platform.nodes n on n.id = b.node_id
       where n.org_id = ${ref.org.id} and n.path = ${path}
       order by b.position, b.id, b.state`
  }

  /** Les brouillons ouverts des nœuds de O : ce que la base simulée gardait dans `node_drafts`. */
  async function draftsOfO(): Promise<{ node_id: string }[]> {
    return seed.admin<{ node_id: string }[]>`
      select d.node_id from platform.node_drafts d join platform.nodes n on n.id = d.node_id where n.org_id = ${ref.org.id}`
  }

  /** Les révisions publiées des nœuds de O (`node_versions`). */
  async function versionsOfO(): Promise<{ node_id: string; revision: number }[]> {
    return seed.admin<{ node_id: string; revision: number }[]>`
      select v.node_id, v.revision from platform.node_versions v join platform.nodes n on n.id = v.node_id
       where n.org_id = ${ref.org.id} order by n.path, v.revision`
  }

  async function nodeRow(path: string): Promise<Record<string, unknown> | undefined> {
    const [row] = await seed.admin<Record<string, unknown>[]>`select status, revision, title from platform.nodes where org_id = ${ref.org.id} and path = ${path}`
    return row
  }

  describe("publishing (AC29, AC30)", () => {
    it("should let a writer publish what they write, a pending draft, and a table (AC29 ; E11-S02, AC-a1, AC-a2)", async () => {
      // Léa écrit dans l'équipe Ventes (niveau 2) : son écriture, sans `publish`, est publiée (AC-b1).
      await content(crTest())
      const lea = await write("lea", { path: "ventes/cr_test", base_revision: 0, ops: [{ op: "append", section: "Décisions", text: "Autre." }], publish: undefined })
      expect(lea.error).toBeNull()
      // Une ligne pour l'écriture publiée (E11-S18, AC-4) ; le chemin se choisit par `node.move` (AC-6).
      expect(lea.result?.text.split("\n")).toEqual([
        expect.stringMatching(/^Published ventes\/cr_test revision 1 \(1 section, 3 blocks\): appended to « Décisions » \(\+6 → [0-9]+ characters\)\. Next write: base_revision 1\.$/),
        'Renamed: now at ventes/cr_de_test_final; the old path ventes/cr_test still leads here. To choose the path, call acme_call node.move {"path": "ventes/cr_de_test_final", "new_path": "<path>"}.',
      ])
      expect(publishCalls(lea.calls)).toHaveLength(1)

      const tables = crTest()
      const draftIds = tables.blocks.map((row) => row.id)
      await content(tables)
      const alone = await write("lea", { path: "ventes/cr_test", base_revision: 0, publish: true })
      // Le tampon du brouillon lu avant les contrôles part avec la publication (E03-S06 AC13, N9).
      expect(ref.readable(publishCalls(alone.calls).map(publishArgs))).toEqual([
        { p_node: nodeId("ventes/cr_test"), p_base_revision: 0, p_draft_stamp: sameInstant(CONTENT_AT), p_links: [] },
      ])
      // Le titre publié déplace l'adresse (AC-b12 d'E05-S10, HN-E05S10e-17), l'ancienne restant un alias ; au niveau
      // écriture depuis E11-S02 (AC-a3, HN-E11S02-18).
      expect(alone.result?.text).toBe(
        'Published ventes/cr_test revision 1 (1 section, 2 blocks). Next write: base_revision 1.\nRenamed: now at ventes/cr_de_test_final; the old path ventes/cr_test still leads here. To choose the path, call acme_call node.move {"path": "ventes/cr_de_test_final", "new_path": "<path>"}.',
      )
      expect(await nodeRow("ventes/cr_de_test_final")).toMatchObject({ status: "published", revision: 1, title: "CR de test final" })
      expect(ref.readable((await blocksOf("ventes/cr_de_test_final")).map((row) => [row.id, row.state]))).toEqual(draftIds.map((id) => [id, "published"]))
      expect(await draftsOfO()).toEqual([])
      expect(ref.readable(await versionsOfO())).toMatchObject([{ node_id: nodeId("ventes/cr_test"), revision: 1 }])
      expect(alone.result?.data).toMatchObject({ revision: 1, status: "published", has_draft: false })

      // Un tableau au brouillon en attente, publié par une rédactrice (AC-a2).
      const table = base([{ path: "ventes/suivi", kind: "table", revision: 1 }])
      openDraftRow(table, "ventes/suivi", { title: "Suivi des prospects" })
      await content(table)
      const published = await write("lea", { path: "ventes/suivi", base_revision: 1, publish: true })
      expect(published.result?.text).toBe(
        'Published ventes/suivi revision 2. Next write: base_revision 2.\nRenamed: now at ventes/suivi_des_prospects; the old path ventes/suivi still leads here. To choose the path, call acme_call node.move {"path": "ventes/suivi_des_prospects", "new_path": "<path>"}.',
      )
      expect(ref.readable(publishCalls(published.calls).map(publishArgs))).toEqual([{ p_node: nodeId("ventes/suivi"), p_base_revision: 1, p_draft_stamp: sameInstant(CONTENT_AT) }])
    })

    it("should refuse to publish without a draft, and answer simultaneous publications and a moved draft as stale (AC30)", async () => {
      await content(base([{ path: "ventes/devis" }]))
      const nothing = await write("claire", { path: "ventes/devis", base_revision: 1, publish: true })
      expect(nothing.error).toMatchObject({ code: "invalid_arguments", message: "Nothing to publish: ventes/devis has no pending draft." })
      expect([...functionCalls(nothing.calls, "open_draft"), ...publishCalls(nothing.calls)]).toEqual([])

      const pending = () => {
        const tables = base([{ path: "ventes/devis", revision: 2 }])
        openDraftRow(tables, "ventes/devis")
        addBlocks(tables, "ventes/devis", "draft", [paragraph("x")])
        return tables
      }
      /** Ce qu'une autre personne fait juste avant `publish_node`, par la connexion d'administration. */
      const beforePublish =
        (meanwhile: () => Promise<unknown>): SpyHook =>
        async (call) => {
          if (publishCalls([call]).length > 0) await meanwhile()
        }
      // Une autre publication passe entre la lecture et `publish_node` : révision 3, que `publish_node` refuse (`PT409`).
      const published = beforePublish(() => seed.admin`select platform.publish_node(${ref.nodeId("ventes/devis")}::uuid, 2)`)
      await content(pending())
      const screenOrigin: WriteOrigin = { kind: "human" }
      const refusedByPublish = "stale revision: ventes/devis is at revision 3, not 2. Nothing was published. Read it again, then retry."
      expect((await write("claire", { path: "ventes/devis", base_revision: 2, publish: true }, published, screenOrigin)).error).toMatchObject({ code: "stale_revision", message: refusedByPublish })
      // Un assistant : la course interrompt son écriture atomique, rejouée une fois, qui dit l'état d'après (E11-S18, HN-E11S18-2).
      await content(pending())
      const raced = await write("claire", { path: "ventes/devis", base_revision: 2, publish: true }, published)
      expect(raced.error).toMatchObject({ code: "stale_revision", message: expect.stringMatching(/^stale revision: ventes\/devis is at revision 3, not 2\. Nothing was written\. Current state:\n/) })
      // Le brouillon enregistré de nouveau entre la lecture de son tampon et `publish_node` : la révision reste 2,
      // `publish_node` refuse le tampon lu (`PT409`, M02) ; l'écran, dont la publication n'est pas rejouée.
      const moved = "stale revision: ventes/devis changed while publishing (its draft was saved meanwhile). Nothing was published. Read it again with draft: true, then retry."
      const saved = beforePublish(() => seed.admin`update platform.node_drafts set title = 'Autre titre' where node_id = ${ref.nodeId("ventes/devis")}`)
      await content(pending())
      expect((await write("claire", { path: "ventes/devis", base_revision: 2, publish: true }, saved, screenOrigin)).error).toMatchObject({ code: "stale_revision", message: moved })
      await content(pending())
      const screen = await write("claire", { path: "ventes/devis", base_revision: 2, publish: true, draft_stamp: "2026-09-21T00:00:00+00:00" })
      expect(screen.error).toMatchObject({ code: "stale_revision", message: moved, details: { revision: 2 } })
      expect(publishCalls(screen.calls)).toEqual([])
    })
  })

  describe("Contexte and long documents (AC32, AC33, AC39)", () => {
    // E11-S03 (AC-a7) : seules les conversations qui ont reçu ce Contexte périment ; une republication à
    // l'identique n'en périme aucune (H28).
    it("should say that the Contexte changed when it is published with another content, and nothing on an identical republication (AC32)", async () => {
      const tables = base()
      openDraftRow(tables, "contexte")
      addBlocks(tables, "contexte", "draft", [paragraph("Tutoyer.")])
      await content(tables)
      const ada = await write("ada", { path: "contexte", base_revision: 1, publish: true })
      expect(ada.result?.text).toBe(
        "Published contexte revision 2 (0 sections, 1 block). Next write: base_revision 2.\nContext contexte changed: every conversation it was served to gets it, with a new ctx, on its next call, this one included if it was.",
      )
      expect(ada.result?.data).toMatchObject({ rules_changed: true })

      await ref.openDraft("contexte")
      await ref.addBlocks("contexte", "draft", [paragraph("Tutoyer.")])
      const same = await write("ada", { path: "contexte", base_revision: 2, publish: true })
      expect(same.result?.text).toBe("Published contexte revision 3 (0 sections, 1 block). Next write: base_revision 3.")
      expect(same.result?.data).toMatchObject({ rules_changed: false })
    })

    it("should write a long text in three parts, then publish it whole (AC33)", async () => {
      const [m1, m2, m3] = ["a", "b", "c"].map((letter) => letter.repeat(20_000))
      await content(base())
      const created = await write("claire", { path: "ventes/long", title: "Long", summary: "Un long document.", ops: [{ op: "add_section", section: "Corps", text: m1 }] })
      expect(created.result?.text.split("\n")[0]).toBe("Draft of ventes/long created (revision 0): added « Corps » (20,010 characters).")
      const second = await write("claire", { path: "ventes/long", base_revision: 0, ops: [{ op: "append", section: "Corps", text: m2 }] })
      expect(second.result?.text.split("\n")[0]).toBe("Draft of ventes/long saved on revision 0: appended to « Corps » (+20,000 → 40,012 characters).")
      const third = await write("claire", { path: "ventes/long", base_revision: 0, ops: [{ op: "append", section: "Corps", text: m3 }] })
      expect(third.result?.text.split("\n")[0]).toBe("Draft of ventes/long saved on revision 0: appended to « Corps » (+20,000 → 60,014 characters).")
      const published = await write("claire", { path: "ventes/long", base_revision: 0, publish: true })
      expect(published.result?.text).toBe("Published ventes/long revision 1 (1 section, 4 blocks). Next write: base_revision 1.")
      const blocks = (await blocksOf("ventes/long")).filter((row) => row.state === "published")
      expect(renderBlocks(blocks.map((row) => ({ type: row.type, text: row.text, data: row.data })))).toBe(`## Corps\n\n${m1}\n\n${m2}\n\n${m3}`)
    })

    it("should read, write and publish a Contexte as a page, the header saying context (AC39)", async () => {
      const tables = base()
      addBlocks(tables, "ventes/contexte", "published", [heading("Ton"), paragraph("Tutoyer.")])
      await content(tables)
      expect((await readNode(await ref.db("lea"), who("lea"), { path: "ventes/contexte" })).text).toContain("path: ventes/contexte · context · published · revision 1 ·")
      const drafted = await write("lea", { path: "ventes/contexte", base_revision: 1, ops: [{ op: "append", section: "Ton", text: "Signer Léa." }] })
      // « ## Ton » (6), « Tutoyer. » (8), « Signer Léa. » (11), deux lignes vides.
      expect(drafted.result?.text.split("\n")[0]).toBe("Draft of ventes/contexte saved on revision 1: appended to « Ton » (+11 → 29 characters).")
      const published = await write("claire", { path: "ventes/contexte", base_revision: 1, publish: true })
      expect(published.result?.text.split("\n")[1]).toBe(
        "Context ventes/contexte changed: every conversation it was served to gets it, with a new ctx, on its next call, this one included if it was.",
      )
    })
  })
})
