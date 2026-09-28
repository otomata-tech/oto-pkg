// @vitest-environment node
// Le Data API du projet reste fermé à `platform` (E01-S10, AC-f1, garde durable ; tâche M21) : depuis f2, le
// paquet lit `platform` par sa propre connexion, et le pilote a retiré le schéma des schémas exposés
// (`pnpm data-api:close`, fiche D80). Sans ce test, une réexposition par le tableau de bord de Supabase rendrait
// `platform` lisible et modifiable par PostgREST sous le seul jeton d'une personne, sans que rien échoue :
// chaque `pnpm verify` le rejoue. Même contrôle que celui du script (`scripts/supabase-data-api.mjs`,
// `stillServed`), sous le jeton d'une session de membre au lieu de la clé publique (le libellé d'AC-f1), et
// sans réessai : la configuration n'est pas en train de changer. Marqué Supabase : le Data API est celui du
// projet, et la session celle de Supabase Auth ; le job `bare-postgres` le saute.
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createFixtures, type Fixtures } from "../helpers/plateforme"
import { onProject, projectConfigured } from "../helpers/sql"

const NETWORK_TIMEOUT = 60_000
const SETUP_TIMEOUT = 120_000

/** Le refus de PostgREST pour un schéma hors de sa liste (« The schema must be one of the following »). */
const NOT_EXPOSED = "PGRST106"

describe.skipIf(!projectConfigured)(onProject("the Data API of the project, closed to the platform schema (E01-S10 AC-f1, M21)"), { timeout: NETWORK_TIMEOUT }, () => {
  let fx: Fixtures
  let accessToken = ""

  beforeAll(async () => {
    fx = createFixtures()
    const org = await fx.createOrg()
    const member = await fx.createUser()
    await fx.addMember(org.id, member.id)
    accessToken = (await fx.sessionFor(member)).accessToken
  }, SETUP_TIMEOUT)

  afterAll(async () => {
    await fx?.cleanup()
  }, SETUP_TIMEOUT)

  it("should refuse /rest/v1/nodes under Accept-Profile: platform with the session token of a member (PGRST106)", async () => {
    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/nodes?select=id&limit=1`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "", Authorization: `Bearer ${accessToken}`, "Accept-Profile": "platform" },
    })
    const body: unknown = await response.json().catch(() => null)
    const code = typeof body === "object" && body !== null ? Reflect.get(body, "code") : undefined
    // Le statut et le code seulement : jamais le corps, qui porterait des lignes si le schéma était servi.
    expect({ ok: response.ok, code }).toEqual({ ok: false, code: NOT_EXPOSED })
  })
})
