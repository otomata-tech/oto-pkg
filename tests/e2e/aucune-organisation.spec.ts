import { expect, test } from "@playwright/test"
import { supabaseConfigured, type TestOrg } from "../helpers/plateforme"
import { baseAdminConfiguree, clientAuth, donneesJetables, SANS_BASE_ADMIN, type DonneesJetables, type Personne } from "./fixtures/base"
import { adresseDeLHote } from "./fixtures/espace"
import { seConnecter } from "./fixtures/connexion"

// Contrôle visuel connecté de « aucune organisation » (E02-S01, AC26, AC27) : le compte E2E de
// `.env.local` n'est pas membre d'une organisation jetable servie à `t<hex>.localhost`, et aucune
// organisation n'est servie à `127.0.0.1`. Chaque état est capturé en clair et en sombre, dans
// `test-results/` : sous le rapport `line`, une pièce jointe n'est gardée nulle part (M13a).

const email = process.env.E2E_USER_EMAIL ?? ""
const password = process.env.E2E_USER_PASSWORD ?? ""
const THEMES = ["light", "dark"] as const

test.describe("aucune organisation", () => {
  test.skip(!email || !password || !supabaseConfigured || !baseAdminConfiguree, SANS_BASE_ADMIN)
  // Une seule organisation jetable pour les quatre captures.
  test.describe.configure({ mode: "serial" })

  let fx: DonneesJetables
  let org: TestOrg
  let contact: Personne

  test.beforeAll(async () => {
    const { error } = await clientAuth().auth.signInWithPassword({ email, password })
    test.skip(error !== null, "E2E account missing from the Supabase project: run pnpm demo:seed (E01-S05)")

    fx = donneesJetables()
    org = await fx.createOrg({ localhost: true })
    contact = fx.contact()
    await fx.addMember(org.id, contact, { role: "admin", profile: { name: "Contact E2E" } })
  })

  test.afterAll(async () => {
    await fx?.cleanup()
  })

  for (const theme of THEMES) {
    test(`should name the organisation and its contact to a non-member (${theme})`, async ({ page }, testInfo) => {
      await page.emulateMedia({ colorScheme: theme })
      await seConnecter(page, { baseURL: adresseDeLHote(org.slug), email, password })

      await expect(page).toHaveURL(/\/no-organization$/)
      // Le titre de l'état est le `h2` de l'îlot ; le `h1` est le produit (E05-S07, AC10).
      await expect(page.getByRole("heading", { level: 2 })).toHaveText(`Vous n'êtes pas membre de ${org.name}`)
      await expect(page.getByText(`demandez à Contact E2E (${contact.email}) de vous inviter`)).toBeVisible()
      await expect(page.getByText(`Connecté·e avec ${email}.`)).toBeVisible()
      await page.screenshot({ path: testInfo.outputPath(`non-membre-${theme}.png`), fullPage: true })
    })

    test(`should say the address is unknown (${theme})`, async ({ page }, testInfo) => {
      await page.emulateMedia({ colorScheme: theme })
      await seConnecter(page, { baseURL: "http://127.0.0.1:3000", email, password })

      await expect(page).toHaveURL(/\/no-organization$/)
      await expect(page.getByRole("heading", { level: 2 })).toHaveText("Adresse inconnue")
      await page.screenshot({ path: testInfo.outputPath(`adresse-inconnue-${theme}.png`), fullPage: true })
    })
  }
})
