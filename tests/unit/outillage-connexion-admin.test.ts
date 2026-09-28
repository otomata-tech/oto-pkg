// @vitest-environment node
import fs from "fs"
import path from "path"
import { describe, expect, it } from "vitest"

// AC-f4 (E01-S10) : les commandes d'outillage atteignent `platform` par la connexion d'administration
// (`PLATFORM_ADMIN_DATABASE_URL`), jamais par la clé secrète sur le Data API. Leurs tests de fumée
// prouvent qu'elles y arrivent ; celui-ci, qu'aucune ne passe plus par PostgREST (`.from(…)`,
// `.rpc(…)` d'un client supabase-js), ce qu'aucun échec ne montrerait tant que `platform` reste servi
// par le Data API (jusqu'à E01-S10 f2). Les deux lots de f1 : le script Démo avec chaque fichier de
// `scripts/demo/` (une section ajoutée y entre d'elle-même), puis les outils.

const root = path.resolve(__dirname, "../..")
const DEMO_FILES = fs.readdirSync(path.join(root, "scripts/demo")).map((name) => `scripts/demo/${name}`)
const TOOLING = [
  "scripts/demo-seed.mjs",
  ...DEMO_FILES,
  "scripts/platform-staff.mjs",
  "scripts/test-cleanup.mjs",
  "scripts/org-export.mjs",
  "scripts/org-import.mjs",
  "scripts/oauth-clients.mjs",
  "scripts/lib/env.mjs",
  "scripts/lib/oauth-clients.mjs",
  "scripts/lib/org-transfer-args.mjs",
  "scripts/lib/org-transfer.mjs",
  "scripts/lib/org-transfer-plan.mjs",
]

/** Un appel au Data API de supabase-js ; `Array.from(` et `Buffer.from(` n'en sont pas. */
const DATA_API_CALL = /(?<!\b(?:Array|Buffer))\.(?:from|rpc)\(/

/** Une entrée `fichier:ligne` par ligne qui appelle le Data API. */
function dataApiCalls(file: string, text: string): string[] {
  return text.split(/\r?\n/).flatMap((line, index) => (DATA_API_CALL.test(line) ? [`${file}:${index + 1}`] : []))
}

describe("tooling reaches platform through the admin connection (AC-f4)", () => {
  it("should find no Data API call in the tooling scripts", () => {
    const calls = TOOLING.flatMap((file) => dataApiCalls(file, fs.readFileSync(path.join(root, file), "utf8")))
    expect(calls).toEqual([])
  })

  it("should flag a table read, a function call and a schema switch, and let Array.from, Buffer.from and Object.fromEntries pass", () => {
    const text = [
      "await admin.from('orgs').select('id')",
      "await admin.rpc('forget_user', { p_user: id })",
      "await client.schema('platform').from('nodes')",
      "const codes = Array.from({ length: 4 }, pick)",
      "const bytes = Buffer.from(text, 'utf8')",
      "const map = Object.fromEntries(pairs)",
    ].join("\n")
    expect(dataApiCalls("scripts/fixture.mjs", text)).toEqual(["scripts/fixture.mjs:1", "scripts/fixture.mjs:2", "scripts/fixture.mjs:3"])
  })
})
