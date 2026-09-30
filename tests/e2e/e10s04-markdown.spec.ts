import { randomBytes } from "node:crypto"
import { expect, test, type Page } from "@playwright/test"
import { clientAuth } from "./fixtures/base"
import { EQUIPE, ESPACE, SANS_ESPACE } from "./fixtures/espace"
import { attendre, capturer, seConnecterSurLEspace } from "./fixtures/noeud"

// Compatibilité markdown des pages (E10-S04) : une page écrite par l'API d'écriture avec un compte rendu tel
// qu'un assistant l'écrit (titres à cinq niveaux, tableau, séparateurs, listes imbriquées, repli, barré,
// `<br>`) s'affiche sans balisage visible, en clair puis en sombre, à 1 280 et à 390 px ; à 390 px, le tableau
// défile dans son bloc, jamais la page ; le repli s'ouvre au clavier. Lue en version publiée : le compte E2E
// administre l'organisation de la campagne, et l'éditeur montrerait les champs des blocs. Une page par passage,
// jetable, sous l'équipe du compte. Une capture par thème et par largeur dans `test-results/`.

const email = process.env.E2E_USER_EMAIL ?? ""
const password = process.env.E2E_USER_PASSWORD ?? ""
const MODES = ["light", "dark"] as const
const LARGEURS = [1_280, 390] as const

const COMPTE_RENDU = [
  "Réunion du **lundi** : ~~report~~ maintenu.<br>Voir le devis ci-dessous.",
  "---",
  "| Sujet | Décision | Échéance |\n| :--- | :---: | ---: |\n| Devis \\| Acme, une cellule assez longue pour déborder à 390 px | Relancer par téléphone puis par email | vendredi prochain |\n| Pré-étude |  | 15/10 |",
  "- Actions\n  - Léa : relancer\n    1. appeler\n    2. écrire\n  - Paul : chiffrer\n- Suivi",
  "### Détail\n\nTexte.\n\n#### Précision\n\n##### Note\n\n###### Fin",
  "***",
  "<details>\n<summary>Notes brutes</summary>\n\nTout ce qui a été dit.\n\n</details>",
].join("\n\n")

/** Les marques qui ne doivent jamais se lire à l'écran. */
const BALISAGE = ["~~", "<br", "| :---", "<details", "<summary", "###", "**", "\\|"]

/** Écrit et publie la page par `POST /api/platform/nodes`, depuis la page connectée (même origine, même session). */
async function ecrireLaPage(page: Page, chemin: string): Promise<void> {
  const issue = await page.evaluate(
    async (corps) => {
      const reponse = await fetch("/api/platform/nodes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corps) })
      return reponse.ok ? "écrite" : await reponse.text()
    },
    { path: chemin, title: "Compte rendu en markdown", summary: "Page jetable du contrôle visuel d'E10-S04.", publish: true, ops: [{ op: "add_section", section: "Réunion", text: COMPTE_RENDU }] },
  )
  expect(issue).toBe("écrite")
}

test.describe("page écrite en markdown par un assistant (E10-S04)", () => {
  test.skip(!ESPACE.semee, SANS_ESPACE)

  test.beforeAll(async () => {
    const { error } = await clientAuth().auth.signInWithPassword({ email, password })
    test.skip(error !== null, "E2E account missing from the Supabase project: run pnpm demo:seed (E01-S05)")
  })

  for (const mode of MODES) {
    for (const largeur of LARGEURS) {
      test(`should show a report without visible markup, its table scrolling in its block (${mode}, ${largeur} px)`, async ({ browser }, testInfo) => {
        test.setTimeout(300_000)
        const context = await browser.newContext({ colorScheme: mode, viewport: { width: largeur, height: 900 } })
        const page = await context.newPage()
        await seConnecterSurLEspace(page, { email, password })
        const chemin = `${EQUIPE.slug}/essai_e10s04_${randomBytes(3).toString("hex")}`
        await ecrireLaPage(page, chemin)
        await page.goto(`${ESPACE.adresse}/n/${chemin}?version=published`)
        const tableau = page.getByRole("table")
        await attendre(tableau).toBeVisible()

        const texte = (await page.locator(".oto-island-body[data-reading]").innerText()) ?? ""
        for (const marque of BALISAGE) expect(texte, marque).not.toContain(marque)
        await expect(page.getByRole("heading", { level: 6, name: "Fin" })).toBeVisible()
        await expect(page.locator("hr.oto-separator")).toHaveCount(2)
        await expect(page.locator("s", { hasText: "report" })).toBeVisible()
        await expect(page.locator("ul ul ol li", { hasText: "appeler" })).toBeVisible()

        // Le tableau défile dans son bloc, jamais la page.
        const largeurs = await page.evaluate(() => {
          const bloc = document.querySelector(".oto-table-wrap")
          return { bloc: bloc ? bloc.scrollWidth - bloc.clientWidth : -1, page: document.documentElement.scrollWidth - document.documentElement.clientWidth }
        })
        expect(largeurs.page).toBeLessThanOrEqual(0)
        if (largeur < 768) expect(largeurs.bloc).toBeGreaterThan(0)

        // Le repli, fermé, s'ouvre au clavier du navigateur.
        const resume = page.locator("summary", { hasText: "Notes brutes" })
        await expect(page.getByText("Tout ce qui a été dit.")).toBeHidden()
        await resume.focus()
        await page.keyboard.press("Enter")
        await expect(page.getByText("Tout ce qui a été dit.")).toBeVisible()
        await capturer(page, testInfo, `e10s04-${mode}-${largeur}`)
        await context.close()
      })
    }
  }
})
