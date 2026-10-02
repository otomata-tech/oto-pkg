// Mermaid (environ 2 Mo) n'entre pas dans le bundle du widget : `widgets/build.mjs` lui substitue ce module, dont
// le chargement échoue. `DiagrammeMermaid` attrape cet échec et garde le texte du diagramme, comme hors réseau.
throw new Error("mermaid is not bundled in the widget")
