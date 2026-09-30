// @vitest-environment node
// L'agrégat d'usage (E08-S09) : la règle de calcul d'AC7, avec les ordres et les bornes d'AC4 et d'AC6,
// sur un jeu de lignes construit pour elle, sans base ; la borne d'AC8 sur une base réelle (E01-S10, lot
// t1-e2a), où une lecture rend 1 000 lignes au plus (`READ_PAGE_ROWS`). AC8 en suite portable (`sqlConfigured`) : le projet, ou le Postgres nu du job `bare-postgres`.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { aggregateUsage, usageSummary, type UsageLine } from "../../packages/plateforme/server/usage"
import { ORG, PEOPLE, type Person } from "../helpers/reference-org"
import { seedReferenceOrg, type ReferenceOrgSql } from "../helpers/reference-org-sql"
import type { Row } from "../helpers/simulated-db"
import { seedWithAdmin, sqlConfigured, type SeededData, portable } from "../helpers/sql"

const NOW = new Date("2026-09-24T15:00:00.000Z")
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString()
/** Un instant comme la base rend un `timestamptz` (UTC, sans fraction nulle) : écrit puis relu tel quel. */
const rendered = (at: Date) => at.toISOString().replace(".000Z", "+00:00")

// 20 001 lignes écrites, puis lues par pages : sous la charge du projet partagé, au-delà du délai réseau ordinaire.
const BOUND_TIMEOUT = 180_000
const SETUP_TIMEOUT = 180_000

let lastId = 0

type Spec = { ctx: string | null; person: Person; tool: string; at: number; target?: string; error?: string; host?: string }

/** Une ligne `tools/call` telle que la porte MCP l'écrit (E03-S01) ; `at` en minutes avant `NOW`. */
function line(spec: Spec): UsageLine {
  lastId += 1
  return {
    id: lastId,
    ts: minutesAgo(spec.at),
    ctx: spec.ctx,
    user_id: PEOPLE[spec.person].id,
    tool: `acme_${spec.tool}`,
    target: spec.target ?? null,
    is_error: spec.error !== undefined,
    error: spec.error ?? null,
    host: spec.host ?? "claude-ai@0.1.0",
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe("aggregateUsage (AC4, AC6, AC7)", () => {
  it("should count calls, errors, conversations, people, served procedures, functions and conversations without a procedure, in the screen's orders and bounds", () => {
    const longError = `invalid_arguments: ${"Unknown column « statut » in ventes/suivi_prospects. ".repeat(4)}`
    const lines = [
      // A : une procédure servie, puis un appel en erreur.
      line({ ctx: "AAAA-0001", person: "lea", tool: "context", at: 60, target: "ventes/qualifier_prospects" }),
      line({ ctx: "AAAA-0001", person: "lea", tool: "call", at: 59, target: "table.write", error: longError }),
      // B : un `context` en erreur, une phrase, `find`, puis une autre phrase d'un autre host : sans procédure ni
      // appel ; sa demande et son host sont ceux de sa première demande (N27).
      line({ ctx: "BBBB-0001", person: "claire", tool: "context", at: 51, error: "internal: Internal error." }),
      line({ ctx: "BBBB-0001", person: "claire", tool: "context", at: 50, target: "Combien de prospects à Valbrune ?", host: "chatgpt@1.0" }),
      line({ ctx: "BBBB-0001", person: "claire", tool: "find", at: 49, target: "prospects Valbrune" }),
      line({ ctx: "BBBB-0001", person: "claire", tool: "context", at: 45, target: "Et à Montrevel ?" }),
      // C : `context` en erreur, sans cible ; J : une autre procédure, servie une fois ; D : une phrase et un appel.
      line({ ctx: "CCCC-0001", person: "paul", tool: "context", at: 40, error: "internal: Internal error." }),
      line({ ctx: "JJJJ-0001", person: "paul", tool: "context", at: 35, target: "ventes/relancer_devis" }),
      line({ ctx: "DDDD-0001", person: "ada", tool: "context", at: 30, target: "Relance les devis" }),
      line({ ctx: "DDDD-0001", person: "ada", tool: "call", at: 29, target: "mail.create_draft" }),
      // E : `context` sans phrase ; F : une procédure que l'appelant ne lit pas ; K : une troisième procédure,
      // servie une fois, après J mais avant elle par son chemin ; G : la première procédure servie une seconde fois.
      line({ ctx: "EEEE-0001", person: "lea", tool: "context", at: 25 }),
      line({ ctx: "FFFF-0001", person: "claire", tool: "context", at: 20, target: "private/claire/relances" }),
      line({ ctx: "KKKK-0001", person: "ada", tool: "context", at: 15, target: "achats/commander" }),
      line({ ctx: "GGGG-0001", person: "marc", tool: "context", at: 10, target: "ventes/qualifier_prospects" }),
      // Sans `ctx`, un appel refusé avant sa garde ; un `call` sans fonction ; un `context` en erreur sur un chemin.
      line({ ctx: null, person: "paul", tool: "read", at: 5, error: "ctx_missing: Call acme_context first." }),
      line({ ctx: "GGGG-0001", person: "marc", tool: "call", at: 4, error: "invalid_arguments: function is required." }),
      line({ ctx: "HHHH-0001", person: "paul", tool: "context", at: 3, target: "ventes/qualifier_prospects", error: "internal: Internal error." }),
      // I : une autre phrase sans suite, la plus récente.
      line({ ctx: "IIII-0001", person: "lea", tool: "context", at: 2, target: "Liste les commandes en retard" }),
    ]
    const procedures = new Map([
      ["ventes/qualifier_prospects", "Qualifier les prospects"],
      ["ventes/relancer_devis", "Relancer les devis"],
      ["achats/commander", "Commander"],
      ["private/claire/relances", null],
    ])

    const usage = aggregateUsage(lines, procedures, "acme", new Set())

    expect(usage.totals).toEqual({ conversations: 11, people: 5, calls: 18, errors: 6 })
    // Par nombre de fois servie décroissant, puis par chemin (AC4).
    expect(usage.procedures).toEqual([
      { path: "ventes/qualifier_prospects", title: "Qualifier les prospects", served: 2, conversations: 2, people: 2, lastServedAt: minutesAgo(10) },
      { path: "achats/commander", title: "Commander", served: 1, conversations: 1, people: 1, lastServedAt: minutesAgo(15) },
      { path: "ventes/relancer_devis", title: "Relancer les devis", served: 1, conversations: 1, people: 1, lastServedAt: minutesAgo(35) },
    ])
    expect(usage.functions).toEqual([
      { name: "table.write", calls: 1, errors: 1, lastError: { message: `${longError.slice(0, 119)}…`, at: minutesAgo(59) } },
      { name: "mail.create_draft", calls: 1, errors: 0, lastError: null },
    ])
    // Les plus récentes d'abord (AC6).
    expect(usage.unmatched).toEqual({
      count: 2,
      items: [
        { ctx: "IIII-0001", at: minutesAgo(2), userId: PEOPLE.lea.id, phrase: "Liste les commandes en retard", host: "claude-ai@0.1.0" },
        { ctx: "BBBB-0001", at: minutesAgo(50), userId: PEOPLE.claire.id, phrase: "Combien de prospects à Valbrune ?", host: "chatgpt@1.0" },
      ],
    })

    // Les 50 plus récentes seulement (AC6) : sur 51 conversations sans procédure, la plus ancienne n'est pas listée.
    const crowd = Array.from({ length: 51 }, (_, index) => line({ ctx: `ZZ${String(index).padStart(2, "0")}-0001`, person: "lea", tool: "context", at: 100 + index, target: `Demande ${index}` }))
    const bounded = aggregateUsage(crowd, new Map(), "acme", new Set()).unmatched
    expect(bounded.count).toBe(51)
    expect(bounded.items.map((item) => item.ctx)).toEqual(crowd.slice(0, 50).map((entry) => entry.ctx))
  })
})

describe.skipIf(!sqlConfigured)(portable("usageSummary bound (AC8)"), { timeout: BOUND_TIMEOUT }, () => {
  let seed: SeededData
  let ref: ReferenceOrgSql

  beforeAll(async () => {
    seed = seedWithAdmin()
    ref = await seedReferenceOrg(seed)
  }, SETUP_TIMEOUT)

  afterAll(async () => {
    await seed?.cleanup()
  }, SETUP_TIMEOUT)

  it("should read the 20,000 most recent calls by pages of 1,000, no line of a shared instant lost, and say where the period is covered from", async () => {
    // 20 001 appels, sept par instant : une clé de page sur `ts` seul perdrait les lignes du même instant, et
    // une lecture sans pages s'arrêterait aux 1 000 lignes que PostgREST rend au plus.
    const count = 20_001
    const journal: Row[] = Array.from({ length: count }, (_, index) => ({
      ts: rendered(new Date(NOW.getTime() - Math.floor((count - 1 - index) / 7) * 1000)),
      org_id: ORG.id,
      user_id: PEOPLE.lea.id,
      ctx: "BIG1-0001",
      method: "tools/call",
      tool: `${ref.org.prefix}_read`,
      target: "ventes/devis",
      is_error: false,
      error: null,
      host: "claude-ai@0.1.0",
    }))
    await ref.write({ journal })

    const usage = await usageSummary(await ref.db("ada"), ref.identityOf("ada"), { period: 7 })

    expect(usage).toMatchObject({ truncated: true, coveredFrom: journal[1].ts, totals: { calls: 20_000, conversations: 1, people: 1, errors: 0 } })
  })
})
