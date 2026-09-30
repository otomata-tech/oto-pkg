// Jeu « à l'échelle » du routage sans host : soixante procédures d'une entreprise de services (ventes,
// comptabilité, RH, support, projets, informatique, juridique, marketing, services généraux), avec des
// voisines volontaires (quatre relances, deux clôtures, saisie et remboursement des frais), et les phrases
// jouées en direct sur l'organisation de démonstration. Seul le résumé porte les formulations (P37) : les
// formulations se lisent dans les résumés, les autres phrases sont écrites ici. Chaque procédure porte un
// paragraphe d'étapes, assez pour être servie.
import type { SeedNode } from "../../helpers/plateforme"

const FOLDER = "ops"

export const scalePath = (slug: string) => `${FOLDER}/${slug}`

const procedure = (slug: string, title: string, summary: string): SeedNode => ({
  path: scalePath(slug),
  kind: "procedure",
  title,
  summary,
  blocks: [{ type: "paragraph", text: `Suis les étapes de « ${title} » dans l'ordre, puis rends compte en une ligne.` }],
})

export const SCALE_PROCEDURES: SeedNode[] = [
  procedure("relancer_devis", "Relancer les devis en attente", "Relance par email les devis envoyés sans réponse depuis 7 jours. Se demande : « relance les devis en attente », « relance mes devis »."),
  procedure("creer_devis", "Créer un devis", "Prépare un devis à partir de la grille tarifaire pour un prospect. Se demande : « fais un devis pour », « prépare un devis »."),
  procedure("qualifier_prospect", "Qualifier un prospect", "Complète la fiche d'un prospect : taille, besoin, budget, décideur. Se demande : « qualifie ce prospect », « complète la fiche prospect »."),
  procedure("preparer_rdv_commercial", "Préparer un rendez-vous commercial", "Rassemble l'historique, les devis et les échanges avant un rendez-vous client. Se demande : « prépare mon rdv avec », « brief avant le rendez-vous »."),
  procedure("compte_rendu_rdv_client", "Rédiger le compte rendu d'un rendez-vous client", "Rédige et range le compte rendu d'une réunion client, décisions et prochaines étapes. Se demande : « fais le compte rendu du rdv », « CR de la réunion client »."),
  procedure("point_pipeline", "Faire le point pipeline de la semaine", "Résume les opportunités ouvertes, leur montant et leur étape pour la revue commerciale. Se demande : « point pipeline », « revue des opportunités »."),
  procedure("devis_en_commande", "Transformer un devis signé en commande", "Passe un devis signé en commande et prévient la production. Se demande : « le devis est signé », « passe le devis en commande »."),
  procedure("ajouter_contact_crm", "Ajouter un contact au CRM", "Crée la fiche d'un nouveau contact ou d'une entreprise dans le CRM. Se demande : « ajoute ce contact », « nouveau contact dans le CRM »."),
  procedure("envoyer_plaquette", "Envoyer la plaquette commerciale", "Envoie la plaquette et les références à un prospect après un premier échange. Se demande : « envoie la plaquette », « envoie notre présentation »."),
  procedure("relancer_prospects_inactifs", "Relancer les prospects inactifs", "Relance les prospects sans échange depuis 3 mois avec un message personnalisé. Se demande : « relance les prospects inactifs », « réactive les vieux leads »."),
  procedure("emettre_facture", "Émettre une facture", "Crée la facture d'une commande livrée et l'envoie au client. Se demande : « fais la facture de », « facture la commande »."),
  procedure("relancer_impayes", "Relancer les factures impayées", "Relance les clients dont la facture est échue depuis plus de 15 jours, par niveau de relance. Se demande : « relance les impayés », « relance les factures en retard »."),
  procedure("faire_avoir", "Faire un avoir", "Émet un avoir total ou partiel sur une facture contestée ou erronée. Se demande : « fais un avoir », « annule une partie de la facture »."),
  procedure("rapprochement_bancaire", "Faire le rapprochement bancaire", "Pointe les opérations du relevé bancaire avec les factures et les dépenses. Se demande : « fais le rapprochement bancaire », « pointe le relevé »."),
  procedure("saisir_note_de_frais", "Saisir une note de frais", "Enregistre une dépense avancée par un salarié avec son justificatif. Se demande : « ajoute une note de frais », « j'ai un ticket de resto à passer »."),
  procedure("rembourser_frais", "Rembourser les notes de frais validées", "Prépare le virement des notes de frais validées du mois. Se demande : « rembourse les notes de frais », « virement des frais »."),
  procedure("cloture_mensuelle", "Préparer la clôture mensuelle", "Liste les écritures manquantes, les factures non rapprochées et les provisions avant la clôture du mois. Se demande : « prépare la clôture », « clôture de fin de mois »."),
  procedure("declaration_tva", "Préparer la déclaration de TVA", "Calcule la TVA collectée et déductible du mois et prépare la déclaration. Se demande : « prépare la TVA », « déclaration de TVA »."),
  procedure("payer_fournisseur", "Payer une facture fournisseur", "Vérifie une facture fournisseur, la fait valider et programme son paiement. Se demande : « paye la facture fournisseur », « règle le fournisseur »."),
  procedure("previsionnel_tresorerie", "Mettre à jour le prévisionnel de trésorerie", "Met à jour les encaissements et décaissements prévus sur 3 mois. Se demande : « mets à jour la tréso », « prévisionnel de trésorerie »."),
  procedure("poser_conges", "Poser des congés", "Enregistre une demande de congés payés et la soumet au responsable. Se demande : « je veux poser des congés », « pose-moi une semaine de vacances »."),
  procedure("declarer_arret_maladie", "Déclarer un arrêt maladie", "Enregistre un arrêt maladie reçu, prévient la paie et l'équipe. Se demande : « déclare un arrêt maladie », « Paul est en arrêt »."),
  procedure("accueillir_salarie", "Accueillir un nouveau salarié", "Prépare l'arrivée d'un salarié : comptes, matériel, parrain, planning de la première semaine. Se demande : « onboarding de », « prépare l'arrivée de »."),
  procedure("depart_salarie", "Gérer le départ d'un salarié", "Organise un départ : restitution du matériel, fermeture des comptes, solde de tout compte. Se demande : « offboarding de », « Léa quitte l'entreprise »."),
  procedure("entretien_annuel", "Préparer un entretien annuel", "Prépare la trame de l'entretien annuel avec les objectifs de l'année passée. Se demande : « prépare l'entretien annuel de », « entretien individuel »."),
  procedure("publier_offre_emploi", "Publier une offre d'emploi", "Rédige et publie une offre d'emploi sur les sites de recrutement. Se demande : « publie une offre d'emploi », « on recrute un commercial »."),
  procedure("trier_candidatures", "Trier les candidatures", "Classe les candidatures reçues sur une offre selon les critères du poste. Se demande : « trie les candidatures », « quels candidats retenir »."),
  procedure("variables_paie", "Envoyer les variables de paie", "Rassemble absences, primes et heures supplémentaires du mois pour le cabinet de paie. Se demande : « envoie les variables de paie », « prépare la paie »."),
  procedure("inscrire_formation", "Inscrire un salarié à une formation", "Inscrit un salarié à une formation et monte la demande de prise en charge OPCO. Se demande : « inscris-le à la formation », « demande de formation »."),
  procedure("affilier_mutuelle", "Affilier un salarié à la mutuelle", "Affilie un nouveau salarié ou ses ayants droit à la mutuelle d'entreprise. Se demande : « ajoute-le à la mutuelle », « affiliation mutuelle »."),
  procedure("repondre_ticket", "Répondre à un ticket client", "Lit un ticket de support, cherche la réponse dans la base de connaissance et rédige la réponse. Se demande : « réponds au ticket », « traite ce ticket »."),
  procedure("escalader_incident", "Escalader un incident critique", "Escalade un incident bloquant vers l'astreinte technique et prévient le client. Se demande : « escalade l'incident », « c'est bloquant, préviens l'astreinte »."),
  procedure("retour_produit", "Traiter un retour produit", "Ouvre un retour (RMA), envoie l'étiquette et suit la réception du produit. Se demande : « le client renvoie le produit », « ouvre un retour »."),
  procedure("planifier_intervention", "Planifier une intervention sur site", "Planifie la visite d'un technicien chez le client selon ses disponibilités. Se demande : « planifie une intervention », « envoie un technicien »."),
  procedure("mettre_a_jour_faq", "Mettre à jour la FAQ", "Ajoute à la FAQ une question fréquente et sa réponse validée. Se demande : « ajoute à la FAQ », « mets à jour la FAQ »."),
  procedure("enquete_satisfaction", "Envoyer l'enquête de satisfaction", "Envoie l'enquête de satisfaction aux clients dont le ticket est clos depuis 48 heures. Se demande : « envoie l'enquête de satisfaction », « demande l'avis des clients »."),
  procedure("verifier_garantie", "Vérifier la garantie d'un produit", "Retrouve la date d'achat et dit si le produit est encore sous garantie. Se demande : « vérifie la garantie », « est-ce encore sous garantie »."),
  procedure("rapport_sav", "Rapport SAV du mois", "Compte les tickets, délais de réponse et motifs du mois pour la revue SAV. Se demande : « rapport SAV », « bilan du support du mois »."),
  procedure("traiter_reclamation", "Traiter une réclamation client", "Enregistre une réclamation, en cherche la cause et propose un geste commercial. Se demande : « traite la réclamation », « le client se plaint »."),
  procedure("relancer_tickets_attente", "Relancer les tickets en attente client", "Relance les clients qui n'ont pas répondu à un ticket depuis 5 jours, puis clôt. Se demande : « relance les tickets en attente », « clos les tickets sans réponse »."),
  procedure("lancer_projet", "Lancer un projet client", "Crée l'espace du projet, le planning et la réunion de lancement. Se demande : « lance le projet », « kickoff du projet »."),
  procedure("point_hebdo_projet", "Faire le point hebdo d'un projet", "Résume l'avancement, les risques et les prochaines échéances d'un projet. Se demande : « point hebdo du projet », « avancement du projet »."),
  procedure("cloturer_projet", "Clôturer un projet", "Fait le bilan du projet, archive les livrables et envoie la facture de solde. Se demande : « clôture le projet », « bilan de fin de projet »."),
  procedure("creer_compte_utilisateur", "Créer un compte utilisateur", "Crée les comptes messagerie, drive et outils d'un utilisateur. Se demande : « crée un compte pour », « ouvre les accès de »."),
  procedure("reinitialiser_mot_de_passe", "Réinitialiser un mot de passe", "Réinitialise le mot de passe d'un utilisateur après vérification de son identité. Se demande : « réinitialise le mot de passe », « il a perdu son mot de passe »."),
  procedure("commander_materiel", "Commander du matériel informatique", "Commande un ordinateur, un écran ou un téléphone après validation du budget. Se demande : « commande un ordinateur », « il faut un nouvel écran »."),
  procedure("verifier_sauvegardes", "Vérifier les sauvegardes", "Contrôle que les sauvegardes de la nuit ont réussi et teste une restauration. Se demande : « vérifie les sauvegardes », « contrôle les backups »."),
  procedure("incident_securite", "Signaler un incident de sécurité", "Traite un phishing ou une fuite de données : isoler, prévenir, déclarer à la CNIL si besoin. Se demande : « j'ai reçu un phishing », « incident de sécurité »."),
  procedure("relire_contrat", "Relire un contrat", "Relit un contrat client ou fournisseur et signale les clauses à risque. Se demande : « relis ce contrat », « vérifie les clauses »."),
  procedure("preparer_nda", "Préparer un accord de confidentialité", "Prépare un NDA à partir du modèle et l'envoie en signature. Se demande : « prépare un NDA », « accord de confidentialité avec »."),
  procedure("demande_rgpd", "Répondre à une demande RGPD", "Traite une demande d'accès ou d'effacement de données personnelles sous un mois. Se demande : « demande RGPD », « il veut qu'on supprime ses données »."),
  procedure("renouvellement_contrats", "Suivre les renouvellements de contrats", "Liste les contrats qui arrivent à échéance dans 90 jours et prévient leurs responsables. Se demande : « contrats à renouveler », « échéances des contrats »."),
  procedure("post_linkedin", "Rédiger un post LinkedIn", "Rédige un post LinkedIn sur une actualité de l'entreprise dans le ton de la marque. Se demande : « écris un post LinkedIn », « publie sur LinkedIn »."),
  procedure("newsletter", "Préparer la newsletter mensuelle", "Rassemble les actualités du mois et prépare la newsletter clients. Se demande : « prépare la newsletter », « newsletter du mois »."),
  procedure("organiser_webinaire", "Organiser un webinaire", "Planifie un webinaire, ouvre les inscriptions et prépare les relances. Se demande : « organise un webinaire », « on fait un webinar »."),
  procedure("preparer_salon", "Préparer un salon professionnel", "Réserve le stand, le matériel et le planning de l'équipe pour un salon. Se demande : « prépare le salon », « on expose au salon »."),
  procedure("etude_de_cas", "Rédiger une étude de cas client", "Rédige une étude de cas à partir d'un projet livré, avec l'accord du client. Se demande : « écris une étude de cas », « cas client »."),
  procedure("reserver_deplacement", "Réserver un déplacement", "Réserve train, avion et hôtel selon la politique voyages. Se demande : « réserve un train pour », « organise mon déplacement »."),
  procedure("reserver_salle", "Réserver une salle de réunion", "Réserve une salle et le matériel de visio pour une réunion. Se demande : « réserve une salle », « il faut une salle pour jeudi »."),
  procedure("commander_fournitures", "Commander des fournitures de bureau", "Commande papier, cartouches et petites fournitures pour le bureau. Se demande : « commande des fournitures », « il n'y a plus de papier »."),
]

export type ScaleRoutingCase = {
  phrase: string
  kind: "formulation" | "paraphrase" | "near" | "negative" | "data"
  /**
   * `served` : les étapes de `path` servies ; `shown` : `path` parmi les candidates montrées, que l'assistant
   * départage (E11-S16), servie ou non ; `measured` : hors de portée du lexique, rang imprimé sans attente ;
   * `never` : aucune étape servie.
   */
  expect: "served" | "shown" | "measured" | "never"
  path?: string
}

/** Le complément d'une formulation qui finit sur sa préposition (« fais un devis pour »), comme une demande le donnerait. */
const PERSON = new Set(["accueillir_salarie", "depart_salarie", "entretien_annuel", "creer_compte_utilisateur"])
function complement(slug: string): string {
  if (PERSON.has(slug)) return "Julie Martin"
  return slug === "reserver_deplacement" ? "Lyon" : "la société Nova"
}

/** Les deux formulations de chaque résumé (« Se demande : « … », « … ». »), complétées quand elles finissent sur une préposition. */
export const SCALE_FORMULATIONS: ScaleRoutingCase[] = SCALE_PROCEDURES.flatMap((node) => {
  const slug = node.path.slice(FOLDER.length + 1)
  return [...node.summary.matchAll(/« ([^»]+) »/g)].map((match) => {
    const said = match[1].trim()
    const phrase = /\b(pour|de|avec|à)$/.test(said) ? `${said} ${complement(slug)}` : said
    return { phrase, kind: "formulation" as const, expect: "served" as const, path: node.path }
  })
})

const shown = (phrase: string, slug: string, kind: "paraphrase" | "near" = "paraphrase"): ScaleRoutingCase => ({ phrase, kind, expect: "shown", path: scalePath(slug) })

/** Paraphrases, que ni titre ni résumé ne portent, et demandes entre deux voisines : la procédure parmi les candidates. */
export const SCALE_PARAPHRASES: ScaleRoutingCase[] = [
  // Le résumé de la relance des tickets porte « relance les clients qui n'ont pas répondu » : il passe devant, et
  // l'assistant départage par le titre et le résumé montrés.
  shown("Peux-tu relancer les clients qui n'ont pas répondu à nos devis ?", "relancer_devis"),
  shown("relance les clients qui n'ont pas répondu à leur devis", "relancer_devis"),
  shown("Il faut faire une facture pour la commande livrée chez Durand", "emettre_facture"),
  shown("Les factures de juillet ne sont toujours pas payées, relance les clients", "relancer_impayes"),
  shown("J'ai avancé un billet de train, enregistre la dépense", "saisir_note_de_frais"),
  shown("Je pars en vacances du 3 au 10 août, pose mes congés", "poser_conges"),
  shown("Un nouveau développeur arrive lundi, prépare son arrivée", "accueillir_salarie"),
  shown("Marc démissionne, organise son départ", "depart_salarie"),
  shown("Le serveur de production est tombé, c'est critique", "escalader_incident"),
  shown("Rédige le CR de notre réunion d'hier avec la mairie", "compte_rendu_rdv_client"),
  shown("Écris un article pour LinkedIn sur notre nouveau client", "post_linkedin"),
  shown("Booke-moi un hôtel et un train pour Lyon mardi", "reserver_deplacement"),
  shown("On n'a plus de cartouches d'encre", "commander_fournitures"),
  shown("Un utilisateur a oublié son mot de passe", "reinitialiser_mot_de_passe"),
  shown("Prépare les éléments de paie du mois pour le cabinet", "variables_paie"),
  shown("Fais le point sur la trésorerie des trois prochains mois", "previsionnel_tresorerie"),
  shown("Rédige un accord de confidentialité pour la société Nova", "preparer_nda"),
  shown("Un client demande la suppression de ses données personnelles", "demande_rgpd"),
  shown("Commande un nouveau PC portable pour Julie", "commander_materiel"),
  shown("Le devis de Nova vient d'être signé, lance la commande", "devis_en_commande"),
  shown("Rédige l'annonce pour recruter un chef de projet", "publier_offre_emploi"),
  shown("Prépare la déclaration de TVA de septembre", "declaration_tva"),
  shown("Envoie un technicien chez le client jeudi", "planifier_intervention"),
  shown("Pointe les virements du relevé de la banque avec nos factures", "rapprochement_bancaire"),
  shown("prépare la clôture du projet Alpha", "cloturer_projet", "near"),
  shown("prépare la clôture comptable du mois", "cloture_mensuelle", "near"),
  shown("rembourse la note de frais de Paul", "rembourser_frais", "near"),
  shown("ajoute une note de frais de 45 euros", "saisir_note_de_frais", "near"),
  shown("relance les tickets clients", "relancer_tickets_attente", "near"),
  // Hors de portée du lexique : aucun mot commun avec « phishing », « fuite de données » ou « incident de sécurité » ;
  // « renvoyer son imprimante » ne porte pas « retour », et « le client renvoie le produit » reste sous 0,30.
  { phrase: "Quelqu'un a cliqué sur un lien suspect dans un mail", kind: "paraphrase", expect: "measured", path: scalePath("incident_securite") },
  { phrase: "Un client veut nous renvoyer son imprimante défectueuse", kind: "paraphrase", expect: "measured", path: scalePath("retour_produit") },
]

const never = (kind: "near" | "negative" | "data", phrases: string[]): ScaleRoutingCase[] => phrases.map((phrase) => ({ phrase, kind, expect: "never" }))

/** Un mot seul partagé par plusieurs voisines, hors sujet et questions de données : aucune étape servie. */
export const SCALE_NEVER: ScaleRoutingCase[] = [
  ...never("near", ["relance", "facture"]),
  ...never("negative", [
    "quelle heure est-il ?",
    "écris-moi un poème sur l'automne",
    "traduis ce paragraphe en anglais",
    "donne-moi une recette de crêpes",
    "explique-moi la photosynthèse",
    "combien font 17 fois 23 ?",
    "résume ce texte",
  ]),
  ...never("data", [
    "combien de devis avons-nous envoyés en septembre ?",
    "quels tickets sont ouverts depuis plus d'une semaine ?",
    "qui est en congé la semaine prochaine ?",
    "quel est le plafond pour un repas en note de frais ?",
  ]),
]

export const SCALE_CASES: ScaleRoutingCase[] = [...SCALE_FORMULATIONS, ...SCALE_PARAPHRASES, ...SCALE_NEVER]
