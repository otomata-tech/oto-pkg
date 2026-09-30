// @vitest-environment node
// Les opérations de `write` sur des blocs en mémoire (E03-S03, AC22, AC23, AC24) : effets, id gardés,
// réponses et refus mot pour mot, bornes chiffrées, positions (renumérotation sous 1e-6 comprise).
import { describe, expect, it } from "vitest"
import { renderBlocks, type BlockInput } from "../../packages/plateforme/schemas"
import { planDraftWrites } from "../../packages/plateforme/server/nodes/diff"
import { blockMarkdown, blocksSize, charCount, placeBlocks, type DocBlock } from "../../packages/plateforme/server/nodes/document"
import type { WorkBlock } from "../../packages/plateforme/server/nodes/op-kit"
import { applyOps } from "../../packages/plateforme/server/nodes/ops"
import { blockUuid } from "../helpers/reference-org"
import { TEMPS_LINEAIRE_MS } from "../helpers/temps-lineaire"

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
        "Op 1 (replace_text « Règles »): « Jamais d'envoi » appears 2 times in « Règles »; quote words that appear exactly once. To replace all 2, give count: 2.",
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

describe("replace_text on the page or a block, counted, and set_markdown (E11-S18, AC-10, AC-11)", () => {
  it("should replace in the whole page or in one block, all the occurrences counted, and refuse another number found", () => {
    const page = apply([{ op: "replace_text", find: "Jamais d'envoi", text: "Aucun envoi", count: 2 }])
    expect(page.blocks.slice(7).map((block) => [block.id, block.text])).toEqual([
      [P3, "Aucun envoi sans accord."],
      [P4, "Aucun envoi le week-end."],
    ])
    expect(page.describe[0]).toBe("replaced 2 occurrences of « Jamais d'envoi »")
    const block = apply([{ op: "replace_text", block: ref(P4), find: "Jamais d'envoi", text: "Pas d'envoi" }])
    expect(ids(block.blocks)).toEqual(ids(devis()))
    expect([block.blocks[8].text, block.describe[0]]).toEqual(["Pas d'envoi le week-end.", `edited block ${ref(P4)}`])

    const cases: [Op[], string][] = [
      [
        [{ op: "replace_text", find: "Jamais d'envoi", text: "x" }],
        "Op 1 (replace_text): « Jamais d'envoi » appears 2 times in ventes/devis; quote words that appear exactly once. To replace all 2, give count: 2.",
      ],
      [[{ op: "replace_text", find: "Jamais d'envoi", text: "x", count: 3 }], "Op 1 (replace_text): « Jamais d'envoi » appears 2 times in ventes/devis, not 3 (count)."],
      [
        [{ op: "replace_text", find: "accord.\n\nJamais", text: "x" }],
        "Op 1 (replace_text): « accord.\n\nJamais » spans several blocks of ventes/devis; replace it within one block or one section (give section), or rewrite the page with set_markdown.",
      ],
      [[{ op: "replace_text", section: "Règles", block: ref(P4), find: "Jamais", text: "x" }], "Op 1 (replace_text « Règles »): give section or block, not both."],
    ]
    for (const [ops, message] of cases) expect(refused(ops), message).toMatchObject({ code: "invalid_arguments", message: `${message} Nothing was written.` })
  })

  // Revue E11-S18 : chaque branche de la garde des titres, et un bloc avant le premier titre.
  it("should keep a heading at its level and refuse a heading at the level of the section or above, but not before the first heading", () => {
    const cases: [Op[], string][] = [
      [
        [{ op: "replace_text", section: "Règles", find: "## Règles", text: "### Règles" }],
        "Op 1 (replace_text « Règles »): the title of « Règles » must stay a heading of its level; use replace_block to change it.",
      ],
      [[{ op: "replace_text", find: "## Objet", text: "### Objet" }], "Op 1 (replace_text): the title of « Objet » must stay a heading of its level; use replace_block to change it."],
      [
        [{ op: "replace_text", section: "Règles", find: "Jamais d'envoi sans", text: "## Budget\n\nJamais d'envoi sans" }],
        "Op 1 (replace_text « Règles »): line 1 « ## Budget » is a heading at the level of « Règles » or above; add a new section with add_section, or use ### for a sub-section.",
      ],
      [
        [{ op: "replace_text", find: "Relancer un devis", text: "## Budget\n\nRelancer un devis" }],
        "Op 1 (replace_text): line 1 « ## Budget » is a heading at the level of « Objet » or above; add a new section with add_section, or use ### for a sub-section.",
      ],
    ]
    for (const [ops, message] of cases) expect(refused(ops), message).toMatchObject({ code: "invalid_arguments", message: `${message} Nothing was written.` })
    const before = apply([{ op: "replace_text", find: "Intro.", text: "## Avant\n\nIntro." }], doc([paragraph("Intro."), heading("Objet", 1)]))
    expect(texts(before.blocks)).toEqual(["## Avant", "Intro.", "## Objet"])
  })

  it("should refuse a replacement that would outgrow its bound before building it, and replace 1,000 occurrences in linear time", () => {
    const many = doc([paragraph("ab ".repeat(1_000).trim())])
    const grown = refused([{ op: "replace_text", block: ref(blockUuid(1)), find: "ab", text: "x".repeat(200), count: 1_000 }], many)
    expect(grown).toMatchObject({
      code: "too_large",
      message: `Op 1 (replace_text ${ref(blockUuid(1))}): replacing 1,000 occurrences would bring block ${ref(blockUuid(1))} to about 200,999 characters; 100,000 at most: replace fewer at a time, or with a shorter text. Nothing was written.`,
    })
    const start = performance.now()
    const replaced = apply([{ op: "replace_text", block: ref(blockUuid(1)), find: "ab", text: "cd", count: 1_000 }], many)
    expect(performance.now() - start).toBeLessThan(TEMPS_LINEAIRE_MS)
    expect(replaced.blocks[0].text).toBe("cd ".repeat(1_000).trim())
  })

  it("should replace the whole body, keep the ids of the same blocks, drop a front matter, and refuse an empty text", () => {
    const set = apply([{ op: "set_markdown", text: "---\ntitle: Devis\n---\n\n## Objet\n\nRelancer un devis resté sans réponse.\n\n## Suite\n\nAppeler." }])
    expect(ids(set.blocks)).toEqual([OBJET, P1, null, null])
    expect(texts(set.blocks)).toEqual(["## Objet", "Relancer un devis resté sans réponse.", "## Suite", "Appeler."])
    expect(set.describe[0]).toMatch(/^replaced the whole body \(2 sections, [0-9]+ characters\)$/)
    // À la création : sur un document vide.
    expect(texts(apply([{ op: "set_markdown", text: "## Budget\n\nMontant HT." }], []).blocks)).toEqual(["## Budget", "Montant HT."])
    expect(refused([{ op: "set_markdown", text: "---\ntitle: Devis\n---\n" }])).toMatchObject({
      code: "invalid_arguments",
      message: "Op 1 (set_markdown): text is empty; set_markdown writes the whole body of the page. Nothing was written.",
    })
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
    expect([ids(start.blocks)[0], start.describe[0], placeBlocks(start.blocks)[0].position]).toEqual([P3, `moved block ${ref(P3)} to the start of the page, outside any section`, 0])
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
      // E11-S03 (AC-c1) : une destination à la fois ; la section se trouve comme pour `append` ; un titre ne va pas dans sa section.
      [{ op: "move_block", block: ref(P3), after_block: "objet", section: "Étapes" }, `Op 1 (move_block ${ref(P3)}): give after_block or section, not both.`],
      [{ op: "move_block", block: ref(P3), section: "Budget" }, `Op 1 (move_block ${ref(P3)}): unknown section « Budget ». Sections: « Objet », « Étapes », « Cas particulier », « Règles ».`],
      [{ op: "move_block", block: "etapes", section: "Étapes" }, "Op 1 (move_block etapes): a heading cannot move into the section it heads."],
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

describe("move_block to a section, append that continues a list (E11-S03, AC-c1, AC-c4, AC-c5)", () => {
  it("should move a block to the end of a section, sub-sections included, keeping its revision", () => {
    const moved = apply([{ op: "move_block", block: ref(P1), section: "étapes" }])
    expect(ids(moved.blocks)).toEqual([OBJET, ETAPES, L1, CAS, P2, P1, REGLES, P3, P4])
    expect(moved.describe[0]).toBe(`moved block ${ref(P1)} to the end of « Étapes »`)
    expect(placeBlocks(moved.blocks)[5]).toMatchObject({ id: P1, position: 6656, revision: 1 })
  })

  /** « Tâches » finie par une liste numérotée qui commence à 3, dont un élément a sa sous-liste (E10-S04), puis « Notes ». */
  const taches = (list: BlockInput = { type: "list", text: null, data: { items: ["Lire.", { text: "Écrire.", children: { items: ["Brouillon."] } }], ordered: true, start: 3 } }) =>
    doc([heading("Tâches", 1), list, heading("Notes", 1), paragraph("Rien.")], 30)
  const [TACHES, LIST, NOTES, RIEN] = taches().map((block) => block.id)

  it("should add the new items, sub-items included, to the list before the insertion point, then the other blocks", () => {
    const before = taches()
    const appended = apply([{ op: "append", section: "Tâches", text: "1. Relire.\n   - Vérifier le montant.\n2. Envoyer.\n\nFin de la liste." }], before)
    expect(ids(appended.blocks)).toEqual([TACHES, LIST, null, NOTES, RIEN])
    expect(appended.blocks[1].data).toEqual({
      items: ["Lire.", { text: "Écrire.", children: { items: ["Brouillon."] } }, { text: "Relire.", children: { items: ["Vérifier le montant."] } }, "Envoyer."],
      ordered: true,
      start: 3,
    })
    expect(appended.blocks[2]).toMatchObject({ type: "paragraph", text: "Fin de la liste." })
    const size = blocksSize(appended.blocks.slice(0, 3))
    const added = size - blocksSize(before.slice(0, 2))
    expect(appended.describe[0]).toBe(`appended to « Tâches » (+${added} → ${size} characters; the list continues with 3 more items)`)
    // Écrite comme un `replace_block` : même id, révision de bloc suivante, contenu (donc provenance) réécrit.
    const plan = planDraftWrites(before, placeBlocks(appended.blocks))
    expect(plan.updates.find((update) => update.block.id === LIST)).toMatchObject({ expected: 1, content: true, block: { revision: 2 } })

    const checklist = taches({ type: "checklist", text: null, data: { items: [{ text: "Relire", checked: true }] } })
    const checked = apply([{ op: "append", section: "Tâches", text: "- [ ] Signer." }], checklist)
    expect(ids(checked.blocks)).toEqual([TACHES, LIST, NOTES, RIEN])
    expect(checked.blocks[1].data).toEqual({ items: [{ text: "Relire", checked: true }, { text: "Signer.", checked: false }] })
    expect(checked.describe[0]).toMatch(/; the list continues with 1 more item\)$/)
  })

  it("should start a new list for another kind, another block in between, or beyond 500 items, and say the last", () => {
    const checklist: BlockInput = { type: "checklist", text: null, data: { items: [{ text: "Relire", checked: false }] } }
    const cases: [DocBlock[], string, string][] = [
      [taches(), "Tâches", "- Relire."],
      [taches(checklist), "Tâches", "1. Relire."],
      [taches({ type: "list", text: null, data: { items: ["Lire."] } }), "Tâches", "- [ ] Relire."],
      // La liste d'« Étapes » est suivie de « Cas particulier » : le point d'insertion vient après P2.
      [devis(), "Étapes", "1. Relancer."],
    ]
    for (const [blocks, section, text] of cases) {
      const appended = apply([{ op: "append", section, text }], blocks)
      expect(appended.blocks, text).toHaveLength(blocks.length + 1)
      expect(appended.describe[0], text).toMatch(/ characters\)$/)
    }

    const items = (count: number): BlockInput => ({ type: "list", text: null, data: { items: Array.from({ length: count }, (_, index) => `Élément ${index}.`) } })
    // 498 et 2 font 500 : la liste continue ; 499 et 2, une liste neuve.
    expect(apply([{ op: "append", section: "Tâches", text: "- a\n- b" }], taches(items(498))).blocks).toHaveLength(4)
    const full = apply([{ op: "append", section: "Tâches", text: "- a\n- b" }], taches(items(499)))
    expect(ids(full.blocks)).toEqual([TACHES, LIST, null, NOTES, RIEN])
    expect(full.describe[0]).toMatch(/ characters; a new list starts: a list holds 500 items at most\)$/)
    // 498 au premier niveau, dont un porte un enfant : 499 en tout, sous-éléments compris ; et 2, une liste neuve.
    const nested: BlockInput = { type: "list", text: null, data: { items: [{ text: "Parent.", children: { items: ["Enfant."] } }, ...Array.from({ length: 497 }, (_, index) => `Élément ${index}.`)] } }
    const counted = apply([{ op: "append", section: "Tâches", text: "- a\n- b" }], taches(nested))
    expect(ids(counted.blocks)).toEqual([TACHES, LIST, null, NOTES, RIEN])
    expect(counted.describe[0]).toMatch(/ characters; a new list starts: a list holds 500 items at most\)$/)
  })
})
