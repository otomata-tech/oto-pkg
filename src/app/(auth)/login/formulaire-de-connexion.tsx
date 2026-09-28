"use client"

import * as React from "react"
import Link from "next/link"
import { unstable_rethrow } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import type { z } from "zod"
import { Alert, Button, Field, IlotDAuthentification, Input } from "@otomata_tech/oto_platform/ui"
import { loginAction, magicLinkAction } from "@/lib/actions/auth"
import { loginSchema } from "@/lib/schemas/auth"
import { LIEN } from "@/app/(auth)/classes-oto"
import { CONNEXION_ECHOUEE, SERVEUR_INJOIGNABLE } from "@/app/(auth)/messages"

// Le formulaire de `/login` : la page, Server Component, lit la marque de l'adresse ; ce qui a un état
// reste ici, dans l'îlot du gabarit. Porté d'oto-frontend (`src/components/auth/sign-in-form.tsx`, avant
// le retrait de sa démonstration) : React Hook Form sur le schéma, validation à la sortie du champ et
// erreur sous le champ, « Adresse mail » et « Mot de passe », « Mot de passe oublié ? » en légende du
// formulaire, l'échec dans un `Alert`, « Se connecter » au pied de l'îlot relié au formulaire par
// `form`, « Connexion… » pendant l'envoi. Ajouté : « Recevoir un lien de connexion » (E02-S01) et les
// boutons des fournisseurs (E09-S03), au pied sous lui ; la page demandée avant la connexion (E02-S02).
// Retiré : TanStack Query et la navigation du routeur (l'action redirige).

const FORMULAIRE = "connexion"
const LIEN_REFUSE =
  "Ce lien de connexion a expiré ou a déjà servi. Saisissez votre email et choisissez « Recevoir un lien de connexion » pour en recevoir un nouveau."

// Les champs saisis, lus dans le schéma de l'action : `redirect` part par le champ caché que pose la page.
const champsDeConnexion = loginSchema.pick({ email: true, password: true })
type ChampsDeConnexion = z.infer<typeof champsDeConnexion>

type FormulaireDeConnexionProps = {
  /** `error=auth_callback_error` : `/auth/confirmer` ou `/auth/callback` a refusé le lien de l'email. */
  searchParams?: Promise<{ error?: string | string[] }>
  /** La page où revenir après la connexion, déjà validée par la page serveur (E02-S02). */
  retour?: string
  /** L'alerte que la page serveur rend au-dessus du formulaire (retour d'un fournisseur, E09-S03). */
  alerte?: React.ReactNode
  /** Les boutons des fournisseurs, rendus par la page serveur, en streaming ; au pied de l'îlot. */
  fournisseurs?: React.ReactNode
}

export function FormulaireDeConnexion({ searchParams, retour, alerte, fournisseurs }: FormulaireDeConnexionProps) {
  // Un lien d'email expiré ou déjà utilisé ramène ici : la page le dit et montre le recours.
  const lienRefuse = searchParams ? React.use(searchParams).error === "auth_callback_error" : false
  const [erreur, setErreur] = React.useState<string | null>(lienRefuse ? LIEN_REFUSE : null)
  const [statutDuLien, setStatutDuLien] = React.useState("")
  const [envoiDuLien, setEnvoiDuLien] = React.useState(false)
  const formulaire = React.useRef<HTMLFormElement>(null)
  const form = useForm<ChampsDeConnexion>({
    resolver: zodResolver(champsDeConnexion),
    mode: "onBlur",
    defaultValues: { email: "", password: "" },
  })
  const { errors, isSubmitting } = form.formState

  // Les champs partent tels que le formulaire les porte, champ caché du retour compris (E02-S02). L'appel
  // rejette quand le serveur est injoignable, et à la réussite : Next 15 rejette la promesse avec la
  // redirection, relancée telle quelle (`api-patterns.md § Type de retour standard`). React Hook Form
  // libère le bouton dans les deux cas.
  const seConnecter = form.handleSubmit(async () => {
    if (!formulaire.current) return
    try {
      const resultat = await loginAction(new FormData(formulaire.current))
      if (resultat?.error) setErreur(resultat.error)
    } catch (rejet) {
      unstable_rethrow(rejet)
      setErreur(SERVEUR_INJOIGNABLE)
    }
  })

  // Le lien de connexion sert l'invitation dont le lien a expiré (1 h) alors qu'elle vit 7 jours (N4) ; il
  // ne lit que l'adresse, validée par la même règle que le formulaire.
  async function recevoirUnLien() {
    setErreur(null)
    setStatutDuLien("")
    if (!(await form.trigger("email"))) return
    setEnvoiDuLien(true)
    const donnees = new FormData()
    donnees.set("email", form.getValues("email"))
    // Le lien de l'email ramène aussi à la page demandée (E02-S02).
    if (retour) donnees.set("redirect", retour)
    // L'appel de l'action peut échouer (réseau, déploiement remplacé) : le bouton se libère et l'échec se
    // dit, au lieu d'un bouton figé sans message.
    try {
      const resultat = await magicLinkAction(donnees)
      setStatutDuLien(resultat.data?.message ?? "")
    } catch {
      setErreur(SERVEUR_INJOIGNABLE)
    } finally {
      setEnvoiDuLien(false)
    }
  }

  // Chaque envoi efface l'échec d'avant, champs refusés compris : il ne se lit plus sous une autre erreur.
  function envoyer(evenement: React.FormEvent<HTMLFormElement>) {
    setErreur(null)
    void seConnecter(evenement)
  }

  // La confirmation du lien s'écrit dans la région de l'îlot, qui ramène le focus au titre.
  return (
    <IlotDAuthentification
      titre="Se connecter"
      statut={statutDuLien}
      pied={
        <>
          <Button type="submit" form={FORMULAIRE} variant="primary" block disabled={isSubmitting} aria-busy={isSubmitting}>
            {isSubmitting ? "Connexion…" : "Se connecter"}
          </Button>
          <Button variant="secondary" block disabled={envoiDuLien} aria-busy={envoiDuLien} onClick={() => void recevoirUnLien()}>
            {envoiDuLien ? "Envoi du lien…" : "Recevoir un lien de connexion"}
          </Button>
          {fournisseurs}
        </>
      }
    >
      {/* `noValidate` : la validation vient du schéma, une seule fois, sous le champ ; sans lui, le
          navigateur refuserait l'envoi avant React, avec une bulle que le dépôt ne maîtrise pas. */}
      <form ref={formulaire} id={FORMULAIRE} className="flex flex-col gap-3" noValidate onSubmit={envoyer}>
        {retour && <input type="hidden" name="redirect" value={retour} />}
        {alerte}
        {erreur && (
          <Alert tone="fail" title={CONNEXION_ECHOUEE}>
            {erreur}
          </Alert>
        )}
        <Field label="Adresse mail" error={errors.email?.message}>
          <Input type="email" autoComplete="email" autoFocus {...form.register("email")} />
        </Field>
        <Field label="Mot de passe" error={errors.password?.message}>
          <Input type="password" autoComplete="current-password" {...form.register("password")} />
        </Field>
        <p className="oto-caption">
          <Link href="/forgot-password" className={LIEN}>
            Mot de passe oublié ?
          </Link>
        </p>
      </form>
    </IlotDAuthentification>
  )
}
