// Porté d'oto-frontend (src/design-system/components/react/home.jsx, `HomeLayout` et `FeedItem`) : la mise
// en page de l'accueil, deux colonnes et deux piles, en quatre créneaux nommés (chercher puis parcourir à
// gauche, brancher puis ce qui appelle à droite) : le placement ne dépend pas de l'ordre du JSX ; et la ligne
// de fil, ce qui a bougé, sur quoi, quand. Des classes et des attributs, le CSS de `components/css/home.css`
// fait le reste. Tels quels, en TypeScript. Retiré : `WaitList`, `PromptBar` et `PlugLine`, que l'accueil
// porté n'emploie pas (ni attentes, ni invite d'agent, ni ligne de branchement).
import { forwardRef, type ComponentProps, type ElementType, type ReactNode } from "react"
import { cx } from "./outils"

/** `null`, `undefined` et `false` disent « pas ce créneau » ; `0` est un contenu. */
const present = (creneau: ReactNode) => creneau != null && creneau !== false

type HomeLayoutProps = ComponentProps<"div"> & {
  find?: ReactNode
  aside?: ReactNode
  main?: ReactNode
  cards?: ReactNode
}

/** Deux piles et non quatre cases : une colonne absente n'est pas rendue, une case vide garderait sa gouttière. */
export const HomeLayout = forwardRef<HTMLDivElement, HomeLayoutProps>(function HomeLayout({ find, aside, main, cards, className, children, ...rest }, ref) {
  const gauche = present(find) || present(main)
  const droite = present(aside) || present(cards)
  return (
    <div ref={ref} {...rest} className={cx("oto-home", className)}>
      {gauche && (
        <div className="oto-home-col">
          {present(find) && <div className="oto-home-find">{find}</div>}
          {present(main) && <div className="oto-home-main">{main}</div>}
        </div>
      )}
      {droite && (
        <div className="oto-home-col">
          {present(aside) && <div className="oto-home-side">{aside}</div>}
          {present(cards) && <div className="oto-home-cards">{cards}</div>}
        </div>
      )}
      {children}
    </div>
  )
})

type FeedItemProps = Omit<ComponentProps<"a">, "ref"> & {
  lead?: ReactNode
  name: ReactNode
  what?: ReactNode
  when?: ReactNode
  /** L'élément hôte : `div` par défaut, jamais un `<a>` sans `href`, qui sortirait du parcours clavier ; le lien de l'hôte quand la ligne navigue. */
  as?: ElementType
}

/** Une ligne de fil ; l'heure en chiffres tabulaires (`oto-num`), sans quoi une colonne d'heures ne s'aligne pas. */
export const FeedItem = forwardRef<HTMLElement, FeedItemProps>(function FeedItem({ lead, name, what, when, as: Tag = "div", className, children, ...rest }, ref) {
  return (
    <Tag ref={ref} {...rest} className={cx("oto-feed-item", "anim-host", className)}>
      {present(lead) && <span className="oto-feed-lead">{lead}</span>}
      <span className="oto-feed-name">{name}</span>
      {present(what) && <span className="oto-feed-what">{what}</span>}
      {present(when) && <span className="oto-feed-when oto-num">{when}</span>}
      {children}
    </Tag>
  )
})
