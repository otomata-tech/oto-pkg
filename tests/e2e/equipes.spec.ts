import { expect, test, type Page, type TestInfo } from "@playwright/test"
import { hex } from "../helpers/plateforme"
import { avecLaBase, clientAuth } from "./fixtures/base"
import { seConnecterSurLEspace } from "./fixtures/noeud"
import { ESPACE, idDeLEspace, SANS_ESPACE } from "./fixtures/espace"

// Contrôle visuel connecté de « Équipes & accès », porté d'oto-frontend (E05-S09 partie d1 : AC-d1, AC-x1,
// AC-x3 ; E05-S03 : AC22) : le compte E2E, administrateur de l'organisation de la campagne et responsable de son
// équipe (`espace.ts`), en clair puis en sombre ; les deux onglets, Membres et Équipes, en tête d'un îlot
// (parcourus aux flèches, l'anneau de focus visible), `?onglet=regles` et `?onglet=acces` ouvrant Membres (E05-S13,
// AC-5), le tableau des personnes et le dialogue « Inviter quelqu'un » (la capture de référence
// `membres-final.png`) ; une équipe jetable `e2e_<hex>` créée par le dialogue de l'en-tête (son dossier et son
// Contexte naissent, P39), renommée par son menu « ⋯ », puis sa suppression refusée avec ce qu'elle possède
// (AC14). La connexion d'administration la retire ensuite, dans ce fichier seulement : ses nœuds, puis l'équipe.
// Captures des huit thèmes, posés sur la racine `.oto` de la page, sans écrire la marque. Captures dans
// `test-results/`.

const email = process.env.E2E_USER_EMAIL ?? ""
const password = process.env.E2E_USER_PASSWORD ?? ""
const ADRESSE = ESPACE.adresse
const MODES = ["light", "dark"] as const
const THEMES = ["manuscrit", "ardoise", "grenat", "brique", "foret", "lagune", "cobalt", "violet"]

/**
 * Une capture au repos : Playwright mène les entrées et les transitions à leur fin, et arrête les boucles.
 * Attendre `finished` de chaque animation laissait la capture pendue au contrôle visuel (délai dépassé).
 */
async function capturer(page: Page, testInfo: TestInfo, nom: string): Promise<void> {
  await page.screenshot({ path: testInfo.outputPath(`${nom}.png`), caret: "initial", animations: "disabled" })
}

/** Les nœuds d'une équipe jetable, lus et retirés par la connexion d'administration. */
async function cheminsDe(orgId: string, slug: string): Promise<string[]> {
  const lus = await avecLaBase((sql) => sql<{ path: string }[]>`select path from platform.nodes where org_id = ${orgId} and path like ${`${slug}%`}`)
  return lus.map((row) => row.path).filter((path) => path === slug || path.startsWith(`${slug}/`))
}

async function retirerLEquipe(orgId: string, slug: string): Promise<void> {
  const chemins = await cheminsDe(orgId, slug)
  await avecLaBase(async (sql) => {
    // Les nœuds d'abord, du plus profond au dossier : un nœud qui a des enfants ne se supprime pas.
    for (const path of chemins.sort((a, b) => b.split("/").length - a.split("/").length)) {
      await sql`delete from platform.nodes where org_id = ${orgId} and path = ${path}`
    }
    await sql`delete from platform.teams where org_id = ${orgId} and slug = ${slug}`
  })
}

/** Une page sous le dossier de l'équipe : sa suppression doit alors être refusée (AC14, P39). */
async function unePageSous(orgId: string, slug: string): Promise<void> {
  await avecLaBase(async (sql) => {
    const [dossier] = await sql<{ id: string }[]>`select id from platform.nodes where org_id = ${orgId} and path = ${slug}`
    if (!dossier) throw new Error(`dossier ${slug} introuvable`)
    await sql`
      insert into platform.nodes (org_id, parent_id, path, kind, title, summary)
      values (${orgId}, ${dossier.id}, ${`${slug}/notes`}, 'page', 'Notes', 'Page de test E2E.')`
  })
}

/** Ouvre le menu « ⋯ » d'une ligne et choisit l'une de ses entrées. */
async function geste(page: Page, ligne: string, entree: string): Promise<void> {
  await page.getByRole("button", { name: `Gérer ${ligne}`, exact: true }).click()
  await page.getByRole("menu").getByRole("menuitem", { name: entree, exact: true }).click()
}

test.describe("équipes et droits", () => {
  test.skip(!ESPACE.semee, SANS_ESPACE)
  // Un parcours de plusieurs routes, compilées à la demande par `next dev` sur la machine partagée : 30 s ne suffisent pas.
  test.slow()

  test.beforeAll(async () => {
    const { error } = await clientAuth().auth.signInWithPassword({ email, password })
    test.skip(error !== null, "E2E account missing from the Supabase project: run pnpm demo:seed (E01-S05)")
  })

  for (const mode of MODES) {
    test(`should show the two tabs, invite, create, rename and fail to delete a team that owns a page (${mode})`, async ({ browser }, testInfo) => {
      const orgId = await idDeLEspace()
      const slug = `e2e_${hex(3)}`
      const page = await browser.newPage({ colorScheme: mode, viewport: { width: 1440, height: 900 } })
      try {
        await seConnecterSurLEspace(page, { email, password })
        await page.goto(`${ADRESSE}/equipes`)
        await expect(page.getByRole("heading", { level: 1 })).toHaveText("Équipes & accès")
        const onglets = page.getByRole("tablist", { name: "Onglets de l'écran" }).getByRole("tab")
        await expect(onglets).toHaveText([/^Membres\d+$/, /^Équipes\d+$/])
        await expect(page.getByRole("table", { name: `Les personnes de ${ESPACE.nom}` })).toContainText("· vous")
        await capturer(page, testInfo, `membres-${mode}`)

        await page.getByRole("button", { name: "Inviter quelqu'un" }).click()
        const invitation = page.getByRole("dialog", { name: "Inviter quelqu'un" })
        await expect(invitation.getByLabel("Adresse email")).toBeFocused()
        await capturer(page, testInfo, `membres-invitation-${mode}`)
        await page.keyboard.press("Escape")
        await expect(invitation).toBeHidden()

        // Au clavier (AC-x3) : les flèches passent d'un onglet à l'autre, et l'anneau de focus se voit.
        await onglets.first().focus()
        await page.keyboard.press("ArrowRight")
        await expect(onglets.nth(1)).toBeFocused()
        expect(await onglets.nth(1).evaluate((onglet) => onglet.matches(":focus-visible") && getComputedStyle(onglet).boxShadow !== "none")).toBe(true)

        await onglets.nth(1).click()
        await expect(page).toHaveURL(`${ADRESSE}/equipes?onglet=equipes`)
        await page.getByRole("button", { name: "Créer une équipe" }).click()
        const creation = page.getByRole("dialog", { name: "Créer une équipe" })
        await creation.getByLabel("Nom de la nouvelle équipe").fill(slug)
        await creation.getByRole("button", { name: "Créer l'équipe" }).click()
        const equipes = page.getByRole("table", { name: `Les équipes de ${ESPACE.nom}` })
        await expect(equipes.getByRole("cell", { name: slug, exact: true })).toBeVisible()
        expect((await cheminsDe(orgId, slug)).sort()).toEqual([slug, `${slug}/contexte`])
        await unePageSous(orgId, slug)

        const renomme = `${slug} renommée`
        await geste(page, slug, "Renommer…")
        const renommage = page.getByRole("dialog", { name: `Renommer ${slug}` })
        await renommage.getByLabel("Nom de l'équipe").fill(renomme)
        await renommage.getByRole("button", { name: "Enregistrer" }).click()
        await expect(equipes.getByRole("cell", { name: renomme, exact: true })).toBeVisible()

        await geste(page, renomme, "Supprimer l'équipe")
        const suppression = page.getByRole("dialog", { name: `Supprimer ${renomme}` })
        await suppression.getByRole("button", { name: "Supprimer l'équipe", exact: true }).click()
        // Filtré : l'annonceur de route de Next porte aussi `role="alert"`.
        await expect(suppression.getByRole("alert").filter({ hasText: "possède encore" })).toContainText(`${renomme} possède encore : ${slug}/notes (nœud).`)
        await capturer(page, testInfo, `equipes-suppression-${mode}`)
        await suppression.getByRole("button", { name: "Annuler" }).click()
        await capturer(page, testInfo, `equipes-${mode}`)

        // Les onglets retirés ouvrent Membres (E05-S13, AC-5).
        for (const retire of ["regles", "acces"]) {
          await page.goto(`${ADRESSE}/equipes?onglet=${retire}`)
          await expect(onglets.first()).toHaveAttribute("aria-selected", "true")
          await expect(page.getByRole("table", { name: `Les personnes de ${ESPACE.nom}` })).toBeVisible()
        }

        await page.goto(`${ADRESSE}/equipes`)
        await expect(page.getByRole("table", { name: `Les personnes de ${ESPACE.nom}` })).toBeVisible()
        for (const theme of THEMES) {
          await page.evaluate((cle) => document.querySelector(".oto")?.setAttribute("data-oto-theme", cle), theme)
          await capturer(page, testInfo, `membres-${theme}-${mode}`)
        }

        // Sous la largeur de référence, le tableau défile dans son cadre, jamais la page (tables-patterns.md § Accessibilité).
        await page.setViewportSize({ width: 1280, height: 900 })
        const debord = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        expect(debord, "horizontal page scroll at 1280 px").toBeLessThanOrEqual(0)
        await capturer(page, testInfo, `membres-1280-${mode}`)
      } finally {
        await page.close()
        await retirerLEquipe(orgId, slug)
      }
    })
  }
})
