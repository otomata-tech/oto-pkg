"use client"

// « @ » dans un bloc (E05-S10, AC-a9, décision de JB du 2026-09-27) : un « @ » tapé en début de texte ou après
// un blanc ouvre, sous le champ, la liste des contenus que la personne peut lire, cherchés par le service de
// l'outil `find` (`GET /api/platform/search`, la recherche de la palette ⌘K, `useRechercheDeContenus`) dès deux lettres ; le choix remplace
// « @… » par le lien `[[chemin|titre]]` existant, que la publication écrit dans `links` et que l'écran rend par
// son titre. Aucun type de bloc nouveau. Les flèches parcourent la liste, Entrée ou Tab choisit, Échap ferme ;
// le focus reste dans le champ, qui désigne l'option active (`aria-activedescendant`). Sans lui, citer un
// contenu demande d'en connaître le chemin et la syntaxe.
//
// Écrit dans le style d'oto-frontend, qui n'a pas de « @ » (`portage-ecrans.md`) : la liste reprend la surface
// et les lignes du menu du design system (`oto-pop`, `oto-menu-item`), posée dans le flux sous le champ.
import { useEffect, useState, type KeyboardEvent } from "react"
import type { SearchMatch } from "../../../schemas/search"
import type { RechercheDeContenus } from "../../api/use-recherche-de-contenus"
import { CITER } from "../libelles"

/** Une citation en cours : la place de son « @ » dans le texte, et ce qui est tapé après lui. */
export type Citation = { debut: number; requete: string }

/** Une citation ne cherche qu'un mot : au-delà, ou après un blanc, le « @ » n'était pas une citation. */
const REQUETE_MAX = 60

/** La citation que le curseur termine, lue sans expression : le dernier « @ » avant lui, en début de texte ou après un blanc. */
export function citationAuCurseur(texte: string, curseur: number): Citation | null {
  const debut = texte.lastIndexOf("@", curseur - 1)
  if (debut < 0 || curseur - debut - 1 > REQUETE_MAX) return null
  if (debut > 0 && !/\s/u.test(texte[debut - 1])) return null
  const requete = texte.slice(debut + 1, curseur)
  return /[\s@[\]|]/u.test(requete) ? null : { debut, requete }
}

/** Le lien d'un contenu choisi : son chemin, et son titre en libellé, sans ce qui fermerait le lien (`]`, saut de ligne). */
export function lienVers(trouve: Pick<SearchMatch, "path" | "title">): string {
  const titre = trouve.title.replace(/[\]\r\n]/gu, " ").trim()
  return titre ? `[[${trouve.path}|${titre}]]` : `[[${trouve.path}]]`
}

const PHRASES: Record<Exclude<RechercheDeContenus["etat"], "lue">, string> = { repos: CITER.invite, "en-cours": CITER.recherche, "en-panne": CITER.panne }

type ListeACiterProps = {
  id: string
  resultat: RechercheDeContenus
  /** Le rang de l'option active, que le champ désigne. */
  actif: number
  choisir: (trouve: SearchMatch) => void
}

/**
 * L'option active d'une liste au clavier (« @ », la page du panneau « Lien ») : les flèches la font tourner, son rang
 * reste borné à la liste, une touche de choix la prend.
 */
export function useOptionActive<T>(options: readonly T[]) {
  const [actif, setActif] = useState(0)
  const rang = Math.min(actif, Math.max(options.length - 1, 0))
  return {
    actif: rang,
    remettre: () => setActif(0),
    /** Les flèches et les touches de choix, la liste ayant une option : `true` si la touche est prise. */
    toucher(evenement: KeyboardEvent, touches: readonly string[], choisir: (option: T) => void): boolean {
      if (options.length === 0) return false
      if (evenement.key === "ArrowDown" || evenement.key === "ArrowUp") {
        evenement.preventDefault()
        const pas = evenement.key === "ArrowDown" ? 1 : options.length - 1
        setActif((un) => (un + pas) % options.length)
        return true
      }
      if (!touches.includes(evenement.key)) return false
      evenement.preventDefault()
      choisir(options[rang])
      return true
    },
  }
}

/** L'`id` d'une option de la liste, que le champ désigne par `aria-activedescendant`. */
export const idDOption = (liste: string, rang: number) => `${liste}-${rang}`

function Options({ id, trouves, actif, choisir }: { id: string; trouves: SearchMatch[]; actif: number; choisir: (trouve: SearchMatch) => void }) {
  return trouves.map((trouve, rang) => (
    <li
      key={trouve.path}
      id={idDOption(id, rang)}
      role="option"
      aria-selected={rang === actif}
      className="oto-menu-item"
      data-highlighted={rang === actif ? "" : undefined}
      // Le focus reste dans le champ : l'appui ne le lui prend pas, le clic choisit.
      onMouseDown={(evenement) => evenement.preventDefault()}
      onClick={() => choisir(trouve)}
    >
      <span className="oto-menu-label">{trouve.title}</span>
      <span className="oto-pop-meta">{trouve.path}</span>
    </li>
  ))
}

/** La liste des contenus à citer, sous le champ ; une phrase tant qu'il n'y a rien à choisir. */
export function ListeACiter({ id, resultat, actif, choisir }: ListeACiterProps) {
  // Une région n'annonce que ce qui change après son montage : elle se monte vide, sa phrase vient ensuite
  // (`accessibility-patterns.md § Régions dynamiques`).
  const [montee, setMontee] = useState(false)
  useEffect(() => setMontee(true), [])
  const trouves = resultat.etat === "lue" ? resultat.trouves : []
  const phrase = resultat.etat === "lue" ? (trouves.length === 0 ? CITER.aucun : "") : PHRASES[resultat.etat]
  return (
    <div className="oto-pop oto-citer">
      <p role="status" className="oto-caption px-2 py-1 empty:hidden">
        {montee ? phrase : ""}
      </p>
      <ul id={id} role="listbox" aria-label={CITER.liste} className="oto-menu">
        <Options id={id} trouves={trouves} actif={actif} choisir={choisir} />
      </ul>
    </div>
  )
}
