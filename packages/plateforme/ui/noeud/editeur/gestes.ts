"use client"

// Les gestes de l'éditeur, servis à ses rangées par un contexte (E05-S02, AC22) : une rangée reçoit
// des données, jamais une fonction (`portage-ecrans.md § 2`), et lit ici ce que font ses boutons, son
// champ et son clavier. Sans lui, chaque rangée recevrait une douzaine de rappels en props.
import { createContext, useContext, type FocusEvent, type KeyboardEvent } from "react"
import type { PoigneeGlissee } from "./glisser"
import type { Forme, Retiree } from "./modele"

export type Gestes = {
  /** La poignée (« Actions sur ce bloc ») se glisse-dépose (E05-S10, AC-a3) ; son clic ouvre le menu du bloc. */
  poignee: PoigneeGlissee
  /** « Dupliquer » (E05-S10, AC-a2) : le même bloc juste après, qui part tout de suite. */
  dupliquer: (cle: string) => void
  /** Une case d'une liste à cocher, cochée ou décochée ; l'état part tout de suite (E05-S10, AC-a2). */
  basculerLaCase: (cle: string, ligne: number) => void
  /** « @ » (E05-S10, AC-a9) : le texte où le lien vient d'être inséré, et le curseur après lui. */
  citer: (cle: string, texte: string, curseur: number) => void
  inserer: (cle: string) => void
  insererEnTete: () => void
  saisir: (cle: string, texte: string) => void
  toucher: (cle: string, evenement: KeyboardEvent<HTMLTextAreaElement>) => void
  /** Le focus quitte un champ : son texte part (E05-S08, AC2). */
  quitterLeChamp: (cle: string, evenement: FocusEvent<HTMLElement>) => void
  /** Le focus quitte la rangée : un bloc vidé part en `delete_block` ; un bloc neuf vide reste (E05-S10, AC-a4). */
  quitterLaRangee: (cle: string, evenement: FocusEvent<HTMLElement>) => void
  /** Un appui du pointeur dans la rangée : la sortie de focus qui le suit n'en est pas une (Safari et Firefox macOS, M30). */
  appuyerDansLaRangee: (cle: string) => void
  /** Un champ en lecture seule pendant un conflit reçoit le focus : « Réglez d'abord le bloc en conflit. » (HN-E05S08-3). */
  annoncerLeConflit: () => void
  changerDeForme: (cle: string, forme: Forme) => void
  deplacer: (cle: string, pas: -1 | 1) => void
  supprimer: (cle: string) => void
  annulerLesModifications: (cle: string) => void
  /** Le texte final d'un bloc en conflit, envoyé sur la version enregistrée (AC15). */
  enregistrerLeTexteFinal: (texte: string) => void
  reinsererMonTexte: () => void
  abandonnerMonTexte: () => void
  /** « Réessayer » : la file repart de l'écriture refusée (AC15, AC18). */
  relancer: () => void
  /** « Annuler » d'une suppression (AC12). */
  retablir: (retiree: Retiree) => void
  /** Les dix secondes d'« Annuler » sont passées. */
  oublierLAnnonce: () => void
  /** La sélection d'un champ a changé : `totale`, elle couvre tout son texte non vide, le menu de sa poignée s'ouvre (E05-S11, AC-28). */
  selectionner: (cle: string, totale: boolean) => void
  /** Le menu ouvert par une sélection se ferme : Échap, la frappe suivante, un clic ailleurs (AC-28). */
  fermerLeMenu: () => void
}

export const ContexteDesGestes = createContext<Gestes | null>(null)

export function useGestes(): Gestes {
  const gestes = useContext(ContexteDesGestes)
  if (!gestes) throw new Error("useGestes : rangée montée hors de l'éditeur de blocs.")
  return gestes
}
