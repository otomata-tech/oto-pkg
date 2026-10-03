// @vitest-environment node
import { readFileSync } from "fs"
import path from "path"
import { describe, expect, it } from "vitest"
import { createAnonPlatformDb, createPlatformDb } from "@otomata_tech/oto_platform/server"

// E01-S10 f2 : le client du paquet n'a plus qu'une face, `db.tx` (AC-f2), et `platform` n'est plus exposé
// par le Data API de Supabase (AC-f1). Le refus de `db.tx` sans appelant ni `PLATFORM_DATABASE_URL` est
// prouvé par `tests/unit/sql-session.test.ts` (AC-a6).

const CALLER = { userId: "5f0c1d7e-0000-4000-8000-000000000001", email: "claire@acme.test" }

describe("createPlatformDb and createAnonPlatformDb (E01-S10 f2, AC-f2)", () => {
  it("should build, for a caller and without session, a client whose only data face is tx, with no Supabase variable", () => {
    // Aucune variable de Supabase dans ce fichier : la face PostgREST exigeait l'URL et la clé publique.
    // `retranslate` n'ouvre aucune lecture : il fait relire l'identité de l'appelant après une entrée sans invitation.
    expect(Object.keys(createPlatformDb({ caller: CALLER }))).toEqual(["tx", "retranslate"])
    expect(Object.keys(createAnonPlatformDb())).toEqual(["tx"])
  })
})

describe("supabase/config.toml (E01-S10 f2, AC-f1)", () => {
  it("should not expose the platform schema through the Data API", () => {
    const config = readFileSync(path.resolve(__dirname, "../../supabase/config.toml"), "utf8")
    // `[api]` jusqu'à la section suivante, puis sa ligne `schemas = [...]`.
    const api = /^\[api\]\s*$([\s\S]*?)^\[/m.exec(config)?.[1] ?? ""
    const schemas = /^schemas\s*=\s*\[([^\]]*)\]/m.exec(api)?.[1]
    expect(schemas).toBeDefined()
    expect(schemas?.split(",").map((schema) => schema.trim().replace(/^"|"$/g, ""))).not.toContain("platform")
  })
})
