// @vitest-environment node
// Les opérations de `write` sur des blocs en mémoire (E03-S03, AC22, AC23, AC24) : effets, id gardés,
// réponses et refus mot pour mot, bornes chiffrées, positions (renumérotation sous 1e-6 comprise).
import { describe, expect, it } from "vitest"
import { renderBlocks, type BlockInput } from "../../packages/plateforme/schemas"
import { blockMarkdown, blocksSize, charCount, placeBlocks, type DocBlock } from "../../packages/plateforme/server/nodes/document"
import type { WorkBlock } from "../../packages/plateforme/server/nodes/op-kit"
import { applyOps } from "../../packages/plateforme/server/nodes/ops"
import { blockUuid } from "../helpers/reference-org"

const PATH = "ventes/devis"

function doc(blocks: (BlockInput & { key?: string | null; revision?: number })[], rank = 1): DocBlock[] {
  return blocks.map((block, index) => ({
    id: blockUuid(rank + index),
    type: block.type,
    text: block.text ?? null,
    data: { ...(block.data ?? {}) },
    key: block.key ?? null,
    position: 1024 * (index + 1),
    revision: block.revision ?? 1,
    provenance: { origin: "import" },
  }))
}

const heading = (text: string, level: 1 | 2 | 3, key?: string): BlockInput => ({ type: "heading", text, data: { level }, key })
const paragraph = (text: string): BlockInput => ({ type: "paragraph", text, data: {} })

/** `ventes/devis` de l'AC22 : Objet, P1, Étapes, L1, Cas particulier, P2, Règles, P3, P4. */
function devis(): DocBlock[] {
  return doc([
    heading("Objet", 1, "objet"),
    paragraph("Relancer un devis resté sans réponse."),
    heading("Étapes", 1, "etapes"),
    { type: "list", text: null, data: { items: ["Lire le devis.", "Écrire le brouillon."], ordered: true } },
    heading("Cas particulier", 2),
    paragraph("Un devis de plus de 90 jours se requalifie."),
    heading("Règles", 1),
    paragraph("Jamais d'envoi sans accord."),
    paragraph("Jamais d'envoi le week-end."),
  ])
}

const [OBJET, P1, ETAPES, L1, CAS, P2, REGLES, P3, P4] = devis().map((block) => block.id ?? "")
const ref = (id: string) => id.slice(0, 8)

type Op = Parameters<typeof applyOps>[1][number]

function apply(ops: Op[], blocks = devis()) {
  const result = applyOps(blocks, ops, { path: PATH })
  const describe = result.touched.map((touched) => touched.describe((uid) => `new${uid}`))
  return { blocks: result.blocks, describe, touched: result.touched }
}

const ids = (blocks: readonly DocBlock[]) => blocks.map((block) => block.id)
const texts = (blocks: readonly DocBlock[]) => blocks.map(blockMarkdown)

function refused(ops: Op[], blocks = devis()): unknown {
  try {
    applyOps(blocks, ops, { path: PATH })
  } catch (error) {
    return error
  }
  return null
}

describe("section operations on blocks (AC22)", () => {
  it("should apply the five operations, keep the ids of what stays, and answer each in its words", () => {
    const replaced = apply([
      {
        op: "replace_section",
        section: "Étapes",
        text: "## Étapes\n\n1. Lire le devis.\n2. Vérifier le montant.\n\n### Cas particulier\n\nUn devis de plus de 90 jours se requalifie.",
      },
    ])
    const [etapes, list, cas, p2] = replaced.blocks.slice(2, 6)
    expect([etapes.id, cas.id, p2.id]).toEqual([ETAPES, CAS, P2])
    expect(list.id).toBeNull()
    expect(replaced.blocks).toHaveLength(9)
    expect(replaced.describe[0]).toMatch(/^replaced « Étapes » \(\d+ characters\)$/)
    const dropped = apply([{ op: "replace_section", section: "etapes", text: "1. Lire le devis." }])
    expect(dropped.describe[0]).toMatch(/^replaced « Étapes » \(\d+ characters; removed sub-section « Cas particulier »\)$/)
    // La liste réécrite est un bloc neuf (N12) ; le titre de la section garde le sien.
    expect(ids(dropped.blocks)).toEqual([OBJET, P1, ETAPES, null, REGLES, P3, P4])

    const appended = apply([{ op: "append", section: "Règles", text: "Toujours joindre le devis." }])
    expect(ids(appended.blocks).slice(0, 9)).toEqual(ids(devis()))
    expect(appended.blocks[9]).toMatchObject({ id: null, type: "paragraph", text: "Toujours joindre le devis." })
    // « ## Règles » (9), deux lignes vides, P3 (27), P4 (27), le paragraphe ajouté (26).
    expect(appended.describe[0]).toBe("appended to « Règles » (+26 → 95 characters)")

    const added = apply([{ op: "add_section", section: "Budget", after: "Objet", text: "Montant HT." }])
    expect(texts(added.blocks.slice(2, 5))).toEqual(["## Budget", "Montant HT.", "## Étapes"])
    expect(added.describe[0]).toBe("added « Budget » (22 characters)")
    expect(texts(apply([{ op: "add_section", section: "Budget", text: "Montant HT." }]).blocks.slice(-2))).toEqual(["## Budget", "Montant HT."])

    const deleted = apply([{ op: "delete_section", section: "Étapes" }])
    expect(ids(deleted.blocks)).toEqual([OBJET, P1, REGLES, P3, P4])
    expect(deleted.describe[0]).toBe("deleted « Étapes » and its sub-section « Cas particulier »")

    const edited = apply([{ op: "replace_text", section: "Règles", find: "sans accord", text: "sans l'accord écrit de la personne" }])
    expect(edited.blocks[7]).toMatchObject({ id: P3, text: "Jamais d'envoi sans l'accord écrit de la personne.", revision: 1 })
    expect(edited.describe[0]).toMatch(/^edited « Règles » \(\d+ characters\)$/)
  })

  it("should refuse the whole batch on the first failing operation, prefixed and ended as the contract says", () => {
    const withExamples = [...devis(), ...doc([heading("Exemple", 1), paragraph("a"), heading("Exemple", 1)], 20)]
    const cases: [Op[], string, DocBlock[]?][] = [
      [[{ op: "append", section: "Budget", text: "x" }], "Op 1 (append « Budget »): unknown section « Budget ». Sections: « Objet », « Étapes », « Cas particulier », « Règles »."],
      [
        [{ op: "append", section: "exemple", text: "x" }],
        `Op 1 (append « exemple »): section « exemple » is ambiguous: 2 headings have this title (refs ${ref(blockUuid(20))}, ${ref(blockUuid(22))}); use block operations with one of these refs.`,
        withExamples,
      ],
      [[{ op: "add_section", section: "Objet", text: "x" }], "Op 1 (add_section « Objet »): section « Objet » already exists; use replace_section or append."],
      [[{ op: "add_section", section: "Budget", after: "X", text: "x" }], "Op 1 (add_section « Budget »): unknown section « X » for after. Sections: « Objet », « Étapes », « Cas particulier », « Règles »."],
      [[{ op: "delete_section", section: "Règles" }, { op: "append", text: "x" }], "Op 2 (append): section is required (the title of a section)."],
      [[{ op: "append", section: "Règles" }], "Op 1 (append « Règles »): text is required."],
      [[{ op: "replace_text", section: "Règles", text: "x" }], "Op 1 (replace_text « Règles »): find is required (the exact words to replace)."],
      [
        [{ op: "replace_text", section: "Règles", find: "Jamais d'envoi", text: "x" }],
        "Op 1 (replace_text « Règles »): « Jamais d'envoi » appears 2 times in « Règles »; quote words that appear exactly once.",
      ],
      [
        [{ op: "append", section: "Étapes", text: "a\n\n## Budget" }],
        "Op 1 (append « Étapes »): line 3 « ## Budget » is a heading at the level of « Étapes » or above; add a new section with add_section, or use ### for a sub-section.",
      ],
      [[{ op: "delete_section", section: "Règles", text: "x" }], "Op 1 (delete_section « Règles »): text is not used by delete_section; remove it."],
      [[{ op: "append", section: "Règles", text: "x", block: "objet" }], "Op 1 (append « Règles »): block is not used by append; remove it."],
    ]
    for (const [ops, message, blocks] of cases) {
      expect(refused(ops, blocks), message).toMatchObject({ code: "invalid_arguments", message: `${message} Nothing was written.` })
    }
  })
})

describe("bounds checked by the service (AC23)", () => {
  const long = (chars: number) => "x".repeat(chars)

  it("should refuse 51 operations, a long text, a title on two lines, a large section, page or block count", () => {
    const ops = Array.from({ length: 51 }, (): Op => ({ op: "append", section: "Règles", text: "x" }))
    expect(refused(ops)).toMatchObject({ code: "invalid_arguments", message: "51 operations; 50 at most per call: split them over several calls." })
    expect(refused([{ op: "append", section: "Règles", text: "x" }, { op: "append", section: "Corps", text: long(41_250) }])).toMatchObject({
      code: "too_large",
      message:
        "Op 2 (append « Corps »): text is 41,250 characters; 40,000 at most per operation: send it in parts of about 20,000 with append. Nothing was written.",
    })
    expect(refused([{ op: "add_section", section: "Deux\nlignes", text: "x" }])).toMatchObject({
      message: "Op 1 (add_section « Deux lignes »): a section title holds on one line, 200 characters at most. Nothing was written.",
    })
    const corps = doc([heading("Corps", 1), paragraph(long(40_000)), paragraph(long(40_000))])
    const append = (text: string): Op => ({ op: "append", section: "Corps", text })
    expect(refused([append("a"), append("b"), append(long(20_000))], corps)).toMatchObject({
      code: "too_large",
      message: `Op 3 (append « Corps »): section « Corps » would reach ${(8 + 2 * 40_002 + 3 + 3 + 20_002).toLocaleString("en-US")} characters; a section holds at most 100,000: continue in a new section with add_section. Nothing was written.`,
    })
    const page = doc([heading("A", 1), paragraph(long(95_000)), heading("B", 1), paragraph(long(95_000)), heading("C", 1), paragraph(long(95_000))])
    expect(refused([{ op: "add_section", section: "Annexe", text: long(20_000) }], page)).toMatchObject({
      code: "too_large",
      message: `Op 1 (add_section « Annexe »): ventes/devis would reach ${(3 * (4 + 2 + 95_000) + 4 + 11 + 2 + 20_000).toLocaleString("en-US")} characters; a page holds at most 300,000. Nothing was written.`,
    })
    // Les tailles sont celles du rendu de M05 : une ligne vide entre deux blocs rendus, rien pour un bloc jamais rendu.
    const mixed = doc([heading("A", 1), paragraph("x"), { type: "row", text: null, data: {}, key: "R-1" }, paragraph("y")])
    expect(blocksSize(mixed)).toBe(charCount(renderBlocks(mixed, { headingBase: 2 })))
    const full = doc(Array.from({ length: 1000 }, () => paragraph("x")))
    const anchor = ref(blockUuid(3))
    expect(refused([{ op: "insert_after", block: anchor, text: "y" }], full)).toMatchObject({
      code: "too_large",
      message: `Op 1 (insert_after ${anchor}): ventes/devis would hold 1,001 blocks; a page holds at most 1,000. Nothing was written.`,
    })
  })
})

describe("block operations (AC24)", () => {
  it("should replace, insert, delete and move one block, keeping the id of the block aimed at", () => {
    const objet = apply([{ op: "replace_block", block: "objet", text: "## Objet du devis" }])
    expect(objet.blocks[0]).toMatchObject({ id: OBJET, key: "objet", text: "Objet du devis" })
    expect(objet.describe[0]).toBe("replaced block objet")
    const split = apply([{ op: "replace_block", block: ref(P1), text: "Relancer après 7 jours.\n\nToujours poliment." }])
    expect(split.blocks.slice(1, 3)).toMatchObject([{ id: P1, text: "Relancer après 7 jours." }, { id: null, text: "Toujours poliment." }])
    const added = split.blocks[2] as WorkBlock
    expect(split.describe[0]).toBe(`replaced block ${ref(P1)} (+1 block: new${added.uid})`)

    const inserted = apply([{ op: "insert_after", block: "etapes", text: "Avant tout, relire le contexte." }])
    expect(ids(inserted.blocks).slice(2, 5)).toEqual([ETAPES, null, L1])
    expect(inserted.describe[0]).toBe(`inserted 1 block after etapes (new${(inserted.blocks[3] as WorkBlock).uid})`)
    const first = apply([{ op: "insert_after", text: "Tout début." }])
    expect(first.blocks[0]).toMatchObject({ id: null, text: "Tout début." })
    expect(first.describe[0]).toMatch(/^inserted 1 block at the start \(new\d+\)$/)

    expect(apply([{ op: "delete_block", block: ref(P4) }]).describe[0]).toBe(`deleted block ${ref(P4)}`)
    const headless = apply([{ op: "delete_block", block: "etapes" }])
    expect(ids(headless.blocks)).toEqual([OBJET, P1, L1, CAS, P2, REGLES, P3, P4])
    expect(headless.describe[0]).toBe("deleted block etapes (its blocks now belong to « Objet »)")

    const moved = apply([{ op: "move_block", block: ref(P3), after_block: "objet" }])
    expect(ids(moved.blocks).slice(0, 3)).toEqual([OBJET, P3, P1])
    expect(moved.describe[0]).toBe(`moved block ${ref(P3)} after objet`)
    const placed = placeBlocks(moved.blocks)
    expect(placed.map((block) => block.position).slice(0, 3)).toEqual([1024, 1536, 2048])
    expect(placed[1]).toMatchObject({ revision: 1, provenance: { origin: "import" } })
    const start = apply([{ op: "move_block", block: ref(P3) }])
    expect([ids(start.blocks)[0], start.describe[0], placeBlocks(start.blocks)[0].position]).toEqual([P3, `moved block ${ref(P3)} to the start`, 0])
  })

  it("should check the read revision, structured blocks and keys given by the API", () => {
    const stale = devis().map((block) => (block.id === P1 ? { ...block, revision: 3 } : block))
    expect(refused([{ op: "replace_block", block: P1, revision: 2, text: "x" }], stale)).toMatchObject({
      code: "stale_revision",
      message: `stale revision: block ${ref(P1)} of ventes/devis is at revision 3, not 2. Nothing was written. Read it again, then retry.`,
    })
    const checklist = apply([{ op: "replace_block", block: "etapes", revision: 1, input: { type: "checklist", data: { items: [{ text: "Relire", checked: true }] } } }])
    expect(checklist.blocks[2]).toMatchObject({ id: ETAPES, type: "checklist", text: null, key: null })
    expect(refused([{ op: "replace_block", block: ref(P1), text: "x", input: { type: "paragraph", text: "x" } }])).toMatchObject({
      message: `Op 1 (replace_block ${ref(P1)}): give text or input, not both. Nothing was written.`,
    })
    expect(refused([{ op: "replace_block", block: ref(P1), input: { type: "paragraph", text: "x", key: "etapes" } }])).toMatchObject({
      code: "conflict",
      message: `Op 1 (replace_block ${ref(P1)}): key « etapes » is already used by another block of ventes/devis. Nothing was written.`,
    })
  })

  it("should refuse unknown, short, shared or missing references and fields a block operation does not use", () => {
    const twins = [...devis(), ...doc([paragraph("a"), paragraph("b")], 90)].map((block, index) =>
      index >= 9 ? { ...block, id: `3f9a2c1b-0000-4000-8000-00000000000${index - 9}` } : block,
    )
    const cases: [Op, string, DocBlock[]?][] = [
      [{ op: "replace_block", block: "zz12ab34", text: "x" }, "Op 1 (replace_block zz12ab34): unknown block « zz12ab34 ». Read the page with refs: true (the draft: draft: true, refs: true) to get the references."],
      [{ op: "delete_block", block: ref(P1).slice(0, 7) }, `Op 1 (delete_block ${ref(P1).slice(0, 7)}): unknown block « ${ref(P1).slice(0, 7)} ». Read the page with refs: true (the draft: draft: true, refs: true) to get the references.`],
      [{ op: "delete_block", block: "3f9a2c1b" }, "Op 1 (delete_block 3f9a2c1b): « 3f9a2c1b » matches 2 blocks; give the whole reference read with refs: true.", twins],
      [{ op: "replace_block", text: "x" }, "Op 1 (replace_block): block is required (a reference from read with refs: true)."],
      [{ op: "replace_block", block: "objet" }, "Op 1 (replace_block objet): text is required."],
      [{ op: "replace_block", block: "objet", text: "  " }, "Op 1 (replace_block objet): text is empty; to remove the block use delete_block."],
      [{ op: "move_block", block: "objet", after_block: "objet" }, "Op 1 (move_block objet): a block cannot move after itself."],
      [{ op: "move_block", block: "objet", after_block: "x" }, "Op 1 (move_block objet): unknown block « x » for after_block. Read the page with refs: true to get the references."],
      [{ op: "delete_block", block: "objet", section: "Objet" }, "Op 1 (delete_block objet): section is not used by delete_block; remove it."],
      [{ op: "move_block", block: "objet", text: "x" }, "Op 1 (move_block objet): text is not used by move_block; remove it."],
    ]
    for (const [op, message, blocks] of cases) {
      expect(refused([op], blocks), message).toMatchObject({ code: "invalid_arguments", message: `${message} Nothing was written.` })
    }
  })

  it("should renumber the whole draft when two positions come closer than 1e-6", () => {
    const tight = doc([paragraph("a"), paragraph("b"), paragraph("c")]).map((block, index) => ({ ...block, position: 1 + index * 1e-7 }))
    const inserted = apply([{ op: "insert_after", block: ref(blockUuid(1)), text: "between" }], tight)
    expect(placeBlocks(inserted.blocks).map((block) => block.position)).toEqual([1024, 2048, 3072, 4096])
  })
})
