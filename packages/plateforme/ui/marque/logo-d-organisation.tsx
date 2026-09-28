// Le logo d'une organisation, sinon la première lettre de son nom affiché dans un carré bordé.
// Décoratif : le nom, écrit à côté, porte l'information. Aucune classe de couleur : il sert aussi
// hors de `.oto`, sur les tokens du template (page de connexion). Sans lui, la barre latérale, la
// page de connexion, l'écran de marque et le consentement (E09-S02) rendraient chacun leur logo.
//
// Repris d'oto-frontend (`components/settings/company-logo.tsx`) : le logo, sinon l'initiale,
// cachés aux lecteurs d'écran. Retiré : `Avatar` du design system d'Oto.

type LogoDOrganisationProps = {
  /** Nom affiché : sa première lettre remplace le logo absent. */
  nom: string
  /** Adresse `http:` ou `https:` vérifiée par le serveur (`readBrand`, `consentRequest`), ou `null`. */
  logo: string | null
  /** Côté du carré, en pixels. */
  taille: number
}

export function LogoDOrganisation({ nom, logo, taille }: LogoDOrganisationProps) {
  // En style et pas en attribut seul : la base de Tailwind pose `height: auto` sur `img`, qui
  // écraserait un logo plus large que haut.
  const carre = { width: taille, height: taille }
  if (logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- hôte arbitraire, saisi par l'administrateur ou déclaré par un client OAuth : next/image exigerait de le déclarer dans next.config
      <img
        src={logo}
        alt=""
        aria-hidden="true"
        width={taille}
        height={taille}
        referrerPolicy="no-referrer"
        className="shrink-0 rounded-md object-contain"
        style={carre}
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-md border font-semibold"
      style={{ ...carre, fontSize: Math.round(taille / 2) }}
    >
      {Array.from(nom.trim())[0]?.toLocaleUpperCase("fr")}
    </span>
  )
}
