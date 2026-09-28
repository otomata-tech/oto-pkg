// @vitest-environment node
// Face SQL du port de base, sans base (E01-S10 partie a) : une erreur de Postgres venue du pilote se
// traduit comme la même erreur venue de PostgREST (AC-a5) ; sans `PLATFORM_DATABASE_URL` ou sans
// appelant, `db.tx` refuse en nommant ce qui manque, jamais une valeur (AC-a6), même quand le service
// passe ce refus à `fromDatabaseError`. Aucune connexion ne s'ouvre ici : chaque refus précède le pool.
import { randomBytes } from "crypto"
import postgres from "postgres"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createPlatformDb, fromDatabaseError, HTTP_STATUS, PlatformConfigError, PlatformError } from "@otomata_tech/oto_platform/server"
// Hors de la face `./server` : la panne qu'un service dit par son propre message.
import { databaseFailure } from "../../packages/plateforme/server/errors"

const CALLER = { userId: "5f0c1d7e-0000-4000-8000-000000000001", email: "claire@acme.test" }

// Le constructeur de `PostgresError` reçoit les champs du message d'erreur de Postgres (postgres.js
// 3.4.9, `src/errors.js`) ; son type ne déclare que celui d'`Error`.
const DriverError = postgres.PostgresError as unknown as new (fields: Record<string, string>) => postgres.PostgresError

/** SQLSTATE, code H04 et statut HTTP : ce que PostgREST rendait pour chacun, la face SQL le rend aussi. */
const CORRESPONDENCE = [
  ["23505", "conflict", 409],
  ["23503", "invalid_arguments", 400],
  ["23514", "invalid_arguments", 400],
  ["42501", "forbidden", 403],
  ["PT409", "stale_revision", 409],
  ["40001", "internal", 500],
  ["40P01", "internal", 500],
] as const

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("fromDatabaseError on the SQL face (AC-a5)", () => {
  it.each(CORRESPONDENCE)("should translate a Postgres error %s of the driver as the same error of PostgREST: %s, %i", (sqlstate, code, status) => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const message = 'duplicate key value violates unique constraint "orgs_slug_key" on table "orgs"'
    const restError = { code: sqlstate, message, details: "Key (slug)=(acme) already exists.", hint: "" }
    const fromDriver = fromDatabaseError(new DriverError({ severity: "ERROR", code: sqlstate, message }), "test: driver")
    const fromRest = fromDatabaseError(restError, "test: PostgREST")

    expect([fromDriver.code, HTTP_STATUS[fromDriver.code], fromDriver.message]).toEqual([fromRest.code, HTTP_STATUS[fromRest.code], fromRest.message])
    expect([fromDriver.code, HTTP_STATUS[fromDriver.code]]).toEqual([code, status])
    expect(fromDriver.message).not.toContain("orgs")
  })
})

describe("db.tx configuration (AC-a6)", () => {
  it("should refuse db.tx naming PLATFORM_DATABASE_URL, absent or unreadable, never its value", async () => {
    // Une valeur illisible qui porterait un secret : construite à l'exécution, jamais écrite.
    const secret = randomBytes(8).toString("hex")

    for (const value of [undefined, `not a url ${secret}`]) {
      vi.stubEnv("PLATFORM_DATABASE_URL", value)
      const db = createPlatformDb({ caller: CALLER })
      const refusal = await db.tx(async () => "ran").catch((error: unknown) => error)

      expect(refusal).toBeInstanceOf(PlatformConfigError)
      expect(String(refusal)).toMatch(/PLATFORM_DATABASE_URL/)
      expect(String(refusal)).not.toContain(secret)
    }
  })

  it("should refuse db.tx of a client built without the caller of the session", async () => {
    const refusal = await createPlatformDb({ caller: undefined }).tx(async () => "ran").catch((error: unknown) => error)

    expect(refusal).toBeInstanceOf(PlatformConfigError)
    expect(String(refusal)).toMatch(/caller/)
  })

  it("should let through fromDatabaseError and databaseFailure what does not come from the database: the configuration error of db.tx, a refusal already decided", async () => {
    vi.stubEnv("PLATFORM_DATABASE_URL", undefined)
    const db = createPlatformDb({ caller: CALLER })
    // Un service converti traduit ce que rejette `db.tx` : l'hôte doit encore lire le nom de la variable.
    const translated = db.tx(async () => "ran").catch((error) => {
      throw fromDatabaseError(error, "test: service")
    })
    const failed = db.tx(async () => "ran").catch((error) => {
      throw databaseFailure(error, "test: service", "The change could not be saved.")
    })
    await expect(translated).rejects.toThrow(PlatformConfigError)
    await expect(failed).rejects.toThrow(/PLATFORM_DATABASE_URL/)

    // Un conflit décidé dans la transaction reste ce conflit, jamais `internal`.
    const conflict = new PlatformError("conflict", "The node changed meanwhile.")
    expect(fromDatabaseError(conflict, "test: service")).toBe(conflict)
    expect(databaseFailure(conflict, "test: service", "Could not save.")).toBe(conflict)
  })
})
