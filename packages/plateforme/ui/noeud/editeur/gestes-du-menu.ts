// Les gestes qu'E05-S10 ajoute à l'éditeur (partie a) : « Dupliquer » et les cases d'une liste à cocher, du
// menu de la poignée (AC-a2) ; le glisser-déposer de la poignée (AC-a3), qui déplace le modèle rang par rang et
// n'envoie l'ordre qu'au dépôt ; le lien inséré par « @ » (AC-a9) ; le texte final d'un conflit, que la
// publication seule suit désormais. Chacun applique une opération pure du
// modèle (`modele.ts`), confie à la file ce qui doit partir, et signale la frappe à la publication seule
// (AC-a6). Sans lui, `actions.ts` dépasserait les 300 lignes d'ESLint (`coding-standards.md § Complexité`).
import { verrouille, type EtatDeLEditeur } from "./actions"
import * as modeleDEdition from "./modele"
import { formeDe } from "./modele"
import { controler, estVide } from "./operations"

export function gestesDuMenu(etat: EtatDeLEditeur, envoyerLeTexte: (cle: string) => boolean) {
  const { modele, changerModele, fixes, setErreur, setFocus, envois, differer, frapper } = etat
  return {
    /** « Dupliquer » : la copie part tout de suite, sauf un bloc vide, qui part avec son texte. */
    dupliquer(cle: string) {
      if (verrouille(etat)) return
      const suite = modeleDEdition.dupliquer(modele.current, cle)
      const copie = suite.modele.find((rangee) => rangee.cle === suite.focus?.cle)
      changerModele(suite.modele)
      if (suite.focus) setFocus(suite.focus)
      if (!copie || (formeDe(copie.bloc) !== null && estVide(copie.bloc))) return
      const controle = controler(copie.bloc)
      if ("message" in controle) return setErreur(copie.cle, controle.message)
      fixes.current.set(copie.cle, copie.bloc)
      envois.envoyerInsertion(copie.cle)
      frapper()
    },
    /** Une case cochée ou décochée : l'état part tout de suite, comme un changement de style. */
    basculerLaCase(cle: string, ligne: number) {
      if (verrouille(etat)) return
      changerModele(modeleDEdition.basculerLaCase(modele.current, cle, ligne))
      envoyerLeTexte(cle)
      frapper()
    },
    /** Un rang pendant un glisser-déposer : le modèle seulement ; l'ordre part au dépôt. */
    glisserDUnRang(cle: string, pas: -1 | 1) {
      if (!envois.conflit) changerModele(modeleDEdition.deplacer(modele.current, cle, pas).modele)
    },
    /** Le dépôt : un seul `move_block`, après le bloc écrit qui précède désormais ; un bloc neuf part avec son texte. */
    deposer(cle: string) {
      if (fixes.current.has(cle)) envois.envoyerDeplacement(cle)
      frapper()
    },
    /** « @ » : le lien inséré s'écrit comme une frappe, le curseur posé juste après lui. */
    citer(cle: string, texte: string, curseur: number) {
      changerModele(modeleDEdition.ecrireTexte(modele.current, cle, texte).modele)
      setFocus({ cle, curseur })
      differer(cle)
      frapper()
    },
    // Le texte final d'un conflit, ou un texte réinséré, est écrit par la personne : la publication seule le suit.
    enregistrerLeTexteFinal(texte: string) {
      envois.enregistrerLeTexteFinal(texte)
      frapper()
    },
    reinsererMonTexte() {
      envois.reinsererMonTexte()
      frapper()
    },
  }
}
