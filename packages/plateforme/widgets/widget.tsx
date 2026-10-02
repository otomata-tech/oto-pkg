// Le widget routeur (story widgets-dans-la-conversation) : attend le résultat de l'outil, puis rend sa vue
// (`VueDuResultat`) ou rien. Quatre états : chargement (jamais terminal), données, vide, et l'erreur du délai, qui dit
// quoi demander dans la conversation (`mcp-patterns.md § 5.3`). Les appels qu'il fait partent par l'host vers l'outil
// `call` de l'organisation (`view.call`), sous le `ctx` de la conversation, et ne portent jamais `confirm`.
import { useEffect, useState } from "react"
import type { SourceDuResultat } from "./bridge"
import { LIBELLES, RegionDAlerte, VueDeChargement, VueDuResultat, type ActionsDuWidget } from "./vues"
import type { ErpView } from "./index"

/** Au-delà, le chargement bascule sur l'erreur du délai. */
export const DELAI_MS = 12_000

type Resultat = Record<string, unknown>

const estObjet = (valeur: unknown): valeur is Resultat => typeof valeur === "object" && valeur !== null && !Array.isArray(valeur)

/** Le `ctx` sous lequel appeler : celui que le résultat donne (`new_ctx`, Contexte changé), sinon celui de l'appel. */
function ctxDe(resultat: Resultat | null, entree: Resultat | null): string | null {
  if (typeof resultat?.new_ctx === "string") return resultat.new_ctx
  return typeof entree?.ctx === "string" ? entree.ctx : null
}

/** L'outil `call` de l'organisation, nommé par la vue servie. */
function outilDe(resultat: Resultat | null): string | null {
  const vue = resultat?.view
  return estObjet(vue) && typeof vue.call === "string" ? vue.call : null
}

/** Le résultat, ses arguments, l'alerte et les actions du widget, branchés sur la source de l'host. */
function useResultat(source: SourceDuResultat) {
  const [resultat, setResultat] = useState<Resultat | null>(null)
  const [entree, setEntree] = useState<Resultat | null>(null)
  const [alerteDAppel, setAlerteDAppel] = useState<{ titre: string; texte: string } | null>(null)
  const [enRetard, setEnRetard] = useState(false)
  useEffect(
    () =>
      source.ecouter({
        surResultat: setResultat,
        surEntree: setEntree,
        surNuit: (nuit) => document.documentElement.classList.toggle("dark", nuit),
      }),
    [source],
  )
  useEffect(() => {
    if (resultat) return
    const minuterie = window.setTimeout(() => setEnRetard(true), DELAI_MS)
    return () => window.clearTimeout(minuterie)
  }, [resultat])
  const ctx = ctxDe(resultat, entree)
  const outil = outilDe(resultat)
  // Exactement `ctx`, `function` et `arguments` : jamais `confirm`, une fonction sensible ne rend que son récapitulatif.
  const appeler =
    ctx && outil
      ? async (fonction: string, args: Record<string, unknown>) => {
          const reponse = await source.appeler(outil, { ctx, function: fonction, arguments: args })
          if ("refus" in reponse) return setAlerteDAppel({ titre: LIBELLES.refus, texte: reponse.refus })
          setAlerteDAppel(null)
          setEntree({ ctx, function: fonction, arguments: args })
          setResultat(reponse.resultat)
        }
      : null
  const fonction = typeof entree?.function === "string" ? entree.function : null
  const actions: ActionsDuWidget = {
    appeler,
    lignesSuivantes: appeler && fonction ? (cursor) => appeler(fonction, { ...(estObjet(entree?.arguments) ? entree.arguments : {}), cursor }) : null,
    // Hors d'un host qui accepte un message (page ouverte seule), l'échec se dit au lieu de se perdre.
    suite: (nom) => source.envoyerMessage(`Lance ${nom} sur ce résultat.`).catch(() => setAlerteDAppel({ titre: LIBELLES.messageRefuse, texte: LIBELLES.messageConseil })),
  }
  const alerte = alerteDAppel ?? (enRetard && !resultat ? { titre: LIBELLES.delai, texte: LIBELLES.delaiConseil } : null)
  return { resultat, enRetard, actions, alerte }
}

export function Widget({ source, vuesErp = {} }: { source: SourceDuResultat; vuesErp?: Readonly<Record<string, ErpView>> }) {
  const { resultat, enRetard, actions, alerte } = useResultat(source)
  return (
    <>
      {resultat ? <VueDuResultat resultat={resultat} vuesErp={vuesErp} actions={actions} /> : !enRetard && <VueDeChargement />}
      <RegionDAlerte message={alerte} />
    </>
  )
}
