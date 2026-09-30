"use client"

// Porté d'oto-frontend (src/components/coque/palette-de-recherche.tsx) : ce que « Rechercher » et ⌘K
// ouvrent — les écrans fixes sous « Aller à », puis l'arbre du rail aplati et groupé par NATURE (on
// cherche « la page des garanties », pas « ce qu'il y a dans Ventes »), recherche floue sur les noms,
// sans requête ; un choix ouvre sa destination. Changé : la palette cherche aussi dans le CONTENU, par
// le service de `find` (`GET /api/platform/search`, AC-a7) : les pages trouvées s'ajoutent sous « Dans
// le contenu », avec leur extrait. Retiré : exécutions, agents, connecteurs de la coquille d'Oto.
import { useRechercheDeContenus, type RechercheDeContenus } from "../api/use-recherche-de-contenus"
import { natureDuGenre, titreDeContexte } from "../arbre/depuis-l-arbre"
import type { NatureDeNoeud, NoeudDArbre, SectionCle } from "../arbre/types"
import { CommandPalette, type Command } from "../ds/react/command-palette"
import { AnimatedIcon } from "../ds/react/icon"
import { useHote } from "../hote/navigation"
import { GLYPHES } from "./arbre-du-rail"
import type { EcranPermis } from "./ecrans"
import { PALETTE } from "./libelles"

/** Les rubriques de l'arbre, dans l'ordre où elles sortent : la palette groupe les commandes consécutives. */
const NATURES: readonly { nature: NatureDeNoeud; groupe: string }[] = [
  { nature: "contexte", groupe: PALETTE.contextes },
  { nature: "page", groupe: PALETTE.pages },
  { nature: "tableau", groupe: PALETTE.tableaux },
  { nature: "procedure", groupe: PALETTE.procedures },
]

/** L'extrait tient en fin de ligne sans écraser le titre, qui garde sa place (constaté au contrôle visuel). */
const EXTRAIT_MAX = 48

/** L'extrait en texte : sans les marques `**` que la recherche pose autour des mots trouvés, coupé court. */
function extraitCourt(extrait: string | null): string | undefined {
  if (extrait === null) return undefined
  const texte = extrait.replaceAll("**", "").trim()
  return texte.length > EXTRAIT_MAX ? `${texte.slice(0, EXTRAIT_MAX - 1).trimEnd()}…` : texte
}

type Ligne = { chemin: string; titre: string; nature: NatureDeNoeud }

function aplatir(noeuds: readonly NoeudDArbre[], section: string): Ligne[] {
  return noeuds.flatMap((noeud) => [
    { chemin: noeud.chemin, titre: noeud.nature === "contexte" ? titreDeContexte(section) : noeud.titre, nature: noeud.nature },
    ...aplatir(noeud.enfants ?? [], section),
  ])
}

function statutDe(resultat: RechercheDeContenus): string | undefined {
  if (resultat.etat === "en-cours") return PALETTE.recherche
  if (resultat.etat === "en-panne") return PALETTE.rechercheEnPanne
  if (resultat.etat === "lue" && resultat.plus > 0) return PALETTE.plusDeResultats(resultat.plus)
  return undefined
}

type Sources = { ecrans: readonly EcranPermis[]; sections: readonly SectionCle[] | null; prefixe: string; resultat: RechercheDeContenus; naviguer: (adresse: string) => void }

function commandesDe({ ecrans, sections, prefixe, resultat, naviguer }: Sources): Command[] {
  const lignes = (sections ?? []).flatMap((section) => aplatir(section.noeuds, section.titre))
  const allerA = ecrans.map((ecran) => ({ id: `ecran:${ecran.adresse}`, label: ecran.libelle, group: PALETTE.allerA, icon: <AnimatedIcon as={ecran.glyphe} size="xs" />, onSelect: () => naviguer(ecran.adresse) }))
  const parNature = NATURES.flatMap(({ nature, groupe }) =>
    lignes.filter((ligne) => ligne.nature === nature).map((ligne) => ({ id: `noeud:${ligne.chemin}`, label: ligne.titre, group: groupe, icon: <AnimatedIcon as={GLYPHES[nature]} size="xs" />, onSelect: () => naviguer(`${prefixe}${ligne.chemin}`) })),
  )
  const trouves = resultat.etat === "lue" ? resultat.trouves : []
  const dansLeContenu = trouves.map((trouve) => ({
    id: `contenu:${trouve.path}`,
    label: trouve.title,
    group: PALETTE.contenu,
    icon: <AnimatedIcon as={GLYPHES[natureDuGenre(trouve.kind)]} size="xs" />,
    meta: extraitCourt(trouve.snippet),
    // Trouvée par le service dans le contenu : la saisie n'est pas forcément dans son titre.
    found: true,
    onSelect: () => naviguer(`${prefixe}${trouve.path}`),
  }))
  return [...allerA, ...parNature, ...dansLeContenu]
}

type PaletteProps = { open: boolean; onClose: () => void; ecrans: readonly EcranPermis[]; sections: readonly SectionCle[] | null; prefixe: string }

/** La palette : écrans, arbre et contenu ; « Rechercher » et ⌘K l'ouvrent (`RailSearch`). */
export function PaletteDeRecherche({ open, onClose, ecrans, sections, prefixe }: PaletteProps) {
  const { naviguer } = useHote()
  const { resultat, chercher } = useRechercheDeContenus()
  return (
    <CommandPalette
      open={open}
      onClose={onClose}
      placeholder={PALETTE.placeholder}
      emptyText={sections === null ? PALETTE.arbreAbsent : PALETTE.rienTrouve}
      commands={commandesDe({ ecrans, sections, prefixe, resultat, naviguer })}
      onQueryChange={chercher}
      status={statutDe(resultat)}
    />
  )
}
