"use client"

// Une rangée de l'éditeur (E05-S02 ; E05-S08, AC1 à AC9 ; E05-S09, partie c1 ; E05-S10, AC-a2 à AC-a4, AC-a8) :
// la gouttière (« Ajouter un bloc après » et la poignée « Actions sur ce bloc »), puis le champ du bloc,
// toujours monté (fiche D21 B). La poignée ouvre sous elle le menu du
// bloc (monter, descendre, style, dupliquer, supprimer), au clic comme au clavier (Entrée, Espace ; Échap le
// ferme et rend le focus), et se glisse-dépose ; aucune de ces actions ne vit hors du menu. Un titre écrit
// reste dans son élément de titre (AC7) ; un bloc qu'on n'écrit pas est rendu en lecture, déplaçable,
// duplicable et supprimable (HN-E05S08-5). La rangée reçoit des données ; ses gestes viennent du contexte de
// l'éditeur. Sans elle, pas d'édition.
//
// Porté d'oto-frontend (`components/editor/editable-block.tsx`, DS `BlockRow`) : la géométrie de la rangée
// et de sa gouttière (`BlockRow`, révélée au survol et au focus), le « + » puis la poignée en boutons-icônes
// fantômes, le nom de chaque geste par les premiers mots du bloc, le menu de la poignée (`DropdownMenu`, les
// formes en choix `radio`, « Monter » et « Descendre » avec leur raccourci, « Supprimer » destructif), la
// poignée qui se glisse (`use-drag-block.ts`), un bloc qu'on n'écrit pas lu mais déplaçable et supprimable.
// Changé : le menu s'ouvre sous la poignée (AC-a2), et porte « Dupliquer ». Retiré : `ReferencesDuBloc` (les
// références servies ; ici, les liens écrits dans le texte), le titre écrit hors de son élément.
//
// M59 (fiche D104) : une procédure s'écrit comme une page. Ni style « Appel de fonction » ni « Insérer un
// appel » ; un bloc `call` déjà écrit est un Texte (`texteDUnAppel`), qu'on réécrit ou supprime.
//
// E05-S11 : la rangée des liens sous le bloc (`LiensDuBloc`) part : au repos, le champ lit ses liens dans la
// phrase (AC-26) ; tout le texte du bloc sélectionné ouvre le menu de la poignée, sans prendre le focus (AC-28).
//
// E10-S06 : le « + » ouvre le choix du bloc à insérer (AC-a1, `choix-de-bloc.tsx`) ; « Style » gagne « Repli »
// (AC-a3) ; un tableau simple s'écrit dans sa grille, son menu ajoute, retire et aligne à la cellule courante, que la
// rangée tient (AC-b1, AC-b2) ; un repli s'écrit en deux champs (AC-b4) ; un séparateur, sans champ, n'a pas de style.
// La poignée précède le champ : d'un bloc dont le champ garde `Tab`, `Tab` sur la poignée sort du bloc (AC-a6).
import { useId, useState, type KeyboardEvent, type ReactNode } from "react"
import { ArrowDown } from "@phosphor-icons/react/dist/csr/ArrowDown"
import { ArrowUp } from "@phosphor-icons/react/dist/csr/ArrowUp"
import { Copy } from "@phosphor-icons/react/dist/csr/Copy"
import { DotsSixVertical } from "@phosphor-icons/react/dist/csr/DotsSixVertical"
import { Plus } from "@phosphor-icons/react/dist/csr/Plus"
import { Table } from "@phosphor-icons/react/dist/csr/Table"
import { Trash } from "@phosphor-icons/react/dist/csr/Trash"
import { simpleTableOf } from "../../../schemas/blocks"
import { BlockRow } from "../../ds/react/block-row"
import { AnimatedIcon } from "../../ds/react/icon"
import { DropdownMenu, type MenuItem } from "../../ds/react/overlays"
import { Button, IconButton } from "../../ds/react/primitives"
import { texteLu } from "../en-ligne"
import { CHOIX_DE_BLOC, EDITEUR, FORMES, MENU_DU_BLOC } from "../libelles"
import { baliseDuTitre, RenduDUnBloc } from "../rendu-des-blocs"
import type { Position } from "./blocs-de-page"
import { ChampDeBloc, type LiensDesBlocs } from "./champ-de-bloc"
import { itemsDuChoix } from "./choix-de-bloc"
import { ConflitDeBloc } from "./conflit-de-bloc"
import { useGestes, type Gestes } from "./gestes"
import { casesCochees, debutDe, formeDe, FORMES_ECRITES, premiersMots, texteDe, type BlocEdite, type Forme, type Rangee } from "./modele"
import { RepliEdite } from "./repli-edite"
import { itemsDuTableau, TableauEdite } from "./tableau-edite"
import type { Conflit } from "./use-envois"

type RangeeDeBlocProps = {
  rangee: Rangee
  premiere: boolean
  derniere: boolean
  /** La rangée se glisse (E05-S10, AC-a3) : sa gouttière reste révélée. */
  tenue: boolean
  /** Tout le texte du bloc est sélectionné : le menu de la poignée est ouvert, le focus reste au champ (E05-S11, AC-28). */
  menuOuvert: boolean
  /** Un autre bloc est en conflit : ce champ est en lecture seule jusqu'à son règlement (HN-E05S08-3). */
  verrouillee: boolean
  erreur: string | null
  conflit: Conflit | null
  liens: LiensDesBlocs
  /** Un bloc `reference` rendu en place par la page serveur (vue, carte ou avis, E07-S03, AC16), montré en lecture. */
  rendu?: ReactNode
}

type Menu = {
  cle: string
  bloc: BlocEdite
  forme: Forme | null
  premiere: boolean
  derniere: boolean
  /** Un tableau simple, que le menu convertit en tableau de données (E10-S01, AC-b7). */
  tableauSimple: boolean
  /** La cellule courante d'un tableau simple (E10-S06, AC-b2). */
  cellule: Position
}

/**
 * Le style du bloc (AC-a2), en choix `radio` : la forme entière est cochée ; un bloc qu'on n'écrit pas le dit. Un
 * tableau simple a son propre menu, un séparateur n'a pas de style (E10-S06, AC-a3, AC-b2).
 */
function stylesDuMenu({ cle, bloc, forme, cellule }: Menu, gestes: Gestes): MenuItem[] {
  if (bloc.type === "divider") return []
  if (forme === "tableau") return itemsDuTableau(cle, bloc, cellule, gestes)
  if (!forme) return [{ group: EDITEUR.lectureSeule }]
  return [{ group: MENU_DU_BLOC.style }, ...FORMES_ECRITES.map((une) => ({ label: FORMES[une].libelle, radio: true, checked: une === forme, onSelect: () => gestes.changerDeForme(cle, une) }))]
}

/** Le menu de la poignée (E05-S10, AC-a2) : monter, descendre, le style, dupliquer, supprimer. */
function itemsDuMenu(menu: Menu, gestes: Gestes): MenuItem[] {
  const { cle } = menu
  const icone = (glyphe: typeof Plus) => <AnimatedIcon as={glyphe} size="xs" />
  return [
    { label: MENU_DU_BLOC.monter, icon: icone(ArrowUp), shortcut: "⌥↑", disabled: menu.premiere, onSelect: () => gestes.deplacer(cle, -1) },
    { label: MENU_DU_BLOC.descendre, icon: icone(ArrowDown), shortcut: "⌥↓", disabled: menu.derniere, onSelect: () => gestes.deplacer(cle, 1) },
    ...stylesDuMenu(menu, gestes),
    { separator: true },
    ...(menu.tableauSimple ? [{ label: MENU_DU_BLOC.convertir, icon: icone(Table), onSelect: () => gestes.convertirEnTableau(cle) }] : []),
    { label: MENU_DU_BLOC.dupliquer, icon: icone(Copy), onSelect: () => gestes.dupliquer(cle) },
    { label: MENU_DU_BLOC.supprimer, icon: icone(Trash), destructive: true, onSelect: () => gestes.supprimer(cle) },
  ]
}

/** Les formes dont le champ garde `Tab` (E10-S06, AC-a6, AC-b1) : de leur poignée, `Tab` sort du bloc. */
const GARDENT_TAB: ReadonlySet<Forme> = new Set(["puces", "numerotee", "tableau"])

/**
 * Un élément de la tabulation, rendu : `tabIndex` positif ou nul, ni désactivé, ni sous `[hidden]`, `[inert]` ou dans un
 * `<details>` fermé, ni caché par le style (`checkVisibility`, là où le navigateur l'a ; jsdom ne calcule pas le rendu).
 */
function tabulable(element: HTMLElement): boolean {
  return (
    element.tabIndex >= 0 &&
    !element.matches(":disabled") &&
    element.closest("[hidden], [inert], details:not([open]) > :not(summary)") === null &&
    (typeof element.checkVisibility !== "function" || element.checkVisibility())
  )
}

/** `element` suit `repere` dans le document, hors de lui. */
const apres = (repere: Element, element: Element) => !repere.contains(element) && (repere.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0

/**
 * Retire des éléments de la tabulation le temps de l'action par défaut de `Tab`, qui suit le `keydown`, et les y rend au
 * tour suivant, que le focus ait bougé ou non ; chacun retrouve son attribut `tabindex` tel qu'il était.
 */
function horsDeLaTabulationUnInstant(elements: HTMLElement[]) {
  const avant = elements.map((element) => ({ element, attribut: element.getAttribute("tabindex") }))
  for (const element of elements) element.tabIndex = -1
  setTimeout(() => {
    for (const { element, attribut } of avant) {
      if (attribut === null) element.removeAttribute("tabindex")
      else element.setAttribute("tabindex", attribut)
    }
  }, 0)
}

/**
 * `Tab` sur la poignée d'une liste à puces ou numérotée, ou d'un tableau (AC-a6) : le champ qui suit la poignée garde
 * `Tab`, le focus va donc au premier élément après la rangée. Rien après elle (la fin de la page) : la touche reste au
 * navigateur, qui sort de la page, les champs de la rangée hors de la tabulation le temps de son geste. `Maj+Tab` et
 * les autres touches restent au menu.
 */
function sortirDuBlocAuClavier(evenement: KeyboardEvent<HTMLButtonElement>, forme: Forme | null) {
  if (evenement.key !== "Tab" || evenement.shiftKey || evenement.altKey || evenement.ctrlKey || evenement.metaKey) return
  if (forme === null || !GARDENT_TAB.has(forme)) return
  const poignee = evenement.currentTarget
  const rangee = poignee.closest("[data-cle]")
  if (!rangee) return
  const suivant = Array.from(rangee.ownerDocument.body.querySelectorAll<HTMLElement>("*")).find((element) => apres(rangee, element) && tabulable(element))
  if (!suivant) {
    horsDeLaTabulationUnInstant(Array.from(rangee.querySelectorAll<HTMLElement>("*")).filter((element) => apres(poignee, element) && tabulable(element)))
    return
  }
  evenement.preventDefault()
  suivant.focus()
}

type BlocEcritProps = {
  rangee: Rangee
  forme: Forme
  erreur: string | null
  verrouille: boolean
  liens: LiensDesBlocs
  menuOuvert: boolean
  /** La cellule d'un tableau simple qui prend le focus : la rangée la tient pour son menu (E10-S06, AC-b2). */
  suivreLaCellule: (position: Position) => void
}

/** Les champs d'un tableau ou d'un repli (E10-S06), ou le champ de texte de toute autre forme écrite. */
function ChampsDuBloc({ rangee, forme, verrouille, liens, menuOuvert, suivreLaCellule, decritPar }: Omit<BlocEcritProps, "erreur"> & { decritPar?: string }) {
  const { cle, bloc } = rangee
  const mots = premiersMots(bloc)
  if (forme === "tableau") return <TableauEdite cle={cle} bloc={bloc} decritPar={decritPar} lectureSeule={verrouille} suivre={suivreLaCellule} />
  if (forme === "repli") return <RepliEdite cle={cle} bloc={bloc} mots={mots} decritPar={decritPar} lectureSeule={verrouille} />
  return (
    <ChampDeBloc
      cle={cle}
      texte={texteDe(bloc)}
      nom={`Modifier ${FORMES[forme].champ} — ${mots}`}
      decritPar={decritPar}
      genre={bloc.type}
      debut={forme === "numerotee" ? debutDe(bloc) : null}
      cases={casesCochees(bloc)}
      lectureSeule={verrouille}
      // Le code et un appel inchangé se lisent tels quels, comme à l'écran de lecture (M59) : ni lien ni rendu au repos.
      liens={forme === "code" || bloc.type === "call" ? null : liens}
      menuOuvert={menuOuvert}
    />
  )
}

/** Le champ d'un bloc écrit, dans son élément : un titre reste un titre, nommé par son texte (AC7). */
function BlocEcrit(props: BlocEcritProps) {
  const gestes = useGestes()
  const id = useId()
  const { rangee, erreur } = props
  const { cle, bloc } = rangee
  // Un titre garde au repos la balise de son niveau, comme à l'écran de lecture (E10-S04, AC-b3).
  const Titre = baliseDuTitre(bloc.data.level)
  const champ = <ChampsDuBloc {...props} decritPar={erreur ? id : undefined} />
  return (
    <>
      {bloc.type === "heading" ? (
        <Titre id={bloc.ref} aria-label={texteLu(texteDe(bloc))}>
          {champ}
        </Titre>
      ) : (
        <div id={bloc.ref}>{champ}</div>
      )}
      {erreur && (
        <div className="flex flex-wrap items-center gap-2">
          <p id={id} role="alert" className="oto-field-error">
            {erreur}
          </p>
          <Button variant="ghost" size="sm" onClick={() => gestes.annulerLesModifications(cle)}>
            {EDITEUR.annulerLesModifications}
          </Button>
        </div>
      )}
    </>
  )
}

export function RangeeDeBloc({ rangee, premiere, derniere, tenue, menuOuvert, verrouillee, erreur, conflit, liens, rendu }: RangeeDeBlocProps) {
  const gestes = useGestes()
  // La cellule courante d'un tableau simple, où son menu ajoute et retire (E10-S06, AC-b2).
  const [cellule, setCellule] = useState<Position>({ ligne: 0, colonne: 0 })
  const { cle, bloc } = rangee
  const forme = formeDe(bloc)
  const mots = premiersMots(bloc)
  // Un tableau sans colonne ne se convertit pas (le schéma d'un tableau de données en veut une) : pas d'entrée.
  const tableauSimple = bloc.type === "simple_table" && simpleTableOf(bloc.data).columns.length > 0
  const menu: Menu = { cle, bloc, forme, premiere, derniere, tableauSimple, cellule }
  const contenu = conflit ? (
    <ConflitDeBloc conflit={conflit} />
  ) : forme ? (
    <BlocEcrit rangee={rangee} forme={forme} erreur={erreur} verrouille={verrouillee} liens={liens} menuOuvert={menuOuvert} suivreLaCellule={setCellule} />
  ) : (
    <RenduDUnBloc bloc={bloc} Lien="a" hrefDuChemin={(chemin) => `${liens.prefixe}${chemin}`} cibles={liens.cibles} rendu={rendu} />
  )
  const poignee = (
    <IconButton
      label={`Actions sur ce bloc — ${mots}`}
      variant="ghost"
      size="sm"
      data-geste="poignee"
      onPointerDown={(evenement) => gestes.poignee.appui(cle, evenement)}
      onPointerMove={gestes.poignee.mouvement}
      onPointerUp={gestes.poignee.lacher}
      onPointerCancel={gestes.poignee.annuler}
      onClickCapture={gestes.poignee.clicCapture}
      // Composé avec l'ouverture du menu au clavier (`Anchor` chaîne les gestionnaires) : seul `Tab` est pris ici.
      onKeyDown={(evenement) => sortirDuBlocAuClavier(evenement, forme)}
    >
      <AnimatedIcon as={DotsSixVertical} size="xs" />
    </IconButton>
  )
  // Le « + » ouvre le choix du bloc à insérer (E10-S06, AC-a1) ; Échap le ferme et lui rend le focus.
  const plus = (
    <IconButton label={CHOIX_DE_BLOC.ajouter(mots)} variant="ghost" size="sm" data-geste="inserer">
      <AnimatedIcon as={Plus} size="xs" />
    </IconButton>
  )
  return (
    <BlockRow
      data-cle={cle}
      // La rangée qu'on glisse garde sa gouttière révélée : une présence, puis la teinte du design system (`blocks.css`).
      state={tenue ? "moving" : undefined}
      // Un bouton cliqué ne prend pas le focus sous Safari et Firefox macOS : l'appui dit que la rangée reste (M30).
      onPointerDown={() => gestes.appuyerDansLaRangee(cle)}
      onBlur={(evenement) => gestes.quitterLaRangee(cle, evenement)}
      insert={<DropdownMenu side="bottom" align="start" trigger={plus} items={itemsDuChoix((choix) => gestes.inserer(cle, choix))} />}
      // Le bloc en conflit se règle dans son panneau : sa poignée n'ouvre pas de menu.
      handle={
        conflit ? (
          poignee
        ) : (
          <DropdownMenu side="bottom" align="start" trigger={poignee} items={itemsDuMenu(menu, gestes)} ouvertSansFocus={menuOuvert} surFermeture={gestes.fermerLeMenu} />
        )
      }
    >
      {contenu}
    </BlockRow>
  )
}
