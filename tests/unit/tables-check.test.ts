// @vitest-environment node
// Contrôle propre des six fonctions `table.*` à la publication d'une procédure (E07-S02, AC26 ; H60,
// N18) : `checkArgs` appelé comme E03-S06 l'appelle, espaces réservés reconnus par `isPlaceholderValue`
// (`schemas/procedures.ts`), sur la fixture d'E07-S01. Les problèmes sont des phrases sans emplacement,
// comparées mot pour mot ; le contrôle n'écrit rien. Réécrit sur base réelle par E01-S10 (lot t1-c1a,
// fiche D76 A) : une graine par fichier (`seedTableFixture`), l'espion des requêtes (`dbSpy`) à la place
// de celui de la base simulée, et la panne qu'il rend à la place de la base (M10).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { isPlaceholderValue } from "../../packages/plateforme/schemas"
import type { CatalogFunction } from "../../packages/plateforme/server/catalog/define"
import type { Identity } from "../../packages/plateforme/server/identity"
import { tableAggregate } from "../../packages/plateforme/server/tables/aggregate"
import { tableClaim } from "../../packages/plateforme/server/tables/claim"
import { tableRelease } from "../../packages/plateforme/server/tables/release"
import { tableRows } from "../../packages/plateforme/server/tables/rows"
import { tableSchema } from "../../packages/plateforme/server/tables/schema"
import { tableWrite } from "../../packages/plateforme/server/tables/write"
import { teamOf } from "../helpers/reference-org"
import type { ReferenceOrgSql } from "../helpers/reference-org-sql"
import { dbSpy, isWrite } from "../helpers/spy-t1-c1a"
import { sqlConfigured, seedWithAdmin, type SeededData, portable } from "../helpers/sql"
import { PROSPECTS, TICKETS } from "../factories/table-fixture"
import { seedTableFixture } from "../factories/table-fixture-sql"
import { CASE_TIMEOUT, clientOf, SEED_TIMEOUT } from "../factories/table-rows-sql"

const TABLE = PROSPECTS.path
const COLUMNS = "entreprise, contact, email, ville, montant_estime, dernier_contact, relance_le, actif, notes, statut"
const ACCEPTED = "states accepted by table.release: à traiter, à revoir"
const unknown = (name: string) => `unknown column « ${name} »; columns: ${COLUMNS}`
const nullRefused = (name: string) => `${name}: null is refused: use clear to empty a field, or verified_empty with a reason for 'searched, nothing found'`
const proofRequired = (name: string) => `${name}: a new value needs its proof: write {"value": …, "comment": "…"} or {"value": …, "link": "…"}`

/** La valeur à un chemin d'arguments, comme E03-S06 la lit pour `isPlaceholder`. */
function valueAt(value: unknown, path: readonly PropertyKey[]): unknown {
  return path.reduce<unknown>((current, key) => (current !== null && typeof current === "object" ? Reflect.get(current, key) : undefined), value)
}

describe.skipIf(!sqlConfigured)(portable("checkArgs of the table functions on a real database"), { timeout: CASE_TIMEOUT }, () => {
  let seed: SeededData
  let ref: ReferenceOrgSql

  beforeAll(async () => {
    seed = seedWithAdmin()
    ref = await seedTableFixture(seed)
  }, SEED_TIMEOUT)

  afterAll(async () => {
    await seed?.cleanup()
  }, SEED_TIMEOUT)

  /** Les problèmes de `checkArgs` pour ces arguments, et l'espion des requêtes. */
  async function check(fn: CatalogFunction, args: Record<string, unknown>, identity: Identity = ref.identityOf("lea")) {
    const spy = dbSpy()
    const problems = await fn.checkArgs?.({ db: await clientOf(ref, identity, spy), identity }, args, (path) => isPlaceholderValue(valueAt(args, path)))
    return { problems, calls: spy.calls }
  }

  async function problemsOf(fn: CatalogFunction, args: Record<string, unknown>, identity?: Identity): Promise<string[] | undefined> {
    return (await check(fn, args, identity)).problems
  }

  describe("checkArgs of the table functions (AC26)", () => {
    it("should check the table, the columns, the literal values and the states, skip placeholders, and write nothing", async () => {
      const cases: [CatalogFunction, Record<string, unknown>, string[]][] = [
        [tableSchema, { table: "ventes/suivi" }, ["unknown table ventes/suivi (or not visible to you)"]],
        [tableSchema, { table: "conseil/grille_tarifaire" }, ["conseil/grille_tarifaire is a page, not a table"]],
        [tableRows, { table: TABLE, filter: { couleur: "bleu" }, columns: ["taille"], sort: { column: "poids" } }, [unknown("taille"), unknown("poids"), unknown("couleur")]],
        [tableRows, { table: TABLE, filter: { montant_estime: "15000", ville: "<ville>", dernier_contact: { gte: "<depuis>" } } }, ['montant_estime is a number column: expected a number, e.g. 12000 (not "15000")']],
        [tableAggregate, { table: TABLE, where: { couleur: 1 }, group_by: "taille", metrics: [{ op: "sum", column: "poids" }, { op: "avg" }] }, [unknown("taille"), unknown("poids"), unknown("couleur")]],
        [
          tableWrite,
          { table: TABLE, rows: [{ key: "<ref>", set: { couleur: "bleu", montant_estime: "15000", statut: "en cours" }, clear: ["taille"], verified_empty: [{ column: "poids", reason: "<où>" }] }] },
          [
            unknown("couleur"),
            unknown("taille"),
            unknown("poids"),
            proofRequired("montant_estime"),
            'montant_estime: expected a number, e.g. 12000 (not "15000")',
            "statut: « en cours » is set only by table.claim, with a lease",
          ],
        ],
        // Fiche D100 (HN-M53-10) : une valeur d'une colonne de valeur porte sa preuve ; la colonne d'état s'écrit nue,
        // une cellule entière réservée reste libre (le modèle y met sa preuve).
        [
          tableWrite,
          { table: TABLE, rows: [{ key: "<ref>", set: { ville: "Lyon", montant_estime: { value: 12000 }, contact: { value: "Ada", comment: "<page lue>" }, notes: "<notes>", statut: "à revoir" } }] },
          [proofRequired("ville"), proofRequired("montant_estime")],
        ],
        [tableWrite, { table: TABLE, rows: [{ key: "<ref>", set: { statut: "qualifié" } }] }, ["statut: « qualifié » and « écarté » are decided by a person in the review queue"]],
        // Un `null` passe le schéma (D49 B) mais refuserait sa ligne à chaque passage : refusé à la publication, colonne clé comprise (AC4).
        [tableWrite, { table: TABLE, rows: [{ key: "<ref>", set: { contact: null, entreprise: { value: null } } }] }, [nullRefused("contact"), nullRefused("entreprise")]],
        [tableWrite, { table: TABLE, rows: [{ key: "<ref>", set: { contact: { value: "<nom>", link: "<url de la preuve>" }, statut: "à revoir" }, verified_empty: [{ column: "email", reason: "<où>" }] }] }, []],
        [tableClaim, { table: TABLE, worker: "<prénom>", filter: { statut: "gagné" } }, ["statut is an enum column: expected one of: à traiter, en cours, à revoir, qualifié, écarté"]],
        [tableRelease, { table: TABLE, key: "<ref>", worker: "<prénom>", state: "en cours" }, [`state « en cours » is set only by table.claim; ${ACCEPTED}`]],
        [tableRelease, { table: TABLE, key: "<ref>", worker: "<prénom>", state: "qualifié" }, [`state « qualifié » is decided by a person in the review queue; ${ACCEPTED}`]],
        [tableRelease, { table: TABLE, key: "<ref>", worker: "<prénom>", state: "gagné" }, [`unknown state « gagné »; ${ACCEPTED}`]],
        [tableRelease, { table: TABLE, key: "<ref>", worker: "<prénom>", state: "<état>" }, []],
        [tableRelease, { table: TABLE, key: "<ref>", worker: "<prénom>", state: "à revoir" }, []],
      ]
      for (const [fn, args, expected] of cases) {
        const { problems, calls } = await check(fn, args)
        expect(problems, `${fn.name} ${JSON.stringify(args)}`).toEqual(expected)
        expect(calls.filter(isWrite)).toEqual([])
      }
      // Un tableau que qui publie ne lit pas est inconnu ; un tableau sans file n'a ni `claim` ni `release`.
      const marc = ref.identityOf("marc", { teams: [teamOf("support", "marc")] })
      expect(await problemsOf(tableRows, { table: TABLE }, marc)).toEqual(["unknown table ventes/suivi_prospects (or not visible to you)"])
      for (const fn of [tableClaim, tableRelease]) {
        expect(await problemsOf(fn, { table: TICKETS.path, key: "<n>", worker: "<prénom>" }, ref.identityOf("paul")), fn.name).toEqual(["support/tickets has no work queue (no lifecycle)"])
      }
      // Un jeton que la base refuse (M10) n'est pas un problème de la procédure : il remonte, `unauthorized`.
      // La base le refuse ici par l'espion, à la première requête, sur l'une ou l'autre face du client.
      const logged = vi.spyOn(console, "error").mockImplementation(() => undefined)
      const lea = ref.identityOf("lea")
      const expired = dbSpy(() => ({ code: "PGRST301" }))
      await expect(tableRows.checkArgs?.({ db: await clientOf(ref, lea, expired), identity: lea }, { table: TABLE }, () => false)).rejects.toMatchObject({ code: "unauthorized" })
      logged.mockRestore()
    })

    it("should skip every check of the table when the table is a placeholder, without reading anything", async () => {
      for (const fn of [tableSchema, tableRows, tableAggregate, tableWrite, tableClaim, tableRelease]) {
        const { problems, calls } = await check(fn, { table: "<tableau>", worker: "<prénom>", key: "<ref>", state: "en cours", rows: [{ key: "<ref>", set: { couleur: 1 } }] })
        expect([problems, calls], fn.name).toEqual([[], []])
      }
    })
  })

  describe("E11-S01: create_only, strict column, decisions by the assistant, proof by table", () => {
    it("should refuse create_only on a closed table (AC-a6)", async () => {
      const args = { table: TICKETS.path, create_only: true, rows: [{ key: "<numero>", set: { sujet: "<sujet>" } }] }
      expect(await problemsOf(tableWrite, args, ref.identityOf("paul"))).toEqual(["create_only on a closed table: no row can be created"])
      expect(await problemsOf(tableWrite, { ...args, create_only: false }, ref.identityOf("paul"))).toEqual([])
    })

    it("should admit a bare value without proof, decisions by the assistant, and refuse verified_empty on a column that needs a real value (AC-b6, AC-e4, AC-f6)", async () => {
      const id = ref.nodeId(TABLE)
      // Le tableau sans preuve exigée, sa revue confiée aussi à l'assistant, `email` (rang 2) sans `verified_empty`.
      await seed.admin`
        update platform.nodes
           set meta = jsonb_set(jsonb_set(jsonb_set(meta, '{proof}', 'false'::jsonb), '{lifecycle,review,agents_may_decide}', 'true'::jsonb), '{columns,2,allow_verified_empty}', 'false'::jsonb)
         where id = ${id}`
      try {
        const cases: [CatalogFunction, Record<string, unknown>, string[]][] = [
          [tableWrite, { table: TABLE, rows: [{ key: "<ref>", set: { ville: "Valbrune" } }] }, []],
          [tableWrite, { table: TABLE, rows: [{ key: "<ref>", set: { montant_estime: "15000", contact: null } }] }, ['montant_estime: expected a number, e.g. 12000 (not "15000")', nullRefused("contact")]],
          [tableWrite, { table: TABLE, rows: [{ key: "<ref>", set: { statut: "qualifié" } }] }, []],
          [tableRelease, { table: TABLE, key: "<ref>", worker: "<prénom>", state: "écarté" }, []],
          [tableWrite, { table: TABLE, rows: [{ key: "<ref>", verified_empty: [{ column: "email", reason: "<où>" }] }] }, ["email: needs a real value; verified_empty is not allowed for this column"]],
        ]
        for (const [fn, args, expected] of cases) expect(await problemsOf(fn, args), `${fn.name} ${JSON.stringify(args)}`).toEqual(expected)
      } finally {
        await seed.admin`
          update platform.nodes
             set meta = jsonb_set(jsonb_set(meta, '{proof}', 'true'::jsonb), '{columns,2}', (meta #> '{columns,2}') - 'allow_verified_empty') #- '{lifecycle,review,agents_may_decide}'
           where id = ${id}`
      }
    })
  })
})
