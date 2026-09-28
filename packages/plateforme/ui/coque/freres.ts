// L'ordre des frères dans le rail (E05-S10, partie b2, AC-b9) : où un contenu se range quand on le dépose
// entre deux lignes, ou qu'on le monte ou le descend au clavier. `POST nodes/position` range un nœud juste
// après un frère (`after`), en tête avec `null` ; ces fonctions pures traduisent un geste du rail en ce
// frère. Sans elles, chaque geste recalculerait sa place à sa façon, et un dépôt qui ne change rien
// partirait quand même.
import type { TreeNode } from "../../schemas"

/** Où tombe un contenu glissé sur une ligne : juste avant elle, dedans (son enfant), juste après. */
export type Zone = "avant" | "dans" | "apres"

/** Le parent d'un chemin dans le rail : `a/b` → `a`, `a` → `""` (le haut de l'arbre, sous la racine). */
export const parentDe = (chemin: string) => (chemin.includes("/") ? chemin.slice(0, chemin.lastIndexOf("/")) : "")

/** Les nœuds de l'arbre, chacun avant ses enfants. */
export function aplatir(arbre: readonly TreeNode[]): TreeNode[] {
  return arbre.flatMap((noeud) => [noeud, ...aplatir(noeud.children)])
}

/**
 * Les frères qui se rangent, par parent, dans l'ordre servi (position, puis chemin) : seulement les lignes qui
 * se déplacent. Un Contexte n'en est pas, le rail le montre toujours en tête de sa section (P39) ; la racine,
 * `private`, un espace personnel et le dossier d'une équipe non plus (`immobile`), qui ne sont pas des lignes
 * ou ne changent pas de place.
 */
export function freresParParent(arbre: readonly TreeNode[], immobile: (chemin: string) => boolean): Map<string, string[]> {
  const freres = new Map<string, string[]>()
  for (const noeud of aplatir(arbre)) {
    if (immobile(noeud.path)) continue
    const parent = parentDe(noeud.path)
    freres.set(parent, [...(freres.get(parent) ?? []), noeud.path])
  }
  return freres
}

/** La place d'un rangement : le frère après lequel le nœud se range, `null` en tête. */
export type Place = { after: string | null }

/**
 * La place d'un dépôt avant ou après `cible`, parmi ses frères, le nœud glissé retiré de la liste ; `null`
 * quand le nœud y est déjà (rien ne partirait).
 */
export function placeDuDepot(freres: readonly string[], source: string, cible: string, zone: Exclude<Zone, "dans">): Place | null {
  const sans = freres.filter((frere) => frere !== source)
  const rang = sans.indexOf(cible)
  if (rang === -1) return null
  const after = zone === "apres" ? cible : rang > 0 ? sans[rang - 1] : null
  const actuel = freres.indexOf(source)
  // Le nœud est déjà parmi ces frères, à cette place : le frère qui le précède est celui visé.
  if (actuel !== -1 && (actuel === 0 ? null : freres[actuel - 1]) === after) return null
  return { after }
}

/** La place d'un nœud monté (`-1`) ou descendu (`+1`) d'un cran parmi ses frères ; `null` au bout de la liste. */
export function placeDuPas(freres: readonly string[], chemin: string, pas: -1 | 1): Place | null {
  const rang = freres.indexOf(chemin)
  if (rang === -1) return null
  if (pas === -1) return rang === 0 ? null : { after: rang >= 2 ? freres[rang - 2] : null }
  return rang === freres.length - 1 ? null : { after: freres[rang + 1] }
}

/**
 * La zone d'une ligne sous le pointeur, de la fraction de sa hauteur (0 en haut) : le quart haut range avant,
 * le quart bas après, le milieu dépose dedans. Une branche dépliée n'a pas de « après » : ses enfants la
 * suivent à l'écran, le bas de sa ligne est l'entrée de sa liste. Une ligne sans hauteur (rendu sans mise en
 * page) reçoit dedans.
 */
export function zoneDuPointeur(fraction: number, brancheDepliee: boolean): Zone {
  if (!Number.isFinite(fraction)) return "dans"
  if (fraction < 0.25) return "avant"
  if (fraction > 0.75 && !brancheDepliee) return "apres"
  return "dans"
}
