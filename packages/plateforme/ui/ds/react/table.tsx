"use client"

// Porté d'oto-frontend (src/design-system/components/react/data.jsx, `Table` et sa cellule) : un `<table>`
// sémantique ; sous 768 px chaque ligne devient une carte dont chaque cellule lit son en-tête dans
// `data-label`, posé au rendu (aucun observateur, aucun décalage avec le CSS) ; le tri est un bouton dans
// l'en-tête (`aria-sort` reste sur le `<th>`), nommé « Trier sur » + l'en-tête par des ids de `useId` ; un
// filtre de colonne est un nœud que l'appelant pose dans l'en-tête ; une cellule de texte réellement
// tronquée gagne un arrêt de tabulation et l'infobulle qui la répare, les autres non. Tel quel, en
// TypeScript.
import { useCallback, useEffect, useId, useRef, useState, type ComponentProps, type PointerEvent as EvenementDePointeur, type ReactNode } from "react"
import { Checkbox } from "./checkbox"
import { useIsoLayoutEffect } from "./hooks"
import { cx } from "./outils"
import { Tooltip } from "./tooltip"

export type Column<T> = {
  key: string
  header: ReactNode
  width?: number | string
  align?: "start" | "center" | "end"
  numeric?: boolean
  sticky?: boolean
  primary?: boolean
  sortable?: boolean
  filter?: ReactNode
  filterOn?: boolean
  render?: (row: T) => ReactNode
}

export type TableSort = { key: string; dir: "asc" | "desc" }

type RowId = string | number

type TableProps<T> = Omit<ComponentProps<"div">, "children"> & {
  columns: Column<T>[]
  rows: T[]
  getRowId?: (row: T, index: number) => RowId
  sort?: TableSort
  onSortChange?: (sort: TableSort) => void
  selectable?: boolean
  selected?: RowId[]
  onSelectedChange?: (ids: RowId[]) => void
  onRowClick?: (row: T) => void
  rowState?: (row: T) => string | undefined
  resizable?: boolean
  /** `cards` : une carte par ligne sous 768 px ; `scroll` : le tableau défile. */
  responsive?: "cards" | "scroll"
  empty?: ReactNode
  caption?: ReactNode
}

/** L'`id` de la ligne s'il en a un, son rang sinon. */
function idParDefaut(row: unknown, index: number): RowId {
  if (typeof row === "object" && row !== null && "id" in row && (typeof row.id === "string" || typeof row.id === "number")) return row.id
  return index
}

/** La valeur brute d'une colonne sans `render`, quand elle se rend telle quelle. */
function valeurDe(row: unknown, key: string): ReactNode {
  if (typeof row !== "object" || row === null) return null
  const valeur: unknown = Reflect.get(row, key)
  return typeof valeur === "string" || typeof valeur === "number" ? valeur : null
}

// Le chevron du tri : vers le haut, sauf une colonne triée en sens descendant.
function Chevron({ descendant }: { descendant: boolean }) {
  return (
    <svg className="oto-sort-icon" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {descendant ? <path d="m6 9 6 6 6-6" /> : <path d="m18 15-6-6-6 6" />}
    </svg>
  )
}

type Glisse = { key: string; x0: number; w0: number; el: HTMLElement }

/** Le redimensionnement d'une colonne à la poignée ; 64 px de plancher, sous lesquels l'en-tête n'est plus lisible. */
function useLargeurs() {
  const [widths, setWidths] = useState<Record<string, number>>({})
  const drag = useRef<Glisse | null>(null)
  const startResize = useCallback((key: string, evenement: EvenementDePointeur<HTMLElement>) => {
    evenement.preventDefault()
    const th = evenement.currentTarget.closest("th")
    if (!th) return
    drag.current = { key, x0: evenement.clientX, w0: th.offsetWidth, el: evenement.currentTarget }
    drag.current.el.dataset.dragging = ""
    const move = (ev: PointerEvent) => {
      const d = drag.current
      if (!d) return
      setWidths((w) => ({ ...w, [d.key]: Math.max(64, d.w0 + ev.clientX - d.x0) }))
    }
    const up = () => {
      if (drag.current) delete drag.current.el.dataset.dragging
      drag.current = null
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }, [])
  return { widths, startResize }
}

/** Le compteur de remesure : la largeur du tableau change sans qu'aucune prop ne bouge ; un observateur pour le tableau entier, qui ne compte que ce qui a bougé. */
function useRemesure(tableRef: { readonly current: HTMLTableElement | null }): number {
  const [mesure, setMesure] = useState(0)
  useEffect(() => {
    const el = tableRef.current
    if (!el || typeof ResizeObserver === "undefined") return
    let derniere = el.clientWidth
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === derniere) return
      derniere = el.clientWidth
      setMesure((n) => n + 1)
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
    }
  }, [tableRef])
  return mesure
}

type EnTeteProps<T> = {
  col: Column<T>
  sort?: TableSort
  triable: boolean
  baseId: string
  idVerbe: string
  largeur?: number | string
  resizable?: boolean
  onTri: () => void
  onResize: (evenement: EvenementDePointeur<HTMLElement>) => void
}

function EnTete<T>({ col, sort, triable, baseId, idVerbe, largeur, resizable, onTri, onResize }: EnTeteProps<T>) {
  const active = sort?.key === col.key
  const ariaSort = triable ? (active ? (sort?.dir === "asc" ? "ascending" : "descending") : "none") : undefined
  return (
    <th scope="col" style={{ inlineSize: largeur }} data-align={col.align} data-numeric={col.numeric ? "" : undefined} data-sticky={col.sticky ? "" : undefined} aria-sort={ariaSort}>
      <span className="oto-th-cell">
        {triable ? (
          <button type="button" className="oto-th-in oto-th-sort" id={`${baseId}-th-${col.key}`} aria-labelledby={`${idVerbe} ${baseId}-th-${col.key}`} onClick={onTri}>
            {col.header}
            <Chevron descendant={active && sort?.dir === "desc"} />
          </button>
        ) : (
          <span className="oto-th-in">{col.header}</span>
        )}
        {col.filter != null && (
          <span className="oto-th-actions" data-on={col.filterOn ? "" : undefined}>
            {col.filter}
          </span>
        )}
      </span>
      {resizable && (
        <span
          className="oto-resize-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label={`Redimensionner ${typeof col.header === "string" ? col.header : col.key}`}
          onPointerDown={onResize}
        />
      )}
    </th>
  )
}

export function Table<T>({
  columns,
  rows,
  getRowId = idParDefaut,
  sort,
  onSortChange,
  selectable,
  selected = [],
  onSelectedChange,
  onRowClick,
  rowState,
  resizable,
  responsive = "cards",
  empty,
  caption,
  className,
  ...rest
}: TableProps<T>) {
  const tableRef = useRef<HTMLTableElement>(null)
  const { widths, startResize } = useLargeurs()
  const mesure = useRemesure(tableRef)
  // Le préfixe d'ids de cette instance : deux tableaux côte à côte partagent tout le reste.
  const baseId = useId()
  const idVerbe = `${baseId}-tri`
  // Une colonne n'est triable que si l'appelant sait quoi faire du tri : sinon un bouton qui ne fait rien.
  const estTriable = (col: Column<T>) => Boolean(col.sortable) && typeof onSortChange === "function"
  const toggleSort = (col: Column<T>) => {
    if (!estTriable(col)) return
    const dir = sort?.key === col.key && sort.dir === "asc" ? "desc" : "asc"
    onSortChange?.({ key: col.key, dir })
  }
  const allIds = rows.map(getRowId)
  const allOn = allIds.length > 0 && allIds.every((id) => selected.includes(id))
  const someOn = selected.length > 0 && !allOn

  return (
    <div className={cx("oto-table-wrap", className)} {...rest}>
      <span id={idVerbe} className="oto-sr-only">
        Trier sur
      </span>
      <table ref={tableRef} className="oto-table" data-responsive={responsive}>
        {caption && <caption className="oto-sr-only">{caption}</caption>}
        <thead>
          <tr>
            {selectable && (
              <th className="oto-table-select" scope="col">
                <Checkbox checked={allOn} indeterminate={someOn} aria-label={allOn ? "Tout désélectionner" : "Tout sélectionner"} onChange={() => onSelectedChange?.(allOn ? [] : allIds)} />
              </th>
            )}
            {columns.map((col) => (
              <EnTete
                key={col.key}
                col={col}
                sort={sort}
                triable={estTriable(col)}
                baseId={baseId}
                idVerbe={idVerbe}
                largeur={widths[col.key] ?? col.width}
                resizable={resizable}
                onTri={() => toggleSort(col)}
                onResize={(evenement) => startResize(col.key, evenement)}
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && empty && (
            <tr className="oto-table-empty">
              <td colSpan={columns.length + (selectable ? 1 : 0)}>{empty}</td>
            </tr>
          )}
          {rows.map((row, i) => {
            const id = getRowId(row, i)
            const on = selected.includes(id)
            return (
              <tr
                key={id}
                aria-selected={selectable ? on : undefined}
                data-state={rowState?.(row)}
                tabIndex={onRowClick ? 0 : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={
                  onRowClick
                    ? (evenement) => {
                        if (evenement.key === "Enter") onRowClick(row)
                      }
                    : undefined
                }
              >
                {selectable && (
                  <td className="oto-table-select">
                    <Checkbox
                      checked={on}
                      aria-label={`Sélectionner la ligne ${i + 1}`}
                      onClick={(evenement) => evenement.stopPropagation()}
                      onChange={() => onSelectedChange?.(on ? selected.filter((x) => x !== id) : [...selected, id])}
                    />
                  </td>
                )}
                {columns.map((col) => (
                  <TableCell key={col.key} col={col} row={row} largeur={widths[col.key] ?? col.width} mesure={mesure} />
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** Le contenu rendu est-il du texte qu'une infobulle saurait remettre entier ? Une chaîne vide ne l'est pas. */
function texteDeCellule(valeur: ReactNode): string | null {
  if (typeof valeur === "number") return String(valeur)
  return typeof valeur === "string" && valeur !== "" ? valeur : null
}

type TableCellProps<T> = { col: Column<T>; row: T; largeur?: number | string; mesure: number }

function TableCell<T>({ col, row, largeur, mesure }: TableCellProps<T>) {
  const contenu = col.render ? col.render(row) : valeurDe(row, col.key)
  const texte = texteDeCellule(contenu)
  const ref = useRef<HTMLTableCellElement>(null)
  const [tronque, setTronque] = useState(false)

  // Avant la peinture ; on demande au CSS s'il cache (une carte laisse déborder, `overflow: visible`), et
  // 1 px de seuil : les navigateurs arrondissent `scrollWidth` et `clientWidth`.
  useIsoLayoutEffect(() => {
    const el = ref.current
    if (!el || texte === null || getComputedStyle(el).overflowX === "visible") {
      setTronque(false)
      return
    }
    setTronque(el.scrollWidth - el.clientWidth > 1)
  }, [texte, largeur, mesure])

  const cellule = (
    <td
      ref={ref}
      data-label={typeof col.header === "string" ? col.header : undefined}
      data-primary={col.primary ? "" : undefined}
      data-align={col.align}
      data-numeric={col.numeric ? "" : undefined}
      data-sticky={col.sticky ? "" : undefined}
      data-clip={texte === null ? undefined : ""}
      tabIndex={tronque ? 0 : undefined}
    >
      {contenu}
    </td>
  )
  // L'infobulle n'enveloppe qu'une cellule tronquée : sinon un `aria-describedby` vers un id absent.
  if (!tronque) return cellule
  return (
    <Tooltip content={texte} side="bottom" className="oto-cell-tip">
      {cellule}
    </Tooltip>
  )
}
