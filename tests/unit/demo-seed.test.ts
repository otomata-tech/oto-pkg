// @vitest-environment node
// `pnpm demo:seed` sans base : la garde de l'exécuteur (`security-patterns.md § Outillage à clé
// service`), la clé secrète éprouvée avant la première écriture, le refus d'un `--user` qui n'est pas
// un uuid, et l'arrêt sur une variable manquante
// sans en imprimer aucune. Le passage réel est le test de fumée de `tests/integration/demo-seed.test.ts`
// (M11 : un script d'outillage, un test de fumée).
import { execFileSync } from "child_process"
import { randomBytes } from "crypto"
import path from "path"
import { describe, expect, it, vi } from "vitest"
import { guardOrg, INVALID_USER, orgSpec, parseArgs, prepareOrg } from "../../scripts/demo-seed.mjs"

const script = path.resolve(__dirname, "../../scripts/demo-seed.mjs")

type OrgRow = { id: string; name: string; settings: Record<string, unknown> }
type Failure = { message: string } | null
type Outcomes = { read?: Failure; update?: Failure }

/**
 * Connexion simulée (E01-S10 f1 : la garde lit `platform` par la connexion d'administration) : la
 * lecture de l'organisation par son slug et la pose de la marque, seules requêtes de `guardOrg`. Une
 * écriture est relevée avec son texte, espaces réduits, et ses valeurs liées.
 */
function fakeSql(org: OrgRow | null, outcomes: Outcomes = {}) {
  const updates: { query: string; values: unknown[] }[] = []
  const tag = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = strings.join("?").replace(/\s+/g, " ").trim()
    if (query.startsWith("select")) {
      if (outcomes.read) throw new Error(outcomes.read.message)
      return org ? [org] : []
    }
    updates.push({ query, values })
    if (outcomes.update) throw new Error(outcomes.update.message)
    return []
  }
  // Seul l'appel en gabarit est simulé : le type de la connexion complète ne s'en infère pas.
  return { sql: tag as unknown as Parameters<typeof guardOrg>[0], updates }
}

describe("demo-seed guardOrg", () => {
  const demo = orgSpec("demo")
  const trial = orgSpec("t1a2b3c4d")
  const refusal = (slug: string, name: string) =>
    `Refusé : l'organisation ${slug} (« ${name} ») n'est pas une organisation de démonstration (sans marque settings.demo) ; rien n'est écrit ni supprimé.`

  it("should give the mark to the demo organization seeded before it, named Démo", async () => {
    const { sql, updates } = fakeSql({ id: "org-1", name: "Démo", settings: { domains: "sales" } })
    const print = vi.fn()
    await expect(guardOrg(sql, demo, print)).resolves.toBe("org-1")
    expect(updates).toEqual([
      { query: "update platform.orgs set settings = ? where id = ?", values: [{ domains: "sales", demo: true }, "org-1"] },
    ])
    expect(print.mock.calls).toEqual([["[garde]"], ["  organisation demo : marque de démonstration posée"]])
  })

  it.each([
    ["the demo slug not named Démo", demo, "Acme Énergies", { domains: "energy" }],
    ["a mark other than true", trial, "Démo t1a2b3c4d", { demo: "true" }],
  ])("should refuse an organization with %s, naming it, without writing", async (_case, spec, name, settings) => {
    const { sql, updates } = fakeSql({ id: "org-1", name, settings })
    await expect(guardOrg(sql, spec, vi.fn())).rejects.toThrow(refusal(spec.slug, name))
    expect(updates).toEqual([])
  })

  it("should stop on a failed read, naming the organization", async () => {
    const { sql } = fakeSql(null, { read: { message: "réseau coupé" } })
    await expect(guardOrg(sql, trial, vi.fn())).rejects.toThrow(
      "Lecture de l'organisation t1a2b3c4d impossible : réseau coupé",
    )
  })
})

describe("demo-seed prepareOrg", () => {
  // La Démo semée avant la marque : la garde la marquerait, puis `--reset` la supprimerait, avant que la
  // section `identite` ne bute sur la clé (E01-S10 f1 : la garde ne lit plus à la clé).
  // Le code rendu (`codeOf`) dit aussi « réseau » et les 5xx : le message nomme l'API injoignable (M23).
  it("should stop on a secret key refused or an unreachable Auth admin API, before the guard marks or the reset deletes", async () => {
    const { sql, updates } = fakeSql({ id: "org-1", name: "Démo", settings: {} })
    const listUsers = vi.fn(async () => ({ data: { users: [] }, error: { status: 401 } }))
    // Seule la sonde de l'API d'administration d'Auth est simulée : son type complet ne s'en infère pas.
    const auth = { listUsers } as unknown as Parameters<typeof prepareOrg>[0]["auth"]
    await expect(prepareOrg({ sql, auth }, orgSpec("demo"), true, vi.fn())).rejects.toThrow(
      "API d'administration d'Auth injoignable ou clé secrète refusée (HTTP 401) : rien n'est écrit ni supprimé.",
    )
    expect(listUsers.mock.calls).toEqual([[{ page: 1, perPage: 1 }]])
    expect(updates).toEqual([])
  })
})

describe("demo-seed parseArgs", () => {
  // HN-E11S14-10 : `parseArgs` précède, dans `main`, la lecture des variables et la connexion ; sans ce
  // refus, la base rejetterait l'identifiant (`22P02`) à l'insertion du membre, l'organisation déjà créée.
  it("should refuse a --user that is not a uuid, before any connection", () => {
    // Un uuid à un chiffre de trop : l'expression est ancrée aux deux bouts.
    expect(() => parseArgs(["--slug", "tabc123", "--user", "3f0c5a1e-0000-4000-8000-0000000000001"])).toThrow(INVALID_USER)
  })
})

describe("demo-seed command line (no network)", () => {
  function run(args: string[], env: NodeJS.ProcessEnv = process.env) {
    try {
      const stdout = execFileSync(process.execPath, [script, ...args], { encoding: "utf8", stdio: "pipe", env })
      return { status: 0, stdout, stderr: "" }
    } catch (error) {
      // execFileSync lève sur un code non nul ; l'erreur porte status, stdout et stderr du processus.
      return error as { status: number; stdout: string; stderr: string }
    }
  }

  it("should exit 1 naming the missing variables without printing any value", () => {
    // Vides dans l'environnement du processus, elles masquent `.env.local` (comme vitest.config.ts).
    // La connexion d'administration en est (E01-S10, AC-f4) : sans elle, le script n'atteint pas `platform`.
    const anonKey = randomBytes(16).toString("hex")
    const secretKey = randomBytes(16).toString("hex")
    const result = run(["--slug", "tabc123"], {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: "https://project.example.invalid",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
      SUPABASE_SECRET_KEY: secretKey,
      PLATFORM_ADMIN_DATABASE_URL: "",
      E2E_USER_EMAIL: "",
      E2E_USER_PASSWORD: "",
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain(
      "Variables manquantes : PLATFORM_ADMIN_DATABASE_URL, E2E_USER_EMAIL, E2E_USER_PASSWORD (voir .env.example)",
    )
    const output = result.stdout + result.stderr
    expect(output.includes(anonKey) || output.includes(secretKey)).toBe(false)
  })
})
