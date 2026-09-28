import { createHash, randomBytes } from "crypto"
import { expect, test, type Page } from "@playwright/test"
import { createClient } from "@supabase/supabase-js"
import { hex, supabaseConfigured } from "../helpers/plateforme"
import { baseAdminConfiguree, demoServieALocalhost, SANS_BASE_ADMIN } from "./fixtures/base"
import { DEMO } from "./fixtures/espace"
import { envoyerLaConnexion } from "./fixtures/connexion"

// Parcours de consentement dans le navigateur (E02-S02, AC23) : un client OAuth public jetable ouvre
// une demande pour `resource` = `<baseURL>/api/mcp` (Démo, servie à `localhost`) ; la page de
// consentement exige la connexion, y revient, nomme « Démo », le client et le compte E2E ; captures
// claire et sombre dans `test-results/` ; « Refuser » puis, sur une seconde demande, « Autoriser »
// après une session perdue entre l'affichage et le clic (AC18 : retour par la connexion, sans décision).
// Prérequis : `pnpm demo:seed` (E01-S05) et le serveur OAuth du projet activé (action JB 1). La clé
// secrète ne sert qu'à créer et supprimer le client jetable. Les adresses partent de `baseURL`.

const email = process.env.E2E_USER_EMAIL ?? ""
const password = process.env.E2E_USER_PASSWORD ?? ""
const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "")
// L'adresse de retour du client jetable ne répond pas : seule la requête du navigateur compte.
const REDIRECT = "http://127.0.0.1:9/callback"

/** L'adresse d'autorisation qu'ouvrirait un host : PKCE S256, `resource`, `offline_access`. */
function adresseDAutorisation(clientId: string, resource: string): string {
  const verifier = randomBytes(32).toString("base64url")
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    state: hex(8),
    scope: "openid email profile offline_access",
    resource,
  })
  return `${url}/auth/v1/oauth/authorize?${params}`
}

/**
 * Supabase envoie la personne sur `/oauth/consent` de l'adresse de site du projet (une seule par
 * projet, H16) : la même demande est servie ici. Playwright n'intercepte pas la cible d'une
 * redirection : c'est la réponse de `/oauth/authorize` qui est relue, et son `Location` réécrit vers
 * ce serveur. Rien n'est réécrit si l'adresse de site est déjà ce serveur.
 */
async function servirLeConsentementIci(page: Page, origine: string): Promise<void> {
  const ici = new URL(origine)
  await page.route(
    (adresse) => adresse.href.startsWith(`${url}/auth/v1/oauth/authorize`),
    async (route) => {
      const reponse = await route.fetch({ maxRedirects: 0 })
      const location = reponse.headers()["location"]
      const cible = location ? new URL(location, url) : null
      if (!cible || cible.pathname !== "/oauth/consent" || cible.host === ici.host) return route.fulfill({ response: reponse })
      return route.fulfill({ status: 302, headers: { location: `${ici.origin}${cible.pathname}${cible.search}` } })
    },
  )
}

/** La valeur d'un terme de la liste des détails. */
const detail = (page: Page, terme: string) => page.locator("dt", { hasText: terme }).locator("xpath=following-sibling::dd[1]")

test.describe("consentement d'un assistant (AC23)", () => {
  test.skip(!email || !password || !supabaseConfigured || !baseAdminConfiguree, SANS_BASE_ADMIN)

  // L'API d'administration de Supabase Auth, à la clé secrète, sans session : rien de `platform`.
  const comptes = () => createClient(url, process.env.SUPABASE_SECRET_KEY ?? "", { auth: { persistSession: false, autoRefreshToken: false } })
  let clientId = ""
  const clientName = `test-${hex(4)}`

  test.beforeAll(async () => {
    test.skip(!(await demoServieALocalhost()), "Démo is not served at localhost: run pnpm demo:seed (E01-S05)")
    const { data, error } = await comptes().auth.admin.oauth.createClient({
      client_name: clientName,
      redirect_uris: [REDIRECT],
      token_endpoint_auth_method: "none",
    })
    test.skip(error !== null || !data, "OAuth server disabled on this project (E02-S02, JB action 1)")
    clientId = data?.client_id ?? ""
  })

  test.afterAll(async () => {
    if (clientId) await comptes().auth.admin.oauth.deleteClient(clientId)
  })

  test("should require sign-in, come back to the request, deny it, then approve a second one after a lost session", async ({ browser, baseURL }, testInfo) => {
    // Deux demandes, deux connexions et, sur un serveur froid, la compilation des pages.
    test.setTimeout(240_000)
    const origine = baseURL ?? DEMO.adresse
    const page = await browser.newPage({ colorScheme: "light" })
    await servirLeConsentementIci(page, origine)

    await page.goto(adresseDAutorisation(clientId, `${origine}/api/mcp`))
    await expect(page).toHaveURL(/\/login\?redirect=%2Foauth%2Fconsent%3Fauthorization_id%3D/)
    // Retour sur la demande ; un serveur de développement froid compile la page au premier passage.
    await envoyerLaConnexion(page, { email, password }, () =>
      page.waitForURL(/\/oauth\/consent\?authorization_id=[A-Za-z0-9_-]+$/, { timeout: 60_000 }),
    )

    await expect(page).toHaveTitle("Autoriser un assistant | Oto")
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(`${clientName} demande l'accès à votre compte`)
    await expect(detail(page, "Organisation")).toHaveText(DEMO.nom)
    await expect(detail(page, "Compte")).toHaveText(email.toLowerCase())
    // Le compte E2E est membre de Démo : aucun avis de non-membre.
    await expect(page.getByText("Vous n'êtes pas membre", { exact: false })).toHaveCount(0)
    await page.screenshot({ path: testInfo.outputPath("consentement-light.png"), fullPage: true, animations: "disabled" })
    await page.emulateMedia({ colorScheme: "dark" })
    await expect(page.locator("html")).toHaveClass(/\bdark\b/)
    await page.screenshot({ path: testInfo.outputPath("consentement-dark.png"), fullPage: true, animations: "disabled" })

    const refus = page.waitForRequest((requete) => requete.url().startsWith(REDIRECT))
    await page.getByRole("button", { name: "Refuser" }).click()
    expect(new URL((await refus).url()).searchParams.get("error")).toBe("access_denied")

    // Seconde demande : la session est ouverte, la page s'affiche sans passer par la connexion.
    await page.goto(adresseDAutorisation(clientId, `${origine}/api/mcp`))
    await expect(page.getByRole("button", { name: "Autoriser" })).toBeVisible()
    // Session perdue entre l'affichage et le clic (AC18) : l'action ramène à la connexion, sans
    // décision ; la connexion ramène à la même demande, toujours en attente.
    const demande = page.url()
    await page.context().clearCookies()
    await page.getByRole("button", { name: "Autoriser" }).click()
    await expect(page).toHaveURL(/\/login\?redirect=%2Foauth%2Fconsent%3Fauthorization_id%3D/)
    await envoyerLaConnexion(page, { email, password }, () => page.waitForURL(demande))
    const accord = page.waitForRequest((requete) => requete.url().startsWith(REDIRECT))
    await page.getByRole("button", { name: "Autoriser" }).click()
    expect(new URL((await accord).url()).searchParams.get("code")).toBeTruthy()
    await page.close()
  })
})
