// @vitest-environment node
// Procédures rangées dans l'espace « Privé » d'une personne (tâche M55, fiche D99 ; défaut P5 de la campagne
// Démo du 2026-09-27) sur une vraie base, la décision de lecture étant le sujet : sous son Contexte ou ailleurs
// dans `private/<handle>`, publiées, elles sont candidates de `context` et servies par les prompts MCP pour leur
// seule propriétaire, jamais pour une autre personne de l'organisation, administrateur compris (D5, H61 :
// dans un espace personnel, seules comptent les règles posées sous le nœud de la personne). Services lus
// comme les sert la porte MCP (`buildContext` pour `context`, `listPrompts` et `getPrompt` pour `prompts/list`
// et `prompts/get`). Portable : l'organisation O d'E01-S04 par `buildReferenceOrg`, chaque personne par `fx.as`.
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import type { BlockInput } from "../../packages/plateforme/schemas"
import { isRecord } from "../../packages/plateforme/schemas/tables"
import { buildContext } from "../../packages/plateforme/server/context"
import { resolveIdentity, type Identity } from "../../packages/plateforme/server/identity"
import { getPrompt, listPrompts } from "../../packages/plateforme/server/prompts"
import { createSqlFixtures, SQL_SKIP_REASON, sqlConfigured, type SqlFixtures, type SqlReferenceOrg } from "../helpers/sql"
import { privateFolderPending, privateFolderSuite } from "../helpers/pending-migrations"

// Ces tests supposent le dossier `private` en base (fiche D107) : sautés, la version nommée, tant que
// 20260928120000 n'est pas appliquée au projet (`database-patterns.md § Règles`).
const privatePending = await privateFolderPending()

const SETUP_TIMEOUT = 240_000
const NETWORK_TIMEOUT = 60_000
const SUITE = "procedures of a personal space, served to their owner only (M55)"

const STEPS: BlockInput[] = [
  { type: "heading", text: "Étapes", data: { level: 1 } },
  { type: "list", data: { items: ["Relis mes notes et range-les par prospect."], ordered: true } },
]

/** Deux procédures de Léa : sous son Contexte, et dans un dossier de son espace. */
const PRIVEES = [
  {
    path: "private/lea/contexte/classer_notes_salon",
    title: "Classer mes notes de salon",
    summary: "Range mes notes de salon par prospect. Se demande : « classe mes notes de salon ».",
    phrase: "classe mes notes de salon",
  },
  {
    path: "private/lea/outils/relances_perso",
    title: "Préparer mes relances personnelles",
    summary: "Prépare mes relances personnelles de la semaine. Se demande : « prépare mes relances personnelles ».",
    phrase: "prépare mes relances personnelles",
  },
] as const

type Who = "lea" | "claire" | "ada" | "marc"

describe.skipIf(!sqlConfigured || privatePending)(privateFolderSuite(sqlConfigured ? SUITE : `${SUITE} (${SQL_SKIP_REASON})`, privatePending), { timeout: NETWORK_TIMEOUT }, () => {
  let fx: SqlFixtures
  let o: SqlReferenceOrg

  beforeAll(async () => {
    fx = createSqlFixtures()
    o = await fx.buildReferenceOrg()
    const orgId = o.org.id
    const contexte = await fx.nodeId(orgId, "private/lea/contexte")
    const outils = await fx.createNode(orgId, { parentId: o.spaces.lea, path: "private/lea/outils", title: "Outils" })
    for (const [procedure, parentId] of [
      [PRIVEES[0], contexte],
      [PRIVEES[1], outils],
    ] as const) {
      const id = await fx.createNode(orgId, { parentId, path: procedure.path, kind: "procedure", title: procedure.title, summary: procedure.summary })
      await fx.publishBlocks(id, STEPS, { title: procedure.title, summary: procedure.summary, kind: "procedure" })
    }
  }, SETUP_TIMEOUT)

  afterAll(async () => {
    await fx?.cleanup()
  }, SETUP_TIMEOUT)

  async function asPerson(who: Who): Promise<{ db: ReturnType<SqlFixtures["as"]>; identity: Identity }> {
    const person = o.people[who]
    const db = fx.as(person)
    return { db, identity: await resolveIdentity(db, o.host, { userId: person.id, email: person.email }) }
  }

  /** Ce que `context` sert à `who` pour chaque phrase : la procédure servie et les candidats, par chemin. */
  async function servedPaths(who: Who): Promise<string[]> {
    const { db, identity } = await asPerson(who)
    const paths: string[] = []
    for (const { phrase } of PRIVEES) {
      const { data } = await buildContext(db, identity, { phrase }, { userAgent: null })
      const candidates = Array.isArray(data?.candidates) ? data.candidates : []
      paths.push(...[data?.served, ...candidates].flatMap((entry) => (isRecord(entry) && typeof entry.path === "string" ? [entry.path] : [])))
    }
    return [...new Set(paths)].filter((path) => path.startsWith("private/")).sort()
  }

  it("should serve both procedures of her personal space to their owner, by context and by the MCP prompts", async () => {
    expect(await servedPaths("lea")).toEqual(PRIVEES.map((procedure) => procedure.path).sort())
    const { db, identity } = await asPerson("lea")
    const prompts = await listPrompts(db, identity)
    const mine = prompts.filter((prompt) => PRIVEES.some((procedure) => procedure.title === prompt.title))
    expect(mine.map((prompt) => [prompt.name, prompt.title]).sort()).toEqual([
      ["classer_notes_salon", "Classer mes notes de salon"],
      ["relances_perso", "Préparer mes relances personnelles"],
    ])
    for (const prompt of mine) expect(await getPrompt(db, identity, prompt.name)).toEqual({ description: prompt.description, text: prompt.title })
  })

  it.each<Who>(["claire", "ada", "marc"])("should never serve them to %s, not as candidates nor as prompts, and answer their names as unknown", async (who) => {
    expect(await servedPaths(who)).toEqual([])
    const { db, identity } = await asPerson(who)
    const titles = (await listPrompts(db, identity)).map((prompt) => prompt.title)
    expect(titles.filter((title) => PRIVEES.some((procedure) => procedure.title === title))).toEqual([])
    for (const name of ["classer_notes_salon", "relances_perso"]) {
      await expect(getPrompt(db, identity, name)).rejects.toMatchObject({ code: "not_found", message: `Unknown prompt ${name}.` })
    }
  })
})
