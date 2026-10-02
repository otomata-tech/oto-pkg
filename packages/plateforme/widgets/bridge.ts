// Le seul pont du widget vers l'host (`mcp-patterns.md § 5.2`) : le résultat de l'outil (`structuredContent`)
// et le jour ou la nuit de l'host. Le protocole MCP Apps passe par le SDK officiel (`ext-apps`, entrée
// `app-with-deps`, jamais réimplémenté) ; ChatGPT par `window.openai` en plus, dont les mises à jour arrivent par
// l'événement `openai:set_globals`, avec une relecture de secours (400 ms × 30). Chaque canal manquant est
// ignoré : le rendu ne casse jamais. Le postMessage d'avant la GA n'est pas écouté : aucun host visé ne le parle.
import { App } from "@modelcontextprotocol/ext-apps/app-with-deps"

type Resultat = Record<string, unknown>

export type SourceDuResultat = {
  /** Abonne aux résultats et au thème de l'host ; rend la fonction qui désabonne. */
  ecouter: (surResultat: (resultat: Resultat) => void, surNuit: (nuit: boolean) => void) => () => void
}

type FenetreOpenAi = { toolOutput?: unknown; theme?: unknown }

const RELECTURES = 30
const INTERVALLE_MS = 400

const estObjet = (valeur: unknown): valeur is Resultat => typeof valeur === "object" && valeur !== null && !Array.isArray(valeur)

function openai(): FenetreOpenAi | null {
  const globaux: unknown = Reflect.get(window, "openai")
  return estObjet(globaux) ? globaux : null
}

/** ChatGPT (Apps SDK) : lecture synchrone, événement `openai:set_globals`, relecture de secours. */
function ecouterOpenAi(surResultat: (resultat: Resultat) => void, surNuit: (nuit: boolean) => void): () => void {
  const lire = () => {
    const globaux = openai()
    if (!globaux) return false
    if (globaux.theme === "dark" || globaux.theme === "light") surNuit(globaux.theme === "dark")
    if (!estObjet(globaux.toolOutput)) return false
    surResultat(globaux.toolOutput)
    return true
  }
  const surGlobaux = () => void lire()
  window.addEventListener("openai:set_globals", surGlobaux)
  let restantes = RELECTURES
  const relecture = lire()
    ? undefined
    : window.setInterval(() => {
        restantes -= 1
        if (lire() || restantes <= 0) window.clearInterval(relecture)
      }, INTERVALLE_MS)
  return () => {
    window.removeEventListener("openai:set_globals", surGlobaux)
    window.clearInterval(relecture)
  }
}

/** MCP Apps (Claude, ChatGPT) : le résultat de l'outil et le contexte de l'host, par le SDK officiel. */
function ecouterMcpApps(surResultat: (resultat: Resultat) => void, surNuit: (nuit: boolean) => void): () => void {
  const app = new App({ name: "oto-view", version: "1" }, {}, { autoResize: true })
  app.addEventListener("toolresult", (params) => {
    if (estObjet(params.structuredContent)) surResultat(params.structuredContent)
  })
  app.addEventListener("hostcontextchanged", (contexte) => {
    if (contexte.theme) surNuit(contexte.theme === "dark")
  })
  app
    .connect()
    .then(() => {
      const theme = app.getHostContext()?.theme
      if (theme) surNuit(theme === "dark")
    })
    // Hors d'un host MCP Apps (ChatGPT ancien, page ouverte seule) : les autres canaux suffisent.
    .catch(() => {})
  return () => void app.close().catch(() => {})
}

export const sourceDeLHost: SourceDuResultat = {
  ecouter(surResultat, surNuit) {
    const arrets = [ecouterMcpApps(surResultat, surNuit), ecouterOpenAi(surResultat, surNuit)]
    return () => arrets.forEach((arreter) => arreter())
  },
}
