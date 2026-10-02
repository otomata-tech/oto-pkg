// Ce qu'un hôte importe pour écrire une vue de l'ERP (`@otomata_tech/oto_platform/widgets`, story
// widgets-dans-la-conversation) : un fichier `.tsx` par vue dans le dossier passé à `oto-platform widgets build`,
// dont l'export par défaut est un `ErpView`. La vue rend `result` (ce que `run` a rendu en `data`) sous le thème
// `.oto` de la personne ; elle n'a pas d'accès réseau, seulement `call`.
import type { ReactNode } from "react"
import type { Theme } from "../schemas/brand"

export type ErpViewProps = {
  /** `structuredContent.result` du `call` : les données que la fonction a rendues. */
  result: Record<string, unknown>
  theme: Theme
  /**
   * Appelle une fonction du catalogue avec ses arguments, par l'host et sous le `ctx` de la conversation, jamais avec
   * `confirm` : une fonction sensible rend son récapitulatif, rien n'est exécuté. Sa réponse remplace la vue ; un
   * refus est dit par le widget. `null` quand le `ctx` de la conversation n'est pas connu.
   */
  call: ((fn: string, args: Record<string, unknown>) => Promise<void>) | null
}

export type ErpView = (props: ErpViewProps) => ReactNode
