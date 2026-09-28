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
import { useId, type ReactNode } from "react"
import { ArrowDown } from "@phosphor-icons/react/dist/csr/ArrowDown"
import { ArrowUp } from "@phosphor-icons/react/dist/csr/ArrowUp"
import { Copy } from "@phosphor-icons/react/dist/csr/Copy"
import { DotsSixVertical } from "@phosphor-icons/react/dist/csr/DotsSixVertical"
import { Plus } from "@phosphor-icons/react/dist/csr/Plus"
import { Trash } from "@phosphor-icons/react/dist/csr/Trash"
import { BlockRow } from "../../ds/react/block-row"
import { AnimatedIcon } from "../../ds/react/icon"
import { DropdownMenu, type MenuItem } from "../../ds/react/overlays"
import { Button, IconButton } from "../../ds/react/primitives"
import { texteLu } from "../en-ligne"
import { EDITEUR, FORMES, MENU_DU_BLOC } from "../libelles"
import { BALISE_DE_TITRE, RenduDUnBloc } from "../rendu-des-blocs"
import { ChampDeBloc, type LiensDesBlocs } from "./champ-de-bloc"
import { ConflitDeBloc } from "./conflit-de-bloc"
import { useGestes, type Gestes } from "./gestes"
import { casesCochees, debutDe, formeDe, FORMES_ECRITES, premiersMots, texteDe, type Forme, type Rangee } from "./modele"
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
  forme: Forme | null
  premiere: boolean
  derniere: boolean
}

/** Le style du bloc (AC-a2), en choix `radio` : la forme entière est cochée ; un bloc qu'on n'écrit pas le dit. */
function stylesDuMenu({ cle, forme }: Menu, gestes: Gestes): MenuItem[] {
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
    { label: MENU_DU_BLOC.dupliquer, icon: icone(Copy), onSelect: () => gestes.dupliquer(cle) },
    { label: MENU_DU_BLOC.supprimer, icon: icone(Trash), destructive: true, onSelect: () => gestes.supprimer(cle) },
  ]
}

type BlocEcritProps = { rangee: Rangee; forme: Forme; erreur: string | null; verrouille: boolean; liens: LiensDesBlocs; menuOuvert: boolean }

/** Le champ d'un bloc écrit, dans son élément : un titre reste un titre, nommé par son texte (AC7). */
function BlocEcrit({ rangee, forme, erreur, verrouille, liens, menuOuvert }: BlocEcritProps) {
  const gestes = useGestes()
  const id = useId()
  const { cle, bloc } = rangee
  const texte = texteDe(bloc)
  const champ = (
    <ChampDeBloc
      cle={cle}
      texte={texte}
      nom={`Modifier ${FORMES[forme].champ} — ${premiersMots(bloc)}`}
      decritPar={erreur ? id : undefined}
      genre={bloc.type}
      debut={forme === "numerotee" ? debutDe(bloc) : null}
      cases={casesCochees(bloc)}
      lectureSeule={verrouille}
      // Le code et un appel inchangé se lisent tels quels, comme à l'écran de lecture (M59) : ni lien ni rendu au repos.
      liens={forme === "code" || bloc.type === "call" ? null : liens}
      menuOuvert={menuOuvert}
    />
  )
  return (
    <>
      {bloc.type === "heading" ? (
        <BALISE_DE_TITRE id={bloc.ref} aria-label={texteLu(texte)}>
          {champ}
        </BALISE_DE_TITRE>
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
  const { cle, bloc } = rangee
  const forme = formeDe(bloc)
  const mots = premiersMots(bloc)
  const menu: Menu = { cle, forme, premiere, derniere }
  const contenu = conflit ? (
    <ConflitDeBloc conflit={conflit} />
  ) : forme ? (
    <BlocEcrit rangee={rangee} forme={forme} erreur={erreur} verrouille={verrouillee} liens={liens} menuOuvert={menuOuvert} />
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
    >
      <AnimatedIcon as={DotsSixVertical} size="xs" />
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
      insert={
        <IconButton label={`Ajouter un bloc après — ${mots}`} variant="ghost" size="sm" onClick={() => gestes.inserer(cle)}>
          <AnimatedIcon as={Plus} size="xs" />
        </IconButton>
      }
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
