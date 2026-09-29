// @vitest-environment node
// Brouillon partagé et concurrence au bloc, part du service (E03-S03, AC25), sur une base réelle (E01-S10,
// lot t1-b) : brouillon ouvert à la première écriture, écritures minimales, conflits de bloc et d'en-tête,
// écriture annulée entière (une transaction, AC-x4, partie b2), brouillon publié entre-temps (jamais
// `forbidden`). Chaque cas écrit ses tables simulées sur l'organisation O de la graine du fichier
// (`replaceContent`). La base change sous le service par le crochet de l'espion (`spyDb`), appelé juste
// avant l'instruction qu'il vise : une vraie écriture de la connexion d'administration (révision d'un bloc
// avancée, en-tête enregistré, bloc retiré, publication par `publish_node`), ou le refus que la base
// rendrait et qu'elle ne rend pas d'elle-même à coup sûr (`42501`, `PT409`, `57014`, `23503`). Une
// publication ne passe qu'avant la première écriture du brouillon : après elle, la transaction de
// l'écriture tient le verrou du brouillon (M02), que `publish_node` attend. La part de la base (deux
// personnes, deux blocs, en même temps) est jouée sur le vrai projet (`mcp-read-write.test.ts`). Mode de
// transition : sur le projet, sous une vraie session (`ref.db`), tant que la lecture des nœuds
// (`lookup.ts`) et les droits (`access.ts`) passent par PostgREST.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import type { BlockInput } from "../../packages/plateforme/schemas"
import { readNode } from "../../packages/plateforme/server/nodes/read"
import { writeNode } from "../../packages/plateforme/server/nodes/write"
import { addBlocks, contentTables, identityOf, openDraftRow, type Person } from "../helpers/reference-org"
import { seedReferenceOrg, type ReferenceOrgSql } from "../helpers/reference-org-sql"
import type { Tables } from "../helpers/simulated-db"
import { functionCalls, isWrite, replaceContent, spyDb, touches, type SpiedCall, type SpyHook } from "../helpers/spy-t1-b"
import { sqlConfigured, seedWithAdmin, type SeededData, portable } from "../helpers/sql"

const NETWORK_TIMEOUT = 60_000
const SETUP_TIMEOUT = 180_000

const heading = (text: string, key?: string): BlockInput => ({ type: "heading", text, data: { level: 1 }, key })
const paragraph = (text: string): BlockInput => ({ type: "paragraph", text, data: {} })

function devis(): Tables {
  const tables = contentTables([], [{ path: "ventes", title: "Ventes" }, { path: "ventes/devis", title: "Devis" }])
  addBlocks(tables, "ventes/devis", "published", [heading("Objet", "objet"), paragraph("Relancer."), heading("Étapes", "etapes"), paragraph("Lire."), paragraph("Écrire.")])
  return tables
}

const SQL_WRITE_HEAD = { insert: "insert\\s+into", update: "update", delete: "delete\\s+from" } as const
/** Une instruction de la face SQL qui écrit `table`, son verbe en tête (`update platform.blocks …`) : `store.ts` écrit ainsi (partie b2). */
const sqlWrites = (call: SpiedCall, verb: keyof typeof SQL_WRITE_HEAD, table: string) =>
  call.kind === "sql" && new RegExp(`^\\s*${SQL_WRITE_HEAD[verb]}\\s+platform\\.${table}\\b`, "i").test(call.text)
const isBlockUpdate = (call: SpiedCall) => sqlWrites(call, "update", "blocks")
/** La mise à jour du bloc `id` : son identifiant parmi les valeurs liées de l'instruction. */
const updatesBlock = (call: SpiedCall, id: string) => isBlockUpdate(call) && call.kind === "sql" && call.values.includes(id)
/** Une lecture de `node_drafts` par la face SQL (`loadDraft`). */
const readsDraft = (call: SpiedCall) => call.kind === "sql" && /^\s*select\b/i.test(call.text) && touches(call, "node_drafts")
/** Le genre d'une écriture : le premier mot de l'instruction (`insert`, `delete`…). */
const writeKind = (call: SpiedCall) => call.text.trim().split(/\s+/)[0].toLowerCase()

describe.skipIf(!sqlConfigured)(portable("shared draft and concurrency per block (AC25, the service's part)"), { timeout: NETWORK_TIMEOUT }, () => {
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

  async function write(person: Person, ops: Record<string, unknown>[], extra: { hook?: SpyHook; title?: string } = {}) {
    const spied = spyDb(await ref.db(person), extra.hook)
    // `write` publie par défaut (E11-S02, AC-b1) : ces cas regardent le brouillon.
    const input = { path: "ventes/devis", base_revision: 1, ops, ...(extra.title ? { title: extra.title } : {}), publish: false }
    const outcome = await writeNode(spied.db, who(person), input, { kind: "agent", ctx: null }).then(
      (result) => ({ result, error: null }),
      (error: unknown) => ({ result: null, error }),
    )
    return { ...outcome, calls: spied.calls }
  }

  /** Les blocs du brouillon de `ventes/devis`, dans l'ordre du document, relus par la connexion d'administration. */
  async function draftRows(): Promise<{ id: string; text: string | null }[]> {
    return seed.admin<{ id: string; text: string | null }[]>`
      select id, text from platform.blocks where node_id = ${ref.nodeId("ventes/devis")} and state = 'draft' order by position, id`
  }

  it("should open the draft on the first write, write only what changed, and let a second writer add to it", async () => {
    const published = devis()
    await content(published)
    const lea = await write("lea", [{ op: "replace_section", section: "Objet", text: "Relancer vite." }])
    expect(lea.error).toBeNull()
    expect(functionCalls(lea.calls, "open_draft")).toHaveLength(1)
    expect(lea.result?.text.split("\n")[0]).toBe("Draft of ventes/devis saved on revision 1: replaced « Objet » (24 characters).")
    // Le paragraphe réécrit est un bloc neuf (N12) : une insertion, une suppression, aucune autre écriture.
    const blockWrites = lea.calls.filter((call) => isWrite(call) && touches(call, "blocks"))
    expect(blockWrites.map(writeKind)).toEqual(["insert", "delete"])
    // Les blocs gardés sont les copies du brouillon, sous les ids publiés.
    const publishedIds = new Set(published.blocks.map((row) => ref.id(String(row.id))))
    const kept = (await draftRows()).filter((row) => publishedIds.has(row.id))
    expect(kept.map((row) => row.text)).toEqual(["Objet", "Étapes", "Lire.", "Écrire."])
    const readers = await ref.db("lea")
    expect((await readNode(readers, who("lea"), { path: "ventes/devis" })).text).toContain("\n\n## Objet\n\nRelancer.")
    expect((await readNode(readers, who("lea"), { path: "ventes/devis", draft: true })).text).toContain("\n\n## Objet\n\nRelancer vite.\n\n## Étapes")

    const claire = await write("claire", [{ op: "append", section: "Étapes", text: "Envoyer." }])
    expect(functionCalls(claire.calls, "open_draft")).toEqual([])
    const readBack = await readNode(await ref.db("claire"), who("claire"), { path: "ventes/devis", draft: true })
    expect(readBack.text).toContain("\n\n## Objet\n\nRelancer vite.\n\n## Étapes\n\nLire.\n\nÉcrire.\n\nEnvoyer.\n\n")
  })

  it("should refuse a block or a pending header saved meanwhile, and write nothing at all when the write stops after a first write (AC-x4)", async () => {
    const tables = devis()
    openDraftRow(tables, "ventes/devis")
    tables.blocks.push(...tables.blocks.map((row) => ({ ...row, state: "draft" })))
    const [objet, , , lire, ecrire] = tables.blocks.map((row) => String(row.id))
    const seeded = ["Objet", "Relancer.", "Étapes", "Lire.", "Écrire."]
    // Chaque cas repart de ces tables : un bloc garde son identifiant réel d'une écriture à l'autre.
    await content(tables)
    const lireRef = ref.id(lire).slice(0, 8)
    // La mise à jour du bloc visé trouve une révision que quelqu'un vient d'avancer : 0 ligne.
    const bump =
      (target: string): SpyHook =>
      async (call) => {
        if (updatesBlock(call, ref.id(target))) await seed.admin`update platform.blocks set revision = 5 where id = ${ref.id(target)} and state = 'draft'`
      }
    const ops = [
      { op: "replace_block", block: "objet", text: "## Objet du devis" },
      { op: "replace_block", block: lireRef, text: "Lire deux fois." },
    ]
    const first = await write("lea", ops, { hook: bump(objet) })
    expect(first.error).toMatchObject({
      code: "stale_revision",
      message: "stale revision: ventes/devis changed while writing (block objet was saved meanwhile). Nothing was written. Read it again with draft: true, then retry.",
    })
    // La mise à jour d'`objet` est partie avant celle du bloc qui a bougé : annulée avec elle, rien n'est écrit.
    await content(tables)
    const second = await write("lea", ops, { hook: bump(lire) })
    expect(second.error).toMatchObject({
      message: `stale revision: ventes/devis changed while writing (block ${lireRef} was saved meanwhile). Nothing was written. Read it again with draft: true, then retry.`,
    })
    expect(second.calls.filter(isBlockUpdate)).toHaveLength(2)
    expect((await draftRows()).map((row) => row.text)).toEqual(seeded)
    // Un autre enregistre un titre en attente entre-temps : le tampon du brouillon avance (`set_updated_at`).
    const header: SpyHook = async (call) => {
      if (sqlWrites(call, "update", "node_drafts")) await seed.admin`update platform.node_drafts set title = 'Autre titre' where node_id = ${ref.nodeId("ventes/devis")}`
    }
    await content(tables)
    const titled = await write("lea", [], { hook: header, title: "Relance" })
    expect(titled.error).toMatchObject({
      message: "stale revision: ventes/devis changed while writing (its pending title, summary or kind was saved meanwhile). Nothing was written. Read it again with draft: true, then retry.",
    })
    // Le bloc à retirer, retiré entre-temps par quelqu'un d'autre : la suppression ne touche aucune ligne, un conflit (AC25).
    const removed: SpyHook = async (call) => {
      if (sqlWrites(call, "delete", "blocks")) await seed.admin`delete from platform.blocks where node_id = ${ref.nodeId("ventes/devis")} and state = 'draft' and key = 'etapes'`
    }
    await content(tables)
    expect((await write("lea", [{ op: "delete_block", block: "etapes" }], { hook: removed })).error).toMatchObject({
      message: "stale revision: ventes/devis changed while writing (block etapes was saved meanwhile). Nothing was written. Read it again with draft: true, then retry.",
    })
    // De même après l'insertion du paragraphe neuf d'un `replace_section`, que la suppression suit : il part
    // avec elle, les paragraphes retirés par l'autre restent retirés.
    const replaced: SpyHook = async (call) => {
      if (sqlWrites(call, "delete", "blocks")) await seed.admin`delete from platform.blocks where id in (${ref.id(lire)}, ${ref.id(ecrire)}) and state = 'draft'`
    }
    await content(tables)
    const section = await write("lea", [{ op: "replace_section", section: "Étapes", text: "Tout relire." }], { hook: replaced })
    expect(section.error).toMatchObject({
      message: `stale revision: ventes/devis changed while writing (block ${lireRef} was saved meanwhile). Nothing was written. Read it again with draft: true, then retry.`,
    })
    expect(section.calls.filter((call) => isWrite(call) && touches(call, "blocks")).map(writeKind)).toEqual(["insert", "delete"])
    expect((await draftRows()).map((row) => row.text)).toEqual(["Objet", "Relancer.", "Étapes"])
    // Une panne après une écriture de l'appel : tout est annulé, et la panne se rejoue sans doubler un ajout
    // (« Retry once » du MCP) ; un nœud disparu (`23503`) est introuvable (§ Contrat, point 4).
    const failAt =
      (target: string, code: string): SpyHook =>
      (call) =>
        updatesBlock(call, ref.id(target)) ? { code } : null
    await content(tables)
    expect((await write("lea", ops, { hook: failAt(lire, "57014") })).error).toMatchObject({ code: "internal", message: "Internal error." })
    expect((await draftRows()).map((row) => row.text)).toEqual(seeded)
    await content(tables)
    expect((await write("lea", ops, { hook: failAt(objet, "23503") })).error).toMatchObject({ code: "not_found", message: "Unknown path ventes/devis." })
  })

  it("should answer a draft published meanwhile as a stale revision, never as forbidden nor as a success, and log it", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {})
    const tables = devis()
    openDraftRow(tables, "ventes/devis")
    tables.blocks.push(...tables.blocks.map((row) => ({ ...row, state: "draft" })))
    const published = "stale revision: ventes/devis was published while writing, now at revision 2. Read it again, then retry."
    /** `publish_node` passé entre-temps, par la connexion d'administration : révision 2, blocs `draft` devenus les publiés, plus de brouillon. */
    const publish = async () => {
      await seed.admin`select platform.publish_node(${ref.nodeId("ventes/devis")}::uuid, 1)`
    }
    for (const code of ["42501", "PT409", null]) {
      await content(tables)
      const hook: SpyHook = async (call) => {
        if (!isBlockUpdate(call)) return null
        await publish()
        return code === null ? null : { code }
      }
      const outcome = await write("lea", [{ op: "replace_block", block: "objet", text: "## Objet du devis" }], { hook })
      expect(outcome.error, String(code)).toMatchObject({ code: "stale_revision", message: published, details: { revision: 2 } })
    }
    // Une suppression qui ne touche plus aucune ligne n'est pas un succès (AC25), ni un ajout dont le
    // brouillon a disparu (la base refuse le bloc sans brouillon ouvert, `PT409`).
    const publishedBefore =
      (verb: "delete" | "insert"): SpyHook =>
      async (call) => {
        if (sqlWrites(call, verb, "blocks")) await publish()
        return null
      }
    const cases: [Record<string, unknown>, "delete" | "insert"][] = [
      [{ op: "delete_block", block: "etapes" }, "delete"],
      [{ op: "append", section: "Étapes", text: "Envoyer." }, "insert"],
    ]
    for (const [op, before] of cases) {
      await content(tables)
      const outcome = await write("lea", [op], { hook: publishedBefore(before) })
      expect(outcome.error, String(op.op)).toMatchObject({ code: "stale_revision", message: published })
    }
    // Journalisé, le nœud nommé par son id (`security-patterns.md § Idempotence et mutations concurrentes`).
    expect(logged).toHaveBeenCalledWith(`[platform] nodes: draft of ${ref.nodeId("ventes/devis")} changed while writing (block)`)
    // Ni un brouillon publié avant sa relecture, qui finit l'écriture : le brouillon disparu est un conflit,
    // jamais un succès. Une opération qui ne change aucun bloc n'écrit rien, et la relecture de `saveDraft`
    // (la seconde lecture du brouillon de l'appel) ouvre sa transaction : la publication peut passer avant.
    let draftReads = 0
    const publishedBeforeReread: SpyHook = async (call) => {
      if (readsDraft(call) && ++draftReads === 2) await publish()
    }
    await content(tables)
    const reread = await write("lea", [{ op: "replace_block", block: "objet", text: "## Objet" }], { hook: publishedBeforeReread })
    expect(reread.error).toMatchObject({ code: "stale_revision", message: published, details: { revision: 2 } })
    expect(reread.calls.filter(isWrite)).toEqual([])
    expect(logged).toHaveBeenCalledWith(`[platform] nodes: draft of ${ref.nodeId("ventes/devis")} changed while writing (draft)`)
    logged.mockRestore()
  })
})
