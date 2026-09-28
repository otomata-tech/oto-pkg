// Le clavier d'un champ de l'éditeur (E05-S02 ; E05-S08, AC3) : Entrée scinde ou sort d'une liste,
// ⇧Entrée passe à la ligne, ⌥↑ / ⌥↓ déplacent, Retour arrière au début et Suppr à la fin fusionnent, Échap
// envoie le texte et porte le focus sur la poignée, ⌘S l'envoie sans quitter le champ. Ce qui n'est pas
// intercepté reste au `<textarea>` (sélection, annulation). Sans lui, `actions.ts` dépasserait les 300
// lignes d'ESLint (`coding-standards.md § Complexité`).
//
// Porté d'oto-frontend (`components/editor/block-editor.tsx`, `useClavier`). Repris : les touches et leurs
// conditions (sortie de liste sur une dernière ligne vide, rien avant le premier bloc), Échap vers la
// poignée. Retiré : l'enregistrement différé du corps entier, relancé par chaque touche.
import type { KeyboardEvent } from "react"
import type { EtatDeLEditeur } from "./actions"
import * as modeleDEdition from "./modele"
import { formeDe, FORMES_EN_LIGNES } from "./modele"

export type Clavier = { envoyerLeTexte: (cle: string) => boolean; fondre: (cle: string) => void; deplacer: (cle: string, pas: -1 | 1) => void }

/**
 * Entrée d'un Texte ou d'un titre : scinder au curseur, un titre donnant un Texte (AC3). Scinder part tout
 * de suite, le texte d'avant puis celui d'après s'il n'est pas vide (HN-E05S08-10) ; le focus va au bloc
 * d'après, sauf quand le contrôle refuse le texte d'avant. Dans une liste (à puces, numérotée, à cocher) ou
 * du code, Entrée ajoute une ligne, et Entrée sur la dernière ligne vide en sort (E05-S10, AC-a2). Sur un
 * bloc vide, Entrée en ouvre un autre, vide lui aussi (E05-S10, AC-a4).
 */
function entree(etat: EtatDeLEditeur, envoyerLeTexte: Clavier["envoyerLeTexte"], cle: string, champ: HTMLTextAreaElement): boolean {
  const { modele, changerModele, setFocus } = etat
  const liste = formeDe(modele.current.find((rangee) => rangee.cle === cle)?.bloc ?? { type: "", data: {} })
  const dansUneListe = liste !== null && FORMES_EN_LIGNES.has(liste)
  const auBout = champ.selectionStart === champ.selectionEnd && champ.selectionStart === champ.value.length
  if (dansUneListe && !(auBout && (champ.value === "" || champ.value.endsWith("\n")))) return false
  const suite = dansUneListe ? modeleDEdition.sortirDeLaListe(modele.current, cle) : modeleDEdition.scinder(modele.current, cle, champ.selectionStart)
  changerModele(suite.modele)
  if (!suite.focus) return true
  const accepte = suite.focus.cle === cle || envoyerLeTexte(cle)
  if (suite.focus.cle !== cle) envoyerLeTexte(suite.focus.cle)
  if (accepte) setFocus(suite.focus)
  return true
}

/**
 * ⌘S envoie sans quitter le champ ; Échap envoie le texte et porte le focus sur la poignée de la rangée,
 * sauf quand le contrôle le refuse (AC2, AC3).
 * `true` : la touche est prise.
 */
export function echapOuEnregistrer(etat: EtatDeLEditeur, envoyerLeTexte: Clavier["envoyerLeTexte"], cle: string, evenement: KeyboardEvent<HTMLElement>): boolean {
  const enregistrer = (evenement.metaKey || evenement.ctrlKey) && evenement.key.toLowerCase() === "s"
  if (!enregistrer && evenement.key !== "Escape") return false
  evenement.preventDefault()
  if (envoyerLeTexte(cle) && !enregistrer) etat.setFocus({ cle, curseur: null, cible: "rangee" })
  return true
}

/** Le clavier d'un champ (AC3) ; ce qui n'est pas intercepté reste au `<textarea>`. */
export function clavier(etat: EtatDeLEditeur, actions: Clavier) {
  return (cle: string, evenement: KeyboardEvent<HTMLTextAreaElement>) => {
    if (echapOuEnregistrer(etat, actions.envoyerLeTexte, cle, evenement)) return
    // Pendant un conflit, les champs sont en lecture seule : ni scission, ni fusion, ni déplacement (HN-E05S08-3).
    if (etat.envois.conflit) return
    const champ = evenement.currentTarget
    const { selectionStart: debut, selectionEnd: fin } = champ
    const forme = formeDe(etat.modele.current.find((rangee) => rangee.cle === cle)?.bloc ?? { type: "", data: {} })
    const rang = etat.modele.current.findIndex((rangee) => rangee.cle === cle)
    const intercepter = (geste: () => unknown) => {
      evenement.preventDefault()
      geste()
    }
    if (evenement.key === "Enter" && !evenement.shiftKey) return entree(etat, actions.envoyerLeTexte, cle, champ) ? evenement.preventDefault() : undefined
    if (evenement.key === "Enter" && forme === "titre") return evenement.preventDefault()
    if (evenement.altKey && (evenement.key === "ArrowUp" || evenement.key === "ArrowDown")) return intercepter(() => actions.deplacer(cle, evenement.key === "ArrowUp" ? -1 : 1))
    if (evenement.key === "Backspace" && debut === 0 && fin === 0 && rang > 0) return intercepter(() => actions.fondre(cle))
    const suivante = etat.modele.current[rang + 1]
    if (evenement.key === "Delete" && debut === fin && fin === champ.value.length && suivante) return intercepter(() => actions.fondre(suivante.cle))
  }
}
