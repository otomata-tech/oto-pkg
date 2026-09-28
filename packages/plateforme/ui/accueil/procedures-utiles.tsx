// L'îlot « Procédures les plus utilisées » de l'accueil (E05-S12, lot B, AC-18 ; HN-E05S12-20) : les premières procédures
// du bloc servi par `context`, dans son ordre (usage sur 90 jours, puis chemin), chacune ouverte par le lien de
// l'hôte. Server Component : le lien arrive en prop. Porté de l'onglet « Procédures » d'oto-frontend
// (`accueil/agents-et-activites.tsx`), en îlot de droite. Repris : une liste courte, une ligne par procédure,
// son glyphe. Retiré : le tri en menu et « tout voir » (aucune page Procédures : `portage-ecrans.md § 0`), les
// pastilles d'état d'exécution (aucune exécution suivie, architecture § 10).
import { Play } from "@phosphor-icons/react/dist/ssr/Play"
import type { UsefulProcedure } from "../../schemas"
import type { Resultat } from "../api/resultat"
import type { LienDeLHote } from "../arbre/navigateur-d-arbre"
import { EmptyState } from "../ds/react/empty-state"
import { FeedItem } from "../ds/react/home"
import { AnimatedIcon } from "../ds/react/icon"
import { Island, IslandBody, IslandHead } from "../ds/react/island"
import { ErreurDeLecture } from "../components/erreur-de-lecture"
import { PROCEDURES_UTILES } from "./libelles"

type ProceduresUtilesProps = {
  procedures: Resultat<UsefulProcedure[]>
  Lien: LienDeLHote
  /** Le préfixe des pages de l'arbre (« /n/ ») : une procédure s'ouvre à ce préfixe suivi de son chemin. */
  prefixeDesPages: string
}

function CorpsDesProcedures({ procedures, Lien, prefixeDesPages }: ProceduresUtilesProps) {
  if (procedures.error !== undefined) return <ErreurDeLecture message={procedures.error} />
  if (procedures.data.length === 0) return <EmptyState title={PROCEDURES_UTILES.rien} />
  return procedures.data.map(({ path, title }) => (
    <FeedItem key={path} as={Lien} href={`${prefixeDesPages}${path}`} lead={<AnimatedIcon as={Play} size="xs" />} name={title} />
  ))
}

export function ProceduresUtiles(props: ProceduresUtilesProps) {
  return (
    <Island aria-label={PROCEDURES_UTILES.titre}>
      <IslandHead>
        <h2>{PROCEDURES_UTILES.titre}</h2>
      </IslandHead>
      <IslandBody>
        <CorpsDesProcedures {...props} />
      </IslandBody>
    </Island>
  )
}
