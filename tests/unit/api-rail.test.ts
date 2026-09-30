// @vitest-environment node
// Les deux lectures du rail (E05-S09, partie a) par la porte entière, `handlePlateforme` :
// `GET /api/platform/nodes?path=` (la tête d'un nœud que « Renommer » lit, AC-a4) et
// `GET /api/platform/search?q=` (la recherche de la palette, AC-a7, par le service de `find`), sur la base
// réelle (E01-S10, lots b1 et e1a : la lecture des nœuds et l'identité passent par la face SQL, que la base
// simulée ne sert pas). Seuls le client et la vérification du jeton sont remplacés ; identité, droits et
// services sont les vrais. En suite portable (`sqlConfigured`) : le projet, ou le Postgres nu du job `bare-postgres`.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { handlePlateforme } from "@otomata_tech/oto_platform/api"
import type { PlatformDb } from "../../packages/plateforme/server/db"
import type { Person } from "../helpers/reference-org"
import { seedReferenceOrg, type ReferenceOrgSql } from "../helpers/reference-org-sql"
import { seedWithAdmin, sqlConfigured, type SeededData, portable } from "../helpers/sql"

// Le jeton que la porte reçoit, et le client que `createPlatformDb` lui rend pendant l'appel (la fabrique ne
// reçoit plus le jeton, M47) : le client de la personne sur la base. Hors d'un appel, la vraie fabrique.
const gate = vi.hoisted(() => ({ token: "gate-token", db: null as PlatformDb | null }))

vi.mock("../../packages/plateforme/server/db", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../packages/plateforme/server/db")>()
  return {
    ...original,
    createPlatformDb: vi.fn((session: Parameters<typeof original.createPlatformDb>[0]) =>
      gate.db ?? original.createPlatformDb(session),
    ),
  }
})

const NETWORK_TIMEOUT = 60_000
const SETUP_TIMEOUT = 180_000

afterEach(() => {
  vi.restoreAllMocks()
})

type Caller = { host: string; id: string; email: string }

async function lire(ressource: string, caller: Caller) {
  const request = new Request(`https://${caller.host}/api/platform/${ressource}`, { method: "GET", headers: { "x-forwarded-proto": "https" } })
  const verifyToken = async () => ({ token: gate.token, clientId: "", scopes: [], extra: { sub: caller.id, email: caller.email } })
  const response = await handlePlateforme(request, { accessToken: gate.token, host: caller.host, verifyToken })
  return { status: response.status, body: await response.json() }
}

// L'organisation O des deux lectures, semée une fois : sa page « Annonces », en brouillon ouvert, porte un bloc publié.
let seed: SeededData
let ref: ReferenceOrgSql

beforeAll(async () => {
  if (!sqlConfigured) return
  seed = seedWithAdmin()
  ref = await seedReferenceOrg(seed, { nodes: [{ path: "annonces", title: "Annonces", revision: 3 }] })
  await ref.openDraft("annonces", { title: "Annonces du mois" })
  await ref.addBlocks("annonces", "published", [{ type: "paragraph", text: "La grille des tarifs 2026" }])
}, SETUP_TIMEOUT)

afterAll(async () => {
  await seed?.cleanup()
}, SETUP_TIMEOUT)

/** La porte appelée sous `person`, avec son client sur la base. */
async function lireSous(ressource: string, person: Person) {
  gate.db = await ref.db(person)
  try {
    return await lire(ressource, { host: ref.org.host, id: ref.people[person].id, email: ref.people[person].email })
  } finally {
    gate.db = null
  }
}

describe.skipIf(!sqlConfigured)(portable("GET /api/platform/nodes?path= (AC-a4)"), { timeout: NETWORK_TIMEOUT }, () => {
  it("should serve the head of a node, its draft only to a writer, and answer an invisible, unknown or malformed path as the node page does", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})

    // Ada administre l'organisation (niveau gestion) ; Claire, membre, lit une page d'organisation.
    const ada = await lireSous("nodes?path=annonces", "ada")
    expect(ada).toEqual({ status: 200, body: { data: { path: "annonces", title: "Annonces", revision: 3, draft: { title: "Annonces du mois", stamp: expect.any(String) } } } })
    const claire = await lireSous("nodes?path=annonces", "claire")
    expect(claire.body.data).toEqual({ path: "annonces", title: "Annonces", revision: 3, draft: null })

    // Paul (Support) ne lit pas une page de Ventes : inconnue, comme un chemin libre.
    expect((await lireSous("nodes?path=ventes/devis", "paul")).body.error.code).toBe("not_found")
    expect((await lireSous("nodes?path=inconnu", "ada")).status).toBe(404)
    expect(await lireSous("nodes?path=Ventes%2FDevis", "ada")).toMatchObject({ status: 400, body: { error: { code: "invalid_arguments" } } })
  })
})

describe.skipIf(!sqlConfigured)(portable("GET /api/platform/search?q= (AC-a7)"), { timeout: NETWORK_TIMEOUT }, () => {
  it("should serve the nodes find reads, one snippet each and no function, and refuse a blank query", async () => {
    // Claire (membre) lit « Annonces » ; l'extrait est le fragment que `search_content` (E01-S13) tire du bloc,
    // terme en gras, sans le mot court de tête (ShortWord=2) et prolongé jusqu'à la fin du bloc.
    const trouve = await lireSous("search?q=grille", "claire")

    expect(trouve).toEqual({
      status: 200,
      body: { data: { matches: [{ path: "annonces", kind: "page", title: "Annonces", snippet: "**grille** des tarifs 2026" }], more: 0 } },
    })
    expect(await lireSous("search?q=%20%20", "claire")).toMatchObject({ status: 400, body: { error: { code: "invalid_arguments" } } })
  })
})
