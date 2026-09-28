// @vitest-environment node
// L'API du paquet par l'adresse (E09-S05 : AC9) : `handlePlateforme(request, { accessToken, host })` en
// processus, de vraies `Request`, sur les ressources de lecture et de mutation livrées. `c`,
// administratrice d'A et de B, appelle l'hôte d'A : la RLS la laisserait écrire B, seul le service
// décide par l'organisation de l'adresse (`security-patterns.md § Droits dans le service`). Une
// mutation qui vise une ligne de B par son identifiant rend 404, indistinct d'une ligne absente
// (Oto `SECURITY.md` l. 91 : même 404) ; B, relue par la connexion d'administration ensuite, est inchangée.
// Marqué Supabase : la porte vérifie des jetons de Supabase Auth.
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { handlePlateforme } from "@otomata_tech/oto_platform/api"
import { hex, SKIP_REASON, supabaseConfigured } from "../../helpers/plateforme"
import { SQL_SKIP_REASON, sqlConfigured } from "../../helpers/sql"
import { MARKERS, preparer, type Isolation, type Place, type Row, type Who } from "./donnees"

const SETUP_TIMEOUT = 300_000
const NETWORK_TIMEOUT = 120_000
const configured = supabaseConfigured && sqlConfigured
const SUITE = "isolation through the platform API, by the address"
const USER_AGENT = "isolation-api-test"
/** Le refus d'une route inconnue (`api/handler.ts`) : un 404 lui aussi, que rien ne distinguerait sans son message. */
const UNKNOWN_ROUTE = "Unknown route."

type Task = () => Promise<void>
/** `routed` : la porte a trouvé la route, et le refus vient donc du service. */
type Answer = { status: number; code: string | null; routed: boolean; data: unknown }

describe.skipIf(!configured)(
  configured ? SUITE : `${SUITE} (${supabaseConfigured ? SQL_SKIP_REASON : SKIP_REASON})`,
  { timeout: NETWORK_TIMEOUT },
  () => {
    let data: Isolation & { nettoyer: () => Promise<void> }
    let invitationOfA: string
    let before: Record<string, Row[]>
    const tokens = new Map<Who, string>()

    /** Une requête de l'écran sur l'adresse, jouée par la porte ; le journal d'une mutation écrit ensuite. */
    async function call(place: Place, who: Who, request: { method: string; path: string; body?: unknown }): Promise<Answer> {
      const tasks: Task[] = []
      const response = await handlePlateforme(
        new Request(`https://${place.host}/api/plateforme/${request.path}`, {
          method: request.method,
          body: request.body === undefined ? undefined : JSON.stringify(request.body),
          headers: { origin: `https://${place.host}`, "x-forwarded-proto": "https", "user-agent": USER_AGENT, "content-type": "application/json" },
        }),
        { accessToken: tokens.get(who), host: place.host, defer: (task) => tasks.push(task) },
      )
      for (const task of tasks) await task()
      const body: { data?: unknown; error?: { code?: string; message?: string } } = await response.json()
      return { status: response.status, code: body.error?.code ?? null, routed: body.error?.message !== UNKNOWN_ROUTE, data: body.data ?? null }
    }

    beforeAll(async () => {
      data = await preparer()
      for (const who of ["a", "c"] as const) tokens.set(who, (await data.sessionOf(who)).accessToken)
      // Une invitation d'A : une liste vide ne prouverait rien (HN-E09S05-2).
      const [invited] = await data.admin<{ id: string }[]>`
        insert into platform.invitations (org_id, email, invited_by) values (${data.a.id}, ${`test-${hex(6)}@example.invalid`}, ${data.people.a.id}) returning id`
      invitationOfA = invited.id
      before = await data.snapshot(data.b.id)
    }, SETUP_TIMEOUT)

    afterAll(async () => {
      await data?.nettoyer()
    }, SETUP_TIMEOUT)

    it("should list only rows of A and answer 404 to every mutation that targets a row of B, B unchanged; 403 to a non-member (AC9)", async () => {
      const { a, b, ids, people } = data
      const listed = await call(a, "c", { method: "GET", path: "invitations" })
      const invitations = listed.data !== null && typeof listed.data === "object" && "invitations" in listed.data && Array.isArray(listed.data.invitations) ? listed.data.invitations : []
      const ofA = await data.admin<{ id: string }[]>`select id from platform.invitations where org_id = ${a.id}`
      expect({ status: listed.status, ids: invitations.map((invitation: Row) => String(invitation.id)).sort() }).toEqual({
        status: 200,
        ids: ofA.map((invitation) => invitation.id).sort(),
      })
      expect(invitations.map((invitation: Row) => invitation.id)).toContain(invitationOfA)

      const ticketOfB = `FB-${String(ids.ticket).padStart(4, "0")}`
      const mutations = [
        { name: "revoke an invitation of B", method: "DELETE", path: `invitations/${ids.invitation}` },
        { name: "rename a team of B", method: "PATCH", path: `teams/${ids.team}`, body: { name: "Intrus" } },
        { name: "remove a member of B", method: "DELETE", path: `members/${people.b.id}` },
        { name: "remove a rule of B", method: "DELETE", path: `rules/${ids.rule}` },
        {
          name: "write a node of B",
          method: "POST",
          path: "nodes",
          body: { path: MARKERS.procedure.path, title: "Intrus", summary: "Intrus.", ops: [{ op: "add_section", section: "Intrus", text: "Intrus." }] },
        },
        { name: "move a node of B", method: "POST", path: "nodes/move", body: { path: MARKERS.page.path, new_path: "zz_deplace" } },
        { name: "handle a ticket of B", method: "PATCH", path: `feedback/${ticketOfB}`, body: { state: "acknowledged" } },
        { name: "revoke a platform access to B", method: "POST", path: `platform-access/${ids.grant}/revoke`, body: {} },
      ]
      const answers = []
      for (const mutation of mutations) answers.push({ name: mutation.name, ...(await call(a, "c", mutation)), data: null })
      // Les Retours sont à l'équipe plateforme seule (E05-S13, AC-9) : un administrateur de A est refusé avant
      // toute lecture, ticket de B ou non, sans rien apprendre de B.
      const refusedFirst = new Set(["handle a ticket of B"])
      expect(answers).toEqual(
        mutations.map(({ name }) =>
          refusedFirst.has(name)
            ? { name, status: 403, code: "forbidden", routed: true, data: null }
            : { name, status: 404, code: "not_found", routed: true, data: null },
        ),
      )

      // La marque n'a pas d'identifiant : elle s'écrit dans l'organisation de l'adresse, jamais dans B.
      const brand = { theme: "foret", logo_url: "https://example.com/isolation.png", display_name: `Marque ${hex(2)}` }
      expect(await call(a, "c", { method: "PATCH", path: "brand", body: brand })).toEqual({ status: 200, code: null, routed: true, data: brand })
      expect(await data.snapshot(b.id)).toEqual(before)

      expect(await call(b, "a", { method: "GET", path: "invitations" })).toEqual({ status: 403, code: "not_member", routed: true, data: null })
    })
  },
)
