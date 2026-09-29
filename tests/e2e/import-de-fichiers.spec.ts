import { randomBytes } from "node:crypto"
import { expect, test, type Locator, type Page } from "@playwright/test"
import { clientAuth } from "./fixtures/base"
import { EQUIPE, ESPACE, SANS_ESPACE } from "./fixtures/espace"
import { attendre, capturer, seConnecterSurLEspace } from "./fixtures/noeud"

// Importer et exporter des fichiers (E10-S01) : un `.md` lâché sur la ligne de l'équipe crée une page en brouillon,
// qui s'ouvre avec l'encart des éléments gardés en texte (AC-a2, AC-a3) ; un `.csv` lâché ouvre le dialogue (aperçu,
// réglages), crée le tableau et ouvre sa grille (AC-b1, AC-b3) ; « Télécharger en .csv » du « ⋯ » de sa ligne rend
// le fichier (AC-b6). Le dialogue et l'encart capturés en clair puis en sombre dans `test-results/`. Fichiers au nom
// tiré au hasard : les adresses créées sont jetables. Le compte E2E administre l'organisation de la campagne : il a
// la gestion de l'équipe, qu'exige un tableau nouveau (D120).

const email = process.env.E2E_USER_EMAIL ?? ""
const password = process.env.E2E_USER_PASSWORD ?? ""
const MODES = ["light", "dark"] as const

/** Un fichier lâché sur un élément, comme le glisser d'un fichier du système : `dragover`, puis `drop`. */
async function lacherUnFichier(page: Page, cible: Locator, fichier: { nom: string; contenu: string; type: string }): Promise<void> {
  const transfert = await page.evaluateHandle(({ nom, contenu, type }) => {
    const donnees = new DataTransfer()
    donnees.items.add(new File([contenu], nom, { type }))
    return donnees
  }, fichier)
  await cible.dispatchEvent("dragover", { dataTransfer: transfert })
  await cible.dispatchEvent("drop", { dataTransfer: transfert })
}

test.describe("import et export de fichiers (E10-S01)", () => {
  test.skip(!ESPACE.semee, SANS_ESPACE)

  test.beforeAll(async () => {
    const { error } = await clientAuth().auth.signInWithPassword({ email, password })
    test.skip(error !== null, "E2E account missing from the Supabase project: run pnpm demo:seed (E01-S05)")
  })

  for (const mode of MODES) {
    test(`should create a page from a dropped .md, a table from a dropped .csv, and download the table as .csv (${mode})`, async ({ browser }, testInfo) => {
      test.setTimeout(300_000)
      const context = await browser.newContext({ colorScheme: mode, viewport: { width: 1_280, height: 900 }, acceptDownloads: true })
      const page = await context.newPage()
      await seConnecterSurLEspace(page, { email, password })
      const jeton = randomBytes(3).toString("hex")
      const ligne = page.locator(`.oto-rail-tree a[href="/n/${EQUIPE.slug}"]`)
      await attendre(ligne).toBeVisible()
      const dialogue = page.getByRole("dialog")

      await lacherUnFichier(page, ligne, { nom: `cr_${jeton}.md`, contenu: "# Compte rendu E2E\n\nUn résumé.\n\n```call\nx {\n```", type: "text/markdown" })
      await attendre(dialogue.getByText("Compte rendu E2E")).toBeVisible()
      await capturer(page, testInfo, `e10s01-md-${mode}`)
      await dialogue.getByRole("button", { name: "Importer", exact: true }).click()
      await attendre(page).toHaveURL(new RegExp(`/n/${EQUIPE.slug}/cr_${jeton}$`))
      await attendre(page.getByRole("status").filter({ hasText: "1 élément conservé en texte" })).toBeVisible()
      await capturer(page, testInfo, `e10s01-encart-${mode}`)

      await lacherUnFichier(page, ligne, { nom: `clients_${jeton}.csv`, contenu: "Nom;Montant\nAtelier;12,5\nForge;3", type: "text/csv" })
      await attendre(dialogue.getByRole("table")).toBeVisible()
      await capturer(page, testInfo, `e10s01-csv-${mode}`)
      await dialogue.getByRole("button", { name: "Importer", exact: true }).click()
      await attendre(page).toHaveURL(new RegExp(`/n/${EQUIPE.slug}/clients_${jeton}$`))
      await attendre(page.getByRole("cell", { name: "Atelier" })).toBeVisible()

      await page.getByRole("button", { name: `Autres actions sur clients_${jeton}` }).click()
      const telechargement = page.waitForEvent("download")
      await page.getByRole("menuitem", { name: "Télécharger en .csv" }).click()
      expect((await telechargement).suggestedFilename()).toBe(`clients_${jeton}.csv`)
      await context.close()
    })
  }
})
