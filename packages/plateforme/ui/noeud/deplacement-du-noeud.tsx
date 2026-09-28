"use client"

// « Déplacer » (E05-S02, AC20, AC21 ; H58, H71, P12) : au niveau gestion, un formulaire propose le nouveau
// parent parmi l'arbre visible, annonce le nouveau chemin, l'alias de l'ancien, les sous-pages qui suivent
// et le propriétaire hérité, puis envoie `POST /api/plateforme/nodes/move` (`moveNodeSchema`, E03-S07) ;
// la nouvelle adresse s'ouvre ensuite (`prefixeDesPages`, chaîne reçue de l'hôte). Le dernier segment du
// chemin est gardé (HN-E05S02-7). Sans lui, un nœud ne change de place que par le MCP admin (E08-S06).
// AC-b7 (E05-S10) : le formulaire et l'envoi servent le « Déplacer » du rail (`coque/deplacement-dans-le-rail.tsx`).
// E05-S13 (AC-20, HN-E05S13-10) : le bouton d'en-tête (`DeplacementDuNoeud`, AC-b4) est retiré, doublon du rail.
import { useEffect, useId, useState, type KeyboardEvent } from "react"
import { FormProvider, useForm, useFormContext } from "react-hook-form"
import { moveNodeSchema } from "../../schemas"
import { appelerPlateforme, type ErreurPlateforme } from "../api/client"
import { messageDErreur } from "../api/messages"
import { Button } from "../ds/react/primitives"
import { Select } from "../ds/react/select"
import { DEPLACEMENT } from "./libelles"

export type Destination = { chemin: string; titre: string }

type Choix = { parent: string }

/** Aucun parent choisi : une valeur qu'aucun chemin ne peut prendre (H51), la racine étant `""`. */
const AUCUN = "-"

/** Le nouveau chemin d'un nœud sous un parent : son dernier segment gardé (HN-E05S02-7) ; `""` : la racine. */
export function cheminSous(parent: string, chemin: string): string {
  const nom = chemin.slice(chemin.lastIndexOf("/") + 1)
  return parent ? `${parent}/${nom}` : nom
}

/** « Nouveau parent », relié au formulaire par son contexte : ses props restent des données (`portage-ecrans.md § 2`). */
function ChoixDuParent({ id, destinations }: { id: string; destinations: Destination[] }) {
  const { register } = useFormContext<Choix>()
  return (
    <div className="oto-field">
      <label htmlFor={id} className="oto-field-label">
        {DEPLACEMENT.nouveauParent}
      </label>
      <Select id={id} {...register("parent")}>
        <option value={AUCUN}>{DEPLACEMENT.choisir}</option>
        {destinations.map((destination) => (
          <option key={destination.chemin || "racine"} value={destination.chemin}>
            {destination.chemin ? `${destination.titre} (${destination.chemin})` : destination.titre}
          </option>
        ))}
      </Select>
    </div>
  )
}

// Un nom pris ne refuse plus un déplacement (fiche D125) : un `conflict` est une course, dite par `messageDErreur`.
function refusDuDeplacement(erreur: ErreurPlateforme): string {
  if (erreur.statut === 401) return messageDErreur(erreur)
  if (erreur.code === "forbidden") return DEPLACEMENT.refuse
  if (erreur.code === "not_found") return DEPLACEMENT.parentDisparu
  return messageDErreur(erreur)
}

/** Le refus d'un déplacement, dit ; `disparu` : le parent n'est plus visible, la page se relit (AC21). */
export type RefusDuDeplacement = { message: string; disparu: boolean }

/**
 * `POST nodes/move` (E03-S07), le seul envoi d'un déplacement, celui du rail : le chemin où
 * le nœud est arrivé (le premier libre quand le demandé est pris, fiche D125), sinon le refus du service, dit.
 */
export async function envoyerLeDeplacement(chemin: string, nouveauChemin: string): Promise<{ chemin: string } | RefusDuDeplacement> {
  const corps = moveNodeSchema.safeParse({ path: chemin, new_path: nouveauChemin })
  if (!corps.success) return { message: messageDErreur({ code: "invalid_arguments", statut: 400 }), disparu: false }
  const reponse = await appelerPlateforme<{ path: string }>({ methode: "POST", ressource: "nodes/move", corps: corps.data })
  if (!reponse.erreur) return { chemin: reponse.data.path }
  return { message: refusDuDeplacement(reponse.erreur), disparu: reponse.erreur.code === "not_found" }
}

/** Ce qui change dès le choix (AC20), dans une région montée vide. */
function Annonces({ chemin, nouveauChemin, sousPages, fait }: { chemin: string; nouveauChemin: string | null; sousPages: number; fait: string }) {
  return (
    <div role="status" className="space-y-1 text-sm text-ink">
      {fait ? (
        <p>{fait}</p>
      ) : (
        nouveauChemin && (
          <>
            <p>{DEPLACEMENT.nouveauChemin(nouveauChemin)}</p>
            <p>{DEPLACEMENT.alias(chemin)}</p>
            {sousPages > 0 && <p>{DEPLACEMENT.sousPages(sousPages)}</p>}
            <p>{DEPLACEMENT.proprietaire}</p>
          </>
        )
      )}
    </div>
  )
}

export type FormulaireDeDeplacementProps = {
  chemin: string
  /** Les nouveaux parents possibles, calculés depuis l'arbre visible ; `""` : la racine. */
  destinations: Destination[]
  /** Les sous-pages visibles du nœud, qui le suivent. */
  sousPages: number
  /**
   * Ce que fait le choix : le déplacement envoyé, ou d'abord confirmé (le rail, AC-b7) ; il rend la phrase
   * du fait, un refus à dire sous le formulaire, ou `null` quand le geste continue ailleurs.
   */
  deplacer: (nouveauChemin: string) => Promise<{ fait: string } | { refus: string } | null>
  annuler: () => void
}

/**
 * Le formulaire de « Déplacer » : le parent, ce qui change, « Déplacer ici » et « Annuler », le refus dessous.
 * Monté à l'ouverture, démonté à la fermeture : il repart vide à chaque ouverture.
 */
export function FormulaireDeDeplacement({ chemin, destinations, sousPages, deplacer, annuler }: FormulaireDeDeplacementProps) {
  const id = useId()
  const [erreur, setErreur] = useState("")
  const [fait, setFait] = useState("")
  const form = useForm<Choix>({ defaultValues: { parent: AUCUN } })
  const parent = form.watch("parent")
  const nouveauChemin = parent === AUCUN ? null : cheminSous(parent, chemin)
  const { isSubmitting } = form.formState

  // Un îlot survit à la relecture (`portage-ecrans.md § 2`) : un parent qu'elle retire de l'arbre visible
  // (AC21, `not_found`) n'est plus proposé, et le choix revient à « Choisissez un parent ».
  useEffect(() => {
    if (parent !== AUCUN && !destinations.some((destination) => destination.chemin === parent)) form.setValue("parent", AUCUN)
  }, [destinations, parent, form])

  async function envoyer({ parent: choisi }: Choix) {
    if (choisi === AUCUN) return
    setErreur("")
    const issue = await deplacer(cheminSous(choisi, chemin))
    if (issue && "refus" in issue) setErreur(issue.refus)
    if (issue && "fait" in issue) setFait(issue.fait)
  }

  // Pendant l'envoi, Échap ne referme pas le panneau : il le dit au popover (`preventDefault`, `AccessPanel`).
  function garderPendantLEnvoi(evenement: KeyboardEvent<HTMLFormElement>) {
    if (evenement.key === "Escape" && isSubmitting) evenement.preventDefault()
  }

  return (
    <FormProvider {...form}>
      <form noValidate onKeyDown={garderPendantLEnvoi} onSubmit={(evenement) => void form.handleSubmit(envoyer)(evenement)} className="flex w-full flex-col gap-3">
        <ChoixDuParent id={`${id}-parent`} destinations={destinations} />
        <Annonces chemin={chemin} nouveauChemin={nouveauChemin} sousPages={sousPages} fait={fait} />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" size="sm" disabled={isSubmitting || nouveauChemin === null} aria-busy={isSubmitting}>
            {DEPLACEMENT.envoyer}
          </Button>
          <Button variant="ghost" size="sm" onClick={annuler}>
            {DEPLACEMENT.annuler}
          </Button>
        </div>
        {erreur && (
          <p role="alert" className="text-sm text-ink">
            {erreur}
          </p>
        )}
      </form>
    </FormProvider>
  )
}
