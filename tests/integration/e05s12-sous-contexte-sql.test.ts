// @vitest-environment node
// Des contenus rangés sous un Contexte (E05-S12, D110 ; AC-23, AC-24), sur une base réelle portable : l'organisation O
// de `reference-org.ts` semée par la connexion d'administration, chaque geste fait par le service sous la personne.
// `write` crée page, tableau et procédure sous `contexte`, `ventes/contexte` et `private/claire/contexte` ; `moveNode` y
// range un nœud ; le Contexte ne bouge pas ; l'enfant d'un Contexte privé n'est lu que de sa personne ; un membre sans
// écriture est refusé en disant à qui demander. Aucun code serveur ne change pour ces gestes (HN-E05S12-27) : ce test
// les fige. Puis `context` liste, dans la partie de chaque Contexte, ses pages, tableaux et procédures publiés que la
// personne lit, jamais un brouillon, un nœud à la corbeille ni un nœud illisible (D110 b).
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { buildContext } from "../../packages/plateforme/server/context"
import { moveNode } from "../../packages/plateforme/server/nodes/move"
import { readNode } from "../../packages/plateforme/server/nodes/read"
import { writeNode } from "../../packages/plateforme/server/nodes/write"
import { TEAMS, type Person } from "../helpers/reference-org"
import { seedReferenceOrg, type ReferenceOrgSql } from "../helpers/reference-org-sql"
import { portable, seedWithAdmin, sqlConfigured, type SeededData } from "../helpers/sql"
import { privateFolderPending, privateFolderSuite } from "../helpers/pending-migrations"

// Le dossier `private` en base (fiche D107) : sautés, la version nommée, tant que 20260928120000 n'est pas appliquée.
const privatePending = await privateFolderPending()

const NETWORK_TIMEOUT = 120_000
const SETUP_TIMEOUT = 180_000
const HUMAN = { kind: "human" } as const

/** Les trois natures créées sous chaque Contexte : `<segment>` et son titre. */
const KINDS = [
  { kind: "page", segment: "charte", title: "Charte" },
  { kind: "table", segment: "annuaire", title: "Annuaire" },
  { kind: "procedure", segment: "accueillir", title: "Accueillir un client" },
] as const

/** L'entrée de `write` qui crée et publie un contenu de cette nature (un tableau exige son en-tête). */
function creation(path: string, { kind, title }: (typeof KINDS)[number]): Record<string, unknown> {
  const content =
    kind === "table"
      ? { header: { columns: [{ name: "nom", type: "text", required: true }], key: "nom" } }
      : { ops: [{ op: "insert_after", input: { type: "paragraph", text: `${title} : première étape.` } }] }
  return { path, kind, title, summary: `${title}, rangé sous le Contexte.`, publish: true, ...content }
}

const line = (path: string, title: string) => `- ${path} — ${title} — ${title}, rangé sous le Contexte.`

describe.skipIf(!sqlConfigured || privatePending)(privateFolderSuite(portable("contents under a Contexte (E05-S12, AC-23, AC-24)"), privatePending), { timeout: NETWORK_TIMEOUT }, () => {
  let seed: SeededData
  let ref: ReferenceOrgSql

  beforeAll(async () => {
    seed = seedWithAdmin()
    ref = await seedReferenceOrg(seed, {
      nodes: [
        { path: "private/claire/contexte" },
        // Une procédure publiée sous le Contexte de Tout le monde, à l'équipe Ventes : Paul (Support) ne la lit pas.
        { path: "contexte/offres_ventes", kind: "procedure", title: "Offres de Ventes", summary: "Offres de Ventes, rangé sous le Contexte.", owner: { kind: "team", teamId: TEAMS.ventes.id, userId: null } },
      ],
    })
  }, SETUP_TIMEOUT)

  afterAll(async () => {
    await seed?.cleanup()
  }, SETUP_TIMEOUT)

  const write = async (person: Person, input: Record<string, unknown>) => writeNode(await ref.db(person), ref.identityOf(person), input, HUMAN)
  const served = async (person: Person) => (await buildContext(await ref.db(person), ref.identityOf(person), {}, { userAgent: null })).text
  /** La liste des enfants de la partie qui commence par `header`, sans son titre. */
  const listed = (text: string, header: string) => {
    const part = text.slice(text.indexOf(`\n\n${header}`) + 2).split("\n\n## ")[0]
    const lines = part.split("\n")
    const start = lines.indexOf("Pages, tables and procedures here:")
    return start === -1 ? [] : lines.slice(start + 1).filter((entry) => entry.startsWith("- "))
  }

  /**
   * Les gestes de l'AC-24, faits une fois pour le fichier (chaque `it` les attend, et passe lancé seul) : trois
   * natures sous chaque Contexte, puis `ventes/devis` rangé sous celui de Ventes ; rend les textes de `write` et la
   * cible du déplacement.
   */
  let made: Promise<{ outputs: [string, string][]; moved: string }> | undefined
  function created() {
    made ??= (async () => {
      const places: [Person, string][] = [
        ["ada", "contexte"],
        ["claire", "ventes/contexte"],
        ["claire", "private/claire/contexte"],
      ]
      const outputs: [string, string][] = []
      for (const [person, context] of places) {
        for (const spec of KINDS) outputs.push([`${context}/${spec.segment}`, (await write(person, creation(`${context}/${spec.segment}`, spec))).text])
      }
      const moved = await moveNode(await ref.db("claire"), ref.identityOf("claire"), { path: "ventes/devis", new_path: "ventes/contexte/devis" })
      return { outputs, moved: moved.target }
    })()
    return made
  }

  it("should create a page, a table and a procedure under each Contexte, move a node under one, never move the Contexte (AC-24)", async () => {
    const { outputs, moved } = await created()
    for (const [path, text] of outputs) expect(text, path).toMatch(new RegExp(`(^|\\n)Published ${path} revision 1`))
    expect(outputs).toHaveLength(9)
    expect(moved).toBe("ventes/contexte/devis")
    await expect(moveNode(await ref.db("claire"), ref.identityOf("claire"), { path: "ventes/contexte", new_path: "ventes/contexte_bis" })).rejects.toMatchObject({
      code: "invalid_arguments",
      message: "ventes/contexte cannot move: a Contexte stays at the head of its team; move the pages inside it instead.",
    })

    // L'enfant d'un Contexte privé : lu de sa personne seule, ni d'un membre ni d'une administratrice.
    expect((await readNode(await ref.db("claire"), ref.identityOf("claire"), { path: "private/claire/contexte/charte" })).text).toContain("Charte : première étape.")
    for (const other of ["lea", "ada"] as const) {
      await expect(readNode(await ref.db(other), ref.identityOf(other), { path: "private/claire/contexte/charte" }), other).rejects.toMatchObject({ code: "not_found" })
    }

    // Léa lit le Contexte de Tout le monde sans l'écrire : refusée, avec à qui demander (inchangé).
    await expect(write("lea", creation("contexte/idee", KINDS[0]))).rejects.toMatchObject({
      code: "forbidden",
      message: expect.stringContaining("under contexte is reserved to"),
    })
  })

  it("should list the published pages, tables and procedures under each served Contexte that the person reads, never a draft, a trashed or an unreadable one (AC-23)", async () => {
    await created()
    // Un brouillon et une procédure mise à la corbeille, sous le Contexte de Tout le monde.
    await write("ada", { ...creation("contexte/brouillon", KINDS[2]), publish: false })
    await write("ada", creation("contexte/jetee", KINDS[2]))
    await seed.admin`update platform.nodes set deleted_at = now() where org_id = ${ref.org.id} and path = 'contexte/jetee'`

    const claire = await served("claire")
    expect(listed(claire, "## Context: everyone")).toEqual([
      line("contexte/accueillir", "Accueillir un client"),
      line("contexte/annuaire", "Annuaire"),
      line("contexte/charte", "Charte"),
      line("contexte/offres_ventes", "Offres de Ventes"),
    ])
    expect(listed(claire, "## Context: you only")).toEqual([
      line("private/claire/contexte/accueillir", "Accueillir un client"),
      line("private/claire/contexte/annuaire", "Annuaire"),
      line("private/claire/contexte/charte", "Charte"),
    ])
    expect(listed(claire, "## Context: team Ventes")).toEqual([
      line("ventes/contexte/accueillir", "Accueillir un client"),
      line("ventes/contexte/annuaire", "Annuaire"),
      line("ventes/contexte/charte", "Charte"),
      "- ventes/contexte/devis — ventes/devis — Summary of ventes/devis.",
    ])
    // Lignes d'index seulement : jamais le corps d'un enfant.
    expect(claire).not.toContain("première étape")
    // Paul ne lit pas la procédure de Ventes rangée sous le Contexte de Tout le monde.
    expect(listed(await served("paul"), "## Context: everyone").map((entry) => entry.split(" — ")[0])).toEqual([
      "- contexte/accueillir",
      "- contexte/annuaire",
      "- contexte/charte",
    ])
  })
})
