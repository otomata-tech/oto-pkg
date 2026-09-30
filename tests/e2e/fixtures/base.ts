import { randomUUID } from "crypto"
import { createClient } from "@supabase/supabase-js"
import postgres, { type Sql } from "postgres"
import { sslOption } from "../../../packages/plateforme/cli/ssl-option.mjs"
import { hex, type TestOrg } from "../../helpers/plateforme"

// Ce que les contrôles visuels lisent ou écrivent dans `platform` passe par la connexion d'administration
// (`PLATFORM_ADMIN_DATABASE_URL`, E01-S10 partie f2, AC-f5), jamais par le Data API, que f2 ferme ; les
// personnes se connectent toujours par Supabase Auth (compte E2E). La variable se lit dans l'environnement
// du processus, où `playwright.config.ts` la pose depuis `.env.local` avec les autres (M48). Aucune valeur
// n'est imprimée. `scripts/lib/env.mjs` (`resolveVariables`, `adminSql`) ne se charge pas sous Playwright :
// il importe `cli/db-prepare.mjs`, qui lit `import.meta.url`, et le chargeur de Playwright le refuse
// (« exports is not defined in ES module scope », mesuré au lot f2-e2e). La règle
// TLS se lit dans `cli/ssl-option.mjs`, qui ne lit aucun fichier (M47).

const adminUrl = process.env.PLATFORM_ADMIN_DATABASE_URL ?? ""

export const baseAdminConfiguree = Boolean(adminUrl)

/** Raison du saut d'une spec qui lit ou écrit `platform`, sans aucune valeur. */
export const SANS_BASE_ADMIN = "set E2E_USER_EMAIL, E2E_USER_PASSWORD, the Supabase variables and PLATFORM_ADMIN_DATABASE_URL in .env.local"

/** Une connexion, ouverte à la première requête, sans RLS. TLS exigé sauf `sslmode` ou `ssl` écrit dans l'URL (`sslOption`). */
function connexionAdmin(): Sql {
  return postgres(adminUrl, { max: 1, ...sslOption(adminUrl), onnotice: () => {}, connection: { application_name: "oto-platform tests" } })
}

/** `fn` sur la connexion d'administration, fermée ensuite, même après un échec. */
export async function avecLaBase<T>(fn: (sql: Sql) => Promise<T>): Promise<T> {
  const sql = connexionAdmin()
  try {
    return await fn(sql)
  } finally {
    await sql.end({ timeout: 5 })
  }
}

/** Le compte est-il de l'équipe plateforme ? Le menu de l'entreprise et `/admin/feedback` en dépendent (E05-S13, AC-9, AC-10). */
export async function compteDuStaff(email: string): Promise<boolean> {
  const [lu] = await avecLaBase((sql) => sql<{ staff: boolean }[]>`select exists (select 1 from platform.platform_staff where lower(email) = lower(${email})) as staff`)
  return lu?.staff === true
}

/** Démo est-elle servie à `localhost` ? `org_by_host`, la fonction que lit la page, par la connexion d'administration. */
export async function demoServieALocalhost(): Promise<boolean> {
  const lues = await avecLaBase((sql) => sql`select id from platform.org_by_host('localhost')`)
  return lues.length > 0
}

/** Client Supabase Auth à la clé publique, sans session ni schéma : la connexion d'une personne, rien de `platform`. */
export function clientAuth() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "", {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** Une personne de `platform` : un identifiant et ses copies (E01-S09) ; un contact jetable n'a pas de compte Auth. */
export type Personne = { id: string; email: string; name?: string | null }

/**
 * Organisations et contacts jetables d'une spec, sur la connexion d'administration : la forme de
 * `createFixtures` (`tests/helpers/plateforme.ts`) réduite à ce que les specs posent. `cleanup()` en
 * `afterAll`, même après un échec : organisations (cascade), puis `forget_user` de chaque contact, puis la
 * connexion ; toutes les remises jouées avant de lever.
 */
export function donneesJetables() {
  const sql = connexionAdmin()
  const orgIds: string[] = []
  const contactIds: string[] = []

  /** `t<hex>`, et `t<hex>.localhost` pour `localhost` : Chromium résout `*.localhost` vers la machine. */
  async function createOrg(options: { name?: string; localhost?: boolean } = {}): Promise<TestOrg> {
    const suffix = hex(4)
    const [org] = await sql<TestOrg[]>`
      insert into platform.orgs (name, slug, prefix)
      values (${options.name ?? `test_${suffix}`}, ${`t${suffix}`}, ${`t${suffix}`})
      returning id, slug, prefix, name`
    orgIds.push(org.id)
    if (options.localhost) await sql`insert into platform.org_domains (host, org_id) values (${`${org.slug}.localhost`}, ${org.id})`
    return org
  }

  function contact(): Personne {
    const id = randomUUID()
    contactIds.push(id)
    return { id, email: `test-${hex(6)}@example.invalid` }
  }

  async function addMember(orgId: string, personne: Personne, options: { role: "admin" | "member"; profile: Record<string, string> }): Promise<void> {
    await sql`
      insert into platform.members (org_id, user_id, role, profile, email, name)
      values (${orgId}, ${personne.id}, ${options.role}, ${sql.json(options.profile)}, ${personne.email.toLowerCase()}, ${personne.name ?? null})`
  }

  async function createTeam(orgId: string, team: { slug: string; name: string }): Promise<void> {
    await sql`insert into platform.teams (org_id, slug, name) values (${orgId}, ${team.slug}, ${team.name})`
  }

  async function cleanup(): Promise<void> {
    const failures: string[] = []
    const remettre = async (quoi: string, remise: () => Promise<unknown>) => {
      await remise().catch((error: unknown) => failures.push(`${quoi}: ${error instanceof Error ? error.message : String(error)}`))
    }
    if (orgIds.length > 0) await remettre("orgs delete", () => sql`delete from platform.orgs where id in ${sql(orgIds)}`)
    for (const id of contactIds) await remettre("forget_user", () => sql`select platform.forget_user(${id})`)
    await remettre("connexion", () => sql.end({ timeout: 5 }))
    if (failures.length > 0) throw new Error(`cleanup incomplete: ${failures.join("; ")}`)
  }

  return { sql, createOrg, contact, addMember, createTeam, cleanup }
}

export type DonneesJetables = ReturnType<typeof donneesJetables>
