// Le seul pont du widget vers l'host (`mcp-patterns.md § 5.2`) : le résultat de l'outil (`structuredContent`), ses
// arguments, le jour ou la nuit de l'host, et dans l'autre sens un appel d'outil ou un message dans la conversation.
// Le protocole MCP Apps passe par le SDK officiel (`ext-apps`, entrée `app-with-deps`, jamais réimplémenté) ; ChatGPT
// par `window.openai` en plus, dont les mises à jour arrivent par l'événement `openai:set_globals`, avec une relecture
// de secours (400 ms × 30). Chaque canal manquant est ignoré : le rendu ne casse jamais. Le postMessage d'avant la GA
// n'est pas écouté : aucun host visé ne le parle.
import { App } from "@modelcontextprotocol/ext-apps/app-with-deps"

type Resultat = Record<string, unknown>

/** La réponse d'un appel d'outil : son `structuredContent`, ou le texte d'un refus (`isError`). */
export type ReponseDOutil = { resultat: Resultat } | { refus: string }

export type Ecouteurs = {
  surResultat: (resultat: Resultat) => void
  surNuit: (nuit: boolean) => void
  /** Les arguments de l'appel d'outil que le résultat rend (`ctx`, `function`, `arguments`). */
  surEntree: (entree: Resultat) => void
}

export type SourceDuResultat = {
  /** Abonne aux résultats, au thème et aux arguments de l'appel ; rend la fonction qui désabonne. */
  ecouter: (ecouteurs: Ecouteurs) => () => void
  /** Appelle un outil du serveur par l'host. */
  appeler: (outil: string, args: Resultat) => Promise<ReponseDOutil>
  /** Écrit un message de la personne dans la conversation, que l'assistant lit au tour suivant. */
  envoyerMessage: (texte: string) => Promise<void>
}

type FenetreOpenAi = {
  toolOutput?: unknown
  toolInput?: unknown
  theme?: unknown
  callTool?: (name: string, args: Resultat) => Promise<unknown>
  sendFollowUpMessage?: (message: { prompt: string }) => Promise<void>
}

const RELECTURES = 30
const INTERVALLE_MS = 400
const REFUS_SANS_TEXTE = "The call was refused."

const estObjet = (valeur: unknown): valeur is Resultat => typeof valeur === "object" && valeur !== null && !Array.isArray(valeur)

function openai(): FenetreOpenAi | null {
  const globaux: unknown = Reflect.get(window, "openai")
  return estObjet(globaux) ? globaux : null
}

/** Le texte d'un résultat d'outil (`content[0].text`), pour dire un refus. */
function texteDe(reponse: Resultat): string {
  const blocs = Array.isArray(reponse.content) ? reponse.content : []
  const premier: unknown = blocs[0]
  return estObjet(premier) && typeof premier.text === "string" ? premier.text : REFUS_SANS_TEXTE
}

/** Un `CallToolResult` lu sans le croire : refus, `structuredContent`, ou refus sans texte. */
function reponseDe(reponse: unknown): ReponseDOutil {
  if (!estObjet(reponse)) return { refus: REFUS_SANS_TEXTE }
  if (reponse.isError === true) return { refus: texteDe(reponse) }
  return estObjet(reponse.structuredContent) ? { resultat: reponse.structuredContent } : { refus: texteDe(reponse) }
}

/** ChatGPT (Apps SDK) : lecture synchrone, événement `openai:set_globals`, relecture de secours. */
function ecouterOpenAi({ surResultat, surNuit, surEntree }: Ecouteurs): () => void {
  const lire = () => {
    const globaux = openai()
    if (!globaux) return false
    if (globaux.theme === "dark" || globaux.theme === "light") surNuit(globaux.theme === "dark")
    if (estObjet(globaux.toolInput)) surEntree(globaux.toolInput)
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

// Une seule connexion MCP Apps pour la page : celle qui écoute est celle qui appelle.
let application: App | null = null
const app = () => (application ??= new App({ name: "oto-view", version: "1" }, {}, { autoResize: true }))

/** MCP Apps (Claude, ChatGPT) : le résultat de l'outil, ses arguments et le contexte de l'host, par le SDK officiel. */
function ecouterMcpApps({ surResultat, surNuit, surEntree }: Ecouteurs): () => void {
  const courante = app()
  courante.addEventListener("toolresult", (params) => {
    if (estObjet(params.structuredContent)) surResultat(params.structuredContent)
  })
  courante.addEventListener("toolinput", (params) => {
    if (estObjet(params.arguments)) surEntree(params.arguments)
  })
  courante.addEventListener("hostcontextchanged", (contexte) => {
    if (contexte.theme) surNuit(contexte.theme === "dark")
  })
  courante
    .connect()
    .then(() => {
      const theme = courante.getHostContext()?.theme
      if (theme) surNuit(theme === "dark")
    })
    // Hors d'un host MCP Apps (ChatGPT ancien, page ouverte seule) : les autres canaux suffisent.
    .catch(() => {})
  return () => void courante.close().catch(() => {})
}

export const sourceDeLHost: SourceDuResultat = {
  ecouter(ecouteurs) {
    const arrets = [ecouterMcpApps(ecouteurs), ecouterOpenAi(ecouteurs)]
    return () => arrets.forEach((arreter) => arreter())
  },
  async appeler(outil, args) {
    const globaux = openai()
    try {
      return reponseDe(globaux?.callTool ? await globaux.callTool(outil, args) : await app().callServerTool({ name: outil, arguments: args }))
    } catch {
      return { refus: REFUS_SANS_TEXTE }
    }
  },
  async envoyerMessage(texte) {
    const globaux = openai()
    if (globaux?.sendFollowUpMessage) return globaux.sendFollowUpMessage({ prompt: texte })
    await app().sendMessage({ role: "user", content: [{ type: "text", text: texte }] })
  },
}
