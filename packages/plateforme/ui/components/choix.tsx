// Une liste de choix d'un formulaire GET (E05-S05, reprise par E05-S04) : étiquetée, « Tous … » en tête ;
// sa lecture en échec se dit à sa place, avec « Réessayer », jamais une liste vide (`portage-ecrans.md
// § 4`). Server Component ; la liste est le `Select` du design system (E05-S11, retour 8). Sans lui, le
// journal et la liste des procédures réécrivaient chacun leur liste et son échec.
import type { ComponentProps } from "react"
import type { Resultat } from "../api/resultat"
import { Select } from "../ds/react/select"
import { LIBELLE } from "./classes"
import { ErreurDeLecture } from "./erreur-de-lecture"

/**
 * Le lien de l'hôte, que ce choix ne sert qu'à passer à « Réessayer » : son type est celui
 * d'`ErreurDeLecture`, lu sur elle plutôt qu'importé du navigateur d'arbre, que le rail remplace (E05-S09 d2).
 */
type LienDuChoix = NonNullable<ComponentProps<typeof ErreurDeLecture>["Lien"]>

/** Un choix : la valeur envoyée, le nom montré. */
type Option = { id: string; nom: string }

type ChoixProps = {
  /** L'identifiant du champ, que son étiquette cite. */
  id: string
  /** Le paramètre de l'adresse (`equipe`, `personne`). */
  nom: string
  libelle: string
  /** Le premier choix, sans valeur : « Toutes les équipes ». */
  tous: string
  options: Resultat<Option[]>
  valeur: string | undefined
  /** L'adresse courante, pour « Réessayer ». */
  ici: string
  Lien: LienDuChoix
}

export function Choix({ id, nom, libelle, tous, options, valeur, ici, Lien }: ChoixProps) {
  if (options.error !== undefined) return <ErreurDeLecture message={options.error} href={ici} Lien={Lien} />
  return (
    <div className="space-y-1">
      <label htmlFor={id} className={LIBELLE}>
        {libelle}
      </label>
      <Select id={id} name={nom} defaultValue={valeur ?? ""} options={[{ value: "", label: tous }, ...options.data.map((option) => ({ value: option.id, label: option.nom }))]} />
    </div>
  )
}

/** Les choix d'une lecture, son échec gardé. */
export function optionsDe<T>(resultat: Resultat<T[]>, option: (element: T) => Option): Resultat<Option[]> {
  return resultat.error === undefined ? { data: resultat.data.map(option) } : { error: resultat.error }
}
