"use client"

// Le résumé d'une revue (E07-S03, AC14 ; H99, ADR-009) : un champ en lecture seule, « Résumé de la
// revue », et « Copier pour la conversation », qui passe à « Copié » ; un refus du presse-papiers le
// dit, le texte restant sélectionnable. Pas de widget dans la conversation en V1 : la personne colle
// ce résumé à son assistant. Reçoit le texte, une donnée, jamais une fonction (`portage-ecrans.md § 2`) ;
// la copie est `CopieDuTexte` d'E05-S02, à ses libellés ; le champ est celui du design system d'oto-frontend
// (`Field`, `Textarea`, E05-S09 partie c2). Sans lui, rien ne dit à l'assistant ce que la revue a décidé.
//
// Repris d'Oto (`tools/datastore_review_app.py`, le bilan « Done reviewing: 2 launched, 1 skipped. ») :
// le bilan qui ne compte que les décisions réelles. Retiré : le message posté dans la conversation par
// « Continue in chat ».
import { Field } from "../ds/react/forms"
import { Textarea } from "../ds/react/textarea"
import { CopieDuTexte } from "../noeud/copie-du-texte"
import { REVUE } from "./libelles"

const LIBELLES_DE_LA_COPIE = { copier: REVUE.copier, copie: REVUE.copie, echec: REVUE.copieImpossible }

export function ResumeDeRevue({ texte }: { texte: string }) {
  return (
    <div className="flex flex-col gap-1 px-2">
      <Field label={REVUE.resume}>
        <Textarea readOnly rows={2} value={texte} />
      </Field>
      <CopieDuTexte texte={texte} libelles={LIBELLES_DE_LA_COPIE} />
    </div>
  )
}
