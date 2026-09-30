"use client"

// Un tableau simple dans l'éditeur (E10-S06, AC-b1, AC-b2) : une grille de champs d'une ligne, l'en-tête d'abord,
// chaque cellule nommée par son en-tête. `Tab` et `Maj+Tab` passent à la cellule suivante ou précédente, `Tab` dans la
// dernière ajoute une rangée, `Entrée` descend d'une cellule ; Échap, ⌘S et ⌥↑ / ⌥↓ sont ceux de tout bloc
// (`clavier.ts`). Le tableau part en un seul bloc quand le focus le quitte, sur ⌘S ou 1 200 ms après la dernière
// frappe, comme un Texte (HN-E10S06-4) ; le menu de sa poignée ajoute, retire et aligne à la cellule courante, que
// la rangée tient. Sans lui, un tableau simple ne s'écrit que par un assistant.
//
// Écrit dans le style d'oto-frontend, qui n'a pas de tableau éditable : les classes du rendu d'E10-S04
// (`oto-table-wrap`, `oto-table`), un `Input` du design system par cellule.
//
// E11-S15 (AC-b1) : le tableau simple (`data-simple`, `editeur.css`) a son en-tête sur le fond teinté du primary, et la
// bordure d'une cellule n'y paraît qu'au survol de la cellule ou au focus de son champ.
import { useLayoutEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from "react"
import { simpleTableOf } from "../../../schemas/blocks"
import type { MenuItem } from "../../ds/react/overlays"
import { Input } from "../../ds/react/forms"
import { TABLEAU_EDITE } from "../libelles"
import {
  ajouterColonne,
  ajouterRangee,
  aligner,
  avecTableau,
  celluleVoisine,
  ecrireCellule,
  retirerColonne,
  retirerRangee,
  type Alignement,
  type Borne,
  type Position,
  type Tableau,
} from "./blocs-de-page"
import { useGestes, type Gestes } from "./gestes"
import type { BlocEdite } from "./modele"
import { MESSAGES_DU_BLOC } from "./operations"

/** Le texte d'une cellule suit l'alignement de sa colonne, comme à la lecture. */
const CLASSE_D_ALIGNEMENT: Record<Exclude<Alignement, null>, string> = { left: "text-start", center: "text-center", right: "text-end" }

/** La cellule courante, ramenée dans le tableau (une rangée ou une colonne a pu partir). */
function dansLeTableau(tableau: Tableau, { ligne, colonne }: Position): Position {
  return { ligne: Math.min(ligne, tableau.rows.length), colonne: Math.min(colonne, tableau.columns.length - 1) }
}

/** Le nom d'une cellule (AC-b1) : l'en-tête de sa colonne, ou son rang s'il est vide, puis sa rangée. */
function nomDeCellule(tableau: Tableau, { ligne, colonne }: Position): string {
  if (ligne === 0) return TABLEAU_EDITE.enTete(colonne + 1)
  const enTete = tableau.columns[colonne]?.trim() || TABLEAU_EDITE.colonne(colonne + 1)
  return TABLEAU_EDITE.cellule(enTete, ligne)
}

/** Le tableau changé, reposé dans le bloc, ou la borne dite (AC-b1) ; `true` s'il a changé. */
function ecrire(gestes: Gestes, cle: string, bloc: BlocEdite, suivant: Tableau | Borne): boolean {
  if ("borne" in suivant) {
    gestes.annoncer(MESSAGES_DU_BLOC[suivant.borne])
    return false
  }
  gestes.modifierLeBloc(cle, { ...bloc, data: avecTableau(bloc.data, suivant) })
  return true
}

/**
 * Le menu de la poignée d'un tableau (AC-b2) : une rangée ou une colonne après la cellule courante, retirer sa rangée
 * (jamais l'en-tête) ou sa colonne (jamais la dernière), l'alignement de sa colonne.
 */
export function itemsDuTableau(cle: string, bloc: BlocEdite, courante: Position, gestes: Gestes): MenuItem[] {
  const tableau = simpleTableOf(bloc.data)
  const { ligne, colonne } = dansLeTableau(tableau, courante)
  const alignement = tableau.align?.[colonne] ?? null
  const alignements: [Alignement, string][] = [
    [null, TABLEAU_EDITE.alignements.aucun],
    ["left", TABLEAU_EDITE.alignements.left],
    ["center", TABLEAU_EDITE.alignements.center],
    ["right", TABLEAU_EDITE.alignements.right],
  ]
  return [
    { group: TABLEAU_EDITE.tableau },
    { label: TABLEAU_EDITE.ajouterRangee, onSelect: () => ecrire(gestes, cle, bloc, ajouterRangee(tableau, ligne)) },
    { label: TABLEAU_EDITE.ajouterColonne, onSelect: () => ecrire(gestes, cle, bloc, ajouterColonne(tableau, colonne)) },
    { label: TABLEAU_EDITE.retirerRangee, disabled: ligne === 0, onSelect: () => ecrire(gestes, cle, bloc, retirerRangee(tableau, ligne)) },
    { label: TABLEAU_EDITE.retirerColonne, disabled: tableau.columns.length <= 1, onSelect: () => ecrire(gestes, cle, bloc, retirerColonne(tableau, colonne)) },
    { group: TABLEAU_EDITE.alignement },
    ...alignements.map(([valeur, label]) => ({ label, radio: true, checked: valeur === alignement, onSelect: () => ecrire(gestes, cle, bloc, aligner(tableau, colonne, valeur)) })),
  ]
}

type CelluleProps = {
  tableau: Tableau
  position: Position
  decritPar?: string
  lectureSeule: boolean
  surFrappe: (position: Position, texte: string) => void
  surTouche: (position: Position, evenement: KeyboardEvent<HTMLInputElement>) => void
  surFocus: (position: Position) => void
  surSortie: (evenement: FocusEvent<HTMLElement>) => void
}

function Cellule({ tableau, position, decritPar, lectureSeule, surFrappe, surTouche, surFocus, surSortie }: CelluleProps) {
  const { ligne, colonne } = position
  const alignement = tableau.align?.[colonne] ?? null
  const texte = ligne === 0 ? tableau.columns[colonne] : (tableau.rows[ligne - 1]?.[colonne] ?? "")
  return (
    <Input
      size="sm"
      data-champ=""
      data-cellule={`${ligne}-${colonne}`}
      aria-label={nomDeCellule(tableau, position)}
      aria-describedby={decritPar}
      readOnly={lectureSeule}
      value={texte}
      className={alignement ? CLASSE_D_ALIGNEMENT[alignement] : undefined}
      onChange={(evenement) => surFrappe(position, evenement.target.value)}
      onKeyDown={(evenement) => surTouche(position, evenement)}
      onFocus={() => surFocus(position)}
      onBlur={surSortie}
    />
  )
}

type LignesProps = Omit<CelluleProps, "position">

/** L'en-tête, une cellule par colonne. */
function EnTetes(props: LignesProps) {
  return props.tableau.columns.map((_, colonne) => (
    // Une cellule n'a pas d'identité : son rang, dans un tableau qui a la sienne.
    <th key={colonne} scope="col">
      <Cellule {...props} position={{ ligne: 0, colonne }} />
    </th>
  ))
}

/** Les rangées, une cellule par colonne. */
function Rangees(props: LignesProps) {
  return props.tableau.rows.map((_, rang) => (
    <tr key={rang}>
      {props.tableau.columns.map((__, colonne) => (
        <td key={colonne}>
          <Cellule {...props} position={{ ligne: rang + 1, colonne }} />
        </td>
      ))}
    </tr>
  ))
}

type TableauEditeProps = {
  cle: string
  bloc: BlocEdite
  decritPar?: string
  lectureSeule: boolean
  /** La cellule qui a eu le focus en dernier : le menu de la poignée y ajoute et y retire (AC-b2). */
  suivre: (position: Position) => void
}

export function TableauEdite({ cle, bloc, decritPar, lectureSeule, suivre }: TableauEditeProps) {
  const gestes = useGestes()
  const grille = useRef<HTMLTableElement>(null)
  const [aFocaliser, setAFocaliser] = useState<Position | null>(null)
  const tableau = simpleTableOf(bloc.data)

  // La cellule où va le focus après `Tab`, `Entrée` ou une rangée ajoutée, une fois la grille rendue.
  useLayoutEffect(() => {
    if (!aFocaliser) return
    setAFocaliser(null)
    grille.current?.querySelector<HTMLInputElement>(`[data-cellule="${aFocaliser.ligne}-${aFocaliser.colonne}"]`)?.focus()
  }, [aFocaliser])

  const surTouche = (position: Position, evenement: KeyboardEvent<HTMLInputElement>) => {
    const tabulation = evenement.key === "Tab" && !evenement.altKey && !evenement.ctrlKey && !evenement.metaKey
    const voisine = tabulation ? celluleVoisine(tableau, position, evenement.shiftKey ? -1 : 1) : null
    if (voisine) {
      evenement.preventDefault()
      return setAFocaliser(voisine)
    }
    // `Tab` dans la dernière cellule ajoute une rangée ; `Maj+Tab` dans la première sort du tableau.
    if (tabulation && !evenement.shiftKey && !lectureSeule) {
      evenement.preventDefault()
      if (ecrire(gestes, cle, bloc, ajouterRangee(tableau, tableau.rows.length))) setAFocaliser({ ligne: tableau.rows.length + 1, colonne: 0 })
      return
    }
    if (evenement.key === "Enter") {
      evenement.preventDefault()
      if (position.ligne < tableau.rows.length) setAFocaliser({ ligne: position.ligne + 1, colonne: position.colonne })
      return
    }
    gestes.toucher(cle, evenement)
  }
  const cellules: LignesProps = {
    tableau,
    decritPar,
    lectureSeule,
    surFrappe: (position, texte) => ecrire(gestes, cle, bloc, ecrireCellule(tableau, position, texte)),
    surTouche,
    // Un autre bloc est en conflit : la cellule se lit, et le dit (HN-E05S08-3).
    surFocus: (position) => (lectureSeule ? gestes.annoncerLeConflit() : suivre(position)),
    surSortie: (evenement) => gestes.quitterLeChamp(cle, evenement),
  }

  return (
    <div className="oto-table-wrap">
      <table ref={grille} className="oto-table" data-simple="">
        <thead>
          <tr>
            <EnTetes {...cellules} />
          </tr>
        </thead>
        <tbody>
          <Rangees {...cellules} />
        </tbody>
      </table>
    </div>
  )
}
