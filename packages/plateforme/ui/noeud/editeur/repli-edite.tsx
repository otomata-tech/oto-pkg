"use client"

// Un repli dans l'éditeur (E10-S06, AC-b4) : ouvert, en deux champs, le résumé (une ligne) puis le corps (plusieurs
// lignes). `Entrée` dans le résumé passe au corps ; Retour arrière dans le corps vide revient au résumé ; Échap, ⌘S et
// ⌥↑ / ⌥↓ sont ceux de tout bloc (`clavier.ts`). Il part comme un Texte, quand le focus quitte le repli, sur ⌘S ou
// 1 200 ms après la dernière frappe ; un résumé vide, un repli dans le corps, sont refusés par le contrôle
// (`operations.ts`), le message sous le champ. Sans lui, un repli ne s'écrit que par un assistant.
//
// Écrit dans le style d'oto-frontend, qui n'a pas de repli éditable : les champs du design system (`Input`, et
// `oto-input` sur le `<textarea>` du corps), ouverts à l'écriture (HN-E10S06-3) ; fermé à la lecture (`LinkedContent`).
import { useRef, type KeyboardEvent } from "react"
import { Input } from "../../ds/react/forms"
import { REPLI_EDITE } from "../libelles"
import { useGestes } from "./gestes"
import type { BlocEdite } from "./modele"

type RepliEditeProps = { cle: string; bloc: BlocEdite; mots: string; decritPar?: string; lectureSeule: boolean }

/** Les lignes du corps : sa hauteur suit son texte, avant toute mesure (`field-sizing: content`). */
const lignesDuCorps = (corps: string) => Math.max(2, corps.split("\n").length)

export function RepliEdite({ cle, bloc, mots, decritPar, lectureSeule }: RepliEditeProps) {
  const gestes = useGestes()
  const resume = useRef<HTMLInputElement>(null)
  const corps = useRef<HTMLTextAreaElement>(null)
  const texteDuResume = typeof bloc.data.summary === "string" ? bloc.data.summary : ""
  const texteDuCorps = bloc.text ?? ""
  const ecrire = (nouveauResume: string, nouveauCorps: string) => gestes.modifierLeBloc(cle, { ...bloc, text: nouveauCorps, data: { ...bloc.data, summary: nouveauResume } })
  const aller = (champ: HTMLInputElement | HTMLTextAreaElement | null, curseur: number) => {
    champ?.focus()
    champ?.setSelectionRange(curseur, curseur)
  }

  const toucherLeResume = (evenement: KeyboardEvent<HTMLInputElement>) => {
    if (evenement.key !== "Enter") return gestes.toucher(cle, evenement)
    evenement.preventDefault()
    aller(corps.current, 0)
  }
  // Retour arrière dans un corps vide revient au résumé (AC-b4) ; dans un corps écrit, il reste au corps.
  const toucherLeCorps = (evenement: KeyboardEvent<HTMLTextAreaElement>) => {
    if (evenement.key !== "Backspace" || evenement.currentTarget.value !== "") return gestes.toucher(cle, evenement)
    evenement.preventDefault()
    aller(resume.current, texteDuResume.length)
  }
  // Un autre bloc est en conflit : le repli se lit, et le dit (HN-E05S08-3).
  const auFocus = lectureSeule ? gestes.annoncerLeConflit : undefined

  return (
    <div className="flex flex-col gap-2">
      <Input
        ref={resume}
        data-champ=""
        aria-label={REPLI_EDITE.resume(mots)}
        aria-describedby={decritPar}
        readOnly={lectureSeule}
        value={texteDuResume}
        className="font-medium"
        onChange={(evenement) => ecrire(evenement.target.value, texteDuCorps)}
        onKeyDown={toucherLeResume}
        onFocus={auFocus}
        onBlur={(evenement) => gestes.quitterLeChamp(cle, evenement)}
      />
      <textarea
        ref={corps}
        data-champ=""
        rows={lignesDuCorps(texteDuCorps)}
        aria-label={REPLI_EDITE.corps(mots)}
        aria-describedby={decritPar}
        readOnly={lectureSeule}
        value={texteDuCorps}
        className="oto-input field-sizing-content"
        onChange={(evenement) => ecrire(texteDuResume, evenement.target.value)}
        onKeyDown={toucherLeCorps}
        onFocus={auFocus}
        onBlur={(evenement) => gestes.quitterLeChamp(cle, evenement)}
      />
    </div>
  )
}
