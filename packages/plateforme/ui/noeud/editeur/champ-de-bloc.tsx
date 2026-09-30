"use client"

// Le champ d'un bloc (E05-S02 ; E05-S08, AC1, AC7, AC9 ; E05-S09, partie c1) : un `<textarea>` natif
// toujours monté, dont la hauteur suit le texte, au nom accessible obligatoire, sans fond ni bordure au repos
// ni au focus : seul le curseur se voit, et la gouttière de sa rangée paraît (HN-E05S08-4). Une liste porte ses
// repères (puces, numéros à partir de `start`, cases) sur la copie de ses éléments (`elements-de-liste.tsx`).
// Sa frappe, sa sortie et son clavier vont aux gestes de l'éditeur. Sans lui, un bloc ne s'écrit pas.
//
// Porté du DS d'oto-frontend (`blocks.jsx`, `BlockField`) sur ses classes (`oto-block-field`, `data-kind`,
// `blocks.css`) : le contrôle natif (sélection, annulation, clavier
// mobile), aucun chrome au repos ni au focus, la hauteur remise à `auto` avant sa mesure, recalculée quand la
// forme change. Changé : les numéros partent de `start` (une liste écrite en
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
// clic sur un lien ouvre son panneau (E11-S06). Le champ reste le même élément, monté : aucun focus perdu quand un lien paraît. Tout
// le texte sélectionné ouvre le menu de la poignée (AC-28) ; Échap ou la frappe suivante le referme.
//
// E10-S01 : un collage de plusieurs lignes (`text/plain` seul, jamais `text/html`) s'insère après le bloc entier,
// en mode tolérant (AC-a1) ; une ligne, ou Ctrl+Maj+V, reste du texte au curseur. Un `.md` lâché sur le champ
// s'insère de même (AC-a4).
//
// E10-S06 : « / » tapé dans un Texte vide ouvre sous le champ le choix des blocs (AC-a2, `choix-de-bloc.tsx`) ; un
// tableur collé dans un Texte vide devient un tableau simple (AC-b3) ; la numérotation d'une liste ne compte
// que les éléments du premier niveau, les sous-éléments portant leur marque dans le texte (HN-E10S04-14).
//
// E11-S06 : les repères d'une liste suivent ses éléments, une seule puce, un numéro ou une case par élément, sur sa
// première ligne (`ElementsDeListe`, lot a) ; le curseur dans un lien, ou un clic sur un lien au repos, ouvre sous le
// champ le panneau « Lien » (`lien-du-bloc.tsx`, lot b).
//
// E10-S02 (lot b) : une image collée se joint après le bloc (AC-b1) ; un fichier lâché sur le champ est reçu par sa
// rangée, qui en fait un dépôt (AC-b4).
//
// E11-S15 : un texte marqué sans lien (`**gras**`, `_italique_`, code, barré) se rend aussi au repos (AC-b6) ; un texte
// qui porte un lien n'est pas relu par le correcteur du navigateur, qui soulignait en rouge sa source (chemin, `_`,
// mots sans accent) pendant qu'on l'édite (AC-b7) ; un clic sur un lien au repos le suit, le menu contextuel (clic
// droit, touche Menu, Maj+F10) ouvre le panneau « Lien » (AC-b9).
//
// E11-S17 (lot a) : ⌘A une seconde fois, le texte déjà tout sélectionné ou le bloc vide, prend tous les blocs de la page
// (AC-a2, `selection-de-blocs.ts`).
import { useId, useLayoutEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent, type SyntheticEvent } from "react"
import type { SearchMatch } from "../../../schemas/search"
import type { Resultat } from "../../api/resultat"
import { useRechercheDeContenus } from "../../api/use-recherche-de-contenus"
import { aDesLiens, aDuBalisage, type CiblesDesLiens } from "../en-ligne"
import { LIEN_DU_BLOC } from "../libelles"
import { EnLigne } from "../rendu-des-blocs"
import { tableauColle } from "./blocs-de-page"
import { ListeDesChoix, useChoixParBarre } from "./choix-de-bloc"
import { citationAuCurseur, idDOption, lienVers, ListeACiter, useOptionActive, type Citation } from "./citer"
import { ElementsDeListe } from "./elements-de-liste"
import { useFileDOperations } from "./file-d-operations"
import { useGestes } from "./gestes"
import { PanneauDuLien, useLienAuCurseur } from "./lien-du-bloc"

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
  /** L'invite du champ vide : le Texte d'une page vide (E11-S05, AC-g1). */
  invite?: string
}

/**
 * Le texte au repos, rendu sur le champ (AC-26) : les titres de l'arbre d'abord, ceux des liens sortants à leur
 * arrivée, seul le titre d'un lien les attendant (M64). Les classes du champ lui donnent sa géométrie et son corps :
 * le rendu tombe sur le texte brut. Une liste a le sien, la copie de ses éléments (`ElementsDeListe`).
 */
function TexteAuRepos({ texte, genre, liens }: { texte: string; genre: string; liens: LiensDesBlocs }) {
  return (
    <span className="oto-block-field oto-block-rendu" data-kind={genre}>
      <EnLigne texte={texte} numeroter Lien="a" hrefDuChemin={(chemin) => `${liens.prefixe}${chemin}`} cibles={liens.cibles} lecture={liens.lecture} />
    </span>
  )
}

/** La sélection couvre tout le texte non vide du champ (⌘A, Ctrl+A ou glissé) : le menu de la poignée s'ouvre (AC-28). */
function toutSelectionne(champ: HTMLTextAreaElement): boolean {
  return champ.value.trim() !== "" && champ.selectionStart === 0 && champ.selectionEnd === champ.value.length
}

/** ⌘A ou Ctrl+A sur un texte déjà tout sélectionné, ou sur un bloc vide : la page entière, en blocs (E11-S17, AC-a2). */
function toutEnBlocs(evenement: KeyboardEvent<HTMLTextAreaElement>): boolean {
  const champ = evenement.currentTarget
  const touche = (evenement.metaKey || evenement.ctrlKey) && !evenement.shiftKey && !evenement.altKey && evenement.key.toLowerCase() === "a"
  return touche && (champ.value.trim() === "" || (champ.selectionStart === 0 && champ.selectionEnd === champ.value.length))
}

/** « @ » (AC-a9) : la citation en cours du champ, sa recherche, l'option active, et le choix qui insère le lien. */
function useCitation(cle: string, texte: string) {
  const gestes = useGestes()
  const [citation, setCitation] = useState<Citation | null>(null)
  const recherche = useRechercheDeContenus()
  const { chemin } = useFileDOperations()
  const trouves = "trouves" in recherche.resultat ? recherche.resultat.trouves : []
  const option = useOptionActive(trouves)
  const suivre = (valeur: string, curseur: number) => {
    const lue = citationAuCurseur(valeur, curseur)
    setCitation(lue)
    option.remettre()
    // Avant toute frappe après « @ », les contenus récents hors de la page qu'on édite (E11-S15, AC-b4) ; dès la
    // première, la recherche.
    if (lue?.requete === "") recherche.recents(chemin)
    else recherche.chercher(lue?.requete ?? "")
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
  /** Le clavier de la liste ouverte : `true` si la touche est prise. */
  const toucher = (evenement: KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (!citation) return false
    if (evenement.key === "Escape") {
      evenement.preventDefault()
      fermer()
      return true
    }
    return option.toucher(evenement, ["Enter", "Tab"], choisir)
  }
  return { ouverte: citation !== null, resultat: recherche.resultat, actif: option.actif, aDesOptions: trouves.length > 0, suivre, fermer, choisir, toucher }
}

/** Ctrl+Maj+V (⌘⇧V) : le collage qui suit reste du texte brut, quelle que soit sa longueur (AC-a1). */
const collageBrut = (evenement: KeyboardEvent<HTMLTextAreaElement>) => (evenement.ctrlKey || evenement.metaKey) && evenement.shiftKey && evenement.key.toLowerCase() === "v"

/**
 * Le collage (E10-S01, AC-a1) : plusieurs lignes partent au geste ; un tableur collé dans un Texte vide devient un
 * tableau simple (E10-S06, AC-b3) ; une image collée se joint après le bloc (E10-S02, AC-b1). Seul `text/plain` est lu.
 * Un fichier lâché va à la rangée (`rangee-de-bloc.tsx`).
 */
function useCollage(cle: string, lectureSeule: boolean, texteVide: boolean) {
  const gestes = useGestes()
  const brut = useRef(false)
  return {
    noterLaTouche: (evenement: KeyboardEvent<HTMLTextAreaElement>) => {
      brut.current = collageBrut(evenement)
    },
    coller: (evenement: ClipboardEvent<HTMLTextAreaElement>) => {
      const texteBrut = brut.current
      brut.current = false
      // Un presse-papiers sans fichier (simulé, ou vieux navigateur) n'a pas de `files`.
      const image = Array.from(evenement.clipboardData.files ?? []).find((fichier) => fichier.type.startsWith("image/"))
      if (image && !lectureSeule) {
        evenement.preventDefault()
        return gestes.collerUneImage(cle, image)
      }
      const colle = evenement.clipboardData.getData("text/plain")
      if (texteBrut || lectureSeule || !colle.trim().includes("\n")) return
      evenement.preventDefault()
      const tableau = texteVide ? tableauColle(colle) : null
      if (tableau) return gestes.remplacerParChoix(cle, "tableau", tableau)
      gestes.insererDuMarkdown(cle, colle)
    },
  }
}

export function ChampDeBloc({ cle, texte, nom, decritPar, genre, debut, cases, lectureSeule, liens, menuOuvert, invite }: ChampDeBlocProps) {
  const gestes = useGestes()
  const champ = useRef<HTMLTextAreaElement>(null)
  const unTexte = genre === "paragraph"
  const collage = useCollage(cle, lectureSeule, unTexte && texte === "")
  const idDeLaListe = useId()
  const idDesChoix = useId()
  const citation = useCitation(cle, texte)
  const choix = useChoixParBarre(texte, (un) => gestes.remplacerParChoix(cle, un))
  // Le focus du champ choisit ce que montre la copie d'une liste : son texte brut au focus, son rendu au repos (E11-S06).
  const [auFocus, setAuFocus] = useState(false)
  const enListe = genre === "list" || genre === "checklist"
  const lien = useLienAuCurseur(texte, champ, liens !== null && !lectureSeule, enListe)
  const idDuLien = useId()
  const idDuRefus = useId()
  // Le panneau « Lien » cède la place sous le champ aux listes de « / » et de « @ » (AC-b1).
  const panneau = liens && !lectureSeule && lien.ouvert && !choix.ouverte && !citation.ouverte ? { liens, ouvert: lien.ouvert } : null
  const decrit = [decritPar, panneau ? idDuLien : undefined, lien.perdu ? idDuRefus : undefined].filter(Boolean).join(" ") || undefined
  // La liste ouverte sous le champ, « / » ou « @ », que le champ désigne (`aria-activedescendant`).
  const liste = choix.ouverte
    ? { id: idDesChoix, active: choix.retenus.length > 0 ? idDOption(idDesChoix, choix.actif) : undefined }
    : citation.ouverte
      ? { id: idDeLaListe, active: citation.aDesOptions ? idDOption(idDeLaListe, citation.actif) : undefined }
      : null

  // La hauteur suit le texte, à chaque valeur reçue (frappe, annulation) et à chaque forme (un titre change
  // de corps) : `auto` d'abord, sinon `scrollHeight` ne redescend jamais sous la hauteur déjà posée.
  useLayoutEffect(() => {
    const element = champ.current
    if (!element) return
    element.style.height = "auto"
    element.style.height = `${element.scrollHeight}px`
  }, [texte, genre])

  const auRepos = liens !== null && aDuBalisage(texte)
  const sansCorrecteur = liens !== null && aDesLiens(texte)
  const toucher = (evenement: KeyboardEvent<HTMLTextAreaElement>) => {
    collage.noterLaTouche(evenement)
    // La seconde fois, ⌘A prend tous les blocs : le menu ouvert par la première se ferme, le focus passe à l'éditeur.
    if (toutEnBlocs(evenement)) {
      evenement.preventDefault()
      return gestes.toutSelectionnerLesBlocs()
    }
    if (menuOuvert && !MODIFICATEURS.has(evenement.key)) {
      gestes.fermerLeMenu()
      // Échap ferme le menu, rien d'autre : le focus reste dans le texte (AC-28).
      if (evenement.key === "Escape") return evenement.preventDefault()
    }
    if (!choix.toucher(evenement) && !lien.toucher(evenement, panneau !== null) && !citation.toucher(evenement)) gestes.toucher(cle, evenement)
  }
  const selectionner = (evenement: SyntheticEvent<HTMLTextAreaElement>) => {
    const totale = toutSelectionne(evenement.currentTarget)
    if (totale || menuOuvert) gestes.selectionner(cle, totale)
    lien.suivre(evenement.currentTarget.value, evenement.currentTarget.selectionStart, evenement.currentTarget.selectionEnd)
  }
  // ⌘A sur un texte déjà tout sélectionné (après Échap) ne change pas la sélection : `onSelect` se tait, la touche rouvre.
  const toutSelectionner = (evenement: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((evenement.metaKey || evenement.ctrlKey) && evenement.key.toLowerCase() === "a") selectionner(evenement)
  }

  return (
    <>
      {/* Le champ et son rendu au repos dans la même case (`oto-block-pile`), toujours : le champ n'est jamais remonté. Un `span` : la pile vit aussi dans le `h2` d'un titre. Le menu contextuel d'un lien rendu y est lu par délégation (AC-b9). */}
      <span className="oto-block-pile" onContextMenuCapture={lien.menuContextuel}>
        {/* La copie d'une liste précède le champ : ses cases, à gauche du texte, viennent avant lui au clavier. */}
        {enListe && <ElementsDeListe cle={cle} texte={texte} genre={genre} debut={debut} cases={cases} lectureSeule={lectureSeule} rendu={auRepos && !auFocus ? liens : null} />}
        <textarea
          ref={champ}
          rows={lignesEstimees(texte)}
          data-champ=""
          data-kind={genre}
          // Son rendu est posé dessus : hors du focus, le texte brut se tait (`editeur.css`).
          data-rendu={auRepos ? "" : undefined}
          spellCheck={sansCorrecteur ? false : undefined}
          aria-label={nom}
          placeholder={invite}
          aria-describedby={decrit}
          aria-autocomplete={liste ? "list" : undefined}
          aria-controls={liste?.id}
          aria-activedescendant={liste?.active}
          readOnly={lectureSeule}
          value={texte}
          onChange={(evenement) => {
            gestes.saisir(cle, evenement.target.value, choix.suivre(texte, evenement.target.value, unTexte))
            citation.suivre(evenement.target.value, evenement.target.selectionStart)
            lien.suivre(evenement.target.value, evenement.target.selectionStart, evenement.target.selectionEnd)
          }}
          onKeyDown={toucher}
          onPaste={collage.coller}
          onSelect={selectionner}
          onKeyUp={toutSelectionner}
          onBlur={(evenement) => {
            setAuFocus(false)
            choix.fermer()
            citation.fermer()
            lien.quitter(evenement)
            gestes.quitterLeChamp(cle, evenement)
          }}
          onFocus={() => {
            setAuFocus(true)
            if (lectureSeule) gestes.annoncerLeConflit()
          }}
          className="oto-block-field field-sizing-content focus-visible:outline-hidden!"
        />
        {auRepos && !enListe && <TexteAuRepos texte={texte} genre={genre} liens={liens} />}
      </span>
      {panneau && <PanneauDuLien key={`${panneau.ouvert.lu.debut}:${panneau.ouvert.source}`} cle={cle} texte={texte} {...panneau} idDescription={idDuLien} lien={lien} />}
      {lien.perdu && (
        <p id={idDuRefus} role="alert" className="oto-field-error">
          {LIEN_DU_BLOC.change}
        </p>
      )}
      {choix.ouverte && <ListeDesChoix id={idDesChoix} retenus={choix.retenus} actif={choix.actif} prendre={choix.prendre} />}
      {citation.ouverte && <ListeACiter id={idDeLaListe} resultat={citation.resultat} actif={citation.actif} choisir={citation.choisir} />}
    </>
  )
}
