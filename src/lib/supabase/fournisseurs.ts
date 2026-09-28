// Fournisseurs de connexion activés sur le projet Supabase (E09-S03, HN-E09S03-1). La page de
// connexion n'affiche que leurs boutons : un bouton de fournisseur que JB n'a pas activé mènerait à
// la page d'erreur JSON du serveur d'auth (« provider is not enabled »).

export type FournisseursActives = { google: boolean; azure: boolean }

const AUCUN: FournisseursActives = { google: false, azure: false }

// Réglages publics (clé anon) qui changent rarement : relus au plus toutes les 5 minutes
// (`api-patterns.md § Caching & Revalidation`).
const RELECTURE_SECONDES = 300

/**
 * Lit `GET /auth/v1/settings` (README de supabase/auth). Un fournisseur n'est actif que si
 * `external.<nom>` vaut exactement `true` ; une panne masque les deux boutons et se journalise.
 */
export async function fournisseursActives(): Promise<FournisseursActives> {
  try {
    const reponse = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "" },
      next: { revalidate: RELECTURE_SECONDES },
    })
    if (!reponse.ok) {
      console.error("fournisseursActives : réponse", reponse.status)
      return AUCUN
    }
    // Seuls ces deux champs servent ; toute autre forme vaut « non activé ».
    const reglages: { external?: { google?: unknown; azure?: unknown } } | null = await reponse.json()
    return { google: reglages?.external?.google === true, azure: reglages?.external?.azure === true }
  } catch (error) {
    console.error("fournisseursActives : lecture impossible", error)
    return AUCUN
  }
}
