"use client"

// « Créer une équipe » (E05-S03, AC11 ; porté par E05-S09 partie d1) : l'action de l'en-tête de l'écran quand
// l'onglet des équipes est ouvert, un dialogue, un nom, envoyé à `POST /api/plateforme/teams` sur le schéma
// partagé avec l'API (`createTeamSchema`), refusé sous le champ avant tout envoi. Le dossier et le Contexte de
// l'équipe naissent en base (P39), rien ici. Porté d'oto-frontend (`create-team-dialog.tsx` et le bouton de
// `settings.members.lazy.tsx`) : le champ « Nom de la nouvelle équipe », son exemple, le focus posé dans le
// champ à l'ouverture, « nom déjà pris » sous le champ, « Création… » pendant l'envoi ; le formulaire repart
// vierge à chaque ouverture. Changé : React Hook Form sur le schéma partagé plutôt qu'un formulaire natif, la
// relecture par l'hôte. Retiré : TanStack Query.
import { useEffect, useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { UsersThree } from "@phosphor-icons/react/dist/csr/UsersThree"
import { createTeamSchema, type CreateTeam } from "../../schemas"
import { appelerPlateforme } from "../api/client"
import { messageDErreur } from "../api/messages"
import { Dialog } from "../ds/react/dialog"
import { Field, Input } from "../ds/react/forms"
import { AnimatedIcon } from "../ds/react/icon"
import { Button } from "../ds/react/primitives"
import { useRafraichir } from "../hote/rafraichir"
import { NOM_D_EQUIPE_INVALIDE, refusDuNom, surLeNom } from "./libelles"

const TITRE = "Créer une équipe"

type FormulaireProps = { nomOrganisation: string; ouvert: boolean; onCree: () => void }

function FormulaireDeCreation({ nomOrganisation, ouvert, onCree }: FormulaireProps) {
  const rafraichir = useRafraichir()
  const form = useForm<CreateTeam>({ resolver: zodResolver(createTeamSchema), mode: "onBlur", defaultValues: { name: "" } })
  const { errors, isSubmitting } = form.formState
  // Le message de Zod (anglais) ne s'affiche pas : une saisie refusée a sa phrase, un refus du serveur la sienne.
  const erreurDuNom = errors.name ? (errors.name.type === "server" ? errors.name.message : NOM_D_EQUIPE_INVALIDE) : undefined
  const { setFocus } = form

  // Le `<dialog>` natif focalise son premier élément à l'ouverture ; cet effet passe après lui et pose le
  // focus là où l'on écrit, à l'ouverture seulement (jamais au montage de l'écran, dialogue fermé).
  useEffect(() => {
    if (ouvert) setFocus("name")
  }, [ouvert, setFocus])

  async function creer(equipe: CreateTeam) {
    const reponse = await appelerPlateforme({ methode: "POST", ressource: "teams", corps: equipe })
    if (reponse.erreur) {
      const message = messageDErreur(reponse.erreur, refusDuNom(nomOrganisation))
      if (surLeNom(reponse.erreur)) form.setError("name", { type: "server", message }, { shouldFocus: true })
      else form.setError("root", { type: "server", message })
      return
    }
    onCree()
    rafraichir()
  }

  return (
    <form noValidate onSubmit={(evenement) => void form.handleSubmit(creer)(evenement)} className="flex flex-col gap-3">
      <Field label="Nom de la nouvelle équipe" error={erreurDuNom}>
        {/* Le placeholder n'est pas l'intitulé : il disparaît à la première frappe. */}
        <Input type="text" autoComplete="off" placeholder="Équipe Support" {...form.register("name")} />
      </Field>
      {errors.root?.message && <p role="alert">{errors.root.message}</p>}
      <Button type="submit" variant="primary" disabled={isSubmitting} aria-busy={isSubmitting}>
        {isSubmitting ? "Création…" : "Créer l'équipe"}
      </Button>
    </form>
  )
}

export function CreationDEquipe({ nomOrganisation }: { nomOrganisation: string }) {
  const [ouvert, setOuvert] = useState(false)
  // Un formulaire neuf à chaque ouverture : jamais la saisie ni le refus de la précédente.
  const [ouvertures, setOuvertures] = useState(0)
  return (
    <>
      <Button
        variant="primary"
        iconStart={<AnimatedIcon as={UsersThree} size="xs" aria-hidden="true" />}
        onClick={() => {
          setOuvertures((nombre) => nombre + 1)
          setOuvert(true)
        }}
      >
        {TITRE}
      </Button>
      <Dialog open={ouvert} onClose={() => setOuvert(false)} title={TITRE} size="sm">
        <FormulaireDeCreation key={ouvertures} nomOrganisation={nomOrganisation} ouvert={ouvert} onCree={() => setOuvert(false)} />
      </Dialog>
    </>
  )
}
