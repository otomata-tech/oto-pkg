"use client"

// Porté d'oto-frontend (src/design-system/components/react/overlays.jsx, `CommandPalette` et
// `fuzzyScore`) : la palette de ⌘K sur un `<dialog>` natif, recherche floue (les lettres dans l'ordre,
// pas forcément côte à côte), rubriques en `role="group"` nommés, parcours aux flèches ; tels quels,
// en TypeScript. Changé : `onQueryChange` rend la saisie à l'appelant, qui cherche aussi dans le
// contenu (E05-S09, AC-a7), et une commande `found`, déjà trouvée par lui, reste quelle que soit la
// saisie ; `status` dit une recherche en cours ; une commande est un `<button>` hors de la tabulation
// (un `div` cliquable, dans oto-frontend). Retiré : les commandes récentes, que personne ne sert.
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react"
import { useNativeDialog } from "./dialog"
import { useRovingFocus } from "./hooks"
import { cx } from "./outils"

export type Command = {
  id: string
  label: string
  group?: string
  icon?: ReactNode
  meta?: ReactNode
  /** Trouvée par l'appelant pour cette saisie : gardée, après les commandes que la recherche floue retient. */
  found?: boolean
  onSelect?: () => void
}

/** Les commandes que la saisie retient, les meilleures d'abord, puis celles que l'appelant a trouvées. */
function retenues(commands: Command[], query: string): Command[] {
  if (!query) return commands.filter((commande) => !commande.found)
  const floues = commands
    .filter((commande) => !commande.found)
    .map((commande) => ({ commande, score: fuzzyScore(query, `${commande.group ?? ""} ${commande.label}`) }))
    .filter(({ score }) => score >= 0)
    .sort((a, b) => b.score - a.score)
    .map(({ commande }) => commande)
  return [...floues, ...commands.filter((commande) => commande.found)]
}

/** Le score d'une commande pour la saisie : -1 si une lettre manque, plus haut pour un début de mot ou une suite. */
export function fuzzyScore(needle: string, haystack: string): number {
  const aiguille = needle.toLowerCase()
  const botte = haystack.toLowerCase()
  if (!aiguille) return 0
  let depuis = 0
  let score = 0
  let serie = 0
  for (const lettre of aiguille) {
    const trouve = botte.indexOf(lettre, depuis)
    if (trouve === -1) return -1
    serie = trouve === depuis ? serie + 1 : 0
    score += serie * 2 + (trouve === 0 || /[\s\-_/]/.test(botte[trouve - 1]) ? 3 : 0) + 1
    depuis = trouve + 1
  }
  return score
}

type Rubrique = { nom: string | null; items: Command[] }

/** Les commandes consécutives d'une même rubrique, regroupées : l'index de parcours reste global. */
function rubriquesDe(liste: Command[]): Rubrique[] {
  const rubriques: Rubrique[] = []
  for (const commande of liste) {
    const nom = commande.group ?? null
    const derniere = rubriques[rubriques.length - 1]
    if (derniere && derniere.nom === nom) derniere.items.push(commande)
    else rubriques.push({ nom, items: [commande] })
  }
  return rubriques
}

type OptionProps = { commande: Command; rang: number; active: boolean; surSurvol: (rang: number) => void; lancer: (commande: Command) => void }

/** Une commande : un bouton hors de la tabulation, le focus restant dans le champ qui la désigne. */
function Option({ commande, rang, active, surSurvol, lancer }: OptionProps) {
  return (
    <button
      type="button"
      tabIndex={-1}
      id={`oto-cmd-${rang}`}
      role="option"
      aria-selected={active}
      className="oto-menu-item anim-host"
      data-highlighted={active ? "" : undefined}
      onMouseEnter={() => surSurvol(rang)}
      onClick={() => lancer(commande)}
    >
      {commande.icon}
      <span className="oto-menu-label">{commande.label}</span>
      {commande.meta != null && <span className="oto-pop-meta">{commande.meta}</span>}
    </button>
  )
}

type ListeProps = { liste: Command[]; index: number; surSurvol: (rang: number) => void; lancer: (commande: Command) => void }

function ListeDesCommandes({ liste, index, surSurvol, lancer }: ListeProps) {
  let rang = -1
  return (
    <div className="oto-palette-list" id="oto-palette-list" role="listbox">
      {rubriquesDe(liste).map((rubrique, numero) => {
        const idTitre = `oto-cmd-groupe-${numero}`
        const options = rubrique.items.map((commande) => {
          rang += 1
          return <Option key={commande.id} commande={commande} rang={rang} active={index === rang} surSurvol={surSurvol} lancer={lancer} />
        })
        if (!rubrique.nom) return <Fragment key={idTitre}>{options}</Fragment>
        return (
          <div key={idTitre} role="group" aria-labelledby={idTitre}>
            <p className="oto-menu-group-label" id={idTitre}>
              {rubrique.nom}
            </p>
            {options}
          </div>
        )
      })}
    </div>
  )
}

type CommandPaletteProps = {
  open: boolean
  onClose: () => void
  commands: Command[]
  placeholder?: string
  emptyText?: string
  /** La saisie, quand l'appelant la lit aussi ; sinon tenue ici. */
  onQueryChange?: (query: string) => void
  /** Une ligne sous la liste (une recherche en cours, une panne), annoncée à son arrivée. */
  status?: ReactNode
  className?: string
}

export function CommandPalette({ open, onClose, commands, placeholder = "Rechercher une commande…", emptyText = "Aucune commande", onQueryChange, status, className }: CommandPaletteProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const champ = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState("")
  useNativeDialog(ref, open, onClose)

  useEffect(() => {
    if (!open) return
    setQuery("")
    onQueryChange?.("")
    setTimeout(() => champ.current?.focus(), 0)
    // La saisie repart de zéro à chaque ouverture ; `onQueryChange` n'en décide pas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const liste = retenues(commands, query)

  const lancer = (commande: Command | undefined) => {
    commande?.onSelect?.()
    onClose()
  }
  const { index, setIndex, onKeyDown } = useRovingFocus(liste.length, { open, onSelect: (rang) => lancer(liste[rang]) })

  useEffect(() => {
    setIndex(liste.length ? 0 : -1)
    // Le premier résultat se surligne à chaque saisie.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  return (
    <dialog ref={ref} className={cx("oto-palette", className)} aria-label="Palette de commandes" onClick={(evenement) => evenement.target === ref.current && onClose()}>
      <div className="oto-palette-input">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          ref={champ}
          value={query}
          placeholder={placeholder}
          aria-label={placeholder}
          onChange={(evenement) => {
            setQuery(evenement.target.value)
            onQueryChange?.(evenement.target.value)
          }}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded="true"
          aria-controls="oto-palette-list"
          aria-activedescendant={index >= 0 ? `oto-cmd-${index}` : undefined}
          autoComplete="off"
        />
      </div>
      <ListeDesCommandes liste={liste} index={index} surSurvol={setIndex} lancer={lancer} />
      {liste.length === 0 && <p className="oto-combobox-empty">{emptyText}</p>}
      {/* Montée vide, remplie ensuite : une région n'annonce que ce qui change après son montage. */}
      <p role="status" className={status ? "oto-combobox-empty" : undefined}>
        {status}
      </p>
      <footer className="oto-palette-foot">
        <span>
          <kbd className="oto-kbd">↑</kbd>
          <kbd className="oto-kbd">↓</kbd> naviguer
        </span>
        <span>
          <kbd className="oto-kbd">↵</kbd> ouvrir
        </span>
        <span>
          <kbd className="oto-kbd">esc</kbd> fermer
        </span>
      </footer>
    </dialog>
  )
}
