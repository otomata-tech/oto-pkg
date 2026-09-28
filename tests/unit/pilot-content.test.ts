// @vitest-environment node
// Contenu du pilote sans base (E06-S01, AC1, AC2) : le module `scripts/lib/pilot-qualification.mjs`, source
// unique du script Démo et des tests, et le contrôle statique des autres documents que le script Démo
// publie (AC14) : blocs au schéma partagé d'E01-S06, titres et résumés bornés, liens déclarés égaux aux
// `[[…]]` lus par le lecteur d'E03-S07, ni vocabulaire ni sujets, adresses en `.test` seulement.
import { describe, expect, it } from "vitest"
import { blockInputSchema, callLocation, splitSections } from "../../packages/plateforme/schemas"
import { isRecord } from "../../packages/plateforme/schemas/tables"
import type { DocBlock } from "../../packages/plateforme/server/nodes/document"
import { extractLinks } from "../../packages/plateforme/server/nodes/links"
import { parseTableHeader } from "../../packages/plateforme/server/tables/header"
import { valueProblem } from "../../packages/plateforme/server/tables/meta"
import * as pilot from "../../scripts/lib/pilot-qualification.mjs"
import { PILOT_FORMULATIONS } from "../integration/pilot-routing.cases"

const { PILOT_CONTEXTS, PILOT_DOMAINS, PILOT_PAGES, PILOT_PROCEDURE, PILOT_TABLE } = pilot

type ModuleBlock = (typeof PILOT_PROCEDURE.blocks)[number]
type ModuleDocument = typeof PILOT_PROCEDURE

const STATES = ["à traiter", "en cours", "à revoir", "qualifié", "écarté"]

/** L'en-tête de la section « Contenu du pilote » de la story, tel quel. */
const HEADER = {
  columns: [
    { name: "ref", type: "text", required: true, max_length: 10 },
    { name: "entreprise", type: "text", required: true, max_length: 120 },
    { name: "ville", type: "text", required: true, max_length: 80 },
    { name: "contact", type: "text", max_length: 120 },
    { name: "email", type: "email" },
    { name: "montant_estime", type: "number" },
    { name: "statut", type: "enum", required: true, options: STATES },
  ],
  key: "ref",
  lifecycle: { column: "statut", states: STATES, working: "en cours", review: { state: "à revoir", approve: "qualifié", reject: "écarté" } },
  closed: true,
}

/** Les dix lignes de la story : ref, entreprise, ville, contact, email, montant estimé, statut ; `null` = cellule vide. */
const ROWS: [string, string, string, string | null, string | null, number | null, string][] = [
  ["P-001", "Boulangerie des Tilleuls", "Valbrune", null, null, null, "à traiter"],
  ["P-002", "Camping Les Pins Bleus", "Saint-Arlan", null, null, null, "à traiter"],
  ["P-003", "Mairie de Valbrune", "Valbrune", "Sophie Lacaze, secrétaire générale", "s.lacaze@mairie-valbrune.test", 6500, "à revoir"],
  ["P-004", "Garage Moreau Frères", "Brémontier", null, null, null, "à traiter"],
  ["P-005", "Ferme du Grand Coudray", "Coudray-sur-Lise", null, null, null, "à traiter"],
  ["P-006", "Clinique vétérinaire des Saules", "Saint-Arlan", "Paul-Henri Rives, vétérinaire associé", "ph.rives@clinique-saules.test", 1500, "à revoir"],
  ["P-007", "Collège des Trois-Chênes", "Brémontier", null, null, null, "à traiter"],
  ["P-008", "Scierie Vallet", "Haute-Lise", "Denis Vallet, gérant", null, null, "à traiter"],
  ["P-009", "Maison de santé du Plateau", "Valbrune", "Inès Barral, coordinatrice", "ines.barral@msp-plateau.test", 6500, "à revoir"],
  ["P-010", "Brasserie de la Lise", "Coudray-sur-Lise", null, null, null, "à traiter"],
]

const COLUMNS = ["ref", "entreprise", "ville", "contact", "email", "montant_estime", "statut"]

/** Chaque chaîne d'une valeur, à toute profondeur. */
function strings(value: unknown): string[] {
  if (typeof value === "string") return [value]
  if (Array.isArray(value)) return value.flatMap(strings)
  if (value !== null && typeof value === "object") return Object.values(value).flatMap(strings)
  return []
}

/** Chaque `null` d'une valeur, par son chemin. */
function nulls(value: unknown, path = "$"): string[] {
  if (value === null) return [path]
  if (Array.isArray(value)) return value.flatMap((item, index) => nulls(item, `${path}[${index}]`))
  if (typeof value === "object" && value !== undefined) return Object.entries(value).flatMap(([key, item]) => nulls(item, `${path}.${key}`))
  return []
}

/** Les blocs d'un document comme les lit le service (`DocBlock`), l'`id` étant le rang du bloc. */
function docBlocks(blocks: readonly ModuleBlock[]): DocBlock[] {
  return blocks.map((block, index) => ({
    id: String(index),
    type: block.type,
    text: block.text ?? null,
    data: block.data ?? {},
    key: block.key ?? null,
    position: 1024 * (index + 1),
    revision: 1,
    provenance: {},
  }))
}

/** Les liens que le lecteur d'E03-S07 tire des blocs, au format du module (`{ block, path, key? }`). */
function linksRead(document: ModuleDocument) {
  return extractLinks(docBlocks(document.blocks)).links.map((link) => ({ block: Number(link.blockId), path: link.path, ...(link.key === null ? {} : { key: link.key }) }))
}

const DOCUMENTS: ModuleDocument[] = [...PILOT_CONTEXTS, ...PILOT_PAGES, PILOT_PROCEDURE]
const MODULE_PATHS = [...DOCUMENTS.map((document) => document.path), PILOT_TABLE.path].filter((path) => path !== null)

describe("pilot table ventes/suivi_prospects (AC1)", () => {
  it("should hold the header and the ten rows of the story: key ref, closed, review queue, 7 « à traiter » and 3 « à revoir », no null, addresses in .test", () => {
    expect(PILOT_TABLE.path).toBe("ventes/suivi_prospects")
    expect(PILOT_TABLE.header).toEqual(HEADER)
    const parsed = parseTableHeader(PILOT_TABLE.header)
    if (!("header" in parsed)) throw new Error(`header refused: ${parsed.problems.join(" ")}`)
    const expected = ROWS.map((values) => {
      const data = Object.fromEntries(COLUMNS.flatMap((column, index) => (values[index] === null ? [] : [[column, values[index]]])))
      return { key: values[0], data }
    })
    expect(PILOT_TABLE.rows).toEqual(expected)

    // Chaque cellule au type de sa colonne, contrôle que la base ne fait pas (E07-S01 AC9).
    for (const row of PILOT_TABLE.rows) {
      expect(blockInputSchema.safeParse({ type: "row", key: row.key, data: row.data }).success, row.key).toBe(true)
      expect(row.data.ref, row.key).toBe(row.key)
      const problems = Object.entries(row.data).flatMap(([name, value]) => {
        const column = parsed.header.columns.find((candidate) => candidate.name === name)
        const problem = column ? valueProblem(column, value) : "undeclared column"
        return problem === null ? [] : [`${name}: ${problem}`]
      })
      expect(problems, row.key).toEqual([])
    }
    const byState = (state: string) => PILOT_TABLE.rows.filter((row) => row.data.statut === state).map((row) => row.key)
    expect(STATES.map((state) => byState(state).length)).toEqual([7, 0, 3, 0, 0])
    expect(byState("à revoir")).toEqual(["P-003", "P-006", "P-009"])
    expect(new Set(PILOT_TABLE.rows.map((row) => row.key)).size).toBe(10)
    expect(nulls(PILOT_TABLE)).toEqual([])
    const emails = PILOT_TABLE.rows.flatMap((row) => (typeof row.data.email === "string" ? [row.data.email] : []))
    expect(emails.filter((email) => !email.endsWith(".test"))).toEqual([])
  })
})

describe("pilot procedure ventes/qualifier_prospects (AC2)", () => {
  it("should hold the title, the summary with both formulations, no header, 14 schema blocks in three sections, and four table calls at steps 2, 3, 5 and 6", () => {
    const procedure = PILOT_PROCEDURE
    expect(procedure.path).toBe("ventes/qualifier_prospects")
    expect(procedure.title).toBe("Qualifier les prospects")
    expect(procedure.summary).toBe(
      "Complète les fiches des prospects (contact, email, montant estimé) avec preuves, puis les rend pour la revue humaine, sans les contacter. On la demande par « qualifie les prospects ».",
    )
    expect([...procedure.summary].length).toBeGreaterThanOrEqual(1)
    expect([...procedure.summary].length).toBeLessThanOrEqual(200)
    // Aucun en-tête (P37) : ni `meta`, ni phrases, ni entrées.
    expect(Object.keys(procedure).sort()).toEqual(["blocks", "label", "links", "path", "summary", "title"])
    for (const formulation of PILOT_FORMULATIONS) expect(procedure.summary.toLowerCase()).toContain(formulation.phrase.toLowerCase())

    const blocks = procedure.blocks
    expect(blocks.map((block) => block.type)).toEqual([
      "heading",
      "paragraph",
      "heading",
      "list",
      "call",
      "list",
      "call",
      "list",
      "call",
      "list",
      "call",
      "list",
      "heading",
      "list",
    ])
    expect(blocks.filter((block) => !blockInputSchema.safeParse(block).success)).toEqual([])
    const sections = splitSections(blocks).flatMap((section) => (section.heading ? [[section.heading.text, section.heading.data]] : []))
    expect(sections).toEqual([
      ["Quand l'utiliser", { level: 1 }],
      ["Étapes", { level: 1 }],
      ["Règles", { level: 1 }],
    ])

    const withIds = docBlocks(blocks)
    const calls = withIds.filter((block) => block.type === "call")
    expect(calls.map((block) => [block.data.function, callLocation(withIds, block.id ?? "")])).toEqual([
      ["table.schema", { section: "Étapes", rank: 1, step: 2 }],
      ["table.claim", { section: "Étapes", rank: 2, step: 3 }],
      ["table.write", { section: "Étapes", rank: 3, step: 5 }],
      ["table.release", { section: "Étapes", rank: 4, step: 6 }],
    ])
    const args = calls.map((block) => (isRecord(block.data.args) ? block.data.args : {}))
    expect(args.map((arg) => arg.table)).toEqual(Array(4).fill("ventes/suivi_prospects"))
    expect(args[1]).toEqual({ table: "ventes/suivi_prospects", worker: "qualification", limit: 3, lease_minutes: 30 })
    expect(args[3]).toEqual({ table: "ventes/suivi_prospects", key: "<ref du prospect>", worker: "qualification", state: "à revoir" })
    // Aucun appel ne pose la colonne d'état : ni `statut` dans une écriture, ni un autre état que « à revoir » rendu.
    expect(JSON.stringify(args).includes('"statut"')).toBe(false)

    // Les étapes se suivent de 1 à 7 à travers les appels (`start` repris après chaque bloc `call`).
    const numbers = blocks.flatMap((block) => {
      const data = block.data ?? {}
      if (block.type !== "list" || data.ordered !== true || !Array.isArray(data.items)) return []
      const start = typeof data.start === "number" ? data.start : 1
      return data.items.map((_, index) => start + index)
    })
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7])
  })
})

describe("documents the Démo script publishes (AC14, static)", () => {
  it("should give each document schema blocks, a bounded title and summary, declared links equal to its [[…]] towards module paths, and nothing else", () => {
    expect(PILOT_DOMAINS).toBe("sales, prospect qualification, energy consulting")
    // Ni vocabulaire ni sujets (ADR-011 § 7) : le module n'exporte que le contenu du pilote.
    expect(Object.keys(pilot).sort()).toEqual(["PILOT_CONTEXTS", "PILOT_DOMAINS", "PILOT_PAGES", "PILOT_PROCEDURE", "PILOT_TABLE"])
    expect(PILOT_CONTEXTS.map((document) => document.path)).toEqual(["contexte", "ventes/contexte", null])
    expect(PILOT_PAGES.map((document) => document.path)).toEqual(["conseil/grille_tarifaire", "ventes/notes_salon_2026"])

    for (const document of [...DOCUMENTS, PILOT_TABLE]) {
      for (const text of [document.title, document.summary]) {
        expect([...text].length, document.path ?? "private").toBeGreaterThanOrEqual(1)
        expect([...text].length, document.path ?? "private").toBeLessThanOrEqual(200)
        expect(/[\r\n]/.test(text), document.path ?? "private").toBe(false)
      }
    }
    for (const document of DOCUMENTS) {
      const label = document.label
      expect(document.blocks.filter((block) => !blockInputSchema.safeParse(block).success), label).toEqual([])
      expect(nulls(document.blocks), label).toEqual([])
      expect(document.links, label).toEqual(linksRead(document))
      expect(document.links.filter((link) => !MODULE_PATHS.includes(link.path)), label).toEqual([])
    }

    // Adresses fictives (ADR-010) : tout email et tout lien du module sont en `.test`.
    const texts = strings(pilot)
    const emails = texts.flatMap((text) => text.match(/[^\s@<>]+@[^\s@<>]+/g) ?? []).map((email) => email.replace(/[.,;:)]+$/, ""))
    const urls = texts.flatMap((text) => text.match(/https?:\/\/[^\s)"]+/g) ?? [])
    expect(emails.length).toBeGreaterThan(0)
    expect(emails.filter((email) => !email.endsWith(".test"))).toEqual([])
    expect(urls.filter((url) => !new URL(url).hostname.endsWith(".test"))).toEqual([])
  })
})
