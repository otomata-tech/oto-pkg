"use client"

// La sélection de blocs de l'éditeur (E11-S17, lot a) : des blocs entiers, pris au clavier (⌘A une seconde fois dans un
// champ, Échap puis Maj+↑↓), aux poignées (Maj+clic, Ctrl+clic, ⌘+clic), par un rectangle tiré depuis la marge ou un
// glissé qui quitte son bloc (`pointeur-de-la-selection.ts`) ; surlignés, annoncés, et qu'on supprime, copie, coupe ou
// déplace ensemble, avec un seul « Annuler » (`gestes-du-groupe.ts`). Elle vit au-dessus des champs, qui restent des
// `<textarea>` : elle ne lit d'un champ que « tout son texte est-il sélectionné » (`champ-de-bloc.tsx`). Échap, un clic
// ou le focus ailleurs la vident. Sans elle, un geste ne prend qu'un bloc à la fois.
import { useCallback, useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent } from "react"
import { SELECTION } from "../libelles"
import type { actionsDeLEditeur } from "./actions"
import { dansLOrdre } from "./groupe"
import type { Rangee } from "./modele"
import { dansLaMarge, usePointeurDeLaSelection } from "./pointeur-de-la-selection"

/** Une sélection : ses blocs dans l'ordre de la page, l'ancre d'où une plage s'étend, la tête qui bouge (AC-a3, AC-a4). */
export type Selection = { cles: readonly string[]; ancre: string | null; tete: string | null }

export const SELECTION_VIDE: Selection = { cles: [], ancre: null, tete: null }

const rangDe = (modele: readonly Rangee[], cle: string) => modele.findIndex((rangee) => rangee.cle === cle)

/** Les blocs de `de` à `a`, compris, dans l'ordre de la page, vers le haut comme vers le bas ; `de` disparu, `a` seul. */
export function plage(modele: readonly Rangee[], de: string, a: string): string[] {
  const debut = rangDe(modele, de)
  const fin = rangDe(modele, a)
  if (fin < 0) return []
  if (debut < 0) return [a]
  return modele.slice(Math.min(debut, fin), Math.max(debut, fin) + 1).map((rangee) => rangee.cle)
}

/** Un seul bloc : celui dont le champ a reçu Échap (AC-a3). */
export const seul = (cle: string): Selection => ({ cles: [cle], ancre: cle, tete: cle })

/** Tous les blocs de la page (⌘A, AC-a2) : l'ancre au premier, la tête au dernier. */
export function tous(modele: readonly Rangee[]): Selection {
  const premier = modele[0]
  const dernier = modele[modele.length - 1]
  return premier && dernier ? { cles: modele.map((rangee) => rangee.cle), ancre: premier.cle, tete: dernier.cle } : SELECTION_VIDE
}

/** Maj+↑, Maj+↓ (AC-a3) : la tête passe au bloc voisin, la sélection va de l'ancre à elle ; rien aux bornes. */
export function etendre(modele: readonly Rangee[], selection: Selection, pas: -1 | 1): Selection {
  if (selection.tete === null) return selection
  const voisine = modele[rangDe(modele, selection.tete) + pas]
  if (!voisine) return selection
  const ancre = selection.ancre ?? selection.tete
  return { cles: plage(modele, ancre, voisine.cle), ancre, tete: voisine.cle }
}

/** ↑, ↓ seules (AC-a3) : le bloc voisin de la tête, seul ; rien aux bornes. */
export function avancer(modele: readonly Rangee[], selection: Selection, pas: -1 | 1): Selection {
  if (selection.tete === null) return selection
  const voisine = modele[rangDe(modele, selection.tete) + pas]
  return voisine ? seul(voisine.cle) : selection
}

/** Maj+clic sur une poignée (AC-a4) : de l'ancre, le dernier bloc pris seul, au bloc cliqué. */
export function jusqua(modele: readonly Rangee[], selection: Selection, cle: string): Selection {
  const ancre = selection.ancre ?? cle
  return { cles: plage(modele, ancre, cle), ancre, tete: cle }
}

/** Ctrl+clic, ⌘+clic sur une poignée (AC-a4) : le bloc entre dans la sélection ou en sort, et devient l'ancre qu'il reste. */
export function basculer(modele: readonly Rangee[], selection: Selection, cle: string): Selection {
  const sort = selection.cles.includes(cle)
  const cles = dansLOrdre(modele, sort ? selection.cles.filter((une) => une !== cle) : [...selection.cles, cle])
  const repere = sort ? cles[cles.length - 1] : cle
  return repere === undefined ? SELECTION_VIDE : { cles, ancre: repere, tete: repere }
}

/** Deux sélections égales : poser la seconde ne rendrait rien de neuf (un pointeur qui bouge dans les mêmes blocs). */
const egales = (une: Selection, autre: Selection) =>
  une.ancre === autre.ancre && une.tete === autre.tete && une.cles.length === autre.cles.length && une.cles.every((cle, rang) => cle === autre.cles[rang])

const POIGNEE = '[data-geste="poignee"]'

type Commande = "annuler" | "tout" | "copier" | "couper" | "vider" | "entrer" | "supprimer" | "etendre" | "avancer" | "deplacer"

const SANS_MODIFICATEUR: Readonly<Record<string, Commande>> = { Escape: "vider", Enter: "entrer", Delete: "supprimer", Backspace: "supprimer" }
const AVEC_COMMANDE: Readonly<Record<string, Commande>> = { z: "annuler", a: "tout", c: "copier", x: "couper" }

/** Sur la poignée d'un bloc hors de la sélection, ↑, ↓ et Entrée restent au bouton : ↓ et Entrée ouvrent son menu (HN-E11S17-a5). */
const AU_BOUTON_HORS_DE_LA_SELECTION: ReadonlySet<Commande> = new Set(["avancer", "entrer"])

/** La commande d'une touche sur la zone des blocs ou sur une poignée ; `null` : la touche reste à l'élément. */
function commandeDe(evenement: KeyboardEvent<HTMLElement>): Commande | null {
  const { key, shiftKey, altKey } = evenement
  if (evenement.metaKey || evenement.ctrlKey) return shiftKey || altKey ? null : (AVEC_COMMANDE[key.toLowerCase()] ?? null)
  if (key === "ArrowUp" || key === "ArrowDown") return altKey ? "deplacer" : shiftKey ? "etendre" : "avancer"
  return shiftKey || altKey ? null : (SANS_MODIFICATEUR[key] ?? null)
}

type Actions = ReturnType<typeof actionsDeLEditeur>

type Parametres = {
  modele: readonly Rangee[]
  actions: Actions
  /** Le menu ouvert par la sélection de tout le texte d'un bloc (E05-S11, AC-28) se ferme quand des blocs sont pris. */
  fermerLeMenu: () => void
}

/** Le champ d'un bloc, curseur à la fin ; sa poignée pour un bloc sans champ (Entrée, AC-a3). */
function entrerDans(zone: HTMLElement | null, cle: string | null) {
  const rangee = cle === null ? null : zone?.querySelector(`[data-cle="${cle}"]`)
  const champ = rangee?.querySelector("[data-champ]")
  if (!(champ instanceof HTMLTextAreaElement || champ instanceof HTMLInputElement)) return rangee?.querySelector<HTMLElement>(POIGNEE)?.focus()
  champ.focus()
  champ.setSelectionRange(champ.value.length, champ.value.length)
}

export function useSelectionDeBlocs({ modele, actions, fermerLeMenu }: Parametres) {
  const zone = useRef<HTMLDivElement>(null)
  const [selection, setSelection] = useState<Selection>(SELECTION_VIDE)
  // Un bloc retiré entre-temps quitte la sélection : elle se relit sur le modèle à chaque rendu.
  const cles = dansLOrdre(modele, selection.cles)
  const courante: Selection = { ...selection, cles }
  const ensemble = new Set(cles)
  // La rangée dont un champ vient de recevoir Échap : sa poignée, qui prend alors le focus, la sélectionne (AC-a3).
  const echap = useRef<string | null>(null)
  // L'ordre des rangées au début du glissé d'un groupe, que remet un geste interrompu (AC-a8).
  const avantDuGlisse = useRef<readonly string[] | null>(null)

  const poser = (suivante: Selection) => {
    // La même sélection garde son état : aucun rendu par mouvement du pointeur dans les mêmes blocs.
    setSelection((actuelle) => (egales(actuelle, suivante) ? actuelle : suivante))
    if (suivante.cles.length > 0) fermerLeMenu()
  }
  const vider = useCallback(() => setSelection((actuelle) => (actuelle.cles.length === 0 ? actuelle : SELECTION_VIDE)), [])
  const pointeur = usePointeurDeLaSelection({
    zone,
    prendre: (de, a) => poser({ cles: plage(modele, de, a), ancre: de, tete: a }),
    prendreLesBlocs: (prises) => poser(prises.length === 0 ? SELECTION_VIDE : { cles: prises, ancre: prises[0], tete: prises[prises.length - 1] }),
    vider,
  })

  // Un appui ailleurs que sur une poignée, la marge ou un menu vide la sélection ; la poignée et la marge décident seules.
  const vide = cles.length === 0
  useEffect(() => {
    if (vide) return
    const surAppui = (evenement: PointerEvent) => {
      const cible = evenement.target
      if (!(cible instanceof Element) || cible.closest("[role='menu']")) return
      const lieu = zone.current
      if (lieu?.contains(cible) && (cible.closest(POIGNEE) || dansLaMarge(lieu, cible))) return
      vider()
    }
    document.addEventListener("pointerdown", surAppui, true)
    return () => document.removeEventListener("pointerdown", surAppui, true)
  }, [vide, vider])

  const enGroupe = (cle: string) => ensemble.has(cle) && cles.length > 1
  const suivre = (suivante: Selection) => {
    poser(suivante)
    if (suivante.tete !== null) zone.current?.querySelector<HTMLElement>(`[data-cle="${suivante.tete}"] ${POIGNEE}`)?.focus()
  }

  /** Les touches de la sélection, sur la zone ou une poignée (AC-a2, AC-a3, AC-a6 à AC-a8) ; un champ garde les siennes. */
  const toucher = (evenement: KeyboardEvent<HTMLDivElement>) => {
    const cible = evenement.target
    if (!(cible instanceof HTMLElement)) return
    echap.current = evenement.key === "Escape" && cible.hasAttribute("data-champ") ? (cible.closest<HTMLElement>("[data-cle]")?.dataset.cle ?? null) : null
    const commande = cible === evenement.currentTarget || cible.matches(POIGNEE) ? commandeDe(evenement) : null
    if (commande === null || (vide && commande !== "annuler" && commande !== "tout")) return
    const hors = cible.matches(POIGNEE) && !ensemble.has(cible.closest<HTMLElement>("[data-cle]")?.dataset.cle ?? "")
    if (hors && AU_BOUTON_HORS_DE_LA_SELECTION.has(commande)) return
    // ⌘Z n'est pris que s'il annule l'annonce en cours ; sinon il reste au navigateur.
    if (commande === "annuler" && !actions.annulerLAnnonce()) return
    // La touche est prise : ni le menu de la poignée (↓, Entrée) ni le navigateur (⌘A sur la page) ne la reçoivent.
    evenement.preventDefault()
    evenement.stopPropagation()
    const pas = evenement.key === "ArrowUp" ? -1 : 1
    const garde = cible.closest<HTMLElement>("[data-cle]")?.dataset.cle ?? null
    if (commande === "tout") poser(tous(modele))
    else if (commande === "vider") vider()
    else if (commande === "etendre") suivre(etendre(modele, courante, pas))
    else if (commande === "avancer") suivre(avancer(modele, courante, pas))
    else if (commande === "deplacer") actions.deplacerLeGroupe(cles, pas, garde)
    else if (commande === "entrer") entrerDans(zone.current, courante.tete)
    else if (commande === "supprimer") actions.supprimerLeGroupe(cles)
    else if (commande === "copier") void actions.copierLeGroupe(cles)
    else if (commande === "couper") void actions.couperLeGroupe(cles)
  }

  return {
    zone,
    cles,
    ensemble,
    rectangle: pointeur.rectangle,
    /** La phrase de la région vivante (AC-a9) : le nombre de blocs sélectionnés, rien sans sélection. */
    annonce: vide ? "" : SELECTION.nombre(cles.length),
    proprietes: {
      ...pointeur.proprietes,
      onKeyDownCapture: toucher,
      /**
       * Après le geste du champ : le focus que son Échap porte à la poignée arrive au rendu qu'il a demandé, avant cette
       * tâche ; un Échap qui ne le déplace pas (la liste « @ » fermée) ne laisse pas la poignée prête à sélectionner.
       */
      onKeyDown() {
        if (echap.current === null) return
        queueMicrotask(() => {
          echap.current = null
        })
      },
      /**
       * Le focus : sur la poignée d'un bloc dont le champ vient de recevoir Échap, il le sélectionne (AC-a3) ; sur la zone,
       * une poignée ou un menu, il garde la sélection ; ailleurs (un champ, le « + », un panneau), il la vide.
       */
      onFocus(evenement: FocusEvent<HTMLDivElement>) {
        const { target: cible, currentTarget } = evenement
        const echappee = echap.current
        echap.current = null
        if (cible === currentTarget || cible.closest("[role='menu']")) return
        if (!cible.matches(POIGNEE)) return vider()
        const cle = cible.closest<HTMLElement>("[data-cle]")?.dataset.cle
        if (cle !== undefined && cle === echappee) poser(seul(cle))
      },
      /** Le focus parti hors de l'éditeur, ailleurs que dans un menu de poignée, vide la sélection. */
      onBlur(evenement: FocusEvent<HTMLDivElement>) {
        const vers = evenement.relatedTarget
        if (vers instanceof Element && !evenement.currentTarget.contains(vers) && !vers.closest("[role='menu']")) vider()
      },
    },
    /** ⌘A une seconde fois dans un champ (AC-a2) : tous les blocs, le menu fermé, le focus à la zone des blocs. */
    toutSelectionner() {
      poser(tous(modele))
      zone.current?.focus({ preventScroll: true })
    },
    /** Un clic sur une poignée (AC-a4) : Maj étend, Ctrl ou ⌘ bascule ; seul, il ouvre le menu et garde la sélection qui le contient. */
    cliquerLaPoignee(cle: string, evenement: MouseEvent<HTMLElement>) {
      const bascule = evenement.ctrlKey || evenement.metaKey
      if (!bascule && !evenement.shiftKey) return ensemble.has(cle) ? undefined : vider()
      evenement.preventDefault()
      evenement.stopPropagation()
      poser(bascule ? basculer(modele, courante, cle) : jusqua(modele, courante, cle))
    },
    /** « Supprimer » du menu d'un bloc sélectionné parmi d'autres : tout le groupe (AC-a6). */
    supprimer: (cle: string) => (enGroupe(cle) ? void actions.supprimerLeGroupe(cles) : actions.supprimer(cle)),
    /** « Monter », « Descendre » du menu d'un bloc sélectionné parmi d'autres : tout le groupe (AC-a8). */
    deplacer: (cle: string, pas: -1 | 1) => (enGroupe(cle) ? actions.deplacerLeGroupe(cles, pas, cle) : actions.deplacer(cle, pas)),
    /** Le glissé de la poignée d'un bloc sélectionné parmi d'autres déplace le groupe (AC-a8, `glisser.ts`). */
    groupe: (cle: string): readonly string[] => (enGroupe(cle) ? cles : [cle]),
    glisser(cle: string, pas: -1 | 1): number | void {
      if (!enGroupe(cle)) return actions.glisserDUnRang(cle, pas)
      avantDuGlisse.current ??= modele.map((rangee) => rangee.cle)
      return actions.glisserLeGroupe(cles, cle, pas)
    },
    deposer(cle: string) {
      const avant = avantDuGlisse.current
      avantDuGlisse.current = null
      if (avant) actions.deposerLeGroupe(cles, avant)
      else actions.deposer(cle)
    },
    revenir(): boolean {
      const avant = avantDuGlisse.current
      avantDuGlisse.current = null
      if (avant) actions.remettreLeGroupe(avant, cles)
      return avant !== null
    },
  }
}
