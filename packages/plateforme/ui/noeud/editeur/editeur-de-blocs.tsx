"use client"

// L'éditeur de blocs d'une page (E05-S02 ; E05-S08, AC1 à AC7 ; E05-S09, partie c1), au niveau écriture :
// chaque bloc écrit est un champ toujours monté (fiche D21 B), son texte part par la file en opérations par
// bloc quand le focus le quitte, sur ⌘S ou après 1 200 ms sans frappe, et chaque geste de structure part
// tout de suite. Il porte le bandeau du brouillon, la publication, les lignes d'état et le conflit au bloc.
// Il reçoit des données et du `ReactNode` déjà rendu, jamais une fonction (AC22). Sans lui, pas d'édition.
//
// Porté d'oto-frontend (`components/editor/block-editor.tsx`). Repris : l'orchestration (modèle local,
// focus posé impérativement, clavier, différé), les champs toujours montés, le corps de lecture du design
// system (`Reader`), l'état vide (`EmptyState`,
// « Commencer à écrire »), « Bloc supprimé. » et « Annuler ». Retiré : l'écriture du corps entier (→
// opérations par bloc), la synchronisation par comparaison de corps (`memeCorps`).
//
// Son genre (E05-S04) va à la publication : un Contexte confirme sa publication vide et dit la recharge des
// conversations (AC11). Une procédure s'écrit comme une page (M59, fiche D104).
//
// E05-S10 : au niveau gestion, la publication part seule (AC-a6) ; la poignée ouvre le menu du bloc (AC-a2)
// et se glisse-dépose (AC-a3, `glisser.ts`, le `useDragBlock` d'oto-frontend).
//
// E05-S11 : l'indication d'enregistrement est en haut à droite de la carte (AC-1) ; un bloc au repos lit ses
// liens dans la phrase, par le titre des pages citées (AC-26, `cibles`, `liens`) ; tout le texte d'un bloc
// sélectionné ouvre le menu de sa poignée, sans prendre le focus (AC-28).
import { useState, type ReactNode } from "react"
import { Plus } from "@phosphor-icons/react/dist/csr/Plus"
import type { BlockView, NodeKind } from "../../../schemas"
import type { Resultat } from "../../api/resultat"
import { EmptyState } from "../../ds/react/empty-state"
import { AnimatedIcon } from "../../ds/react/icon"
import { Button } from "../../ds/react/primitives"
import { Reader } from "../../ds/react/reader"
import type { CiblesDesLiens } from "../en-ligne"
import { EDITEUR, PAGE_VIDE } from "../libelles"
import { BandeauDuBrouillon, Publication } from "../publication"
import { ContexteDesGestes, useGestes } from "./gestes"
import { useGlisser } from "./glisser"
import { AlerteDEdition, IndicationDEnregistrement, LigneDAnnonce } from "./lignes-d-etat"
import type { Rangee } from "./modele"
import type { LiensDesBlocs } from "./champ-de-bloc"
import { RangeeDeBloc } from "./rangee-de-bloc"
import type { Conflit } from "./use-envois"
import { useEditeur } from "./use-editeur"

type EditeurDeBlocsProps = {
  niveau: 2 | 3
  /** Les blocs servis : ceux du brouillon s'il existe, sinon ceux de la version publiée. */
  blocs: BlockView[]
  /** La révision publiée servie par la lecture du nœud. */
  revisionServie: number
  /** Au niveau écriture, à qui revient la publication (AC8). */
  phraseDePublication: string
  prefixeDesPages: string
  /** « Voir la version publiée », lien de l'hôte déjà rendu (AC9). */
  lienVersionPubliee: ReactNode
  /** Les blocs `reference` rendus en place par la page serveur, par `id` de bloc (E07-S03, AC16) ; sans rendu, `ReferenceEnLien`. */
  referencesRendues?: Readonly<Record<string, ReactNode>>
  /** Le genre du nœud (E05-S04) ; absent, une page. */
  genre?: NodeKind
  /** Les cibles des pages que citent les blocs, lues dans l'arbre visible (E05-S11, AC-26, AC-27). */
  cibles?: CiblesDesLiens
  /** Les champs de `read` sur le nœud (ses liens sortants), lus par l'hôte après la page. */
  liens?: Promise<Resultat<Record<string, unknown>>>
}

type RangeesProps = {
  modele: Rangee[]
  /** La rangée qu'on glisse (E05-S10, AC-a3). */
  tenue: string | null
  /** La rangée dont tout le texte est sélectionné : le menu de sa poignée est ouvert (E05-S11, AC-28). */
  menuOuvert: string | null
  erreurs: Readonly<Record<string, string>>
  conflit: Conflit | null
  liens: LiensDesBlocs
  referencesRendues?: Readonly<Record<string, ReactNode>>
}

/** Les rangées, une par bloc, rendues par leur clé de rendu, jamais par leur rang. */
function Rangees({ modele, tenue, menuOuvert, erreurs, conflit, liens, referencesRendues }: RangeesProps) {
  return modele.map((rangee, rang) => (
    <RangeeDeBloc
      key={rangee.cle}
      rangee={rangee}
      premiere={rang === 0}
      derniere={rang === modele.length - 1}
      tenue={tenue === rangee.cle}
      menuOuvert={menuOuvert === rangee.cle}
      // Un conflit ouvert : les autres champs sont en lecture seule jusqu'à son règlement (HN-E05S08-3).
      verrouillee={conflit !== null && conflit.cle !== rangee.cle}
      erreur={erreurs[rangee.cle] ?? null}
      conflit={conflit?.cle === rangee.cle ? conflit : null}
      liens={liens}
      rendu={rangee.bloc.id === undefined ? undefined : referencesRendues?.[rangee.bloc.id]}
    />
  ))
}

/** Une page sans bloc (AC7, AC11) : la phrase, et le seul chemin pour commencer à écrire (une rangée porte le « + »). */
function PageVide() {
  const gestes = useGestes()
  return (
    <EmptyState
      title={PAGE_VIDE}
      action={
        <Button variant="secondary" size="sm" iconStart={<AnimatedIcon as={Plus} size="xs" />} onClick={gestes.insererEnTete}>
          {EDITEUR.premierBloc}
        </Button>
      }
    />
  )
}

export function EditeurDeBlocs(props: EditeurDeBlocsProps) {
  const { niveau, blocs, revisionServie, phraseDePublication, lienVersionPubliee, referencesRendues, genre = "page" } = props
  const editeur = useEditeur({ blocs, revisionServie })
  const { envois } = editeur
  const glisser = useGlisser({ racine: editeur.racine, glisser: editeur.actions.glisserDUnRang, deposer: editeur.actions.deposer })
  const [menuOuvert, setMenuOuvert] = useState<string | null>(null)
  const liens: LiensDesBlocs = { prefixe: props.prefixeDesPages, cibles: props.cibles, lecture: props.liens }
  // Tout le texte d'un bloc sélectionné ouvre le menu de sa poignée ; une autre sélection le referme (AC-28).
  const selectionner = (cle: string, totale: boolean) => setMenuOuvert((ouvert) => (totale ? cle : ouvert === cle ? null : ouvert))
  return (
    <ContexteDesGestes.Provider value={{ ...editeur.actions, poignee: glisser.poignee, selectionner, fermerLeMenu: () => setMenuOuvert(null) }}>
      <Reader ref={editeur.racine}>
        <IndicationDEnregistrement niveau={niveau} />
        <div className="mb-3.5 flex flex-col gap-2">
          <BandeauDuBrouillon lien={lienVersionPubliee} niveau={niveau} />
          <Publication niveau={niveau} phrase={phraseDePublication} genre={genre} blocs={editeur.blocs} />
          <AlerteDEdition alerte={envois.alerte} />
        </div>
        {editeur.modele.length === 0 ? (
          <PageVide />
        ) : (
          <Rangees
            modele={editeur.modele}
            tenue={glisser.enCours}
            menuOuvert={menuOuvert}
            erreurs={editeur.erreurs}
            conflit={envois.conflit}
            liens={liens}
            referencesRendues={referencesRendues}
          />
        )}
        <LigneDAnnonce annonce={envois.annonce} />
      </Reader>
    </ContexteDesGestes.Provider>
  )
}
