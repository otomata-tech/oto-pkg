"use client"

// « Réglages » de l'organisation (E08-S03, AC3) : le nom, validé par le schéma de l'API (`orgSettingsFormSchema`),
// seul nom de l'entreprise (E05-S13, AC-3) ; il ne part à `PATCH /api/platform/admin/org` que changé. Le seuil et
// l'écart du routage (E05-S11, AC-23) et les domaines de travail (E05-S13, AC-1) ne sont plus à l'écran : l'API et
// `admin_org` les règlent, et un envoi qui ne les porte pas les garde tels quels. Après un succès, le
// formulaire reprend la réponse, dit « Enregistré » et la page se relit. L'îlot survit à la relecture :
// ses champs suivent l'organisation servie (`values`, `portage-ecrans.md § 2`).
//
// Porté d'oto-frontend (`components/settings/company-identity.tsx` l. 55-166), E05-S09 partie d2. Repris :
// le nom en champ visible, `Field` et `Input` du design system, l'échec en `Alert tone="fail"` au-dessus des
// champs, « Enregistrer » (`Button` primaire) désactivé tant que rien n'a changé, « Enregistrement… », la
// région `role="status"` montée en permanence, la réinitialisation avec la réponse, un message choisi sur le
// code. Retiré : le logo (l'écran le pose au-dessus), `useZodForm`, TanStack Query.
import { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { FormProvider, useForm, useFormContext, useFormState, useWatch } from "react-hook-form"
import { orgSettingsFormSchema, type OrgSettingsForm, type OrgView } from "../../../schemas"
import { appelerPlateforme } from "../../api/client"
import { Field, Input } from "../../ds/react/forms"
import { Alert, Button } from "../../ds/react/primitives"
import { useRafraichir } from "../../hote/rafraichir"
import { echecDesReglages } from "../textes"

/** Les réglages montrés : les autres restent au schéma, hors de l'écran (AC-23 ; E05-S13, AC-1). */
type Reglage = "name"

/** La saisie refusée avant l'envoi, en français : jamais le message de Zod. */
const INVALIDE: Record<Reglage, string> = {
  name: "Le nom compte de 1 à 80 caractères.",
}

function valeursDe(org: Pick<OrgView, "name">): OrgSettingsForm {
  return { name: org.name }
}

/** Le nom s'il a changé depuis l'état servi (AC3), sinon rien : un réglage absent de l'envoi est gardé par le service. */
function changements(valeurs: Partial<OrgSettingsForm>, servies: Partial<OrgSettingsForm> | undefined): OrgSettingsForm {
  const nom = valeurs.name?.trim()
  return nom !== undefined && nom !== servies?.name ? { name: nom } : {}
}

type ChampProps = {
  nom: Reglage
  libelle: string
}

/** Un champ du design system : son erreur sous lui, reliée par `aria-describedby` (`Field`). */
function Champ({ nom, libelle }: ChampProps) {
  const { register } = useFormContext<OrgSettingsForm>()
  const erreur = useFormState<OrgSettingsForm>({ name: nom }).errors[nom] ? INVALIDE[nom] : undefined
  return (
    <Field label={libelle} error={erreur}>
      <Input type="text" {...register(nom)} />
    </Field>
  )
}

export function FormulaireOrganisation({ organisation }: { organisation: Pick<OrgView, "name"> }) {
  const rafraichir = useRafraichir()
  const [enregistre, setEnregistre] = useState(false)
  const form = useForm<OrgSettingsForm>({ resolver: zodResolver(orgSettingsFormSchema), mode: "onBlur", values: valeursDe(organisation) })
  const courantes = useWatch({ control: form.control })
  const { errors, isSubmitting, defaultValues } = form.formState
  const inchange = Object.keys(changements(courantes, defaultValues)).length === 0

  async function enregistrer(valeurs: OrgSettingsForm) {
    const corps = changements(valeurs, form.formState.defaultValues)
    if (Object.keys(corps).length === 0) return
    const reponse = await appelerPlateforme<{ org: OrgView }>({ methode: "PATCH", ressource: "admin/org", corps })
    if (reponse.erreur) {
      form.setError("root", { type: "server", message: echecDesReglages(reponse.erreur) })
      return
    }
    form.reset(valeursDe(reponse.data.org))
    setEnregistre(true)
    rafraichir()
  }

  return (
    <FormProvider {...form}>
      <form noValidate onSubmit={(evenement) => void form.handleSubmit(enregistrer)(evenement)} className="flex flex-col gap-3">
        {errors.root?.message && <Alert tone="fail" title={errors.root.message} />}
        <Champ nom="name" libelle="Nom" />
        <div className="flex items-center gap-3">
          <Button type="submit" variant="primary" disabled={inchange || isSubmitting} aria-busy={isSubmitting}>
            {isSubmitting ? "Enregistrement…" : "Enregistrer"}
          </Button>
          {/* Montée en permanence, vide : une région n'annonce que ce qui change après son montage. */}
          <p role="status" className="oto-caption">
            {enregistre && inchange ? "Enregistré" : ""}
          </p>
        </div>
      </form>
    </FormProvider>
  )
}
