// Le gabarit des écrans d'authentification (connexion, mot de passe oublié, réinitialisation,
// confirmation du lien, aucune organisation). Server Component : la page de l'hôte le monte sous sa
// `CoquilleOto` en `pleinePage`, lui passe la marque de l'adresse et l'îlot de l'écran
// (`IlotDAuthentification`).
//
// Porté d'oto-frontend (`src/components/auth/auth-page.tsx`, la mise en page ; le bureau sans rail de
// `src/routes/__root.tsx`) : copié sur le design system porté — bureau sans rail et contenu, panneau de
// marque (îlot d'encre `brand.css`, filigrane, mark, nom, phrase à mot-clé, barre de repères) à gauche
// dès `lg`, marque compacte au-dessus de l'îlot en dessous, la légende sous l'îlot. Changé : le panneau
// porte le seul `h1` et la seule promesse du document, à toute largeur ; sous `lg`, il sort de l'écran
// sans sortir de l'arbre d'accessibilité (`max-lg:sr-only`), et la marque compacte, son dessin, en est
// cachée (`aria-hidden`) : oto-frontend y mettait un second `h1`, que `display: none` retirait
// (HN-E05S07-7) ; l'année de la barre est celle du jour à Paris ; « Données hébergées en France » y
// figure (fiche D16 B, M27) ; les marks font un tour à l'arrivée (`oto-marque-tournante`, fiche D15 B :
// WCAG 2.2.2) et l'accent du panneau lit `--rail-on-bg` (`oto-marque-principale`, `oto-mot-cle` :
// `--primary` y mesure 1,01:1 en Ardoise, le jour), trois classes de la section 4 d'`ui/styles/oto.css`
// qui complètent `brand.css`, porté tel quel ; le dessin échappe au cadre du contenu par un style en ligne
// (`.auth-canvas` d'oto-frontend vivait dans la feuille de l'application) ; la colonne se centre sans se
// couper (`justify-center-safe` : plus haute que la fenêtre, zoomée ou couchée, elle défile au lieu de
// perdre son haut, WCAG 1.4.10). Ajouté : la ligne de l'organisation de l'adresse (E09-S01). Retiré :
// Logto, `/signup`, le `Link` du routeur (la légende vient de l'hôte).

import type { ReactNode } from "react"
import { Island, IslandBody } from "../ds/react/island"
import { Content, Desk } from "../ds/react/layout"
import { OtoMark } from "../ds/react/product"
import { LogoDOrganisation } from "../marque/logo-d-organisation"
import type { MarqueDOrganisation } from "../marque/types"

type EcranDAuthentificationProps = {
  /** La marque de l'organisation de l'adresse ; `null` sans organisation : aucune ligne. */
  marque: MarqueDOrganisation | null
  /** Sous l'îlot, le renvoi vers l'écran voisin ; son lien est celui de l'hôte. */
  legende?: ReactNode
  /** L'îlot de l'écran. */
  children: ReactNode
}

const ANNEE_A_PARIS = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", year: "numeric" })

/** La promesse, au caractère près, celle du panneau ; la marque compacte la dessine sans mot-clé. */
const PROMESSE =
  "Confiez vos procédures à des agents : ils lisent votre contexte, font le travail, et vous demandent votre accord quand il le faut."

/** Le panneau de marque, haut comme la page, dès `lg` : l'îlot d'encre de `brand.css`. */
function PanneauDeMarque() {
  return (
    <div className="max-lg:sr-only lg:w-1/2">
      <Island className="oto-brand-panel h-full" aria-label="Oto">
        <IslandBody className="h-full">
          <span className="oto-brand-watermark oto-marque-tournante" aria-hidden="true">
            <OtoMark size={400} />
          </span>
          <div className="oto-brand-inner flex h-full flex-col">
            <div className="oto-brand-hero">
              <div className="oto-brand-lockup">
                <span className="oto-brand-mark oto-marque-tournante oto-marque-principale" aria-hidden="true">
                  <OtoMark size={60} />
                </span>
                <h1 className="oto-brand-name">Oto</h1>
              </div>
              <p className="oto-brand-say">
                Confiez vos procédures à des agents : ils lisent votre contexte, font le travail, et vous demandent votre{" "}
                <span className="oto-brand-key oto-mot-cle">accord</span> quand il le faut.
              </p>
            </div>
            <div className="oto-brand-bar">
              <span>© {ANNEE_A_PARIS.format(new Date())} Oto</span>
              <span>Données hébergées en France</span>
            </div>
          </div>
        </IslandBody>
      </Island>
    </div>
  )
}

export function EcranDAuthentification({ marque, legende, children }: EcranDAuthentificationProps) {
  return (
    <Desk rail={false}>
      <Content>
        {/* L'enfant direct du contenu encaisse le cadre du design system (`.oto-content > *`, hors
            couche) : le style en ligne lui rend la pleine largeur, le dessin vit un niveau dessous. */}
        <div className="h-full" style={{ maxInlineSize: "none" }}>
          <div className="flex h-full w-full gap-6 lg:ps-4">
            <PanneauDeMarque />
            <div className="flex w-full flex-col items-center justify-center-safe gap-4 lg:w-1/2">
              {/* Le dessin du panneau sous `lg` : son texte est lu dans le panneau, hors de l'écran. */}
              <div className="flex flex-col items-center gap-2 lg:hidden" aria-hidden="true">
                <span className="oto-brand-mark oto-marque-tournante">
                  <OtoMark size={40} />
                </span>
                <p className="oto-page-title">Oto</p>
                <p className="oto-caption text-center">{PROMESSE}</p>
              </div>
              <div className="flex w-full max-w-sm flex-col gap-4">
                {/* L'organisation de l'adresse, au-dessus de l'îlot ; le mark d'Oto reste à la marque. */}
                {marque ? (
                  <p className="flex items-center justify-center gap-2 text-sm font-semibold text-ink">
                    <LogoDOrganisation nom={marque.nomAffiche} logo={marque.logo} taille={32} />
                    <span>{marque.nomAffiche}</span>
                  </p>
                ) : null}
                {children}
                {legende !== undefined ? <p className="oto-caption text-center">{legende}</p> : null}
              </div>
            </div>
          </div>
        </div>
      </Content>
    </Desk>
  )
}
