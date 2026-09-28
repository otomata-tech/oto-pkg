// La langue et la couleur effectives d'une personne (E05-S11, lot a ; fiche D105, D107) : son choix de la
// page « Profil », sinon celui de son organisation. La langue règle en V1 celle dans laquelle l'assistant
// répond (ligne de faits de la partie Privé de `context`), jamais la langue des écrans, qui restent en français (lot g
// sorti de la V1) ; la couleur, le thème de `CoquilleOto` posé par le layout de l'hôte (AC-4, HN-E05S11-3 :
// tout compte sans choix suit l'organisation). Sans ce module, le bloc de `context`, la page « Profil » et le
// layout décideraient chacun du repli. Des fonctions pures de l'identité : aucune lecture de plus.
import { languageSchema, themeSchema, type Language, type Theme } from "../schemas"
import { readBrand } from "./brand"
import type { Identity } from "./identity"

/** La langue de l'organisation (`orgs.brand.language`), sinon le français (AC-36). */
export function organisationLanguage(org: Identity["org"]): Language {
  return readBrand(org).language ?? "fr"
}

/** La langue du profil, sinon celle de l'organisation, sinon le français (AC-36). */
export function preferredLanguage(identity: Identity): Language {
  const chosen = languageSchema.safeParse(identity.member.profile.language)
  return chosen.success ? chosen.data : organisationLanguage(identity.org)
}

/** Le thème du profil, sinon celui de l'organisation (AC-4) ; un thème enregistré hors des huit ne compte pas. */
export function preferredTheme(identity: Identity): Theme {
  const chosen = themeSchema.safeParse(identity.member.profile.theme)
  return chosen.success ? chosen.data : readBrand(identity.org).theme
}
