import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test"
import { accountCopy } from "../../scripts/lib/account-copy.mjs"
import { hex, type TestOrg } from "../helpers/plateforme"
import { avecLaBase, clientAuth, donneesJetables, type DonneesJetables } from "./fixtures/base"
import { seConnecter } from "./fixtures/connexion"
import { adresseDeLHote, ESPACE, idDeLEspace, SANS_ESPACE } from "./fixtures/espace"

// Les écrans par l'hôte (E09-S05, AC10) : le compte E2E de `.env.local`, administrateur de l'organisation de la
// campagne A (`espace.ts`, ses équipes semées), est aussi administrateur d'une organisation jetable B servie à
// `t<hex>.localhost`, et n'est pas membre d'une organisation jetable C servie à `t<hex2>.localhost`.
// « Équipes & accès », onglet Équipes, sur chaque hôte (les cookies sont par hôte : une connexion par
// hôte) : les équipes de l'organisation de l'adresse, rien de l'autre ; sur C, l'état non-membre
// d'E02-S01 (AC27). B et C sont posées et retirées par la connexion d'administration, dans ce fichier seulement ;
// `*.localhost` résout vers la machine dans Chromium. Captures dans `test-results/`.

const email = process.env.E2E_USER_EMAIL ?? ""
const password = process.env.E2E_USER_PASSWORD ?? ""

async function ouvrirLesEquipes(browser: Browser, adresse: string): Promise<Page> {
  const page = await browser.newPage()
  await seConnecter(page, { baseURL: adresse, email, password })
  await page.goto(`${adresse}/teams?tab=teams`)
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Équipes & accès")
  return page
}

/** Les noms des équipes d'une organisation, relus par la connexion d'administration. */
async function equipesDe(orgId: string): Promise<string[]> {
  const lues = await avecLaBase((sql) => sql<{ name: string }[]>`select name from platform.teams where org_id = ${orgId}`)
  return lues.map((equipe) => equipe.name).sort()
}

/** Les équipes que montre l'onglet : la première cellule de chaque ligne du tableau des équipes (E05-S09, partie d1). */
async function equipesAffichees(page: Page): Promise<string[]> {
  const tableau = page.getByRole("table", { name: /^Les équipes de / })
  await expect(tableau).toBeVisible()
  const noms = await tableau.locator("tbody tr:not(.oto-table-empty) td:first-child").allTextContents()
  return noms.map((nom) => nom.trim()).sort()
}

async function capturer(page: Page, testInfo: TestInfo, nom: string): Promise<void> {
  await page.screenshot({ path: testInfo.outputPath(`${nom}.png`), fullPage: true })
}

test.describe("isolation by the address", () => {
  test.skip(!ESPACE.semee, SANS_ESPACE)

  let fx: DonneesJetables
  let espace: string
  let b: TestOrg
  let c: TestOrg

  test.beforeAll(async () => {
    const { data, error } = await clientAuth().auth.signInWithPassword({ email, password })
    test.skip(error !== null || !data.user, "E2E account missing from the Supabase project: run pnpm demo:seed (E01-S05)")
    // `test.skip` lève déjà sans compte ; le `if` le dit au type.
    if (!data.user) return
    // Les copies que l'outillage pose dans `members` (E01-S09, AC15), comme `addMember` de `createFixtures`.
    const copie = accountCopy(data.user)
    const compte = { id: data.user.id, email: copie.email ?? email, name: copie.name }
    espace = await idDeLEspace()

    fx = donneesJetables()
    b = await fx.createOrg({ name: `Delta E2E ${hex(2)}`, localhost: true })
    c = await fx.createOrg({ name: `Charlie E2E ${hex(2)}`, localhost: true })
    await fx.addMember(b.id, compte, { role: "admin", profile: { name: "Compte E2E" } })
    await fx.createTeam(b.id, { slug: "livraisons", name: `Livraisons ${hex(2)}` })
    await fx.addMember(c.id, fx.contact(), { role: "admin", profile: { name: "Contact E2E" } })
  })

  test.afterAll(async () => {
    await fx?.cleanup()
  })

  test("should show the teams of the organisation of each address only, and the non-member state on the third", async ({ browser }, testInfo) => {
    // Les équipes affichées sont exactement celles de l'organisation de l'adresse : aucune de l'autre.
    const surA = await ouvrirLesEquipes(browser, ESPACE.adresse)
    expect(await equipesAffichees(surA)).toEqual(await equipesDe(espace))
    await capturer(surA, testInfo, "equipes-a")

    const surB = await ouvrirLesEquipes(browser, adresseDeLHote(b.slug))
    expect(await equipesAffichees(surB)).toEqual(await equipesDe(b.id))
    await capturer(surB, testInfo, "equipes-b")

    const surC = await browser.newPage()
    await seConnecter(surC, { baseURL: adresseDeLHote(c.slug), email, password })
    await expect(surC).toHaveURL(/\/no-organization$/)
    // Le titre de l'état est le `h2` de l'îlot ; le `h1` est le produit (E05-S07, AC10).
    await expect(surC.getByRole("heading", { level: 2 })).toHaveText(`Vous n'êtes pas membre de ${c.name}`)
    await capturer(surC, testInfo, "non-membre-c")
  })
})
