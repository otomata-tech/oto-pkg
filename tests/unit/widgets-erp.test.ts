// @vitest-environment node
// Les vues de l'ERP à l'inscription (story widgets-dans-la-conversation, lot 2) : `registerWidgetViews` inscrit le
// bundle de l'hôte, que `resources/read` sert à la place de celui du paquet ; `registerFunctions` refuse une fonction
// dont la vue n'y est pas. Fichier à part : le bundle inscrit est un état du module, que rien ne retire.
import * as z from "zod/v4"
import { afterEach, describe, expect, it } from "vitest"
import { readWidgetResource } from "../../packages/plateforme/mcp/widget-meta"
import { VIEW_HTML } from "../../packages/plateforme/mcp/widgets/generated"
import { CatalogRegistrationError, defineErpFunction, registerFunctions, registerWidgetViews } from "../../packages/plateforme/server/catalog/erp"
import { catalogFunctions } from "../../packages/plateforme/server/catalog/registry"

const URI = "ui://oto/view.html"
const HOST_HTML = "<!doctype html><html><body><p>bundle de l'hôte</p></body></html>"

/** Une fonction de l'ERP qui déclare `view`. */
function lireDevis(view: string) {
  return defineErpFunction({
    name: "erp.lire_devis",
    class: "read",
    description: "Reads a quote of the ERP by its number.",
    schema: z.strictObject({ numero: z.string().min(1) }),
    examples: [{ numero: "D-041" }],
    view,
    run: async () => ({ text: "ok" }),
  })
}

/** L'erreur levée par `work`, `null` s'il passe. */
function errorOf(work: () => void): unknown {
  try {
    work()
    return null
  } catch (error) {
    return error
  }
}

const servedHtml = () => readWidgetResource(URI)?.contents[0].text

afterEach(() => {
  registerFunctions([])
})

describe("registerWidgetViews and the view of an ERP function", () => {
  // Premier du fichier : aucun bundle n'est encore inscrit.
  it("should refuse a function whose view is in no registered bundle, then in another one, registering nothing", () => {
    const message = "erp.lire_devis: view devis is not in the widget bundle; build it with oto-platform widgets build and pass it to registerWidgetViews before registerFunctions."
    expect(servedHtml()).toBe(VIEW_HTML)
    expect(errorOf(() => registerFunctions([lireDevis("devis")]))).toEqual(new CatalogRegistrationError(message))
    registerWidgetViews({ html: HOST_HTML, views: ["facture"] })
    expect(errorOf(() => registerFunctions([lireDevis("devis")]))).toEqual(new CatalogRegistrationError(message))
    expect(catalogFunctions().some((fn) => fn.name === "erp.lire_devis")).toBe(false)
  })

  it("should register a function whose view is in the bundle, and serve the bundle of the host", () => {
    registerWidgetViews({ html: HOST_HTML, views: ["devis"] })
    registerFunctions([lireDevis("devis")])
    expect(catalogFunctions().find((fn) => fn.name === "erp.lire_devis")?.view).toBe("devis")
    expect(servedHtml()).toBe(HOST_HTML)
  })

  it("should refuse a view name out of form at registration", () => {
    registerWidgetViews({ html: HOST_HTML, views: ["devis"] })
    expect(errorOf(() => registerFunctions([lireDevis("Devis")]))).toEqual(
      new CatalogRegistrationError("erp.lire_devis: view must be lowercase ASCII letters, digits and _, 64 characters at most."),
    )
  })

  it("should refuse an invalid view name, a duplicate or a document that is not HTML, the bundle served unchanged", () => {
    registerWidgetViews({ html: HOST_HTML, views: ["devis"] })
    const refused = [
      [{ html: HOST_HTML, views: ["Devis"] }, 'registerWidgetViews: invalid view name "Devis".'],
      [{ html: HOST_HTML, views: ["devis", "devis"] }, "registerWidgetViews: duplicate view devis."],
      [{ html: "<p>pas un document</p>", views: ["devis"] }, "registerWidgetViews: html must be the HTML document built by oto-platform widgets build."],
    ] as const
    for (const [bundle, message] of refused) {
      expect(errorOf(() => registerWidgetViews(bundle)), message).toEqual(new CatalogRegistrationError(message))
    }
    expect(servedHtml()).toBe(HOST_HTML)
  })
})
