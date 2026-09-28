import { execFile } from "child_process"
import path from "path"
import { promisify } from "util"
import type { FullConfig } from "@playwright/test"
import { hex, supabaseConfigured } from "../../helpers/plateforme"
import { avecLaBase, baseAdminConfiguree } from "./base"

// Le `globalSetup` de `playwright.config.ts` (E05-S13, lot E, AC-27) : chaque campagne crée son organisation
// jetable `t<hex>`, semée par les sections de `scripts/demo/` (`pnpm demo:seed --slug t<hex>` : le compte E2E
// l'administre et mène Ventes, `t<hex>.localhost` la sert), et la rend à la fonction de rangement, que
// Playwright joue en fin de campagne, échecs compris. Le script tourne dans un processus à lui : il charge
// `scripts/lib/env.mjs`, que le chargeur de Playwright refuse (`testing-strategy.md § Anti-patterns`). Une
// campagne interrompue laisse son organisation à `pnpm test:cleanup --delete` (slug et préfixe `t` + 8
// chiffres hexadécimaux, plus de 2 h). Deux campagnes simultanées ont chacune la sienne. Aucune valeur
// secrète n'est imprimée : le script masque les siennes.

const RACINE = path.resolve(__dirname, "../../..")
const lancer = promisify(execFile)
// Le semis publie une vingtaine de contenus sur le projet partagé : bien plus que les 60 s d'un lancement
// synchrone (`testing-strategy.md § Anti-patterns`), d'où `execFile` promis et ce délai.
const DELAI_DU_SEMIS = 300_000

/**
 * Supprime l'organisation de la campagne (cascade), seulement si elle porte encore la marque des tests et de la
 * démo ; rend le nombre d'organisations supprimées (0 ou 1).
 */
async function supprimer(slug: string): Promise<number> {
  const supprimees = await avecLaBase((sql) => sql`delete from platform.orgs where slug = ${slug} and prefix = ${slug} and settings ->> 'demo' = 'true' returning id`)
  return supprimees.length
}

/** La consigne d'une organisation que la campagne n'a pas pu supprimer. */
const laissee = (slug: string) => `organisation ${slug} left behind: pnpm test:cleanup --delete`

/** Le rangement de fin de campagne : une organisation qui n'est plus là, ou plus marquée, se signale au lieu de passer. */
async function ranger(slug: string): Promise<void> {
  if ((await supprimer(slug)) === 0) throw new Error(`campaign teardown deleted nothing: ${laissee(slug)}`)
}

export default async function campagne(config: FullConfig): Promise<() => Promise<void>> {
  const base = new URL(config.projects[0]?.use.baseURL ?? "http://localhost:3000")
  process.env.E2E_DEMO_ADRESSE = base.origin
  const variables = Boolean(process.env.E2E_USER_EMAIL && process.env.E2E_USER_PASSWORD) && supabaseConfigured && baseAdminConfiguree
  // Sans variables, rien n'est semé : les specs qui en ont besoin se sautent (`ESPACE.semee`).
  if (!variables) return async () => {}

  const slug = `t${hex(4)}`
  try {
    await lancer(process.execPath, [path.join(RACINE, "scripts/demo-seed.mjs"), "--slug", slug], { cwd: RACINE, timeout: DELAI_DU_SEMIS })
    const [org] = await avecLaBase((sql) => sql<{ name: string }[]>`select name from platform.orgs where slug = ${slug}`)
    if (!org) throw new Error(`organisation ${slug} absente après le semis`)
    const adresse = new URL(base.origin)
    adresse.hostname = `${slug}.localhost`
    process.env.E2E_ESPACE_SLUG = slug
    process.env.E2E_ESPACE_NOM = org.name
    process.env.E2E_ESPACE_ADRESSE = adresse.origin
  } catch (erreur) {
    // Un semis à moitié fait part aussi (rien à supprimer si le script a échoué avant de créer l'organisation) ;
    // l'échec d'origine suit, avec la sortie d'erreur du script (masquée par lui), et celui de la suppression s'il y en a un.
    const nettoyage = await supprimer(slug).then(
      () => "",
      (echec: unknown) => ` (cleanup failed: ${echec instanceof Error ? echec.message : String(echec)}; ${laissee(slug)})`,
    )
    const sortie = erreur instanceof Error && "stderr" in erreur ? erreur.stderr : undefined
    throw new Error(`campaign seed failed for ${slug}: ${typeof sortie === "string" && sortie ? sortie.trim() : erreur instanceof Error ? erreur.message : String(erreur)}${nettoyage}`)
  }
  return () => ranger(slug)
}
