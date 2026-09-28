"use client"

// « Copier mon texte » (E05-S02, AC15, AC16, AC18 ; E05-S09, partie c1) : le texte d'une personne qu'une
// écriture n'a pas enregistré se copie ; le libellé devient « Texte copié » après une copie réussie, un
// échec se dit sans rien prétendre, et le texte reste sélectionnable à l'écran. Sans lui, les trois refus
// qui gardent le texte réécrivaient chacun la même copie. Porté d'oto-frontend (`save-status.tsx`,
// `SaveAlerts`, « Copier mon texte » / « Texte copié ») : le bouton secondaire du design system.
import { useState } from "react"
import { COPIE_IMPOSSIBLE, copierLeTexte } from "../components/presse-papiers"
import { Button } from "../ds/react/primitives"

/** Ce que disent le bouton et la région : ceux d'une copie de son texte par défaut. */
type LibellesDeCopie = { copier: string; copie: string; echec: string }

const COPIE_DE_MON_TEXTE: LibellesDeCopie = { copier: "Copier mon texte", copie: "Texte copié", echec: COPIE_IMPOSSIBLE }

/**
 * `libelles` : ceux d'une autre copie, qui la nomme (« Copier pour la conversation », résumé de la revue
 * d'un tableau, E07-S03) ; des chaînes, jamais une fonction (`portage-ecrans.md § 2`).
 */
export function CopieDuTexte({ texte, libelles = COPIE_DE_MON_TEXTE }: { texte: string; libelles?: LibellesDeCopie }) {
  const [etat, setEtat] = useState<"" | "copie" | "echec">("")
  return (
    <div className="flex flex-col items-start gap-1">
      <Button variant="secondary" size="sm" onClick={async () => setEtat((await copierLeTexte(texte)) ? "copie" : "echec")}>
        {etat === "copie" ? libelles.copie : libelles.copier}
      </Button>
      {/* Montée vide : l'échec s'annonce quand il arrive. */}
      <p role="status" className="oto-caption">
        {etat === "echec" ? libelles.echec : ""}
      </p>
    </div>
  )
}
