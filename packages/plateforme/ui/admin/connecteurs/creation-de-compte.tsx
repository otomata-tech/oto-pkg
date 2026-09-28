"use client"

// « Créer un compte » (E08-S03, AC6) : un compte simulé de l'organisation ou d'une équipe, pour un
// connecteur activable, actif ou non (un compte se prépare avant l'activation, E04-S01), envoyé à
// `POST /api/plateforme/admin/accounts` sur le schéma de l'API (`createAccountSchema`). Un compte
// personnel se crée par son propriétaire, jamais ici (N11). Après un succès, la page se relit.
//
// Absent d'oto-frontend, dont les comptes naissent d'une connexion réelle (V2) : écrit sur le modèle de
// « Créer une équipe » (`ui/equipes/creation-d-equipe.tsx`) et d'« Inviter quelqu'un » (E02-S01), puis posé
// sur les contrôles du design system (E05-S09 partie d2) : `Field`, `Select`, `Input`, `Radio` dans un
// groupe à légende, l'échec en `Alert`, le bouton primaire.
import { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { FormProvider, useForm, useFormContext, useWatch } from "react-hook-form"
import type * as z from "zod/v4"
import { createAccountSchema } from "../../../schemas"
import { appelerPlateforme } from "../../api/client"
import { messageDErreur } from "../../api/messages"
import { Field, Input } from "../../ds/react/forms"
import { Alert, Button } from "../../ds/react/primitives"
import { Radio } from "../../ds/react/radio"
import { Select } from "../../ds/react/select"
import { useRafraichir } from "../../hote/rafraichir"
import { LIBELLE_PRIS } from "../textes"

type NouveauCompte = z.input<typeof createAccountSchema>
type Equipe = { id: string; name: string }

const LIBELLE_INVALIDE = "Le libellé compte de 1 à 80 caractères."
const EQUIPE_MANQUANTE = "Choisissez une équipe."

type CreationDeCompteProps = {
  /** Les connecteurs activables, actifs ou non. */
  connecteurs: string[]
  equipes: Equipe[]
}

/** Le connecteur du compte, parmi les connecteurs activables ; relié au formulaire par son contexte. */
function ChoixDuConnecteur({ connecteurs }: { connecteurs: readonly string[] }) {
  const { register } = useFormContext<NouveauCompte>()
  return (
    <Field label="Connecteur">
      <Select {...register("connector")}>
        {connecteurs.map((connecteur) => (
          <option key={connecteur} value={connecteur}>
            {connecteur}
          </option>
        ))}
      </Select>
    </Field>
  )
}

/** L'équipe du compte, montrée quand le propriétaire est une équipe : son choix part avec elle. */
function ChoixDeLEquipe({ equipes, erreur }: { equipes: readonly Equipe[]; erreur?: string }) {
  const { register } = useFormContext<NouveauCompte>()
  return (
    <Field label="Équipe" error={erreur}>
      <Select {...register("team_id", { shouldUnregister: true, setValueAs: (valeur: string) => valeur || undefined })}>
        <option value="">Choisir une équipe</option>
        {equipes.map((equipe) => (
          <option key={equipe.id} value={equipe.id}>
            {equipe.name}
          </option>
        ))}
      </Select>
    </Field>
  )
}

/** Le propriétaire : l'organisation, ou une équipe choisie dans la liste. */
function ChoixDuProprietaire({ equipes, erreur }: { equipes: readonly Equipe[]; erreur?: string }) {
  const { register } = useFormContext<NouveauCompte>()
  const genre = useWatch<NouveauCompte, "owner_kind">({ name: "owner_kind" })
  return (
    <>
      <fieldset className="oto-radio-group" data-orientation="horizontal">
        <legend>Propriétaire</legend>
        <Radio value="org" label="L'organisation" {...register("owner_kind")} />
        {equipes.length > 0 && <Radio value="team" label="Une équipe" {...register("owner_kind")} />}
      </fieldset>
      {genre === "team" && <ChoixDeLEquipe equipes={equipes} erreur={erreur} />}
    </>
  )
}

export function CreationDeCompte({ connecteurs, equipes }: CreationDeCompteProps) {
  const rafraichir = useRafraichir()
  const [annonce, setAnnonce] = useState("")
  const form = useForm<NouveauCompte>({
    resolver: zodResolver(createAccountSchema),
    mode: "onBlur",
    defaultValues: { connector: connecteurs[0] ?? "", owner_kind: "org", label: "", mode: "simule" },
  })
  const { errors, isSubmitting } = form.formState
  // Le message de Zod (anglais) ne s'affiche pas : une saisie refusée a sa phrase, le libellé pris la sienne.
  const erreurDuLibelle = errors.label ? (errors.label.type === "server" ? errors.label.message : LIBELLE_INVALIDE) : undefined

  async function creer(compte: NouveauCompte) {
    setAnnonce("")
    const reponse = await appelerPlateforme<{ account: { label: string } }>({ methode: "POST", ressource: "admin/accounts", corps: compte })
    if (reponse.erreur) {
      if (reponse.erreur.code === "conflict") form.setError("label", { type: "server", message: LIBELLE_PRIS }, { shouldFocus: true })
      else form.setError("root", { type: "server", message: messageDErreur(reponse.erreur) })
      return
    }
    setAnnonce(`Compte « ${reponse.data.account.label} » créé.`)
    form.reset()
    rafraichir()
  }

  return (
    <FormProvider {...form}>
      <form noValidate aria-label="Créer un compte" onSubmit={(evenement) => void form.handleSubmit(creer)(evenement)} className="flex flex-col gap-3">
        <ChoixDuConnecteur connecteurs={connecteurs} />
        <Field label="Libellé" error={erreurDuLibelle}>
          <Input type="text" {...form.register("label")} />
        </Field>
        <ChoixDuProprietaire equipes={equipes} erreur={errors.team_id ? EQUIPE_MANQUANTE : undefined} />
        <p className="oto-caption">
          Mode : simulé. Rien ne sort du serveur ; les comptes réels arriveront avec le service connecteurs. Un compte personnel se crée par son
          propriétaire, pas ici.
        </p>
        {errors.root?.message && <Alert tone="fail" title={errors.root.message} />}
        <div className="flex items-center gap-3">
          <Button type="submit" variant="primary" disabled={isSubmitting} aria-busy={isSubmitting}>
            {isSubmitting ? "Création…" : "Créer le compte"}
          </Button>
          {/* Montée d'emblée, vide, à côté du bouton : une région montée avec son message n'est pas annoncée. */}
          <p role="status" className="oto-caption">
            {annonce}
          </p>
        </div>
      </form>
    </FormProvider>
  )
}
