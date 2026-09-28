"use client"

// « Dupliquer » et « Supprimer » du « ⋯ » d'une ligne du rail (E05-S10, partie b2, AC-b8, AC-b10, AC-b11),
// où ils remplacent « Renommer » (le titre s'écrit dans la page, AC-a1). « Dupliquer » envoie
// `POST /api/plateforme/nodes/duplicate` : la copie, « <titre> (copie) » juste sous l'original, s'ouvre et
// reste sélectionnée dans le rail. « Supprimer » demande d'abord, par un `ConfirmDialog`, en disant combien
// de sous-contenus partent avec (l'arbre visible les compte : le service refuse un sous-arbre qui porte un
// contenu que la personne ne voit pas, HN-E05S10e-3), puis envoie `POST trash` ; la page ouverte partie avec
// lui, son parent s'ouvre ; le focus va à la ligne qui la précède. Droits décidés par le service, refus dit
// dans le rail. Écrit dans le style du menu d'oto-frontend, qui avait retiré ces gestes faute de service.
import { useEffect, useState, type ReactNode } from "react"
import { Copy } from "@phosphor-icons/react/dist/csr/Copy"
import { Trash } from "@phosphor-icons/react/dist/csr/Trash"
import { nodePathBodySchema } from "../../schemas"
import { appelerPlateforme } from "../api/client"
import { messageDErreur } from "../api/messages"
import { RACINE } from "../arbre/depuis-l-arbre"
import { ConfirmDialog } from "../ds/react/confirm-dialog"
import { AnimatedIcon } from "../ds/react/icon"
import type { MenuItem } from "../ds/react/overlays"
import { Alert } from "../ds/react/primitives"
import { useHote } from "../hote/navigation"
import { useRafraichir } from "../hote/rafraichir"
import { parentDe } from "./freres"
import { GESTES_DU_RAIL } from "./libelles"
import { useAdresseCourante } from "./noeud-ouvert"

type Cible = { chemin: string; nom: string }

/** Les refus qui ont leur phrase : les droits de chaque geste (HN-E05S10e-3, HN-E05S10e-6), et la course de « Supprimer » (HN-E05S10e-24). */
const REFUS = {
  dupliquer: { forbidden: "Dupliquer ce contenu vous est refusé : il faut le lire et pouvoir écrire sous son parent." },
  supprimer: {
    forbidden: "Supprimer ce contenu vous est refusé : il faut sa gestion, et voir tout ce qui est dessous.",
    conflict: "Un contenu vient d'être rangé dessous : rien n'est parti. Réessayez.",
  },
} as const

/** Le pli d'un envoi : le corps `{ path }` validé par le schéma de l'API, puis la réponse. */
async function envoyerLeGeste<T>(ressource: string, chemin: string) {
  const corps = nodePathBodySchema.safeParse({ path: chemin })
  if (!corps.success) return { erreur: { code: "invalid_arguments", statut: 400 } } as const
  return appelerPlateforme<T>({ methode: "POST", ressource, corps: corps.data })
}

/** La ligne de l'arbre du rail d'un chemin, par son lien : celle qui reçoit le focus quand la ligne supprimée part. */
export function ligneDuRail(prefixe: string, chemin: string): HTMLElement | undefined {
  const adresse = `${prefixe}${chemin}`
  return [...document.querySelectorAll<HTMLElement>(".oto-rail-tree a[href]")].find((lien) => lien.getAttribute("href") === adresse)
}

export type GestesDuRail = {
  /** Les items du « ⋯ » d'une ligne qui se déplace : « Dupliquer », puis « Supprimer ». */
  itemsPour: (cible: Cible) => MenuItem[]
  /** À rendre une fois : la confirmation de la suppression, l'annonce et le refus. */
  retour: ReactNode
}

type Lecture = {
  prefixe: string
  /** Les sous-contenus visibles d'un nœud, qui partent avec lui. */
  sousContenus: (chemin: string) => number
  /** La ligne qui précède un nœud à l'écran (son frère d'avant, sinon son parent), où va le focus quand il part. */
  precedente: (chemin: string) => string | null
}

export function useGestesDuRail({ prefixe, sousContenus, precedente }: Lecture): GestesDuRail {
  const { naviguer } = useHote()
  // L'adresse de la page ouverte, un ancien chemin reconnu (AC-b12) : supprimée, elle ne reste pas ouverte.
  const adresse = useAdresseCourante(prefixe)
  const rafraichir = useRafraichir()
  const [aSupprimer, setASupprimer] = useState<Cible | null>(null)
  const [enCours, setEnCours] = useState<string | null>(null)
  const [refus, setRefus] = useState<string | null>(null)
  const [annonce, setAnnonce] = useState("")
  const [focusVers, setFocusVers] = useState<string | null>(null)

  // Après la fermeture du dialogue, qui rend d'abord le focus à son déclencheur, parti avec la ligne.
  useEffect(() => {
    if (focusVers === null) return
    ligneDuRail(prefixe, focusVers)?.focus()
    setFocusVers(null)
  }, [focusVers, prefixe])

  function commencer(libelle: string) {
    setRefus(null)
    setAnnonce("")
    setEnCours(libelle)
  }

  async function dupliquer(cible: Cible) {
    commencer(GESTES_DU_RAIL.duplicationEnCours)
    const reponse = await envoyerLeGeste<{ path: string }>("nodes/duplicate", cible.chemin)
    setEnCours(null)
    if (reponse.erreur) {
      setRefus(messageDErreur(reponse.erreur, REFUS.dupliquer))
      if (reponse.erreur.code === "not_found") rafraichir()
      return
    }
    naviguer(`${prefixe}${reponse.data.path}`)
    rafraichir()
  }

  async function supprimer(cible: Cible) {
    commencer(GESTES_DU_RAIL.suppressionEnCours)
    const reponse = await envoyerLeGeste<{ path: string; count: number }>("trash", cible.chemin)
    setEnCours(null)
    setASupprimer(null)
    if (reponse.erreur) {
      setRefus(messageDErreur(reponse.erreur, REFUS.supprimer))
      if (reponse.erreur.code === "not_found") rafraichir()
      return
    }
    setAnnonce(GESTES_DU_RAIL.supprime(cible.nom))
    setFocusVers(precedente(cible.chemin))
    // La page ouverte est partie avec lui : son parent s'ouvre (la racine ouvre le Contexte de l'organisation).
    const ouverte = adresse.startsWith(prefixe) ? adresse.slice(prefixe.length) : null
    if (ouverte === cible.chemin || ouverte?.startsWith(`${cible.chemin}/`)) naviguer(`${prefixe}${parentDe(cible.chemin) || RACINE}`)
    rafraichir()
  }

  const nombre = aSupprimer ? sousContenus(aSupprimer.chemin) : 0
  const retour = (
    <>
      {/* Montée vide : l'envoi, puis la suppression faite, s'annoncent. */}
      <p role="status" className="oto-sr-only">
        {enCours ?? annonce}
      </p>
      {refus && <Alert tone="fail">{refus}</Alert>}
      {aSupprimer && (
        <ConfirmDialog
          open
          title={GESTES_DU_RAIL.confirmerLaSuppression(aSupprimer.nom)}
          confirmLabel={GESTES_DU_RAIL.supprimer}
          onConfirm={() => void supprimer(aSupprimer)}
          onCancel={() => setASupprimer(null)}
          busy={enCours !== null}
        >
          <p>{GESTES_DU_RAIL.corbeille}</p>
          {nombre > 0 && <p>{GESTES_DU_RAIL.partentAvec(nombre)}</p>}
        </ConfirmDialog>
      )}
    </>
  )

  return {
    itemsPour: (cible) => [
      { label: GESTES_DU_RAIL.dupliquer, icon: <AnimatedIcon as={Copy} size="xs" />, onSelect: () => void dupliquer(cible) },
      { separator: true },
      { label: GESTES_DU_RAIL.supprimer, icon: <AnimatedIcon as={Trash} size="xs" />, destructive: true, onSelect: () => setASupprimer(cible) },
    ],
    retour,
  }
}
