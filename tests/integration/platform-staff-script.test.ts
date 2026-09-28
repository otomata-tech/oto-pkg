// @vitest-environment node
// `pnpm platform:staff` (E08-S02, AC26) sur le projet Supabase cloud : un test de fumée, le script en
// sous-processus sur un compte jetable. `add` pose la ligne `platform_staff` (`added_by` nul), `list`
// la montre, `remove` la retire ; aucune valeur de variable n'est imprimée. Pendant le test, une
// personne sans compte Auth est aussi de l'équipe plateforme, posée par la connexion d'administration
// comme le font les fixtures portables d'E01-S10 t1-0, puis oubliée : `list` la montre par l'email
// copié dans sa ligne, sans s'arrêter (M23). Elle sert une organisation marquée récente du test : un
// `pnpm test:cleanup --delete` lancé pendant le test ne l'oublie pas (`staleStaff`).
import { spawnSync } from "child_process"
import { randomBytes } from "crypto"
import path from "path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createFixtures, SKIP_REASON, supabaseConfigured, type Fixtures, type TestUser } from "../helpers/plateforme"
import { adminConnectionSecrets, seedWithAdmin, SQL_SKIP_REASON, sqlConfigured, type SeededData, type SeededPerson } from "../helpers/sql"

const script = path.resolve(__dirname, "../../scripts/platform-staff.mjs")
const NETWORK_TIMEOUT = 120_000
// Trois lancements du script, chacun lit tous les comptes du projet (`listUsers`) : 60 s au plus chacun.
const SPAWN_TIMEOUT = 60_000

const values = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  secretKey: process.env.SUPABASE_SECRET_KEY,
  ...adminConnectionSecrets(),
}

function run(...args: string[]) {
  const done = spawnSync(process.execPath, [script, ...args], { cwd: path.resolve(__dirname, "../.."), encoding: "utf8", timeout: SPAWN_TIMEOUT })
  return { status: done.status, printed: `${done.stdout}${done.stderr}` }
}

// Le script atteint `platform_staff` par la connexion d'administration (E01-S10, AC-f4) : sans elle, il
// s'arrête sur « Variables manquantes », et la suite se saute au lieu d'échouer.
const configured = supabaseConfigured && sqlConfigured

describe.skipIf(!configured)(
  configured
    ? "platform:staff on the cloud project"
    : `platform:staff on the cloud project (${supabaseConfigured ? SQL_SKIP_REASON : SKIP_REASON})`,
  { timeout: NETWORK_TIMEOUT * 2 },
  () => {
    let fx: Fixtures
    let user: TestUser
    let seed: SeededData
    /** La personne sans compte et la date de sa ligne, rendue comme la rend le script (`to_json`). */
    let portable: SeededPerson & { addedAt: string }

    beforeAll(async () => {
      fx = createFixtures()
      user = await fx.createUser()
      seed = seedWithAdmin()
      const org = await seed.createOrg()
      const person = seed.person()
      const [row] = await seed.admin<{ added_at: string }[]>`
        insert into platform.platform_staff (user_id, email) values (${person.id}, ${person.email})
        returning to_json(added_at) as added_at`
      await seed.admin`insert into platform.platform_grants (org_id, user_id) values (${org.id}, ${person.id})`
      portable = { ...person, addedAt: row.added_at }
    }, NETWORK_TIMEOUT)

    afterAll(async () => {
      try {
        await fx?.cleanup()
      } finally {
        await seed?.cleanup()
      }
    }, NETWORK_TIMEOUT)

    it("should add, list and remove a platform team member, list a member without an account from its row, and print no variable value", async () => {
      // `added_at` rendu comme le rend le script (`to_json`), par la connexion d'administration.
      const staffRow = () =>
        seed.admin<{ added_by: string | null; added_at: string; email: string; name: string | null }[]>`
          select added_by, to_json(added_at) as added_at, email, name from platform.platform_staff where user_id = ${user.id}`

      const added = run("add", user.email.toUpperCase())
      expect(added).toEqual({ status: 0, printed: `${user.email.toUpperCase()} ajouté à l'équipe plateforme.\n` })
      const row = await staffRow()
      // E01-S09 (AC15) : l'email du compte (minuscules), et son nom quand il en a un.
      expect(row).toEqual([{ added_by: null, added_at: expect.any(String), email: user.email, name: null }])

      const listed = run("list")
      expect(listed.status).toBe(0)
      expect(listed.printed).toContain(`${user.email} · ajouté le ${String(row?.[0].added_at).slice(0, 10)}`)
      // M23 : sans compte Auth, la personne ne l'arrête plus ; l'email vient de sa ligne (E01-S09).
      expect(listed.printed).toContain(`${portable.email} · ajouté le ${portable.addedAt.slice(0, 10)}`)

      const removed = run("remove", user.email)
      expect(removed).toEqual({ status: 0, printed: `${user.email} retiré de l'équipe plateforme.\n` })
      expect(await staffRow()).toEqual([])

      const printed = [added, listed, removed].map((output) => output.printed).join("")
      const leaked = Object.entries(values).filter(([, value]) => value && printed.includes(value))
      expect(leaked.map(([name]) => name)).toEqual([])
    })
  },
)

// Mode OIDC (E01-S11, HN-E01S11-6, fiche D77 A) : aucun compte Supabase, la ligne se crée par son email,
// par la seule connexion d'administration. L'organisation marquée d'abord, et l'accès de la personne à
// elle : un `pnpm test:cleanup --delete` lancé pendant le test ne l'oublie pas (`staleStaff`).
describe.skipIf(!sqlConfigured)(sqlConfigured ? "platform:staff in OIDC mode" : `platform:staff in OIDC mode (${SQL_SKIP_REASON})`, { timeout: NETWORK_TIMEOUT }, () => {
  let seed: SeededData
  let orgId: string
  const email = `test-${randomBytes(4).toString("hex")}@example.invalid`
  let staffId: string | undefined

  function runOidc(...args: string[]) {
    const env = { ...process.env, PLATFORM_OIDC_ISSUER: "https://issuer.example.invalid/oidc" }
    const done = spawnSync(process.execPath, [script, ...args], { cwd: path.resolve(__dirname, "../.."), encoding: "utf8", timeout: SPAWN_TIMEOUT, env })
    return { status: done.status, printed: `${done.stdout}${done.stderr}` }
  }

  beforeAll(async () => {
    seed = seedWithAdmin()
    orgId = (await seed.createOrg()).id
  })

  afterAll(async () => {
    try {
      if (staffId) await seed.admin`select platform.forget_user(${staffId})`
    } finally {
      await seed?.cleanup()
    }
  })

  it("should add by email a platform team member without any account, once, then remove it", async () => {
    const rows = () => seed.admin<{ user_id: string; email: string; name: string | null }[]>`select user_id, email, name from platform.platform_staff where email = ${email}`

    const added = runOidc("add", email.toUpperCase())
    const [row] = await rows()
    staffId = row?.user_id
    if (staffId) await seed.admin`insert into platform.platform_grants (org_id, user_id) values (${orgId}, ${staffId})`
    const again = runOidc("add", email)
    const kept = await rows()
    const removed = runOidc("remove", email)

    expect(added).toEqual({ status: 0, printed: `${email.toUpperCase()} ajouté à l'équipe plateforme.\n` })
    expect(row).toEqual({ user_id: expect.stringMatching(/^[0-9a-f-]{36}$/), email, name: null })
    expect(again).toEqual({ status: 0, printed: `${email} est déjà dans l'équipe plateforme.\n` })
    expect(kept).toEqual([row])
    expect(removed).toEqual({ status: 0, printed: `${email} retiré de l'équipe plateforme.\n` })
    expect(await rows()).toEqual([])
  })
})
