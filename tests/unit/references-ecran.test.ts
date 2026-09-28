// @vitest-environment node
// Les blocs `reference` rendus en place à l'écran (E07-S03, AC15, AC16 ; H56, H68, H123) :
// `resolveReferencesForScreen` sur une base réelle (E01-S10, lot t1-b), la fixture d'E07-S01 semée une fois
// pour le fichier (`seedTableFixture`) : la base rend toute ligne de l'organisation que les filtres
// demandent, la RLS d'isolation seule, sans règle d'accès ; l'espion (`spyDb`) montre ce qui n'est pas lu.
// Les blocs affichés sont construits en mémoire ; les nœuds cités, les tableaux et leurs lignes sont ceux de
// la fixture. En suite portable (`sqlConfigured`) : le projet, ou le Postgres nu du job `bare-postgres`.
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import type { BlockView } from "@otomata_tech/oto_platform/schemas"
import { resolveReferencesForScreen } from "../../packages/plateforme/server/nodes/references-screen"
import { aliasRow, identityOf, type Person } from "../helpers/reference-org"
import type { ReferenceOrgSql } from "../helpers/reference-org-sql"
import { spyDb, touches, type SpiedCall } from "../helpers/spy-t1-b"
import { sqlConfigured, seedWithAdmin, type SeededData, portable } from "../helpers/sql"
import { PROSPECTS, PROSPECTS_HEADER } from "../factories/table-fixture"
import { seedTableFixture } from "../factories/table-fixture-sql"

const NETWORK_TIMEOUT = 60_000
const SETUP_TIMEOUT = 180_000

function reference(id: string, data: Record<string, unknown>): BlockView {
  return { id, ref: id, type: "reference", text: null, data, key: null, position: 1, revision: 1, provenance: {} }
}

/** Les requêtes qui lisent ou écrivent `table`, par l'une ou l'autre face. */
const callsTo = (calls: SpiedCall[], table: string) => calls.filter((one) => touches(one, table))

describe.skipIf(!sqlConfigured)(portable("reference blocks on screen, on a real database"), { timeout: NETWORK_TIMEOUT }, () => {
  let seed: SeededData
  let ref: ReferenceOrgSql

  beforeAll(async () => {
    seed = seedWithAdmin()
    ref = await seedTableFixture(seed)
  }, SETUP_TIMEOUT)

  afterAll(async () => {
    await seed?.cleanup()
  }, SETUP_TIMEOUT)

  /** L'identité de la personne dans O, préfixe `acme` des textes servis (l'organisation simulée, son identifiant réel). */
  const who = (person: Person) => ref.identityOf(person, { org: identityOf(person).org })

  describe("resolveReferencesForScreen, views (AC15)", () => {
    it("should resolve a view: the key column first when columns omit it, once, the first rows of the filter and their total", async () => {
      const db = await ref.db("lea")
      const vue = { filter: { ville: "Valbrune" }, columns: ["ville", "statut"], limit: 2 }
      const resolu = await resolveReferencesForScreen(db, who("lea"), [reference("r1", { path: PROSPECTS.path, view: vue })])
      expect(resolu.r1).toMatchObject({ kind: "view", path: PROSPECTS.path, title: PROSPECTS.title, key: "entreprise", total: 3 })
      const view = resolu.r1
      if (!("rows" in view)) throw new Error("vue attendue")
      expect(view.columns.map((colonne) => colonne.name)).toEqual(["entreprise", "ville", "statut"])
      expect(view.rows).toEqual([
        { key: "Atelier 2", revision: 1, set: { ville: "Valbrune", statut: "à traiter" } },
        { key: "Boulangerie Fournier", revision: 2, set: { ville: "Valbrune", statut: "à traiter" } },
      ])

      // La clé citée par `columns` reste à sa place ; sans `columns`, toutes les colonnes déclarées : jamais deux fois.
      const colonnes = async (vueDuBloc: Record<string, unknown>) => {
        const lue = (await resolveReferencesForScreen(db, who("lea"), [reference("r2", { path: PROSPECTS.path, view: vueDuBloc })])).r2
        if (!("rows" in lue)) throw new Error("vue attendue")
        return lue.columns.map((colonne) => colonne.name)
      }
      expect(await colonnes({ columns: ["statut", "entreprise"], limit: 1 })).toEqual(["statut", "entreprise"])
      expect(await colonnes({ limit: 1 })).toEqual(PROSPECTS_HEADER.columns.map((colonne) => colonne.name))
    })

    it("should say why a view is unreadable: limit beyond 20, unknown key, unknown column, refused filter, a path that is not a table", async () => {
      const blocs = [
        reference("limite", { path: PROSPECTS.path, view: { limit: 21 } }),
        reference("cle", { path: PROSPECTS.path, view: { q: "valbrune" } }),
        reference("colonne", { path: PROSPECTS.path, view: { columns: ["couleur"] } }),
        reference("filtre", { path: PROSPECTS.path, view: { filter: { montant_estime: { gte: "beaucoup" } } } }),
        reference("page", { path: "conseil/grille_tarifaire", view: { limit: 5 } }),
      ]
      const resolu = await resolveReferencesForScreen(await ref.db("lea"), who("lea"), blocs)
      expect(resolu).toEqual({
        limite: { kind: "view", path: PROSPECTS.path, error: "invalid_arguments", reason: "limit" },
        cle: { kind: "view", path: PROSPECTS.path, error: "invalid_arguments", reason: "unknown_key", detail: "q" },
        colonne: { kind: "view", path: PROSPECTS.path, error: "invalid_arguments", reason: "unknown_column", detail: "couleur" },
        filtre: { kind: "view", path: PROSPECTS.path, error: "invalid_arguments", reason: "filter" },
        page: { kind: "view", path: "conseil/grille_tarifaire", error: "invalid_arguments", reason: "not_a_table", detail: "conseil/grille_tarifaire" },
      })
    })

    it("should answer not_found for a table of level 0 that the base returns, without reading any of its rows", async () => {
      const { db, calls } = spyDb(await ref.db("marc"))
      const resolu = await resolveReferencesForScreen(db, who("marc"), [reference("r1", { path: PROSPECTS.path, view: { limit: 5 } })])
      expect(resolu).toEqual({ r1: { kind: "view", path: PROSPECTS.path, error: "not_found", reason: "not_found" } })
      expect(callsTo(calls, "blocks")).toEqual([])
    })

    it("should resolve the first ten references only, with the levels of the cited nodes read in one batch", async () => {
      const { db, calls } = spyDb(await ref.db("lea"))
      const cibles = ["conseil/grille_tarifaire", "ventes/qualifier_prospects", PROSPECTS.path]
      const blocs = Array.from({ length: 11 }, (_, rang) => reference(`r${rang}`, { path: cibles[rang % 3] }))
      const resolu = await resolveReferencesForScreen(db, who("lea"), blocs)
      expect(Object.keys(resolu)).toEqual(blocs.slice(0, 10).map((bloc) => bloc.id))
      expect(callsTo(calls, "access_rules")).toHaveLength(1)
      expect(await resolveReferencesForScreen(db, who("lea"), [{ ...blocs[0], type: "paragraph", text: "Sans référence.", data: {} }])).toEqual({})
    })
  })

  describe("resolveReferencesForScreen, cards (AC16)", () => {
    it("should give the card of a cited node, of its current path when cited by an old one, and not_found for a node of level 0", async () => {
      // L'ancien chemin de la grille, écrit pour ce cas ; les autres cas n'en citent aucun.
      await ref.write({ node_aliases: [aliasRow("conseil/ancienne_grille", "conseil/grille_tarifaire")] })
      const blocs = [reference("carte", { path: "conseil/grille_tarifaire" }), reference("ancien", { path: "conseil/ancienne_grille" }), reference("tableau", { path: PROSPECTS.path })]
      const resolu = await resolveReferencesForScreen(await ref.db("lea"), who("lea"), blocs)
      expect(resolu.carte).toEqual({ kind: "card", path: "conseil/grille_tarifaire", title: "Grille tarifaire", nodeKind: "page", summary: "Les tarifs du conseil." })
      expect(resolu.ancien).toEqual({ ...resolu.carte, movedFrom: "conseil/ancienne_grille" })
      expect(resolu.tableau).toMatchObject({ kind: "card", nodeKind: "table", title: PROSPECTS.title })

      const cache = await resolveReferencesForScreen(await ref.db("marc"), who("marc"), [reference("procedure", { path: "ventes/qualifier_prospects" })])
      expect(cache).toEqual({ procedure: { kind: "card", path: "ventes/qualifier_prospects", error: "not_found", reason: "not_found" } })
    })
  })
})
