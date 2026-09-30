// @vitest-environment node
// Liens passés à la publication (E03-S03, AC31) : `extractLinks` sur la syntaxe de l'AC1 d'E03-S07, les
// liens que `publish_node` écrit, et la borne de l'AC3 d'E03-S07 (même règle : E03-S07 ne les reteste
// pas). La publication tourne sur une base réelle (E01-S10, lot t1-b), le brouillon de chaque cas écrit sur
// l'organisation O de la graine du fichier ; suite portable (`sqlConfigured`) : le projet, ou le Postgres nu du job `bare-postgres`.
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import type { BlockInput } from "../../packages/plateforme/schemas"
import type { DocBlock } from "../../packages/plateforme/server/nodes/document"
import { extractLinks } from "../../packages/plateforme/server/nodes/links"
import { writeNode } from "../../packages/plateforme/server/nodes/write"
import { addBlocks, contentTables, identityOf, openDraftRow } from "../helpers/reference-org"
import { seedReferenceOrg, type ReferenceOrgSql } from "../helpers/reference-org-sql"
import type { Tables } from "../helpers/simulated-db"
import { functionCalls, linkSet, replaceContent, spyDb, writtenLinks } from "../helpers/spy-t1-b"
import { sqlConfigured, seedWithAdmin, type SeededData, portable } from "../helpers/sql"

const NETWORK_TIMEOUT = 60_000
const SETUP_TIMEOUT = 180_000

function blocks(inputs: BlockInput[]): DocBlock[] {
  return inputs.map((input, index) => ({
    id: `b${index}`,
    type: input.type,
    text: input.text ?? null,
    data: { ...(input.data ?? {}) },
    key: null,
    position: index,
    revision: 1,
    provenance: {},
  }))
}

describe("links passed to publish_node (AC31)", () => {
  it("should extract the links of human text and references, one per block, path and key, never from code", () => {
    const found = extractLinks(
      blocks([
        { type: "paragraph", text: "Voir [[ventes/suivi]], [[ventes/suivi]] et [[support/faq#delais|les délais]]." },
        { type: "checklist", data: { items: [{ text: "Relire [[conseil/tarifs]]", checked: false }] } },
        { type: "code", text: "[[ventes/x]]" },
        { type: "paragraph", text: "Du code en ligne : `[[ventes/y]]`, puis [[ventes/relance_devis#etapes]] et [[ventes/suivi_prospects#P-001|la fiche]]." },
        { type: "reference", data: { path: "ventes/suivi_prospects" } },
        { type: "heading", text: "[[Grille tarifaire]]", data: { level: 1 } },
        { type: "paragraph", text: "[[ventes/modele_relance|le modèle]], [[ventes/modele_relance|le modèle]], [[ventes/z|]] et [[#etapes]]." },
        { type: "list", data: { items: ["Voir [[ventes/l]]"] } },
        { type: "callout", text: "Lire [[ventes/c]]", data: { tone: "note" } },
        { type: "image", text: "Voir [[ventes/i]]", data: { src: "a.png", alt: "A" } },
        { type: "mermaid", text: "graph TD; A[[[ventes/m]]]-->B" },
        { type: "call", data: { function: "table.rows", args: { table: "[[ventes/k]]" } } },
      ]),
    )
    expect(found.links).toEqual([
      { blockId: "b0", path: "ventes/suivi", key: null },
      { blockId: "b0", path: "support/faq", key: "delais" },
      { blockId: "b1", path: "conseil/tarifs", key: null },
      { blockId: "b3", path: "ventes/relance_devis", key: "etapes" },
      { blockId: "b3", path: "ventes/suivi_prospects", key: "P-001" },
      { blockId: "b4", path: "ventes/suivi_prospects", key: null },
      { blockId: "b6", path: "ventes/modele_relance", key: null },
      { blockId: "b6", path: "ventes/z", key: null },
      { blockId: "b7", path: "ventes/l", key: null },
      { blockId: "b8", path: "ventes/c", key: null },
      { blockId: "b9", path: "ventes/i", key: null },
    ])
    expect(found.notLinks).toEqual([
      { text: "[[Grille tarifaire]]", blockId: "b5" },
      { text: "[[#etapes]]", blockId: "b6" },
    ])
  })

  it("should extract the links of cells, sub-items, a toggle summary and its body outside fences, never an escaped one (E10-S04, AC-a4, AC-c2)", () => {
    const found = extractLinks(
      blocks([
        { type: "simple_table", data: { columns: ["[[ventes/t1]]"], rows: [["\\[[ventes/non]] [[ventes/t2]]"]] } },
        { type: "list", data: { items: [{ text: "a", children: { items: [{ text: "[[ventes/l2]]", children: { items: ["[[ventes/l3]]"] } }] } }] } },
        { type: "toggle", text: "[[ventes/corps]]\n```\n[[ventes/code]]\n```", data: { summary: "[[ventes/resume]]" } },
        { type: "divider", data: {} },
      ]),
    )
    expect(found.links.map(({ blockId, path }) => `${blockId} ${path}`)).toEqual(["b0 ventes/t1", "b0 ventes/t2", "b1 ventes/l2", "b1 ventes/l3", "b2 ventes/resume", "b2 ventes/corps"])
  })

  describe.skipIf(!sqlConfigured)(portable("on a real database"), { timeout: NETWORK_TIMEOUT }, () => {
    let seed: SeededData
    let ref: ReferenceOrgSql

    beforeAll(async () => {
      seed = seedWithAdmin()
      ref = await seedReferenceOrg(seed)
    }, SETUP_TIMEOUT)

    afterAll(async () => {
      await seed?.cleanup()
    }, SETUP_TIMEOUT)

    it("should write the links through publish_node, none when they are gone, and refuse more than 1,000 before publishing", async () => {
      const pending = (inputs: BlockInput[]): Tables => {
        const tables = contentTables([], [{ path: "ventes", title: "Ventes" }, { path: "ventes/devis" }])
        openDraftRow(tables, "ventes/devis")
        addBlocks(tables, "ventes/devis", "draft", inputs)
        return tables
      }
      const claire = ref.identityOf("claire", { org: identityOf("claire").org })
      /** La publication de `ventes/devis`, puis les liens qu'elle a écrits, en identifiants simulés. */
      const publish = async (revision = 1) => {
        const spied = spyDb(await ref.db("claire"))
        const outcome = await writeNode(spied.db, claire, { path: "ventes/devis", base_revision: revision, publish: true }, { kind: "agent", ctx: null }).then(
          () => null,
          (error: unknown) => error,
        )
        const links = ref.readable(await writtenLinks(seed.admin, ref.nodeId("ventes/devis")))
        return { error: outcome, links, called: functionCalls(spied.calls, "publish_node").length > 0 }
      }
      const tables = pending([{ type: "paragraph", text: "Voir [[ventes/suivi]] et [[support/faq#delais]]." }, { type: "reference", data: { path: "ventes/suivi_prospects" } }])
      const [paragraph, reference] = tables.blocks.map((row) => row.id)
      await replaceContent(seed, ref, tables)
      const first = await publish()
      // Les liens écrits n'ont pas d'ordre : comparés rangés ; trois lignes.
      expect(linkSet(first.links)).toEqual(
        linkSet([
          { block_id: paragraph, path: "ventes/suivi" },
          { block_id: paragraph, path: "support/faq", key: "delais" },
          { block_id: reference, path: "ventes/suivi_prospects" },
        ]),
      )
      // Le brouillon suivant, sans lien, sur la révision publiée.
      await ref.openDraft("ventes/devis")
      await ref.addBlocks("ventes/devis", "draft", [{ type: "paragraph", text: "Plus de lien." }])
      const bare = await publish(2)
      expect([bare.error, bare.links]).toEqual([null, []])

      await replaceContent(seed, ref, pending([{ type: "paragraph", text: Array.from({ length: 1001 }, (_, index) => `[[ventes/p${index}]]`).join(" ") }]))
      const refused = await publish()
      expect(refused.error).toMatchObject({
        code: "too_large",
        // Une écriture d'assistant qui publie n'écrit rien sur un refus ; le brouillon d'avant l'appel reste (E11-S18, AC-1).
        message: "ventes/devis holds 1,001 links; a page holds at most 1,000: split it into several pages. Nothing was written; the draft saved before this call stays.",
      })
      expect([refused.called, refused.links]).toEqual([false, []])
    })
  })
})
