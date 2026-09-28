import { expect, test, type Browser, type Page } from "@playwright/test"
import { attendre, capturer, seConnecterSurLEspace } from "./fixtures/noeud"
import { CHEMINS, EQUIPE, ESPACE, SANS_ESPACE } from "./fixtures/espace"

// E05-S10, partie d (le partage public, ADR-013) et AC-b13 (l'accès général, ADR-014), en contrôle visuel
// connecté sur l'organisation de la campagne : le compte E2E, administrateur de l'organisation (`espace.ts`), en clair puis en sombre, à
// 1 280 et 375 px. Sur la page jetable `private/<handle>/e05s10d_partage` et son enfant `e05s10d_dessous` (créées
// publiées si elles manquent, jamais supprimées), « Partager sur le web » crée le lien (AC-d1) ; la page
// publique s'ouvre sans session (AC-d2), sans les sous-contenus puis avec (AC-d3), un lien hors de portée en
// texte (AC-d4), jamais indexée (AC-d6) ; le lien paraît dans l'administration (AC-d7) ; désactivé, il rend 404
// (AC-d5). L'accès général d'une page de Ventes se montre sans être changé (AC-b13, le contenu n'est pas jetable).
// Chaque passage désactive son lien. Une capture par étape, dans `test-results/`.

const email = process.env.E2E_USER_EMAIL ?? ""
const password = process.env.E2E_USER_PASSWORD ?? ""
const MODES = ["light", "dark"] as const
const LARGEURS = [1280, 375] as const

// Les passages écrivent le même lien jetable : l'un après l'autre.
test.describe.configure({ mode: "serial" })

/** Le `handle` du compte, lu dans l'adresse du Contexte de Privé que porte le rail. */
async function handleDuCompte(page: Page): Promise<string> {
  const href = await page.locator('a[href^="/n/private/"][href$="/contexte"]').first().getAttribute("href")
  const handle = /^\/n\/private\/([^/]+)\/contexte$/.exec(href ?? "")?.[1]
  expect(handle).toBeTruthy()
  return handle ?? ""
}

/**
 * Crée un nœud jetable publié par `POST /api/plateforme/nodes` (`publish: true`) ; son titre donne le dernier
 * segment de son chemin (l'adresse suit le titre, AC-b12). Déjà là : `stale_revision`, gardé tel quel.
 */
async function assurerPublie(page: Page, chemin: string, titre: string, texte: string): Promise<void> {
  const issue = await page.evaluate(
    async (corps) => {
      const reponse = await fetch("/api/plateforme/nodes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corps) })
      const lu: { error?: { code?: string } } = await reponse.json()
      return reponse.ok ? "créée" : (lu.error?.code ?? String(reponse.status))
    },
    { path: chemin, title: titre, summary: "Page jetable du contrôle visuel d'E05-S10, partie d.", publish: true, ops: [{ op: "insert_after", input: { type: "paragraph", text: texte } }] },
  )
  expect(["créée", "stale_revision"]).toContain(issue)
}

/** Ouvre « Partager » de la page courante ; rend le panneau. */
async function ouvrirLePartage(page: Page, espace: string) {
  await page.getByRole("button", { name: `Partager · ${espace}` }).click()
  return page.getByRole("dialog", { name: `Partager — ${espace}` })
}

/** Le lien public du panneau ouvert : l'interrupteur allumé (un reste d'un passage interrompu est d'abord coupé). */
async function creerLeLien(page: Page, espace: string): Promise<string> {
  const panneau = await ouvrirLePartage(page, espace)
  const interrupteur = panneau.getByRole("switch", { name: /Partager sur le web/ })
  await attendre(interrupteur).toBeVisible()
  if (await interrupteur.isChecked()) await desactiver(page, espace)
  // L'élément natif est masqué sous son libellé (`.oto-choice > input`) : on clique le libellé, comme une personne.
  await panneau.locator("label.oto-choice").filter({ hasText: "Partager sur le web" }).click()
  await attendre(interrupteur).toBeChecked()
  const lien = panneau.locator("code").filter({ hasText: "/p/" })
  await attendre(lien).toBeVisible()
  return (await lien.textContent()) ?? ""
}

async function desactiver(page: Page, espace: string): Promise<void> {
  const panneau = page.getByRole("dialog", { name: `Partager — ${espace}` })
  await panneau.getByRole("button", { name: "Désactiver le lien" }).click()
  await panneau.getByRole("group", { name: /Désactiver ce lien/ }).getByRole("button", { name: "Désactiver le lien" }).click()
  await attendre(panneau.getByRole("switch", { name: /Partager sur le web/ })).not.toBeChecked()
}

/** Une page ouverte sans session, dans un contexte neuf, au mode et à la largeur donnés. */
async function sansSession(browser: Browser, mode: (typeof MODES)[number], largeur: number): Promise<Page> {
  const contexte = await browser.newContext({ colorScheme: mode, viewport: { width: largeur, height: 900 } })
  return contexte.newPage()
}

test.describe("E05-S10 partie d : le partage public", () => {
  test.skip(!ESPACE.semee, SANS_ESPACE)

  for (const mode of MODES) {
    for (const largeur of LARGEURS) {
      test(`share a page on the web, read it without a session, then disable it (${mode}, ${largeur} px)`, async ({ page, browser }, testInfo) => {
        test.setTimeout(420_000)
        await page.emulateMedia({ colorScheme: mode })
        await page.setViewportSize({ width: largeur, height: 900 })
        await seConnecterSurLEspace(page, { email, password })
        const handle = await handleDuCompte(page)
        const parent = `private/${handle}/e05s10d_partage`
        const enfant = `${parent}/e05s10d_dessous`
        await assurerPublie(page, parent, "e05s10d partage", `Voir [[${enfant}|le dessous]] et [[contexte|le Contexte de Tout le monde]].`)
        await assurerPublie(page, enfant, "e05s10d dessous", "Un contenu dessous.")
        const suffixe = `${mode}-${largeur}`

        // AC-d1 : le lien se crée depuis « Partager ».
        await page.goto(`${ESPACE.adresse}/n/${parent}`)
        const adresse = await creerLeLien(page, "Privé")
        expect(adresse).toMatch(new RegExp(`^${ESPACE.adresse}/p/[A-Za-z0-9_-]{43}$`))
        await capturer(page, testInfo, `partager-web-${suffixe}`)
        await page.keyboard.press("Escape")

        // AC-d2, AC-d4, AC-d6 : la page publique, sans session ; sans les sous-contenus, leur adresse rend 404 (AC-d3).
        const lecteur = await sansSession(browser, mode, largeur)
        const reponse = await lecteur.goto(adresse)
        expect(reponse?.status()).toBe(200)
        expect(reponse?.headers()["x-robots-tag"]).toBe("noindex, nofollow")
        await expect(lecteur.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow")
        await expect(lecteur.getByRole("heading", { level: 1 })).toHaveText("e05s10d partage")
        await expect(lecteur.getByRole("link", { name: "le dessous" })).toHaveCount(0)
        await expect(lecteur.getByRole("link", { name: "le Contexte de Tout le monde" })).toHaveCount(0)
        await expect(lecteur.getByRole("navigation", { name: "Dessous" })).toHaveCount(0)
        await capturer(lecteur, testInfo, `page-publique-${suffixe}`)
        expect((await lecteur.goto(`${adresse}/${enfant}`))?.status()).toBe(404)
        await expect(lecteur.getByRole("heading", { level: 1 })).toHaveText("Page introuvable")
        await capturer(lecteur, testInfo, `page-publique-404-${suffixe}`)

        // AC-d3 : avec les sous-contenus, le dessous s'ouvre par le même jeton ; le Contexte reste du texte.
        const panneau = await ouvrirLePartage(page, "Privé")
        const sousContenus = panneau.getByRole("checkbox", { name: /Inclure les sous-contenus/ })
        await panneau.locator("label.oto-choice").filter({ hasText: "Inclure les sous-contenus" }).click()
        await attendre(sousContenus).toBeChecked()
        await attendre(panneau.getByRole("status").filter({ hasText: "Les sous-contenus s'ouvrent depuis la page publique." })).toBeVisible()
        await page.keyboard.press("Escape")
        await lecteur.goto(adresse)
        await expect(lecteur.getByRole("link", { name: "le dessous" })).toHaveAttribute("href", `/p/${adresse.split("/p/")[1]}/${enfant}`)
        await expect(lecteur.getByRole("link", { name: "le Contexte de Tout le monde" })).toHaveCount(0)
        await expect(lecteur.getByRole("navigation", { name: "Dessous" }).getByRole("link", { name: "e05s10d dessous" })).toBeVisible()
        await capturer(lecteur, testInfo, `page-publique-dessous-${suffixe}`)
        await lecteur.getByRole("navigation", { name: "Dessous" }).getByRole("link", { name: "e05s10d dessous" }).click()
        await expect(lecteur.getByRole("heading", { level: 1 })).toHaveText("e05s10d dessous")
        await expect(lecteur.getByRole("link", { name: "Retour à e05s10d partage" })).toBeVisible()
        await capturer(lecteur, testInfo, `page-publique-enfant-${suffixe}`)

        // AC-d7 : le lien paraît dans l'administration de l'organisation.
        await page.goto(`${ESPACE.adresse}/admin/organisation`)
        const liens = page.getByRole("region", { name: "Liens publics" })
        await attendre(liens.getByRole("link", { name: "e05s10d partage" })).toBeVisible()
        await capturer(page, testInfo, `admin-liens-publics-${suffixe}`)

        // AC-d5 : désactivé, le lien rend le même 404.
        await page.goto(`${ESPACE.adresse}/n/${parent}`)
        await ouvrirLePartage(page, "Privé")
        await desactiver(page, "Privé")
        expect((await lecteur.goto(adresse))?.status()).toBe(404)
        await expect(lecteur.getByRole("heading", { level: 1 })).toHaveText("Page introuvable")
        await lecteur.context().close()
      })

      test(`show the general access of a team page (${mode}, ${largeur} px)`, async ({ page }, testInfo) => {
        test.setTimeout(240_000)
        await page.emulateMedia({ colorScheme: mode })
        await page.setViewportSize({ width: largeur, height: 900 })
        await seConnecterSurLEspace(page, { email, password })
        await page.goto(`${ESPACE.adresse}/n/${CHEMINS.procedure}`)
        const panneau = await ouvrirLePartage(page, EQUIPE.nom)
        await attendre(panneau.getByRole("combobox", { name: "Qui a accès en général" })).toBeVisible()
        await attendre(panneau.getByRole("switch", { name: /Partager sur le web/ })).toBeVisible()
        await capturer(page, testInfo, `acces-general-${mode}-${largeur}`)
      })
    }
  }
})
