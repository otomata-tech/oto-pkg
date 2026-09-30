"use client"

// Ce que deviennent les gestes de l'éditeur (E05-S02, AC10 à AC15, AC18) : chaque geste fini part par
// la file, en une opération par bloc dont le corps se calcule à l'envoi ; la réponse fait adopter au
// bloc son `id`, sa référence et sa révision ; un refus s'annonce près du texte, ou fait relire la
// page pour régler un conflit au bloc (`resolution.ts`). Sans lui, l'éditeur mêlerait l'orchestration
// du clavier et celle des écritures. L'état des écritures se dit par la carte du document, qui lit la file
// (`IndicationDEnregistrement`, E05-S11, AC-1). E10-S01 : une écriture qui change plusieurs blocs d'un coup (collage,
// `.md` déposé, tableau simple converti) part derrière les autres, puis fait relire le brouillon (`envoyerEtRelire`).
import { useCallback, useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react"
import type { BlockView } from "../../../schemas"
import type { ErreurPlateforme } from "../../api/client"
import { IMPORT } from "../../coque/libelles"
import { messageDErreur } from "../../api/messages"
import { useRafraichir } from "../../hote/rafraichir"
import { EDITEUR, SELECTION } from "../libelles"
import { useFileDOperations, type CorpsDEnvoi, type File } from "./file-d-operations"
import { deplacementsDuGroupe, insertionsDuGroupe, type CorpsDuGroupe, type GesteDeGroupe } from "./groupe"
import { adopter, rangeesDepuis, texteDe, type BlocEdite, type Focus, type Rangee, type Retiree } from "./modele"
import { alerteDuRefus, controler, idPrecedent, operationDeplacer, operationInserer, operationRemplacer, operationSupprimer, verdictDuRefus, type AlerteDeRefus } from "./operations"
import { actionsDeResolution } from "./resolution"

export type Identite = { id: string; ref: string; revision: number }

/** Un bloc en conflit (AC15) : le texte de la personne, la version enregistrée relue, le texte final. */
export type Conflit = {
  cle: string
  nature: "change" | "supprime"
  texte: string
  version: BlockView | null
  /** Le bloc a encore changé pendant la résolution : une alerte neuve, rang `annonce`, est montée. */
  encore: boolean
  annonce: number
  erreur: string | null
  envoi: boolean
}

export type Geste = "remplacer" | "inserer" | "supprimer" | "deplacer" | "final"

export type Refus = { geste: Geste; cle: string; erreur: ErreurPlateforme; revisionEnvoyee: number; retiree?: Retiree; vise?: Identite | null }

/** Un refus qui attend la relecture de la page pour être lu (AC15). */
type Attente = Refus & { vise: Identite | null; texte: string; blocs: readonly BlockView[] }

/** `retiree` : « Annuler » d'une suppression ; `groupe` : celui d'un geste sur une sélection de blocs (E11-S17, AC-a6, AC-a8). */
export type Annonce = { id: number; message: string; retiree?: Retiree; groupe?: GesteDeGroupe }

/** `cle` : la rangée qui reçoit le focus quand « Réessayer » retire l'alerte (celle du geste refusé). */
export type AlerteDeLEditeur = AlerteDeRefus & { texte: string; cle: string | null }

type Parametres = {
  blocs: readonly BlockView[]
  revisionServie: number
  modele: RefObject<Rangee[]>
  changerModele: (modele: Rangee[]) => void
  fixes: RefObject<Map<string, BlocEdite>>
  ids: RefObject<Map<string, Identite>>
  /** Le focus après un geste qui retire son propre contrôle (`accessibility-patterns.md § Focus Management`). */
  setFocus: (focus: Focus | null) => void
}

/** Ce que partagent les envois et la résolution d'un conflit. */
export type Moteur = Parametres & {
  file: File
  conflit: Conflit | null
  setConflit: Dispatch<SetStateAction<Conflit | null>>
  setAlerte: Dispatch<SetStateAction<AlerteDeLEditeur | null>>
  refuser: (refus: Refus) => void
  adopterIdentite: (cle: string, identite: Identite | undefined) => void
  corpsDeLInsertion: (cle: string) => CorpsDEnvoi | null
}

const trouver = (modele: readonly Rangee[], cle: string) => modele.find((rangee) => rangee.cle === cle)

type MoteurDuGroupe = Pick<Moteur, "file" | "modele" | "fixes" | "ids" | "refuser" | "adopterIdentite" | "setAlerte">

/**
 * Les écritures d'un geste sur une sélection de blocs (E11-S17, AC-a6, AC-a8) : une seule écriture de plusieurs
 * opérations, dont le corps se calcule à l'envoi, refusée en entier si l'une l'est (HN-E11S16-7). Un refus se lit sans
 * bloc visé (`vise: null`) : la page relue dit un conflit de page ou le message, avec « Réessayer ». Un corps refusé
 * pour lui-même (`invalid_arguments`) échouerait encore renvoyé : il quitte la file, et l'alerte dit de recharger. Sans
 * elles, un groupe partirait en N écritures, et un refus en laisserait une partie écrite.
 */
function envoisDuGroupe({ file, modele, fixes, ids, refuser, adopterIdentite, setAlerte }: MoteurDuGroupe) {
  const envoyer = (geste: Geste, cles: readonly string[], corps: () => CorpsDuGroupe | null) => {
    let ordre: readonly string[] = cles
    file.envoyer({
      corps: () => {
        const lu = corps()
        if (!lu || lu.ops.length === 0) return null
        ordre = lu.cles
        return { ops: lu.ops }
      },
      issue: (issue) => {
        if (issue.erreur?.code === "invalid_arguments") {
          file.remplacerLArret(null)
          return setAlerte({ message: SELECTION.refusee, copier: false, recharger: true, reessayer: false, texte: "", cle: null })
        }
        if (issue.erreur) return refuser({ geste, cle: ordre[0] ?? "", erreur: issue.erreur, revisionEnvoyee: issue.revisionEnvoyee, vise: null })
        if (geste === "supprimer") for (const cle of ordre) ids.current.delete(cle)
        else ordre.forEach((cle, rang) => adopterIdentite(cle, issue.data.touched[rang]?.blocks[0]))
      },
    })
  }
  return {
    /** N `delete_block`, chacun avec sa révision lue ; un bloc jamais écrit n'a rien à supprimer. */
    envoyerSuppressions: (retirees: readonly Retiree[]) =>
      envoyer(
        "supprimer",
        retirees.map((retiree) => retiree.rangee.cle),
        () => {
          const envoyees = retirees.flatMap(({ rangee: { cle } }) => {
            const identite = ids.current.get(cle)
            return identite ? [{ cle, op: operationSupprimer(identite.id, identite.revision) }] : []
          })
          return { ops: envoyees.map((une) => une.op), cles: envoyees.map((une) => une.cle) }
        },
      ),
    /** Les blocs rétablis par « Annuler », chacun tel qu'il était enregistré (`fixes`), à sa place. */
    envoyerInsertions: (cles: readonly string[]) =>
      envoyer("inserer", cles, () => {
        const entrees = cles.flatMap((cle) => {
          const fixe = fixes.current.get(cle)
          if (!trouver(modele.current, cle) || !fixe || ids.current.has(cle)) return []
          const controle = controler(fixe)
          return "entree" in controle ? [{ cle, entree: controle.entree }] : []
        })
        return insertionsDuGroupe(modele.current, entrees)
      }),
    envoyerDeplacements: (cles: readonly string[]) => envoyer("deplacer", cles, () => deplacementsDuGroupe(modele.current, cles, (cle) => ids.current.get(cle)?.id)),
  }
}

/** La rangée d'un refus : celle du geste, ou, pour un bloc supprimé depuis, celle de son ancien voisin. */
const rangeeDuRefus = (modele: readonly Rangee[], refus: Pick<Refus, "cle" | "retiree">) =>
  trouver(modele, refus.cle) ? refus.cle : (refus.retiree?.voisin ?? null)

export function useEnvois(parametres: Parametres) {
  const { blocs, revisionServie, modele, changerModele, fixes, ids, setFocus } = parametres
  const file = useFileDOperations()
  const rafraichir = useRafraichir()
  const [annonce, setAnnonce] = useState<Annonce | null>(null)
  const [alerte, setAlerte] = useState<AlerteDeLEditeur | null>(null)
  const [conflit, setConflit] = useState<Conflit | null>(null)
  const [attente, setAttente] = useState<Attente | null>(null)
  const numero = useRef(0)
  const convertis = useRef(new Map<string, string>())
  // Les blocs servis au moment d'un refus : ceux d'une relecture arrivent après, en nouvelles props.
  const blocsLus = useRef(blocs)
  useEffect(() => {
    blocsLus.current = blocs
  }, [blocs])

  // Stable : le minuteur d'« Annuler » ne repart pas à chaque rendu de l'éditeur.
  const fermerAnnonce = useCallback(() => setAnnonce(null), [])

  const adopterIdentite = (cle: string, identite: Identite | undefined) => {
    if (!identite) return
    ids.current.set(cle, identite)
    changerModele(adopter(modele.current, cle, identite))
  }

  const refuser = (refus: Refus) => {
    const bloc = trouver(modele.current, refus.cle)?.bloc ?? refus.retiree?.rangee.bloc
    const texte = bloc ? texteDe(bloc) : ""
    const lue = alerteDuRefus(refus.erreur)
    if (lue) {
      setConflit((courant) => (courant ? { ...courant, envoi: false } : courant))
      return setAlerte({ ...lue, texte, cle: rangeeDuRefus(modele.current, refus) })
    }
    const vise = refus.vise !== undefined ? refus.vise : refus.geste === "remplacer" || refus.geste === "supprimer" ? (ids.current.get(refus.cle) ?? null) : null
    setAttente({ ...refus, vise, texte, blocs: blocsLus.current })
    rafraichir()
  }

  /**
   * Un geste part par la file ; son corps se calcule à l'envoi : `null` quand il n'a plus rien à envoyer (son bloc
   * retiré ou déjà écrit entre-temps), la file le passe sans réponse.
   */
  const envoyer = (geste: Geste, cle: string, corps: () => CorpsDEnvoi | null, retiree?: Retiree) => {
    file.envoyer({
      corps,
      issue: (issue) => {
        if (issue.erreur) return refuser({ geste, cle, erreur: issue.erreur, revisionEnvoyee: issue.revisionEnvoyee, retiree })
        if (geste === "supprimer") ids.current.delete(cle)
        else adopterIdentite(cle, issue.data.touched[0]?.blocks[0])
      },
    })
  }

  // La page relue arrive en nouvelles props : le refus en attente se lit alors (AC15).
  useEffect(() => {
    if (!attente || blocs === attente.blocs) return
    setAttente(null)
    const verdict = verdictDuRefus(attente.vise, { blocs, revision: revisionServie }, attente.revisionEnvoyee)
    const alerter = (message: string) =>
      setAlerte({ message, copier: false, recharger: false, reessayer: true, texte: attente.texte, cle: rangeeDuRefus(modele.current, attente) })
    if (verdict.genre === "conflit-de-page") return alerter(EDITEUR.pageChangee)
    if (verdict.genre === "message") return alerter(messageDErreur(attente.erreur))
    if (attente.geste === "supprimer") {
      // Un bloc modifié pendant sa suppression reparaît, relu ; déjà supprimé, il n'y a rien à faire.
      if (verdict.genre === "conflit-du-bloc") {
        const [rangee] = rangeesDepuis([verdict.version])
        const apres = attente.retiree?.voisin ? modele.current.findIndex((une) => une.cle === attente.retiree?.voisin) + 1 : 0
        ids.current.set(rangee.cle, { id: verdict.version.id, ref: verdict.version.ref, revision: verdict.version.revision })
        fixes.current.set(rangee.cle, rangee.bloc)
        changerModele([...modele.current.slice(0, apres), rangee, ...modele.current.slice(apres)])
        setAnnonce(null)
        setAlerte({ message: EDITEUR.blocGarde, copier: false, recharger: false, reessayer: false, texte: "", cle: rangee.cle })
      }
      return file.remplacerLArret(null)
    }
    numero.current += 1
    const version = verdict.genre === "conflit-du-bloc" ? verdict.version : null
    const suivant = numero.current
    // Le texte de la personne à la relecture : son champ, toujours monté, a pu recevoir des frappes depuis l'envoi refusé (E05-S08).
    const tape = trouver(modele.current, attente.cle)?.bloc
    setConflit((courant) => ({
      cle: attente.cle,
      nature: version ? "change" : "supprime",
      texte: courant?.texte ?? (tape ? texteDe(tape) : attente.texte),
      version,
      encore: courant !== null,
      annonce: suivant,
      erreur: null,
      envoi: false,
    }))
  }, [attente, blocs, revisionServie, changerModele, file, fixes, ids, modele])

  const corpsDeLInsertion = (cle: string): CorpsDEnvoi | null => {
    const fixe = fixes.current.get(cle)
    if (!trouver(modele.current, cle) || !fixe || ids.current.has(cle)) return null
    const controle = controler(fixe)
    return "entree" in controle ? { ops: [operationInserer(idPrecedent(modele.current, cle), controle.entree)] } : null
  }

  const resolution = actionsDeResolution({ ...parametres, file, conflit, setConflit, setAlerte, refuser, adopterIdentite, corpsDeLInsertion })

  return {
    annonce,
    alerte,
    conflit,
    attente: attente !== null,
    envoyerRemplacement: (cle: string) =>
      envoyer("remplacer", cle, () => {
        const fixe = fixes.current.get(cle)
        const identite = ids.current.get(cle)
        if (!trouver(modele.current, cle) || !fixe || !identite) return null
        const controle = controler(fixe)
        return "entree" in controle ? { ops: [operationRemplacer(identite.id, identite.revision, controle.entree)] } : null
      }),
    envoyerInsertion: (cle: string) => envoyer("inserer", cle, () => corpsDeLInsertion(cle)),
    envoyerSuppression: (retiree: Retiree) =>
      envoyer(
        "supprimer",
        retiree.rangee.cle,
        () => {
          const identite = ids.current.get(retiree.rangee.cle)
          return identite ? { ops: [operationSupprimer(identite.id, identite.revision)] } : null
        },
        retiree,
      ),
    envoyerDeplacement: (cle: string) =>
      envoyer("deplacer", cle, () => {
        const identite = ids.current.get(cle)
        return identite && trouver(modele.current, cle) ? { ops: [operationDeplacer(identite.id, idPrecedent(modele.current, cle))] } : null
      }),
    annoncer: (message: string, retiree?: Retiree) => setAnnonce({ id: ++numero.current, message, retiree }),
    ...envoisDuGroupe({ file, modele, fixes, ids, refuser, adopterIdentite, setAlerte }),
    /** L'annonce d'un geste sur une sélection de blocs, et son « Annuler » quand il a quelque chose à défaire (E11-S17). */
    annoncerLeGroupe: (message: string, groupe?: GesteDeGroupe) => setAnnonce({ id: ++numero.current, message, groupe }),
    /**
     * Une écriture qui change plusieurs blocs d'un coup (E10-S01, AC-a1, AC-a4, AC-b7), derrière les écritures en
     * attente : à la réponse, le brouillon est relu (le modèle prend ce qu'il lit) et ce que le mode tolérant a gardé
     * en texte s'annonce (AC-a2) ; un refus se dit près du bloc, et la file repart sans elle.
     */
    envoyerEtRelire: (cle: string, corps: () => CorpsDEnvoi | null, refus: (erreur: ErreurPlateforme) => string) =>
      file.envoyer({
        corps,
        issue: (issue) => {
          if (issue.erreur) {
            file.remplacerLArret(null)
            return setAlerte({ message: refus(issue.erreur), copier: false, recharger: false, reessayer: false, texte: "", cle })
          }
          const conserves = issue.data.kept_as_text ?? 0
          if (conserves > 0) setAnnonce({ id: ++numero.current, message: IMPORT.conserves(conserves) })
          rafraichir()
        },
      }),
    /** Le chemin de la page, que la conversion d'un tableau simple range dessous (AC-b7). */
    chemin: file.chemin,
    /**
     * Par rangée, le tableau qu'une conversion a créé sans y écrire son premier lot (HN-E10S01-21) : « Convertir »
     * relancé le remplit, sans en créer un autre à l'adresse suivante.
     */
    convertis,
    fermerAnnonce,
    /** « Réessayer » : l'alerte part avec son bouton, le focus va au bloc du geste refusé. */
    relancer: () => {
      const cle = alerte?.cle ?? modele.current[0]?.cle
      setAlerte(null)
      if (cle) setFocus({ cle, curseur: null, cible: "rangee" })
      file.relancer()
    },
    ...resolution,
  }
}
