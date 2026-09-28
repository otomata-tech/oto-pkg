// @vitest-environment node
// La fiche que la personne écrit (E05-S04, AC13 ; H31, P39, HN-E05S04-12) sur une vraie base (E01-S10, lot
// t1-e1) : `updateProfile` et `update_my_profile` (E01-S06 AC33) sur la ligne `members` de Léa dans O
// (`seedReferenceOrg`), relue par la connexion d'administration ; puis `PATCH /api/plateforme/profile` par
// la porte entière (`handlePlateforme`), identité résolue par l'adresse de O, ligne de journal relue. Les
// bornes de la fonction sont prouvées sur le projet par `tests/integration/profil.test.ts` ; le schéma du
// service ayant les mêmes, le refus `22023` de la base est rendu par l'espion (`spyDb`, option `fail`).
// En suite portable (`sqlConfigured`) : le projet, ou le Postgres nu du job `bare-postgres`.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { handlePlateforme } from "@otomata_tech/oto_platform/api"
import { isPlatformError, readProfile, updateProfile, type Identity, type PlatformDb } from "@otomata_tech/oto_platform/server"
import { pendingMigrations, pendingReason } from "../helpers/pending-migrations"
import { ORG, PEOPLE } from "../helpers/reference-org"
import { seedReferenceOrg, type ReferenceOrgSql } from "../helpers/reference-org-sql"
import { seedWithAdmin, spyDb, sqlConfigured, type SeededData, type SentQuery, type TestSql, portable } from "../helpers/sql"

const NETWORK_TIMEOUT = 60_000
const SETUP_TIMEOUT = 180_000

const SUITE = "profile of the person on a real database"

// Le client que la porte reçoit, posé par le test ; `null` au départ serait inféré seul, d'où le type
// donné. Sans lui, celui du paquet : la fixture bâtit par lui la session de Léa.
const base = vi.hoisted(() => ({ db: null as PlatformDb | null }))

vi.mock("../../packages/plateforme/server/db", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../packages/plateforme/server/db")>()
  return {
    ...original,
    createPlatformDb: vi.fn((session: Parameters<typeof original.createPlatformDb>[0]) => base.db ?? original.createPlatformDb(session)),
  }
})

type Profile = Parameters<TestSql["json"]>[0]

const profileCalls = (sent: readonly SentQuery[]) => sent.filter((query) => query.target === "update_my_profile")

describe.skipIf(!sqlConfigured)(portable(SUITE), { timeout: NETWORK_TIMEOUT }, () => {
  let seed: SeededData
  let ref: ReferenceOrgSql
  let lea: PlatformDb
  /** La fiche de Léa dans O telle que la graine la pose : chaque test en repart. */
  let seeded: Profile

  /** La fiche de Léa dans O, relue par la connexion d'administration. */
  const profile = async (): Promise<Profile> =>
    (await seed.admin<{ profile: Profile }[]>`select profile from platform.members where org_id = ${ref.org.id} and user_id = ${ref.people.lea.id}`)[0]
      .profile

  function patch(body: unknown) {
    return new Request(`https://${ref.org.host}/api/plateforme/profile`, {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "x-forwarded-proto": "https", origin: `https://${ref.org.host}`, "content-type": "application/json" },
    })
  }

  async function call(request: Request, signedIn: boolean) {
    const tasks: (() => Promise<void>)[] = []
    // La porte vérifie le jeton par le vérificateur injecté (M10) : Léa, ou aucun appelant.
    const verifyToken = async () =>
      signedIn ? { token: "token", clientId: "", scopes: [], extra: { sub: ref.people.lea.id, email: ref.people.lea.email } } : undefined
    const response = await handlePlateforme(request, { accessToken: signedIn ? "token" : null, host: ref.org.host, defer: (task) => tasks.push(task), verifyToken })
    for (const task of tasks) await task()
    return { status: response.status, body: await response.json() }
  }

  beforeAll(async () => {
    seed = seedWithAdmin()
    ref = await seedReferenceOrg(seed)
    lea = await ref.db("lea")
    seeded = await profile()
  }, SETUP_TIMEOUT)

  afterAll(async () => {
    await seed?.cleanup()
  }, SETUP_TIMEOUT)

  beforeEach(async () => {
    // Chaque test part de la fiche semée et d'un journal de O vide.
    await seed.admin`update platform.members set profile = ${seed.admin.json(seeded)} where org_id = ${ref.org.id} and user_id = ${ref.people.lea.id}`
    await seed.admin`delete from platform.journal where org_id = ${ref.org.id}`
  })

  afterEach(() => {
    base.db = null
    vi.restoreAllMocks()
  })

  describe("updateProfile (AC13)", () => {
    it("should pass the patch to update_my_profile for the organisation, render the name and the language, and say 22023 as invalid_arguments", async () => {
      const { db, sent } = spyDb(lea)
      const done = await updateProfile(db, ref.identityOf("lea"), { language: "en" })
      expect(profileCalls(sent)).toHaveLength(1)
      // La fiche de Léa dans O : la langue posée, son nom gardé.
      expect(await profile()).toMatchObject({ name: PEOPLE.lea.name, language: "en" })
      // Le `handle` reste en base, jamais rendu : la fiche n'en montre que le nom et la langue.
      expect(ref.readable(done)).toEqual({ data: { name: PEOPLE.lea.name, language: "en" }, target: PEOPLE.lea.email, teamId: null })

      // La traduction journalise l'erreur de la base (`fromDatabaseError`) : le test la tait.
      vi.spyOn(console, "error").mockImplementation(() => {})
      const refused = spyDb(lea, { fail: (query) => (query.target === "update_my_profile" ? { code: "22023" } : null) })
      await expect(updateProfile(refused.db, ref.identityOf("lea"), { name: "Léa" })).rejects.toMatchObject({ code: "invalid_arguments" })
    })

    // Une moitié de paire de substitution ferait refuser tout le corps par PostgREST (`supabase-patterns.md
    // § Error Handling`) : l'écriture passe, la moitié devenue U+FFFD.
    it("should send a name that holds a lone surrogate half well formed", async () => {
      const { db, sent } = spyDb(lea)
      await updateProfile(db, ref.identityOf("lea"), { name: "L\ud800a" })
      expect(profileCalls(sent)).toHaveLength(1)
      expect(await profile()).toMatchObject({ name: "L�a" })
    })

    // E05-S11 (AC-3, AC-5) : la page « Profil » envoie prénom et nom ensemble ; la fiche rendue les montre avec le
    // nom recomposé et la couleur. Migration `20260928110000` : sautée sur le projet tant qu'elle n'y est pas.
    it("should render the first name, the last name, the composed name and the theme written", async (ctx) => {
      const pending = (await pendingMigrations()).filter((version) => version >= "20260928110000")
      ctx.skip(pending.length > 0, pendingReason(pending))
      const done = await updateProfile(lea, ref.identityOf("lea"), { first_name: "Léa", last_name: "Roux", theme: "lagune" })
      expect(ref.readable(done.data)).toEqual({ name: "Léa Roux", first_name: "Léa", last_name: "Roux", theme: "lagune" })
      expect(await profile()).toMatchObject({ name: "Léa Roux", first_name: "Léa", last_name: "Roux", theme: "lagune" })
    })

    // `security-patterns.md § Droits dans le service` : l'équipe plateforme entrée par un accès en cours n'a
    // ni fiche ni Contexte Perso dans l'organisation ; le refus précède la requête (HN-E05S04-12).
    it("should refuse a caller without a members row before any request", async () => {
      const { db, sent } = spyDb(await ref.db("s"))
      const refusal = await updateProfile(db, ref.identityOf("s"), { name: "Sam" }).catch((error: unknown) => error)
      expect(isPlatformError(refusal) && [refusal.code, refusal.message]).toEqual(["forbidden", "Only members of Acme Test have a profile here."])
      expect(sent).toEqual([])
    })
  })

  describe("PATCH /api/plateforme/profile (AC13)", () => {
    it("should answer 401 without a session and 400 to a field the person does not write, writing nothing", async () => {
      const { db, sent } = spyDb(lea)
      base.db = db
      expect((await call(patch({ name: "Léa" }), false)).status).toBe(401)
      expect(await call(patch({ handle: "lea2" }), true)).toMatchObject({ status: 400, body: { error: { code: "invalid_arguments" } } })
      expect(profileCalls(sent)).toEqual([])
      expect(await profile()).toEqual(seeded)
    })

    it("should answer 200 with the profile, and journal PATCH profile on the person's email", async () => {
      base.db = lea
      const { status, body } = await call(patch({ name: "  Léa R.  ", language: "fr" }), true)
      expect(status).toBe(200)
      expect(body).toEqual({ data: { name: "Léa R.", language: "fr" } })
      const journal = await seed.admin`select org_id, user_id, method, tool, target, is_error, error from platform.journal where org_id = ${ref.org.id}`
      expect(ref.readable([...journal])).toMatchObject([
        { org_id: ORG.id, user_id: PEOPLE.lea.id, method: "api", tool: "PATCH profile", target: PEOPLE.lea.email, is_error: false, error: null },
      ])
    })
  })
})

// E05-S11 (AC-3, AC-4, AC-36) : ce que la page « Profil » lit, tiré de l'identité, sans base.
describe("readProfile (E05-S11, AC-3)", () => {
  const identity = (fields: Partial<Identity> = {}): Identity => ({
    org: { id: "org-1", slug: "acme", name: "Acme Énergies", prefix: "acme", brand: { theme: "cobalt", language: "en" }, domains: null },
    user: { id: "user-1", email: "lea@acme.test", name: "Léa Roux" },
    member: {
      role: "member",
      profile: { name: "Léa Roux", first_name: "Léa", last_name: "Roux", handle: "lea", language: "de", theme: "foret" },
    },
    teams: [],
    isStaff: false,
    viaGrant: false,
    hasOpenGrant: false,
    ...fields,
  })

  it("should give the profile without the handle nor a language outside fr and en, and the organisation language and theme", async () => {
    expect(await readProfile(identity())).toEqual({
      profile: { name: "Léa Roux", first_name: "Léa", last_name: "Roux", theme: "foret" },
      organisation: { language: "en", theme: "cobalt" },
    })
  })

  it("should give French and manuscrit for an organisation that has chosen neither", async () => {
    const bare = identity()
    const sheet = await readProfile({ ...bare, org: { ...bare.org, brand: {} } })
    expect(sheet.organisation).toEqual({ language: "fr", theme: "manuscrit" })
  })

  // `security-patterns.md § Droits dans le service` : l'équipe plateforme entrée sans ligne `members` n'a pas de fiche ici.
  it("should refuse a caller entered by a platform access", async () => {
    const refusal = await readProfile(identity({ viaGrant: true })).catch((error: unknown) => error)
    expect(isPlatformError(refusal) && [refusal.code, refusal.message]).toEqual(["forbidden", "Only members of Acme Énergies have a profile here."])
  })
})
