// Client HTTP de l'API du paquet, même origine, avec la session de l'utilisateur (ADR-008 § 4,
// H03). Sans lui, chaque écran à mutation recoderait l'appel et la lecture de l'enveloppe
// `{ data }` / `{ error }` (E05-S03 le réutilise).
import type { FileAvailability } from "../../schemas/files"

type MethodeHttp = "GET" | "POST" | "PATCH" | "DELETE"

/**
 * Le corps le plus lourd qu'une requête `keepalive` porte (64 Kio, norme Fetch) : au-delà, `fetch` échoue sans
 * rien envoyer. Un bloc de 100 000 caractères le dépasse ; il part alors sans `keepalive`, et aboutit tant que la
 * page vit (onglet seulement caché).
 */
const CORPS_KEEPALIVE_MAX_OCTETS = 64 * 1024

/**
 * Une erreur lisible par l'écran : le code de l'API (H04), sa raison, le statut ; `reseau` sans
 * réponse. `details` : ce que le refus précise en plus (E05-S03 : ce qu'une équipe possède encore).
 */
export type ErreurPlateforme = { code: string; raison?: string; statut: number; details?: Readonly<Record<string, unknown>> }

type ReponsePlateforme<T> = { data: T; erreur?: never } | { data?: never; erreur: ErreurPlateforme }

type Enveloppe = {
  data?: unknown
  error?: { code?: unknown; details?: unknown }
}

function estObjet(valeur: unknown): valeur is Record<string, unknown> {
  return typeof valeur === "object" && valeur !== null && !Array.isArray(valeur)
}

function lireEnveloppe(valeur: unknown): Enveloppe {
  return estObjet(valeur) ? valeur : {}
}

export async function appelerPlateforme<T>({
  methode,
  ressource,
  corps,
  keepalive,
}: {
  methode: MethodeHttp
  ressource: string
  corps?: unknown
  /** La requête survit à la fermeture de l'onglet (corps de 64 Kio au plus, sinon sans) : la sortie de la page (E05-S10, AC-a6). */
  keepalive?: boolean
}): Promise<ReponsePlateforme<T>> {
  let reponse: Response
  const body = corps === undefined ? undefined : JSON.stringify(corps)
  const garder = keepalive === true && new TextEncoder().encode(body ?? "").byteLength <= CORPS_KEEPALIVE_MAX_OCTETS
  try {
    reponse = await fetch(`/api/plateforme/${ressource}`, {
      method: methode,
      credentials: "same-origin",
      headers: corps === undefined ? undefined : { "content-type": "application/json" },
      body,
      ...(garder ? { keepalive: true } : {}),
    })
  } catch {
    return { erreur: { code: "reseau", statut: 0 } }
  }
  return lireLaReponse<T>(reponse)
}

/** Une réponse de l'API lue (H04) : `{ data }`, ou l'erreur lisible par l'écran ; partagée par les appels JSON et l'envoi d'un fichier. */
async function lireLaReponse<T>(reponse: Response): Promise<ReponsePlateforme<T>> {
  let enveloppe: Enveloppe
  try {
    enveloppe = lireEnveloppe(await reponse.json())
  } catch {
    return { erreur: { code: "internal", statut: reponse.status } }
  }

  if (reponse.ok && "data" in enveloppe) {
    // L'API rend `{ data }` à la forme du service appelé : l'écran qui appelle déclare laquelle.
    return { data: enveloppe.data as T }
  }
  const code = typeof enveloppe.error?.code === "string" ? enveloppe.error.code : "internal"
  const precisions = enveloppe.error?.details
  const details = estObjet(precisions) ? precisions : undefined
  const raison = details?.reason
  return {
    erreur: { code, raison: typeof raison === "string" ? raison : undefined, statut: reponse.status, ...(details ? { details } : {}) },
  }
}

/**
 * Les octets d'un fichier joint, lus à son adresse de lecture (`GET files/<id>`), qui redirige vers le stockage
 * (E10-S02, AC-b6 : « Convertir en tableau » d'un CSV joint). `null` : refusé, absent, ou le réseau a manqué.
 */
export async function lireUnFichier(adresse: string): Promise<ArrayBuffer | null> {
  try {
    const reponse = await fetch(adresse, { credentials: "same-origin" })
    return reponse.ok ? await reponse.arrayBuffer() : null
  } catch {
    return null
  }
}

/** Les refus qui disent un fichier indisponible : illisible ou absent (`not_found`), stockage retiré (`not_enabled`). */
const INDISPONIBLE = ["not_found", "not_enabled"]

/**
 * Un fichier joint est-il servi (E10-S02, AC-b8, HN-E10S02-43) ? Sa route le dit en JSON (`GET files/<id>?check`),
 * sans redirection : aucun octet ne sort du stockage, aucun CORS n'est en jeu. `false` : l'objet manque, ou le
 * fichier n'est pas lisible ; une panne (réseau, stockage, session) n'en dit rien (`true`), la carte reste telle quelle.
 */
export async function fichierDisponible(id: string): Promise<boolean> {
  const lu = await appelerPlateforme<FileAvailability>({ methode: "GET", ressource: `files/${encodeURIComponent(id)}?check` })
  return lu.erreur ? !INDISPONIBLE.includes(lu.erreur.code) : lu.data.available
}

/**
 * Un fichier déposé par le formulaire de dépôt (E10-S02, AC-f15 ; ADR-018 § 8) : ses octets tels quels, jamais en JSON,
 * à la route à session du ticket (`POST uploads/<jeton>/form`), même origine. `T` : ce que l'envoi a écrit.
 */
export async function deposerParLeLien<T>(jeton: string, fichier: Blob): Promise<ReponsePlateforme<T>> {
  let reponse: Response
  try {
    reponse = await fetch(`/api/plateforme/uploads/${encodeURIComponent(jeton)}/form`, { method: "POST", credentials: "same-origin", body: fichier })
  } catch {
    return { erreur: { code: "reseau", statut: 0 } }
  }
  return lireLaReponse<T>(reponse)
}
