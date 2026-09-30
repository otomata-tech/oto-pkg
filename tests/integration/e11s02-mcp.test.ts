// @vitest-environment node
// E11-S02 par le MCP (AC-h1, AC-h2, AC-b1) : `InMemoryTransport` (`connectDeps`) sur la fixture d'E07-S01
// semée sur une vraie base (`seedTableFixture`, une graine pour le fichier ; suite portable), codes `ctx`
// semés. Ce qu'on vérifie est ce que le modèle lit : `find` trouve les trois fonctions qui suppriment, `read`
// sert leur contrat en deux temps, `call` rend le récapitulatif puis l'exécution, le même texte dans les deux
// canaux, et la ligne de journal d'une suppression de lignes porte `_outcome` (celle du récapitulatif non).
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { connectDeps } from "../helpers/mcp"
import { ORG, PEOPLE, type Person } from "../helpers/reference-org"
import type { ReferenceOrgSql } from "../helpers/reference-org-sql"
import { portable, seedWithAdmin, sqlConfigured, type SeededData } from "../helpers/sql"
import { PROSPECTS } from "../factories/table-fixture"
import { seedTableFixture } from "../factories/table-fixture-sql"
import { acmeIdentity, freshTable } from "../factories/table-publish-sql"

const NETWORK_TIMEOUT = 60_000
const SETUP_TIMEOUT = 180_000

const CTX: Record<"lea" | "claire", string> = { lea: "LEAA-2202", claire: "CLAI-2202" }

describe.skipIf(!sqlConfigured)(portable("E11-S02 through MCP: the functions that delete, in two steps"), { timeout: NETWORK_TIMEOUT }, () => {
  let seed: SeededData
  let ref: ReferenceOrgSql

  beforeAll(async () => {
    seed = seedWithAdmin()
    ref = await seedTableFixture(seed)
    await ref.write({
      ctx: (["lea", "claire"] as const).map((person) => ({ code: CTX[person], user_id: PEOPLE[person].id, org_id: ORG.id, rules_version: 1, host: null })),
    })
  }, SETUP_TIMEOUT)

  afterAll(async () => {
    await seed?.cleanup()
  }, SETUP_TIMEOUT)

  /** Une session MCP de la personne sur la fixture, avec son code `ctx` semé. */
  async function session(person: "lea" | "claire") {
    const identity = acmeIdentity(ref, person as Person)
    const connected = await connectDeps({
      db: await ref.db(person),
      org: identity.org,
      caller: { kind: "member", identity },
      userAgent: "unit-test",
      journal: [],
      activeConnectors: () => Promise.resolve(new Set<string>()),
      origin: "https://acme.test",
    })
    const ctx = ref.id(CTX[person])
    return { ...connected, tool: (name: string, args: Record<string, unknown>) => connected.call(name, { ctx, ...args }) }
  }

  it("should find the three functions by their words and serve their contract as sensitive, in two steps (AC-h1)", async () => {
    const lea = await session("lea")
    for (const [query, name] of [
      ["delete rows", "table.delete_rows"],
      ["trash", "node.trash"],
      ["discard draft", "node.discard_draft"],
    ]) {
      const found = await lea.tool("find", { query, type: "function" })
      expect(found.text, query).toContain(name)
    }
    for (const [name, connector] of [
      ["node.discard_draft", "node"],
      ["node.trash", "node"],
      ["table.delete_rows", "table"],
    ]) {
      const contract = await lea.tool("read", { path: name })
      expect(contract.text.split("\n")[0]).toBe(`Function ${name} (connector ${connector}, origin paquet, class sensitive: two-step confirmation)`)
      expect(contract.result.structuredContent).toMatchObject({ text: contract.text, function: name, class: "sensitive" })
    }
  })

  it("should answer a summary then the deletion, the same text in both channels, the journal line of the execution carrying _outcome (AC-h2, HN-E11S02-16)", async () => {
    await freshTable(seed, ref)
    const lea = await session("lea")
    const args = { function: "table.delete_rows", arguments: { table: PROSPECTS.path, keys: ["Clinique des Saules", "Pharmacie du Port"] } }
    const recap = await lea.tool("call", args)
    expect(recap.isError).toBe(false)
    expect(recap.text.split("\n")[0]).toBe(`About to delete 2 rows of ${PROSPECTS.path} for good:`)
    expect(recap.text.endsWith("Nothing was sent. Show this to the user and ask for explicit approval, then call again with confirm: true.")).toBe(true)
    expect(recap.result.structuredContent).toMatchObject({ text: recap.text, status: "needs_confirmation", next_actions: [] })

    const done = await lea.tool("call", { ...args, confirm: true })
    expect(done.text.split("\n")).toEqual([`Deleted 2 rows of ${PROSPECTS.path}: Clinique des Saules, Pharmacie du Port.`, "1 of these rows was waiting for review."])
    expect(done.result.structuredContent).toMatchObject({ text: done.text, result: { deleted: ["Clinique des Saules", "Pharmacie du Port"], review: ["Clinique des Saules"] } })
    // La suite proposée : une lecture, jamais une fonction sensible (H87).
    expect(done.result.structuredContent).toMatchObject({ next_actions: ["table.rows"] })

    const calls = lea.journal.filter((entry) => entry.tool === "acme_call")
    expect(calls.map((entry) => [entry.target, entry.is_error === true])).toEqual([
      ["table.delete_rows", false],
      ["table.delete_rows", false],
    ])
    expect(calls[0].args).not.toHaveProperty("_outcome")
    expect(calls[1].args).toMatchObject({ confirm: true, _outcome: { deleted: 2, review: 1 } })
  })

  it("should publish a write of an assistant by default, and keep a draft with publish: false (AC-b1)", async () => {
    const claire = await session("claire")
    const created = await claire.tool("write", { path: "ventes/faq_mcp_s02", title: "FAQ", summary: "Questions fréquentes.", ops: [{ op: "add_section", section: "Livraison", text: "Sous huit jours." }] })
    // E11-S18 (AC-4) : une ligne, la publication et ce que l'écriture a fait.
    expect(created.text).toBe("Published ventes/faq_mcp_s02 revision 1 (1 section, 2 blocks): added « Livraison » (30 characters). Next write: base_revision 1.")
    const drafted = await claire.tool("write", { path: "ventes/faq_mcp_s02", base_revision: 1, ops: [{ op: "append", section: "Livraison", text: "Hors week-end." }], publish: false })
    expect(drafted.text.split("\n")[1]).toBe('Publish it with acme_write {"path": "ventes/faq_mcp_s02", "base_revision": 1, "publish": true}.')
    expect(drafted.result.structuredContent).toMatchObject({ status: "published", revision: 1, has_draft: true })
  })
})
