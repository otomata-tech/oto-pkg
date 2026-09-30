"use client"

// « Restaurer » d'une ligne de la corbeille (E05-S10, partie b2, AC-b11) : `POST /api/platform/trash/restore`
// remet le contenu à sa place (sous son parent, ou son plus proche ancêtre vivant, HN-E05S10e-4) avec ce qui
// était parti avec lui ; le contenu restauré s'ouvre, à l'adresse que le service rend, et la page se relit
// (le rail le montre). Un refus se dit sous le bouton ; un contenu déjà sorti de la corbeille (`not_found`)
// fait relire la page, qui retire sa ligne. Droits décidés par le service. Sans lui, la corbeille ne
// servirait qu'à perdre.
import { useEffect, useRef, useState } from "react"
import { nodePathBodySchema } from "../../schemas"
import { appelerPlateforme } from "../api/client"
import { messageDErreur } from "../api/messages"
import { Button } from "../ds/react/primitives"
import { useHote } from "../hote/navigation"
import { useRafraichir } from "../hote/rafraichir"
import { CORBEILLE, REFUS_DE_RESTAURATION } from "./libelles"

type RestaurationProps = {
  chemin: string
  titre: string
  /** Le préfixe des pages de l'hôte (« /n/ ») : le contenu restauré s'ouvre à ce préfixe suivi de son chemin. */
  prefixeDesPages: string
}

export function Restauration({ chemin, titre, prefixeDesPages }: RestaurationProps) {
  const { naviguer } = useHote()
  const rafraichir = useRafraichir()
  const [envoi, setEnvoi] = useState(false)
  const [refus, setRefus] = useState("")
  // Un double clic arrive avant que le bouton désactivé soit rendu : ce verrou tient l'envoi unique.
  const enCours = useRef(false)
  // Désactivé pendant l'envoi, le bouton perd le focus : un refus le lui rend. La demande est un état, posé
  // avec le refus, pour qu'une réponse immédiate (début et fin de l'envoi dans le même rendu) la voie aussi
  // (`accessibility-patterns.md § Focus Management`).
  const bouton = useRef<HTMLButtonElement>(null)
  const [refocaliser, setRefocaliser] = useState(false)
  useEffect(() => {
    if (!refocaliser) return
    bouton.current?.focus()
    setRefocaliser(false)
  }, [refocaliser])

  async function restaurer() {
    const corps = nodePathBodySchema.safeParse({ path: chemin })
    if (enCours.current || !corps.success) return
    enCours.current = true
    setRefus("")
    setEnvoi(true)
    const reponse = await appelerPlateforme<{ path: string }>({ methode: "POST", ressource: "trash/restore", corps: corps.data })
    enCours.current = false
    setEnvoi(false)
    if (reponse.erreur) {
      setRefus(messageDErreur(reponse.erreur, REFUS_DE_RESTAURATION))
      setRefocaliser(true)
      if (reponse.erreur.code === "not_found") rafraichir()
      return
    }
    naviguer(`${prefixeDesPages}${reponse.data.path}`)
    rafraichir()
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button ref={bouton} variant="secondary" size="sm" aria-label={CORBEILLE.restaurerNomme(titre)} disabled={envoi} aria-busy={envoi || undefined} onClick={() => void restaurer()}>
        {envoi ? CORBEILLE.restauration : CORBEILLE.restaurer}
      </Button>
      {refus && (
        <p role="alert" className="text-sm text-ink">
          {refus}
        </p>
      )}
    </div>
  )
}
