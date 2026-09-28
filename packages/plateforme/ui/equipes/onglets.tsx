"use client"

// La barre d'onglets en tête de l'îlot de l'écran (E05-S09, partie d1). Portée d'oto-frontend
// (`src/components/ui/onglets.tsx`, variante `enTete`, et le motif ARIA de `TabsBase` de son design system,
// `navigation.jsx`) : `tablist` / `tab` / `tabpanel`, un seul onglet dans la tabulation, les flèches, Début
// et Fin ; `data-island-head` sur la barre et sur le panneau, le CSS dessine l'en-tête de l'îlot ; le compte
// d'un onglet dans son bouton, donc dans son nom accessible. Changé : l'onglet est dans l'adresse de l'hôte
// (`?onglet=`) ; choisir un onglet l'ouvre par `useHote().naviguer`, et le panneau rend le contenu que la page
// a lu pour lui. Chaque onglet étant une lecture du serveur, l'activation est manuelle (motif APG) : les
// flèches déplacent le focus, Entrée ou Espace ouvre l'onglet. Retiré : Radix, absent du paquet.
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import { useHote } from "../hote/navigation"

export type Onglet = { cle: string; libelle: string; href: string; badge?: ReactNode }

type OngletsProps = {
  /** Nomme la barre : un `tablist` anonyme n'apporte rien. */
  label: string
  /** Nomme le panneau quand l'onglet ouvert n'est pas dans la barre (« Accès plateforme » d'un non-administrateur). */
  titre: string
  onglets: Onglet[]
  courant: string
  /** Le contenu de l'onglet ouvert, rendu par l'écran. */
  children: ReactNode
}

type BoutonsProps = {
  onglets: Onglet[]
  courant: string
  base: string
  boutons: { current: (HTMLButtonElement | null)[] }
  ouvrir: (onglet: Onglet) => void
}

/** Un bouton par onglet ; ses props restent des données et le geste d'ouvrir (portage-ecrans.md § 2). */
function BoutonsDOnglets({ onglets, courant, base, boutons, ouvrir }: BoutonsProps) {
  return onglets.map((onglet, rang) => {
    const actif = onglet.cle === courant
    return (
      <button
        key={onglet.cle}
        ref={(bouton) => {
          boutons.current[rang] = bouton
        }}
        type="button"
        role="tab"
        id={`${base}-${onglet.cle}`}
        className="oto-tab anim-host"
        aria-selected={actif}
        aria-controls={actif ? `${base}-panneau` : undefined}
        tabIndex={actif ? 0 : -1}
        onClick={() => {
          if (!actif) ouvrir(onglet)
        }}
      >
        {onglet.libelle}
        {onglet.badge}
      </button>
    )
  })
}

/** Ce qui prend le focus au clavier ; un panneau qui en contient n'est pas lui-même un arrêt de tabulation (motif APG). */
const FOCALISABLES = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"

/** Le panneau n'entre dans la tabulation que s'il n'a rien de focalisable : sinon, deux arrêts pour un seul contenu. */
function usePanneauFocalisable(contenu: ReactNode) {
  const panneau = useRef<HTMLDivElement>(null)
  const [focalisable, setFocalisable] = useState(false)
  useEffect(() => {
    setFocalisable(!panneau.current?.querySelector(FOCALISABLES))
  }, [contenu])
  return { panneau, focalisable }
}

export function Onglets({ label, titre, onglets, courant, children }: OngletsProps) {
  const { naviguer } = useHote()
  const base = useId()
  const boutons = useRef<(HTMLButtonElement | null)[]>([])
  const { panneau, focalisable } = usePanneauFocalisable(children)
  const ouvertDansLaBarre = onglets.some((onglet) => onglet.cle === courant)

  const surTouche = (evenement: KeyboardEvent<HTMLDivElement>) => {
    const rang = boutons.current.findIndex((bouton) => bouton === document.activeElement)
    const aller = (suivant: number) => boutons.current[(suivant + onglets.length) % onglets.length]?.focus()
    const gestes: Record<string, () => void> = {
      ArrowRight: () => aller(rang + 1),
      ArrowLeft: () => aller(rang - 1),
      Home: () => aller(0),
      End: () => aller(onglets.length - 1),
    }
    const geste = gestes[evenement.key]
    if (!geste) return
    evenement.preventDefault()
    geste()
  }

  return (
    <>
      <div className="oto-tabs" role="tablist" aria-label={label} data-island-head="" onKeyDown={surTouche}>
        <BoutonsDOnglets onglets={onglets} courant={courant} base={base} boutons={boutons} ouvrir={(onglet) => naviguer(onglet.href)} />
      </div>
      <div
        ref={panneau}
        role="tabpanel"
        id={`${base}-panneau`}
        aria-labelledby={ouvertDansLaBarre ? `${base}-${courant}` : undefined}
        aria-label={ouvertDansLaBarre ? undefined : titre}
        className="oto-tabpanel"
        data-island-head=""
        tabIndex={focalisable ? 0 : undefined}
      >
        {children}
      </div>
    </>
  )
}
