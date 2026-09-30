// @vitest-environment node
// `pnpm demo:seed` en mode OIDC (E11-S14, AC-c1, HN-E11S14-2) : un test de fumée sur une vraie base, le
// script en sous-processus, `PLATFORM_OIDC_ISSUER` posée et la personne E2E passée par `--user` (une
// personne sans compte de `createSqlFixtures`). Les variables de Supabase et le mot de passe E2E, vides,
// masquent `.env.local` : le script sème sans eux, donc sans appel à Auth. Puis les deux refus de la ligne
// de commande, sans base. Le mode Supabase reste prouvé par `demo-seed.test.ts` et
// `tests/unit/demo-seed.test.ts` : sans `PLATFORM_OIDC_ISSUER`, rien ne change.
import { execFile } from "child_process"
import { randomUUID } from "crypto"
import path from "path"
import { promisify } from "util"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { OIDC_WITHOUT_USER, USER_WITHOUT_OIDC } from "../../scripts/demo-seed.mjs"
import { hex } from "../helpers/plateforme"
import { adminConnectionSecrets, createSqlFixtures, portable, sqlConfigured, type SqlFixtures, type SqlUser } from "../helpers/sql"

const execFileAsync = promisify(execFile)
const SCRIPT = path.resolve(__dirname, "../../scripts/demo-seed.mjs")
// Un passage du script : 7,4 s mesurées le 2026-09-25 (`isolation/donnees.ts`) ; marge pour la machine partagée.
const SEED_TIMEOUT = 120_000
// Deux lancements du script qui s'arrêtent avant toute connexion : quelques secondes sur la machine partagée.
const REFUSAL_TIMEOUT = 60_000
/** Posée, le script passe en mode OIDC : sa seule présence compte, aucun émetteur n'est joint. */
const OIDC_ISSUER = "https://issuer.example.invalid/oidc"
const SUITE = "demo:seed in OIDC mode"

type Outcome = { status: number | null; printed: string }

/** Le script lancé sans lever : son code de sortie et ses deux sorties (un refus sort en 1). */
async function run(args: string[], env: NodeJS.ProcessEnv): Promise<Outcome> {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [SCRIPT, ...args], { env, timeout: SEED_TIMEOUT })
    return { status: 0, printed: `${stdout}${stderr}` }
  } catch (error) {
    // execFile promis rejette sur un code non nul ; l'erreur porte le code, stdout et stderr du processus.
    const { code, stdout, stderr } = error as { code: number | null; stdout: string; stderr: string }
    return { status: code, printed: `${stdout}${stderr}` }
  }
}

describe.skipIf(!sqlConfigured)(portable(SUITE), { timeout: SEED_TIMEOUT }, () => {
  let fx: SqlFixtures
  let person: SqlUser
  let slug: string
  let seeded: Outcome

  beforeAll(async () => {
    fx = createSqlFixtures()
    person = await fx.createUser()
    slug = `t${hex(4)}`
    seeded = await run(["--slug", slug, "--user", person.id], {
      ...process.env,
      PLATFORM_OIDC_ISSUER: OIDC_ISSUER,
      E2E_USER_EMAIL: person.email,
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
      SUPABASE_SECRET_KEY: "",
      E2E_USER_PASSWORD: "",
    })
    // L'organisation enregistrée pour le nettoyage, script en échec compris.
    const [org] = await fx.admin<{ id: string }[]>`select id from platform.orgs where slug = ${slug}`
    if (org) fx.trackOrg(org.id)
  }, SEED_TIMEOUT)

  afterAll(async () => {
    await fx?.cleanup()
  }, SEED_TIMEOUT)

  it("should seed the organisation with the --user person as administrator and lead of Ventes, without Auth and printing no value (AC-c1)", async () => {
    const [org] = await fx.admin<{ id: string; name: string; demo: boolean | null }[]>`
      select id, name, (settings ->> 'demo')::boolean as demo from platform.orgs where slug = ${slug}`
    const members = org
      ? await fx.admin`select user_id, role, email, name, profile ->> 'name' as profile_name from platform.members where org_id = ${org.id}`
      : []
    const leads = org
      ? await fx.admin`
          select t.slug, m.user_id from platform.team_members m join platform.teams t on t.id = m.team_id
           where t.org_id = ${org.id} and m.role = 'lead'`
      : []

    expect({ status: seeded.status, org: org ? { name: org.name, demo: org.demo } : null, members: [...members], leads: [...leads] }).toEqual({
      status: 0,
      org: { name: `Démo ${slug}`, demo: true },
      members: [{ user_id: person.id, role: "admin", email: person.email, name: "Compte E2E", profile_name: "Compte E2E" }],
      leads: [{ slug: "ventes", user_id: person.id }],
    })
    // Des noms, jamais une valeur : l'échec nommerait la variable imprimée.
    const values = { E2E_USER_EMAIL: person.email, ...adminConnectionSecrets() }
    expect(Object.entries(values).filter(([, value]) => value && seeded.printed.includes(value)).map(([name]) => name)).toEqual([])
  })
})

describe("demo:seed command line in OIDC mode (no database)", { timeout: REFUSAL_TIMEOUT }, () => {
  it("should exit 1 stating the rule for --user outside OIDC mode, and for OIDC mode without --user (AC-c1)", async () => {
    // Vide, la variable masque `.env.local` : hors du mode OIDC.
    const withoutIssuer = await run(["--slug", `t${hex(4)}`, "--user", randomUUID()], { ...process.env, PLATFORM_OIDC_ISSUER: "" })
    const withoutUser = await run(["--slug", `t${hex(4)}`], { ...process.env, PLATFORM_OIDC_ISSUER: OIDC_ISSUER })

    expect([withoutIssuer, withoutUser]).toEqual([
      { status: 1, printed: `${USER_WITHOUT_OIDC}\n` },
      { status: 1, printed: `${OIDC_WITHOUT_USER}\n` },
    ])
  })
})
