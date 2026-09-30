"use client"

// L'iframe d'un fichier HTML dans la visionneuse (E10-S02 lot c, AC-c4 ; ADR-017 § 1 à § 3) : elle charge la route
// isolée, sur une origine opaque (`sandbox` sans `allow-same-origin`, sans `allow-top-navigation`, sans
// `allow-downloads`), sans l'adresse de la page (`no-referrer`) ni aucune permission (aucun attribut `allow`), et
// occupe la hauteur restante de la fenêtre : aucun script de hauteur. L'écran n'écoute ni n'envoie aucun message à
// l'iframe. Un second chargement de l'iframe est une navigation de son contenu (canal O1, accepté) : l'écran la
// remplace par « Ce contenu a tenté de quitter la page. » et « Recharger », dit dans une région montée vide ; le focus
// va ensuite à l'iframe neuve. Client pour compter ses chargements ; elle
// ne se monte qu'une fois l'écran hydraté, pour que son premier chargement soit compté. Sans elle, un fichier HTML ne
// se verrait pas isolé.
import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { Alert, Button } from "../ds/react/primitives"
import { FICHIERS } from "./libelles-des-fichiers"

/** Le `sandbox` d'ADR-017 § 1, mot pour mot. */
export const SANDBOX = "allow-scripts allow-popups allow-forms"

const aucunAbonnement = () => () => undefined

/** Vrai une fois l'écran hydraté, faux au rendu du serveur et pendant l'hydratation. */
function useHydrate(): boolean {
  return useSyncExternalStore(
    aucunAbonnement,
    () => true,
    () => false,
  )
}

type CadreProps = {
  /** La route isolée du fichier (`…/files/<id>/html`). */
  source: string
  /** Le nom du fichier : le `title` de l'iframe. */
  titre: string
}

export function CadreDuFichier({ source, titre }: CadreProps) {
  const hydrate = useHydrate()
  const [chargements, setChargements] = useState(0)
  // Chaque « Recharger » monte une iframe neuve : son premier chargement repart de zéro.
  const [tour, setTour] = useState(0)
  const cadre = useRef<HTMLIFrameElement>(null)
  // « Recharger » part avec l'avis qui le porte : le focus va à l'iframe neuve, au rendu qui la monte
  // (`accessibility-patterns.md § Focus Management`), jamais à `<body>`.
  const rendreLeFocus = useRef(false)
  useEffect(() => {
    if (!rendreLeFocus.current || !cadre.current) return
    rendreLeFocus.current = false
    cadre.current.focus()
  })
  const quitte = chargements > 1
  const recharger = () => {
    rendreLeFocus.current = true
    setChargements(0)
    setTour((avant) => avant + 1)
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Montée vide avec l'iframe, la région reçoit l'avis d'une navigation (`accessibility-patterns.md § Régions dynamiques`). */}
      <div role="alert">
        {quitte && (
          <Alert
            tone="review"
            role="presentation"
            title={FICHIERS.quitte}
            actions={
              <Button variant="secondary" size="sm" onClick={recharger}>
                {FICHIERS.recharger}
              </Button>
            }
          />
        )}
      </div>
      {quitte ? null : hydrate ? (
        <iframe
          key={tour}
          ref={cadre}
          src={source}
          title={titre}
          sandbox={SANDBOX}
          referrerPolicy="no-referrer"
          className="min-h-96 w-full flex-1 rounded-lg ring-1 ring-mute"
          onLoad={() => setChargements((avant) => avant + 1)}
        />
      ) : (
        <div className="min-h-96 flex-1" aria-hidden="true" />
      )}
    </div>
  )
}
