"use client"

// Le dialogue de confirmation (M44, JB 2026-09-27 : « un dialogue de confirmation doit être un composant,
// avec ou sans ces boutons ») : un `Dialog` étroit dont le pied porte, par défaut, « Annuler » (secondaire)
// puis le geste destructif (ton `danger`), à droite. Le geste n'est ni le bouton par défaut (`type="button"`
// de `Button`) ni le focus initial : le `<dialog>` natif focalise son premier élément, « Fermer » de
// l'en-tête, et « Annuler » précède le geste. Annuler, Échap, le fond et « Fermer » renoncent (`onCancel`).
// `footer` remplace les deux boutons ; `null` les retire. Écrit ici plutôt que porté : oto-frontend recopiait
// ce pied dans chaque dialogue (`remove-member-dialog.tsx`, `revoke-invitation-dialogs.tsx`,
// `delete-team-dialog.tsx`), comme le paquet le recopiait dans les siens.
import type { ComponentProps, ReactNode } from "react"
import { Dialog } from "./dialog"
import { Button } from "./primitives"

type Pied =
  | {
      /** Le geste destructif, nommé par ce qu'il fait (« Retirer de l'équipe »). */
      confirmLabel: string
      onConfirm: () => void
      /** « Annuler » par défaut ; un autre mot quand « Annuler » serait le geste (« Garder l'invitation »). */
      cancelLabel?: string
      /** L'envoi en cours : le geste est inerte et le dit (`aria-busy`). */
      busy?: boolean
      footer?: undefined
    }
  | {
      /** Le pied qui remplace les deux boutons ; `null` : aucun pied. */
      footer: ReactNode
      confirmLabel?: undefined
      onConfirm?: undefined
      cancelLabel?: undefined
      busy?: undefined
    }

type ConfirmDialogProps = Omit<ComponentProps<typeof Dialog>, "onClose" | "footer"> & { onCancel: () => void } & Pied

export function ConfirmDialog({ onCancel, confirmLabel, onConfirm, cancelLabel = "Annuler", busy, footer, size = "sm", ...rest }: ConfirmDialogProps) {
  const pied =
    footer !== undefined ? (
      footer
    ) : (
      <>
        <Button variant="secondary" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button variant="danger" onClick={onConfirm} disabled={busy} aria-busy={busy}>
          {confirmLabel}
        </Button>
      </>
    )
  return <Dialog {...rest} size={size} onClose={onCancel} footer={pied} />
}
