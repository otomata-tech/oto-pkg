import { randomBytes } from "node:crypto"
import { expect, test, type Locator, type Page } from "@playwright/test"
import { clientAuth } from "./fixtures/base"
import { EQUIPE, ESPACE, SANS_ESPACE } from "./fixtures/espace"
import { attendre, attendreLEnregistrement, capturer, lireLeHtml, seConnecterSurLEspace } from "./fixtures/noeud"

// L'éditeur après les retours de la démo (E11-S06) : une puce, un numéro ou une case par élément d'une liste, sur la
// première ligne de l'élément, jamais sur ses lignes repliées (lot a) ; un lien au repos se modifie dans le panneau
// « Lien » et se relit publié par son nouveau libellé (lot b). Le repli ne se voit que dans un navigateur : les boîtes
// se mesurent (`testing-strategy.md § Budget de tests`), à 390 et à 1 280 px, en clair puis en sombre. Une page
// jetable par passage, sous l'équipe du compte E2E, qui administre l'organisation : la page se publie seule.

const email = process.env.E2E_USER_EMAIL ?? ""
const password = process.env.E2E_USER_PASSWORD ?? ""
const PASSAGES = [
  { mode: "light", largeur: 390 },
  { mode: "dark", largeur: 1_280 },
] as const

/** Un texte qui se replie, même à 1 280 px, après le premier mot qui nomme sa liste. */
const LONG = "est un élément assez long pour se replier sur plusieurs lignes, à 390 comme à 1 280 pixels de large, parce que sa phrase continue encore et encore après la virgule"

async function creerLaPage(page: Page, chemin: string): Promise<void> {
  const issue = await page.evaluate(
    async (corps) => {
      const reponse = await fetch("/api/plateforme/nodes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corps) })
      return reponse.ok ? "écrite" : await reponse.text()
    },
    { path: chemin, title: "Listes et liens", summary: "Page jetable du contrôle d'E11-S06.", publish: true, ops: [{ op: "add_section", section: "Réunion", text: "Premier paragraphe." }] },
  )
  expect(issue).toBe("écrite")
}

async function choisirApres(page: Page, mots: string | RegExp, choix: string): Promise<void> {
  const plus = page.getByRole("button", { name: typeof mots === "string" ? `Ajouter un bloc après — ${mots}` : mots })
  await plus.locator("xpath=ancestor::*[contains(concat(' ', @class, ' '), ' oto-block-row ')][1]").hover()
  await plus.click()
  await page.getByRole("menuitem", { name: choix, exact: true }).click()
}

/** Les éléments de la copie d'une liste, posée avec son champ dans la même case. */
const elementsDe = (liste: Locator) => liste.locator("xpath=..").locator(".oto-block-copie .oto-block-element")

/**
 * Les repères d'une liste : chaque élément du premier niveau en a un, un sous-élément n'en a pas ; le premier élément
 * se replie (plus haut qu'une ligne et demie).
 */
async function controlerLesReperes(liste: Locator, premierNiveau: boolean[]): Promise<void> {
  const mesures = await elementsDe(liste).evaluateAll((elements) =>
    elements.map((element) => ({
      repere: element.querySelector(".oto-block-repere") !== null,
      hauteur: element.getBoundingClientRect().height,
      ligne: parseFloat(getComputedStyle(element).lineHeight),
    })),
  )
  expect(mesures.map((mesure) => mesure.repere)).toEqual(premierNiveau)
  expect(mesures[0].hauteur).toBeGreaterThan(mesures[0].ligne * 1.5)
}

/**
 * L'alignement des repères, au focus (AC-a1 à AC-a3) : la copie replie ses éléments comme le champ replie son texte
 * quand leurs hauteurs, additionnées, font la hauteur du contenu du champ (`scrollHeight` moins son rembourrage
 * vertical calculé), à 1 px près. Le repère, en haut de son élément, est alors sur la première ligne de l'élément.
 */
async function controlerLAlignement(liste: Locator): Promise<void> {
  await expect(liste).toBeFocused()
  const contenu = await liste.evaluate((champ) => {
    const style = getComputedStyle(champ)
    return champ.scrollHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)
  })
  const hauteurs = await elementsDe(liste).evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().height))
  expect(Math.abs(hauteurs.reduce((somme, hauteur) => somme + hauteur, 0) - contenu)).toBeLessThanOrEqual(1)
}

test.describe("listes et liens dans l'éditeur (E11-S06)", () => {
  test.skip(!ESPACE.semee, SANS_ESPACE)

  test.beforeAll(async () => {
    const { error } = await clientAuth().auth.signInWithPassword({ email, password })
    test.skip(error !== null, "E2E account missing from the Supabase project: run pnpm demo:seed (E01-S05)")
  })

  for (const { mode, largeur } of PASSAGES) {
    test(`should mark each list item once, and change a link at rest in its panel (${mode}, ${largeur} px)`, async ({ browser }, testInfo) => {
      test.setTimeout(300_000)
      const context = await browser.newContext({ colorScheme: mode, viewport: { width: largeur, height: 900 } })
      const page = await context.newPage()
      await seConnecterSurLEspace(page, { email, password })
      const chemin = `${EQUIPE.slug}/essai_e11s06_${randomBytes(3).toString("hex")}`
      await creerLaPage(page, chemin)
      await page.goto(`${ESPACE.adresse}/n/${chemin}`)

      // Une liste à puces à deux niveaux, dont le premier élément se replie et porte un lien (AC-a1, AC-a4, AC-a5).
      await choisirApres(page, "Premier paragraphe.", "Liste à puces")
      await page.keyboard.type(`Puce ${LONG} [[${chemin}|Mes tâches]]`)
      await page.keyboard.press("Enter")
      await page.keyboard.type("Deux")
      await page.keyboard.press("Enter")
      await page.keyboard.type("sous-élément")
      await page.keyboard.press("Tab")
      const puces = page.getByRole("textbox", { name: /^Modifier cette liste — Puce/ })
      await controlerLesReperes(puces, [true, true, false])
      await controlerLAlignement(puces)
      await page.keyboard.press("Escape")

      // Une liste numérotée et une liste à cocher, leur premier élément replié (AC-a2, AC-a3).
      await choisirApres(page, /^Ajouter un bloc après — Puce/, "Liste numérotée")
      await page.keyboard.type(`Numéro ${LONG}`)
      await page.keyboard.press("Enter")
      await page.keyboard.type("Quatre")
      const numeros = page.getByRole("textbox", { name: /^Modifier cette liste numérotée/ })
      await controlerLesReperes(numeros, [true, true])
      await controlerLAlignement(numeros)
      await page.keyboard.press("Escape")
      await choisirApres(page, /^Ajouter un bloc après — Numéro/, "Liste à cocher")
      await page.keyboard.type(`Case ${LONG}`)
      await page.keyboard.press("Enter")
      await page.keyboard.type("Cochée")
      const cases = page.getByRole("textbox", { name: /^Modifier cette liste à cocher/ })
      await controlerLesReperes(cases, [true, true])
      await controlerLAlignement(cases)
      await expect(page.getByRole("checkbox", { name: /^Cocher « Case/ })).toHaveCount(1)
      await page.keyboard.press("Escape")
      await attendreLEnregistrement(page)

      // Au repos (Échap a porté le focus sur la poignée), les repères suivent le texte lu (AC-a5) : le lien paraît par son libellé.
      await expect(puces.locator("xpath=..").locator(".oto-block-copie")).not.toContainText("[[")
      await controlerLesReperes(puces, [true, true, false])
      await capturer(page, testInfo, `e11s06-listes-${mode}-${largeur}`)

      // Un clic sur le lien au repos ouvre le panneau, focus dans « Libellé » ; le nouveau libellé s'applique (AC-b2, AC-b4).
      await puces.locator("xpath=..").getByRole("link", { name: "Mes tâches" }).click()
      const libelle = page.getByRole("textbox", { name: "Libellé" })
      await expect(libelle).toBeFocused()
      await expect(page.getByRole("group", { name: "Modifier le lien" })).toBeVisible()
      await capturer(page, testInfo, `e11s06-panneau-${mode}-${largeur}`)
      await libelle.fill("Tâches revues")
      await page.keyboard.press("Enter")
      await expect(puces).toBeFocused()
      await page.keyboard.press("Escape")
      await attendreLEnregistrement(page)

      // La version publiée : le nouveau libellé, jamais la source du lien.
      await attendre(async () => {
        const html = await lireLeHtml(page, `/n/${chemin}?version=publiee`)
        expect(html).toContain("Tâches revues")
        expect(html).not.toContain("[[")
      }).toPass({ timeout: 90_000 })
      await context.close()
    })
  }
})
