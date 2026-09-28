// @vitest-environment node
// Routes `admin/*` du tableau de bord (E08-S03, AC10) par `handlePlateforme`, sur une base réelle (E01-S10,
// lot t1-d1) : la base des tests admin (`seedAdminFixture`), sous le client de la personne (mode de
// transition, lot t1-0b). Les services sont les vrais, seuls le client et l'identité par l'adresse sont
// posés par le test. Pour chaque route : sans session (401) ; un membre qui n'administre pas (403, décidé
// par le service, aucune écriture envoyée : l'espion des deux faces, `recordDb`) ; un corps invalide
// (400) ; l'administrateur (200, la vue à jour, une ligne de journal `api`, relue dans la base). Le
// registre des drapeaux, vide en V1, en déclare un ici.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { handlePlateforme } from "@otomata_tech/oto_platform/api"
import type { Identity, PlatformDb } from "@otomata_tech/oto_platform/server"
import type { VerifyToken } from "../../packages/plateforme/mcp/auth"
import { resolveIdentity } from "../../packages/plateforme/server/identity"
import { ORGS, PERSONS } from "../helpers/mcp-admin"
import { seedAdminFixture, type AdminFixtureSql } from "../helpers/mcp-admin-sql"
import type { Row, Tables } from "../helpers/simulated-db"
import { sqlConfigured, recordDb, seedWithAdmin, type SeededData, type SentRequest, portable } from "../helpers/sql"

const base = vi.hoisted((): { current: PlatformDb | null } => ({ current: null }))

// La porte reçoit le client que pose le test (`base.current`) ; hors d'un appel, le vrai : la fixture ouvre
// ainsi le client de chaque personne.
vi.mock("../../packages/plateforme/server/db", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../packages/plateforme/server/db")>()
  return { ...original, createPlatformDb: vi.fn((options: Parameters<typeof original.createPlatformDb>[0]) => base.current ?? original.createPlatformDb(options)) }
})

vi.mock("../../packages/plateforme/server/identity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../packages/plateforme/server/identity")>()),
  resolveIdentity: vi.fn(),
}))

// Un drapeau déclaré, pour que `setFlag` d'E08-S04 aille jusqu'au droit et à l'écriture.
vi.mock("../../packages/plateforme/server/flags", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../packages/plateforme/server/flags")>()
  const registry = [{ name: "essai_drapeau", description: "Drapeau de test." }]
  return { ...original, setFlag: (...args: Parameters<typeof original.setFlag>) => original.setFlag(args[0], args[1], args[2], registry) }
})

/** Le compte d'organisation d'acme à désactiver, en identifiant simulé ; la fixture lui tire sa valeur réelle. */
const ACCOUNT = "6b2f3c1d-4e5a-4b6c-8d7e-9f0a1b2c3d4e"
/** Les six outils d'une organisation, dans l'ordre de la vue (ADR-002 § 3). */
const TOOLS = ["context", "find", "read", "call", "write", "feedback"]

let seed: SeededData
let admin: AdminFixtureSql

function identity(person: "ada" | "marc"): Identity {
  const org = admin.orgs.acme
  const user = admin.persons[person]
  return {
    org: { id: org.id, slug: org.slug, name: org.name, prefix: org.prefix, brand: {}, domains: null },
    user: { id: user.id, email: user.email, name: user.name },
    member: { role: person === "ada" ? "admin" : "member", profile: {} },
    teams: [],
    isStaff: false,
    viaGrant: false,
    hasOpenGrant: false,
  }
}

/** Les lignes d'acme des appels : `mail` actif et un compte d'organisation à désactiver. */
function tables(): Tables {
  return {
    connector_activations: [{ org_id: ORGS.acme.id, connector: "mail", state: "active", activated_by: PERSONS.ada.id, updated_at: "2026-09-24T10:00:00.000Z" }],
    accounts: [
      { id: ACCOUNT, org_id: ORGS.acme.id, connector: "mail", label: "Mail Acme", owner_kind: "org", owner_team_id: null, owner_user_id: null, mode: "simule", status: "active" },
    ],
  }
}

const verifyToken: VerifyToken = async () => ({ token: "token", clientId: "", scopes: [], extra: { sub: admin.persons.ada.id, email: admin.persons.ada.email } })

function request(method: string, path: string, body?: unknown) {
  const host = admin.orgs.acme.host
  return new Request(`https://${host}/api/plateforme/${path}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "x-forwarded-proto": "https", origin: `https://${host}`, "content-type": "application/json" },
  })
}

type Sent = { method: string; path: string; body?: unknown; change?: (all: Tables) => void }

/** Les lignes de journal d'acme, relues en identifiants simulés. */
async function journal(): Promise<Row[]> {
  return admin.readable([...(await seed.admin<Row[]>`select * from platform.journal where org_id = ${admin.orgs.acme.id} order by id`)])
}

/**
 * Un appel de la porte, sous `person`, sur une base neuve comme la base simulée : acme sans réglage, drapeau,
 * compte, activation ni ligne de journal, puis les lignes de `tables()` (`change` les retouche). Rend les
 * écritures du service, relevées avant la ligne de journal que la porte écrit après la réponse, et cette
 * ligne, relue dans la base.
 */
async function call(person: "ada" | "marc" | null, { method, path, body, change }: Sent) {
  const all = tables()
  change?.(all)
  const org = admin.orgs.acme.id
  await seed.admin`delete from platform.journal where org_id = ${org}`
  await seed.admin`delete from platform.accounts where org_id = ${org}`
  await seed.admin`delete from platform.connector_activations where org_id = ${org}`
  await seed.admin`update platform.orgs set settings = '{}', flags = '{}' where id = ${org}`
  await admin.write(all)
  const spied = person ? recordDb((await admin.deps(person)).db) : null
  base.current = spied?.db ?? null
  if (person) vi.mocked(resolveIdentity).mockResolvedValue(identity(person))
  const tasks: (() => Promise<void>)[] = []
  try {
    // L'adresse d'un compte porte son identifiant réel, tiré à l'écriture ci-dessus.
    const realPath = path.replace(ACCOUNT, admin.id(ACCOUNT))
    const response = await handlePlateforme(request(method, realPath, body), { accessToken: person ? "token" : null, host: admin.orgs.acme.host, defer: (task) => tasks.push(task), verifyToken })
    const writes: SentRequest[] = spied?.writes() ?? []
    for (const task of tasks) await task()
    return { status: response.status, body: await response.json(), writes, journal: await journal() }
  } finally {
    base.current = null
  }
}

type RouteCase = {
  name: string
  method: string
  path: string
  body?: unknown
  invalid: { path: string; body?: unknown }
  /** Ce que la réponse de l'administrateur porte, selon le préfixe de l'organisation. */
  data: (prefix: string) => Record<string, unknown>
  target: string
  /** L'état de la base avant l'appel, quand la route en demande un autre. */
  change?: (all: Tables) => void
}

const ROUTES: RouteCase[] = [
  {
    name: "PATCH admin/org",
    method: "PATCH",
    path: "admin/org",
    body: { domains: "sales, support", routing_gap: 0.2 },
    invalid: { path: "admin/org", body: { name: "" } },
    // Le routage tel qu'il est posé (AC3) : l'écart réglé, le seuil jamais réglé à `null`, pas à son défaut.
    data: (prefix) => ({
      org: expect.objectContaining({
        domains: "sales, support",
        routing: { threshold: null, gap: 0.2 },
        tools: TOOLS.map((tool) => `${prefix}_${tool}`),
      }),
    }),
    target: "org",
  },
  {
    name: "POST admin/connectors/activation",
    method: "POST",
    path: "admin/connectors/mail/activation",
    body: {},
    invalid: { path: "admin/connectors/Mail!/activation", body: {} },
    data: () => ({ connector: expect.objectContaining({ connector: "mail", state: "active" }) }),
    target: "mail",
    // Jamais activé chez acme : l'activation écrit sa ligne.
    change: (all) => {
      all.connector_activations = []
    },
  },
  {
    name: "DELETE admin/connectors/activation",
    method: "DELETE",
    path: "admin/connectors/mail/activation",
    invalid: { path: "admin/connectors/Mail!/activation" },
    data: () => ({ connector: expect.objectContaining({ connector: "mail", state: "inactive" }) }),
    target: "mail",
  },
  {
    name: "POST admin/accounts",
    method: "POST",
    path: "admin/accounts",
    body: { connector: "mail", owner_kind: "org", label: "Mail Acme 2" },
    // Un compte personnel se crée par son propriétaire, jamais ici (N11).
    invalid: { path: "admin/accounts", body: { connector: "mail", owner_kind: "user", label: "Perso" } },
    data: () => ({ account: expect.objectContaining({ label: "Mail Acme 2", mode: "simule" }) }),
    target: "Mail Acme 2",
  },
  {
    name: "POST admin/accounts/disable",
    method: "POST",
    path: `admin/accounts/${ACCOUNT}/disable`,
    body: {},
    invalid: { path: "admin/accounts/Mail Acme/disable", body: {} },
    data: () => ({ account: expect.objectContaining({ id: ACCOUNT, status: "disabled" }) }),
    target: ACCOUNT,
  },
  {
    name: "PATCH admin/flags",
    method: "PATCH",
    path: "admin/flags",
    body: { name: "essai_drapeau", enabled: true },
    invalid: { path: "admin/flags", body: { name: "essai_drapeau" } },
    data: () => ({ flag: { name: "essai_drapeau", description: "Drapeau de test.", enabled: true } }),
    target: "flags/essai_drapeau",
  },
]

beforeEach(() => {
  vi.clearAllMocks()
})

describe.skipIf(!sqlConfigured)(portable("admin/* routes of the dashboard (AC10)"), { timeout: 60_000 }, () => {
  beforeAll(async () => {
    seed = seedWithAdmin()
    admin = await seedAdminFixture(seed)
  }, 180_000)

  afterAll(async () => {
    await seed?.cleanup()
  }, 180_000)

  it.each(ROUTES)("should serve $name: 401, 403 without a write, 400, then 200 with the view and an api journal line", async (route) => {
    const tool = route.name

    expect((await call(null, route)).status).toBe(401)

    const refused = await call("marc", route)
    expect(refused.status).toBe(403)
    expect(refused.body.error.code).toBe("forbidden")
    expect(refused.writes).toEqual([])
    expect(refused.journal).toMatchObject([{ method: "api", tool, is_error: true, error: expect.stringMatching(/^forbidden: /) }])

    const invalid = await call("ada", { ...route, ...route.invalid })
    expect(invalid.status).toBe(400)
    expect(invalid.body.error.code).toBe("invalid_arguments")
    expect(invalid.writes).toEqual([])

    const served = await call("ada", route)
    expect(served.status).toBe(200)
    expect(admin.readable(served.body.data)).toEqual(route.data(admin.orgs.acme.prefix))
    expect(served.writes).not.toEqual([])
    expect(served.journal).toMatchObject([{ org_id: ORGS.acme.id, user_id: PERSONS.ada.id, method: "api", tool, target: route.target, is_error: false, error: null }])
  })

  it("should journal a refused account creation under its label made well-formed, a lone surrogate half becoming U+FFFD", async () => {
    // PostgREST refuse un corps qui porte une moitié de paire (PGRST102) et la ligne du refus se perdrait :
    // relue dans la base, elle y est arrivée, sa cible bien formée.
    const refused = await call("marc", { method: "POST", path: "admin/accounts", body: { connector: "mail", owner_kind: "org", label: "Mail \ud83d" } })

    expect(refused.status).toBe(403)
    expect(refused.journal).toMatchObject([{ tool: "POST admin/accounts", target: "Mail \ufffd", is_error: true }])
    expect(String(refused.journal[0]?.target).isWellFormed()).toBe(true)
  })
})
