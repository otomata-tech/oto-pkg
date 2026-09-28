"use client"

// Poser ou remplacer une règle sur un nœud (E05-S03, AC17, fiche D4) : une équipe ou un membre de
// l'organisation, et un niveau, envoyés à `POST /api/plateforme/rules` après le schéma partagé avec
// l'API (`setNodeRuleSchema`). « Règle enregistrée. » se dit dans une région `status` montée vide.
// Une règle qui vise la personne qui regarde, ou l'une de ses équipes, peut lui retirer la gestion
// (`node_level_for`) : la relecture retire alors le formulaire, et le focus va au titre du panneau ;
// si elle lui retire aussi la lecture, à l'alerte qui remplace le panneau, sous la même ancre.
//
// Porté d'oto-frontend (`components/noeud/acces-du-noeud.tsx`, `AjouterQuelquun`). Repris : un seul
// champ pour « une personne ou une équipe ». Retiré : la saisie libre, le rôle figé en mention (ici
// un vrai choix de niveau), le popover. Depuis E05-S09 (partie d1), les champs et le bouton du design system
// porté (`Field`, `Select`, `Button`).
import { useId, useLayoutEffect, useRef, useState, useTransition, type FormEvent } from "react"
import { setNodeRuleSchema, type AccessLevelName } from "../../schemas"
import { appelerPlateforme } from "../api/client"
import { messageDErreur } from "../api/messages"
import { replierLeFocusSur } from "../components/focus"
import { Field } from "../ds/react/forms"
import { Button } from "../ds/react/primitives"
import { Select } from "../ds/react/select"
import { useRafraichir } from "../hote/rafraichir"
import { NIVEAUX } from "./libelles"
import type { SujetsDeRegle } from "./types"

type AjoutDeRegleProps = {
  chemin: string
  sujets: SujetsDeRegle
  niveaux: readonly AccessLevelName[]
  /**
   * L'ancre du panneau (son titre, ou l'alerte qui le remplace), qui reçoit le focus quand la relecture
   * qui suit un succès retire le formulaire.
   */
  ancre: string
}

type ChoixDeLaRegleProps = { id: string; sujets: SujetsDeRegle; niveaux: readonly AccessLevelName[] }

/** Le sujet et le niveau de la règle ; ses props restent des données (`portage-ecrans.md § 2`). */
function ChoixDeLaRegle({ id, sujets, niveaux }: ChoixDeLaRegleProps) {
  return (
    <>
      <Field id={`${id}-sujet`} label="Équipe ou personne">
        <Select name="sujet">
          {sujets.equipes.length > 0 && (
            <optgroup label="Équipes">
              {sujets.equipes.map((equipe) => (
                <option key={equipe.id} value={`team:${equipe.id}`}>{`équipe ${equipe.nom}`}</option>
              ))}
            </optgroup>
          )}
          {sujets.personnes.length > 0 && (
            <optgroup label="Personnes">
              {sujets.personnes.map((personne) => (
                <option key={personne.id} value={`user:${personne.id}`}>{`personne ${personne.nom}`}</option>
              ))}
            </optgroup>
          )}
        </Select>
      </Field>
      <Field id={`${id}-niveau`} label="Niveau">
        <Select name="niveau" defaultValue="read" options={niveaux.map((niveau) => ({ value: niveau, label: NIVEAUX[niveau] }))} />
      </Field>
    </>
  )
}

export function AjoutDeRegle({ chemin, sujets, niveaux, ancre }: AjoutDeRegleProps) {
  const id = useId()
  const rafraichir = useRafraichir()
  const [erreur, setErreur] = useState("")
  const [annonce, setAnnonce] = useState("")
  const [enCours, demarrer] = useTransition()
  const formulaire = useRef<HTMLFormElement>(null)
  // L'îlot ne peut pas prévoir si son succès retire la gestion à qui regarde : le niveau se calcule en
  // base. Il replie donc le focus à son départ, et seulement après un succès. Un départ sans succès ne
  // le déplace pas : onglet changé, ou démontage simulé du mode strict au chargement, focus sur `<body>`.
  const apresUnSucces = useRef(false)

  useLayoutEffect(() => {
    const geste = formulaire.current
    // Nettoyé avant que React retire le formulaire : le focus y est encore.
    return () => {
      if (!apresUnSucces.current) return
      replierLeFocusSur(ancre, geste)
      // Une règle qui retire aussi la lecture emporte le panneau, titre compris, dans le même rendu :
      // l'alerte qui le remplace, sous la même ancre, n'est posée qu'après ce nettoyage. Le focus l'y
      // rejoint une fois la relecture posée, s'il est tombé sur `<body>` (M13a).
      queueMicrotask(() => replierLeFocusSur(ancre, null))
    }
  }, [ancre])

  function enregistrer(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault()
    apresUnSucces.current = false
    setErreur("")
    setAnnonce("")
    const champs = new FormData(evenement.currentTarget)
    // La valeur d'un sujet est « team:<id> » ou « user:<id> » : un seul champ pour les deux genres.
    const [kind, subjectId] = String(champs.get("sujet") ?? "").split(":")
    const saisie = setNodeRuleSchema.safeParse({ path: chemin, subject: { kind, id: subjectId }, level: champs.get("niveau") })
    if (!saisie.success) {
      setErreur("Choisissez une équipe ou une personne, et un niveau.")
      return
    }
    demarrer(async () => {
      const reponse = await appelerPlateforme({ methode: "POST", ressource: "rules", corps: saisie.data })
      if (reponse.erreur) {
        setErreur(messageDErreur(reponse.erreur))
        return
      }
      apresUnSucces.current = true
      setAnnonce("Règle enregistrée.")
      rafraichir()
    })
  }

  return (
    <form ref={formulaire} noValidate onSubmit={enregistrer} className="flex flex-col gap-2">
      <div role="status" className="oto-caption">
        {annonce}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <ChoixDeLaRegle id={id} sujets={sujets} niveaux={niveaux} />
        <Button type="submit" variant="secondary" disabled={enCours} aria-busy={enCours}>
          Enregistrer la règle
        </Button>
      </div>
      {erreur && <p role="alert">{erreur}</p>}
    </form>
  )
}
