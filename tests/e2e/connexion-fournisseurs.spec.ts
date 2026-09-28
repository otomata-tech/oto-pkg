import { expect, test } from "@playwright/test"
import { DEMO as DEMO_SERVIE } from "./fixtures/espace"

// Boutons des fournisseurs sur `/login` (E09-S03) : seulement une fois Google ou Microsoft activé
// dans Supabase (action JB). Les réglages sont lus comme la page les lit, `GET /auth/v1/settings`
// avec la clé publique (`playwright.config.ts`) ; captures de `/login` par thème dans
// `test-results/`. Le parcours n'est pas poursuivi chez Google : l'arrivée sur son adresse suffit.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
// Démo est servie à `localhost` (H10) ; l'adresse vient de la fixture de la campagne.
const DEMO = DEMO_SERVIE.adresse
const THEMES = ["light", "dark"] as const

type Actifs = { google: boolean; azure: boolean }

async function fournisseursDuProjet(): Promise<Actifs> {
  if (!url || !anonKey) return { google: false, azure: false }
  const reponse = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: anonKey } })
  if (!reponse.ok) return { google: false, azure: false }
  const reglages: { external?: { google?: unknown; azure?: unknown } } | null = await reponse.json()
  return { google: reglages?.external?.google === true, azure: reglages?.external?.azure === true }
}

test.describe("connexion par Google et Microsoft", () => {
  let actifs: Actifs = { google: false, azure: false }

  test.beforeAll(async () => {
    actifs = await fournisseursDuProjet()
    test.skip(!actifs.google && !actifs.azure, "fournisseurs non activés dans Supabase")
  })

  for (const theme of THEMES) {
    test(`should show « ou » and the enabled providers under the form (${theme})`, async ({ browser }, testInfo) => {
      const page = await browser.newPage({ colorScheme: theme })
      await page.goto(`${DEMO}/login`)

      await expect(page.getByText("ou", { exact: true })).toBeVisible()
      const google = page.getByRole("button", { name: "Continuer avec Google" })
      const microsoft = page.getByRole("button", { name: "Continuer avec Microsoft" })
      await (actifs.google ? expect(google).toBeVisible() : expect(google).toHaveCount(0))
      await (actifs.azure ? expect(microsoft).toBeVisible() : expect(microsoft).toHaveCount(0))
      await page.screenshot({ path: testInfo.outputPath(`connexion-fournisseurs-${theme}.png`), fullPage: true })
      await page.close()
    })
  }

  test("should leave for accounts.google.com on « Continuer avec Google »", async ({ page }) => {
    test.skip(!actifs.google, "Google non activé dans Supabase")
    await page.goto(`${DEMO}/login`)

    await page.getByRole("button", { name: "Continuer avec Google" }).click()

    await page.waitForURL(/^https:\/\/accounts\.google\.com\//)
  })
})
