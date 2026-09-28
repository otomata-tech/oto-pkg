import { expect, test, type Locator, type Page } from "@playwright/test"
import { clientAuth } from "./fixtures/base"
import { assurerLeNoeud, attendre, capturer, ouvrirLeRail, seConnecterSurLEspace } from "./fixtures/noeud"
import { ESPACE, SANS_ESPACE } from "./fixtures/espace"

// E05-S10, partie b2 (les gestes du rail), en contrôle visuel connecté sur l'organisation de la campagne : le compte E2E, en clair puis en
// sombre, à 1 280 et 375 px (le rail en tiroir). Sur trois pages jetables du Privé du compte (`e05s10b2_un`,
// `_deux`, `_trois`, créées si elles manquent, jamais supprimées), le « ⋯ » propose Déplacer, Monter, Descendre,
// Dupliquer, Supprimer (AC-b8, AC-b9) ; la dernière des trois, glissée au-dessus de la première, prend sa place
// (AC-b9) ; « Dupliquer » ouvre la copie, sélectionnée (AC-b10) ; un titre écrit dans la copie se publie sans
// remonter la page (le champ garde le focus), l'adresse garde l'ancien chemin et le rail marque la copie renommée
// (AC-b12, décision de JB du 2026-09-28) ; « Supprimer » la met à la corbeille après confirmation, puis la
// « Corbeille » du menu du compte (E05-S11, AC-e22) la liste et la restaure, et la copie restaurée repart à la corbeille par l'API
// (AC-b11) : chaque passage laisse une copie `e05s10b2_renommee…` à la corbeille, purgée à 30 jours.
// Une capture par étape, dans `test-results/`.

const email = process.env.E2E_USER_EMAIL ?? ""
const password = process.env.E2E_USER_PASSWORD ?? ""
const MODES = ["light", "dark"] as const
const LARGEURS = [1280, 375] as const
const RESUME = "Page jetable du contrôle visuel d'E05-S10, partie b2."
const TITRES = ["e05s10b2 un", "e05s10b2 deux", "e05s10b2 trois"] as const
const RENOMMEE = "e05s10b2 renommee"

// Les passages écrivent les mêmes nœuds jetables : l'un après l'autre.
test.describe.configure({ mode: "serial" })

/** Le `handle` du compte, lu dans l'adresse du Contexte de Privé que porte le rail. */
async function handleDuCompte(page: Page): Promise<string> {
  const href = await page.locator('a[href^="/n/private/"][href$="/contexte"]').first().getAttribute("href")
  const handle = /^\/n\/private\/([^/]+)\/contexte$/.exec(href ?? "")?.[1]
  expect(handle).toBeTruthy()
  return handle ?? ""
}

/** Le « ⋯ » d'une ligne, révélé au survol de sa rangée (le design system le cache au repos), puis ouvert. */
async function ouvrirLeMenu(ligne: Locator, nom: string): Promise<void> {
  await ligne.hover()
  await ligne.locator("xpath=..").getByRole("button", { name: `Autres actions sur ${nom}` }).click()
}

/** L'ordre des trois pages jetables dans la liste de Privé. */
async function ordreDesTrois(rail: Locator): Promise<string[]> {
  const noms = await rail.getByRole("list", { name: "Privé" }).getByRole("link").allTextContents()
  return noms.filter((nom): nom is (typeof TITRES)[number] => (TITRES as readonly string[]).includes(nom))
}

test.describe("E05-S10 partie b2 : les gestes du rail", () => {
  test.skip(!ESPACE.semee, SANS_ESPACE)

  test.beforeAll(async () => {
    const { error } = await clientAuth().auth.signInWithPassword({ email, password })
    test.skip(error !== null, "E2E account missing from the Supabase project: run pnpm demo:seed (E01-S05)")
  })

  for (const mode of MODES) {
    for (const largeur of LARGEURS) {
      test(`should order, duplicate, delete and restore from the rail and the bin (${mode}, ${largeur} px)`, async ({ browser }, testInfo) => {
        test.setTimeout(600_000)
        const context = await browser.newContext({ colorScheme: mode, viewport: { width: largeur, height: 900 } })
        const page = await context.newPage()
        const nom = `${mode}-${largeur}`
        await seConnecterSurLEspace(page, { email, password })
        const handle = await handleDuCompte(page)
        for (const titre of TITRES) await assurerLeNoeud(page, { chemin: `private/${handle}/${titre.replace(" ", "_")}`, titre, resume: RESUME })
        await page.goto(`${ESPACE.adresse}/n/private/${handle}/contexte`)
        let rail = await ouvrirLeRail(page, largeur)

        // Le « ⋯ » d'une page entre deux frères (AC-b8, AC-b9).
        await attendre.poll(() => ordreDesTrois(rail)).toHaveLength(3)
        const [premier, milieu, dernier] = await ordreDesTrois(rail)
        await ouvrirLeMenu(rail.getByRole("link", { name: milieu, exact: true }), milieu)
        const menu = page.getByRole("menu")
        await expect(menu.getByRole("menuitem")).toHaveText(["Déplacer", "Monter", "Descendre", "Dupliquer", "Supprimer"])
        await capturer(page, testInfo, `menu-${nom}`)
        await page.keyboard.press("Escape")

        // Glissée sur le haut de la première, la dernière prend sa place, pour tout le monde (AC-b9).
        await rail.getByRole("link", { name: dernier, exact: true }).dragTo(rail.getByRole("link", { name: premier, exact: true }), { targetPosition: { x: 24, y: 2 } })
        await attendre.poll(() => ordreDesTrois(rail)).toEqual([dernier, premier, milieu])
        await capturer(page, testInfo, `rang-${nom}`)

        // « Dupliquer » : la copie s'ouvre, sélectionnée dans le rail (AC-b10).
        await ouvrirLeMenu(rail.getByRole("link", { name: premier, exact: true }), premier)
        await page.getByRole("menu").getByRole("menuitem", { name: "Dupliquer" }).click()
        await attendre(page).toHaveURL(new RegExp(`/n/private/${handle}/${premier.replace(" ", "_")}_copie(_\\d+)?$`))
        const copie = `${premier} (copie)`
        rail = await ouvrirLeRail(page, largeur)
        await attendre(rail.getByRole("link", { name: copie }).first()).toHaveAttribute("aria-current", "page")
        await capturer(page, testInfo, `copie-${nom}`)

        // Un titre écrit dans la copie (AC-b12) : publié 3 s après la frappe, le chemin suit le titre ; la page n'est
        // pas remontée, le champ garde le focus ; l'adresse garde l'ancien chemin, et le rail marque la copie renommée.
        if (largeur < 768) await page.keyboard.press("Escape")
        const adresseDeLaCopie = page.url()
        const champ = page.getByRole("textbox", { name: "Titre" })
        await champ.fill(RENOMMEE)
        // La ligne marquée porte le nouveau titre une fois la publication (3 s) et la relecture passées.
        await attendre(rail.locator('a[aria-current="page"]')).toHaveText(RENOMMEE)
        expect(await champ.evaluate((element) => element === document.activeElement)).toBe(true)
        await expect(champ).toHaveValue(RENOMMEE)
        expect(page.url()).toBe(adresseDeLaCopie)
        rail = await ouvrirLeRail(page, largeur)
        await capturer(page, testInfo, `renommee-${nom}`)

        // « Supprimer » : la question dit ce qui part, puis la copie va à la corbeille (AC-b11).
        await ouvrirLeMenu(rail.locator('a[aria-current="page"]'), RENOMMEE)
        await page.getByRole("menu").getByRole("menuitem", { name: "Supprimer" }).click()
        const question = page.getByRole("dialog", { name: `Supprimer « ${RENOMMEE} » ?` })
        await expect(question).toContainText("Il va à la corbeille")
        await capturer(page, testInfo, `supprimer-${nom}`)
        await question.getByRole("button", { name: "Supprimer" }).click()
        await attendre(page).toHaveURL(`${ESPACE.adresse}/n/private/${handle}`)

        // La « Corbeille » du menu du compte, ouvert par l'engrenage du pied (E05-S11, AC-e22) : la copie y est,
        // « Restaurer » l'ouvre ; elle repart à la corbeille par l'API.
        rail = await ouvrirLeRail(page, largeur)
        await rail.getByRole("button", { name: /^Compte : / }).click()
        await page.getByRole("menu").getByRole("menuitem", { name: "Corbeille" }).click()
        await attendre(page).toHaveURL(`${ESPACE.adresse}/corbeille`)
        await expect(page.getByRole("heading", { level: 1, name: "Corbeille" })).toBeVisible()
        const restaurer = page.getByRole("button", { name: `Restaurer « ${RENOMMEE} »` }).first()
        await expect(restaurer).toBeVisible()
        await capturer(page, testInfo, `corbeille-${nom}`)
        await restaurer.click()
        await attendre(page).toHaveURL(new RegExp(`/n/private/${handle}/${RENOMMEE.replace(" ", "_")}(_\\d+)?$`))
        const restauree = new URL(page.url()).pathname.slice("/n/".length)
        const statut = await page.evaluate(
          async (path) => (await fetch("/api/plateforme/trash", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path }) })).status,
          restauree,
        )
        expect(statut).toBe(200)
        await context.close()
      })
    }
  }
})
