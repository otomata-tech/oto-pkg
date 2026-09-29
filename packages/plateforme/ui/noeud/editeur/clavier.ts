// Le clavier d'un champ de l'éditeur (E05-S02 ; E05-S08, AC3) : Entrée scinde ou sort d'une liste,
// ⇧Entrée passe à la ligne, ⌥↑ / ⌥↓ déplacent, Retour arrière au début et Suppr à la fin fusionnent, Échap
// envoie le texte et porte le focus sur la poignée, ⌘S l'envoie sans quitter le champ. Ce qui n'est pas
// intercepté reste au `<textarea>` (sélection, annulation). Sans lui, `actions.ts` dépasserait les 300
// lignes d'ESLint (`coding-standards.md § Complexité`).
//
// Porté d'oto-frontend (`components/editor/block-editor.tsx`, `useClavier`). Repris : les touches et leurs
// conditions (sortie de liste sur une dernière ligne vide, rien avant le premier bloc), Échap vers la
// poignée. Retiré : l'enregistrement différé du corps entier, relancé par chaque touche.
//
// E10-S06 : `Tab` et `Maj+Tab` descendent et remontent la ligne d'une liste à puces ou numérotée (AC-a6) ; les
// champs d'un tableau et d'un repli gardent leurs propres touches, seuls Échap, ⌘S et ⌥↑ / ⌥↓ passent ici.
import type { KeyboardEvent } from "react"
import { NIVEAUX_DE_LISTE } from "../libelles"
import type { EtatDeLEditeur } from "./actions"
import { niveauDeLigne, positionDansLaLigne } from "./blocs-de-page"
import * as modeleDEdition from "./modele"
import { formeDe, FORMES_EN_LIGNES, texteDe, type Forme } from "./modele"
import { MESSAGES_DU_BLOC } from "./operations"

export type Clavier = { envoyerLeTexte: (cle: string) => boolean; fondre: (cle: string) => void; deplacer: (cle: string, pas: -1 | 1) => void }

type Champ = HTMLTextAreaElement | HTMLInputElement

/** Les formes écrites dans leurs propres champs (E10-S06) : ni scission, ni fusion, ni niveau de liste depuis ce clavier. */
const A_CHAMPS_PROPRES: ReadonlySet<Forme> = new Set(["tableau", "repli"])

/**
 * Entrée d'un Texte ou d'un titre : scinder au curseur, un titre donnant un Texte (AC3). Scinder part tout
 * de suite, le texte d'avant puis celui d'après s'il n'est pas vide (HN-E05S08-10) ; le focus va au bloc
 * d'après, sauf quand le contrôle refuse le texte d'avant. Dans une liste (à puces, numérotée, à cocher) ou
 * du code, Entrée ajoute une ligne, et Entrée sur la dernière ligne vide en sort (E05-S10, AC-a2). Sur un
 * bloc vide, Entrée en ouvre un autre, vide lui aussi (E05-S10, AC-a4).
 */
function entree(etat: EtatDeLEditeur, envoyerLeTexte: Clavier["envoyerLeTexte"], cle: string, champ: Champ): boolean {
  const { modele, changerModele, setFocus } = etat
  const liste = formeDe(modele.current.find((rangee) => rangee.cle === cle)?.bloc ?? { type: "", data: {} })
  const dansUneListe = liste !== null && FORMES_EN_LIGNES.has(liste)
  const auBout = champ.selectionStart === champ.selectionEnd && champ.selectionStart === champ.value.length
  if (dansUneListe && !(auBout && (champ.value === "" || champ.value.endsWith("\n")))) return false
  const suite = dansUneListe ? modeleDEdition.sortirDeLaListe(modele.current, cle) : modeleDEdition.scinder(modele.current, cle, champ.selectionStart ?? 0)
  changerModele(suite.modele)
  if (!suite.focus) return true
  const accepte = suite.focus.cle === cle || envoyerLeTexte(cle)
  if (suite.focus.cle !== cle) envoyerLeTexte(suite.focus.cle)
  if (accepte) setFocus(suite.focus)
  return true
}

/**
 * `Tab` ou `Maj+Tab` dans une liste à puces ou numérotée (E10-S06, AC-a6) : la ligne du curseur change de niveau, le
 * curseur reste dans son texte ; un refus ne change rien et s'annonce.
 */
function niveau(etat: EtatDeLEditeur, cle: string, champ: Champ, pas: 1 | -1) {
  const numerotee = formeDe(etat.modele.current.find((rangee) => rangee.cle === cle)?.bloc ?? { type: "", data: {} }) === "numerotee"
  const lu = niveauDeLigne(champ.value, champ.selectionStart ?? 0, pas, numerotee)
  if ("refus" in lu) return etat.envois.annoncer(lu.refus === "troisNiveaux" ? MESSAGES_DU_BLOC.troisNiveaux : NIVEAUX_DE_LISTE[lu.refus])
  const suite = modeleDEdition.ecrireTexte(etat.modele.current, cle, lu.texte)
  etat.changerModele(suite.modele)
  // Le champ se réécrit depuis le modèle (marques renumérotées) : le curseur se place dans la ligne réécrite.
  const bloc = suite.modele.find((rangee) => rangee.cle === cle)?.bloc
  if (bloc) etat.setFocus({ cle, curseur: positionDansLaLigne(texteDe(bloc), lu.ligne, lu.colonne) })
  etat.differer(cle)
  etat.frapper()
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

/** Le clavier d'un champ (AC3) ; ce qui n'est pas intercepté reste au champ. */
export function clavier(etat: EtatDeLEditeur, actions: Clavier) {
  return (cle: string, evenement: KeyboardEvent<Champ>) => {
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
    if (evenement.altKey && (evenement.key === "ArrowUp" || evenement.key === "ArrowDown")) return intercepter(() => actions.deplacer(cle, evenement.key === "ArrowUp" ? -1 : 1))
    if (forme !== null && A_CHAMPS_PROPRES.has(forme)) return
    const tabulation = evenement.key === "Tab" && !evenement.altKey && !evenement.ctrlKey && !evenement.metaKey
    // La liste à cocher n'a pas de sous-niveaux (HN-E10S04-2) : `Tab` y garde son rôle (AC-a6).
    if (tabulation && (forme === "puces" || forme === "numerotee")) return intercepter(() => niveau(etat, cle, champ, evenement.shiftKey ? -1 : 1))
    if (evenement.key === "Enter" && !evenement.shiftKey) return entree(etat, actions.envoyerLeTexte, cle, champ) ? evenement.preventDefault() : undefined
    if (evenement.key === "Enter" && forme === "titre") return evenement.preventDefault()
    if (evenement.key === "Backspace" && debut === 0 && fin === 0 && rang > 0) return intercepter(() => actions.fondre(cle))
    const suivante = etat.modele.current[rang + 1]
    if (evenement.key === "Delete" && debut === fin && fin === champ.value.length && suivante) return intercepter(() => actions.fondre(suivante.cle))
  }
}
