// @vitest-environment node
// Sans `window` (jsdom), supabase-js ne se croit pas dans un navigateur : pas d'avertissement
// « Multiple GoTrueClient instances » pour les clients du test. Depuis E01-S10 f2, `platform` se lit et
// s'écrit par la connexion d'administration ; le client de Supabase Auth ne sert plus qu'aux comptes.
import { spawnSync } from "child_process"
import { randomUUID } from "crypto"
import path from "path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import type { Database } from "../../packages/plateforme/server/database"
import { deleteOrgs, deleteUsers, forgetStaff, NOT_STALE_TEST_DATA, STAFF_IN_USE, staleTestData } from "../../scripts/test-cleanup.mjs"
import { createFixtures, hex, SKIP_REASON, supabaseConfigured, type Fixtures } from "../helpers/plateforme"
import { adminConnectionSecrets, seedWithAdmin, SQL_SKIP_REASON, sqlConfigured, testAdminSql, type SeededPerson, type TestSql } from "../helpers/sql"

// `pnpm test:cleanup` (M11) sur le projet Supabase cloud : un test de fumée, qui joue le refus de
// `security-patterns.md § Outillage à clé service`. Le script lancé sans `--delete` ne fait que
// compter ; l'étape de suppression est appelée sur les seules organisations du test (`--delete`
// purgerait aussi les restes des autres passages). Seule l'organisation marquée de plus de 2 h part ;
// celle d'un client (slug égal au préfixe et commençant par `t`, sans la forme `t<8 hex>`) et une
// organisation de test récente restent identiques. Un passage interrompu laisse l'organisation
// `tesla<hex>` : le ménage ne la reconnaît pas, par construction. Une personne sans compte de l'équipe
// plateforme, qui sert l'organisation marquée de plus de 2 h, est comptée sans `--delete` (M23).

type OrgRow = Database["platform"]["Tables"]["orgs"]["Row"]

const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const secretKey = process.env.SUPABASE_SECRET_KEY

const script = path.resolve(__dirname, "../../scripts/test-cleanup.mjs")
const NETWORK_TIMEOUT = 120_000
const COUNTS =
  /^Données de test créées il y a plus de 2 h : (\d+) organisation\(s\) t<hex>, \d+ compte\(s\) test-<hex>@example\.invalid, (\d+) personne\(s\) sans compte de l'équipe plateforme\.\nRien n'est supprimé sans --delete\.\n$/

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3600 * 1000).toISOString()

// Les étapes de suppression reçoivent la connexion d'administration (E01-S10, AC-f4) : celle des
// tests, par `PLATFORM_ADMIN_DATABASE_URL` comme le script.
const configured = supabaseConfigured && sqlConfigured

describe.skipIf(!configured)(
  configured
    ? "test:cleanup on the cloud Supabase project"
    : `test:cleanup on the cloud Supabase project (${supabaseConfigured ? SQL_SKIP_REASON : SKIP_REASON})`,
  { timeout: NETWORK_TIMEOUT },
  () => {
    // Renseignés par `beforeAll` : organisation de test de 3 h, organisation de test récente,
    // organisation d'un client de 3 h ; `portable`, par le premier test : la personne sans compte.
    let fx: Fixtures
    let sql: TestSql
    let stale: OrgRow
    let recent: OrgRow
    let client: OrgRow
    let portable: SeededPerson | undefined

    /** La ligne de l'organisation en JSON, dates en texte ISO comme les lit le script, ou rien. */
    async function orgRow(id: string): Promise<OrgRow | null> {
      const [found] = await sql<{ row: OrgRow }[]>`select to_jsonb(o) as row from platform.orgs o where o.id = ${id}`
      return found?.row ?? null
    }

    async function existingOrg(id: string): Promise<OrgRow> {
      const row = await orgRow(id)
      if (!row) throw new Error("org missing right after its creation")
      return row
    }

    beforeAll(async () => {
      fx = createFixtures()
      sql = testAdminSql()
      const marked = await fx.createOrg()
      await sql`update platform.orgs set created_at = ${hoursAgo(3)}::text::timestamptz where id = ${marked.id}`
      const fresh = await fx.createOrg()
      const slug = `tesla${hex(3)}`
      const [inserted] = await sql<{ id: string }[]>`
        insert into platform.orgs (name, slug, prefix, created_at) values (${`Tesla ${slug}`}, ${slug}, ${slug}, ${hoursAgo(3)}::text::timestamptz) returning id`
      fx.trackOrg(inserted.id)
      stale = await existingOrg(marked.id)
      recent = await existingOrg(fresh.id)
      client = await existingOrg(inserted.id)
    }, NETWORK_TIMEOUT)

    afterAll(async () => {
      try {
        await fx?.cleanup()
      } finally {
        try {
          // Sa ligne `platform_staff`, que la suppression de l'organisation laisse (M23).
          if (portable) await sql`select platform.forget_user(${portable.id})`
        } finally {
          await sql?.end()
        }
      }
    }, NETWORK_TIMEOUT)

    it("should count without deleting, a platform team member without an account among them, then delete only the stale organization bearing the test mark, refusing any other row before its request", async () => {
      // M23 : à l'adresse des tests, sans compte, elle ne sert que l'organisation marquée de 3 h ; une
      // personne à compte qui la sert aussi n'est pas de la sélection : elle part avec son compte.
      portable = { id: randomUUID(), email: `test-${hex(6)}@example.invalid` }
      await sql`insert into platform.platform_staff (user_id, email) values (${portable.id}, ${portable.email})`
      await sql`insert into platform.platform_grants (org_id, user_id) values (${stale.id}, ${portable.id})`
      const withAccount = await fx.createUser()
      await fx.makeStaff(withAccount.id)
      await fx.grantPlatformAccess(stale.id, withAccount.id, null)

      const run = spawnSync(process.execPath, [script], { encoding: "utf8", timeout: 90_000 })
      const printed = run.stdout + run.stderr
      // Des noms et un booléen, jamais les valeurs : `not.toContain` les afficherait en échec.
      const leaked = Object.entries({ secretKey, anonKey, ...adminConnectionSecrets() }).filter(([, value]) => value && printed.includes(value))
      expect(leaked.map(([name]) => name)).toEqual([])
      expect(/@/.test(printed.replaceAll("test-<hex>@example.invalid", ""))).toBe(false)
      expect({ status: run.status, stderr: run.stderr }).toEqual({ status: 0, stderr: "" })
      expect(run.stdout).toMatch(COUNTS)
      const counts = COUNTS.exec(run.stdout)
      expect(Number(counts?.[1])).toBeGreaterThanOrEqual(1)
      expect(Number(counts?.[2])).toBeGreaterThanOrEqual(1)
      expect(await orgRow(stale.id)).toEqual(stale)
      // Les nombres imprimés comptent aussi les restes des autres passages : la sélection se relit sur les
      // deux personnes de ce test.
      const selected = (await staleTestData({ sql, admin: fx.auth }, Date.now())).persons.map((person) => person.user_id)
      expect({ portable: selected.includes(portable.id), withAccount: selected.includes(withAccount.id) }).toEqual({ portable: true, withAccount: false })

      const now = Date.now()
      const orgs = await deleteOrgs(sql, [stale, recent, client], now)
      // Ids tirés au hasard, qu'aucun compte ne porte : une requête partie rendrait l'erreur d'Auth.
      const users = await deleteUsers(
        { sql, admin: fx.auth },
        [
          { id: randomUUID(), email: "claire@acme.test", created_at: hoursAgo(3) },
          { id: randomUUID(), email: `test-${hex(6)}@example.invalid`, created_at: hoursAgo(0) },
        ],
        now,
      )

      expect(orgs).toEqual({ deleted: 1, reasons: new Map([[NOT_STALE_TEST_DATA, 2]]) })
      expect(users).toEqual({ deleted: 0, reasons: new Map([[NOT_STALE_TEST_DATA, 2]]) })
      expect(await orgRow(stale.id)).toBeNull()
      expect(await orgRow(recent.id)).toEqual(recent)
      expect(await orgRow(client.id)).toEqual(client)
    })

    // M23 : une personne sans compte Auth des fixtures portables (E01-S10 t1-0), que la base admin date
    // au 1er septembre (`added_at`) : son âge se lit par les organisations qu'elle sert. Données à ce
    // test, par la connexion d'administration : organisations `t<hex>`, l'une vieillie de 3 h ; deux
    // anciennes qui n'ont qu'une moitié de la marque, celle d'un client (slug en `t` sans la forme
    // `t<8 hex>`, égal au préfixe) et une au slug `t<8 hex>` et à un autre préfixe ; au second appel,
    // deux de même forme, datées de dans 2 h.
    it("should forget a platform team member without an account once its test organizations are older than 2 h, or it serves none and no pass is running, refusing any other before or in its request", async () => {
      const seed = seedWithAdmin()
      const unmarkedOrgs: string[] = []
      const insertUnmarked = async (slug: string, prefix: string, createdAt: Date) => {
        const [org] = await seed.admin<{ id: string }[]>`
          insert into platform.orgs (name, slug, prefix, created_at)
          values (${`Client ${slug}`}, ${slug}, ${prefix}, ${createdAt}) returning id`
        unmarkedOrgs.push(org.id)
        return org
      }
      try {
        const threeHoursAgo = new Date(Date.now() - 3 * 3600 * 1000)
        const aged = await seed.createOrg()
        await seed.admin`update platform.orgs set created_at = ${threeHoursAgo} where id = ${aged.id}`
        const fresh = await seed.createOrg()
        const slug = `tclient${hex(2)}`
        const client = await insertUnmarked(slug, slug, threeHoursAgo)
        const halfMarked = await insertUnmarked(`t${hex(4)}`, `p${hex(4)}`, threeHoursAgo)
        // stale : l'organisation de test ancienne ; busy : elle, et la récente par appartenance ;
        // served : celle du client seulement ; half : celle au préfixe différent seulement ; orphan :
        // aucune ; unmarked : sans l'adresse des tests.
        const people = { stale: seed.person(), busy: seed.person(), served: seed.person(), half: seed.person(), orphan: seed.person() }
        const rowOf = (person: SeededPerson) => ({ user_id: person.id, email: person.email })
        const grant = (orgId: string, person: SeededPerson) => ({ org_id: orgId, user_id: person.id })
        await seed.admin`insert into platform.platform_staff ${seed.admin(Object.values(people).map(rowOf))}`
        await seed.admin`insert into platform.platform_grants ${seed.admin([
          grant(aged.id, people.stale),
          grant(aged.id, people.busy),
          grant(client.id, people.served),
          grant(halfMarked.id, people.half),
        ])}`
        await seed.addMember(fresh.id, people.busy)
        const unmarked = { user_id: randomUUID(), email: `staff-${hex(6)}@example.invalid` }
        const staffLeft = async () => {
          const ids = Object.values(people).map((person) => person.id)
          const rows = await seed.admin<{ user_id: string }[]>`select user_id from platform.platform_staff where user_id in ${seed.admin(ids)}`
          return rows.map((row) => row.user_id).sort()
        }

        const now = Date.now()
        const forgotten = await forgetStaff(seed.admin, [...Object.values(people).map(rowOf), unmarked], now)
        expect(forgotten).toEqual({ deleted: 1, reasons: new Map([[STAFF_IN_USE, 4], [NOT_STALE_TEST_DATA, 1]]) })
        expect(await staffLeft()).toEqual([people.busy.id, people.served.id, people.half.id, people.orphan.id].sort())

        // Trois heures plus tard, aucune organisation de test n'a moins de 2 h : la personne qui n'en
        // sert aucune part, même quand deux organisations à une moitié de la marque sont récentes pour
        // cette coupure ; celles qui servent le client et l'organisation au préfixe différent restent.
        const inTwoHours = new Date(now + 2 * 3600 * 1000)
        const futureSlug = `tclient${hex(2)}`
        await insertUnmarked(futureSlug, futureSlug, inTwoHours)
        await insertUnmarked(`t${hex(4)}`, `p${hex(4)}`, inTwoHours)
        const later = await forgetStaff(seed.admin, [rowOf(people.orphan), rowOf(people.served), rowOf(people.half)], now + 3 * 3600 * 1000)
        expect(later).toEqual({ deleted: 1, reasons: new Map([[STAFF_IN_USE, 2]]) })
        expect(await staffLeft()).toEqual([people.busy.id, people.served.id, people.half.id].sort())
      } finally {
        try {
          if (unmarkedOrgs.length > 0) await seed.admin`delete from platform.orgs where id in ${seed.admin(unmarkedOrgs)}`
        } finally {
          await seed.cleanup()
        }
      }
    })
  },
)
