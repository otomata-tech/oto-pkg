// @vitest-environment node
// Journal des portes (E03-S01, AC17 et AC19, H07, N3) sur une vraie base, en suite portable (E01-S10,
// partie e1a : `server/journal.ts` passe au SQL ; AC-x3, fiche D76 A) : l'écriture groupée, qui ne lève
// jamais ; la signature du dernier `initialize` de la personne, dans l'organisation, au même agent
// utilisateur. O et P de `seedReferenceOrg`, sous `asCaller` ; sous la seule isolation, Léa lit le journal
// de ses collègues et celui de P, dont elle est membre : le service les écarte lui-même. Les cas sans base
// (arguments, coupes, signatures d'un corps) sont dans `tests/unit/server-journal.test.ts`.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { lastHostSignature, writeJournal, type JournalEntry } from "../../packages/plateforme/server/journal"
import { hex } from "../helpers/plateforme"
import { ORG, OTHER_ORG, PEOPLE, type Person } from "../helpers/reference-org"
import { seedReferenceOrg, type ReferenceOrgSql } from "../helpers/reference-org-sql"
import { asCaller, seedWithAdmin, spyDb, SQL_SKIP_REASON, sqlConfigured, type SeededData } from "../helpers/sql"

const SETUP_TIMEOUT = 180_000
const SUITE = "journal on a real database"

describe.skipIf(!sqlConfigured)(sqlConfigured ? SUITE : `${SUITE} (${SQL_SKIP_REASON})`, () => {
  let seed: SeededData
  let ref: ReferenceOrgSql

  beforeAll(async () => {
    seed = seedWithAdmin()
    ref = await seedReferenceOrg(seed)
  }, SETUP_TIMEOUT)

  afterAll(async () => {
    await seed?.cleanup()
  }, SETUP_TIMEOUT)

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const dbOf = (person: Person) => asCaller(ref.people[person].id, ref.people[person].email)
  /** Un agent utilisateur à ce cas : ses lignes se relisent sans croiser celles d'un autre. */
  const agent = () => `Claude-User-${hex(4)}`

  describe("writeJournal (AC17)", () => {
    it("should insert the lines in one batch, is_error false by default, each column of the batch null where a line does not give it", async () => {
      const userAgent = agent()
      const lines: JournalEntry[] = [
        { org_id: ref.org.id, user_id: ref.people.lea.id, method: "initialize", host: "claude-ai@0.1.0", user_agent: userAgent },
        {
          org_id: ref.org.id,
          user_id: ref.people.lea.id,
          method: "tools/call",
          tool: "acme_read",
          args: { path: "ventes/devis", credentials: { token: "[masked]" } },
          is_error: true,
          error: "not_found: Unknown path ventes/devis.",
          duration_ms: 12,
          user_agent: userAgent,
        },
      ]
      const { db, sent } = spyDb(dbOf("lea"))

      await writeJournal(db, lines)

      expect(sent.map(({ op, target }) => [op, target])).toEqual([["insert", "journal"]])
      expect(
        await seed.admin`select method, host, tool, args, is_error, error, duration_ms, ts is not null as dated
                           from platform.journal where org_id = ${ref.org.id} and user_agent = ${userAgent} order by id`,
      ).toEqual([
        { method: "initialize", host: "claude-ai@0.1.0", tool: null, args: null, is_error: false, error: null, duration_ms: null, dated: true },
        {
          method: "tools/call",
          host: null,
          tool: "acme_read",
          args: { path: "ventes/devis", credentials: { token: "[masked]" } },
          is_error: true,
          error: "not_found: Unknown path ventes/devis.",
          duration_ms: 12,
          dated: true,
        },
      ])
    })

    it("should never throw, and log the code of a refused or failed write, never its message", async () => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {})
      // Ada n'est pas membre de P : `journal_insert_own` refuse sa ligne (42501).
      const refused: JournalEntry = { org_id: ref.other.id, user_id: ref.people.ada.id, method: "tools/call", user_agent: agent() }
      await expect(writeJournal(dbOf("ada"), [refused])).resolves.toBeUndefined()
      const { db } = spyDb(dbOf("lea"), { fail: (query) => (query.target === "journal" ? { code: "57014" } : null) })
      await expect(writeJournal(db, [{ org_id: ref.org.id, user_id: ref.people.lea.id, method: "tools/list" }])).resolves.toBeUndefined()

      expect(log.mock.calls).toEqual([
        ["[platform] journal: insert failed", "42501"],
        ["[platform] journal: insert failed", "57014"],
      ])
      expect(await seed.admin`select id from platform.journal where org_id = ${ref.other.id} and user_id = ${ref.people.ada.id}`).toEqual([])
    })
  })

  describe("lastHostSignature (AC19, N3)", () => {
    it("should read the last initialize of this person, in this organisation, at this user agent", async () => {
      // Plus récente que la ligne attendue, chaque autre ligne manque à une seule des conditions.
      const userAgent = agent()
      const line = (fields: Record<string, unknown>) => ({ org_id: ORG.id, user_id: PEOPLE.lea.id, method: "initialize", user_agent: userAgent, ...fields })
      await ref.write({
        journal: [
          line({ host: "older@1", ts: "2026-09-20T08:00:00.000Z" }),
          line({ host: "claude-ai@0.1.0", ts: "2026-09-21T08:00:00.000Z" }),
          line({ host: "call@1", method: "tools/call", ts: "2026-09-22T08:00:00.000Z" }),
          line({ host: "other-agent@1", user_agent: `${userAgent}-other`, ts: "2026-09-23T08:00:00.000Z" }),
          line({ host: "colleague@1", user_id: PEOPLE.claire.id, ts: "2026-09-24T08:00:00.000Z" }),
          line({ host: "other-org@1", org_id: OTHER_ORG.id, ts: "2026-09-25T08:00:00.000Z" }),
        ],
      })

      expect(await lastHostSignature(dbOf("lea"), ref.identityOf("lea"), userAgent)).toBe("claude-ai@0.1.0")
    })

    it("should give null without a matching initialize, or on a failed read, logged", async () => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {})
      expect(await lastHostSignature(dbOf("marc"), ref.identityOf("marc"), agent())).toBeNull()
      expect(log).not.toHaveBeenCalled()

      const { db } = spyDb(dbOf("lea"), { fail: (query) => (query.target === "journal" ? { code: "57014" } : null) })
      expect(await lastHostSignature(db, ref.identityOf("lea"), agent())).toBeNull()
      expect(log.mock.calls).toEqual([["[platform] journal: initialize read failed", "57014"]])
    })
  })
})
