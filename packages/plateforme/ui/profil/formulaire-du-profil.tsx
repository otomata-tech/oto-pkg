"use client"

// Le formulaire de la page « Profil » (E05-S11, AC-3 ; H31, P39) : prénom, nom, langue et couleur de la
// personne, envoyés à `PATCH /api/platform/profile` sur le schéma de l'API (`profilePatchSchema`) : seuls
// les champs changés partent, un champ vidé part vide (la clé est retirée), « Enregistrer » est désactivé tant
// que rien ne change, un refus se dit par la table des messages. Prénom et nom partent ensemble : le service
// recompose de leurs deux valeurs le nom que lisent l'annuaire, le rail et l'assistant (HN-E05S11-2). La
// langue règle celle dans laquelle l'assistant répond ; la couleur, le thème de l'application de la personne
// (AC-4, posé par le layout de l'hôte) ; « Celle de l'organisation » retire le choix. L'îlot survit à la
// relecture : une fiche relue remet ses champs à ce qu'elle sert (`values`, `portage-ecrans.md § 2`).
//
// Repris de « Ma fiche » (E05-S04, retirée par E05-S11) : le schéma partagé, seuls les champs changés
// envoyés, le succès dit dans une région montée vide, le focus rendu au titre, la relecture. Porté
// d'oto-frontend (`settings/profile-identity.tsx`, `language-preference.tsx`) : prénom et nom séparés, un nom
// jamais coupé au premier espace, la langue nommée dans sa propre langue et l'avertissement que l'interface
// reste en français ; la couleur en pastilles (`ThemeSwatches` : `.oto-theme-swatches`, `.oto-swatch`,
// chaque pastille dans la portée de son thème). Retiré : l'adresse de connexion, la photo, TanStack Query.
import { useId, useRef, useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { FormProvider, useController, useForm, useFormContext, useFormState } from "react-hook-form"
import { OTO_THEMES, profilePatchSchema, THEME_LABELS, type Language, type ProfilePatch, type ProfileSheet, type Theme } from "../../schemas"
import { appelerPlateforme } from "../api/client"
import { messageDErreur } from "../api/messages"
import { ANCRE } from "../components/classes"
import { replierLeFocusSur } from "../components/focus"
import { Field, Input } from "../ds/react/forms"
import { Island, IslandBody, IslandHead } from "../ds/react/island"
import { Alert, Button } from "../ds/react/primitives"
import { Select } from "../ds/react/select"
import { useRafraichir } from "../hote/rafraichir"
import { PROFIL } from "./libelles"

/**
 * Les champs servis. Une fiche sans prénom ni nom de famille (écrite avant E05-S11) montre son nom entier dans
 * « Prénom », jamais coupé au premier espace, qui inventerait un nom de famille (oto-frontend,
 * `profile-identity.tsx`).
 */
function valeursDe({ profile }: ProfileSheet): ProfilePatch {
  const separe = profile.first_name !== undefined || profile.last_name !== undefined
  return {
    first_name: separe ? (profile.first_name ?? "") : (profile.name ?? ""),
    last_name: profile.last_name ?? "",
    language: profile.language ?? "",
    theme: profile.theme ?? "",
  }
}

/** Prénom ou nom : un champ du design system, son erreur sous lui. */
function ChampDuNom({ nom, libelle, autoComplete }: { nom: "first_name" | "last_name"; libelle: string; autoComplete: string }) {
  const { register } = useFormContext<ProfilePatch>()
  const erreur = useFormState<ProfilePatch>({ name: nom }).errors[nom]
  return (
    <Field label={libelle} error={erreur ? PROFIL.tropLong : undefined}>
      <Input type="text" autoComplete={autoComplete} {...register(nom)} />
    </Field>
  )
}

/** « Langue » : celle de l'organisation (et ce qu'elle vaut), puis les langues nommées dans leur propre langue. */
function ChoixDeLaLangue({ langueDeLOrganisation }: { langueDeLOrganisation: Language }) {
  const { register } = useFormContext<ProfilePatch>()
  const options = [
    { value: "", label: PROFIL.langueDeLOrganisation(PROFIL.langues[langueDeLOrganisation]) },
    ...Object.entries(PROFIL.langues).map(([value, label]) => ({ value, label })),
  ]
  return (
    <Field label={PROFIL.langue} hint={PROFIL.aideDeLaLangue}>
      <Select options={options} {...register("language")} />
    </Field>
  )
}

/** Les huit thèmes en pastilles : chacune montre le primaire de son thème, le choisi porte l'anneau. */
function Pastilles({ choisi, choisir }: { choisi: string; choisir: (theme: Theme) => void }) {
  return (
    <span className="oto-theme-swatches">
      {OTO_THEMES.map((theme) => (
        <button
          key={theme}
          type="button"
          className="oto-swatch"
          aria-pressed={choisi === theme}
          aria-label={THEME_LABELS[theme][0]}
          title={THEME_LABELS[theme][0]}
          onClick={() => choisir(theme)}
        >
          <i className="oto" data-oto-theme={theme} aria-hidden="true" />
        </button>
      ))}
    </span>
  )
}

/** « Couleur » : celle de l'organisation (sa pastille), puis les huit thèmes ; un seul bouton pressé. */
function ChoixDeLaCouleur({ themeDeLOrganisation }: { themeDeLOrganisation: Theme }) {
  const id = useId()
  const { field } = useController<ProfilePatch, "theme">({ name: "theme" })
  const choisi = field.value ?? ""
  return (
    <div className="oto-field">
      <span id={`${id}-libelle`} className="oto-field-label">
        {PROFIL.couleur}
      </span>
      <div role="group" aria-labelledby={`${id}-libelle`} aria-describedby={`${id}-aide`} className="flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          aria-pressed={choisi === ""}
          iconStart={<span className="oto oto-menu-dot" data-oto-theme={themeDeLOrganisation} aria-hidden="true" />}
          onClick={() => field.onChange("")}
        >
          {PROFIL.couleurDeLOrganisation}
        </Button>
        <Pastilles choisi={choisi} choisir={field.onChange} />
      </div>
      <p id={`${id}-aide`} className="oto-field-hint">
        {PROFIL.aideDeLaCouleur}
      </p>
    </div>
  )
}

export function FormulaireDuProfil({ fiche }: { fiche: ProfileSheet }) {
  const id = useId()
  const rafraichir = useRafraichir()
  const formulaire = useRef<HTMLFormElement>(null)
  const [statut, setStatut] = useState("")
  const form = useForm<ProfilePatch>({ resolver: zodResolver(profilePatchSchema), mode: "onBlur", values: valeursDe(fiche) })
  const { errors, isDirty, isSubmitting, dirtyFields } = form.formState

  async function enregistrer(saisie: ProfilePatch) {
    setStatut("")
    const corps: ProfilePatch = {
      ...(dirtyFields.first_name || dirtyFields.last_name ? { first_name: saisie.first_name ?? "", last_name: saisie.last_name ?? "" } : {}),
      ...(dirtyFields.language ? { language: saisie.language ?? "" } : {}),
      ...(dirtyFields.theme ? { theme: saisie.theme ?? "" } : {}),
    }
    const reponse = await appelerPlateforme({ methode: "PATCH", ressource: "profile", corps })
    if (reponse.erreur) {
      form.setError("root", { type: "server", message: messageDErreur(reponse.erreur) })
      return
    }
    // Le profil enregistré désactive « Enregistrer », qui a le focus : il va au titre, jamais à `<body>`
    // (`accessibility-patterns.md § Après une action`).
    replierLeFocusSur(`${id}-titre`, formulaire.current)
    form.reset(saisie)
    setStatut(PROFIL.enregistre)
    // La relecture reprend la couleur dans la coque de l'hôte et le nom dans le rail.
    rafraichir()
  }

  return (
    <FormProvider {...form}>
      <form ref={formulaire} noValidate onSubmit={(evenement) => void form.handleSubmit(enregistrer)(evenement)} className="flex flex-col gap-3">
        <Island aria-labelledby={`${id}-titre`}>
          <IslandHead>
            <h2 id={`${id}-titre`} tabIndex={-1} className={ANCRE}>
              {PROFIL.vous}
            </h2>
          </IslandHead>
          <IslandBody className="flex flex-col gap-3">
            <ChampDuNom nom="first_name" libelle={PROFIL.prenom} autoComplete="given-name" />
            <ChampDuNom nom="last_name" libelle={PROFIL.nom} autoComplete="family-name" />
          </IslandBody>
        </Island>
        <Island aria-labelledby={`${id}-preferences`}>
          <IslandHead>
            <h2 id={`${id}-preferences`}>{PROFIL.preferences}</h2>
          </IslandHead>
          <IslandBody className="flex flex-col gap-3">
            <ChoixDeLaLangue langueDeLOrganisation={fiche.organisation.language} />
            <ChoixDeLaCouleur themeDeLOrganisation={fiche.organisation.theme} />
            {errors.root?.message && <Alert tone="fail" title={errors.root.message} />}
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" variant="primary" disabled={!isDirty || isSubmitting} aria-busy={isSubmitting}>
                {isSubmitting ? PROFIL.enregistrement : PROFIL.enregistrer}
              </Button>
              {/* Montée vide, remplie après un enregistrement : une région de statut n'annonce que ce qui change. */}
              <p role="status" className="oto-caption">
                {statut}
              </p>
            </div>
          </IslandBody>
        </Island>
      </form>
    </FormProvider>
  )
}
