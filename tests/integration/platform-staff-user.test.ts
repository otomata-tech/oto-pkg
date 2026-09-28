// @vitest-environment node
// `pnpm platform:staff add <email> --user <identifiant>` en mode OIDC (M35, fiche D93 A) : une personne
// retirée de l'équipe plateforme après sa première connexion garde son sujet lié à son identifiant dans
// `identities` ; rajoutée par son seul email, elle reçoit un identifiant neuf que ce sujet ne rejoint
// jamais (HN-E01S11w-13). `--user` reprend l'ancien, lu dans `identities` par la connexion d'administration,
// et refuse un identifiant que cet émetteur ne connaît pas. Suite portable (Postgres nu comme projet) :
// l'organisation marquée d'abord, et l'accès de chaque personne posée à elle, pour qu'un
// `pnpm test:cleanup --delete` lancé pendant le test ne l'oublie pas (`staleStaff`).
import { spawnSync } from "child_process"
import { randomBytes, randomUUID } from "crypto"
import path from "path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { seedWithAdmin, SQL_SKIP_REASON, sqlConfigured, type SeededData, type SeededPerson } from "../helpers/sql"

const script = path.resolve(__dirname, "../../scripts/platform-staff.mjs")
const ISSUER = "https://issuer.example.invalid/oidc"
// Jusqu'à cinq lancements du script par test, chacun une connexion d'administration : 60 s au plus chacun.
const SPAWN_TIMEOUT = 60_000
const NETWORK_TIMEOUT = 120_000

function run(issuer: string, ...args: string[]) {
  const env = { ...process.env, PLATFORM_OIDC_ISSUER: issuer }
  const done = spawnSync(process.execPath, [script, ...args], { cwd: path.resolve(__dirname, "../.."), encoding: "utf8", timeout: SPAWN_TIMEOUT, env })
  return { status: done.status, printed: `${done.stdout}${done.stderr}` }
}

describe.skipIf(!sqlConfigured)(sqlConfigured ? "platform:staff add --user in OIDC mode" : `platform:staff add --user in OIDC mode (${SQL_SKIP_REASON})`, { timeout: NETWORK_TIMEOUT }, () => {
  let seed: SeededData
  let orgId: string
  /** Connectée une fois chez `ISSUER`, puis retirée : sa ligne `identities` reste, sans ligne `platform_staff`. */
  let person: SeededPerson
  /** Les identifiants neufs que `add` sans `--user` a tirés : oubliés après le test. */
  const drawn: string[] = []

  const staffRows = (email: string) =>
    seed.admin<{ user_id: string; email: string; name: string | null }[]>`select user_id, email, name from platform.platform_staff where email = ${email}`
  const grant = (userId: string) => seed.admin`insert into platform.platform_grants (org_id, user_id) values (${orgId}, ${userId})`

  beforeAll(async () => {
    seed = seedWithAdmin()
    orgId = (await seed.createOrg()).id
    person = seed.person()
    await seed.admin`insert into platform.identities (issuer, subject, user_id) values (${ISSUER}, ${`sub-${randomBytes(6).toString("hex")}`}, ${person.id})`
  }, NETWORK_TIMEOUT)

  afterAll(async () => {
    try {
      for (const id of drawn) await seed.admin`select platform.forget_user(${id})`
    } finally {
      await seed?.cleanup()
    }
  }, NETWORK_TIMEOUT)

  it("should give a person removed then added again its former identifier, once, after removing the row under a new one", async () => {
    const byEmail = run(ISSUER, "add", person.email)
    const [fresh] = await staffRows(person.email)
    if (fresh) {
      drawn.push(fresh.user_id)
      await grant(fresh.user_id)
    }
    const heldElsewhere = run(ISSUER, "add", person.email, "--user", person.id)
    const removed = run(ISSUER, "remove", person.email)
    const added = run(ISSUER, "add", "--user", person.id, person.email.toUpperCase())
    const rows = await staffRows(person.email)
    if (rows.length > 0) await grant(person.id)
    const again = run(ISSUER, "add", person.email, "--user", person.id)

    expect(byEmail.status).toBe(0)
    expect(fresh?.user_id).not.toBe(person.id)
    expect(heldElsewhere).toEqual({
      status: 1,
      printed: `${person.email} est déjà dans l'équipe plateforme sous un autre identifiant : pnpm platform:staff remove ${person.email}, puis add --user.\n`,
    })
    expect(removed.status).toBe(0)
    expect(added).toEqual({ status: 0, printed: `${person.email.toUpperCase()} ajouté à l'équipe plateforme sous ${person.id}.\n` })
    expect(rows).toEqual([{ user_id: person.id, email: person.email, name: null }])
    expect(again).toEqual({ status: 0, printed: `${person.id} est déjà dans l'équipe plateforme.\n` })
    expect(await staffRows(person.email)).toEqual(rows)
  })

  it("should refuse an identifier unknown at this issuer, a malformed one, and --user outside OIDC mode, writing nothing", async () => {
    const email = `test-${randomBytes(4).toString("hex")}@example.invalid`
    const unknownId = randomUUID()
    const unknown = (id: string) => ({
      status: 1,
      printed: `Identifiant inconnu : ${id} n'est lié à aucune personne de cet émetteur dans platform.identities. Sans --user, add pose un identifiant neuf.\n`,
    })

    expect(run(ISSUER, "add", email, "--user", unknownId)).toEqual(unknown(unknownId))
    // Lié chez un autre émetteur seulement : le sujet de celui-ci ne le rejoindrait jamais.
    expect(run("https://other.example.invalid/oidc", "add", email, "--user", person.id)).toEqual(unknown(person.id))
    expect(run(ISSUER, "add", email, "--user", "not-an-identifier")).toEqual(unknown("not-an-identifier"))
    expect(run("", "add", email, "--user", person.id)).toEqual({
      status: 1,
      printed: "--user ne sert qu'en mode OIDC (PLATFORM_OIDC_ISSUER posée) : sur Supabase Auth, l'identifiant est celui du compte de l'email.\n",
    })
    expect(await staffRows(email)).toEqual([])
  })
})
