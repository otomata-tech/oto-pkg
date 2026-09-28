"use client"

// Un bloc en conflit (E05-S02, AC15 ; E05-S09, partie c1) : ce qui s'est passé, le texte de la personne en
// lecture avec « Copier mon texte », la version enregistrée, le texte final prérempli avec elle (jamais avec
// le texte de la personne), puis les gestes ; un bloc supprimé entre-temps se réinsère ou s'abandonne.
// L'ordre de lecture est celui de la décision : les deux textes avant celui qui partira. Sans lui, un conflit
// perdrait le texte de l'un des deux rédacteurs.
//
// Porté d'oto-frontend (`page-heritee/resolution-du-conflit.tsx`, `version-enregistree.tsx`,
// `champ-du-corps.tsx`). Repris : l'alerte qui naît avec le conflit et une autre quand le bloc a encore
// changé, le texte final gardé d'une relecture à l'autre, l'abandon confirmé, la boîte d'alerte et les
// champs du design system (`oto-alert`, `oto-field`, `oto-input oto-textarea`). Retiré : le `Dialog` modal
// (→ confirmation en ligne), `SkeletonText`.
import { useId, useState } from "react"
import { useConfirmationEnLigne } from "../../components/confirmation-en-ligne"
import { Button } from "../../ds/react/primitives"
import { CopieDuTexte } from "../copie-du-texte"
import { EDITEUR } from "../libelles"
import { useGestes } from "./gestes"
import { texteDe } from "./modele"
import type { Conflit } from "./use-envois"

const TEXTE = "oto-input oto-textarea"

/**
 * « Abandonner mon texte », confirmé en ligne comme `ActionPlateforme` (`useConfirmationEnLigne`) : le
 * bouton cède sa place à la question, « Garder » reçoit le focus ; « Garder » et Échap rendent le bouton
 * et le focus.
 */
function Abandon() {
  const gestes = useGestes()
  const question = useConfirmationEnLigne({ question: EDITEUR.abandonner, libelleConfirmer: "Abandonner", confirmer: gestes.abandonnerMonTexte })
  if (question.ouverte) return question.rendu
  return (
    <Button ref={question.depart} variant="ghost" size="sm" onClick={question.demander}>
      Abandonner mon texte
    </Button>
  )
}

export function ConflitDeBloc({ conflit }: { conflit: Conflit }) {
  const gestes = useGestes()
  const id = useId()
  // Prérempli avec la version enregistrée au premier conflit, puis gardé d'une relecture à l'autre.
  const [final, setFinal] = useState(conflit.version ? texteDe(conflit.version) : "")
  const alerte = conflit.nature === "supprime" ? EDITEUR.blocSupprimeAilleurs : conflit.encore ? EDITEUR.blocEncoreChange : EDITEUR.blocChange
  return (
    <div className="oto-alert" data-tone="review">
      <div className="oto-alert-body flex flex-col gap-3">
        {/* Une alerte neuve par relecture qui trouve le bloc encore changé : elle est annoncée à sa naissance. */}
        <p key={conflit.annonce} role="alert" className="oto-alert-title">
          {alerte}
        </p>
        <div className="oto-field">
          <label htmlFor={`${id}-votre`} className="oto-field-label">
            Votre texte, non enregistré
          </label>
          <textarea id={`${id}-votre`} readOnly value={conflit.texte} rows={3} className={TEXTE} />
          <div className="mt-1.5">
            <CopieDuTexte texte={conflit.texte} />
          </div>
        </div>
        {conflit.version && (
          <>
            <div className="oto-field">
              <label htmlFor={`${id}-version`} className="oto-field-label">
                Version enregistrée
              </label>
              <textarea id={`${id}-version`} readOnly value={texteDe(conflit.version)} rows={3} className={TEXTE} />
            </div>
            <div className="oto-field">
              <label htmlFor={`${id}-final`} className="oto-field-label">
                Texte final
              </label>
              <textarea
                id={`${id}-final`}
                value={final}
                rows={3}
                readOnly={conflit.envoi}
                aria-describedby={conflit.erreur ? `${id}-erreur` : undefined}
                aria-invalid={conflit.erreur ? true : undefined}
                onChange={(evenement) => setFinal(evenement.target.value)}
                className={TEXTE}
              />
              {conflit.erreur && (
                <p id={`${id}-erreur`} role="alert" className="oto-field-error">
                  {conflit.erreur}
                </p>
              )}
            </div>
          </>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {conflit.version ? (
            <Button variant="primary" size="sm" disabled={conflit.envoi} aria-busy={conflit.envoi} onClick={() => gestes.enregistrerLeTexteFinal(final)}>
              Enregistrer le texte final
            </Button>
          ) : (
            <Button variant="primary" size="sm" onClick={gestes.reinsererMonTexte}>
              Réinsérer mon texte
            </Button>
          )}
          <Abandon />
        </div>
      </div>
    </div>
  )
}
