// L'écran « Corbeille » (E05-S10, partie b2, AC-b11) : les contenus que la personne a mis à la corbeille, ou
// qu'elle gère (`listTrash`, lu par la page de l'hôte sous le jeton de la session : droits et purge des
// éléments de plus de 30 jours décidés par le service), chacun avec son type, sa date, le nombre de contenus
// partis avec lui et la date de sa purge, et « Restaurer » (`Restauration`, îlot client). Server Component ;
// les quatre états. Ouvert par le lien du pied du rail. Sans lui, un contenu supprimé ne revient pas.
//
// Écrit dans le style des listes d'oto-frontend (en-tête d'écran, îlot, table du suivi, `TableServeur`) : la
// corbeille n'y existait pas (le geste « Supprimer » y avait été retiré faute de service).
import { Trash } from "@phosphor-icons/react/dist/ssr/Trash"
import type { TrashItem } from "../../schemas"
import type { Resultat } from "../api/resultat"
import { ErreurDeLecture } from "../components/erreur-de-lecture"
import { TableServeur } from "../components/table-serveur"
import { Icon } from "../ds/react/icon"
import { Island, IslandBody } from "../ds/react/island"
import { ScreenHeader } from "../ds/react/screen-header"
import { Skeleton } from "../ds/react/skeleton"
import { dateLisible } from "../format/dates"
import { NATURES } from "../noeud/libelles"
import { CORBEILLE } from "./libelles"
import { Restauration } from "./restauration"

const COLONNES = [
  { entete: CORBEILLE.colonnes.titre },
  { entete: CORBEILLE.colonnes.type },
  { entete: CORBEILLE.colonnes.supprime },
  { entete: CORBEILLE.colonnes.nombre, numerique: true },
  { entete: CORBEILLE.colonnes.purge },
  { entete: CORBEILLE.colonnes.geste },
]

/** Un genre inconnu de l'écran se dit tel que le service le sert, jamais vide. */
const NATURES_PAR_GENRE: ReadonlyMap<string, string> = new Map(Object.entries(NATURES))
const natureDe = (genre: string) => NATURES_PAR_GENRE.get(genre) ?? genre

function Contenus({ items, prefixeDesPages }: { items: TrashItem[]; prefixeDesPages: string }) {
  if (items.length === 0) return <p className="text-sm text-ink">{CORBEILLE.vide}</p>
  return (
    <TableServeur legende={CORBEILLE.ilot} colonnes={COLONNES}>
      {items.map((item) => (
        <tr key={item.path}>
          <td data-primary="">
            <span className="block">{item.title}</span>
            <span className="oto-caption block">{item.path}</span>
          </td>
          <td>{natureDe(item.kind)}</td>
          <td>{dateLisible(item.deletedAt)}</td>
          <td data-numeric="">{CORBEILLE.nombre(item)}</td>
          <td>{dateLisible(item.purgeAt)}</td>
          <td>
            <Restauration chemin={item.path} titre={item.title} prefixeDesPages={prefixeDesPages} />
          </td>
        </tr>
      ))}
    </TableServeur>
  )
}

type EcranDeLaCorbeilleProps = {
  /** `listTrash`, par `resultatDe`. */
  resultat: Resultat<TrashItem[]>
  /** Le préfixe des pages de l'hôte (« /n/ ») : un contenu restauré s'y ouvre. */
  prefixeDesPages: string
}

export function EcranDeLaCorbeille({ resultat, prefixeDesPages }: EcranDeLaCorbeilleProps) {
  return (
    <>
      <ScreenHeader title={CORBEILLE.titre} icon={<Icon as={Trash} size="sm" />} meta={CORBEILLE.description} />
      <Island aria-label={CORBEILLE.ilot}>
        <IslandBody className="flex flex-col gap-4">
          {resultat.error !== undefined ? <ErreurDeLecture message={resultat.error} /> : <Contenus items={resultat.data} prefixeDesPages={prefixeDesPages} />}
        </IslandBody>
      </Island>
    </>
  )
}

/** Le chargement de la corbeille, rendu par le `loading.tsx` de l'hôte : le titre et cinq lignes. */
export function EcranDeLaCorbeilleChargement() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-3">
      <span className="oto-sr-only">{CORBEILLE.chargement}</span>
      <Skeleton shape="text" width="20%" />
      {["un", "deux", "trois", "quatre", "cinq"].map((rang) => (
        <Skeleton key={rang} shape="row" />
      ))}
    </div>
  )
}
