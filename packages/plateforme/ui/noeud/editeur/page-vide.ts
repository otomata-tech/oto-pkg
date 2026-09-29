// Le Texte d'une page vide (E11-S05, AC-g1, HN-E11S05-19) : une page servie sans bloc s'écrit dans un Texte vide, créé
// sur le poste, qui porte l'invite et ne part qu'une fois tapé. Sans lui, une page vide n'aurait ni rangée ni champ
// où écrire. Hors de `modele.ts`, qui est à sa borne de lignes (`max-lines`).
import type { BlockView } from "../../../schemas"
import { formeDe, insererEnTete, rangeesDepuis, texteDe, type Rangee } from "./modele"

/**
 * La clé du Texte d'une page servie sans bloc : fixe, parce qu'elle est rendue par le serveur puis hydratée (le
 * compteur des rangées neuves vivrait d'une requête à l'autre, `portage-ecrans.md § 2`) ; seule rangée du modèle.
 */
const CLE_DE_LA_PAGE_VIDE = "page-vide"

/** Le seul Texte, vide et jamais parti, d'une page vide : il porte l'invite, et une relecture le remplace. */
export function estLaPageVide(modele: readonly Rangee[]): boolean {
  const [seule] = modele
  return modele.length === 1 && seule.bloc.id === undefined && formeDe(seule.bloc) === "texte" && texteDe(seule.bloc) === ""
}

/**
 * Le modèle d'une page : les rangées des blocs servis, ou, sans bloc, le Texte vide ; une relecture qui ne sert
 * toujours aucun bloc garde le Texte déjà là.
 */
export function modeleDeLaPage(blocs: readonly BlockView[], precedentes: readonly Rangee[] = []): Rangee[] {
  if (blocs.length > 0) return rangeesDepuis(blocs, precedentes)
  if (estLaPageVide(precedentes)) return [...precedentes]
  const [texte] = insererEnTete([]).modele
  return [{ cle: CLE_DE_LA_PAGE_VIDE, bloc: texte.bloc }]
}
