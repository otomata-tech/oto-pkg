import { avecLaBase } from "./base"

// L'organisation jetable de la campagne (E05-S13, lot E : AC-27, AC-28) : posée par `campagne.ts` (le
// `globalSetup` de `playwright.config.ts`), semée par les sections de `scripts/demo/`, servie à
// `t<hex>.localhost`, supprimée en fin de campagne. Les specs n'en lisent que ce que cette fixture leur donne :
// l'adresse, le slug, le nom, et les chemins et l'équipe que les sections sèment. Démo (servie à `localhost`)
// ne garde que l'organisation et le compte (D127 d) : seules les specs de l'authentification, du consentement
// et du branchement y vont. Les adresses viennent de l'environnement, que `campagne.ts` pose avant le
// lancement des workers, au port de `playwright.config.ts`.

const slug = process.env.E2E_ESPACE_SLUG ?? ""

/** L'organisation de la campagne ; `semee` est faux quand la campagne n'a pas pu la poser (variables absentes). */
export const ESPACE = {
  semee: slug !== "",
  slug,
  nom: process.env.E2E_ESPACE_NOM ?? "",
  adresse: process.env.E2E_ESPACE_ADRESSE ?? "",
}

/** Raison du saut d'une spec qui ouvre l'organisation de la campagne, sans aucune valeur. */
export const SANS_ESPACE =
  "the campaign's throwaway organisation is not seeded: set E2E_USER_EMAIL, E2E_USER_PASSWORD, the Supabase variables and PLATFORM_ADMIN_DATABASE_URL in .env.local"

/** Démo : l'organisation et le compte E2E, servis à `localhost` (H10), sans contenu ni équipe (D127 d). */
export const DEMO = { adresse: process.env.E2E_DEMO_ADRESSE ?? "http://localhost:3000", nom: "Démo" }

/** L'adresse d'une organisation `t<hex>` servie à `<slug>.localhost`, au port de la campagne. */
export function adresseDeLHote(slugDeLHote: string): string {
  const adresse = new URL(DEMO.adresse)
  adresse.hostname = `${slugDeLHote}.localhost`
  return adresse.origin
}

/** L'équipe que le compte E2E mène (section `identite`) et l'autre équipe semée. */
export const EQUIPE = { slug: "ventes", nom: "Ventes" }
export const AUTRE_EQUIPE = { slug: "support", nom: "Support" }

/** Les contenus semés que les specs ouvrent (sections `contenu`, `tableau`, `procedure` ; `scripts/lib/pilot-qualification.mjs`). */
export const CHEMINS = {
  contexteDeLEquipe: `${EQUIPE.slug}/contexte`,
  procedure: `${EQUIPE.slug}/qualifier_prospects`,
  tableau: `${EQUIPE.slug}/suivi_prospects`,
  pageDeLaVue: `${EQUIPE.slug}/prospects_valbrune`,
  grilleTarifaire: "conseil/grille_tarifaire",
} as const

/** Le titre de la procédure semée. */
export const PROCEDURE = "Qualifier les prospects"

/** L'id de l'organisation de la campagne, par la connexion d'administration. */
export async function idDeLEspace(): Promise<string> {
  const [org] = await avecLaBase((sql) => sql<{ id: string }[]>`select id from platform.orgs where slug = ${ESPACE.slug}`)
  if (!org) throw new Error("campaign organisation not found")
  return org.id
}
