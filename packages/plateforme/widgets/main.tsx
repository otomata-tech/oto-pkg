// Entrée du bundle du widget (`widgets/build.mjs`) : monte le routeur sur le pont de l'host.
import { createRoot } from "react-dom/client"
import { sourceDeLHost } from "./bridge"
import "./styles.css"
import { Widget } from "./widget"

const racine = document.getElementById("vue")
if (racine) createRoot(racine).render(<Widget source={sourceDeLHost} />)
