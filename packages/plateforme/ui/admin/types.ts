// Les formes que partagent les écrans d'administration (E05-S09 partie d2).
import type { ComponentType, ReactNode } from "react"
import type { AdressesDuRail } from "../coque/types"

/**
 * Le lien de l'hôte (`next/link`, le lien d'un autre routeur) tel que ces écrans l'emploient : la forme du
 * lien d'`ErreurDeLecture` et d'`AccesPlateforme`, écrite ici plutôt qu'importée du navigateur d'arbre, que
 * le rail remplace (AC-d2).
 */
export type LienDeLAdministration = ComponentType<{ href: string; className?: string; "aria-current"?: "page"; children: ReactNode }>

/**
 * Ce qui range un écran dans son fil : les adresses que l'hôte donne au rail, et le droit de la personne
 * (`isOrgAdmin`), qui ne montre dans le fil que les écrans qu'elle peut ouvrir, comme le menu de l'entreprise.
 */
export type FilDeLEcran = { adresses: AdressesDuRail; administre: boolean }
