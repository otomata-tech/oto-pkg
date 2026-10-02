// Entrée du bundle du widget (`widgets/build.mjs`) : monte le routeur sur le pont de l'host, avec les vues de l'ERP
// que le build a composées (aucune dans le bundle du paquet).
import { createRoot } from "react-dom/client"
import vuesErp from "virtual:oto-erp-views"
import { sourceDeLHost } from "./bridge"
import "./styles.css"
import { Widget } from "./widget"

const racine = document.getElementById("vue")
if (racine) createRoot(racine).render(<Widget source={sourceDeLHost} vuesErp={vuesErp} />)
