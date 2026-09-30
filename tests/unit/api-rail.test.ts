// @vitest-environment node
// Les deux lectures du rail (E05-S09, partie a) par la porte entière, `handlePlateforme` :
// `GET /api/platform/nodes?path=` (la tête d'un nœud que « Renommer » lit, AC-a4) et
// `GET /api/platform/search?q=` (la recherche de la palette, AC-a7, par le service de `find`), sur la base
// réelle (E01-S10, lots b1 et e1a : la lecture des nœuds et l'identité passent par la face SQL, que la base
// simulée ne sert pas). Seuls le client et la vérification du jeton sont remplacés ; identité, droits et
// services sont les vrais. En suite portable (`sqlConfigured`) : le projet, ou le Postgres nu du job `bare-postgres`.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { handlePlateforme } from "@otomata_tech/oto_platform/api"
import type { TreeNode } from "../../packages/plateforme/schemas"
import type { PlatformDb } from "../../packages/plateforme/server/db"
import { visibleTree } from "../../packages/plateforme/server/nodes/tree"
import { ORG, PEOPLE, type Person } from "../helpers/reference-org"
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

// E11-S20 (AC-1, AC-2) : l'arbre que le rail relit seul, celui que le layout de l'hôte lui passe.
describe.skipIf(!sqlConfigured)(portable("GET /api/platform/nodes/tree (E11-S20)"), { timeout: NETWORK_TIMEOUT }, () => {
  const chemins = (noeuds: TreeNode[]): string[] => noeuds.flatMap((noeud) => [noeud.path, ...chemins(noeud.children)])

  it("should serve the visible tree of the caller, as the layout reads it, without a node she does not read", async () => {
    const lu = await lireSous("nodes/tree", "paul")

    expect(lu).toEqual({ status: 200, body: { data: await visibleTree(await ref.db("paul"), ref.identityOf("paul")) } })
    // Paul (Support) lit sa FAQ, pas les devis de Ventes.
    expect(chemins(lu.body.data.tree)).toContain("support/faq")
    expect(chemins(lu.body.data.tree)).not.toContain("ventes/devis")
    expect(lu.body.data.truncated).toBe(false)
  })

  it("should answer 401 without a session", async () => {
    const request = new Request(`https://${ref.org.host}/api/platform/nodes/tree`, { method: "GET", headers: { "x-forwarded-proto": "https" } })
    const response = await handlePlateforme(request, { accessToken: null, host: ref.org.host })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: { code: "forbidden", message: "Authentication required." } })
  })
})

// E11-S15 (AC-b4) : la liste de « @ », avant toute frappe, par le service du bloc « Recent content » (`recentDocuments`).
describe.skipIf(!sqlConfigured)(portable("GET /api/platform/search/recent (E11-S15, AC-b4)"), { timeout: NETWORK_TIMEOUT }, () => {
  it("should serve the caller's recent contents that she reads, as search matches without a snippet, but the page being edited", async () => {
    // Paul (Support) a lu « Annonces », une page de Support, puis, plus récemment, une page de Ventes, qu'il ne lit pas :
    // les deux premières reviennent, la plus récente d'abord.
    const lu = (target: string, heures: number) => ({ org_id: ORG.id, user_id: PEOPLE.paul.id, tool: `${ref.org.prefix}_read`, target, ts: new Date(Date.now() - heures * 3_600_000).toISOString() })
    await ref.write({ journal: [lu("annonces", 3), lu("support/faq", 2), lu("ventes/devis", 1)] })
    const faq = { path: "support/faq", kind: "page", title: "support/faq", snippet: null }
    const annonces = { path: "annonces", kind: "page", title: "Annonces", snippet: null }

    expect(await lireSous("search/recent", "paul")).toEqual({ status: 200, body: { data: { matches: [faq, annonces] } } })
    // La page qu'on édite ne se propose pas à elle-même ; un chemin mal formé est une erreur de saisie.
    expect(await lireSous("search/recent?exclude=support%2Ffaq", "paul")).toEqual({ status: 200, body: { data: { matches: [annonces] } } })
    expect(await lireSous("search/recent?exclude=Support%2FFaq", "paul")).toMatchObject({ status: 400, body: { error: { code: "invalid_arguments" } } })
  })
})
