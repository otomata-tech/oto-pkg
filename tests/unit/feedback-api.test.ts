// @vitest-environment node
// `PATCH /api/platform/feedback/<ticket>` (E08-S09, AC13) : la porte entière, `handlePlateforme`, sur une
// base réelle (E01-S10, lot t1-e2a) : l'organisation O de la fixture (`seedReferenceOrg`), son ticket
// FB-0012 écrit avant chaque test ; identité résolue par l'adresse jetable de O, service réel, ligne de
// journal relue par la connexion d'administration. Seuls le client de la porte (celui de la personne sur la
// base, `ref.db`, espionné) et la vérification du jeton sont remplacés. En suite portable (`sqlConfigured`) : le projet, ou le Postgres nu du job `bare-postgres`.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { handlePlateforme } from "@otomata_tech/oto_platform/api"
import type { PlatformDb } from "../../packages/plateforme/server/db"
import { ORG, PEOPLE, type Person } from "../helpers/reference-org"
import { seedReferenceOrg, type ReferenceOrgSql } from "../helpers/reference-org-sql"
import type { Row } from "../helpers/simulated-db"
import { seedWithAdmin, spyRequests, sqlConfigured, type SeededData, type SpiedRequest, portable } from "../helpers/sql"

// Le jeton que la porte reçoit, et le client que `createPlatformDb` lui rend pendant l'appel (la fabrique ne
// reçoit plus le jeton, M47), posé par `call` :
// `null` au départ serait inféré seul, d'où le type donné au champ.
const gate = vi.hoisted(() => ({ token: "gate-token", db: null as PlatformDb | null }))

vi.mock("../../packages/plateforme/server/db", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../packages/plateforme/server/db")>()
  return {
    ...original,
    // La porte reçoit le client de la personne sur la base ; la fixture, qui bâtit ce client sous la
    // session de la personne, garde la vraie fabrique.
    createPlatformDb: vi.fn((session: Parameters<typeof original.createPlatformDb>[0]) =>
      gate.db ?? original.createPlatformDb(session),
    ),
  }
})

const NETWORK_TIMEOUT = 60_000
const SETUP_TIMEOUT = 180_000

let seed: SeededData
let ref: ReferenceOrgSql

function ticketRow(number: number): Row {
  return {
    org_id: ORG.id,
    number,
    created_at: "2026-09-24T14:00:00.000Z",
    user_id: PEOPLE.lea.id,
    ctx: "K7M2-9QXR",
    type: "error",
    target: "table.write",
    text: "L'écriture a été refusée.",
    state: "open",
    resolution: null,
    handled_by: null,
    handled_at: null,
  }
}

function patch(ticket: string, body: unknown) {
  const host = ref.org.host
  return new Request(`https://${host}/api/platform/feedback/${ticket}`, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "x-forwarded-proto": "https", origin: `https://${host}`, "content-type": "application/json" },
  })
}

/** La porte appelée sous `person` (son client sur la base, espionné), ou sans appelant ; les tâches d'après la réponse jouées. */
async function call(request: Request, options: { person?: Person; token?: string | null } = {}) {
  const person = options.person ? ref.people[options.person] : null
  const spy = options.person ? spyRequests(await ref.db(options.person)) : null
  gate.db = spy?.db ?? null
  const tasks: (() => Promise<void>)[] = []
  // La porte vérifie le jeton par le vérificateur injecté (M10) : la personne posée, ou aucun appelant.
  const verifyToken = async () => (person ? { token: gate.token, clientId: "", scopes: [], extra: { sub: person.id, email: person.email } } : undefined)
  const accessToken = options.token === undefined ? gate.token : options.token
  const response = await handlePlateforme(request, { accessToken, host: ref.org.host, defer: (task) => tasks.push(task), verifyToken })
  for (const task of tasks) await task()
  return { status: response.status, body: await response.json(), requests: spy?.requests ?? [] }
}

/** Les lignes de journal de O dans l'ordre d'écriture, relues par la connexion d'administration, en identifiants simulés. */
async function journal(): Promise<Row[]> {
  return ref.readable([...(await seed.admin<Row[]>`
    select org_id, user_id, method, tool, target, is_error, error from platform.journal where org_id = ${ref.org.id} order by id`)])
}

/** Le ticket de O, relu tel qu'il est en base. */
async function ticket(number: number): Promise<Row[]> {
  return [...(await seed.admin<Row[]>`select * from platform.feedback where org_id = ${ref.org.id} and number = ${number}`)]
}

const writesFeedback = (request: SpiedRequest) => request.write && request.tables.includes("feedback")

describe.skipIf(!sqlConfigured)(portable("PATCH /api/platform/feedback/<ticket> (AC13)"), { timeout: NETWORK_TIMEOUT }, () => {
  beforeAll(async () => {
    seed = seedWithAdmin()
    ref = await seedReferenceOrg(seed)
  }, SETUP_TIMEOUT)

  afterAll(async () => {
    await seed?.cleanup()
  }, SETUP_TIMEOUT)

  // Chaque test part d'un journal vide et du ticket FB-0012 de Léa, ouvert.
  beforeEach(async () => {
    await seed.admin`delete from platform.journal where org_id = ${ref.org.id}`
    await seed.admin`delete from platform.feedback where org_id = ${ref.org.id}`
    await ref.write({ feedback: [ticketRow(12)] })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // E05-S13 (AC-9) : les retours sont à l'équipe plateforme ; Théo (`t`), de l'équipe plateforme avec un accès en
  // cours à O, les traite ; Ada, administratrice du client, est refusée comme un membre.
  it("should answer 401 without a session, 403 to a member and to a client administrator without writing, 400 to an invalid body, 404 to an unknown ticket", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})

    expect((await call(patch("FB-0012", { state: "resolved" }), { token: null })).status).toBe(401)

    const before = await ticket(12)
    for (const person of ["lea", "ada"] as const) {
      const refused = await call(patch("FB-0012", { state: "resolved" }), { person })
      expect(refused).toMatchObject({ status: 403, body: { error: { code: "forbidden" } } })
      // La RLS laisse Léa et Ada écrire les tickets de O : le refus vient du service, sans requête d'écriture (AC-x3).
      expect(refused.requests.filter(writesFeedback)).toEqual([])
    }
    expect(await ticket(12)).toEqual(before)

    const invalid = await call(patch("FB-0012", { state: "declined" }), { person: "t" })
    expect(invalid).toMatchObject({ status: 400, body: { error: { code: "invalid_arguments" } } })

    const unknown = await call(patch("FB-0099", { state: "resolved" }), { person: "t" })
    expect(unknown).toMatchObject({ status: 404, body: { error: { code: "not_found" } } })
    expect((await journal()).map((line) => [line.tool, line.target, line.is_error])).toEqual([
      ["PATCH feedback", "FB-0012", true],
      ["PATCH feedback", "FB-0012", true],
      ["PATCH feedback", "FB-0012", true],
      ["PATCH feedback", "FB-0099", true],
    ])
  })

  it("should answer 200 with the ticket up to date, and journal PATCH feedback on the ticket", async () => {
    const { status, body } = await call(patch("FB-0012", { state: "acknowledged" }), { person: "t" })

    expect(status).toBe(200)
    expect(body.data).toMatchObject({ ticket: "FB-0012", state: "acknowledged", handledBy: "Théo Staff", person: "Léa Roux" })
    expect(await journal()).toMatchObject([{ org_id: ORG.id, user_id: PEOPLE.t.id, method: "api", tool: "PATCH feedback", target: "FB-0012", is_error: false, error: null }])
  })
})
