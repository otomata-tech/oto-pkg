// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import type { PlatformDb } from "../../packages/plateforme/server/db"
import { ctxCode, hex } from "../helpers/plateforme"
import { asCaller, seedWithAdmin, SQL_SKIP_REASON, sqlConfigured, type SeededData } from "../helpers/sql"

// Invariants du schéma `platform` qu'aucun autre test ne porte (décision JB, E01-S02) : une organisation
// et deux personnes jetables, semées par la connexion d'administration (mise en place, relecture et
// nettoyage seulement) ; chaque assertion passe par la session d'une personne (`asCaller` : rôle
// `authenticated` et ses claims), donc sous RLS. Suite portable depuis E01-S10 f2 (plus de PostgREST ni de
// Supabase Auth) : le job `bare-postgres` la joue. L'isolation entre organisations, en lecture comme en
// écriture, est prouvée table par table par `isolation-par-table.test.ts` (E01-S08, AC3 à AC5) ; ses cas
// redits ici sont retirés (M11b).

const NETWORK_TIMEOUT = 60_000
const SUITE_NAME = "platform RLS"

describe.skipIf(!sqlConfigured)(sqlConfigured ? SUITE_NAME : `${SUITE_NAME} (${SQL_SKIP_REASON})`, { timeout: NETWORK_TIMEOUT }, () => {
  // Renseignés par `beforeAll` ; `describe.skipIf` garantit les variables ici.
  let data: SeededData
  const seed = { org1: "", account1: "", ctx1: "", journal1: "" }
  const users = { a: "", b: "" }
  let asA: PlatformDb

  async function seedOrgData(): Promise<void> {
    const { admin } = data
    const [account] = await admin<{ id: string }[]>`
      insert into platform.accounts (org_id, connector, owner_kind, label, secret_ciphertext)
      values (${seed.org1}, 'mail', 'org', 'Test account', 'not-a-real-secret') returning id`
    seed.account1 = account.id
    seed.ctx1 = ctxCode()
    await admin`insert into platform.ctx (code, org_id, user_id, rules_version) values (${seed.ctx1}, ${seed.org1}, ${users.a}, 1)`
    const [journal] = await admin<{ id: string }[]>`
      insert into platform.journal (org_id, user_id, ctx, method) values (${seed.org1}, ${users.a}, ${seed.ctx1}, 'tools/call') returning id`
    seed.journal1 = journal.id
  }

  beforeAll(async () => {
    data = seedWithAdmin()
    const a = data.person()
    const b = data.person()
    users.a = a.id
    users.b = b.id
    seed.org1 = (await data.createOrg()).id
    await data.addMember(seed.org1, a, "admin")
    await seedOrgData()
    asA = asCaller(a.id, a.email)
  }, NETWORK_TIMEOUT)

  // Tourne même si `beforeAll` ou un test échoue : chaque ressource est enregistrée dès sa
  // création. Organisations d'abord (cascade sur tout le reste), puis personnes.
  afterAll(async () => {
    await data?.cleanup()
  }, NETWORK_TIMEOUT)

  describe("admin role", () => {
    it("should be refused when changing the organization prefix", async () => {
      const refused = asA.tx((sql) => sql`update platform.orgs set prefix = ${`z${hex(4)}`} where id = ${seed.org1} returning id`)
      await expect(refused).rejects.toThrow("prefix is immutable")
    })

    it("should bump updated_at when renaming the organization", async () => {
      const [before] = await asA.tx((sql) => sql<{ updated_at: Date }[]>`select updated_at from platform.orgs where id = ${seed.org1}`)
      const [after] = await asA.tx(
        (sql) => sql<{ updated_at: Date }[]>`update platform.orgs set name = ${`test_${hex(4)}`} where id = ${seed.org1} returning updated_at`,
      )
      expect(after.updated_at.getTime()).toBeGreaterThan(before.updated_at.getTime())
    })
  })

  describe("ctx and journal", () => {
    // L'écriture acceptée sous la session de la personne est celle de la porte MCP (`mcp-core.test.ts`).
    it("should refuse a ctx or a journal row carrying another user's user_id (42501)", async () => {
      const ctx = asA.tx((sql) => sql`insert into platform.ctx (code, org_id, user_id, rules_version) values (${ctxCode()}, ${seed.org1}, ${users.b}, 1)`)
      await expect(ctx).rejects.toMatchObject({ code: "42501" })
      const journal = asA.tx((sql) => sql`insert into platform.journal (org_id, user_id, method) values (${seed.org1}, ${users.b}, 'tools/call')`)
      await expect(journal).rejects.toMatchObject({ code: "42501" })
    })

    // Pas de grant `update` / `delete` sur `ctx` et `journal` : refus attendu en 42501 ; les
    // deux formes (erreur ou 0 ligne) sont admises, la relecture d'administration fait foi.
    it("should keep ctx and journal append-only: no update, no delete", async () => {
      /** L'instruction sous la personne : `true` si elle a été refusée ou n'a touché aucune ligne. */
      const changedNothing = (run: Parameters<PlatformDb["tx"]>[0]) =>
        asA.tx(run).then(
          (rows: unknown) => Array.isArray(rows) && rows.length === 0,
          () => true,
        )
      expect(await changedNothing((sql) => sql`update platform.ctx set rules_version = 2 where code = ${seed.ctx1} returning code`)).toBe(true)
      expect(await changedNothing((sql) => sql`delete from platform.ctx where code = ${seed.ctx1} returning code`)).toBe(true)
      const [ctxAfter] = await data.admin<{ rules_version: number }[]>`select rules_version from platform.ctx where code = ${seed.ctx1}`
      expect(ctxAfter?.rules_version).toBe(1)

      expect(await changedNothing((sql) => sql`update platform.journal set is_error = true where id = ${seed.journal1} returning id`)).toBe(true)
      expect(await changedNothing((sql) => sql`delete from platform.journal where id = ${seed.journal1} returning id`)).toBe(true)
      const [journalAfter] = await data.admin<{ is_error: boolean }[]>`select is_error from platform.journal where id = ${seed.journal1}`
      expect(journalAfter?.is_error).toBe(false)
    })
  })

  describe("accounts secret column", () => {
    it("should refuse select * on accounts, and return the listed columns without secret_ciphertext", async () => {
      await expect(asA.tx((sql) => sql`select * from platform.accounts where org_id = ${seed.org1}`)).rejects.toMatchObject({ code: "42501" })

      const rows = await asA.tx(
        (sql) => sql<Record<string, unknown>[]>`
          select id, org_id, connector, owner_kind, owner_team_id, owner_user_id, label, status, health, mode, created_at, updated_at
          from platform.accounts where org_id = ${seed.org1}`,
      )
      expect(rows.map((row) => row.id)).toEqual([seed.account1])
      expect(rows.every((row) => !("secret_ciphertext" in row))).toBe(true)
    })
  })
})
