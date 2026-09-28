"use client"

// Les dialogues du menu d'une personne (E05-S03, AC6, AC9 ; portés par E05-S09 partie d1) : la confirmation
// qui DEMANDE, puis, à un refus, le dialogue qui CONSTATE ; jamais ouverts ensemble (la confirmation se ferme
// au clic, avant la réponse : deux `<dialog>` natifs superposés se disputeraient le focus). Portés
// d'oto-frontend (`remove-member-dialog.tsx`, `revoke-invitation-dialogs.tsx`) : la question nomme la
// personne, le geste destructeur n'est jamais le bouton par défaut ni celui qui a le focus ; « Garder
// l'invitation » face à « Annuler l'invitation », « Annuler » face à « Retirer » ; l'échec en
// `role="alert"`. Changé : ce qui tombe au retrait est ce qui tombe dans la plateforme (équipes, partages
// nominatifs ; les pages personnelles restent), la question d'un administrateur qui se retire lui-même ;
// la phrase d'un refus vient de `messageDErreur`. Retiré : l'effet hors d'Oto (fournisseurs, courriel),
// « Quitter l'entreprise… ».
import { ConfirmDialog } from "../ds/react/confirm-dialog"
import { Button } from "../ds/react/primitives"
import { Dialog } from "../ds/react/dialog"

type DialogueDeRetraitProps = {
  nom: string
  soi: boolean
  nomOrganisation: string
  open: boolean
  onRenoncer: () => void
  onConfirmer: () => void
}

export function DialogueDeRetrait({ nom, soi, nomOrganisation, open, onRenoncer, onConfirmer }: DialogueDeRetraitProps) {
  return (
    <ConfirmDialog
      open={open}
      onCancel={onRenoncer}
      title={soi ? `Vous retirer de ${nomOrganisation} ?` : `Retirer ${nom} de ${nomOrganisation} ?`}
      confirmLabel={`Retirer de ${nomOrganisation}`}
      onConfirm={onConfirmer}
    >
      {soi ? (
        <p>{`Vous perdrez l'accès à ${nomOrganisation}.`}</p>
      ) : (
        <p>Ses équipes et ses partages nominatifs tombent ; ses pages personnelles restent, invisibles de tous.</p>
      )}
      <p>Il n&apos;y a pas de retour en arrière : pour revenir, il faudra une nouvelle invitation.</p>
    </ConfirmDialog>
  )
}

type DialogueDAnnulationProps = { email: string; nomOrganisation: string; open: boolean; onRenoncer: () => void; onConfirmer: () => void }

export function DialogueDAnnulation({ email, nomOrganisation, open, onRenoncer, onConfirmer }: DialogueDAnnulationProps) {
  return (
    <ConfirmDialog
      open={open}
      onCancel={onRenoncer}
      title={`Annuler l'invitation de ${email} ?`}
      cancelLabel="Garder l'invitation"
      confirmLabel="Annuler l'invitation"
      onConfirm={onConfirmer}
    >
      <p>{`L'invitation quitte la file d'attente, et ne permettra plus de rejoindre ${nomOrganisation}.`}</p>
      <p>Il n&apos;y a pas de retour en arrière : pour que cette personne vienne, il faudra l&apos;inviter à nouveau.</p>
    </ConfirmDialog>
  )
}

type DialogueDEchecProps = { titre: string; message: string; onFermer: () => void }

/** Ouvert par un refus, et par rien d'autre : un succès retire la ligne, il n'a rien à annoncer. */
export function DialogueDEchec({ titre, message, onFermer }: DialogueDEchecProps) {
  return (
    <Dialog
      open={message !== ""}
      onClose={onFermer}
      title={titre}
      size="sm"
      footer={
        <Button variant="secondary" onClick={onFermer}>
          Fermer
        </Button>
      }
    >
      {message && <div role="alert">{message}</div>}
    </Dialog>
  )
}
