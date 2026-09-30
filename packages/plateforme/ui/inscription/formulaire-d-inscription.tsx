"use client"

// L'inscription d'une organisation (E12-S01, ADR-023) : l'îlot que la page de l'hôte monte dans
// `EcranDAuthentification`, sous sa `CoquilleOto`, pour une personne connectée qui n'appartient à aucune organisation.
// Un nom, dont se proposent l'adresse (slug) et le préfixe des outils, modifiables ; un premier envoi montre l'adresse
// que l'hôte donnera, sans rien écrire ; « Créer l'organisation » confirme (`POST /api/platform/signup`, deux temps), puis
// la personne part à l'adresse de sa nouvelle organisation. Les champs se contrôlent sur le schéma de l'API
// (`signupSchema`). Sans lui, l'hôte recréerait le formulaire et ses règles.
import { useState, type FormEvent } from "react"
import { signupSchema, type SignupInput } from "../../schemas"
import { appelerPlateforme, type ErreurPlateforme } from "../api/client"
import { messageDErreur } from "../api/messages"
import { IlotDAuthentification } from "../authentification/ilot-d-authentification"
import { Field, Input } from "../ds/react/forms"
import { Button } from "../ds/react/primitives"

/** Ce que rend la route : l'aperçu (adresses), ou l'organisation créée et ses adresses. */
type Apercu = { created: false; addresses: { hosts: string[] } }
type Creee = { created: true; hosts: string[] }

const MESSAGES = {
  conflict: "Cette adresse ou ce préfixe est déjà pris : choisissez-en un autre.",
  invalid_arguments: "Vérifiez le nom, l'adresse et le préfixe.",
} as const

/** Le nom réduit en étiquette d'adresse : minuscules sans accents, tirets, 40 caractères, comme `orgSlugSchema`. */
export function slugPropose(nom: string): string {
  return nom
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "")
}

/** Le préfixe des outils tiré de l'adresse : lettres et chiffres, une lettre d'abord, 12 au plus, comme `toolPrefixSchema`. */
export function prefixePropose(slug: string): string {
  const lettres = slug.replace(/[^a-z0-9]/g, "").replace(/^[0-9]+/, "")
  return lettres.slice(0, 12)
}

/** Un refus dit en français ; le texte du contrôle d'abus de l'hôte, dans sa langue, tel quel. */
function refusDit(erreur: ErreurPlateforme): string {
  const texteDeLHote = erreur.details?.text
  if (erreur.raison === "signup_refused" && typeof texteDeLHote === "string") return texteDeLHote
  return messageDErreur(erreur, MESSAGES)
}

export function FormulaireDInscription() {
  const [nom, setNom] = useState("")
  const [slug, setSlug] = useState<string | null>(null)
  const [prefixe, setPrefixe] = useState<string | null>(null)
  const [adresse, setAdresse] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [envoi, setEnvoi] = useState(false)

  // Tant que la personne ne les touche pas, adresse et préfixe suivent le nom.
  const slugVu = slug ?? slugPropose(nom)
  const prefixeVu = prefixe ?? prefixePropose(slugVu)
  const saisie: SignupInput = { name: nom.trim(), org: slugVu, prefix: prefixeVu }
  const valide = signupSchema.safeParse(saisie).success

  function changer(action: () => void) {
    action()
    setAdresse(null)
    setErreur(null)
  }

  async function envoyer(evenement: FormEvent) {
    evenement.preventDefault()
    if (!valide || envoi) return
    setEnvoi(true)
    setErreur(null)
    try {
      const reponse = await appelerPlateforme<Apercu | Creee>({ methode: "POST", ressource: "signup", corps: { ...saisie, confirm: adresse !== null } })
      if (reponse.erreur) {
        setErreur(refusDit(reponse.erreur))
        return
      }
      if (!reponse.data.created) {
        setAdresse(reponse.data.addresses.hosts[0] ?? null)
        return
      }
      const hote = reponse.data.hosts[0]
      if (hote) window.location.assign(`${window.location.protocol}//${hote}/`)
    } finally {
      setEnvoi(false)
    }
  }

  const pied = (
    <Button type="submit" form="inscription" variant="primary" block disabled={!valide || envoi} aria-busy={envoi}>
      {envoi ? "Envoi…" : adresse ? "Créer l'organisation" : "Continuer"}
    </Button>
  )

  return (
    <IlotDAuthentification titre="Créer votre organisation" pied={pied}>
      <form id="inscription" noValidate onSubmit={(evenement) => void envoyer(evenement)} className="flex flex-col gap-3">
        <Field label="Nom de l'organisation">
          <Input type="text" autoComplete="organization" value={nom} maxLength={80} onChange={(e) => changer(() => setNom(e.target.value))} />
        </Field>
        <Field label="Adresse" hint="Lettres minuscules, chiffres et tirets.">
          <Input type="text" autoComplete="off" value={slugVu} maxLength={40} onChange={(e) => changer(() => setSlug(e.target.value.toLowerCase()))} />
        </Field>
        <Field label="Préfixe des outils" hint="Il nomme les outils de vos assistants (préfixe_context…) et ne changera plus.">
          <Input type="text" autoComplete="off" value={prefixeVu} maxLength={12} onChange={(e) => changer(() => setPrefixe(e.target.value.toLowerCase()))} />
        </Field>
        {adresse && <p className="text-sm text-ink">{`Votre organisation sera servie à ${adresse}.`}</p>}
        {erreur && (
          <p role="alert" className="text-sm text-ink">
            {erreur}
          </p>
        )}
      </form>
    </IlotDAuthentification>
  )
}
