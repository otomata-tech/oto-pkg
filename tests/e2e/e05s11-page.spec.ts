import { expect, test, type Locator, type Page } from "@playwright/test"
import { clientAuth } from "./fixtures/base"
import { assurerLeNoeud, attendre, capturer, lireLeHtml, seConnecterSurLEspace, statut } from "./fixtures/noeud"
import { CHEMINS, ESPACE, PROCEDURE, SANS_ESPACE } from "./fixtures/espace"

// Contrôle visuel connecté de la page d'un nœud après les retours de JB (E05-S11, lot b) : le compte E2E,
// administrateur de l'organisation (`espace.ts`), en clair puis en sombre, à 375 et à 1 280 px, sur la page jetable
// `private/<handle>/essai_e05s11`. Tout le texte d'un bloc sélectionné ouvre le menu de sa poignée, le focus restant
// au texte (AC-28) ; « Enregistrement… » puis « Enregistré. » paraissent en haut à droite de la carte sans qu'aucun
// bloc ne bouge, puis se taisent (AC-1, AC-2) ; au repos, la page citée se lit par son titre et l'adresse par son
// domaine, dans la phrase (AC-26, AC-27) ; le document s'élargit à 830 px et les blocs n'ont plus de marge droite
// (AC-30) ; un Contexte se titre « Contexte · Tout le monde » (AC-17). Une capture par étape dans `test-results/`.

const email = process.env.E2E_USER_EMAIL ?? ""
const password = process.env.E2E_USER_PASSWORD ?? ""
const MODES = ["light", "dark"] as const
const LARGEURS = [375, 1_280] as const

// Les passages écrivent la même page jetable : l'un après l'autre.
test.describe.configure({ mode: "serial" })

async function boite(element: Locator) {
  const lue = await element.boundingBox()
  if (!lue) throw new Error("élément non mesuré")
  return lue
}

/**
 * Le haut du premier bloc dans la carte du document : il ne bouge pas quand l'indication paraît ou disparaît (AC-1).
 * Mesuré depuis le haut de la carte : le défilement et les encarts, qui paraissent après la publication, n'y entrent pas.
 */
async function hautDuPremierBloc(page: Page): Promise<number> {
  const rangee = page.locator(".oto-block-row").first()
  const carte = page.locator(".oto-island").filter({ has: rangee })
  return (await boite(rangee)).y - (await boite(carte)).y
}

test.describe("page d'un nœud après les retours de JB (E05-S11, lot b)", () => {
  test.skip(!ESPACE.semee, SANS_ESPACE)

  test.beforeAll(async () => {
    const { error } = await clientAuth().auth.signInWithPassword({ email, password })
    test.skip(error !== null, "E2E account missing from the Supabase project: run pnpm demo:seed (E01-S05)")
  })

  for (const mode of MODES) {
    for (const largeur of LARGEURS) {
      test(`should save without moving a block, read links in the sentence and open the menu on a whole selection (${mode}, ${largeur} px)`, async ({ browser }, testInfo) => {
        test.setTimeout(600_000)
        const context = await browser.newContext({ colorScheme: mode, viewport: { width: largeur, height: 900 } })
        const page = await context.newPage()
        const nom = `${mode}-${largeur}`
        await seConnecterSurLEspace(page, { email, password })
        // Le `handle` du compte, lu dans le lien de son Contexte Privé, que le rail rend côté serveur à toute largeur.
        const servi = await lireLeHtml(page, `/n/${CHEMINS.contexteDeLEquipe}`)
        const handle = /\/n\/private\/([a-z0-9_]+)\/contexte/.exec(servi)?.[1]
        expect(handle).toBeTruthy()
        const essai = `private/${handle}/essai_e05s11`
        await assurerLeNoeud(page, { chemin: essai, titre: "Essai des retours", resume: "Page jetable du contrôle visuel d'E05-S11." })
        await page.goto(`${ESPACE.adresse}/n/${essai}`)
        const champ = page.getByRole("textbox", { name: /^Modifier ce texte — / }).first()
        await attendre(champ).toBeVisible()
        await attendre(statut(page, "Enregistrement…")).toHaveCount(0)
        const avant = await hautDuPremierBloc(page)

        // AC-28 : tout sélectionner ouvre le menu de la poignée, le focus reste au texte ; Échap le ferme.
        await champ.click()
        await page.keyboard.press("ControlOrMeta+a")
        await attendre(page.getByRole("menu")).toBeVisible()
        await expect(champ).toBeFocused()
        await capturer(page, testInfo, `selection-${nom}`)
        await page.keyboard.press("Escape")
        await expect(page.getByRole("menu")).toHaveCount(0)
        await expect(champ).toBeFocused()

        // La frappe suivante le ferme et remplace le texte ; l'écriture, retenue, laisse lire « Enregistrement… ».
        let relacher = () => {}
        const retenue = new Promise<void>((resolve) => (relacher = resolve))
        // La seule écriture du bloc est retenue ; la publication qui la suit passe.
        await page.route(
          "**/api/platform/nodes",
          async (route) => {
            await retenue
            await route.continue()
          },
          { times: 1 },
        )
        await page.keyboard.press("ControlOrMeta+a")
        await attendre(page.getByRole("menu")).toBeVisible()
        const horodatage = new Date().toISOString().slice(11, 19)
        await page.keyboard.type(`Voir [[${CHEMINS.procedure}]] et https://www.exemple.fr/tarifs/2026 ${horodatage}.`)
        await expect(page.getByRole("menu")).toHaveCount(0)
        await page.keyboard.press("Escape")
        const enCours = statut(page, "Enregistrement…")
        await attendre(enCours).toBeVisible()
        // AC-1 : en haut à droite de la carte du document, et aucun bloc n'a bougé.
        const carte = await boite(page.locator(".oto-island").filter({ has: enCours }))
        const indication = await boite(enCours)
        expect(indication.y - carte.y).toBeLessThan(24)
        expect(carte.x + carte.width - (indication.x + indication.width)).toBeLessThan(32)
        expect(await hautDuPremierBloc(page)).toBe(avant)
        await capturer(page, testInfo, `enregistrement-${nom}`)
        relacher()
        await attendre(statut(page, "Enregistré.")).toBeVisible()
        expect(await hautDuPremierBloc(page)).toBe(avant)

        // AC-26, AC-27 : publiée seule puis relue, la page citée se lit par son titre, l'adresse par son domaine.
        const rendu = page.locator(".oto-block-rendu").filter({ hasText: horodatage })
        await attendre(rendu.getByRole("link", { name: new RegExp(`^${PROCEDURE}`) })).toHaveAttribute("href", `/n/${CHEMINS.procedure}`)
        await expect(rendu.getByRole("link", { name: "exemple.fr" })).toHaveAttribute("href", "https://www.exemple.fr/tarifs/2026")
        await expect(rendu).not.toContainText("[[")
        await capturer(page, testInfo, `liens-${nom}`)

        // AC-2 : l'indication se tait (5 s après la dernière écriture) ; rien n'a bougé.
        await attendre(statut(page, /Enregistr/)).toHaveCount(0)
        expect(await hautDuPremierBloc(page)).toBe(avant)

        // AC-30 : plus de marge droite aux blocs ; à 1 280 px, la colonne du document fait 830 px.
        const rangee = await boite(page.locator(".oto-block-row").first())
        const ilot = await boite(page.locator(".oto-island").filter({ has: page.locator(".oto-block-row") }))
        expect(ilot.x + ilot.width - (rangee.x + rangee.width)).toBeLessThan(24)
        if (largeur === 1_280) expect(Math.round((await boite(page.locator('.oto-content-max[data-width="document"]'))).width)).toBe(830)
        await capturer(page, testInfo, `page-${nom}`)

        // AC-17 : le titre d'un Contexte est composé, jamais écrit en place.
        await page.goto(`${ESPACE.adresse}/n/contexte`)
        await attendre(page.getByRole("heading", { level: 1 })).toHaveText("Contexte · Tout le monde")
        await expect(page.getByRole("textbox", { name: "Titre", exact: true })).toHaveCount(0)
        await capturer(page, testInfo, `contexte-${nom}`)
        await context.close()
      })
    }
  }
})
