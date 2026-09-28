// @vitest-environment node
// Test de fumée de `pnpm oauth:clients` (E02-S04, AC14, AC15) sur le projet Supabase d'oto-platform :
// un client public jetable, enregistré comme le font les hosts (enregistrement dynamique), paraît dans
// `list` sans session ; une purge à blanc ne supprime rien ; retenu par la purge deux jours plus tard,
// il est supprimé par l'API d'administration et quitte la liste. Le test ne supprime que ce client :
// le script, lancé ici, ne reçoit jamais `--yes`. Le client est retiré en `afterAll`, même en échec.
import { execFile } from "child_process"
import path from "path"
import { promisify } from "util"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { serviceKeyClient } from "../../scripts/lib/env.mjs"
import { deleteClients, MISSING_FUNCTION, purgeCandidates, readClients } from "../../scripts/lib/oauth-clients.mjs"
import { hex, SKIP_REASON, supabaseConfigured } from "../helpers/plateforme"
import { SQL_SKIP_REASON, sqlConfigured, testAdminSql, type TestSql } from "../helpers/sql"

// Réseau, et deux lancements du script (node puis supabase-js) : au-delà des 20 s par défaut.
const NETWORK_TIMEOUT = 90_000
const DAY = 24 * 60 * 60 * 1000
const REDIRECT = "http://127.0.0.1:9/callback"
const script = path.resolve(__dirname, "../../scripts/oauth-clients.mjs")
const run = promisify(execFile)

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""

type Outcome = { code: number; stdout: string; stderr: string }

/** Lance le script ; ne lève pas : son code de sortie et ses deux sorties. */
async function cli(args: string[]): Promise<Outcome> {
  try {
    const { stdout, stderr } = await run(process.execPath, [script, ...args], { env: process.env, timeout: NETWORK_TIMEOUT / 3 })
    return { code: 0, stdout, stderr }
  } catch (error) {
    // execFile rejette sur un code non nul ; l'erreur porte le code et les deux sorties du processus.
    const { code, stdout, stderr } = error as { code: number | null; stdout: string; stderr: string }
    return { code: code ?? -1, stdout, stderr }
  }
}

/** L'adresse d'enregistrement publiée par le serveur OAuth du projet, ou `null` sans enregistrement dynamique. */
async function registrationEndpoint(): Promise<string | null> {
  const response = await fetch(`${url}/auth/v1/.well-known/oauth-authorization-server`)
  if (!response.ok) return null
  // `fetch` rend un JSON sans type : les métadonnées du serveur OAuth (RFC 8414), dont seule l'adresse
  // d'enregistrement est lue.
  const metadata = (await response.json()) as { registration_endpoint?: string }
  return metadata.registration_endpoint ?? null
}

// L'activité se lit par la connexion d'administration (E01-S10, AC-f4) : celle des tests, par
// `PLATFORM_ADMIN_DATABASE_URL` comme le script ; la suppression, par l'API d'administration d'Auth.
const configured = supabaseConfigured && sqlConfigured

describe.skipIf(!configured)(
  configured
    ? "pnpm oauth:clients on the project (smoke)"
    : `pnpm oauth:clients on the project (${supabaseConfigured ? SQL_SKIP_REASON : SKIP_REASON})`,
  { timeout: NETWORK_TIMEOUT },
  () => {
    // Construits dans `beforeAll` : le corps d'une suite sautée se lit quand même, et sans Supabase
    // (job `bare-postgres`, E01-S10 AC-a7) le client refuserait une URL vide.
    let admin: ReturnType<typeof serviceKeyClient>
    let sql: TestSql
    const name = `test-${hex(4)}`
    let clientId: string | null = null
    let skipReason: string | null = null

    beforeAll(async () => {
      admin = serviceKeyClient({ NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY ?? "" })
      sql = testAdminSql()
      try {
        await readClients(sql)
      } catch (error) {
        if (!(error instanceof Error) || error.message !== MISSING_FUNCTION) throw error
        skipReason = "platform.oauth_clients_activity is missing from the project (E01-S06 migration)"
        return
      }
      const endpoint = await registrationEndpoint()
      if (!endpoint) {
        skipReason = "dynamic client registration is not published by the project's OAuth server (E02-S02, JB action)"
        return
      }
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ client_name: name, redirect_uris: [REDIRECT], token_endpoint_auth_method: "none" }),
      })
      if (!response.ok) throw new Error(`dynamic registration refused: HTTP ${response.status}`)
      // `fetch` rend un JSON sans type : la réponse d'enregistrement (RFC 7591), dont seul l'identifiant
      // du client est lu.
      clientId = ((await response.json()) as { client_id: string }).client_id
    }, NETWORK_TIMEOUT)

    afterAll(async () => {
      try {
        if (clientId) await admin.auth.admin.oauth.deleteClient(clientId)
      } finally {
        await sql.end()
      }
    }, NETWORK_TIMEOUT)

    it("should list the client, leave it on a dry run, then delete it by the admin API (AC14, AC15)", async (ctx) => {
      if (skipReason || !clientId) return ctx.skip(skipReason ?? "no client registered")
      const id = clientId
      const ligne = (stdout: string) => stdout.split("\n").find((line) => line.startsWith(id.slice(0, 8)))

      const listed = await cli(["list"])
      expect(listed.code).toBe(0)
      expect(ligne(listed.stdout)?.split(/\s{2,}/)).toEqual([id.slice(0, 8), name, "public", "dynamique", expect.any(String), "0", "jamais"])

      // Créé à l'instant, il n'est candidat d'aucune purge à 30 jours ; les autres clients du projet
      // peuvent l'être, et la purge à blanc les montre sans rien supprimer.
      const dry = await cli(["purge", "--older-than", "30"])
      expect(ligne(dry.stdout)).toBeUndefined()
      if (dry.code === 0) expect(dry.stdout).toBe("Aucun client à supprimer.\n")
      else expect(dry).toMatchObject({ code: 1, stdout: expect.stringMatching(/\d+ client\(s\) seraient supprimés\. Relancez avec --yes pour les supprimer\.\n$/) })

      const rows = await readClients(sql)
      const period = { olderThanDays: 1, now: Date.now() + 2 * DAY }
      const candidates = purgeCandidates(rows, period).filter((row) => row.client_id === id)
      expect(candidates).toHaveLength(1)

      expect(await deleteClients(admin, candidates, period)).toEqual({ deleted: [id], failed: [] })
      clientId = null
      expect((await readClients(sql)).map((row) => row.client_id)).not.toContain(id)
    })
  },
)
