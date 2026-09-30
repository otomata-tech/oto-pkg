"use client"

// Le titre et le résumé d'un nœud, écrits en place (E05-S02, AC8, AC16 ; E05-S10, AC-a1, AC-a10) : chacun
// est un champ déjà monté, sans bordure ni fond au repos, enregistré comme le texte d'un bloc (quand le focus
// le quitte, sur Entrée ou ⌘S, 1 200 ms après la dernière frappe) par la file, après les gestes qui le
// précèdent, sur le dernier tampon du brouillon ; ses bornes sont celles des champs `title` et `summary` de
// `writeNodeSchema`, et un refus reste sous le champ. Chaque frappe est signalée à la file, d'où part la
// publication seule (AC-a6) : un tableau, sans éditeur de blocs, publie ainsi son en-tête. Un refus
// `stale_revision` fait relire la page : si la valeur a changé ailleurs, celle saisie reste lisible et
// copiable et le champ reprend la valeur enregistrée ; sinon elle repart. Un nœud neuf (« Sans titre », jamais
// publié) s'ouvre titre sélectionné, prêt à être écrit (AC-b3). Sans lui, un rédacteur ne corrige pas le titre
// de sa page depuis l'écran.
//
// Écrit dans le style d'oto-frontend, dont l'en-tête posait un `TitleField` dans le `<h1>` : le champ du
// titre prend le corps du titre où il est posé ; celui du résumé, le corps du texte.
//
// E05-S11 (AC-2) : un enregistrement réussi se dit par l'indication de la carte du document, qui lit la même file
// (`IndicationDEnregistrement`), et non plus par une région propre au champ.
// E11-S05 (AC-g2) : Entrée dans le titre l'enregistre et mène au premier bloc du document, le Texte d'une page vide.
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react"
import { writeNodeSchema } from "../../schemas"
import { messageDErreur } from "../api/messages"
import { CREATION } from "../coque/libelles"
import { useRafraichir } from "../hote/rafraichir"
import { CopieDuTexte } from "./copie-du-texte"
import { useFileDOperations } from "./editeur/file-d-operations"
import { EN_TETE } from "./libelles"

/** Les champs `title` et `summary` de `writeNodeSchema`, exigés : un seul schéma, celui de l'API. */
const enTeteSchema = writeNodeSchema.pick({ title: true, summary: true }).required()

type Champ = "title" | "summary"

/** 1 200 ms sans frappe : le différé des blocs (HN-E05S08-1), appliqué à l'en-tête. */
const DIFFERE_MS = 1_200

const NOMS: Record<Champ, string> = { title: "Titre", summary: "Résumé" }
const INVALIDES: Record<Champ, string> = { title: EN_TETE.titreInvalide, summary: EN_TETE.resumeInvalide }

/** Ce que la lecture sert au champ : sa valeur, et la lecture (révision, tampon) qui la porte. */
type Servi = { valeur: string; revisionServie: number; tamponServi: string | null }

type ChampDEnTeteProps = Servi & {
  champ: Champ
  /** L'aide rendue sous le champ (E05-S04, AC5 : ce que le routage d'une procédure lit) ; absente, rien. */
  aide?: string
  /** Le champ prend le focus au montage, sa valeur sélectionnée : la première frappe la remplace (AC-b3). */
  selectionneALOuverture?: boolean
}

/** Un refus qui attend la relecture : la valeur servie au départ, celle saisie, la lecture servie au refus. */
type Relecture = { depart: string; saisi: string; lecture: string }

/** Le texte d'un champ d'une ligne : un saut de ligne collé devient un blanc. Repris par le résumé d'un repli (`repli-edite.tsx`). */
export const uneLigne = (texte: string) => texte.replace(/[\r\n]+/gu, " ")

/** L'envoi d'un champ par la file, et sa relecture après un refus `stale_revision` (AC16 d'E05-S02). */
function useChampDEnTete({ champ, valeur, revisionServie, tamponServi }: Servi & { champ: Champ }) {
  const file = useFileDOperations()
  const rafraichir = useRafraichir()
  const [saisie, setSaisie] = useState(valeur)
  const [vue, setVue] = useState(valeur)
  const [erreur, setErreur] = useState<string | null>(null)
  const [garde, setGarde] = useState<string | null>(null)
  const [relecture, setRelecture] = useState<Relecture | null>(null)
  // Une relecture qui sert une autre valeur la remet dans le champ, sauf pendant une saisie (`portage-ecrans.md § 2`).
  if (valeur !== vue) {
    setVue(valeur)
    if (saisie === vue) setSaisie(valeur)
  }
  const lecture = `${revisionServie}:${tamponServi ?? ""}`
  // Ce que lisent le différé, la sortie de la page et la relecture : l'état du dernier rendu.
  // `envoyee` : la dernière valeur partie ou servie sans saisie en cours ; la même valeur ne repart pas.
  const lus = useRef({ saisie, envoyee: valeur, vue, lecture, invalide: false })
  const differe = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useLayoutEffect(() => {
    const envoyee = lus.current.vue !== vue && saisie === vue ? vue : lus.current.envoyee
    // Une valeur que le schéma refuse, pas encore partie, retient la publication seule.
    const invalide = saisie !== envoyee && !enTeteSchema.shape[champ].safeParse(saisie).success
    lus.current = { saisie, envoyee, vue, lecture, invalide }
  })

  const enregistrer = () => {
    clearTimeout(differe.current)
    differe.current = undefined
    const saisi = lus.current.saisie
    if (saisi === lus.current.envoyee) return
    const lu = enTeteSchema.shape[champ].safeParse(saisi)
    if (!lu.success) return setErreur(INVALIDES[champ])
    const depart = lus.current.envoyee
    lus.current.envoyee = saisi
    setErreur(null)
    setGarde(null)
    file.envoyer({
      tampon: true,
      corps: () => ({ [champ]: lu.data }),
      issue: (issue) => {
        if (!issue.erreur) return rafraichir()
        // Un refus de l'en-tête n'arrête pas l'édition des blocs : il sort de la file ; la valeur reste à envoyer.
        file.remplacerLArret(null)
        lus.current.envoyee = depart
        if (issue.erreur.code !== "stale_revision") return setErreur(messageDErreur(issue.erreur))
        setRelecture({ depart, saisi, lecture: lus.current.lecture })
        rafraichir()
      },
    })
  }
  const enregistrerLu = useRef(enregistrer)
  useLayoutEffect(() => {
    enregistrerLu.current = enregistrer
  })

  // La page relue après un refus (AC16 d'E05-S02) : changée ailleurs, la saisie se garde à copier ; sinon, elle repart.
  useEffect(() => {
    if (!relecture || lecture === relecture.lecture) return
    setRelecture(null)
    // Au tour suivant : la file, dont l'effet court après celui de ses enfants, reçoit d'abord le tampon relu.
    if (valeur === relecture.depart) return void setTimeout(() => enregistrerLu.current(), 0)
    lus.current.envoyee = valeur
    setSaisie(valeur)
    setErreur(EN_TETE.changeAilleurs)
    setGarde(relecture.saisi)
  }, [relecture, lecture, valeur])

  // La publication seule (E05-S10, AC-a6) : la valeur en attente part avant elle ; une valeur refusée la retient.
  const { participer } = file
  useEffect(
    () =>
      participer({
        vider: () => {
          if (differe.current !== undefined) enregistrerLu.current()
        },
        retient: () => lus.current.invalide,
      }),
    [participer],
  )
  // La page quittée par une navigation de l'hôte (AC-a6, aucun mot perdu) : la saisie en attente part, avant la
  // publication de sortie. L'en-tête, placé avant elle, est nettoyé avant elle (préordre de React 19) et s'est
  // déjà retiré des participants : sans cet envoi, un titre tapé depuis moins de 1 200 ms était jeté (revue 1
  // d'E05-S10). Placé après elle, la publication le vide par `participer`.
  useEffect(
    () => () => {
      if (differe.current !== undefined) enregistrerLu.current()
      clearTimeout(differe.current)
    },
    [],
  )

  const saisir = (texte: string) => {
    setSaisie(uneLigne(texte))
    clearTimeout(differe.current)
    differe.current = setTimeout(() => enregistrerLu.current(), DIFFERE_MS)
    file.frapper()
  }
  return { saisie, erreur, garde, saisir, enregistrer }
}

/** Un champ de l'en-tête, en place : sans chrome au repos, son nom par `aria-label` (`forms-patterns.md § Règles`). */
function ChampDEnTete({ champ, aide, selectionneALOuverture = false, ...servi }: ChampDEnTeteProps) {
  const id = useId()
  const champRef = useRef<HTMLTextAreaElement>(null)
  // Lu au montage seulement : une relecture qui change la valeur ne reprend pas le focus.
  const aLOuverture = useRef(selectionneALOuverture)
  useEffect(() => {
    if (!aLOuverture.current) return
    champRef.current?.focus()
    champRef.current?.select()
  }, [])
  const { saisie, erreur, garde, saisir, enregistrer } = useChampDEnTete({ champ, ...servi })
  const toucher = (evenement: KeyboardEvent<HTMLTextAreaElement>) => {
    const sauver = (evenement.metaKey || evenement.ctrlKey) && evenement.key.toLowerCase() === "s"
    if (evenement.key !== "Enter" && !sauver) return
    evenement.preventDefault()
    enregistrer()
    // Le champ du premier bloc, dans une rangée de l'éditeur (`data-cle`) : le titre et le résumé portent aussi `data-champ`.
    if (champ === "title" && evenement.key === "Enter") evenement.currentTarget.ownerDocument.querySelector<HTMLElement>("[data-cle] [data-champ]")?.focus()
  }
  const decritPar = [aide ? `${id}-aide` : "", erreur ? `${id}-erreur` : ""].filter(Boolean).join(" ") || undefined
  return (
    <span className="oto-en-tete-en-place" data-champ={champ}>
      <textarea
        ref={champRef}
        rows={1}
        value={saisie}
        aria-label={NOMS[champ]}
        aria-invalid={erreur ? true : undefined}
        aria-describedby={decritPar}
        onChange={(evenement) => saisir(evenement.target.value)}
        onKeyDown={toucher}
        onBlur={enregistrer}
        className="oto-inline-field field-sizing-content focus-visible:ring-2 focus-visible:ring-ink"
      />
      {aide && (
        <span id={`${id}-aide`} className="oto-field-hint block">
          {aide}
        </span>
      )}
      {erreur && (
        <span id={`${id}-erreur`} role="alert" className="oto-field-error block">
          {erreur}
        </span>
      )}
      {garde !== null && (
        <span className="flex flex-wrap items-center gap-2 text-sm text-ink">
          {`${champ === "title" ? "Votre titre" : "Votre résumé"}, non enregistré : ${garde}`}
          <CopieDuTexte texte={garde} />
        </span>
      )}
    </span>
  )
}

type Lecture = { revisionServie: number; tamponServi: string | null }

/**
 * Le titre en place (AC-a1) : à poser dans le `<h1>` de l'en-tête, dont il prend le corps. Le nœud que le rail
 * vient de créer (« Sans titre », publié dès sa création depuis E11-S02) s'ouvre titre prêt à être écrit
 * (AC-b3 ; E11-S02, AC-c5 : reconnu au titre seul, quelle que soit la révision, HN-E11S02-29).
 */
export function TitreModifiable({ titre, ...lecture }: Lecture & { titre: string }) {
  const neuf = titre === CREATION.sansTitre
  return <ChampDEnTete champ="title" valeur={titre} selectionneALOuverture={neuf} {...lecture} />
}

/** Le résumé en place (AC-a1), à la place du résumé lu ; l'aide d'une procédure dessous (E05-S04, AC5). */
export function ResumeModifiable({ resume, aideDuResume, ...lecture }: Lecture & { resume: string; aideDuResume?: string }) {
  return <ChampDEnTete champ="summary" valeur={resume} aide={aideDuResume} {...lecture} />
}
