import { headers } from "next/headers"
import { cache } from "react"
import {
  createAnonPlatformDb,
  isPlatformError,
  readBrand,
  requestHost,
  resolveOrg,
} from "@otomata_tech/oto_platform/server"
import type { MarqueDOrganisation } from "@otomata_tech/oto_platform/ui"

// La marque de l'organisation de l'adresse, pour les écrans d'authentification (E05-S07). Elle pose
// le thème de la racine `.oto` : la page l'attend avant son premier octet, dans une borne, pour
// qu'une base lente ne retienne pas l'écran de connexion (HN-E05S07-4). Reprise de la lecture de
// `/login` (E09-S01) : sans ce module, quatre pages recopieraient la lecture et sa conversion.

/** Au-delà, la page se rend au thème par défaut, sans ligne d'organisation. */
export const ATTENTE_DE_LA_MARQUE_MS = 1_000

const LECTURE_IMPOSSIBLE = "marque de l'adresse : lecture impossible, écran rendu sans la marque"
const LECTURE_TROP_LONGUE = `marque de l'adresse : aucune réponse en ${ATTENTE_DE_LA_MARQUE_MS} ms, écran rendu sans la marque`

/** La marque telle que les écrans du paquet la reçoivent ; `readBrand` ne rend jamais un logo non sûr. */
export function marqueDOrganisation(org: { name: string; brand: unknown }): MarqueDOrganisation {
  const { theme, logoUrl, displayName } = readBrand(org)
  return { theme, logo: logoUrl, nomAffiche: displayName }
}

/**
 * Marque de l'organisation de l'adresse, lue sans session (`org_by_host`, seule lecture ouverte à
 * `anon`) ; `null` sans organisation, sur une panne, ou sans réponse en `ATTENTE_DE_LA_MARQUE_MS`.
 * Une fois par requête (`cache`) : le layout racine (métadonnées de partage, E11-S21) et la page la partagent.
 */
export const marqueDeLAdresse = cache(async function marqueDeLAdresse(): Promise<MarqueDOrganisation | null> {
  // Hors de tout `try` : au prérendu, `headers()` lève pour marquer la route dynamique, et ce signal
  // doit atteindre Next (`api-patterns.md § Type de retour standard`).
  const host = requestHost(await headers())
  let minuteur: ReturnType<typeof setTimeout> | undefined
  const delai = new Promise<null>((resolve) => {
    minuteur = setTimeout(() => resolve(null), ATTENTE_DE_LA_MARQUE_MS)
  })
  try {
    // Client anonyme : seule `org_by_host` lui est ouverte, jamais une clé de service.
    const org = await Promise.race([resolveOrg(createAnonPlatformDb(), host), delai])
    if (org === null) {
      console.error(LECTURE_TROP_LONGUE)
      return null
    }
    return marqueDOrganisation(org)
  } catch (error) {
    // Une adresse sans organisation (`127.0.0.1`) n'est pas une panne : rien à journaliser.
    if (!isPlatformError(error) || error.code !== "unknown_org") console.error(LECTURE_IMPOSSIBLE, error)
    return null
  } finally {
    clearTimeout(minuteur)
  }
})
