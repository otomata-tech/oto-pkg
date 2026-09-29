// @vitest-environment node
// Sessions de test sans Supabase Auth (E11-S14, AC-a1, AC-a2) : le jeton de `createLocalFixtures`, son
// `extra` vérifié, les refus d'une autre clé et d'un jeton expiré ; une route de `handlePlateforme` servie
// sous ce vérificateur, l'identité traduite par la base (`identity_for_caller`), puis aucune ligne
// `identities` ni `members` des personnes après `cleanup`. Sur un Postgres nu comme sur le projet.
import { decodeJwt } from "jose"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { handlePlateforme } from "@otomata_tech/oto_platform/api"
import { hex } from "../helpers/plateforme"
import { testIssuer } from "../helpers/oidc-issuer"
import { createLocalFixtures, type LocalFixtures } from "../helpers/session-locale"
import { portable, sqlConfigured, testAdminSql, type TestSql } from "../helpers/sql"

const request = new Request("https://local.example.invalid/api/mcp")

describe.skipIf(!sqlConfigured)(portable("local sessions (E11-S14)"), () => {
  let fx: LocalFixtures
  let admin: TestSql

  beforeAll(() => {
    fx = createLocalFixtures()
    admin = testAdminSql()
  })

  afterAll(async () => {
    try {
      await fx?.cleanup()
    } finally {
      await admin?.end({ timeout: 5 })
    }
  })

  it("should sign a one-hour token of the supabase form, verified by its own key only, and refused once expired (AC-a1)", async () => {
    const person = await fx.createUser({ fullName: "Ada Locale" })

    const { accessToken } = await fx.sessionFor(person)

    const claims = decodeJwt(accessToken)
    expect({ sub: claims.sub, email: claims.email, user_metadata: claims.user_metadata, ttl: Number(claims.exp) - Number(claims.iat) }).toEqual({
      sub: person.id,
      email: person.email,
      user_metadata: { full_name: "Ada Locale" },
      ttl: 3600,
    })
    const verified = await fx.verifyToken(request, accessToken)
    expect(verified?.extra).toEqual({ sub: person.id, email: person.email, name: "Ada Locale", iss: claims.iss, issuer_kind: "supabase" })

    // Même adresse d'émetteur, autre clé.
    const other = await testIssuer({ issuer: String(claims.iss) })
    expect(await fx.verifyToken(request, await other.sign({ sub: person.id, email: person.email }))).toBeUndefined()

    vi.useFakeTimers({ toFake: ["Date"] })
    try {
      vi.setSystemTime(Date.now() + 2 * 3600_000)
      expect(await fx.verifyToken(request, accessToken)).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it("should serve a route of handlePlateforme under the local verifier, 401 without it, and leave no identity nor member after cleanup (AC-a2)", async () => {
    const local = createLocalFixtures()
    const host = `t${hex(4)}.example.invalid`
    let personId = ""
    try {
      const org = await local.createOrg({ hosts: [host] })
      const person = await local.createUser()
      personId = person.id
      await local.addMember(org.id, person.id, { role: "admin" })
      const { accessToken } = await local.sessionFor(person)
      const invitations = () => new Request(`https://${host}/api/plateforme/invitations`, { headers: { "x-forwarded-proto": "https" } })

      const served = await handlePlateforme(invitations(), { accessToken, host, verifyToken: local.verifyToken })

      expect([served.status, await served.json()]).toEqual([200, { data: { invitations: [] } }])
      expect(await admin`select user_id from platform.identities where user_id = ${person.id}`).toEqual([{ user_id: person.id }])
      // Sans vérificateur injecté, celui de la configuration de l'hôte refuse ce jeton (ou n'a pas d'émetteur, au log).
      const errors = vi.spyOn(console, "error").mockImplementation(() => {})
      try {
        expect((await handlePlateforme(invitations(), { accessToken, host })).status).toBe(401)
      } finally {
        errors.mockRestore()
      }
    } finally {
      await local.cleanup()
    }

    const [left] = await admin`select
        (select count(*)::int from platform.identities where user_id = ${personId}) as identities,
        (select count(*)::int from platform.members where user_id = ${personId}) as members`
    expect(left).toEqual({ identities: 0, members: 0 })
  })
})
