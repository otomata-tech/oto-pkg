import { existsSync, readFileSync } from "fs"
import path from "path"
import { parseEnv } from "util"
import { defineConfig, devices } from "@playwright/test"
import { TEST_PROJECT_VARIABLES, testProjectRefusal } from "./tests/helpers/test-project-guard.mjs"

// Les contrôles visuels connectés lisent le compte E2E et, pour leurs données jetables, l'URL et
// les clés du projet et la connexion d'administration de `platform` dans `.env.local` (comme
// `vitest.config.ts`). Seules ces six variables passent ; l'environnement du processus l'emporte sur le
// fichier.
const E2E_VARIABLES = [
  "E2E_USER_EMAIL",
  "E2E_USER_PASSWORD",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SECRET_KEY",
  "PLATFORM_ADMIN_DATABASE_URL",
]

function loadE2eEnv(): NodeJS.Dict<string> {
  const filePath = path.resolve(__dirname, ".env.local")
  if (!existsSync(filePath)) return {}
  const parsed = parseEnv(readFileSync(filePath, "utf8"))
  for (const key of E2E_VARIABLES) {
    const value = parsed[key]
    if (value !== undefined && process.env[key] === undefined) process.env[key] = value
  }
  return parsed
}

// Aucune campagne ne part vers un autre projet que celui de `PLATFORM_TEST_PROJECT_ID` : le serveur
// (`pnpm dev`) lit aussi `.env.local`, donc la garde y lit ses variables, l'environnement l'emportant.
const envLocal = loadE2eEnv()
const refusal = testProjectRefusal(Object.fromEntries(TEST_PROJECT_VARIABLES.map((key) => [key, process.env[key] ?? envLocal[key]])))
if (refusal) throw new Error(refusal)

export default defineConfig({
  testDir: "./tests/e2e",
  // L'organisation jetable de la campagne, semée avant les specs et supprimée après, échecs compris (E05-S13, lot E).
  globalSetup: "./tests/e2e/fixtures/campagne.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  // `line`, jamais `html` : le rapport HTML garde les saisies d'un passage, mot de passe compris, dans
  // `playwright-report/`, que rien ne nettoie (`testing-strategy.md § Anti-patterns`, revue d'E02-S02).
  reporter: "line",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
  },
})
