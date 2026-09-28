// @vitest-environment node
// Analyse du markdown d'une opération de `write` (E03-S03, AC2, AC3) : les formes canoniques rendues par
// le rendu commun de M05, relues à l'identique par `parseMarkdown` ; les analyses et les refus de
// l'AC3, mot pour mot, avec le préfixe et la fin de l'AC22 (servis par `applyOps`).
import { describe, expect, it } from "vitest"
import { blockInputSchema, renderBlocks, type BlockInput } from "../../packages/plateforme/schemas"
import { extractLinks } from "../../packages/plateforme/server/nodes/links"
import { parseMarkdown } from "../../packages/plateforme/server/nodes/markdown-parse"
import { applyOps } from "../../packages/plateforme/server/nodes/ops"

/** Un bloc de chaque type de document, dans les formes du tableau « Formes canoniques » (AC2). */
const CANONICAL: { block: BlockInput; markdown: string }[] = [
  { block: { type: "heading", text: "Étapes", data: { level: 1 } }, markdown: "## Étapes" },
  { block: { type: "heading", text: "Détail", data: { level: 3 } }, markdown: "#### Détail" },
  { block: { type: "paragraph", text: "Voir [[ventes/suivi|le suivi]] et **le devis**.\nDeuxième ligne.", data: {} }, markdown: "Voir [[ventes/suivi|le suivi]] et **le devis**.\nDeuxième ligne." },
  { block: { type: "list", text: null, data: { items: ["Téléphone", "Chat"] } }, markdown: "- Téléphone\n- Chat" },
  { block: { type: "list", text: null, data: { items: ["Réserve", "Écris"], ordered: true, start: 3 } }, markdown: "3. Réserve\n4. Écris" },
  { block: { type: "list", text: null, data: { items: ["Lire\nattentivement", "Écrire"], ordered: true } }, markdown: "1. Lire\n  attentivement\n2. Écrire" },
  { block: { type: "checklist", text: null, data: { items: [{ text: "Relire", checked: false }, { text: "Envoyer", checked: true }] } }, markdown: "- [ ] Relire\n- [x] Envoyer" },
  { block: { type: "code", text: "Exemple :\n```\nx = 1\n```", data: { language: "md" } }, markdown: "````md\nExemple :\n```\nx = 1\n```\n````" },
  { block: { type: "code", text: "select 1", data: {} }, markdown: "```\nselect 1\n```" },
  {
    block: { type: "call", text: null, data: { function: "table.rows", args: { table: "ventes/suivi_prospects", limit: 3 } } },
    markdown: '```call\ntable.rows {"table":"ventes/suivi_prospects","limit":3}\n```',
  },
  { block: { type: "mermaid", text: "graph TD; A-->B", data: {} }, markdown: "```mermaid\ngraph TD; A-->B\n```" },
  { block: { type: "image", text: "Plan du site", data: { src: "https://x.test/p.png", alt: "Plan" } }, markdown: '![Plan](https://x.test/p.png "Plan du site")' },
  { block: { type: "image", text: null, data: { src: "a.png", alt: "" } }, markdown: "![](a.png)" },
  { block: { type: "callout", text: "Attention.", data: { tone: "warning" } }, markdown: "> [!WARNING]\n> Attention." },
  {
    block: { type: "reference", text: null, data: { path: "ventes/suivi_prospects", view: { filter: { statut: "à revoir" } } } },
    markdown: '```reference\nventes/suivi_prospects {"filter":{"statut":"à revoir"}}\n```',
  },
]

const fields = ({ type, text, data }: BlockInput) => ({ type, text: text ?? null, data })

function parsed(text: string): BlockInput[] {
  const result = parseMarkdown(text)
  if ("problem" in result) throw new Error(result.problem)
  return result.blocks
}

/** Le refus servi par `write` pour un texte, par une opération `add_section` (préfixe et fin de l'AC22). */
function refusal(text: string): unknown {
  try {
    applyOps([], [{ op: "add_section", section: "S", text }], { path: "ventes/devis" })
  } catch (error) {
    return error
  }
  return null
}

describe("parseMarkdown — canonical forms of M05 read back (AC2)", () => {
  it("should render each block in its canonical form, one empty line apart, and read each back identically", () => {
    for (const { block, markdown } of CANONICAL) {
      expect(renderBlocks([block]), block.type).toBe(markdown)
      const [back] = parsed(markdown)
      expect(fields(back), markdown).toEqual(fields(block))
      expect(blockInputSchema.safeParse(back).success, markdown).toBe(true)
    }
    const all = CANONICAL.map(({ block }) => block)
    expect(renderBlocks(all)).toBe(CANONICAL.map(({ markdown }) => markdown).join("\n\n"))
    expect(parsed(renderBlocks(all)).map(fields)).toEqual(all.map(fields))
  })
})

describe("parseMarkdown — analyses and refusals (AC3)", () => {
  it("should split paragraphs and lists, read checklists, cut a list at an indented call fence, and ignore comment lines", () => {
    expect(parsed("Étapes :\n1. Lire\n2. Écrire").map(fields)).toEqual([
      { type: "paragraph", text: "Étapes :", data: {} },
      { type: "list", text: null, data: { items: ["Lire", "Écrire"], ordered: true } },
    ])
    expect(parsed("* a\n+ b").map(fields)).toEqual([{ type: "list", text: null, data: { items: ["a", "b"] } }])
    expect(parsed("- [ ] a\n- [X] b").map(fields)).toEqual([
      { type: "checklist", text: null, data: { items: [{ text: "a", checked: false }, { text: "b", checked: true }] } },
    ])
    const steps = '1. Lis le contrat :\n   ```call\n   table.schema {"table": "ventes/suivi_prospects"}\n   ```\n2. Réserve des lignes :'
    expect(parsed(steps).map(fields)).toEqual([
      { type: "list", text: null, data: { items: ["Lis le contrat :"], ordered: true } },
      { type: "call", text: null, data: { function: "table.schema", args: { table: "ventes/suivi_prospects" } } },
      { type: "list", text: null, data: { items: ["Réserve des lignes :"], ordered: true, start: 2 } },
    ])
    expect(parsed("```call\ntable.schema\n```").map(fields)).toEqual([{ type: "call", text: null, data: { function: "table.schema", args: {} } }])
    const withRefs = '<!-- ref: 3f9a2c1b -->\nTexte.\n\n```reference\nventes/suivi\n```\n<!-- → page: Suivi (ventes/suivi) -->'
    expect(parsed(withRefs).map(fields)).toEqual([
      { type: "paragraph", text: "Texte.", data: {} },
      { type: "reference", text: null, data: { path: "ventes/suivi" } },
    ])
    expect(parsed("a\r\nb").map(fields)).toEqual([{ type: "paragraph", text: "a\nb", data: {} }])
  })

  it("should read hostile texts of the largest size a client sends in linear time (N70, security)", () => {
    // Textes qui faisaient tourner les anciennes expressions en temps quadratique ou cubique (revue 1 :
    // de 0,4 s à 11 s) ; en temps linéaire, chacun tient en quelques millisecondes.
    const [separator, n] = [String.fromCharCode(0x2028), 40_000]
    const parsed: [string, string][] = [
      ["heading, spaces", `## x${" ".repeat(n)}y`],
      ["heading, separator", `## ${" ".repeat(n)}x${separator}`],
      ["image", `![${"](".repeat(n / 2)}`],
      ["fence, separator", `${"`".repeat(n)}${separator}`],
      ["tildes, separator", `${"~".repeat(n / 2)}${"a".repeat(n / 2)}${separator}`],
      ["mermaid, spaces (btrim)", `\`\`\`mermaid\na${" ".repeat(n)}b\n\`\`\``],
    ]
    const linked: [string, string][] = [
      ["inline code", `a${"`".repeat(n / 2)}${"b".repeat(n / 2)}`],
      ["brackets", "[[".repeat(n / 2)],
    ]
    const within = (what: string, run: () => unknown) => {
      const started = performance.now()
      run()
      expect(performance.now() - started, what).toBeLessThan(250)
    }
    for (const [what, text] of parsed) within(what, () => parseMarkdown(text))
    for (const [what, text] of linked) {
      within(what, () => extractLinks([{ id: "b0", type: "paragraph", text, data: {}, key: null, position: 1, revision: 1, provenance: {} }]))
    }
    within("key through the API (btrim)", () => blockInputSchema.safeParse({ type: "paragraph", text: "x", key: `a${" ".repeat(250_000)}b` }))
  })

  it("should refuse each malformed text with the words of AC3, prefixed and ended as AC22", () => {
    const cases: [string, string][] = [
      ["Intro.\n\n```python\nx = 1", "a code fence opened on line 3 (```python) is never closed."],
      ["# Titre", "line 1 « # Titre » is the level of the page title; headings start at ##."],
      ["a\n\nb\n##### X", "line 4 « ##### X »: headings go down to #### (three levels)."],
      [`Intro\n#### ${"a".repeat(201)}`, "line 2: a heading holds 200 characters at most (201)."],
      ["a\n\nb\n\n```call\ntable.rows filter\n```", 'line 5: a call block holds <function> {"argument": …}; « table.rows filter » is not followed by a JSON object.'],
      ["a\n```reference\nVentes/X\n```", "line 2: a reference block holds a path such as ventes/relance_devis, then an optional JSON view; « Ventes/X » is not a path."],
      [Array.from({ length: 501 }, (_, index) => `- ${index}`).join("\n"), "line 1: a list holds 500 items at most (501)."],
    ]
    for (const [text, problem] of cases) {
      expect(refusal(text), problem).toMatchObject({
        code: "invalid_arguments",
        message: `Op 1 (add_section « S »): ${problem} Nothing was written.`,
      })
    }
  })
})
