"use client"

// Les tuiles et la recherche au-dessus du tableau des personnes (E05-S09, partie d1). Porté d'oto-frontend
// (`members-counters.tsx`, `use-counter-strip.ts`, et le `ListTools` de `members-table.tsx`) : chaque tuile EST
// un filtre, sa précision une définition du produit, jamais un champ servi ; le compte des invitations ne se
// rend que s'il est lu (absent veut dire « on ne sait pas », jamais « aucune ») ; la recherche est soumise
// (Entrée), jamais à la frappe, et son champ, non contrôlé, se remonte quand l'adresse change (`key`).
// Changé : le filtre et la recherche s'écrivent dans l'adresse de l'hôte (`useHote().naviguer`), l'écran les
// applique à la liste entière lue par la page. Retiré : la tuile des clés (sans source), le filtre `active`.
import { MagnifyingGlass } from "@phosphor-icons/react/dist/csr/MagnifyingGlass"
import { CounterStrip, type Counter } from "../ds/react/counter-strip"
import { AnimatedIcon } from "../ds/react/icon"
import { ListTools } from "../ds/react/list-tools"
import { useHote } from "../hote/navigation"
import { PERSONNES } from "./libelles"

type OutilsDesPersonnesProps = {
  nomOrganisation: string
  personnes: number
  /** `null` : les invitations n'ont pas été lues, leur tuile ne se rend pas. */
  invitations: number | null
  filtre: "invitations" | undefined
  q: string
  /** L'adresse de chaque tuile ; celle de la recherche, sans `q`, en chemin et paramètres (le formulaire y ajoute `q`). */
  adresses: { tous: string; invitations: string; recherche: { chemin: string; parametres: [string, string][] } }
}

/** L'adresse de la recherche : les paramètres de l'onglet, puis `q` quand il n'est pas vide. */
function adresseDeRecherche({ chemin, parametres }: OutilsDesPersonnesProps["adresses"]["recherche"], q: string): string {
  const requete = new URLSearchParams(parametres.filter(([cle]) => cle !== "q"))
  if (q) requete.set("q", q)
  const texte = requete.toString()
  return texte ? `${chemin}?${texte}` : chemin
}

function tuiles({ nomOrganisation, personnes, invitations }: OutilsDesPersonnesProps): Counter[] {
  // Le mot s'accorde au nombre (« 1 personne ») ; oto-frontend l'écrivait toujours au pluriel.
  const tous: Counter = { key: "tous", value: personnes, label: personnes > 1 ? PERSONNES.personnes : PERSONNES.personne, hint: PERSONNES.dansLOrganisation(nomOrganisation) }
  if (invitations === null) return [tous]
  return [tous, { key: "invitations", value: invitations, label: invitations > 1 ? PERSONNES.invitations : PERSONNES.invitation, hint: PERSONNES.enAttente }]
}

export function OutilsDesPersonnes(props: OutilsDesPersonnesProps) {
  const { naviguer } = useHote()
  const { filtre, q, adresses } = props
  return (
    <>
      <CounterStrip
        label={PERSONNES.compteurs}
        counters={tuiles(props)}
        value={filtre === "invitations" ? "invitations" : "tous"}
        onSelect={(cle) => naviguer(cle === "invitations" ? adresses.invitations : adresses.tous)}
      />
      <ListTools
        key={q}
        label={PERSONNES.chercher}
        placeholder={PERSONNES.chercher}
        defaultValue={q}
        icon={<AnimatedIcon as={MagnifyingGlass} anim="magnify" size="xs" />}
        onSearch={(valeur) => naviguer(adresseDeRecherche(adresses.recherche, valeur))}
      />
    </>
  )
}
