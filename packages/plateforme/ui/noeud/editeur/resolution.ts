// La résolution d'un conflit au bloc (E05-S02, AC15, HN-E05S02-6) : seul le texte final part, sur la
// révision de la version enregistrée et sur le geste de la personne, à la place de l'écriture refusée ;
// un bloc supprimé entre-temps se réinsère (nouvel `id`) ou s'abandonne ; abandonner garde la version
// enregistrée. Chaque geste qui règle le conflit retire le panneau qui le porte : le focus va au bloc
// (sa poignée, E05-S08), ou à son voisin quand le bloc part. Sans lui, la file resterait arrêtée sur
// le refus, ou repartirait par-dessus le texte d'un autre rédacteur.
//
// Porté d'oto-frontend (`page-heritee/use-conflit-du-corps.ts`). Repris : la version relue et
// montrée, le texte final prérempli avec elle (jamais avec le brouillon), un second refus qui garde
// tout et relit. Retiré : TanStack Query, `docId`, la `rev` md5 (→ révision du bloc), le texte de
// toute la page (→ un bloc).
import { rangeesDepuis, avecTexte, retirer } from "./modele"
import { controler, operationRemplacer } from "./operations"
import type { Moteur } from "./use-envois"

export function actionsDeResolution(moteur: Moteur) {
  const { file, modele, changerModele, fixes, ids, conflit, setConflit, setAlerte, setFocus, refuser, adopterIdentite, corpsDeLInsertion } = moteur
  const remplacerLaRangee = (cle: string, bloc: Parameters<typeof controler>[0]) =>
    changerModele(modele.current.map((rangee) => (rangee.cle === cle ? { cle, bloc } : rangee)))
  const auBloc = (cle: string) => setFocus({ cle, curseur: null, cible: "rangee" })

  return {
    /** « Enregistrer le texte final » : `replace_block` sur la version enregistrée, avec sa révision. */
    enregistrerLeTexteFinal(texte: string) {
      if (!conflit?.version) return
      const { cle, version } = conflit
      const bloc = avecTexte(rangeesDepuis([version])[0].bloc, texte)
      const controle = controler(bloc)
      if ("message" in controle) return setConflit({ ...conflit, erreur: controle.message })
      setConflit({ ...conflit, erreur: null, envoi: true })
      setAlerte(null)
      file.remplacerLArret({
        corps: () => ({ ops: [operationRemplacer(version.id, version.revision, controle.entree)] }),
        issue: (issue) => {
          if (issue.erreur) return refuser({ geste: "final", cle, erreur: issue.erreur, revisionEnvoyee: issue.revisionEnvoyee, vise: { id: version.id, ref: version.ref, revision: version.revision } })
          fixes.current.set(cle, bloc)
          remplacerLaRangee(cle, bloc)
          adopterIdentite(cle, issue.data.touched[0]?.blocks[0])
          setConflit(null)
          auBloc(cle)
        },
      })
    },

    /** « Réinsérer mon texte » : le bloc supprimé entre-temps revient, après son voisin, sous un nouvel `id`. */
    reinsererMonTexte() {
      const rangee = conflit && modele.current.find((une) => une.cle === conflit.cle)
      if (!rangee) return
      const { cle } = rangee
      const { type, text, data, key } = rangee.bloc
      ids.current.delete(cle)
      fixes.current.set(cle, { type, text, data, key })
      remplacerLaRangee(cle, { type, text, data, key })
      setConflit(null)
      auBloc(cle)
      file.remplacerLArret({
        corps: () => corpsDeLInsertion(cle),
        issue: (issue) => {
          if (issue.erreur) return refuser({ geste: "inserer", cle, erreur: issue.erreur, revisionEnvoyee: issue.revisionEnvoyee })
          adopterIdentite(cle, issue.data.touched[0]?.blocks[0])
        },
      })
    },

    /** « Abandonner mon texte », confirmé : la version enregistrée reste, ou le bloc supprimé s'en va. */
    abandonnerMonTexte() {
      if (!conflit) return
      const { cle, version } = conflit
      if (version) {
        const servie = rangeesDepuis([version])[0].bloc
        ids.current.set(cle, { id: version.id, ref: version.ref, revision: version.revision })
        fixes.current.set(cle, servie)
        remplacerLaRangee(cle, servie)
        auBloc(cle)
      } else {
        ids.current.delete(cle)
        fixes.current.delete(cle)
        const suite = retirer(modele.current, cle)
        changerModele(suite.modele)
        if (suite.focus) setFocus(suite.focus)
      }
      setConflit(null)
      file.remplacerLArret(null)
    },
  }
}
