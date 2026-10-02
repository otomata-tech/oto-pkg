// Le widget routeur dans la conversation (story widgets-dans-la-conversation, `mcp-patterns.md § 5.1`) : le
// SEUL fichier qui manipule les clés de méta des widgets et leurs types MIME. Un bundle, deux resources (même
// HTML) : Claude ne lit que le standard MCP Apps (`text/html;profile=mcp-app`, un `text/html` nu est rejeté),
// ChatGPT l'alias Apps SDK (`text/html+skybridge`). Le jour où ChatGPT ne lit plus que le standard, la variante
// skybridge part d'ici seulement.
import { VIEW_HTML } from "./widgets/generated"

const VIEW_URI = "ui://oto/view.html"
const SKYBRIDGE_URI = "ui://oto/view-skybridge.html"

const RESOURCES = [
  { uri: VIEW_URI, mimeType: "text/html;profile=mcp-app" },
  { uri: SKYBRIDGE_URI, mimeType: "text/html+skybridge" },
] as const

/** Méta du widget sur un outil : le standard GA, l'alias plat du brouillon SEP-1865 (hosts d'avant la GA), l'alias Apps SDK. */
export function widgetMeta() {
  return {
    ui: { resourceUri: VIEW_URI },
    "ui/resourceUri": VIEW_URI,
    "openai/outputTemplate": SKYBRIDGE_URI,
  }
}

/** `resources/list` : les deux variantes du bundle. */
export function widgetResources() {
  return RESOURCES.map(({ uri, mimeType }) => ({ uri, name: "oto-view", title: "Result view", mimeType }))
}

/** `resources/read` : le HTML du bundle sous le type MIME de l'adresse demandée ; `null` pour une adresse inconnue. */
export function readWidgetResource(uri: string) {
  const resource = RESOURCES.find((one) => one.uri === uri)
  return resource ? { contents: [{ uri: resource.uri, mimeType: resource.mimeType, text: VIEW_HTML }] } : null
}
