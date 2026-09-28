// Une cellule d'un tableau (E07-S03, AC2, AC3 ; H93, H94) : la valeur au format de son type, « — »
// sans valeur, « vérifié vide », et le repli natif de sa provenance (qui, quand, commentaire, preuve,
// valeur importée). Sans directive ni état : rendu dans l'îlot de la grille, par la file de revue et par
// la vue d'un bloc `reference`. Jamais de `null` affiché : une ligne lue n'en porte pas (H93). Sans lui, la
// grille, la file et les vues formateraient chacune leurs valeurs.
//
// Porté d'oto-frontend (`corps-tableau.tsx`, `render` d'une colonne) : une clé absente est une cellule
// vide, pas une erreur. Retiré : le `Popover` (→ `<details>` natif, sans JavaScript), le contrat de
// colonne en infobulle.
import type { ReactNode } from "react"
import type { CellValue, TableColumn, TableRowRead } from "../../schemas"
import { FOCUS, LIEN } from "../components/classes"
import { dateEtHeureLisibles, dateLisible } from "../format/dates"
import { nombreLisible } from "../format/nombres"
import { PROVENANCE, TEXTES_DE_CELLULE } from "./libelles"

type ProvenanceLue = NonNullable<TableRowRead["provenance"]>[string]

/** Un lien vers l'extérieur, seulement en `http(s)` : jamais `javascript:` (`security-patterns.md § XSS Prevention`). */
const EXTERNE = /^https?:\/\//i

/** La valeur d'une cellule au format de son type (AC2) ; une valeur hors type se lit telle quelle. */
function valeurLisible(colonne: TableColumn, valeur: CellValue): string {
  if (colonne.type === "number" && typeof valeur === "number") return nombreLisible(valeur)
  if (colonne.type === "bool" && typeof valeur === "boolean") return valeur ? TEXTES_DE_CELLULE.oui : TEXTES_DE_CELLULE.non
  if (colonne.type === "date" && typeof valeur === "string") return dateLisible(valeur) ?? valeur
  if (colonne.type === "datetime" && typeof valeur === "string") return dateEtHeureLisibles(valeur) ?? valeur
  return String(valeur)
}

/** La valeur d'une colonne dans une ligne lue : `set`, ou la clé pour la colonne clé. */
export function valeurDe(ligne: TableRowRead, colonne: TableColumn, cle: string): CellValue | undefined {
  return Object.hasOwn(ligne.set, colonne.name) ? ligne.set[colonne.name] : colonne.name === cle ? ligne.key : undefined
}

function LienExterne({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={LIEN}>
      {children}
    </a>
  )
}

/** L'origine d'une provenance en une phrase (AC3) ; `verified_empty` porte la raison écrite par l'assistant. */
function origine(provenance: ProvenanceLue, raison: string | undefined): string {
  if (provenance.origin === "agent") return PROVENANCE.agent(provenance.by)
  if (provenance.origin === "human") return PROVENANCE.human(provenance.by)
  if (provenance.origin === "import") return PROVENANCE.import
  return PROVENANCE.verifieVide(provenance.by, raison ?? "")
}

type DetailProps = { colonne: TableColumn; provenance: ProvenanceLue; raison: string | undefined; lien: string | null }

/** Le contenu du repli : l'origine, le moment, le commentaire, la preuve et la valeur importée (AC3). */
function DetailDeProvenance({ colonne, provenance, raison, lien }: DetailProps) {
  const quand = dateEtHeureLisibles(provenance.at)
  const { comment, link, imported } = provenance
  return (
    // La table du design system ne coupe pas ses lignes (`white-space: nowrap`) : le repli ouvert, lui, va à la ligne.
    <div className="mt-1 min-w-64 space-y-0.5 whitespace-normal text-xs text-ink">
      {lien && (
        <p>
          <LienExterne href={lien}>{TEXTES_DE_CELLULE.ouvrirLeLien}</LienExterne>
        </p>
      )}
      <p>{origine(provenance, raison)}</p>
      {quand && <p>{PROVENANCE.le(quand)}</p>}
      {comment && <p className="whitespace-pre-line">{PROVENANCE.commentaire(comment)}</p>}
      {link && (
        <p>
          {PROVENANCE.preuve}
          {EXTERNE.test(link) ? <LienExterne href={link}>{link}</LienExterne> : link}
        </p>
      )}
      {imported && <p>{PROVENANCE.importee(valeurLisible(colonne, imported.value), dateLisible(imported.at))}</p>}
    </div>
  )
}

type CelluleProps = {
  colonne: TableColumn
  valeur: CellValue | undefined
  /** La raison d'une colonne déclarée vide après recherche (`verified_empty`, H92). */
  raisonDuVide?: string
  provenance?: ProvenanceLue
}

/**
 * Une cellule (AC2, AC3) : sa valeur, ou « vérifié vide », ou « — » ; une URL `http(s)` en lien
 * externe ; avec une provenance, la valeur est le `<summary>` d'un repli natif, atteignable au clavier.
 * Un texte nu reste un texte : la grille du design system (E05-S09 partie c2) ne tronque, avec son
 * infobulle, qu'une cellule dont le rendu est une chaîne, et appelle donc cette fonction, pas le composant.
 */
export function contenuDeCellule({ colonne, valeur, raisonDuVide, provenance }: CelluleProps): ReactNode {
  const texte = valeur !== undefined ? valeurLisible(colonne, valeur) : raisonDuVide !== undefined ? TEXTES_DE_CELLULE.verifieVide : TEXTES_DE_CELLULE.vide
  const lien = colonne.type === "url" && typeof valeur === "string" && EXTERNE.test(valeur) ? valeur : null
  if (!provenance) return lien ? <LienExterne href={lien}>{texte}</LienExterne> : texte
  // Avec une provenance, la valeur ouvre le repli ; une URL s'y ouvre par son propre lien : un lien dans un
  // `<summary>` y serait un contrôle dans un contrôle.
  return (
    <details>
      <summary className={`cursor-pointer rounded-sm ${FOCUS}`}>{texte}</summary>
      <DetailDeProvenance colonne={colonne} provenance={provenance} raison={raisonDuVide} lien={lien} />
    </details>
  )
}

/** La même cellule, en composant : la file de revue et la vue d'un bloc `reference`. */
export function Cellule(props: CelluleProps) {
  return contenuDeCellule(props)
}
