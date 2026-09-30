// @vitest-environment node
// Garde née d'une panne de la page publique (1.1.3) : `rendu-des-blocs.tsx`, rendu par le serveur, appelait
// `largeurDe()`, exportée par `fichier-du-bloc.tsx` (`"use client"`). Côté serveur, chaque export d'un module client
// est une référence client, fonctions ordinaires comprises : l'appel levait au rendu (« Attempted to call largeurDe()
// from the server but largeurDe is on the client »). jsdom, le type-check et ESLint laissaient passer.
// Règle (`portage-ecrans.md § 2`) : un module rendu par le serveur ne fait d'un import de valeur tiré d'un module
// `"use client"` que le rendre en balise (`<X />`) ou le passer tel quel en prop (`as={X}`) ; jamais l'appeler, lire
// sa propriété ni le ranger dans un objet.
import { existsSync, readdirSync, readFileSync, statSync } from "fs"
import path from "path"
import ts from "typescript"
import { describe, expect, it } from "vitest"

const RACINE = path.resolve(__dirname, "../..")
const UI = path.join(RACINE, "packages/plateforme/ui")
const SRC = path.join(RACINE, "src")
const BARREL_UI = path.join(UI, "index.ts")

function sources(dossier: string): string[] {
  return readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => {
    const chemin = path.join(dossier, entree.name)
    if (entree.isDirectory()) return sources(chemin)
    return /\.tsx?$/.test(entree.name) && !entree.name.includes(".test.") && !entree.name.endsWith(".d.ts") ? [chemin] : []
  })
}

const analyses = new Map<string, ts.SourceFile>()
function analyse(fichier: string): ts.SourceFile {
  let source = analyses.get(fichier)
  if (!source) {
    source = ts.createSourceFile(fichier, readFileSync(fichier, "utf8"), ts.ScriptTarget.Latest, true, fichier.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    analyses.set(fichier, source)
  }
  return source
}

/** Un module client : sa première instruction est la directive `"use client"`. */
function estClient(fichier: string): boolean {
  const premiere = analyse(fichier).statements[0]
  return premiere !== undefined && ts.isExpressionStatement(premiere) && ts.isStringLiteral(premiere.expression) && premiere.expression.text === "use client"
}

/** Le fichier d'un import : relatif, `@/…` (hôte) ou la face `ui` du paquet ; `null` pour tout autre paquet. */
function resoudre(depuis: string, specifier: string): string | null {
  let base: string
  if (specifier === "@otomata_tech/oto_platform/ui") return BARREL_UI
  if (specifier.startsWith(".")) base = path.resolve(path.dirname(depuis), specifier)
  else if (specifier.startsWith("@/")) base = path.join(SRC, specifier.slice(2))
  else return null
  for (const candidat of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    if (/\.tsx?$/.test(candidat) && existsSync(candidat) && statSync(candidat).isFile()) return candidat
  }
  return null
}

/** Le module client d'où vient un export, en suivant les `export { … } from` (le barrel de `ui/`) ; `null` s'il n'en vient pas. */
function origineClient(fichier: string, nom: string, vus = new Set<string>()): string | null {
  if (vus.has(`${fichier}#${nom}`)) return null
  vus.add(`${fichier}#${nom}`)
  if (estClient(fichier)) return fichier
  for (const instruction of analyse(fichier).statements) {
    if (!ts.isExportDeclaration(instruction) || instruction.isTypeOnly || !instruction.moduleSpecifier || !ts.isStringLiteral(instruction.moduleSpecifier)) continue
    const cible = resoudre(fichier, instruction.moduleSpecifier.text)
    if (!cible) continue
    const clause = instruction.exportClause
    if (!clause) {
      const trouve = origineClient(cible, nom, vus)
      if (trouve) return trouve
      continue
    }
    if (!ts.isNamedExports(clause)) continue
    const specifier = clause.elements.find((element) => !element.isTypeOnly && element.name.text === nom)
    if (specifier) return origineClient(cible, (specifier.propertyName ?? specifier.name).text, vus)
  }
  return null
}

/** Un usage admis d'une référence client : la balise d'un élément, ou la valeur passée telle quelle à un attribut JSX. */
function usageAdmis(noeud: ts.Identifier): boolean {
  const parent = noeud.parent
  if ((ts.isJsxOpeningElement(parent) || ts.isJsxSelfClosingElement(parent) || ts.isJsxClosingElement(parent)) && parent.tagName === noeud) return true
  return ts.isJsxExpression(parent) && ts.isJsxAttribute(parent.parent)
}

/** Un identifiant qui ne lit pas l'import : le nom d'une propriété (`a.nom`, `{ nom: … }`) ou d'un attribut JSX. */
function estUnNomDePropriete(noeud: ts.Identifier): boolean {
  const parent = noeud.parent
  return ((ts.isPropertyAccessExpression(parent) || ts.isPropertyAssignment(parent)) && parent.name === noeud) || ts.isJsxAttribute(parent)
}

const relatif = (fichier: string) => path.relative(RACINE, fichier).replaceAll("\\", "/")

/** Les noms locaux d'un import de valeur qui mènent à un module client, avec ce module. */
function importsClients(fichier: string, instruction: ts.ImportDeclaration): [string, string][] {
  const clause = instruction.importClause
  const cible = ts.isStringLiteral(instruction.moduleSpecifier) ? resoudre(fichier, instruction.moduleSpecifier.text) : null
  if (!clause || clause.isTypeOnly || !cible) return []
  const liaisons = clause.namedBindings
  const entiers = [clause.name, liaisons && ts.isNamespaceImport(liaisons) ? liaisons.name : undefined].flatMap((nom): [string, string][] => (nom && estClient(cible) ? [[nom.text, cible]] : []))
  const nommes = (liaisons && ts.isNamedImports(liaisons) ? liaisons.elements : []).flatMap((element): [string, string][] => {
    const origine = element.isTypeOnly ? null : origineClient(cible, (element.propertyName ?? element.name).text)
    return origine ? [[element.name.text, origine]] : []
  })
  return [...entiers, ...nommes]
}

/** Les usages fautifs d'un module sans `"use client"` : `fichier:ligne nom (module client)`. */
function usagesFautifs(fichier: string): string[] {
  const source = analyse(fichier)
  const references = new Map(source.statements.filter(ts.isImportDeclaration).flatMap((instruction) => importsClients(fichier, instruction)))
  if (references.size === 0) return []
  const fautifs: string[] = []
  const visiter = (noeud: ts.Node) => {
    if (ts.isImportDeclaration(noeud) || ts.isTypeNode(noeud)) return
    if (ts.isIdentifier(noeud) && references.has(noeud.text) && !usageAdmis(noeud) && !estUnNomDePropriete(noeud)) {
      const ligne = source.getLineAndCharacterOfPosition(noeud.getStart()).line + 1
      fautifs.push(`${relatif(fichier)}:${ligne} ${noeud.text} (${relatif(references.get(noeud.text) ?? "")})`)
    }
    ts.forEachChild(noeud, visiter)
  }
  ts.forEachChild(source, visiter)
  return fautifs
}

/** Les fichiers qu'un module évalue : `import … from`, `export … from`, `import "…"` ; `import type` n'en est pas un. */
function importsEvalues(fichier: string): string[] {
  return analyse(fichier).statements.flatMap((instruction) => {
    const valeur =
      (ts.isImportDeclaration(instruction) && !instruction.importClause?.isTypeOnly) || (ts.isExportDeclaration(instruction) && !instruction.isTypeOnly && instruction.moduleSpecifier !== undefined)
    if (!valeur || !instruction.moduleSpecifier || !ts.isStringLiteral(instruction.moduleSpecifier)) return []
    const cible = resoudre(fichier, instruction.moduleSpecifier.text)
    return cible ? [cible] : []
  })
}

/**
 * Les modules rendus par le serveur : ceux qu'atteignent le barrel de `ui/` (tout écran que l'hôte monte depuis une
 * page) et les modules sans `"use client"` de `src/app/`, sans franchir un module client, où la frontière s'arrête.
 * Un module sans directive importé par des modules clients seuls (l'éditeur) n'est pas rendu par le serveur.
 */
function modulesServeur(): string[] {
  const entrees = [BARREL_UI, ...sources(path.join(SRC, "app"))].filter((fichier) => !estClient(fichier))
  const atteints = new Set<string>()
  const pile = [...entrees]
  for (let fichier = pile.pop(); fichier !== undefined; fichier = pile.pop()) {
    if (atteints.has(fichier) || estClient(fichier)) continue
    atteints.add(fichier)
    pile.push(...importsEvalues(fichier))
  }
  return [...atteints].sort()
}

const MODULES_SERVEUR = modulesServeur()

describe("client / server boundary of ui/ and of the reference host", () => {
  it("should find the server modules, the block rendering and the public page among them", () => {
    const noms = MODULES_SERVEUR.map(relatif)
    expect(noms).toContain("packages/plateforme/ui/noeud/rendu-des-blocs.tsx")
    expect(noms).toContain("src/app/p/[jeton]/[[...chemin]]/page.tsx")
  })

  it("should only render or pass along what a module without \"use client\" imports from a client module, never call it", () => {
    expect(MODULES_SERVEUR.flatMap(usagesFautifs)).toEqual([])
  })
})

/** Un module serveur écrit pour le test, lu comme s'il était sur le disque à `chemin` (ses imports relatifs se résolvent). */
function fautifsDu(chemin: string, texte: string): string[] {
  const fichier = path.join(RACINE, chemin)
  analyses.set(fichier, ts.createSourceFile(fichier, texte, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX))
  return usagesFautifs(fichier).map((fautif) => fautif.split(" ")[1])
}

describe("client / server boundary detection", () => {
  const CARTE = 'import { CarteDeFichier, ImageAgrandissable } from "./fichier-du-bloc"\n'

  it.each([
    ["render a client export as an element", `${CARTE}export const A = () => <ImageAgrandissable source="" alt="" largeur="full" jointe />`],
    ["pass a client export along as a prop", `${CARTE}export const A = ({ X }: { X: any }) => <X as={CarteDeFichier} />`],
    ["import a client export as a type only", 'import type { ComponentProps } from "react"\nimport { type CarteDeFichier } from "./fichier-du-bloc"\nexport type P = ComponentProps<typeof CarteDeFichier>'],
    ["call an export of a module without the directive", 'import { largeurDe } from "./rendu-des-blocs"\nexport const l = largeurDe("small")'],
  ])("should let a server module %s", (_, texte) => {
    expect(fautifsDu("packages/plateforme/ui/noeud/virtuel.tsx", texte)).toEqual([])
  })

  it.each([
    ["called", `${CARTE}export const A = () => CarteDeFichier({ id: "", nom: "", taille: 0 })`],
    ["read by a property", `${CARTE}export const n = ImageAgrandissable.name`],
    ["put in an object", `${CARTE}export const o = { CarteDeFichier }`],
  ])("should catch a client export %s by a server module", (_, texte) => {
    expect(fautifsDu("packages/plateforme/ui/noeud/virtuel.tsx", texte)).toHaveLength(1)
  })

  it("should follow the ui/ barrel from a host module", () => {
    expect(fautifsDu("src/app/virtuel/page.tsx", 'import { useRafraichir } from "@otomata_tech/oto_platform/ui"\nexport const r = useRafraichir()')).toEqual(["useRafraichir"])
  })
})
