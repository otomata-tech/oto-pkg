// Les îlots et les états des écrans d'administration (E08-S03, E08-S09 ; E05-S09 partie d2) : l'îlot nommé
// par son titre et le chargement, qui sans ce module se recopieraient sur sept écrans ; l'échec d'une
// lecture est `ErreurDeLecture` (M37). Server Components.
//
// Porté d'oto-frontend (`routes/settings.company.lazy.tsx` l. 70-99 et 175-211, `components/monitoring/
// etats-du-suivi.tsx`) : `Island`, `IslandHead` et `IslandBody` du design system, le titre de l'îlot en
// `<h2>` ; le squelette aux dimensions du contenu, jamais un indicateur centré. Changé : le titre de l'îlot
// porte l'ancre du focus d'un geste qui emporte sa ligne. Retiré : TanStack Query.
import type { ReactNode } from "react"
import { Island, IslandBody, IslandHead } from "../ds/react/island"
import { Skeleton } from "../ds/react/skeleton"

type IlotProps = {
  /** Identifiant du titre : il nomme l'îlot, et reçoit le focus quand un geste emporte sa ligne (`ancre` d'`ActionPlateforme`). */
  id: string
  titre: string
  /** Le compte, au bout de l'en-tête (« 1 connecteur activable »). */
  compte?: string
  /** Le corps sans rembourrage : une table bord à bord. */
  flush?: boolean
  children: ReactNode
}

export function Ilot({ id, titre, compte, flush, children }: IlotProps) {
  return (
    <Island aria-labelledby={id}>
      <IslandHead>
        <h2 id={id} tabIndex={-1}>
          {titre}
        </h2>
        {compte && <p className="oto-caption">{compte}</p>}
      </IslandHead>
      <IslandBody flush={flush}>{children}</IslandBody>
    </Island>
  )
}

// En largeur de la tuile (`width`) et non en utilitaire : la règle du design system, hors couche, l'emporterait.
const LIGNES = ["100%", "84%", "100%", undefined]

/**
 * Le chargement d'un écran, `fallback` du `<Suspense>` de l'hôte : `role="status"`, `aria-busy`, texte lu
 * seul ; un titre et un îlot de lignes, aux dimensions de ce qui arrive. Une seule région : les rectangles
 * sont `aria-hidden`, le conteneur parle.
 */
export function Chargement({ texte }: { texte: string }) {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-3">
      <span className="oto-sr-only">{texte}</span>
      <Skeleton width="16rem" height="1.75rem" />
      <Island>
        <IslandBody>
          {/* En colonne flex : `.oto-skeleton` est un `span` sans `display`, qui dans un bloc ne prendrait ni largeur ni hauteur. */}
          <div className="oto-skeleton-text flex flex-col">
            {LIGNES.map((largeur, rang) => (
              // Aucune donnée n'existe encore : le rang est l'identité de la ligne, qui ne se réordonne jamais.
              <Skeleton key={rang} shape="text" width={largeur} />
            ))}
          </div>
        </IslandBody>
      </Island>
    </div>
  )
}

/** Le chargement de l'écran des accès plateforme, qui monte `AccesPlateforme` d'E05-S03 dans l'écran d'administration. */
export function AccesPlateformeChargement() {
  return <Chargement texte="Chargement des accès plateforme…" />
}
