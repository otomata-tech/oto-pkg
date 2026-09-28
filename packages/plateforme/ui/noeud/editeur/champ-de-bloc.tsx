"use client"

// Le champ d'un bloc (E05-S02 ; E05-S08, AC1, AC7, AC9 ; E05-S09, partie c1) : un `<textarea>` natif
// toujours monté, dont la hauteur suit le texte, au nom accessible obligatoire, sans fond ni bordure au repos
// ni au focus : seul le curseur se voit, et la gouttière de sa rangée paraît (HN-E05S08-4). Une liste à
// puces porte ses puces en fond, une liste numérotée ses numéros en colonne `aria-hidden`, à partir de
// `start`. Sa frappe, sa sortie et son clavier vont aux gestes de l'éditeur. Sans lui, un bloc ne s'écrit pas.
//
// Porté du DS d'oto-frontend (`blocks.jsx`, `BlockField`) sur ses classes (`oto-block-field`, `data-kind`,
// `data-ordered`, `oto-block-numbers`, `blocks.css`) : le contrôle natif (sélection, annulation, clavier
// mobile), aucun chrome au repos ni au focus, la hauteur remise à `auto` avant sa mesure, recalculée quand la
// forme change, les numéros par ligne. Changé : les numéros partent de `start` (une liste écrite en
// plusieurs blocs continue la numérotation, E05-S04) ; la hauteur est estimée avant l'hydratation (`rows`,
// `field-sizing: content`), sans quoi un bloc long paraissait coupé à sa première ligne (M30) ; le contour en
// contrastes forcés est gardé (`outline-hidden`, qui l'emporte sur le `outline: none` du DS). Retiré : le
// `<label>` optionnel (le nom est `aria-label`).
//
// E05-S10 : une liste à cocher porte une case par ligne, devant le texte, qui se coche d'un clic ou au clavier
// (AC-a2) ; « @ » ouvre sous le champ la liste des contenus à citer (AC-a9, `citer.tsx`).
//
// E05-S11 : au repos, un texte qui porte des liens se lit comme en lecture, liens dans la phrase (retour 11, fiche
// D107) : son rendu est posé sur le champ, dans la même case, le champ transparent dessous ; au focus, le rendu
// s'efface et le texte brut paraît (`editeur.css`). Un clic hors d'un lien traverse le rendu jusqu'au champ ; un
// clic sur un lien le suit. Le champ reste le même élément, monté : aucun focus perdu quand un lien paraît. Tout
// le texte sélectionné ouvre le menu de la poignée (AC-28) ; Échap ou la frappe suivante le referme.
import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type SyntheticEvent } from "react"
import type { SearchMatch } from "../../../schemas/search"
import type { Resultat } from "../../api/resultat"
import { useRechercheDeContenus } from "../../api/use-recherche-de-contenus"
import { aDesLiens, type CiblesDesLiens } from "../en-ligne"
import { MENU_DU_BLOC } from "../libelles"
import { EnLigne } from "../rendu-des-blocs"
import { citationAuCurseur, idDOption, lienVers, ListeACiter, type Citation } from "./citer"
import { useGestes } from "./gestes"

/**
 * Ce que lit le rendu au repos des liens d'un bloc (AC-26, AC-27) : le préfixe des adresses de pages, les
 * cibles lues dans l'arbre visible, et les liens sortants lus par l'hôte après la page.
 */
export type LiensDesBlocs = { prefixe: string; cibles?: CiblesDesLiens; lecture?: Promise<Resultat<Record<string, unknown>>> }

/** Les touches qui ne font que préparer une autre : elles ne ferment pas le menu ouvert par la sélection. */
const MODIFICATEURS = new Set(["Shift", "Control", "Alt", "Meta"])

/** Les caractères d'une ligne du document, à la mesure de lecture : l'estimation d'avant l'hydratation, que la mesure remplace. */
const CARACTERES_PAR_LIGNE = 80

/** Les lignes que le texte occupera, lignes repliées comprises : le même nombre au serveur et au navigateur. */
function lignesEstimees(texte: string): number {
  return texte.split("\n").reduce((total, ligne) => total + Math.max(1, Math.ceil(ligne.length / CARACTERES_PAR_LIGNE)), 0)
}

type ChampDeBlocProps = {
  cle: string
  texte: string
  /** « Modifier ce texte — Objet … » : jamais un champ anonyme parmi quarante. */
  nom: string
  /** L'`id` du message d'un bloc refusé par le contrôle (AC2). */
  decritPar?: string
  /** Le type du bloc, que le design system dessine (`heading`, `list`, `paragraph`) : les puces d'une liste, un titre. */
  genre: string
  /** Le premier numéro d'une liste numérotée (son `start`) ; `null` ailleurs. */
  debut: number | null
  /** L'état des cases d'une liste à cocher, par ligne (E05-S10) ; vide ailleurs. */
  cases: readonly boolean[]
  /** Un autre bloc est en conflit (HN-E05S08-3) : le texte se lit et se copie, il ne s'écrit pas. */
  lectureSeule: boolean
  /** Les liens du texte se lisent au repos (E05-S11, AC-26) ; `null` : un code ou un appel, lu tel quel. */
  liens: LiensDesBlocs | null
  /** Le menu de la poignée est ouvert par la sélection de tout le texte (AC-28). */
  menuOuvert: boolean
}

function Numeros({ lignes, debut }: { lignes: number; debut: number }) {
  return (
    <div className="oto-block-numbers" aria-hidden="true">
      {Array.from({ length: lignes }, (_, rang) => (
        // Ces `<span>` sont des rangs : le rang 3 reste le rang 3 quoi qu'on tape dedans.
        <span key={rang}>{`${debut + rang}.`}</span>
      ))}
    </div>
  )
}

/** Une case par ligne d'une liste à cocher, nommée par son texte ; elle se coche sans quitter le bloc (E05-S10). */
function Cases({ cle, lignes, cases, lectureSeule }: { cle: string; lignes: readonly string[]; cases: readonly boolean[]; lectureSeule: boolean }) {
  const gestes = useGestes()
  return (
    <div className="oto-block-checks">
      {lignes.map((ligne, rang) => (
        // Une case est un rang de la liste : la case 3 reste la case 3 quoi qu'on tape dans sa ligne.
        <input
          key={rang}
          type="checkbox"
          checked={cases[rang] === true}
          disabled={lectureSeule}
          aria-label={MENU_DU_BLOC.case(ligne)}
          onChange={() => gestes.basculerLaCase(cle, rang)}
          className="oto-block-check"
        />
      ))}
    </div>
  )
}

/**
 * Le texte au repos, rendu sur le champ (AC-26) : les titres de l'arbre d'abord, ceux des liens sortants à leur
 * arrivée, seul le titre d'un lien les attendant (M64). Les classes du champ lui donnent sa géométrie et son corps :
 * le rendu tombe sur le texte brut.
 */
function TexteAuRepos({ texte, genre, liens }: { texte: string; genre: string; liens: LiensDesBlocs }) {
  return (
    <span className="oto-block-field oto-block-rendu" data-kind={genre}>
      <EnLigne texte={texte} Lien="a" hrefDuChemin={(chemin) => `${liens.prefixe}${chemin}`} cibles={liens.cibles} lecture={liens.lecture} />
    </span>
  )
}

/** La sélection couvre tout le texte non vide du champ (⌘A, Ctrl+A ou glissé) : le menu de la poignée s'ouvre (AC-28). */
function toutSelectionne(champ: HTMLTextAreaElement): boolean {
  return champ.value.trim() !== "" && champ.selectionStart === 0 && champ.selectionEnd === champ.value.length
}

/** « @ » (AC-a9) : la citation en cours du champ, sa recherche, l'option active, et le choix qui insère le lien. */
function useCitation(cle: string, texte: string) {
  const gestes = useGestes()
  const [citation, setCitation] = useState<Citation | null>(null)
  const [actif, setActif] = useState(0)
  const recherche = useRechercheDeContenus()
  const suivre = (valeur: string, curseur: number) => {
    const lue = citationAuCurseur(valeur, curseur)
    setCitation(lue)
    setActif(0)
    recherche.chercher(lue?.requete ?? "")
  }
  const fermer = () => {
    setCitation(null)
    recherche.chercher("")
  }
  const choisir = (trouve: SearchMatch) => {
    if (!citation) return
    const lien = lienVers(trouve)
    const fin = citation.debut + 1 + citation.requete.length
    fermer()
    gestes.citer(cle, `${texte.slice(0, citation.debut)}${lien}${texte.slice(fin)}`, citation.debut + lien.length)
  }
  const trouves = recherche.resultat.etat === "lue" ? recherche.resultat.trouves : []
  /** Le clavier de la liste ouverte : `true` si la touche est prise. */
  const toucher = (evenement: KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (!citation) return false
    if (evenement.key === "Escape") {
      evenement.preventDefault()
      fermer()
      return true
    }
    if (trouves.length === 0) return false
    if (evenement.key === "ArrowDown" || evenement.key === "ArrowUp") {
      evenement.preventDefault()
      setActif((rang) => (rang + (evenement.key === "ArrowDown" ? 1 : trouves.length - 1)) % trouves.length)
      return true
    }
    if (evenement.key !== "Enter" && evenement.key !== "Tab") return false
    evenement.preventDefault()
    choisir(trouves[Math.min(actif, trouves.length - 1)])
    return true
  }
  return { ouverte: citation !== null, resultat: recherche.resultat, actif: Math.min(actif, Math.max(trouves.length - 1, 0)), aDesOptions: trouves.length > 0, suivre, fermer, choisir, toucher }
}

export function ChampDeBloc({ cle, texte, nom, decritPar, genre, debut, cases, lectureSeule, liens, menuOuvert }: ChampDeBlocProps) {
  const gestes = useGestes()
  const champ = useRef<HTMLTextAreaElement>(null)
  const idDeLaListe = useId()
  const citation = useCitation(cle, texte)

  // La hauteur suit le texte, à chaque valeur reçue (frappe, annulation) et à chaque forme (un titre change
  // de corps) : `auto` d'abord, sinon `scrollHeight` ne redescend jamais sous la hauteur déjà posée.
  useLayoutEffect(() => {
    const element = champ.current
    if (!element) return
    element.style.height = "auto"
    element.style.height = `${element.scrollHeight}px`
  }, [texte, genre])

  const auRepos = liens !== null && aDesLiens(texte)
  const toucher = (evenement: KeyboardEvent<HTMLTextAreaElement>) => {
    if (menuOuvert && !MODIFICATEURS.has(evenement.key)) {
      gestes.fermerLeMenu()
      // Échap ferme le menu, rien d'autre : le focus reste dans le texte (AC-28).
      if (evenement.key === "Escape") return evenement.preventDefault()
    }
    if (!citation.toucher(evenement)) gestes.toucher(cle, evenement)
  }
  const selectionner = (evenement: SyntheticEvent<HTMLTextAreaElement>) => {
    const totale = toutSelectionne(evenement.currentTarget)
    if (totale || menuOuvert) gestes.selectionner(cle, totale)
  }
  // ⌘A sur un texte déjà tout sélectionné (après Échap) ne change pas la sélection : `onSelect` se tait, la touche rouvre.
  const toutSelectionner = (evenement: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((evenement.metaKey || evenement.ctrlKey) && evenement.key.toLowerCase() === "a") selectionner(evenement)
  }

  return (
    <>
      {genre === "checklist" && <Cases cle={cle} lignes={texte.split("\n")} cases={cases} lectureSeule={lectureSeule} />}
      {/* Le champ et son rendu au repos dans la même case (`oto-block-pile`), toujours : le champ n'est jamais remonté. Un `span` : la pile vit aussi dans le `h2` d'un titre. */}
      <span className="oto-block-pile">
        <textarea
          ref={champ}
          rows={lignesEstimees(texte)}
          data-champ=""
          data-kind={genre}
          // Présent ou absent, jamais « false » : le design system lit `[data-ordered]`, qui matche toute valeur.
          data-ordered={debut !== null ? "true" : undefined}
          // Son rendu est posé dessus : hors du focus, le texte brut se tait (`editeur.css`).
          data-rendu={auRepos ? "" : undefined}
          aria-label={nom}
          aria-describedby={decritPar}
          aria-autocomplete={citation.ouverte ? "list" : undefined}
          aria-controls={citation.ouverte ? idDeLaListe : undefined}
          aria-activedescendant={citation.ouverte && citation.aDesOptions ? idDOption(idDeLaListe, citation.actif) : undefined}
          readOnly={lectureSeule}
          value={texte}
          onChange={(evenement) => {
            gestes.saisir(cle, evenement.target.value)
            citation.suivre(evenement.target.value, evenement.target.selectionStart)
          }}
          onKeyDown={toucher}
          onSelect={selectionner}
          onKeyUp={toutSelectionner}
          onBlur={(evenement) => {
            citation.fermer()
            gestes.quitterLeChamp(cle, evenement)
          }}
          onFocus={lectureSeule ? gestes.annoncerLeConflit : undefined}
          className="oto-block-field field-sizing-content focus-visible:outline-hidden!"
        />
        {auRepos && <TexteAuRepos texte={texte} genre={genre} liens={liens} />}
      </span>
      {debut !== null && <Numeros lignes={texte.split("\n").length} debut={debut} />}
      {citation.ouverte && <ListeACiter id={idDeLaListe} resultat={citation.resultat} actif={citation.actif} choisir={citation.choisir} />}
    </>
  )
}
