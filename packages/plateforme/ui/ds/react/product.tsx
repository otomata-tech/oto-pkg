// Porté d'oto-frontend (src/design-system/components/react/product.jsx, `OtoMark` et `OrgSwitcher`) :
// le mark (un seul cercle, `currentColor`) et la pastille d'entreprise, dont le menu porte les réglages
// puis la bascule d'entreprise ; tels quels, en TypeScript. Changé : `logo` montre le logo de
// l'organisation à la place du mark quand elle en a un (marque d'E09-S01) ; le nom accessible ne promet
// la bascule que si le menu la porte. Retiré : les autres composants de produit.
import { forwardRef, type ComponentProps, type ReactNode } from "react"
import { cx } from "./outils"
import { DropdownMenu, type MenuItem } from "./overlays"

type OtoMarkProps = Omit<ComponentProps<"span">, "title"> & { size?: number; title?: string }

/** Le mark d'Oto : décoratif sans `title`, hors de l'arbre d'accessibilité. */
export const OtoMark = forwardRef<HTMLSpanElement, OtoMarkProps>(function OtoMark({ size = 24, title, className, style, ...rest }, ref) {
  return (
    <span
      ref={ref}
      {...rest}
      className={cx("oto-mark", className)}
      style={{ inlineSize: size, blockSize: size, ...style }}
      role={title ? "img" : rest.role}
      aria-label={title ?? rest["aria-label"]}
      aria-hidden={title ? undefined : "true"}
    >
      <svg viewBox="-64 -64 128 128">
        <circle r="44" />
      </svg>
    </span>
  )
})

type Entreprise = { id: string; name: string }

type OrgSwitcherProps = Omit<ComponentProps<"button">, "onSelect"> & {
  org: { id: string; name?: string }
  /** Le logo de l'organisation, à la place du mark (E09-S01). */
  logo?: ReactNode
  orgs?: Entreprise[]
  settings?: MenuItem[]
  onSelectOrg?: (entreprise: Entreprise) => void
}

/** La pastille d'entreprise ; son menu : les réglages, un filet, puis la bascule (`menuitemradio`). */
export function OrgSwitcher({ org, logo, orgs, settings, onSelectOrg, className, ...rest }: OrgSwitcherProps) {
  const nom = org.name || "Oto"
  const menu: MenuItem[] = [
    ...(settings ?? []),
    ...(settings?.length && orgs?.length ? [{ separator: true }] : []),
    ...(orgs ?? []).map((entreprise) => ({
      label: entreprise.name,
      radio: true,
      checked: entreprise.id === org.id,
      onSelect: () => onSelectOrg?.(entreprise),
    })),
  ]
  // Le nom accessible ne promet la bascule que si le menu la porte.
  const promesse = orgs?.length ? "Réglages et changement d'entreprise" : "Réglages de l'entreprise"
  const declencheur = (
    <button
      {...rest}
      type="button"
      className={cx("oto-org-switcher", "anim-host", className)}
      aria-label={menu.length ? `Entreprise : ${nom}. ${promesse}` : `Entreprise : ${nom}`}
      aria-haspopup={menu.length ? "menu" : undefined}
    >
      {logo ?? <OtoMark size={18} />}
      <span className="oto-org-name">{nom}</span>
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="oto-icon" aria-hidden="true">
        <path d="m7 15 5 5 5-5M7 9l5-5 5 5" />
      </svg>
    </button>
  )
  if (!menu.length) return declencheur
  return <DropdownMenu trigger={declencheur} items={menu} />
}
