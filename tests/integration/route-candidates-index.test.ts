// @vitest-environment node
// Candidats du routage par index, droits avant la coupe (E01-S13, partie a : AC-a1, AC-a2, AC-a4), en
// suites portables (`sqlConfigured` : le projet Supabase, ou le Postgres nu du job `bare-postgres`).
// La fonction d'avant est celle de la ligne de base d'E01-S09, gardée dans
// `fixtures/route-candidates-avant.sql` depuis que la ligne de base V1 l'a repliée (E01-S12 partie d) :
// recréée dans `pg_temp`, dans la transaction annulée où les deux versions sont appelées sous le même
// appelant (le rôle `authenticated` et ses claims, comme le pose `server/sql.ts`). Le plan de la
// présélection est hors de `pnpm test` (AC-a3 : `tests/sql/route-candidates-plan.sql`).
import fs from "fs"
import path from "path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { SHOW_THRESHOLD, TEAM_BONUS, USAGE_BONUS, WEIGHTS } from "../../packages/plateforme/server/routing"
import type { ContentNode, Person } from "../helpers/reference-org"
import { seedReferenceOrg, type ReferenceOrgSql } from "../helpers/reference-org-sql"
import { seedWithAdmin, SQL_SKIP_REASON, sqlConfigured, testAdminSql, type SeededData, type TestSql } from "../helpers/sql"
import { adminAsCaller } from "../helpers/sql-e01-s13"
import { seedAcme } from "./fixtures/acme-sql"
import { PILOT_ROUTING_CASES } from "./pilot-routing.cases"

const NETWORK_TIMEOUT = 60_000
const SETUP_TIMEOUT = 180_000
// Une soixantaine de demandes, chacune rendue par les deux fonctions : quelques secondes mesurées.
const COMPARE_TIMEOUT = 120_000

const SIGNATURE = "platform.route_candidates(uuid, text, text, integer)"

const ready = sqlConfigured
const skipReason = SQL_SKIP_REASON

/** La fonction d'avant, recréée sous un autre nom dans `pg_temp` : elle n'existe que pour la connexion qui la crée. */
const BEFORE = fs.readFileSync(path.resolve(__dirname, "fixtures/route-candidates-avant.sql"), "utf8").replace(
  /platform\.route_candidates\(/i,
  "pg_temp.route_candidates_before(",
)

type Row = {
  node_id: string
  path: string
  title: string
  summary: string
  kind: string
  owner_team_id: string | null
  s_summary: number
  s_title: number
  lexical: number
  query_lexemes: number
}

/**
 * Les lignes rendues par les deux versions sous `person`, pour chaque demande, au genre `procedure` et
 * aux 50 lignes que demande le service (`rankCandidates`).
 */
async function compare(seed: SeededData, ref: ReferenceOrgSql, person: Person, queries: readonly string[]) {
  return adminAsCaller(seed.admin, ref.people[person].id, [BEFORE], async (tx) => {
    const outcomes: { query: string; before: Row[]; after: Row[] }[] = []
    for (const query of queries) {
      const before = await tx<Row[]>`select * from pg_temp.route_candidates_before(${ref.org.id}, ${query}, 'procedure', 50)`
      const after = await tx<Row[]>`select * from platform.route_candidates(${ref.org.id}, ${query}, 'procedure', 50)`
      outcomes.push({ query, before: [...before], after: [...after] })
    }
    return outcomes
  })
}

/** Les seuils de `pg_trgm` que la fonction pose le temps de l'appel (`pg_proc.proconfig`). */
async function preselection(sql: TestSql): Promise<Record<string, number>> {
  const rows = await sql<{ name: string; value: string }[]>`
    select split_part(c, '=', 1) as name, split_part(c, '=', 2) as value
      from pg_catalog.pg_proc p, unnest(p.proconfig) c
     where p.oid = ${SIGNATURE}::regprocedure and c like 'pg_trgm.%'`
  return Object.fromEntries(rows.map((row) => [row.name, Number(row.value)]))
}

describe.skipIf(!ready)(
  ready ? "route_candidates by index, rights before the cut, portable" : `route_candidates by index, rights before the cut, portable (${skipReason})`,
  { timeout: NETWORK_TIMEOUT },
  () => {
    describe("no displayable candidate lost (AC-a1)", () => {
      // Deux procédures dont seul le titre, contenu dans une demande mal tapée, les présélectionne :
      // aucun lexème commun, et leur titre est trop court pour ressembler à toute la demande.
      const TITLE_ONLY: ContentNode[] = [
        { path: "conseil/facturation", kind: "procedure", title: "Facturation", summary: "Émet et envoie les pièces comptables du mois, après accord." },
        { path: "support/astreinte", kind: "procedure", title: "Astreinte", summary: "Prévient la personne de garde d'une panne qui touche plusieurs sites." },
      ]
      const TYPOS = [
        "relnace les devis en atente",
        "qualifei les prospcts a traiter",
        "escalde un incidnet",
        "facturatoin des clients",
        "astrainte ce soir",
        "prépare mon rendez vous clinet",
      ]
      const LONG = `Il faudrait ${"vraiment ".repeat(60)}relancer les devis en attente et qualifier les prospects de la file avant la fin du mois.`
      const QUERIES = [...new Set([...PILOT_ROUTING_CASES.map((routingCase) => routingCase.phrase), ...TYPOS, "les de la", LONG, ""])]
      let seed: SeededData
      let ref: ReferenceOrgSql
      let threshold: number

      beforeAll(async () => {
        seed = seedWithAdmin()
        ref = await seedAcme(seed)
        await ref.addNodes(TITLE_ONLY)
        threshold = (await preselection(seed.admin))["pg_trgm.similarity_threshold"]
      }, SETUP_TIMEOUT)

      afterAll(async () => {
        await seed?.cleanup()
      }, SETUP_TIMEOUT)

      it(
        "should return each row of the former function that holds a lexeme or a resemblance at the preselection threshold, with the same components, in the same order (AC-a1)",
        async () => {
          const [procedures] = await seed.admin<{ count: number }[]>`
            select count(*)::int as count from platform.nodes where org_id = ${ref.org.id} and kind = 'procedure' and status = 'published'`
          expect(procedures.count).toBeLessThanOrEqual(50)
          const outcomes = await compare(seed, ref, "ada", QUERIES)
          let kept = 0
          let dropped = 0
          for (const { query, before, after } of outcomes) {
            // Ada, administratrice de O, lit toutes les procédures : l'ancienne les rend toutes.
            expect(before, JSON.stringify(query)).toHaveLength(procedures.count)
            const displayable = before.filter((row) => row.lexical > 0 || row.s_summary >= threshold || row.s_title >= threshold)
            const returned = new Set(after.map((row) => row.path))
            expect(after, JSON.stringify(query)).toEqual(before.filter((row) => returned.has(row.path)))
            expect(displayable.filter((row) => !returned.has(row.path)).map((row) => row.path), JSON.stringify(query)).toEqual([])
            kept += displayable.length
            dropped += before.length - after.length
          }
          // La comparaison porte : des lignes gardées, et des lignes que la présélection écarte.
          expect(kept).toBeGreaterThan(0)
          expect(dropped).toBeGreaterThan(0)
          // Le titre contenu dans la demande, que seul le parcours des titres présélectionne.
          const titled = (query: string) => outcomes.find((outcome) => outcome.query === query)?.after.map((row) => row.path) ?? []
          expect([titled("facturatoin des clients"), titled("astrainte ce soir")]).toEqual([
            expect.arrayContaining(["conseil/facturation"]),
            expect.arrayContaining(["support/astreinte"]),
          ])
        },
        COMPARE_TIMEOUT,
      )
    })

    describe("rights before the cut (AC-a2)", () => {
      // Soixante procédures de Support, que Léa (Ventes) ne lit pas, portent la demande mot pour mot ;
      // la procédure de Ventes n'en porte qu'une partie.
      const QUERY = "relancer les factures impayées"
      const UNREADABLE: ContentNode[] = Array.from({ length: 60 }, (_, index) => ({
        path: `support/relance_${String(index + 1).padStart(2, "0")}`,
        kind: "procedure",
        title: "Relancer les factures impayées",
        summary: "Relance les factures impayées des clients, après accord de la personne.",
      }))
      const READABLE: ContentNode = { path: "ventes/encaissements", kind: "procedure", title: "Suivre les encaissements", summary: "Liste les factures en retard de paiement du mois." }
      let seed: SeededData
      let ref: ReferenceOrgSql

      beforeAll(async () => {
        seed = seedWithAdmin()
        ref = await seedReferenceOrg(seed, { nodes: [...UNREADABLE, READABLE] })
      }, SETUP_TIMEOUT)

      afterAll(async () => {
        await seed?.cleanup()
      }, SETUP_TIMEOUT)

      it("should return the readable procedure and no unreadable one, where the former function cut it behind fifty unreadable ones (AC-a2)", async () => {
        const [{ before, after }] = await compare(seed, ref, "lea", [QUERY])
        expect(after.map((row) => row.path)).toEqual([READABLE.path])
        expect({ rows: before.length, readable: before.some((row) => row.path === READABLE.path), support: before.every((row) => row.path.startsWith("support/")) }).toEqual({
          rows: 50,
          readable: false,
          support: true,
        })
      })

      it("should return no row to a person outside the organisation, the function reading the nodes past the policies (HN-E01S13-10)", async () => {
        // Membre de P seulement. `security definer` depuis E01-S13, la fonction contrôle elle-même
        // l'appartenance ; Léa, membre de O, reçoit pour la même demande, sans genre, ce qu'elle lit.
        const outsider = seed.person()
        await seed.addMember(ref.other.id, outsider)
        const paths = (userId: string) =>
          adminAsCaller(seed.admin, userId, [], async (tx) => (await tx<Row[]>`select * from platform.route_candidates(${ref.org.id}, ${QUERY}, null, 50)`).map((row) => row.path))
        const [lea, outside] = [await paths(ref.people.lea.id), await paths(outsider.id)]
        expect({ lea: lea.includes(READABLE.path), outsider: outside }).toEqual({ lea: true, outsider: [] })
      })
    })

    describe("preselection threshold (AC-a4)", () => {
      let admin: TestSql

      beforeAll(() => {
        admin = testAdminSql()
      })

      afterAll(async () => {
        await admin?.end({ timeout: 5 })
      })

      it("should hold both pg_trgm thresholds of route_candidates equal to the lowest text score the service shows without a lexeme, bonuses included (AC-a4)", async () => {
        // Sans lexème commun, le service montre un candidat si 0,55 × texte + bonus d'équipe + bonus d'usage ≥ 0,30.
        const lowest = Math.floor(((SHOW_THRESHOLD - TEAM_BONUS - USAGE_BONUS) / WEIGHTS.text) * 100) / 100
        expect(await preselection(admin)).toEqual({ "pg_trgm.similarity_threshold": lowest, "pg_trgm.word_similarity_threshold": lowest })
      })
    })
  },
)
