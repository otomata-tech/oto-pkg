import { expect, test, type Locator, type Page } from "@playwright/test"
import { clientAuth } from "./fixtures/base"
import { assurerLeNoeud, attendre, capturer, lireLeHtml, seConnecterSurLEspace } from "./fixtures/noeud"
import { CHEMINS, ESPACE, SANS_ESPACE } from "./fixtures/espace"

// Contrôle visuel connecté des écrans du Contexte après E05-S12, lot C : le compte E2E, administrateur de l'organisation
// (`espace.ts`), en clair puis en sombre, à 375 et à 1 280 px. Une page jetable `private/<handle>/essai_e05s12`
// et une page rangée sous le Contexte Privé (D110) donnent à l'une et à l'autre leur « Contenus liés ». Entre ce
// repliable et la carte, le seul écart de la colonne, le même sur la page et sur le Contexte, sans l'ancienne marge de
// 20 px (AC-22) ; à 1 280 px, rail ouvert, le haut de « À quoi sert cette page » est au niveau du haut de la carte,
// dans une colonne d'au moins 270 px, le chapô et « Contenus liés » au-dessus d'elle ; à 375 px, l'ordre chapô,
// Contenus liés, carte, annexes (AC-21) ; aucun défilement horizontal du contenu, sur le Contexte et sur l'accueil ;
// « Règles Oto » est repliée à l'arrivée sur la vue « Contexte » de l'accueil, s'ouvre par Entrée, en français
// (E05-S13, AC-14), et se referme par Espace (AC-11). Une capture par étape dans `test-results/`.

const email = process.env.E2E_USER_EMAIL ?? ""
const password = process.env.E2E_USER_PASSWORD ?? ""
const MODES = ["light", "dark"] as const
const LARGEURS = [375, 1_280] as const

// Les passages créent les mêmes pages jetables : l'un après l'autre.
test.describe.configure({ mode: "serial" })

async function boite(element: Locator) {
  const lue = await element.boundingBox()
  if (!lue) throw new Error("élément non mesuré")
  return lue
}

/** Le contenu ne défile pas en largeur : c'est `.oto-content` qui défile, le bureau (`documentElement`) jamais. */
async function sansDefilementHorizontal(page: Page): Promise<boolean> {
  return page.locator(".oto-content").first().evaluate((contenu) => contenu.scrollWidth <= contenu.clientWidth)
}

/** Le repliable « Contenus liés » et la carte du document de la page ouverte. */
function repereDeLaPage(page: Page) {
  return { lies: page.locator(".oto-linked").first(), carte: page.locator(".oto-two-columns-main .oto-island, .oto-content-max .oto-island").first() }
}

/** L'écart entre le bas de « Contenus liés » et le haut de la carte, une fois les deux rendus. */
async function ecartSousLesContenusLies(page: Page): Promise<number> {
  const { lies, carte } = repereDeLaPage(page)
  await attendre(lies).toBeVisible()
  await attendre(carte).toBeVisible()
  const haut = await boite(lies)
  return (await boite(carte)).y - (haut.y + haut.height)
}

test.describe("écrans du Contexte (E05-S12, lot C)", () => {
  test.skip(!ESPACE.semee, SANS_ESPACE)

  test.beforeAll(async () => {
    const { error } = await clientAuth().auth.signInWithPassword({ email, password })
    test.skip(error !== null, "E2E account missing from the Supabase project: run pnpm demo:seed (E01-S05)")
  })

  for (const mode of MODES) {
    for (const largeur of LARGEURS) {
      test(`should align the annexes with the card, drop the margin under linked content and fold the rules (${mode}, ${largeur} px)`, async ({ browser }, testInfo) => {
        test.setTimeout(600_000)
        const context = await browser.newContext({ colorScheme: mode, viewport: { width: largeur, height: 900 } })
        const page = await context.newPage()
        const nom = `${mode}-${largeur}`
        await seConnecterSurLEspace(page, { email, password })
        // Le `handle` du compte, lu dans le lien de son Contexte Privé, que le rail rend côté serveur à toute largeur.
        const servi = await lireLeHtml(page, `/n/${CHEMINS.contexteDeLEquipe}`)
        const handle = /\/n\/private\/([a-z0-9_]+)\/contexte/.exec(servi)?.[1]
        expect(handle).toBeTruthy()
        const essai = `private/${handle}/essai_e05s12`
        await assurerLeNoeud(page, { chemin: essai, titre: "Essai du lot C", resume: "Page jetable du contrôle visuel d'E05-S12." })
        await assurerLeNoeud(page, { chemin: `${essai}/enfant`, titre: "Enfant", resume: "Sous-page jetable." })
        await assurerLeNoeud(page, { chemin: `private/${handle}/contexte/essai_e05s12`, titre: "Rangée sous le Contexte", resume: "Page jetable sous le Contexte Privé (D110)." })

        // AC-22 : sur une page, seul l'écart de la colonne entre « Contenus liés » et la carte.
        await page.goto(`${ESPACE.adresse}/n/${essai}`)
        const ecartDeLaPage = await ecartSousLesContenusLies(page)
        expect(ecartDeLaPage).toBeGreaterThanOrEqual(0)
        expect(ecartDeLaPage).toBeLessThan(16)
        await capturer(page, testInfo, `page-${nom}`)

        // Le Contexte Privé : le même écart (AC-22), puis la colonne d'annexes (AC-21).
        await page.goto(`${ESPACE.adresse}/n/private/${handle}/contexte`)
        const ecartDuContexte = await ecartSousLesContenusLies(page)
        expect(Math.abs(ecartDuContexte - ecartDeLaPage)).toBeLessThanOrEqual(1)
        const { carte } = repereDeLaPage(page)
        const annexes = page.getByRole("note", { name: "À quoi sert cette page" })
        // Le chapô et « Contenus liés » dans leur rangée, au-dessus de la carte et de la colonne d'annexes.
        const tete = page.locator(".oto-node-lead")
        await expect(tete.locator(".oto-linked")).toHaveCount(1)
        const [enTete, enCarte, enAnnexes] = [await boite(tete), await boite(carte), await boite(annexes)]
        expect(enTete.y + enTete.height).toBeLessThanOrEqual(enCarte.y)
        if (largeur === 1_280) {
          // Contenu d'au moins 770 px : les annexes commencent au haut de la carte, à droite d'elle, lisibles
          // (280 px, `--annexes-w`, sous 1 410 px de contenu).
          expect(Math.abs(enAnnexes.y - enCarte.y)).toBeLessThanOrEqual(1)
          expect(enAnnexes.x).toBeGreaterThan(enCarte.x + enCarte.width)
          expect(enAnnexes.width).toBeGreaterThanOrEqual(270)
        } else {
          // Sous 1 024 px : une colonne, les annexes sous la carte.
          expect(enAnnexes.y).toBeGreaterThan(enCarte.y + enCarte.height)
        }
        expect(await sansDefilementHorizontal(page)).toBe(true)
        await capturer(page, testInfo, `contexte-${nom}`)

        // AC-11 : « Règles Oto » repliée à l'arrivée, ouverte par Entrée, refermée par Espace, depuis son résumé.
        await page.goto(`${ESPACE.adresse}/?onglet=contexte`)
        const regles = page.locator("#regles details")
        await attendre(regles).toBeAttached()
        await expect(regles).not.toHaveAttribute("open")
        const resume = regles.locator("summary")
        await expect(resume).toContainText("Règles Oto")
        await resume.focus()
        await page.keyboard.press("Enter")
        await attendre(regles).toHaveAttribute("open")
        // En français à l'écran, servies en anglais (E05-S13, AC-14, HN-E05S13-14).
        await expect(regles).not.toContainText("How this workspace works")
        await expect(page.getByRole("region", { name: "Règles Oto" }).getByRole("textbox")).toHaveCount(0)
        await capturer(page, testInfo, `regles-${nom}`)
        await page.keyboard.press("Space")
        await attendre(regles).not.toHaveAttribute("open")
        // La partie Privé renvoie à Profil (AC-7), sans sa ligne `## Context:` (E05-S13, HN-E05S13-13) ; aucune
        // ancienne partie (AC-6).
        const prive = page.getByRole("region", { name: "Contexte : Privé" })
        await expect(prive.getByText(/^## Context:/)).toHaveCount(0)
        await expect(prive.getByRole("link", { name: "Modifier dans Profil" })).toBeVisible()
        await expect(page.getByRole("region", { name: "Vous", exact: true })).toHaveCount(0)
        expect(await sansDefilementHorizontal(page)).toBe(true)
        await capturer(page, testInfo, `accueil-contexte-${nom}`)
        await context.close()
      })
    }
  }
})
