// Les données de l'image de partage d'une adresse (E11-S21) : lues sans session, pour un robot d'aperçu (Slack,
// WhatsApp, LinkedIn…) qui n'est pas la personne. L'organisation de l'adresse (`org_by_host` sous `anon`, comme la page
// de connexion) et, pour un lien public, le titre et le résumé que `readPublicNode` sert : rien de plus que ce que le
// lien donne (ADR-013 § 3). Ne lève jamais : une image se dessine toujours, au pire générique. Sans ce module, chaque
// hôte recomposerait ces lectures et leurs replis.
import type { ShareImageData } from "../schemas"
import { readBrand } from "./brand"
import { createAnonPlatformDb } from "./db"
import { isPlatformError } from "./errors"
import { resolveOrg } from "./identity"
import { readPublicNode } from "./shares"
import { fetchSource } from "./uploads-fetch"

/** Le logo attendu au plus : un robot d'aperçu n'attend pas, l'initiale le remplace. */
const LOGO_TIMEOUT_MS = 3_000

/** Ce que le moteur d'image (Satori) décode sûrement ; un autre type : l'initiale (HN-E11S21-4). */
const LOGO_TYPES: ReadonlySet<string> = new Set(["image/png", "image/jpeg"])

/**
 * Le logo en adresse `data:`, téléchargé par `fetchSource` (https, 443, adresses privées refusées, 1 Mo) ; `null`
 * pour un échec ou un type que l'image ne décode pas.
 */
export async function logoDataUrl(url: string | null): Promise<string | null> {
  if (url === null) return null
  const fetched = await fetchSource(url, { timeoutMs: LOGO_TIMEOUT_MS })
  if ("failure" in fetched) return null
  const type = (fetched.type ?? "").split(";")[0].trim().toLowerCase()
  if (!LOGO_TYPES.has(type)) return null
  return `data:${type};base64,${Buffer.from(fetched.bytes).toString("base64")}`
}

async function orgOf(host: string | null): Promise<ShareImageData["org"]> {
  try {
    const brand = readBrand(await resolveOrg(createAnonPlatformDb(), host))
    return { name: brand.displayName, theme: brand.theme, logo: await logoDataUrl(brand.logoUrl) }
  } catch (error) {
    // Une adresse sans organisation n'est pas une panne : l'image dit « Oto ».
    if (!isPlatformError(error) || error.code !== "unknown_org") console.error("[platform] share image: organisation unreadable", error)
    return null
  }
}

async function pageOf(host: string | null, link: { token: string; path: string | null }): Promise<ShareImageData["page"]> {
  try {
    const { node } = await readPublicNode(host, link.token, link.path)
    return { title: node.title, summary: node.summary }
  } catch (error) {
    // Un lien inconnu, révoqué ou hors de portée : l'image générique, sans dire lequel (ADR-013 § 4).
    if (!isPlatformError(error) || error.code !== "not_found") console.error("[platform] share image: public link unreadable", isPlatformError(error) ? error.code : error)
    return null
  }
}

/**
 * L'image de partage de l'adresse `host` : l'organisation seule, ou, avec `link`, le contenu que ce lien public sert
 * (`path` : un contenu dessous). Sans `link`, aucun nœud n'est lu : l'image d'une adresse privée ne porte jamais un
 * titre (HN-E11S21-2).
 */
export async function shareImageData(host: string | null, link?: { token: string; path: string | null }): Promise<ShareImageData> {
  const [org, page] = await Promise.all([orgOf(host), link ? pageOf(host, link) : null])
  return { org, page }
}
