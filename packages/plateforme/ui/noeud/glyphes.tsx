"use client"

// Les glyphes de l'écran de nœud (E05-S09, partie c1), rendus pour ses Server Components, qui ne lisent pas
// une table d'un module client : la nature d'un nœud par `GLYPHES` du rail, la seule table nature → glyphe
// (partie a), et la portée d'un espace. Décoratifs, le nom est toujours écrit à côté. Porté d'oto-frontend
// (`components/noeud/natures.tsx`, `glypheDeNature`, `glypheDePortee`) : Phosphor à la place de lucide
// (`Building2` → `Buildings`, portage-ecrans.md § 3) ; retiré : les natures d'Oto seul (agent, exécution,
// personne) et les glyphes d'outil.
import { Buildings } from "@phosphor-icons/react/dist/csr/Buildings"
import { Lock } from "@phosphor-icons/react/dist/csr/Lock"
import { Users } from "@phosphor-icons/react/dist/csr/Users"
import type { NatureDeNoeud } from "../arbre/types"
import { GLYPHES } from "../coque/arbre-du-rail"
import { AnimatedIcon, type IconSize } from "../ds/react/icon"

/** La portée d'un espace, celle de sa section : Tout le monde (`all`, D107), une équipe, Privé. */
export type PorteeDEspace = "all" | "equipe" | "private"

const GLYPHES_DE_PORTEE = { all: Buildings, equipe: Users, private: Lock } as const

export function GlypheDeNature({ nature, taille = "xs" }: { nature: NatureDeNoeud; taille?: IconSize }) {
  return <AnimatedIcon as={GLYPHES[nature]} size={taille} />
}

export function GlypheDePortee({ portee, taille = "xs" }: { portee: PorteeDEspace; taille?: IconSize }) {
  return <AnimatedIcon as={GLYPHES_DE_PORTEE[portee]} size={taille} />
}
