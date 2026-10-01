// @vitest-environment node
// L'écriture côté assistants (E11-S18) sur une base réelle : les blocs insérés retrouvés par leur rang, pas par leur
// position relue (AC-8, FB-0015) ; un refus de publication qui n'écrit rien pour un assistant, et garde le brouillon de
// l'écran (AC-1, AC-3) ; `node.move` (AC-5) ; `node.write_many` (AC-12) ; l'auteur d'un Contexte qui garde son `ctx`
// (AC-14). Chaque cas écrit ses tables simulées sur l'organisation O de la graine du fichier (`replaceContent`), puis
// relit par la connexion d'administration ce que le service a écrit. En suite portable (`sqlConfigured`).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import type { BlockInput } from "../../packages/plateforme/schemas"
import { writeManyArgsSchema } from "../../packages/plateforme/schemas/nodes"
import type { FunctionContext } from "../../packages/plateforme/server/catalog/define"
import { issueCtx, requireCtx } from "../../packages/plateforme/server/ctx"
import type { PlatformDb } from "../../packages/plateforme/server/db"
import { nodeMove } from "../../packages/plateforme/server/nodes/move-function"
import { writeNode, type WriteOrigin } from "../../packages/plateforme/server/nodes/write"
import { nodeWriteMany } from "../../packages/plateforme/server/nodes/write-many"
import { addBlocks, contentTables, identityOf, type Person } from "../helpers/reference-org"
import { seedReferenceOrg, type ReferenceOrgSql } from "../helpers/reference-org-sql"
import type { Tables } from "../helpers/simulated-db"
import { loggedText } from "../helpers/logs"
import { replaceContent } from "../helpers/spy-t1-b"
import { watchDb, type DbCall } from "../helpers/spy-t1-e2b2"
import { portable, seedWithAdmin, sqlConfigured, type SeededData } from "../helpers/sql"

const NETWORK_TIMEOUT = 60_000
const SETUP_TIMEOUT = 180_000

const AGENT: WriteOrigin = { kind: "agent", ctx: null }

const heading = (text: string): BlockInput => ({ type: "heading", text, data: { level: 1 } })
const paragraph = (text: string): BlockInput => ({ type: "paragraph", text, data: {} })

/** `ventes/devis` publiée en révision 1 : Objet, un paragraphe, Étapes, un paragraphe (positions 1024, 2048…). */
function devis(): Tables {
  const tables = contentTables([], [{ path: "ventes", title: "Ventes" }, { path: "ventes/devis", title: "Devis" }])
  addBlocks(tables, "ventes/devis", "published", [heading("Objet"), paragraph("Relancer."), heading("Étapes"), paragraph("Lire.")])
  return tables
}

/**
 * Une session qui relit un `double precision` à 15 chiffres (`extra_float_digits = 0`, comme certains poolers) : une
 * position de 1365.3333333333333 revient 1365.33333333333, et ne s'égale plus à celle qu'on a envoyée.
 */
function roundingPositions(db: PlatformDb): PlatformDb {
  return {
    tx: (fn) =>
      db.tx(async (sql) => {
        await sql`select pg_catalog.set_config('extra_float_digits', '0', true)`
        return fn(sql)
      }),
  }
}

describe.skipIf(!sqlConfigured)(portable("writing as an assistant (E11-S18)"), { timeout: NETWORK_TIMEOUT }, () => {
  let seed: SeededData
  let ref: ReferenceOrgSql

  beforeAll(async () => {
    seed = seedWithAdmin()
    ref = await seedReferenceOrg(seed)
  }, SETUP_TIMEOUT)

  afterAll(async () => {
    await seed?.cleanup()
  }, SETUP_TIMEOUT)

  const who = (person: Person) => ref.identityOf(person, { org: identityOf(person).org })

  /** Les textes des blocs publiés d'un nœud de O, dans l'ordre du document. */
  async function publishedTexts(path: string): Promise<(string | null)[]> {
    const rows = await seed.admin<{ text: string | null }[]>`
      select b.text from platform.blocks b join platform.nodes n on n.id = b.node_id
       where n.org_id = ${ref.org.id} and n.path = ${path} and b.state = 'published' order by b.position, b.id`
    return rows.map((row) => row.text)
  }

  describe("inserted blocks read back by rank (AC-8, FB-0015)", () => {
    it("should add a section after another even when the database reads positions back rounded", async () => {
      await replaceContent(seed, ref, devis())
      const db = roundingPositions(await ref.db("lea"))
      const input = { path: "ventes/devis", base_revision: 1, ops: [{ op: "add_section", section: "Contexte", text: "Client fidèle.", after: "Objet" }] }
      const result = await writeNode(db, who("lea"), input, AGENT)
      expect(result.text.split("\n")[0]).toMatch(/^Published ventes\/devis revision 2 /)
      expect(await publishedTexts("ventes/devis")).toEqual(["Objet", "Relancer.", "Contexte", "Client fidèle.", "Étapes", "Lire."])
    })
  })

  /** Le nœud de O à ce chemin, et ses brouillons ouverts, relus par la connexion d'administration. */
  async function nodeState(path: string): Promise<{ exists: boolean; drafts: number }> {
    const [row] = await seed.admin<{ nodes: number; drafts: number }[]>`
      select (select count(*)::int from platform.nodes n where n.org_id = ${ref.org.id} and n.path = ${path}) as nodes,
             (select count(*)::int from platform.node_drafts d join platform.nodes n on n.id = d.node_id
               where n.org_id = ${ref.org.id} and n.path = ${path}) as drafts`
    return { exists: row.nodes > 0, drafts: row.drafts }
  }

  const settle = <T>(promise: Promise<T>) =>
    promise.then(
      () => null,
      (error: unknown) => error,
    )

  /** Un bloc `call` d'une fonction inconnue : la publication d'une procédure le refuse (E03-S06). */
  const unknownCall = "1. Lis :\n\n```call\nx.unknown {}\n```"

  // Revue E11-S18 : la branche d'un `returning` qui ne redonne pas les blocs envoyés (autre ordre, donc autre genre).
  describe("inserted blocks that do not match what was sent (AC-8)", () => {
    it("should refuse with conflict, log the mismatch, and write nothing", async () => {
      await replaceContent(seed, ref, devis())
      const logged = vi.spyOn(console, "error").mockImplementation(() => undefined)
      try {
        const insertsBlocks = (call: DbCall) => call.kind === "sql" && /^\s*insert\s+into\s+platform\.blocks\b/i.test(call.text)
        const { db } = watchDb(await ref.db("lea"), { reverse: insertsBlocks })
        const input = { path: "ventes/devis", base_revision: 1, ops: [{ op: "add_section", section: "Contexte", text: "Client fidèle.", after: "Objet" }] }
        expect(await settle(writeNode(db, who("lea"), input, AGENT))).toMatchObject({
          code: "conflict",
          message: "ventes/devis: the new blocks could not be matched once written. Nothing was written. Retry the write; if it fails again, report it with acme_feedback (type error).",
        })
        expect(loggedText(logged)).toContain("2 blocks inserted, 2 rows returned in another shape")
        expect(await nodeState("ventes/devis")).toEqual({ exists: true, drafts: 0 })
      } finally {
        logged.mockRestore()
      }
    })
  })

  describe("a refused publication writes nothing for an assistant (AC-1, AC-3)", () => {
    it("should create no node and keep no draft for an assistant, and keep the draft of the screen", async () => {
      await replaceContent(seed, ref, devis())
      const db = await ref.db("lea")
      const created = { path: "ventes/relance", kind: "procedure", title: "Relance", summary: "Relance un devis.", ops: [{ op: "add_section", section: "Étapes", text: unknownCall }] }
      expect(await settle(writeNode(db, who("lea"), created, AGENT))).toMatchObject({ code: "invalid_arguments", message: expect.stringContaining("refused: 1 problem(s). Nothing was written.\n") })
      expect(await nodeState("ventes/relance")).toEqual({ exists: false, drafts: 0 })

      const edited = { path: "ventes/devis", base_revision: 1, kind: "procedure", ops: [{ op: "add_section", section: "Appel", text: unknownCall }] }
      expect(await settle(writeNode(db, who("lea"), edited, AGENT))).toMatchObject({ code: "invalid_arguments" })
      expect(await nodeState("ventes/devis")).toEqual({ exists: true, drafts: 0 })
      // L'écran garde la frappe d'une personne (AC-3).
      expect(await settle(writeNode(db, who("lea"), edited, { kind: "human" }))).toMatchObject({ code: "invalid_arguments" })
      expect(await nodeState("ventes/devis")).toEqual({ exists: true, drafts: 1 })
    })
  })

  describe("node.move (AC-5)", () => {
    it("should move a page with its sub-page into a folder, the old path kept, and refuse to move a Contexte", async () => {
      const tables = contentTables([], [
        { path: "ventes", title: "Ventes" },
        { path: "ventes/devis", title: "Devis" },
        { path: "ventes/devis/annexe", title: "Annexe" },
        { path: "ventes/dossiers", title: "Dossiers" },
      ])
      await replaceContent(seed, ref, tables)
      const context: FunctionContext = { db: await ref.db("claire"), identity: who("claire"), ctx: null }
      // `run` reçoit des arguments que `call` a validés ; son type commun du catalogue les efface (`never`).
      const moved = await nodeMove.run(context, { path: "ventes/devis", new_path: "ventes/dossiers/devis" } as never)
      // `ventes/devis/modele` est un nœud de la graine de référence : il suit aussi.
      expect(moved.text).toBe(
        [
          "Moved ventes/devis to ventes/dossiers/devis with its descendants:",
          "- ventes/devis → ventes/dossiers/devis",
          "- ventes/devis/annexe → ventes/dossiers/devis/annexe",
          "- ventes/devis/modele → ventes/dossiers/devis/modele",
          "The old paths stay valid: tools called with them are redirected.",
        ].join("\n"),
      )
      expect(await nodeState("ventes/dossiers/devis/annexe")).toEqual({ exists: true, drafts: 0 })
      const aliases = await seed.admin<{ old_path: string }[]>`select old_path from platform.node_aliases where org_id = ${ref.org.id} order by old_path`
      expect(aliases.map((row) => row.old_path)).toEqual(["ventes/devis", "ventes/devis/annexe", "ventes/devis/modele"])
      // Refus de `moveNode`, tel quel (AC9 d'E03-S07).
      expect(await settle(nodeMove.run(context, { path: "ventes/contexte", new_path: "ventes/dossiers/contexte" } as never))).toMatchObject({
        code: "invalid_arguments",
        message: "ventes/contexte cannot move: a Contexte stays at the head of its team; move the pages inside it instead.",
      })
    })
  })

  describe("node.write_many (AC-12)", () => {
    it("should write the pages in order, each whole or not at all, one line per page, a refusal not stopping the next ones", async () => {
      await replaceContent(seed, ref, devis())
      const context: FunctionContext = { db: await ref.db("lea"), identity: who("lea"), ctx: null }
      const pages = [
        { path: "ventes/absent/page", kind: "page", title: "Page", summary: "Sous un parent absent." },
        { path: "ventes/fiches", kind: "page", title: "Fiches", summary: "Les fiches." },
        { path: "ventes/fiches/garantie", kind: "page", title: "Garantie", summary: "La garantie.", ops: [{ op: "set_markdown", text: "---\ntitle: Garantie\n---\n\n## Durée\n\nDeux ans." }] },
      ]
      // `run` reçoit des arguments que `call` a validés ; son type commun du catalogue les efface (`never`).
      const many = await nodeWriteMany.run(context, { pages } as never)
      expect(many.text.split("\n")).toEqual([
        "2 of 3 pages written, 1 refused.",
        expect.stringMatching(/^1\. ventes\/absent\/page refused \(not_found\): Cannot create ventes\/absent\/page: its parent ventes\/absent does not exist\./),
        "2. Published ventes/fiches revision 1 (0 sections, 0 blocks). Next write: base_revision 1.",
        expect.stringMatching(/^3\. Published ventes\/fiches\/garantie revision 1 \(1 section, 2 blocks\): replaced the whole body \(1 section, [0-9]+ characters\)\. Next write: base_revision 1\.$/),
      ])
      expect(many.data?.pages).toEqual([
        { path: "ventes/absent/page", status: "refused", code: "not_found", message: expect.any(String) },
        { path: "ventes/fiches", status: "published", revision: 1 },
        { path: "ventes/fiches/garantie", status: "published", revision: 1 },
      ])
      expect(await publishedTexts("ventes/fiches/garantie")).toEqual(["Durée", "Deux ans."])
    })

    // Comme `write` : une clé mal nommée dans une opération est refusée, l'opération ne part pas sans elle.
    it("should refuse an unknown key inside an operation of a page, naming where it is", () => {
      const page = { path: "ventes/fiches", ops: [{ op: "append", section: "Notes", content: "x" }] }
      const refused = writeManyArgsSchema.safeParse({ pages: [page] })
      expect(refused.success ? [] : refused.error.issues.map((issue) => [issue.code, issue.path.join(".")])).toEqual([["unrecognized_keys", "pages.0.ops.0"]])
      expect(writeManyArgsSchema.safeParse({ pages: [{ path: "ventes/fiches", ops: [{ op: "append", section: "Notes", text: "x" }] }] }).success).toBe(true)
    })
  })

  describe("the author of a Contexte keeps their ctx (AC-14)", () => {
    it("should advance the ctx of the call to the published revision, and say that only the other conversations call context again", async () => {
      const tables = devis()
      addBlocks(tables, "ventes/contexte", "published", [heading("Ton"), paragraph("Tutoyer.")])
      await replaceContent(seed, ref, tables)
      const db = await ref.db("lea")
      const lea = who("lea")
      const code = await issueCtx(db, lea, { host: null, userAgent: null })
      const written = await writeNode(db, lea, { path: "ventes/contexte", base_revision: 1, ops: [{ op: "append", section: "Ton", text: "Signer Léa." }] }, { kind: "agent", ctx: code })
      expect(written.text.split("\n")[1]).toBe(
        "Context ventes/contexte changed: every other conversation it was served to must call acme_context again before any other acme_ tool; this one keeps its ctx.",
      )
      await expect(requireCtx(db, lea, code)).resolves.toMatchObject({ code })
    })
  })
})
