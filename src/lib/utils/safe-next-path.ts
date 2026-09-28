// Base fictive de l'analyse : un `next` qui reste sur cette origine est un chemin du site.
const BASE = "http://n.invalid"

/**
 * Destination d'un retour de connexion (`next`), lue dans une URL ou un formulaire : seul un chemin
 * du site est accepté, sinon `/`. Le chemin est lu comme le lit un navigateur (analyseur d'URL :
 * tabulations et retours à la ligne retirés, `\` lu `/`, `.` et `..` résolus) : `/\t/hôte` ou
 * `/\hôte`, que les navigateurs lisent `//hôte`, feraient d'un `redirect()` relatif une redirection
 * ouverte. Le chemin rendu est celui de l'analyse ; s'il commence par `//` (`/.//hôte`), il est refusé.
 */
export function safeNextPath(requested: unknown): string {
  if (typeof requested !== "string" || !requested.startsWith("/")) return "/"
  let url: URL
  try {
    url = new URL(requested, BASE)
  } catch {
    // Hôte illisible (`//[`) : ce n'est pas un chemin du site.
    return "/"
  }
  if (url.origin !== BASE || url.pathname.startsWith("//")) return "/"
  return `${url.pathname}${url.search}${url.hash}`
}
