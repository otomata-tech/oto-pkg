import type { ThemeOto } from "../components/coquille-oto"

/** La marque telle que l'écran la reçoit ; `nomAffiche` est le nom de l'organisation (E05-S13, AC-3). */
export type MarqueDOrganisation = { theme: ThemeOto; logo: string | null; nomAffiche: string }

export type DonneesDeMarque = {
  marque: MarqueDOrganisation
  nomOrganisation: string
  /** Le droit de la RLS (`is_org_admin`), lu par l'hôte : l'écran n'en décide pas. */
  peutModifier: boolean
}

/** Même forme que le retour des actions (`ActionResult`) : des données ou un message. */
export type ResultatDeMarque = { data: DonneesDeMarque; error?: never } | { data?: never; error: string }
