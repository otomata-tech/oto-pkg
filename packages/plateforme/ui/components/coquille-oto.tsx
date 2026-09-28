import type { ReactNode } from "react"
import type { Theme } from "../../schemas/brand"

/** Les huit familles de teinte du jeu Oto (`ui/styles/oto.css`) ; sans choix, Manuscrit. */
export type ThemeOto = Theme

type CoquilleOtoProps = {
  theme?: ThemeOto
  /**
   * Écran plein cadre (authentification, E05-S07) : la racine couvre la fenêtre, sur le fond du
   * bureau, au lieu d'un îlot arrondi posé sur le fond de l'hôte.
   */
  pleinePage?: boolean
  children: ReactNode
}

/**
 * La racine `.oto` sous laquelle l'hôte monte les écrans du paquet — une seule par page : une
 * `.oto` imbriquée redéclare le thème par défaut et écrase le choix du client. La nuit suit la
 * classe `.dark` que l'hôte pose sur un ancêtre.
 */
export function CoquilleOto({ theme, pleinePage = false, children }: CoquilleOtoProps) {
  const classes = pleinePage ? "oto min-h-dvh bg-desk text-ink" : "oto rounded-lg bg-island p-4 text-ink"
  return (
    <div className={classes} data-oto-theme={theme}>
      {children}
    </div>
  )
}
