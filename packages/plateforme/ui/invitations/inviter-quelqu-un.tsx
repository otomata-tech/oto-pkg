"use client"

// « Inviter quelqu'un » (AC28) : adresse, rôle et équipe, envoyés à `POST /api/plateforme/invitations`
// sur le schéma partagé avec l'API (`schemas/invitations.ts`).
//
// Porté d'oto-frontend (`components/settings/invite-someone.tsx`). Repris : messages constants par
// code, doublon rendu sous le champ, région `status` montée d'emblée, bouton désarmé seulement
// pendant l'envoi, « un email vient de partir » (jamais la promesse de réception) ; depuis E05-S09
// (partie d1), les champs, l'aide et le bouton du design system (`Field`, `Input`, `Select`, `Button`),
// et le dialogue de l'en-tête qui l'ouvre (`BoutonDInvitation`). Retiré : TanStack Query, lien copiable
// (`emailed: false`), `useZodForm` local, lucide. Ajouté : rôle et équipe (H72).
import { useId, useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { FormProvider, useForm, useFormContext } from "react-hook-form"
import { inviteSchema, type Invite, type InviteInput, type InvitationRole } from "../../schemas"
import { appelerPlateforme, type ErreurPlateforme } from "../api/client"
import { messageDErreur } from "../api/messages"
import { Field, Input } from "../ds/react/forms"
import { Button } from "../ds/react/primitives"
import { Select } from "../ds/react/select"
import { useRafraichir } from "../hote/rafraichir"

type Choix = { id: string; nom: string }

type InviterQuelquUnProps = {
  /** Les équipes que l'appelant peut proposer : toutes pour l'admin, les siennes pour un responsable. */
  equipes: Choix[]
  rolesPermis: InvitationRole[]
  /** Un responsable invite toujours dans une de ses équipes : « Aucune équipe » n'est pas proposé. */
  equipeObligatoire: boolean
}

type InvitationCreee = { invitation: { email: string } }

const ROLES: readonly { id: InvitationRole; nom: string }[] = [
  { id: "member", nom: "Membre" },
  { id: "admin", nom: "Administrateur" },
]
const EMAIL_INVALIDE = "Saisissez une adresse email valide."

/** Un refus qui se corrige en changeant l'adresse se rend sous elle ; le reste est global. */
function surLeChampEmail(erreur: ErreurPlateforme): boolean {
  if (erreur.code === "invalid_arguments") return true
  return erreur.code === "conflict" && (erreur.raison === "already_member" || erreur.raison === "already_invited")
}

type ChampChoixProps = {
  libelle: string
  nom: "role" | "teamId"
  choix: readonly Choix[]
  /** Libellé d'une première option vide (valeur `""`) ; sans lui, aucune. */
  optionVide?: string
}

/**
 * Un choix dans une liste (rôle, équipe). Il lit le formulaire par son contexte : ses props restent
 * des données (`portage-ecrans.md § 2`).
 */
function ChampChoix({ libelle, nom, choix, optionVide }: ChampChoixProps) {
  const { register } = useFormContext<InviteInput, unknown, Invite>()
  const options = [...(optionVide === undefined ? [] : [{ value: "", label: optionVide }]), ...choix.map((option) => ({ value: option.id, label: option.nom }))]
  return (
    <Field label={libelle}>
      <Select options={options} {...register(nom)} />
    </Field>
  )
}

export function InviterQuelquUn({ equipes, rolesPermis, equipeObligatoire }: InviterQuelquUnProps) {
  const id = useId()
  // L'invitation envoyée apparaît dans le tableau des personnes après relecture (E05-S03, AC5).
  const rafraichir = useRafraichir()
  const [annonce, setAnnonce] = useState("")
  const form = useForm<InviteInput, unknown, Invite>({
    resolver: zodResolver(inviteSchema),
    mode: "onBlur",
    defaultValues: { email: "", role: "member", teamId: equipeObligatoire ? (equipes[0]?.id ?? "") : "" },
  })
  const { errors, isSubmitting } = form.formState
  // Le message de Zod (anglais) ne s'affiche pas : une erreur de saisie a sa phrase, un refus du
  // serveur la sienne (`ui/api/messages.ts`).
  const erreurEmail = errors.email ? (errors.email.type === "server" ? errors.email.message : EMAIL_INVALIDE) : undefined

  async function envoyer(invitation: Invite) {
    setAnnonce("")
    const reponse = await appelerPlateforme<InvitationCreee>({ methode: "POST", ressource: "invitations", corps: invitation })
    if (reponse.erreur) {
      const message = messageDErreur(reponse.erreur)
      if (surLeChampEmail(reponse.erreur)) form.setError("email", { type: "server", message }, { shouldFocus: true })
      else form.setError("root", { type: "server", message })
      return
    }
    setAnnonce(`Invitation envoyée : un email vient de partir à ${reponse.data.invitation.email}`)
    form.resetField("email")
    rafraichir()
  }

  return (
    <FormProvider {...form}>
      <form noValidate onSubmit={(evenement) => void form.handleSubmit(envoyer)(evenement)} className="flex flex-col gap-3">
        {/* Montée d'emblée, vide : une région montée avec son message n'est pas annoncée. */}
        <div role="status" className="oto-caption">
          {annonce}
        </div>

        <Field id={`${id}-email`} label="Adresse email" error={erreurEmail}>
          <Input type="email" autoComplete="email" {...form.register("email")} />
        </Field>

        {rolesPermis.length > 1 && <ChampChoix libelle="Rôle" nom="role" choix={ROLES.filter((role) => rolesPermis.includes(role.id))} />}
        <ChampChoix libelle="Équipe" nom="teamId" choix={equipes} optionVide={equipeObligatoire ? undefined : "Aucune équipe"} />

        {errors.root?.message && <p role="alert">{errors.root.message}</p>}

        <Button type="submit" variant="primary" disabled={isSubmitting} aria-busy={isSubmitting}>
          {isSubmitting ? "Envoi…" : "Envoyer l'invitation"}
        </Button>
      </form>
    </FormProvider>
  )
}
