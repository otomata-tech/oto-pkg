// Un tableau rendu par le serveur, au balisage et aux classes du `Table` du design system (E05-S09, partie d1) :
// `oto-table-wrap`, `oto-table`, des en-têtes `scope="col"`, `data-label` sur chaque cellule. Pour les tableaux
// sans tri ni geste de colonne des onglets propres à la plateforme (les règles d'un nœud, les accès de
// l'équipe plateforme), qui n'ont pas d'original dans oto-frontend : le `Table` porté est un îlot client dont
// les colonnes sont des fonctions, qu'un Server Component ne peut lui passer (portage-ecrans.md § 2). Nommé
// par l'élément qui le précède (`aria-labelledby`), un titre visible, cible du focus d'un geste qui part.
import type { ReactNode } from "react"

type Ligne = { cle: string; cellules: ReactNode[] }

type TableauFixeProps = { nommePar: string; entetes: string[]; lignes: Ligne[] }

export function TableauFixe({ nommePar, entetes, lignes }: TableauFixeProps) {
  return (
    <div className="oto-table-wrap">
      <table className="oto-table" data-responsive="scroll" aria-labelledby={nommePar}>
        <thead>
          <tr>
            {entetes.map((entete) => (
              <th key={entete} scope="col">
                <span className="oto-th-cell">
                  <span className="oto-th-in">{entete}</span>
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lignes.map((ligne) => (
            <tr key={ligne.cle}>
              {ligne.cellules.map((cellule, rang) => (
                <td key={entetes[rang] ?? rang} data-label={entetes[rang]} data-primary={rang === 0 ? "" : undefined}>
                  {cellule}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
