"use client"

// La recherche de l'accueil (E05-S09, partie b, AC-b1) : le champ de la maquette, « le dessin de celle du
// rail, dans les couleurs du bureau », qui ouvre CE QUE LE RAIL OUVRE, la même palette : un seul geste dans
// la tête. Porté d'oto-frontend (`ecran-accueil.tsx`, `RechercheDeLAccueil`). Repris : le formulaire
// `role="search"`, `InputAffix` (loupe, ⌘K), l'ouverture au clic et sur Entrée, jamais au focus (le
// `<dialog>` rend le focus au champ en se fermant : un ouvreur au focus se rouvrirait). Changé : la palette
// est celle que le rail a montée (`RechercheDuRail`), ouverte par son raccourci ⌘K, que `RailSearch` écoute
// sur la fenêtre : l'arbre n'est pas relu pour une seconde palette ; un hôte qui monte l'accueil sans le
// rail monte aussi `RechercheDuRail`. Retiré : « ou poser une question » (aucune IA côté serveur,
// architecture § 10) : le champ reprend l'invite de la palette.
import { MagnifyingGlass } from "@phosphor-icons/react/dist/csr/MagnifyingGlass"
import { PALETTE } from "../coque/libelles"
import { AnimatedIcon } from "../ds/react/icon"
import { InputAffix } from "../ds/react/input-affix"
import { ACCUEIL } from "./libelles"

/** Le raccourci de la palette du rail (⌘K sur Mac, Ctrl+K ailleurs : `RailSearch` accepte les deux). */
function ouvrirLaPalette() {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }))
}

export function RechercheDeLAccueil() {
  return (
    <form
      role="search"
      onSubmit={(evenement) => {
        evenement.preventDefault()
        ouvrirLaPalette()
      }}
    >
      <InputAffix
        type="search"
        aria-label={ACCUEIL.chercher}
        placeholder={PALETTE.placeholder}
        start={<AnimatedIcon as={MagnifyingGlass} anim="magnify" size="sm" />}
        end={<span className="oto-affix">⌘K</span>}
        onClick={ouvrirLaPalette}
      />
    </form>
  )
}
