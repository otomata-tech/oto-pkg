"use client"

// La confirmation avant de supprimer une équipe (E05-S03, AC14 ; portée par E05-S09 partie d1) : elle nomme
// l'équipe et ce qui tombe, et c'est elle qui envoie `DELETE /api/platform/teams/<id>`. Portée d'oto-frontend
// (`delete-team-dialog.tsx`) : « Annuler » face à « Supprimer l'équipe », le geste destructeur ni bouton par
// défaut ni autofocus, « Suppression… » pendant l'envoi, le refus dit dans le dialogue (`role="alert"`),
// l'annulation impossible dite. Changé : ce qui tombe est ce que la plateforme retire (ses membres la quittent,
// ses règles d'accès tombent) ; le refus d'une équipe qui possède encore des nœuds ou des comptes les nomme (H69,
// contre-exemple d'Oto : objets orphelins). Retiré : « cette section de leur rail ».
import type { TeamView } from "../../schemas"
import { ConfirmDialog } from "../ds/react/confirm-dialog"
import { useGeste } from "./gestes"
import { pluriel } from "./libelles"

type SuppressionDEquipeProps = { equipe: Pick<TeamView, "id" | "name" | "members">; onFermer: () => void; apresUnDepart: () => void }

export function SuppressionDEquipe({ equipe, onFermer, apresUnDepart }: SuppressionDEquipeProps) {
  const geste = useGeste()
  const supprimer = () =>
    geste.envoyer(
      { methode: "DELETE", ressource: `teams/${equipe.id}` },
      { team_owns_objects: `${equipe.name} possède encore : {objets}. Transférez-les ou supprimez-les avant de supprimer l'équipe.` },
      {
        succes: () => {
          apresUnDepart()
          onFermer()
        },
      },
    )
  return (
    <ConfirmDialog
      open
      onCancel={onFermer}
      title={`Supprimer ${equipe.name}`}
      confirmLabel={geste.enCours ? "Suppression…" : "Supprimer l'équipe"}
      onConfirm={supprimer}
      busy={geste.enCours}
    >
      <p>
        {equipe.members.length === 0
          ? "Personne n'en fait partie ; ses règles d'accès tombent."
          : `${pluriel(equipe.members.length, "personne quitte", "personnes quittent")} cette équipe, et ses règles d'accès tombent.`}
      </p>
      <p>Il n&apos;y a pas d&apos;annulation : pour la retrouver, il faudra la recréer et la recomposer.</p>
      {geste.erreur && <div role="alert">{geste.erreur}</div>}
    </ConfirmDialog>
  )
}
