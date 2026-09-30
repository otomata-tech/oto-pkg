# Registre des choix en vigueur

> Chaque identifiant de choix encore cité par le code, les conventions ou la méthode y est écrit
> une fois, dans son état en vigueur, en une ligne. Préfixes : **H** (choix du projet), **P** (choix
> entre deux stories), **N**, **NH** et **HN-…** (hypothèses d'une story, rangées sous leur story).
> Un **N** ou un **NH** cité seul dans un commentaire appartient à la story nommée à côté ou en tête
> du fichier. Les décisions **D** sont dans [`fiche-decisions.md`](fiche-decisions.md). Une ligne
> « Plus en vigueur » dit qu'un commentaire cite encore un choix que le code a quitté.
>
> Ce qui gouverne s'écrit d'abord là où il gouverne : un ADR, `docs/architecture.md`, une
> convention de `.method/conventions/`. Ce registre ne reçoit que ce qu'un commentaire cite par son
> identifiant.
>
> Les hypothèses d'une story encore dans `docs/stories/` (E01-S12, E05-S11, E05-S12, E10) se lisent
> dans sa section « Hypothèses » ; elles rejoignent ce registre quand la story quitte le dépôt.

## H — choix du projet

| Id | Règle |
|---|---|
| H01 | Le schéma `platform` n'évolue que par les migrations du paquet ; un service qui ne fait que lire et calculer n'ajoute ni migration ni fonction SQL : une lecture bornée, puis un calcul pur dans le service. |
| H02 | Les schémas Zod partagés vivent dans `packages/plateforme/schemas/`, exporté par `./schemas` et importable par toutes les faces, `ui/` compris : du Zod pur, sans client de base, ni Next, ni autre face. |
| H03 | Un écran du paquet reçoit ses données de la page serveur de l'hôte, qui appelle `server/` pour l'appelant de la session ; ses mutations passent par `/api/platform/<ressource>` (hôte, puis `api/`, puis `server/`), réponse `{ data }` ou `{ error }`. |
| H04 | Les services lèvent `PlatformError` avec un code de la liste fermée `PLATFORM_ERROR_CODES` (`server/errors.ts`) et son statut HTTP ; message anglais au MCP, français dans `ui/` ; un test vérifie toujours le code. |
| H05 | Les identifiants sont en anglais dans `server/`, `mcp/`, `api/`, `schemas/` et le SQL ; les composants et écrans de `ui/` sont en français. |
| H06 | L'hôte monte `/api/mcp`, `/api/mcp-admin` et `/api/platform/[...route]` en routes statiques, et les pages de l'arbre sous `/n/[...chemin]` ; pas de route `api/[transport]`. |
| H07 | Les portes écrivent le journal après la réponse, sous l'appelant : une ligne par appel MCP, une par mutation de l'API ; arguments bornés à 2 048 caractères, clés de secret masquées ; une panne du journal ne change jamais la réponse. |
| H10 | L'organisation vient de l'adresse appelée : `org_domains(host)` range un nom d'hôte en minuscules, sans port, et chaque hôte désigne une seule organisation ; en local, le script Démo pose `localhost` et `demo.localhost`. |
| H11 | En mode Supabase, l'inscription est ouverte mais filtrée par `platform.hook_before_user_created` (adresses invitées seules) ; l'invitation est le lien magique (`signInWithOtp`, clé publique) ; `accept_invitations()` crée les appartenances au retour. |
| H12 | Une invitation vit 7 jours, en attente tant qu'elle n'est ni acceptée, ni refusée, ni révoquée, ni expirée ; un doublon rend `conflict` ; l'email vérifié de la session doit être celui de l'invitation ; l'acceptation ne rétrograde aucun rôle. |
| H13 | Sur une adresse connue dont la personne n'est pas membre, la page « aucune organisation » nomme l'organisation et le nom et l'email de son administrateur le plus ancien (`org_contact`, toute personne connectée) ; une adresse inconnue se dit telle. |
| H16 | En mode Supabase, le consentement OAuth vit à `/oauth/consent` de l'hôte : il montre le client et l'organisation visée, lue par `oauth_pending_resource` ; sans organisation déterminée, le consentement reste permis. |
| H17 | Le ménage des clients OAuth est un script d'outillage (`pnpm oauth:clients list \| purge --older-than <jours>`) : il liste, puis supprime sur option les clients sans session récente, lue par `oauth_clients_activity()` ; aucun écran. |
| H18 | Une routine est une tâche planifiée de l'assistant, qui appelle le MCP sous la connexion OAuth de la personne ; ni compte ni jeton de service en V1 ; `members.role` n'admet que `admin` et `member`. |
| H20 | À chaque requête sur `/api/mcp` : organisation par `x-forwarded-host`, sinon `host` ; jeton `Bearer` vérifié par la JWKS de l'émetteur (`iss`, `exp`, `sub`, `nbf`) ; appartenance relue ; sinon 401 et `WWW-Authenticate` vers les métadonnées. |
| H21 | Le serveur MCP installe des handlers bas niveau du SDK, pas `registerTool`, pour que la garde du `ctx` rende son propre message ; les schémas d'entrée sont en `zod/v4` et servis par `z.toJSONSchema`. |
| H22 | Les schémas d'entrée des six outils (`context`, `find`, `read`, `call`, `write`, `feedback`) sont figés et ne changent que par ajout (ADR-002) ; chaque champ porte `.describe()` avec un exemple ; `team` et `account` de `call` sont facultatifs. |
| H23 | Annotations : `readOnlyHint: true` sur `context`, `find` et `read` ; `destructiveHint: false` sur `feedback` seul ; `openWorldHint: true` sur `call` seul ; `call` et `write` gardent les autres défauts. |
| H25 | Descriptions en anglais, sous 1 000 caractères, ouvertes par « Requires the ctx code from <p>_context; call it first. » ; celle de `context` nomme les domaines et borne son usage ; celle de `call` cite deux ou trois fonctions actives. |
| H26 | Tout résultat d'outil porte le même texte dans `content[0].text` et `structuredContent.text`, ses données en champs et `next_actions`, qui ne propose jamais de fonction sensible ; 45 000 caractères au plus, la suite par curseur. |
| H27 | Le code `ctx` a la forme Crockford `XXXX-XXXX` et devient périmé quand l'un des Contextes qu'il a servis change de contenu (ADR-002 § 2, E11-S03) ; un code absent ou inconnu reçoit son texte fixe qui dit de rappeler `<p>_context` ; un code périmé reçoit les chemins changés, un nouveau code avec lequel rejouer l'appel et les parties changées (sans code, le texte qui dit de rappeler `<p>_context` : code émis avant 1.1.0, émission ou lecture en panne) ; l'auteur d'un Contexte garde son code (E11-S19). |
| H28 | `rules_version` augmente, par déclencheur en base, à chaque publication d'un nœud Contexte (`contexte`, `<équipe>/contexte`, `private/<handle>/contexte`), republication à l'identique comprise ; compté, il n'est plus lu par la garde du `ctx` (HN-E11S03-3). Une republication à l'identique n'invalide aucun `ctx` et `write` n'en dit rien : les blocs publiés se comparent par `samePublishedContent` (type, texte, données, clé). Tenue depuis E11-S03. |
| H29 | La signature `client_name@version` de l'`initialize` est lue dans le corps de la requête et posée sur `ctx.host` et `journal.host`. |
| H30 | `context` sert ses blocs entiers, dans l'ordre servi, sous un plafond de 35 000 caractères (`CONTEXT_BUDGET`, fiche D134) : aucune taille par bloc ; le bloc `code` (règles) passe toujours en premier ; restent des bornes en lignes (listes d'un Contexte 20, procédures utiles 60, nouveautés 10, contenus récents 20). Au-delà du plafond, le premier bloc qui dépasse est coupé à la dernière ligne entière et les suivants omis et nommés ; une partie de Contexte coupée finit par un pointeur vers `read` (ADR-002 § 7). Les faits de la personne, de l'organisation et d'une équipe ne sont plus des blocs : une ligne en tête de la partie de leur Contexte (D109) ; un Contexte liste ses enfants, procédures comprises (D110). |
| H31 | Les faits de la personne (nom, handle, rôle, équipes, celle par défaut marquée, langue de réponse), lus dans `members.profile`, ouvrent la partie Privé de `context` ; la personne édite son prénom, son nom et sa langue dans son Profil ; ton et préférences s'écrivent dans son Contexte privé. |
| H32 | Le bloc organisation de `context` donne le nom et les domaines de travail ; le contenu de l'organisation est son Contexte `contexte`, servi avec ses sous-pages, tableaux et pages liées. |
| H34 | « What's new » liste, depuis le dernier `ctx` de la personne sinon 14 jours, les versions publiées qu'elle lit et les connecteurs activés : 10 lignes et 600 caractères au plus ; sans nouveauté depuis une borne du jour même, le bloc est omis. |
| H35 | « Procedures you can run » liste 60 procédures lisibles au plus, triées par l'usage sur 90 jours que la personne lit au journal, puis par chemin ; les 15 premières par chemin et résumé, les suivantes par chemin et titre (amendée par E11-S16 : les 40 premières du jeu à l'échelle en 3 932 caractères au lieu de 6 836, toutes visibles). |
| H36 | « Recent documents » liste 20 pages et tableaux au plus, lus ou écrits par la personne sur 90 jours (journal, blocs qu'elle a écrits, nœuds qu'elle a publiés), sans procédure ni Contexte. |
| H37 | Sans procédure servie, une phrase qui finit par « ? » ou commence par un interrogatif est une question de données (`data_question`), sauf une question dont la personne est le sujet et un tiers (`lui`, `leur`) l'objet, qui est une action (E11-S19) ; avec des candidates, une seule consigne, quel que soit le genre de la phrase : le modèle lit celle dont le titre et le résumé correspondent à la demande, sinon cherche ou demande à l'utilisateur ; sans candidate, une question se cherche et se répond (amendée par E11-S16 : l'assistant arbitre, il n'est plus tenu de demander), et une demande qui commence par un verbe d'édition est `edit` et reçoit la marche `find` puis `write` (E11-S19). |
| H40 | Routage sur le titre et le résumé : score = 0,55 × max(s_summary, s_title) + 0,45 × lexical × min(1, lexèmes/2), + 0,03 par bonus (équipe, usage sur 30 jours) ; candidat dès 0,30 ; étapes servies à 0,65 avec 0,1 d'écart, réglables par organisation. |
| H43 | Le test de routage sans host joue, sur une organisation jetable, les formulations des résumés (95 % servies au moins), des paraphrases et des négatives (aucune servie à marge sûre) ; paraphrases et demandes d'un mot sont mesurées et rapportées. |
| H44 | `find` rend trois nœuds au plus par `search_content` (titre, puis résumé, puis blocs publiés, lignes comprises), chacun avec ses emplacements (la section d'un bloc de page trouvé, E11-S19), la ligne « To edit » avec sa révision pour qui écrit un nœud hors tableau dont des blocs sont montrés (E11-S19), puis trois fonctions au plus du catalogue, un nom exact en tête. |
| H50 | La racine de l'arbre a le chemin `guide` et un `lpath` vide, une par organisation ; les grands sujets sont ses enfants, sans préfixe ; la page servie de l'organisation est son Contexte `contexte`, pas la racine. |
| H51 | Un segment de chemin s'écrit `[a-z0-9_]+` ; le chemin change par un déplacement ou quand le titre change, l'ancien devenant un alias. |
| H52 | Le propriétaire s'hérite : un nœud sans propriétaire prend celui de son ancêtre le plus proche qui en porte un, et la racine appartient à l'organisation. |
| H54 | Une section est un titre et les blocs qui le suivent jusqu'au titre de même niveau ou plus haut ; `write` a cinq opérations par section et quatre par bloc (référence courte) ; titres comparés sans casse ni accent ; un échec refuse tout le lot. |
| H56 | Un bloc `reference` `{path, view?}` cite une page ou une vue d'un tableau (`filter`, `sort`, `columns`, `limit` de 20 au plus) ; `read` le sert avec sa ligne résolue, `context` la ligne seule. |
| H57 | Les liens `[[chemin]]`, `[[chemin#clé]]` et `[[chemin\|libellé]]` des blocs de texte et des `reference` sont extraits à la publication dans `links` ; `read` les relit pour le lecteur et sert liens entrants et sortants ; un lien sans cible est signalé. |
| H58 | Un déplacement ou un renommage inscrit l'ancien chemin dans `node_aliases` ; un outil appelé par un alias résout le nœud et le signale (« moved to X ») ; l'alias ne disparaît pas. |
| H59 | Une procédure est une page `kind: procedure` : titre, résumé (ce qu'elle fait et comment on la demande) et étapes ; chaque appel exact est un bloc `call` `{function, args}`, un espace réservé `"<…>"` valant une valeur fournie à l'exécution. |
| H60 | Publier une procédure contrôle chaque bloc `call` : fonction active, clés d'arguments connues, valeurs conformes, contrôle propre à la fonction ; un bloc `code` en langage `call` est refusé ; un refus nomme section, rang du bloc et étape. |
| H61 | L'espace personnel `perso/<handle>` (handle unique tiré de l'email) et son Contexte naissent à l'arrivée du membre ; un nœud personnel n'est visible que de son propriétaire et de ses partages ; `perso` et l'espace ne se suppriment ni ne se déplacent. |
| H62 | `read` sert deux pseudo-fonctions non appelables, au rendu d'un contrat de fonction : `write.procedure` (écrire une procédure) et `write.table` (l'en-tête d'un tableau). |
| H63 | Écrire et publier exigent le niveau écriture, en-tête d'un tableau compris ; la gestion garde le partage, les règles, le déplacement, la corbeille et le propriétaire. Le chemin qui suit un titre publié change au niveau écriture ; l'ancien chemin reste un alias qui mène au nœud (fiche D135). |
| H65 | Quatre niveaux d'accès : aucun (0), lecture (1), écriture (2), gestion (3). |
| H66 | Niveau sur un nœud : l'administrateur gère tout sauf l'espace personnel ; le responsable de l'équipe propriétaire garde la gestion sauf règle qui le nomme ; sinon la règle la plus proche dans l'arbre, même plus basse (à même nœud, la plus précise : personne, équipe, organisation ; une règle d'organisation ne retire rien au propriétaire) ; sinon le propriétaire effectif décide. |
| H67 | Niveau sur un compte : même calcul, sans héritage ; par défaut, compte d'organisation en lecture (gestion à l'administrateur), d'équipe en écriture (gestion au responsable), personnel à son propriétaire ; une fonction sensible exige l'écriture. |
| H68 | Un nœud invisible répond `not_found`, comme un chemin inconnu ; sur un nœud visible sans le niveau voulu, le refus dit à qui demander (« … is reserved to team Ventes (lead: …). Ask them for access. »). |
| H69 | Une équipe qui possède des nœuds ou des comptes ne se supprime pas (clés différées sans action ; le service liste quoi transférer) ; supprimer une organisation emporte équipes et nœuds ; les règles qui visent l'équipe tombent avec elle. |
| H70 | Retirer un membre retire, par déclencheur et dans la même transaction, ses appartenances d'équipe et ses règles nominatives ; la coupure vaut dès la requête suivante ; ses nœuds personnels restent, invisibles de tous. |
| H71 | Déplacer un nœud exige la gestion sur lui et l'écriture sur la destination ; un cycle est refusé par déclencheur ; le propriétaire explicite suit le nœud, le propriétaire hérité devient celui de la nouvelle place. |
| H72 | Le responsable d'équipe gère les nœuds de son équipe, y ajoute ou retire des membres de l'organisation, y invite au rôle membre, et pose des règles d'accès pour une autre équipe, une personne ou toute l'organisation, jamais pour quelqu'un du dehors (un lien public est un partage à part, ADR-013). |
| H73 | L'équipe plateforme (`platform_staff`) entre dans une organisation par un accès daté (`platform_grants`), donné à qui la crée, révocable par l'administrateur du client ; avec un accès en cours, elle agit en administrateur hors espaces personnels. |
| H74 | Une personne lit au journal ses propres lignes et celles des équipes qu'elle mène ; l'administrateur et l'équipe plateforme avec un accès en cours lisent toute l'organisation. |
| H80 | Le catalogue de `call` vit dans le code, avec trois sources : native (`table.*`), simulée (`mail.*`) et ERP (inscrite par l'hôte) ; chaque fonction porte son origine et sa classe (`read`, `write`, `sensitive`). |
| H81 | L'activation d'un connecteur se range dans `connector_activations(org_id, connector, state)` ; les fonctions natives et ERP sont toujours actives. |
| H82 | Une règle d'`access_rules` vise un nœud ou un compte, pour une équipe ou une personne (l'organisation entière selon ADR-014) ; aucune table d'accès propre aux comptes. |
| H83 | Le compte d'un appel se résout dans cet ordre : celui que nomme `call.account`, celui de l'équipe porteuse, celui de l'organisation, parmi les comptes dont le niveau suffit ; un compte nommé introuvable rend `not_found`, sans repli. |
| H84 | L'équipe porteuse d'un appel est, dans l'ordre : `call.team`, l'équipe du tableau pour `table.*`, celle de la dernière procédure servie sous ce `ctx`, l'équipe par défaut ; si l'endroit ne tranche pas, `ambiguous_team` liste les équipes. |
| H85 | Un compte de connecteur est toujours simulé en V1 : créer un compte réel ou de bac à sable rend `unavailable_in_v1`, et l'exécution simulée écrit dans `sim_outbox` sans rien envoyer. |
| H86 | Une fonction sensible se fait en deux temps : sans `confirm`, un récapitulatif nominatif et rien d'exécuté ; avec `confirm: true`, l'exécution directe. |
| H87 | `next_actions` d'un appel est la liste `next` de la fonction, moins les fonctions sensibles, inactives ou absentes du catalogue. |
| H90 | Une colonne de tableau a l'un des huit types `text`, `number`, `date`, `datetime`, `bool`, `enum`, `email`, `url`, et les seules contraintes `required`, `max_length`, `options` ; un attribut inconnu est refusé. |
| H91 | L'en-tête d'un tableau vit dans `nodes.meta` : colonnes, colonne `key` (la clé de chaque ligne), cycle de vie facultatif (états, état de travail, revue) et `closed`, qui refuse les lignes nouvelles ; l'en-tête en attente vit dans `node_drafts.meta`. |
| H92 | `table.write` écrit 50 lignes au plus, `{key, revision?, set, clear, verified_empty}`, chaque ligne atomique et rapportée ; `null` refuse sa ligne ; `create_only: true` refuse (`conflict`) une clé qui existe déjà, avec la ligne telle qu'elle est, sans rien écrire pour elle ; dans un tableau `proof: true`, une valeur nouvelle exige sa preuve `{value, comment \| link}`, sinon tout l'appel est refusé ; sans `proof`, elle s'écrit nue (fiche D133). |
| H93 | Une ligne lue a la forme de l'écriture : `{key, revision, set, verified_empty, provenance?, claim?}` ; `set` ne sert que les colonnes déclarées, et jamais de `null` : une colonne sans valeur est absente. |
| H94 | Chaque cellule porte sa provenance (`origin`, `by`, `ctx?`, `at`, `comment?`, `link?`, `imported?`, `host?`, `worker?`) ; `host` est la signature du client MCP du `ctx`, `worker` le travailleur du bail (E11-S01) ; une valeur changée perd `comment` et `link`, une valeur identique ne change rien. |
| H95 | Une grammaire de filtre pour `rows`, `aggregate` et `claim` : `{col: valeur}` ou `{col: {op: valeur}}` (`eq`, `ne`, `contains`, `in`, `gt`, `gte`, `lt`, `lte`, `empty`, `not_empty`), 30 clauses au plus ; `in: []`, `null`, colonne inconnue refusés. |
| H96 | `table.rows` rend 20 lignes par défaut, 50 au plus, avec un curseur opaque, un tri selon le type déclaré, une recherche `q` par mots (chaque mot, sans casse ni accent, dans une cellule cherchable, en tout ordre : `queryWords`, E11-S01 ; avec `match: "any"`, au moins un mot, les lignes classées au nombre de mots trouvés, `sort` départageant, le défaut restant chaque mot, E11-S19) et le compte au même filtre. |
| H97 | `table.aggregate` compte, et fait somme, moyenne, minimum et maximum des colonnes nombre, groupé par une colonne ou en totaux, sous un filtre `where`, 1 000 groupes au plus. |
| H98 | `table.claim` réserve 5 lignes au plus par appel, baux expirés d'abord puis l'attente la plus longue, avec un bail de 15 minutes (60 au plus) lié à la personne et au travailleur, 5 baux par travailleur et tableau ; seul son titulaire rend la ligne. |
| H99 | La revue humaine sert la file des lignes à l'état de revue ; une décision (approuver ou rejeter) est atomique sous garde de révision, passe la provenance de l'état à `human` avec qui, quand et pourquoi, et écrit une ligne de journal. |
| H100 | Chaque ligne a sa révision, 1 à l'insertion, posée par la base ; elle avance quand les valeurs, le bail ou l'état changent, jamais sur une écriture sans effet. |
| H105 | Le MCP admin sert huit outils à `op` sur `/api/mcp-admin`, à l'équipe plateforme seule (401 sans métadonnées sinon) ; `help` sert le contrat des opérations ; l'organisation est un argument explicite ; une opération destructive se fait en deux temps. |
| H106 | `admin_cell` décrit la seule cellule : version du paquet, migrations appliquées (`platform.applied_migrations()`, équipe plateforme seule) et santé, variables présentes sans leur valeur ; le registre central de plusieurs cellules est en V2. |
| H107 | Les drapeaux d'une organisation vivent dans `orgs.flags` `{nom: true\|false}`, déclarés dans un registre en code ; `isEnabled` n'est vrai que pour un `true` stocké ; l'administrateur ou l'équipe plateforme avec un accès en cours les posent. |
| H108 | L'hôte inscrit ses fonctions ERP par `registerFunctions([...])` de `@otomata_tech/oto_platform/server` (`src/lib/fonctions-metier.ts`) : origine `erp`, même contrat que les autres, exécution pour l'appelant. |
| H110 | La marque d'une organisation est `orgs.brand` `{theme, logo_url, display_name}`, `theme` parmi les huit thèmes d'Oto ; la favicon suit le thème ; les emails de Supabase Auth, un modèle par projet, ne portent pas la marque d'une organisation. |
| H111 | L'hôte pose le sous-domaine `<slug>.<domaine de base>` à la création d'une organisation, désactivé sans `CELL_BASE_DOMAIN`, `VERCEL_TOKEN`, `VERCEL_PROJECT_ID` ; les étiquettes réservées (`app`, `www`, `api`, `mcp`, `admin`…) sont refusées. |
| H112 | L'export-import d'une organisation est une CLI d'outillage (`pnpm org:export`, `pnpm org:import`) : un fichier JSON par organisation, `platform` par la connexion d'administration, les personnes rapprochées par email vérifié. |
| H120 | Les tests créent leurs organisations et personnes jetables (`t<hex>`, `test-<hex>@example.invalid`) et les nettoient après chaque passage ; deux agents testent en même temps ; les suites portables tournent aussi sur un Postgres nu. |
| H121 | L'organisation « Démo » est semée par `pnpm demo:seed`, script d'outillage rejouable jamais importé par `server/`, `api/` ni `mcp/` ; tout type de donnée nouveau y ajoute sa part, en données fictives. |
| H122 | Toute modification d'un outil, d'une description ou d'une procédure ajoute ses lignes à `docs/mcp-golden-queries.md` ; le routage est rejoué sans host dans les tests, et les campagnes sur les hosts se jouent à part. |
| H123 | Les droits se décident et se filtrent dans `server/` (`access.ts`) avant chaque requête ; « aucune ligne rendue » n'est jamais un refus ; la RLS ne garde que l'isolation par organisation et les invariants ; le Data API n'expose pas `platform`. |
| H124 | À la fin de la V1, le code se sépare en deux dépôts neufs : le paquet, public, publié sur npm au tag `v1.0.0` avec une application de base minimale, et le SaaS, privé ; jusque-là, `src/` est l'hôte de référence. |

## P — choix entre deux stories

| Id | Règle |
|---|---|
| P10 | Les états de décision d'un cycle avec revue sont réservés à la revue humaine : ni `table.write` ni `table.release` ne les posent, sauf sur un tableau dont la revue déclare `agents_may_decide` (E11-S01, fiche D132 ; provenance `agent`). |
| P12 | Le déplacement d'un nœud passe par la route `POST /api/platform/nodes/move`, l'action « Déplacer… » de l'écran et `node.move` derrière `call`, au niveau gestion ; aucun des six outils ne déplace lui-même. |
| P13 | Les alias d'un déplacement sont écrits en base par le déclencheur `nodes_aliases_on_move`, pour tous les nœuds déplacés, invisibles compris ; l'alias qu'un nœud reprend est retiré. |
| P14 | Tout texte servi au modèle (description, refus, consigne d'un résultat MCP) se teste mot pour mot ; un message interne ne se compare jamais. |
| P16 | Une page de montage et ses données d'exemple partent dès que l'écran réel existe : un client ne voit jamais de données fictives. |
| P17 | `teams.lead_user_id` est la seule source du responsable d'équipe ; `team_members.role` en est dérivé par déclencheur. |
| P18 | À l'écran, un bloc `reference` résolu se rend en place (vue d'un tableau ou carte d'un nœud, désigné par son `id`) ; sinon, le chemin cité en lien. |
| P19 | Les refus du contrôle de publication vont dans `details.refusals` ; `effectiveHeader` est exporté ; `previewContext` rend aussi `served` et `candidates`. |
| P22 | Les chemins racines `journal` et `functions` sont réservés : `read journal` sert le journal, `read functions` la liste des fonctions (E11-S19) ; `write` refuse d'y créer un nœud, et aucune équipe ne prend ces slugs (E11-S19, E11-S18). |
| P24 | Limites V1 : la clé d'un tableau ne change que s'il est vide ; une colonne qui a des valeurs ne se renomme ni ne change de type ; une procédure tient en 8 000 caractères rendus ; un brouillon n'est servi qu'à partir du niveau écriture. |
| P27 | `platform_access_directory(p_org)` nomme pour l'administrateur qui a ou a eu un accès plateforme à son organisation : nom et email lus dans `platform_staff`, puis `members`, puis la copie posée sur l'accès. |
| P28 | Une aide de test partagée porte un nom unique dans `tests/helpers/` ; une aide propre à un lot prend un nom neuf préfixé par son lot, ou vit dans son module `tests/helpers/<lot>.ts`. |
| P29 | Le MCP admin évolue par ajout ; `admin_org` est déclaré `openWorldHint: true` quand l'hôte branche un point d'extension de création d'organisation, `false` sinon. |
| P36 | Sans session, l'API répond 401 avec le code `forbidden`. |
| P37 | Une procédure se réduit à un titre, un résumé et des étapes ; le résumé porte les façons de la demander, et le routage cherche dans le titre et le résumé ; ni phrases déclencheuses, ni voisines, ni slots, ni entrées. |
| P38 | Le contenu d'une procédure est celui d'une page ; le serveur n'en lit que les blocs `call`, contrôlés à la publication où qu'ils soient ; un refus nomme la section, le rang du bloc et, après une liste numérotée, son numéro. |
| P39 | L'arbre se range en sections : l'espace commun « Tout le monde », l'espace « Privé » de chacun et chaque équipe (aucune équipe « Tout le monde » en base), chacune avec un nœud Contexte (`contexte`, `perso/<handle>/contexte`, `<équipe>/contexte`) qui porte ton, préférences et règles, servi par `context` dans cet ordre. |

## Hypothèses de story

### E01-S04 — Équipes et droits : arbre des nœuds, règles héritées, rôle plateforme

| Id | Règle |
|---|---|
| N4 | `nodes.owner_team_id` et `accounts.owner_team_id` sont des clés `no action deferrable initially deferred`, `parent_id` en `no action` : ce qui possède encore un nœud ou un compte ne se supprime pas seul (`23503`) ; une organisation part entière. |
| N6 | Une règle `manage` ne se pose que par qui administre l'organisation (`isOrgAdmin`) ; un responsable d'équipe ou tout autre gestionnaire du nœud pose `none`, `read` ou `write`, et l'écran ne lui propose pas la gestion. |
| N7 | Le responsable de l'équipe propriétaire effective garde la gestion d'un nœud ou d'un compte de son équipe : une règle qui vise son équipe ne la lui retire pas, seule une règle qui le vise nommément la baisse ; l'admin garde la gestion. |
| N9 | `staff_directory()` rend l'annuaire de l'équipe plateforme au seul staff ; `node_owner` rend aussi le nœud qui porte le propriétaire effectif (`owner_node_id`). |
| N14 | `platform_access_directory(p_org)` nomme, pour le staff et les administrateurs de l'organisation, qui tient ou a tenu un accès plateforme et qui en a accordé ou révoqué un sans être membre ; rien pour les autres. |
| N15 | `access_rules` ne se met à jour que sur `level` (privilège de colonne) : un service relit la règle du couple cible-sujet, puis met à jour `level` ou insère ; jamais d'upsert, qui réécrirait toutes les colonnes. |
| N24 | Le niveau d'un nœud se calcule en SQL sur les colonnes de la ligne (`node_level_of`, definer) ; la recherche filtre par `node_level_for`, qui l'applique à l'appelant ; le niveau d'un compte n'a plus de pendant en base. |
| N26 | Une règle posée sur l'équipe propriétaire ne ferme pas son responsable (niveau 3) ; un membre de cette équipe sans règle nominative prend le niveau de la règle d'équipe. |
| N28 | Dans une organisation qui a son arbre, le slug d'une équipe doit être un segment de chemin (`[a-z0-9_]`), son nom tenir en 124 caractères et le `handle` d'un membre être un segment, sinon la création échoue (`23514`). |
| N30 | Un compte ne change ni d'organisation ni d'identifiant (mise à jour accordée colonne par colonne, sans `id`, `org_id`, `created_at`, `updated_at`) ; changer son propriétaire exige la gestion avant et après, décidée par le service. |
| N31 | `team_members_update_admin` exige, comme l'insertion, que la personne soit membre de l'organisation de l'équipe : un non-membre n'entre pas dans une équipe par une réécriture de `user_id`. |
| N32 | Un nœud à propriétaire hérité (`owner_kind` NULL) ne porte ni `owner_team_id` ni `owner_user_id` (contrainte `nodes_owner_inherited_check`, écrite sans comparaison qui puisse valoir NULL). |
| N33 | `nodes_guard` contrôle le chemin avant tout (segments `[a-z0-9_]`, 1 000 caractères au plus, NULL refusé : `23514`) : la colonne générée `lpath` (`text2ltree`) ne reçoit jamais un chemin invalide. |
| N35 | Dans un espace personnel, seules comptent les règles posées sur le nœud qui porte la personne comme propriétaire, ou en dessous : une règle posée plus haut (`perso`, la racine) n'ouvre l'espace à personne, pas même à l'admin. |
| N36 | Sous un jeton, `nodes_guard` prend `pg_advisory_xact_lock(7301, hashtext(org_id))` avant de lire le parent, à toute insertion et tout déplacement : les écritures de l'arbre d'une organisation passent une à une (un interblocage `40P01` en annule une). |
| N37 | Sous un jeton, seul un administrateur (ou le staff avec un accès en cours) rend personnel un compte qui ne l'était pas (`accounts_guard`, `42501`). |
| N38 | La mise à jour de `teams` n'est accordée à `authenticated` que sur `name` et `lead_user_id` : le slug, chemin du dossier de l'équipe, et l'organisation sont figés. |

### E01-S05 — Organisation « Démo » : script d'outillage rejouable

| Id | Règle |
|---|---|
| N2 | Le compte `E2E_USER_EMAIL` est créé s'il manque, jamais modifié s'il existe (mot de passe, métadonnées) ; le script Démo n'en pose que l'appartenance et la responsabilité dans la Démo. |
| N4 | Ordre des sources de variables des scripts et des tests : environnement du processus, puis `.env.local`, puis `.env` ; les tests passent leurs comptes jetables par l'environnement. |

### E01-S06 — Contenu en blocs, recherche, routage et connecteurs : le schéma

| Id | Règle |
|---|---|
| N3 | `open_draft` et `publish_node` sont `security definer` : sous un appelant, niveaux 2 et 3 contrôlés ; sans appelant (outillage par la connexion d'administration), en confiance, auteur de version nul. |
| N5 | Pas d'abandon de brouillon : un brouillon se termine par sa publication, et `open_draft` efface les blocs `draft` restés sans marque. |
| N7 | `blocks.position` en `double precision` : pas de 1 024, insertion au milieu de ses voisins, renumérotation du brouillon sous un écart de 1e-6. |
| N8 | `key` d'un bloc : 1 à 500 caractères, sans espace de bord ni caractère de contrôle, unique par (nœud, état) ; la clé d'un `row` est obligatoire et ne change pas (`23514`, `blocks_guard`). |
| N9 | `blocks.org_id` est posé par `blocks_guard` depuis le nœud (refusé s'il en diffère) ; `blocks.id` n'est jamais fourni par l'API (privilèges de colonnes). |
| N15 | Genre `context` ⇔ chemin de Contexte, contrôlé par `nodes_guard` à l'insertion et quand le genre ou le chemin change (`23514`) ; une page créée à ce chemin naît `context`. |
| N16 | `check:migrations` admet une contrainte CHECK, ou une clé étrangère, remplacée par une autre du même nom dans la même instruction, sans `if exists` ; la revue vérifie que la nouvelle admet tout ce qu'admettait l'ancienne. |
| N17 | `search_content` est `security definer` : `@@` et `%>` ne sont pas *leakproof* ; la fonction contrôle l'appartenance et applique `node_level_for` aux seuls nœuds trouvés. |
| N21 | Tout index GIN d'une migration est créé en `fastupdate = off`. |
| N25 | Aides de test du contenu : `publishBlocks`, `addRows`, `addActivation` et `rulesVersion` (`tests/helpers/plateforme.ts`). |
| N28 | `update_my_profile(p_org, p_patch)` n'écrit que `name` (80 caractères) et `language` (`fr`, `en`) ; une chaîne vide retire la clé. |
| N30 | `sim_outbox.id` a pour défaut `sim_` suivi de 8 hexadécimaux. |
| N33 | Un déplacement écrit un alias pour le nœud et chacun de ses descendants ; l'ancien chemin reste au nœud qui l'a porté : aucun autre nœud, créé ou déplacé, n'y est admis (`23505`), et le nœud qui y revient échange son alias. |
| N36 | `publish_node` refuse une révision ou un brouillon périmés par le SQLSTATE `PT409`, jamais `40001`, qu'un client rejouerait sans fin ; les services le traduisent en `stale_revision`. |
| N40 | Parité Zod et base au caractère près : `char_length` compte une paire de substitution pour un caractère, `btrim` ne retire que l'espace U+0020, `[[:cntrl:]]` ne couvre que les caractères Cc. |
| N44 | La base admet, par ses chemins JSON `lax`, des formes de blocs que `blockInputSchema` refuse : les services écrivent par ce schéma, et tout lecteur qui rend ou numérote des blocs les valide par `blockInputSchema.safeParse`. |

### E01-S07 — Droits décidés et filtrés dans le code

| Id | Règle |
|---|---|
| HN-E01S07-2 | `Identity.hasOpenGrant` : accès plateforme en cours de l'appelant à l'organisation ; `isOrgAdmin` = rôle `admin`, ou `isStaff` et `hasOpenGrant`, comme `platform.is_org_admin` ; `leadsTeam` lit les équipes de l'identité. |
| HN-E01S07-3 | Par appel de service, les faits de droits des nœuds ou comptes touchés se lisent en un lot (cibles, ancêtres par chemin, règles : trois lectures au plus), sans cache d'une requête à l'autre ; une lecture en échec lève. |
| HN-E01S07-4 | Une décision sur un nœud dont un ancêtre manque à la lecture (parti pendant elle) prend le propriétaire effectif de `platform.node_owner` ; une liste au seuil de la lecture s'en passe. |
| HN-E01S07-5 | `tests/helpers/simulated-db.ts` : le sous-ensemble du client supabase-js sur des tables en mémoire, chaque filtre appliqué, aucune règle d'accès ; un opérateur non couvert lève, jamais ignoré. |
| HN-E01S07-6 | Une écriture qui ne rend aucune ligne après une décision positive est un `conflict` (« … changed meanwhile. Reload … and retry. »), nommé au log serveur, jamais `forbidden` ni `not_found`. |
| HN-E01S07-7 | `listInvitations` sert à l'administrateur toutes les invitations, aux autres celles des équipes qu'ils mènent et celles de leur email ; `revokeInvitation` rend le même `not_found` pour une invitation inconnue, close ou hors de ses droits. |
| HN-E01S07-8 | Une borne de liste s'applique à ce que le service sert : filtre dans la requête, borne dans la requête ; filtre en mémoire, la requête lit l'ensemble candidat et le service coupe après. |
| HN-E01S07-10 | Changer le propriétaire d'un compte exige la gestion sur la ligne d'avant et sur la ligne écrite, et le rendre personnel est réservé à l'administrateur (`accountOwnerChangeAllowed`, `access-levels.ts`). |
| HN-E01S07-13 | Un seul test de parité : les décisions du service sur les nœuds comparées à `node_level_for` sous la même session, à l'égalité stricte ; l'exactitude du calcul pur se prouve sans base. |
| HN-E01S07-16 | Une règle nominative `none` sur un ancêtre ôte au responsable de l'équipe propriétaire sa gestion ; son niveau vient de la règle la plus proche qui le vise, lui ou ses équipes (1 sur `ventes/devis`, 0 sur `ventes`). |
| HN-E01S07-17 | Les faits se lisent dans la seule organisation de l'identité : un nœud ou un compte d'une autre organisation de l'appelant vaut 0 à l'adresse de celle-ci. |
| HN-E01S07-19 | `nodeLevels` n'appelle jamais `node_owner` : un nœud dont un ancêtre manque y est ramené à la lecture ; une décision d'écriture ou de gestion passe par `nodeLevel` ou `requireNodeLevel`, et un service ne décide que par `access.ts`. |
| HN-E01S07-20 | `tests/helpers/reference-org.ts` : O en mémoire, avec P (`OTHER_ORG`), autre organisation de Léa aux chemins de O, dans toute base simulée ; ses noms et équipes redisent `buildReferenceOrg`. |
| HN-E01S07-23 | Plus en vigueur : la face SQL passe chaque liste en un seul paramètre (`= any(…)`), sans borne d'adresse ni tranches. |
| HN-E01S07-24 | La base simulée rend au plus 1 000 lignes par lecture (`SERVER_MAX_ROWS`), comme `max_rows` de PostgREST ; le paquet, sur la face SQL, lit chaque lot en entier, sans pages. |
| HN-E01S07-C2 | Les membres ajoutés par l'équipe plateforme, lus dans `invitations`, ne se lisent et ne se servent qu'aux administrateurs de l'organisation, jamais au reste de l'équipe plateforme. |

### E01-S08 — RLS réduite à l'isolation par organisation

| Id | Règle |
|---|---|
| HN-E01S08-1 | Dans son organisation, une policy d'écriture n'exige que l'appartenance et les invariants ; rôle, niveau et gestion sont décidés par les services, et `platform` n'est pas exposé au Data API. |
| HN-E01S08-3 | `is_staff()` ne sert que la portée plateforme (`platform_staff`, écriture du journal admin, lecture de `platform_grants` et d'`admin_journal`) ; toute écriture dans une organisation passe par l'appartenance (`member_orgs()`). |
| HN-E01S08-5 | Les 19 policies sans droit gardent leur définition d'origine, sauf `nodes_insert_personal`, neutralisée (`false`) ; celles de `blocks`, `node_versions`, `node_aliases` et `links` s'isolent par leur sous-requête sur `nodes`. |
| HN-E01S08-6 | Sans `org_id` : `team_members` suit l'équipe, `node_drafts` le nœud, `node_versions`, `node_aliases` et `links` passent par `nodes` ; une ligne d'`admin_journal` sans organisation n'est lue que du staff ; l'invité lit ses invitations. |
| HN-E01S08-8 | Sous l'isolation, `access-facts.ts` lit toute la chaîne d'un nœud et la parité est stricte ; le repli sur `node_owner` couvre un ancêtre supprimé entre deux lectures. |
| HN-E01S08-9 | Un niveau ou un rôle se prouve par le test du service ; les tests de RLS ne gardent que l'isolation par table, les déclencheurs, les fonctions, les privilèges et les invariants. |
| HN-E01S08-11 | Rattacher une adresse, changer le propriétaire d'un compte, poser une règle `manage`, lire le journal, les invitations et les espaces personnels : décidé par les seuls services, la RLS ne le porte pas. |
| HN-E01S08-13 | Un test statique lit les migrations du paquet comme `check:migrations` (dernière définition d'un nom) : une policy qui remet un droit (niveau, rôle) le fait échouer. |
| HN-E01S08-14 | Aucune sous-requête de policy ne revient sur une table dont Postgres développe déjà les policies (`42P17`) : `nodes_insert_personal` vaut `false`, et `nodes_guard` garde la forme d'un espace personnel. |

### E01-S09 — Portabilité du schéma : une ligne de base installable sur tout Postgres, sans `auth.users` ni `moddatetime`

| Id | Règle |
|---|---|
| HN-E01S09-2 | La ligne de base et les migrations s'appliquent par la CLI Supabase (`supabase db push --db-url`), sur Supabase comme sur Postgres nu ; l'historique est tenu dans `supabase_migrations`. |
| HN-E01S09-3 | Le claim `email` d'une session vaut adresse vérifiée : sur Supabase, par « Confirm email » actif et la connexion d'un email non vérifié coupée ; avec un autre émetteur, le serveur ne le pose qu'après `email_verified`. |
| HN-E01S09-6 | La ligne de base n'accorde au hook d'Auth (`supabase_auth_admin`) son droit que si ce rôle existe (Supabase) ; sur un Postgres nu, rien n'est accordé ; aucun droit n'est accordé à `service_role`. |
| HN-E01S09-9 | `platform_access_directory` lit l'email et le nom dans `platform_staff`, sinon dans `members` de l'organisation, sinon dans la copie posée sur l'accès : un consultant retiré reste nommé dans l'historique. |
| HN-E01S09-14 | `forget_user` supprime tout nœud dont la personne est propriétaire effective, avec ce qui est dessous ; un nœud d'un autre propriétaire explicite rangé sous les siens fait refuser l'oubli (`23503`, chemins nommés). |
| HN-E01S09-21 | La ligne de base ne fait précéder d'aucun `drop … if exists` ses policies et déclencheurs, car elle crée le schéma `platform` ; toute migration qui la suit y reste soumise. |
| HN-E01S09-22 | Un ancien membre sans accès plateforme qui a accordé ou révoqué un accès reste sans nom ni email dans l'historique (identifiant seul) ; les copies de `platform_grants` ne se lisent que par `platform_access_directory`. |

### E01-S10 — Pilote Postgres partout : `server/` parle à la base en SQL, `platform` quitte le Data API

| Id | Règle |
|---|---|
| HN-E01S10-2 | Une transaction par opération de service, jamais une pour toute la requête ; le journal écrit après la réponse garde la sienne. |
| HN-E01S10-3 | `PLATFORM_DATABASE_URL` vise le pooler en mode transaction : postgres.js y tourne sans requêtes préparées (`prepare: false`) ; l'outillage, en connexion directe, les garde. |
| HN-E01S10-5 | Aucune ligne là où une est attendue : le service le compte et lève `not_found` lui-même ; `PT409` de `publish_node` est un SQLSTATE rendu tel quel. |
| HN-E01S10-6 | Chaque transaction de la face SQL pose en local `statement_timeout` (8 s pour `authenticated`, 3 s pour `anon`), `lock_timeout` et `idle_in_transaction_session_timeout` (8 s), mêmes valeurs sur Postgres nu. |
| HN-E01S10-7 | Une transaction imbriquée sous la même session reprend celle qui est ouverte (`AsyncLocalStorage`), sans point de sauvegarde : l'échec d'un service appelé annule toute l'opération. |
| HN-E01S10-9 | `callerName` : `user_metadata.full_name`, sinon `user_metadata.name`, sinon le claim `name` ; l'appelant que l'hôte passe le porte, et `accept_invitations` le recopie dans `members`. |
| HN-E01S10-12 | Les suites portables se connectent en administration par `PLATFORM_ADMIN_DATABASE_URL`, par la même fabrique que `SUPABASE_DB_URL` ; `asCaller` rend la face SQL seule. |
| HN-E01S10-15 | Ce que rejette `db.tx` sort par `fromDatabaseError` : une erreur de la base traduite par son code, un `PlatformError` rendu tel quel, une erreur sans code (`PlatformConfigError`, bogue) relancée. |
| HN-E01S10-b1-7 | `childrenOf` lit les enfants `order by id`, un ordre sans rapport avec le chemin ; seul le tri en mémoire (par `position`, puis `comparePaths` par unités de code) range les enfants servis. |
| HN-E01S10-b1-8 | La session pose `TimeZone = 'UTC'` : une date lue par `to_json` sort en `+00:00` quel que soit le fuseau du serveur, et `day()` sert la date UTC. |
| HN-E01S10-b2-3 | L'ouverture du brouillon (`openDraft`) part en tête de la transaction de l'écriture : un refus qui suit ne laisse aucun brouillon ouvert. |
| HN-E01S10-e1a-3 | Les faits de droits passent chaque liste en un seul paramètre (`= any($1)`) et chaque lecture rend toutes ses lignes : ni tranches ni pages. |
| HN-E01S10-e1a-10 | La parité se joue en lots sur O et P de `seedReferenceOrg`, chaque personne par `asCaller` : `nodeDecisions` contre `node_level_for` sur tous les nœuds, en une transaction. |
| HN-E01S10-e1b1-1 | Une opération des règles tient en une transaction, décisions d'`access.ts` et annuaire compris (un `tx` sous la même session reprend la transaction ouverte), sans entrée-sortie extérieure pendant elle. |
| HN-E01S10-e1b2-1 | Chaque opération des équipes et des membres tient en une transaction, lectures de `directory.ts` comprises, sans entrée-sortie extérieure pendant elle. |
| HN-E01S10-e1b3-9 | La garde « encore ouverte » de l'écriture de `revokeInvitation` n'a pas de preuve propre : la policy `invitations_update_revoke` porte le même invariant ; la décision et la branche du conflit sont prouvées. |
| HN-E01S10-f2e2e-3 | La spec E2E du tableau calcule ses nombres attendus sur l'en-tête et les blocs `row` lus, juste avant chaque vérification, par la connexion d'administration ; aucun n'est écrit en dur. |
| HN-E01S10-t10b-10 | `schema_migrations` n'est pas une table de `platform` : `applied_migrations` lit l'historique réel, et les tests remplacent celui-ci au niveau de `cellStatus`. |
| HN-E01S10-t1b-9 | `draftReads` (`tests/helpers/sql.ts`) relève les lectures de `node_drafts` et des blocs `draft` d'une instruction SQL ; un filtre `state` porté par un fragment n'est pas vu. |
| HN-E01S10-t1c2-3 | Sur base réelle, ce que la base simulée prouvait sur la requête se prouve sur les lignes : filtre d'organisation par des lignes de P lisibles sous l'isolation, « rien n'est écrit » par des comptes relus. |
| HN-E01S10-t1c2-4 | Une lecture en panne ne se provoque pas sur la base partagée : les tests de `context` font rejeter les exports des modules de blocs (`vi.mock`) ; chaque module prouve son propre rejet dans son test. |
| HN-E01S10-t1e1-3 | Ce que la base ne produit pas à la demande (`57014` de `node_owner`, `22023` d'`update_my_profile`) reste injecté par le test. |
| HN-E01S10-t1e2b2-1 | Dans les tests de `find` et du routage, l'espion (`watchDb`, option `rpc`) rend sans requête les lignes de `search_content` et `route_candidates`, dont le classement a ses propres tests. |

### E01-S11 — Émetteur configurable : Supabase Auth, Logto ou Keycloak, par la configuration de l'hôte

| Id | Règle |
|---|---|
| HN-E01S11-1 | Un hôte, un émetteur : `PLATFORM_OIDC_ISSUER` posée choisit un émetteur OpenID Connect ; absente, Supabase Auth, déduit de `NEXT_PUBLIC_SUPABASE_URL`. |
| HN-E01S11-2 | En mode OIDC, l'email vient du jeton, sinon de `userinfo`, et n'entre dans les claims que vérifié (`email_verified`) ; le résultat est gardé jusqu'à l'expiration du jeton. |
| HN-E01S11-3 | En mode OIDC, la plateforme envoie l'email d'invitation elle-même par le relais SMTP de l'hôte (`nodemailer`, `PLATFORM_SMTP_URL`), modèle français à la marque de l'organisation. |
| HN-E01S11-4 | Sur Supabase Auth, l'identifiant interne d'une personne est son `sub` ; sa ligne `identities` naît au premier passage. |
| HN-E01S11-5 | Les tests du mode OIDC utilisent un émetteur de test servi en mémoire, sans service réel ; l'essai avec Logto, Keycloak et les assistants est fait par JB et le responsable d'Oto. |
| HN-E01S11-6 | En mode OIDC, `identity_for_caller()` relie un email vérifié présent dans `platform_staff.email` à l'identifiant de cette ligne ; `pnpm platform:staff add` crée la ligne par email, sans compte Supabase. |
| HN-E01S11a1c-4 | Découverte : forme OpenID Connect, puis, sur un 404, les métadonnées OAuth (RFC 8414) ; l'`issuer` annoncé doit égaler la variable ; gardée une heure, un échec dix secondes, écrit une fois au log. |
| HN-E01S11a1c-5 | `PLATFORM_OIDC_ISSUER` est une adresse `https` sans requête ni fragment (`http` en local seulement), prise telle quelle et comparée exactement à `iss` ; `jwks_uri` et `userinfo_endpoint` suivent la même règle. |
| HN-E01S11b-12 | `oidcEnabled()` choisit pages et routes : `/auth/oidc/*` rendent 404 en mode Supabase, les pages propres à Supabase en mode OIDC ; en mode OIDC, seul le retour de l'émetteur accepte les invitations. |
| HN-E01S11w-13 | `pnpm platform:staff` en mode OIDC : `add` crée la ligne par l'email en minuscules sous un identifiant neuf, ou sous `--user` celui qu'`identities` lie déjà ; `remove` retire les lignes de l'email. |

### E01-S12 — Clôture de la V1

| Id | Règle |
|---|---|
| HN-E01S12c-1 | L'exception de `check:migrations` pour un retrait en deux temps est bornée par fichier et par objet (`TWO_STEP_REMOVALS`, `cli/migrations-check.mjs`) : tout autre retrait reste refusé, et un objet listé que la migration ne retire pas est une erreur (ADR-006 § 2). |
| HN-E01S12c-2 | Restent en base `node_level_of`, `node_level_for`, `level_rank` et `is_org_admin` : la recherche filtre les droits avant la coupe, la lecture publique compte au niveau de l'auteur du lien, l'annuaire des accès plateforme lit `is_org_admin` ; le test de parité ne porte que sur les nœuds, le niveau d'un compte n'a plus de pendant en base. |
| HN-E01S12c-3 | La cible d'un lien se résout dans l'organisation, sans le niveau de qui publie ; le lecteur est filtré à la lecture (`nodes/link-lines.ts`), la lecture publique au niveau de l'auteur du lien. |
| HN-E01S12c-4 | `service_role` n'a aucun privilège sur `platform` ; `supabase_auth_admin` garde le hook d'inscription. |
| HN-E01S12c-11 | Une création « Sans titre » dont le chemin `sans_titre` ou `sans_titre_<n>` est pris par un nœud que l'appelant ne voit pas (corbeille ou invisible) va au premier chemin libre, sans borne, et le résultat le dit (`data.path`) ; tout autre chemin pris reste refusé (`conflict`). |
| HN-E01S12c-12 | La page publique d'un tableau porte `table` : `columns` (nom et type de chaque colonne publiée), `rows` (clé et valeurs des seules colonnes déclarées, triées par clé en ordre binaire, 500 au plus) et `truncated` ; ni preuve, ni provenance, ni réservation, ni ligne en brouillon (fiche D103). |

### E01-S13 — Recherche : fautes de frappe dans le contenu, candidats du routage par index

| Id | Règle |
|---|---|
| HN-E01S13-1 | Un terme de 5 lettres ou plus absent du lexique reçoit le mot le plus ressemblant (`similarity` ≥ 0,3) ; la correction ne sert qu'en dernier recours : termes tels quels (ET), puis chacun OU sa correction, puis l'un d'eux (OU). |
| HN-E01S13-2 | Le lexique garde les mots de surface (`norm_words` en `simple`, sans chiffres, 4 à 40 lettres) ; une suppression ordinaire ne les retire pas, un mot périmé ne rend aucun résultat. |
| HN-E01S13-3 | `find` n'affiche aucune correction : elle révélerait un mot d'un nœud illisible. |
| HN-E01S13-4 | `route_candidates` filtre par `node_level_for`, le même calcul que `search_content` ; le service garde sa décision par `nodeLevels`. |
| HN-E01S13-5 | Présélection de `route_candidates` : un nœud sans lexème commun n'est gardé que si une ressemblance atteint 0,43 (trigrammes du titre et du résumé, titre contenu dans la demande) ; seuils de `pg_trgm` posés par `SET` sur la fonction. |
| HN-E01S13-6 | Le lexique n'est lu et écrit que par des fonctions `security definer` du paquet : les mots d'un nœud privé ne sortent par aucune lecture directe. |
| HN-E01S13-7 | L'extrait d'un bloc est prolongé jusqu'à la fin du bloc quand il en reste au plus 8 mots, dans la borne de 300 caractères ; un fragment introuvable dans le bloc laisse l'extrait inchangé. |
| HN-E01S13-8 | `lexicon` a RLS et une policy de lecture `lexicon_select_none` (`using (false)`) : `authenticated` le lit sans y voir aucune ligne ; aucune écriture n'est accordée, `anon` n'a rien. |
| HN-E01S13-9 | `lexicon.created_at`, date d'entrée d'un mot, est la seule colonne hors de la clé `(org_id, word)` : elle donne à la suite d'isolation une colonne à modifier. |
| HN-E01S13-10 | `route_candidates` ne rend aucune ligne à qui n'est pas membre de l'organisation ; `search_content` le refuse en `42501`. |
| HN-E01S13-13 | Un déclencheur par table (`nodes_lexicon_sync`, `blocks_lexicon_sync`) sert `lexicon_sync()` sur le contenu publié ; chaque insertion prend ses mots `order by word`, `on conflict do nothing` : deux publications s'attendent sans s'interbloquer. |
| HN-E01S13-20 | `forget_user` reconstruit le lexique des organisations des nœuds qu'elle supprime (`lexicon_rebuild`, definer, sans exécution accordée) : les mots privés partent avec la personne. |

### E02-S01 — Identité par l'adresse, connexion web et invitation

| Id | Règle |
|---|---|
| N1 | Le lien d'invitation de Supabase porte `token_hash` (modèles d'email) et n'est vérifié par `verifyOtp` qu'au clic sur `/auth/confirm`, jamais à l'ouverture ; `code` (PKCE) reste pour la réinitialisation et OAuth. |
| N2 | Le lien d'invitation ramène à l'adresse d'où l'on invite, pas à `NEXT_PUBLIC_SITE_URL` ; la liste des adresses de retour de Supabase, sans motif attrape-tout, est un contrôle de sécurité et porte chaque adresse d'organisation. |
| N3 | Les invitations en attente sont acceptées au retour de connexion (callback) et après `loginAction` ; un échec ne bloque pas la connexion. |
| N4 | La page de connexion propose « Recevoir un lien de connexion » (`signInWithOtp`, même réponse pour toute adresse) : il sert l'invitation dont le lien (1 h) a expiré alors qu'elle vit 7 jours. |
| N5 | Pas de refus d'invitation par l'invité : `declined_at` reste sans policy ni service. |
| N8 | `teams.lead_user_id` est la seule source du responsable d'une équipe ; le rôle d'équipe de l'identité (`lead` ou `member`) en est dérivé. |
| N9 | Sans session, l'API répond 401 avec le code `forbidden` ; le statut porte la différence. |
| N12 | `/no-organization` se calcule depuis l'hôte de la requête, sans paramètre d'URL. |
| N17 | `unique_handle` translittère aussi les majuscules accentuées avant `lower()` : sous une ctype `C`, `lower()` ne touche que l'ASCII. |
| N27 | `/auth/confirm` rend le bouton « Continuer » même sans paramètres ; c'est `confirmerLienAction` qui renvoie alors vers `/login?error=auth_callback_error`. |
| N41 | Supabase Auth garde « Confirm email » actif (`mailer_autoconfirm: false`, `enable_confirmations` en local) : sans lui, une inscription à une adresse invitée serait confirmée d'office et acceptée. |

### E02-S02 — Connexion des assistants : ressource OAuth, découverte, consentement

| Id | Règle |
|---|---|
| HN-E02S02-2 | Une organisation non déterminée n'empêche pas le consentement : le jeton n'ouvre rien sans appartenance revérifiée à chaque appel. |
| HN-E02S02-3 | Approuver ou refuser passe par une Server Action de l'hôte, pas par `/api/platform` : la décision exige la session à cookies. |
| HN-E02S02-8 | Les quatre scopes connus ont un libellé français ; un scope inconnu s'affiche tel quel. |
| HN-E02S02-9 | Un non-membre est prévenu à l'écran de consentement, pas bloqué : ses appels à cette organisation seront refusés. |
| HN-E02S02-12 | Seuls `consentRequest` et `consentDecision` rendent les clés françaises de l'écran (`DemandeDeConsentement`), que l'hôte passe telles quelles ; noms de fonctions et de types restent anglais. |
| HN-E02S02-16 | La redirection du middleware prend chemin et requête ; `/login` avec session mène à `redirect` validé par `safeRedirect`, sinon à `/`, sans recopier la requête de `/login`. |
| HN-E02S02-20 | Une demande OAuth tranchée ailleurs ou expirée répond en erreur à la relecture comme à la décision, et la page dit qu'elle ne peut plus être tranchée ; aucun état « déjà autorisé ». |
| HN-E02S02-21 | L'hôte ne monte pas `ConsentementChargement` sur `/oauth/consent` (ni `loading.tsx`, ni `<Suspense>`) : un consentement déjà donné redirige en 307 ; le composant reste exporté. |
| HN-E02S02-27 | Le middleware laisse passer sans session le seul POST de `/oauth/consent` (`CONSENT_PATH`) : la Server Action ramène elle-même à `/login?redirect=<demande>`. |
| HN-E02S02-28 | L'écran de consentement dit la portée du jeton (toute organisation de la personne, le MCP admin pour l'équipe plateforme) et invite le non-membre à refuser ; le MCP admin s'affiche « Administration de la plateforme ». |

### E02-S04 — Page `/connect` et ménage des clients OAuth

| Id | Règle |
|---|---|
| HN-E02S04-1 | Nom de connecteur recommandé = `orgs.name` ; nom du serveur pour Claude Code = `orgs.prefix`. |
| HN-E02S04-2 | Famille d'assistant tirée de la signature `initialize` : `claude-ai` et `Anthropic/*` → « claude.ai », `claude-code` → « Claude Code », `openai-mcp` → « ChatGPT », `?` → « Client non identifié », sinon la partie avant `@`. |
| HN-E02S04-4 | `pnpm oauth:clients purge` est à blanc sans `--yes` (code 1 tant qu'il reste des candidats) ; seuls les clients `dynamic` créés et sans activité depuis N jours sont supprimés, par l'API d'administration d'Auth. |
| HN-E02S04-5 | L'activité d'un client OAuth est la dernière date de ses sessions (création, mise à jour, rafraîchissement), lue par une fonction que seul l'outillage exécute : aucune API d'administration ne la donne. |
| HN-E02S04-6 | Les guides de `/connect` ne nomment des menus de claude.ai et ChatGPT que ce que les bancs ont mesuré (« Paramètres → Connecteurs », « menu ⋯ », « Actualiser »). |

### E03-S01 — Face `mcp/` : route, jeton, liste d'outils, `ctx`, journal, résultats, catalogue

| Id | Règle |
|---|---|
| N1 | Adresse inconnue : le jeton est vérifié d'abord (401 sans jeton), puis 404 JSON-RPC `-32001` « No organisation is served at <hôte>. » sous jeton valide ; aucune clé de service ne résout l'organisation avant le jeton. |
| N2 | Les refus d'un non-membre ne sont pas journalisés : la porte rend son refus sans ligne, le journal n'admettant que les membres de l'organisation. |
| N3 | `ctx.host` est la signature du dernier `initialize` journalisé de la même personne au même agent utilisateur (membre : journal de son organisation ; équipe plateforme : `admin_journal`) ; les appels sous ce `ctx` en héritent. |
| N4 | `journal.error` s'écrit `<code>: <message>`, coupé à 500 caractères (`journalError`) aux deux portes, jamais au milieu d'une paire de substitution. |
| N5 | Au journal, toute valeur dont la clé contient `secret`, `token`, `passw`, `authorization`, `apikey` ou `privatekey` (sans casse, sans `-` ni `_`) est masquée ; une clé `key` seule ne l'est pas (clé métier des lignes). |
| N6 | `settings.domains` est une chaîne libre en anglais ; un tableau de chaînes est joint par « , » ; absent ou vide, la description de `context` n'a pas de domaines. |
| N7 | Les instructions du serveur MCP tiennent en une phrase qui porte aussi la borne (« for any request about {org}'s work ») : claude.ai ne montre jamais les instructions. |
| N10 | Aucun module de `mcp/` ne lit l'environnement à l'import : JWKS et émetteur se lisent à la première vérification. |
| N11 | Les arguments d'un appel sont plafonnés à 1 000 000 caractères (`MAX_ARGS_CHARS`), refusés avant tout traitement. |
| N12 | Les schémas que le MCP compose (`mcp/schemas.ts`, `schemas/nodes.ts`, `schemas/ctx.ts`…) s'écrivent en `zod/v4` : un schéma v3 ne s'imbrique pas dans un objet v4, et `z.toJSONSchema` n'existe qu'en v4. |
| N13 | Un `ctx` émis sur une autre organisation de la même personne est refusé comme inconnu (`ctx_missing`), pas comme périmé. |
| N14 | Dans les descriptions des outils, le nom affiché est coupé à 60 caractères et les domaines à 100, pour tenir sous 1 000 caractères. |
| N15 | Exemples de `call` : la première fonction non sensible, par nom, de deux connecteurs actifs au plus, puis `table.rows` s'il est actif ; trois noms au plus, jamais une fonction de l'ERP. |
| N16 | Le type `ToolOutput` vit dans `server/tool-output.ts` : les services de `server/` n'importent pas `mcp/` (architecture § 3). |
| N17 | Le formateur coupe à la dernière fin de ligne qui tient ; une première ligne plus longue que le plafond à elle seule est coupée au caractère, jamais dans une paire de substitution. |
| N19 | Jeton sans email : le refus du non-membre le nomme « user <sub> », et ce libellé sert de nom de repli à un membre sans nom ni email (bloc personne, annuaire). |
| N21 | `prompts/get` d'un nom inconnu : erreur JSON-RPC -32602 qui porte le message seul, journalisée `not_found: Unknown prompt <nom>.`. |
| N22 | Ce que le host envoie est borné à 200 caractères avant le journal ou un message : nom d'outil, nom de prompt, signature `client_name@version`, fonction demandée par `call`. |
| N23 | Toute panne, `internal` nommé compris, est servie au modèle par « Internal error. Retry once, then report it with <p>_feedback (type error). » (-32603 « Internal error. » pour `prompts/*`) ; le détail reste au log serveur. |
| N29 | Le masquage du journal descend de six niveaux, un par objet ou tableau traversé (`MASK_DEPTH`) ; au-delà, la valeur est gardée telle quelle et le parcours reste borné. |
| N30 | Un refus `invalid_arguments` liste les 20 premiers problèmes (`chemin: message`, séparés par « ; ») puis « … and <k> more » ; `formatError` coupe tout refus au-delà de 45 000 caractères, avec « [Message cut at 45,000 characters.] ». |
| N31 | Aucune chaîne du journal ni aucun nom servi au host ne porte une moitié de paire de substitution : toute coupe passe par `clip`, et ce que le host envoie est rendu bien formé (U+FFFD). |

### E03-S02 — Routage lexical et `find`

| Id | Règle |
|---|---|
| N1 | Une phrase est une question de données si, rognée, elle finit par « ? » ou commence par un interrogatif (`INTERROGATIVE` de `server/routing.ts`) suivi d'une frontière de mot ; « est-ce qu' » compte, apostrophe typographique comprise ; une phrase ouverte par « comment » ou par une formule de demande n'en est pas une (`requestKind`, HN-E11S04-12). |
| N2 | Un bloc de `context` peut porter un `fallback` : il n'est jamais coupé, son `fallback` le remplace s'il ne tient pas, et l'assemblage continue ; la procédure servie y met un pointeur vers `read`. |
| N3 | `orgs.settings.routing` se lit clé par clé : une valeur absente, non numérique ou hors de [0, 1] reprend son défaut (seuil 0,65 ; écart 0,1). |
| N4 | La phrase reprise dans la ligne du routage est coupée à 200 caractères (`MAX_TARGET_CHARS`), comme la cible du journal. |
| N5 | Bonus d'usage d'une procédure : une ligne de journal de la personne dans l'organisation dont `target` vaut son chemin, sur 30 jours (lecture ou procédure servie). |
| N6 | `find` rend « No match » comme un résultat, pas une erreur, avec la consigne de faire reformuler. |
| N8 | Les données de test d'Acme sont une copie de la maquette dans `tests/integration/fixtures/`, jamais une lecture du dépôt `mcp-test`. |
| N9 | Données d'Acme en blocs : étapes en `list` `ordered`, appels en blocs `call` après l'étape qui les annonce (`start` reprend la numérotation), lignes de tableau en blocs `row`, guide et règles d'équipe versés aux Contextes. |
| N10 | Données d'Acme : chaque résumé de procédure est suivi de deux anciennes déclencheuses (200 caractères au plus) ; les autres deviennent des paraphrases, les voisines des négatives ; le taux des paraphrases est rapporté, sans seuil. |
| N11 | `find` demande 50 lignes à `search_content` et les regroupe par nœud : trois nœuds au plus, dans l'ordre de leur première ligne, chacun avec ses emplacements dans l'ordre des lignes (trois blocs au plus). |
| N12 | `find` de `type: "page"` cherche les pages et les Contextes (`p_kinds` = `page`, `context`) : l'énumération figée de `find` n'a pas de valeur `context`. |
| N13 | `find` sert trois nœuds avec leurs emplacements et trois fonctions au plus, sous sa description figée ; le score d'un nœud est son meilleur rang divisé par 3, dans [0, 1] comme celui des fonctions. |
| N14 | `find` ne dit pas « The best match is weak » : le rang de `search_content` classe des emplacements sans mesurer une confiance ; le seuil de l'organisation ne sert que le routage de `context`. |
| N15 | Une liste coupée de `find` le dit : « More nodes match (at least <n>) … » quand d'autres nœuds ont été vus, « At most 3 rows per table are shown … » quand une ligne de tableau est montrée. |
| N16 | Un extrait de `find` tient sur une ligne (blancs et sauts de ligne réduits à une espace) ; titre et résumé sont remplacés par leur extrait quand la correspondance y est. |
| N17 | Pannes : `search_content` en erreur → `internal` pour `find` ; dans `context`, routage en panne → aucune étape et « no procedure could be matched right now », réglage illisible → défauts, bonus illisible → aucun ; `context` répond. |
| N18 | `rankCandidates` ne route que les procédures (`p_kind: "procedure"` de `route_candidates`), sans genre en paramètre. |
| N19 | Le bloc procédure sert les blocs publiés rangés par `orderBlocks` et rendus par `renderBlocks(…, { headingBase: 3 })`, un niveau de titre sous `read` ; un bloc `reference` y est la ligne résolue pour la personne. |
| N20 | `seedNodes` est une méthode de `createFixtures()` (`tests/helpers/plateforme.ts`), composée de `createNode`, `publishBlocks` et `addRows`. |
| N22 | `rankCandidates` et `find` calculent en un lot (`nodeLevels`) le niveau des nœuds que rendent `route_candidates` et `search_content`, et retirent ceux de niveau 0 avant le mélange, le regroupement et les bornes. |
| N30 | Une procédure décidée mais illisible, ou disparue depuis le routage, n'est pas servie : `context` répond comme un routage en panne (ni étape ni candidat, « no procedure could be matched right now »), la panne au log serveur. |
| N31 | L'extrait d'un bloc (fragment `ts_headline`, qui ne finit jamais sur un nombre) est prolongé jusqu'à la fin du bloc quand il n'en reste que huit mots au plus : « participant supplémentaire » rend « … 250 € HT. ». |
| N32 | Le bonus d'usage lit les `READ_PAGE_ROWS` (1 000) cibles les plus récentes des 30 jours ; la procédure servie lit une page de blocs publiés, et une page pleine ne sert que le pointeur vers `read`, jamais une procédure en partie. |

### E03-S03 — `read` et `write` des pages : blocs rendus en markdown, plan, section, révisions, brouillon, références, opérations par section et par bloc, publication

| Id | Règle |
|---|---|
| N1 | `read` sert la page entière jusqu'à 12 000 caractères rendus, au-delà le début de page puis le plan ; une page sans titre est servie entière ; au-delà de 45 000 caractères, elle se sert par parties avec `cursor`. |
| N2 | Le plafond d'un résultat se mesure sur `structuredContent` sérialisé ; les champs ne répètent jamais un texte de bloc ; le plan en champs est borné à 100 titres. |
| N3 | Un curseur est opaque et lié au nœud, à la requête (mode, section, `draft`, `refs`, `since_revision`), à la partie et à l'empreinte du texte complet ; autre chose → `invalid_arguments`. |
| N5 | Enfants d'un nœud : 50 au plus, rangés par `position` puis par chemin (une position nulle se range par chemin), comptés après le filtre de visibilité. |
| N6 | Bornes contrôlées par le service : texte d'une opération ≤ 40 000 caractères, 50 opérations par appel, section ≤ 100 000, page ≤ 300 000 et ≤ 1 000 blocs ; un dépassement est refusé en chiffrant, jamais tronqué. |
| N7 | Formes canoniques du markdown par type, dont `parseMarkdown` est l'inverse : légende d'image en titre du lien, encart `> [!TON]`, `reference` en clôture ```` ```reference ````, suite de liste indentée de deux espaces ; `headingBase` 2 dans `read`. |
| N8 | L'analyse lit la syntaxe du rendu : clôture non fermée, ligne `#` et plus de trois niveaux refusés ; une liste à puces, ou numérotée depuis 1, interrompt un paragraphe ; une ligne faite d'un seul commentaire `<!-- … -->` hors clôture est ignorée. |
| N9 | Une section est un titre et ses blocs jusqu'au prochain titre de niveau inférieur ou égal, sous-sections comprises et annoncées quand elles partent ; le texte d'une opération par section ne porte aucun titre de ce niveau ou plus haut. |
| N10 | Titres homonymes : `read` sert toutes les sections qui répondent ; `write` refuse en donnant leurs références ; `add_section` refuse un titre existant. |
| N11 | Un texte qui rouvre le titre de sa propre section (même niveau, même titre) le voit absorbé. |
| N12 | Identifiants gardés sans deviner : une opération par bloc garde l'id du bloc visé, `replace_text` celui du bloc édité, `replace_section` apparie exactement dans l'ordre ; un bloc réécrit par `replace_section` prend un id neuf. |
| N13 | Référence d'un bloc : sa clé, sinon les 8 premiers caractères de son id, sinon l'id complet ; résolue par la clé exacte, puis par un début d'id (tirets ignorés) d'au moins 8 caractères qui désigne un seul bloc. |
| N14 | `refs: true` rend une ligne `<!-- ref: … -->` avant chaque bloc ; l'analyse l'ignore, et les tailles comme le seuil de 12 000 se mesurent sans elle. |
| N15 | Opérations par bloc : `replace_block` (le premier bloc du texte prend la place), `insert_after` (en tête sans `block`), `delete_block` (un titre seul part, ses blocs rejoignent la section précédente), `move_block`. |
| N16 | Le contrat de `write` s'étend dans `ops` par ajout seulement : quatre valeurs d'`op` en fin d'énumération, `block` et `after_block` facultatifs, `section` exigé par le service ; aucune borne du service dans le schéma. |
| N17 | Un champ qu'une opération n'utilise pas est refusé en le nommant. |
| N18 | L'écriture d'un brouillon (`open_draft` au besoin, en-tête, mises à jour, insertions, suppressions) tient en une transaction : arrêtée au milieu, elle n'écrit rien ; la publication est atomique. |
| N19 | Le brouillon s'ouvre à la première écriture qui enregistre quelque chose et se partage ; concurrence au bloc (`revision`) et sur l'en-tête (`node_drafts.updated_at`) : deux blocs différents s'écrivent en même temps. |
| N20 | Provenance d'un bloc écrit : `{origin: "agent", by, ctx, at}` par le MCP, `{origin: "human", by, at}` par l'API ; révision + 1 quand type, texte, données ou clé changent, inchangée sur un déplacement seul. |
| N21 | Tout texte écrit en base est rendu bien formé (`toWellFormed`) : aucune moitié de paire de substitution. |
| N22 | Publication en trois temps (préparer, `publish_node`, dériver), avec des branches explicites par genre. |
| N23 | Les liens `[[…]]` (syntaxe de `schemas/link-syntax.ts`) sont extraits par le service des blocs de texte humain et des blocs `reference`, jamais du code, et passés à `publish_node` : 1 000 au plus, omis pour un tableau. |
| N24 | L'écart depuis une révision se donne au bloc : ajoutés, changés, déplacés (hors de la plus longue suite ordonnée), supprimés, groupés par section. |
| N26 | `page` ↔ `procedure` se change au brouillon et s'applique à la publication ; `table` et `context` ne changent jamais de genre. |
| N27 | Un tableau n'a pas de blocs de document : ses lignes ne passent jamais par le brouillon et `ops` y est refusé ; son en-tête passe par `header` (`readHeaderPatch`). |
| N28 | Un refus de publication garde le brouillon et rend `isError` avec son code ; `write` publie par défaut, `publish: false` garde un brouillon ; le refus d'une procédure finit par « Writing it in several calls? Pass publish: false until the last one. » |
| N29 | `perso/<handle>` et son Contexte naissent en base ; `write` n'en crée jamais et refuse un `perso/<x>` qui n'est pas celui de l'appelant. |
| N31 | Créer sur un chemin occupé par un nœud invisible rend `conflict` « not available », sans dire qu'il existe. |
| N32 | Arbre des écrans : nœuds de niveau calculé ≥ 1 (un lot), brouillons compris, rangés par `position` puis par chemin, rattachés à l'ancêtre visible le plus proche, 5 000 au plus après ce filtre. |
| N35 | Le brouillon n'est servi qu'à partir du niveau écriture, décidé par le service avant de le lire. |
| N36 | `MAX_RESULT_CHARS` et `MAX_DATA_CHARS` vivent dans `server/tool-output.ts`, réexportées par `mcp/result.ts`. |
| N40 | `writeNode` valide son entrée par `writeNodeBodySchema`, même pour le MCP qui l'a déjà validée par son sous-ensemble : une seule source pour les deux portes. |
| N41 | Codes de la base : `23503` visant le nœud désigné → `not_found`, `55000` → `invalid_arguments`, `P0002` → `not_found`, `PT409` → `stale_revision` ; un brouillon perdu par une publication concurrente rend `stale_revision`, jamais `forbidden`. |
| N42 | La vue d'un bloc `reference` n'est contrôlée à l'écriture que comme un objet JSON ; sa forme appartient à `schemas/tables.ts`. |
| N43 | Rendu, sections et emplacement d'un `call` viennent de `schemas/blocks-render.ts` (`orderBlocks`, `renderBlocks`, `splitSections`, `findSections`, `sectionOfBlock`, `callLocation`…), consommés sans réécriture par `server/` et `ui/`. |
| N44 | Une clôture indentée sous un élément de liste coupe la liste et devient son propre bloc, la liste reprenant à `start` = le numéro écrit ; une clôture ```` ```call ```` réduite au nom vaut `args` `{}` ; mal formée, elle est refusée. |
| N45 | Le corps de l'API (`writeNodeBodySchema`) étend l'entrée de `write` : bloc structuré `input`, `revision` lue du bloc visé (écart → `stale_revision`), `draft_stamp` ; jamais servis au modèle ; la réponse rend id, référence et révision. |
| N46 | Chaque écriture de bloc `draft` exige la ligne `node_drafts` (verrou, sinon `PT409`) et avance `node_drafts.updated_at` ; `publishNode` lit ce tampon avant ses contrôles et le passe en `p_draft_stamp` (`PT409` → `stale_revision`). |
| N47 | `findNode` lit le nœud par chemin dans l'organisation, calcule son niveau, rend `null` au niveau 0 et sinon ce `level`, réutilisé sans second calcul ; écriture et publication se décident avant toute écriture, `23505` en seconde barrière. |
| N48 | Les hypothèses sur PostgREST vivent dans `server/errors.ts` seul : `PT409` → `stale_revision` (message constant) et la taille de page `READ_PAGE_ROWS` (1 000) ; la face SQL lit blocs, enfants et arbre en une requête. |
| N49 | `writeNodeBodySchema` vit dans `schemas/node-body.ts`, exporté par `schemas/index.ts` : dans `nodes.ts`, il fermerait un cycle d'imports avec `blocks.ts` ; les types de lecture restent dans `nodes.ts`. |
| N52 | Une ligne `##` sans texte ou `#mot` sans espace est du texte ; une ligne de titre refusée interrompt un paragraphe ; une image seule sur sa ligne devient un bloc `image` (`alt` toujours posé) ; un refus cite la ligne du texte envoyé. |
| N56 | Un parent que le lecteur ne voit pas (niveau 0) est servi `parent: none` (`null` en champ) : son titre serait une fuite. |
| N59 | Blocs, enfants et arbre sont rangés en mémoire (blocs par position puis id, chemins en unités de code par `comparePaths`) : l'ordre ne dépend pas de la collation de la base de l'hôte. |
| N60 | `closestExisting` retient l'ancêtre visible le plus profond par son nombre de segments (racine à 0). |
| N65 | Plus en vigueur : les alias dépréciés `sectionOpSchema` et `SectionOp` ont été retirés ; seuls `writeOpSchema` et `WriteOp` restent. |
| N70 | Tout ce qui lit un texte du client est linéaire ; le code en ligne suit CommonMark (une suite d'accents graves fermée par la suivante de même longueur) ; une ligne qui porte U+2028 ou U+2029 n'est ni titre, ni image, ni clôture ouvrante. |
| N71 | Une suppression de blocs qui ne rend pas chaque bloc demandé, ou un brouillon absent à la relecture de fin d'écriture, est un conflit : `publishedMeanwhile` si la révision a avancé, sinon le conflit de bloc ou de brouillon. |
| N72 | Plus en vigueur : l'écriture du brouillon tient en une transaction, annulée entière sur un refus ou une panne ; aucune écriture partielle n'est plus dite. |
| N74 | `findNode` et `lookupNode` refusent un chemin mal formé ou de plus de 1 000 caractères avant toute requête (`invalid_arguments`, refus de chemin de `read`). |
| N75 | Un conflit d'écriture du brouillon est journalisé avant le refus : `[platform] nodes: draft of <id> changed while writing (<header\|block\|draft>)`. |
| N76 | Tout refus `stale_revision` d'un nœud porte `details.revision`, la révision relue du nœud. |
| N78 | Les bornes d'un bloc (titre 200, liste 500, fonction 100, image 2 000, chemin 1 000) sont déclarées dans `limits.ts` et chaque refus écrit ses nombres depuis ces constantes ; `blockInputSchema` les juge aussi. |

### E03-S04 — `call` : droits, équipe porteuse, compte, confirmation en deux temps, compte-rendu

| Id | Règle |
|---|---|
| N1 | Le récapitulatif d'une fonction sensible appelée sans `confirm` est un résultat ordinaire (`status: "needs_confirmation"` dans les données), pas une erreur ; rien n'est exécuté. |
| N2 | `confirm: true` sur une fonction non sensible est ignoré. |
| N3 | `next_actions` retire les fonctions sensibles, inactives pour l'organisation ou absentes du catalogue : aucune suite ne mène à une impasse. |
| N4 | Le compte-rendu d'une fonction avec compte finit par « Team X · account « Y » (mode). » (« No team » sans équipe porteuse) ; une fonction native ou ERP ne le porte pas. |
| N5 | En V1, un compte non simulé rend `unavailable_in_v1` avant tout appel de la fonction (`requireSimulated`). |
| N6 | Le nom de fonction est normalisé (espaces de bord retirés, minuscules) avant la recherche. |
| N7 | La cible au journal d'un `call` est la fonction demandée, refus compris ; `team_id` et `account_id` restent nuls quand le refus précède leur choix. |
| N8 | L'équipe que rend la fonction (`teamId` de `FunctionOutput`) prime sur l'équipe calculée pour la ligne de journal : `table.*` rend celle du tableau chargé, alias compris. |
| N9 | Le code `ctx` de l'appel passe dans le contexte d'exécution (`FunctionContext.ctx`) : une écriture faite par un assistant le porte dans sa provenance. |
| N10 | `CallInput` est déclaré dans `server/calls.ts`, car `server/` n'importe pas `mcp/` ; un test de types exige son égalité avec le schéma de `call` sans `ctx`. |
| N19 | Cible au journal de `call` : sur un succès, le nom canonique de la fonction ; sur un refus, la fonction envoyée, sans espace de bord, coupée à 200 caractères, posée par la porte avant ses gardes. |

### E03-S05 — `feedback` et prompts des procédures

| Id | Règle |
|---|---|
| N1 | Un signalement en doublon (même personne, organisation, type, texte et cible, absente des deux côtés comprise, dans les 10 minutes) ne crée pas de ticket : le ticket existant est rendu et le résultat le dit. |
| N3 | Nom d'un prompt : le dernier segment du chemin ; sur collision entre prompts visibles, le chemin entier avec `_` à la place de `/` ; 64 caractères au plus. |
| N4 | Le message d'un prompt est le titre de la procédure ; un nom hors des 20 prompts listés est inconnu, comme un nom invisible. |
| N5 | Un non-membre reçoit une liste de prompts vide, et un prompt invisible est « inconnu ». |
| N6 | Le doublon d'un signalement se cherche parmi les 50 tickets les plus récents de la personne, même organisation, type et cible, de moins de 10 minutes ; le texte se compare dans le service, pas dans le filtre. |
| N7 | Un nom de prompt encore pris après le chemin entier et la coupe à 64 caractères reçoit `_2`, `_3`… dans l'ordre des chemins, la base recoupée pour tenir en 64. |
| N8 | Texte et cible d'un signalement sont rendus bien formés (`toWellFormed`) avant la recherche et l'insertion : une moitié de paire de substitution devient U+FFFD. |
| N12 | Aucune constante n'est exportée sans lecteur : `FEEDBACK_TYPES`, `DUPLICATE_WINDOW_MINUTES` et `PROMPTS_MAX` restent internes à leur fichier ; les faces lisent `feedbackTypeSchema`. |
| N16 | `ProcedurePrompt` = `{ name, title, description }`, sans chemin ni nœud tant qu'aucun lecteur ne les demande. |

### E03-S06 — Procédures : blocs `call`, contrôle à la publication, contrat `write.procedure`

| Id | Règle |
|---|---|
| N1 | Le contrôle d'une procédure lit ses blocs (types `call` et `code`, et les lignes ```` ```call ```` que rend un bloc), jamais le markdown ; la clôture ```` ```call ```` n'est que la forme markdown d'un bloc `call`. |
| N3 | Un bloc `code` de langage `call` (rogné, sans casse) est refusé à la publication d'une procédure (R2) : `renderBlocks` l'écrirait comme un appel jamais contrôlé. |
| N5 | Le refus d'une publication donne tous les problèmes d'un coup (20 listés, le reste compté) et `details.refusals` complet, avec l'`id` du bloc fautif. |
| N6 | La borne de 8 000 caractères d'une procédure se mesure sur `renderBlocks` (options par défaut) de ses blocs, sans titre ni résumé. |
| N8 | `checkProcedure` contrôle le brouillon quand le niveau calculé vaut au moins 2, sinon les blocs publiés ; `listProcedures` liste les nœuds de genre `procedure` de niveau ≥ 1, une page au genre en attente n'y entrant qu'à sa publication. |
| N9 | `publishNode` lit le tampon du brouillon (`node_drafts.updated_at`) avant ses blocs, pour tout genre, et le passe en `p_draft_stamp` : un brouillon changé pendant le contrôle rend `stale_revision`, et rien n'est publié. |
| N10 | Un espace réservé est une valeur chaîne entière `^<[^<>]+>$`, à tout niveau ; sa clé est contrôlée, sa valeur non ; `isPlaceholderValue` (`schemas/procedures.ts`) en est la seule définition. |
| N11 | `confirm`, `team`, `account`, `ctx`, `function` ou `arguments` écrits dans les arguments d'un bloc `call` : refus R9 avec l'indice. |
| N12 | Le bloc procédure de `context` dit comment recopier un bloc `call` en appel de `<p>_call`, chaque valeur `<…>` remplacée par la vraie. |
| N14 | Le contrat `write.procedure` ne porte pas de schéma d'en-tête : il décrit la forme d'une procédure, les deux façons d'écrire un bloc `call` et les refus ; seul `write.table` a un « Header (JSON Schema): ». |
| N15 | Les types des refus et de la liste des procédures, et `isPlaceholderValue`, vivent dans `schemas/procedures.ts`, sans schéma Zod, lisibles par `ui/` qui n'importe pas `server/`. |
| N17 | R2 vaut pour toute clôture `call` : un bloc `code` dont la ligne d'ouverture rendue ouvre une clôture `call`, et tout texte rendu tel quel dont une ligne rognée en ouvre une (accents graves ou tildes, puis `call` ; `callout` exclu). |

### E03-S07 — Liens `[[…]]`, alias après déplacement, blocs de référence

| Id | Règle |
|---|---|
| N2 | Les liens s'extraient à la publication sous les droits du publieur et se relisent pour le lecteur : chemin, puis alias, puis bloc visé ; cible invisible = sans cible ; `[[chemin#clé]]` se résout comme une référence courte. |
| N4 | Le bloc `reference` compte comme lien sortant (chemin sans clé) ; sa ligne résolue donne titre, résumé et chemin, et pour une vue l'appel exact de `table.rows` ; une cible absente est signalée, jamais refusée. |
| N5 | Un déplacement est une seule mise à jour du nœud : la base réécrit le sous-arbre et inscrit les alias ; la réponse ne nomme que les nœuds visibles ; `40P01` est rejoué une fois ; 0 ligne → `stale_revision`. |
| N6 | Destination libre : ni nœud ni ancien chemin d'un autre nœud, visibles ou non ; `guide`, `perso`, `perso/<handle>`, un Contexte et son dossier ne se déplacent pas ; refus `conflict` « Path … is not available: choose another path. ». |
| N7 | Déplacer un nœud dans un espace personnel n'est pas réservé à l'administrateur : la gestion sur le nœud et l'écriture sur la destination suffisent. |
| N8 | Les anciens chemins se résolvent en un point (`findNode`) pour `read`, `write` et l'argument `table` : première ligne « X moved to Y on AAAA-MM-JJ: use the new path. », journal sur le chemin courant, `write` modifie le nœud déplacé. |
| N10 | En-tête de `read` : 20 liens entrants et 20 sortants au plus, totaux donnés, entrants comptés par source visible du lecteur ; `references` bornées à 50 dans les données. |
| N11 | Droits des liens et du déplacement dans le service : niveaux en un lot, niveau 0 = sans cible, entrants filtrés avant la borne de 20 ; `moveNode` décide gestion et écriture sur la destination avant la mise à jour. |
| N15 | Refus de la base après une décision qui passe : le code part au log serveur, les contrôles du déplacement sont rejoués ; sinon `23505` → `conflict`, `42501` → refus sans nom, `23514`/`23503` → « the tree refuses this place », le reste `internal`. |
| N17 | Rien ne se crée ni ne se pose sous un ancien chemin : `write` et le déplacement refusent (`invalid_arguments`) en donnant le chemin à suivre ; l'ancien chemin d'un nœud invisible reste « does not exist ». |
| N24 | `read` lit les liens sortants et entrants en une requête par étape, en parallèle de l'en-tête ; les blocs `reference` reprennent les cibles déjà relues ; les liens vers un ancien chemin ne se lisent que pour un nœud qui en a. |
| N25 | `42501` après une décision de déplacement qui passe encore : `forbidden` « Cannot move X to Y: the access rules of <org> refuse it there. Choose another path. », qui ne renvoie vers personne. |

### E03-S08 — `context` complet : Contextes, nouveautés, procédures utiles, documents récents

| Id | Règle |
|---|---|
| N1 | La borne des nouveautés est le dernier `ctx` de la personne dans cette organisation, sinon maintenant − 14 jours. |
| N2 | Une activation compte comme nouveauté à sa date de dernière mise à jour à l'état actif (`updated_at`, sinon `created_at`). |
| N3 | L'usage des procédures utiles compte les lignes de journal de la personne et des équipes qu'elle mène (toutes ses équipes si elle administre l'organisation), choisies par la requête du service ; un simple membre ne compte que les siennes. |
| N4 | Documents récents : pages et tableaux visibles, hors racine, que la personne a lus ou écrits au journal, dont elle a écrit des blocs ou qu'elle a publiés, sur 90 jours ; procédures et Contextes exclus. |
| N6 | Plus en vigueur (E11-S03, fiche D134) : plus de taille nominale ni de coupe par bloc ; chaque bloc est servi entier sous le plafond de `context` (H30) ; un bloc coupé par le plafond ou arrêté par une borne en lignes est rapporté `cut`. |
| N8 | L'aperçu du contexte rend la même première ligne « ctx: XXXX-XXXX » qu'un vrai `context`, pour que les tailles soient les mêmes. |
| N9 | Bloc d'un Contexte : « ## Context: … », ses blocs publiés rendus un niveau sous `read`, puis « Pages and tables here: » et « Linked pages: » (cibles publiées et lisibles, sans doublon), jamais leur corps ; coupé, il finit par un pointeur vers `read`. |
| N10 | Contextes servis : Tout le monde, Perso si le profil a un `handle`, puis chaque équipe de l'identité, celle par défaut d'abord, les autres par nom. |
| N13 | Pannes de `context` : un Contexte illisible devient son en-tête et un pointeur vers `read`, un bloc dynamique illisible est omis ; `context` répond toujours, pour que le `ctx` serve les autres outils. |
| N14 | L'aperçu est calculé par la page d'aperçu du contexte (formulaire GET) via `previewContext`, sans route d'API ; son rapport par bloc donne le chemin du nœud Contexte d'où vient le bloc (`null` pour les autres blocs). |
| N20 | Un Contexte coupé à sa taille, ou dont une liste s'arrête à 20 lignes, finit par le pointeur « Rest of this context: <p>_read {"path": "<chemin>"}. » et compte `cut`. |

### E04-S01 — Connecteurs V1 : activation, comptes simulés, équipe porteuse, résolution du compte, `mail` simulé

| Id | Règle |
|---|---|
| N1 | Quand l'argument, le tableau et la dernière procédure ne décident pas, l'équipe par défaut porte l'appel si elle le peut, sinon la seule autre qui le peut ; plusieurs → `ambiguous_team` ; une fonction sans compte n'est jamais ambiguë. |
| N2 | `team` désigne une équipe de la personne, par slug ou par nom (sans casse ni accent) ; sinon `not_found` qui liste ses équipes. |
| N3 | `account` désigne un compte visible du connecteur par libellé (sans casse ni accent) ou identifiant ; libellé partagé → `ambiguous_account`, niveau insuffisant → `forbidden`, désactivé → `not_enabled` ; jamais de repli. |
| N5 | Pas de choix silencieux entre comptes : deux comptes utilisables à la même étape → `ambiguous_account`, qui demande `account`. |
| N6 | Aucun compte visible → `not_enabled` avec le lien `<origin>/admin/connectors` ; comptes visibles sous le niveau exigé → `forbidden`, qui dit à qui demander. |
| N7 | Un compte `disabled` ou `error` n'est jamais résolu. |
| N8 | Ligne d'un connecteur dans le bloc `team` : équipe, `(write)` pour ce que la personne peut faire, compte et mode (`simulated`, `sandbox`, `live`). |
| N9 | Les connecteurs actifs se relisent à chaque requête (`tools/list`, `find`, `call`, `context`, `read`), sans cache : une activation vaut dès la requête suivante. |
| N10 | `mail.send_draft` envoie depuis le compte résolu ; un brouillon d'un autre compte ou déjà envoyé → `conflict` qui donne l'appel correct. |
| N11 | Dernière procédure : lue au journal du `ctx` (lignes `<p>_context` et `<p>_read` réussies de la personne, cible = procédure visible), la plus récente d'abord ; une ligne pas encore écrite n'est pas vue. |
| N12 | Libellé d'un compte : 1 à 80 caractères, unique sans casse dans l'organisation, tous connecteurs confondus (index `accounts (org_id, lower(label))`) ; le `23505` devient `conflict` ; un connecteur inactif admet un compte. |
| N13 | Désactiver un connecteur arrête aussitôt ses fonctions et garde ses comptes, qui reviennent à la réactivation. |
| N14 | Brouillon simulé : identifiant `sim_` + 8 hex, `subject` ≤ 200, `body` ≤ 20 000, un seul destinataire ; le récapitulatif garde les 300 premiers caractères du corps. |
| N15 | Un compte personnel n'est créé que par son propriétaire, administrateur compris : aucun champ ne désigne une autre personne. |
| N16 | L'endroit (tableau, dernière procédure d'une équipe) donne l'équipe propriétaire effective qui porte l'appel, même si la personne n'en est pas membre ; un propriétaire d'organisation ou personnel ne décide pas. |
| N17 | Sans équipe, le bloc `team` dit « No team. » puis les lignes des connecteurs actifs (compte de l'organisation et son mode). |
| N18 | Date d'activation = dernière mise à jour de la ligne active ; activer un connecteur déjà actif n'écrit rien ; désactiver ne touche pas `activated_by` ; un connecteur inactif se lit sans date ni auteur. |
| N19 | `createAccount` pour une équipe inconnue de l'organisation → `invalid_arguments` « Unknown team <id> in <org>. ». |
| N20 | Compte nommé en état `error` → `not_enabled` « Account « X » is in error. Ask <qui> to fix it, or name another account. ». |
| N21 | Lignes du bloc `team` hors forme de base : « no team (write), account « … » (simulated) » ; « several accounts; ask the user which one… » ; demi-lignes lecture et écriture ; noms d'équipe coupés à 40 caractères. |
| N22 | Dernière procédure : les 50 dernières lignes du `ctx` au plus ; seules les cibles de forme chemin, sans doublon, partent dans la liste lue (`path = any`), et la plus récente trouvée l'emporte. |
| N27 | Les connecteurs actifs se lisent au premier usage d'une requête MCP et ne valent que pour elle ; un non-membre reçoit un ensemble vide, sans lecture ; une panne ne touche que `tools/list`, servie sans exemples. |
| N28 | Refus de saisie des services : `invalid_arguments` « Invalid arguments: <chemin>: <message>; … » (`invalidInput`), chaque problème nommé par son chemin, racine `(root)`, 20 au plus puis « … and N more ». |
| N29 | `team` qui désigne par leur nom deux équipes homonymes (accents confondus) → `ambiguous_team` qui liste slug et nom ; un slug exact l'emporte toujours sur un nom. |
| N30 | Compte nommé sous le niveau et désactivé ou en erreur : le refus de niveau (`forbidden`) passe avant celui d'état ; un seul refus par appel. |
| N31 | Ambiguïté d'une action : `ambiguous_team` et `ambiguous_account` listent les candidats et demandent de les montrer à l'utilisateur sans choisir ; les lignes du bloc `team` portent la même consigne avant la liste. |
| N32 | Un refus bâti sur une liste nomme 20 éléments au plus puis « … and N more » (`boundedList`) : équipes, comptes, connecteurs activables, problèmes de saisie ; `details.teams` garde toutes les équipes. |
| N33 | `connectorNameSchema`, `accountLabelSchema` et `accountModeSchema` restent internes à `schemas/connectors.ts`, hors de la face `./schemas`, tant que seuls ses schémas les lisent. |
| N34 | Un seul `invalidInput(parsed.error)` dans `server/errors.ts`, qui nomme chaque problème par son chemin ; `memberDirectory` et `DirectoryEntry` vivent dans `server/directory.ts` ; `levelName` se bâtit sur `ACCESS_LEVEL_NAMES`. |
| N35 | `listUsableAccounts` valide sa saisie (`connectorRefSchema`) et refuse un connecteur inconnu ou natif comme `createAccount` ; un connecteur activable sans compte rend une liste vide. |
| N36 | `disableAccount` d'un compte inconnu ou invisible → `not_found` « Unknown account <id>. » ; `mail.send_draft` dont la mise à jour gardée par `status = 'draft'` ne change rien, brouillon encore à envoyer → `forbidden`. |
| N38 | Lecture des connecteurs en panne : `tools/list` sert la liste sans exemples de connecteur (log serveur) ; `context` échoue en `internal` quand ses lignes connecteurs ne se lisent pas. |
| N39 | Comptes visibles mais seulement en lecture : la ligne du bloc `team` dit que l'écriture manque (« calls will be refused until you are given write access; you can only read « … » »), la liste en dernier. |

### E05-S02 — Page : lecture et édition par blocs

| Id | Règle |
|---|---|
| HN-E05S02-1 | Le texte d'un bloc part à la sortie du champ, sur ⌘S ou après 1 200 ms sans frappe ; la structure part aussitôt ; une file unique (éditeur, en-tête, publication) envoie une opération après l'autre et adopte `id`, révision et tampon rendus. |
| HN-E05S02-4 | Un titre de bloc se rend en `<h2>` quel que soit son niveau écrit, sous le `<h1>` du titre du nœud. |
| HN-E05S02-6 | `replace_block` et `delete_block` portent la révision lue du bloc, `move_block` aucune ; après un refus, l'écran relit la page et met en conflit le bloc dont la révision a changé ou qui a disparu, sinon c'est un conflit de page. |
| HN-E05S02-7 | Déplacer un nœud change son parent et garde son dernier segment (`POST /api/platform/nodes/move`) ; la nouvelle adresse s'ouvre ensuite par `window.location.assign`, sur le préfixe reçu de l'hôte en chaîne. |
| HN-E05S02-8 | L'arbre se range en sections par premier segment du chemin : « Tout le monde », une par équipe (nom lu par `listTeams`), puis « Privé » ; le Contexte ouvre chaque section ; racine, dossiers d'équipe et espace personnel ne sont pas des lignes. |
| HN-E05S02-13 | « Annuler » une suppression réinsère le bloc tel qu'il était (forme, texte, données, clé) sous un nouvel `id` fabriqué par le serveur : un lien `[[chemin#clé]]` le retrouve, un lien à l'ancien `id` non. |
| HN-E05S02-17 | L'écran écrit des blocs structurés (`input` au format de `blockInputSchema`, clé comprise), jamais du markdown : un Texte servi qui commence par « - » reste un Texte. |
| HN-E05S02-18 | Le tampon du brouillon vient de `NodeView.draft.draftStamp`, puis de chaque réponse (ou d'une relecture quand rien n'attend) ; il part avec l'en-tête et la publication, jamais avec une opération par bloc, gardée par sa révision. |
| HN-E05S02-22 | La clé de rendu d'un bloc servi est son `id` à sa première lecture, gardée s'il change d'`id` ; un compteur ne sert qu'aux blocs créés dans le navigateur, pour que le rendu du serveur et l'hydratation s'accordent. |
| HN-E05S02-23 | « Réessayer » suit un refus `too_large`, une panne réseau, une erreur interne ou un 401 (texte copiable) ; un 403 n'offre que « Copier mon texte », `not_found` « Recharger la page » ; `not_member` et `unknown_org` se disent sans relecture. |
| HN-E05S02-25 | Entrée en tête d'un bloc non vide ouvre un Texte vide avant lui, le focus dedans ; le bloc garde son `id`, sa forme et sa clé. |
| HN-E05S02-26 | Un `[[…]]` est un lien à l'écran si et seulement si la publication l'extrait : l'écran et `server/nodes/links.ts` lisent liens et code en ligne par `schemas/link-syntax.ts`, en balayages linéaires ; gras et italique se lisent autour. |
| HN-E05S02-27 | Un tableau, sans éditeur de blocs, reçoit de l'écran la publication et le bandeau du brouillon (son titre et son résumé s'écrivent au brouillon) ; sa grille vit dans le complément de l'hôte. |

### E05-S03 — Écran Équipes et droits : membres, équipes, règles d'accès, accès plateforme

| Id | Règle |
|---|---|
| HN-E05S03-1 | `ui/` relit la page après une mutation par `ContexteDeRafraichissement`, que l'hôte remplit (`router.refresh` dans Next) ; sans fournisseur, `window.location.reload()`. |
| HN-E05S03-2 | Un geste destructeur d'une ligne (`ActionPlateforme`) et une question de l'éditeur se confirment en ligne, « Garder » d'abord ; retirer une personne ou supprimer une équipe passent par `ConfirmDialog`. |
| HN-E05S03-5 | Les dates des écrans sont en `fr-FR`, fuseau `Europe/Paris` fixe, sans fuseau par personne. |
| HN-E05S03-6 | Retirer le responsable de son équipe est refusé (`conflict`, `is_lead`) : il faut d'abord nommer un autre responsable ou « Sans responsable ». |
| HN-E05S03-7 | Une équipe par défaut dont la personne n'est plus membre se lit `null` (« aucune »), sans déclencheur en base. |
| HN-E05S03-8 | Slug d'équipe : nom sans accents, en minuscules, tout caractère hors `[a-z0-9]` remplacé par `_`, 40 caractères au plus, `equipe` à défaut ; unique par organisation, et nom unique sans casse ni accents. |
| HN-E05S03-31 | Un refus `not_found` d'un geste confirmé (`ActionPlateforme`) rend l'alerte, donne le focus à l'ancre de la liste puis relit la page ; les autres refus gardent la ligne et rendent le focus au bouton. |
| HN-E05S03-32 | Nommer une équipe : `name_taken` quand une autre porte ce nom (sans casse ni accents) ou un nom de même slug ; `slug_taken` quand seul le slug figé d'une équipe renommée est pris ; mêmes refus au renommage. |
| HN-E05S03-36 | Se retirer de l'organisation ou révoquer son propre accès plateforme ne laisse aucune ligne de journal : écrite après la réponse sous le jeton de l'appelant, elle est refusée par `journal_insert_own` ; un test fixe cette limite. |
| HN-E05S03-39 | Une règle posée puis retirée pendant sa pose (`23505`, puis relecture vide) rend `conflict` (« Rechargez la page »), sans nouvel essai. |
| HN-E05S03-40 | Un membre de l'équipe plateforme avec un accès en cours administre l'organisation même s'il a une ligne `members` au rôle `member` (`isOrgAdmin`, en parité avec `platform.is_org_admin`). |

### E05-S04 — Procédure et contexte : éditeurs et aperçu de ce que le modèle recevra

| Id | Règle |
|---|---|
| HN-E05S04-1 | « Tester une phrase » est un formulaire GET (`?phrase=`, 2 000 caractères au plus) calculé par la page serveur avec `previewContext` (procédure servie, score, candidats) ; aucune route API d'aperçu. |
| HN-E05S04-2 | Les refus du contrôle d'une procédure se disent un par un : emplacement (section, rang, étape, sinon « Avant le premier titre » ou « Procédure »), genre traduit, lien vers le bloc, texte anglais sous « Détail technique ». |
| HN-E05S04-4 | « Ma fiche » s'écrit par `PATCH /api/platform/profile`, puis `update_my_profile(p_org, p_patch)` : seuls les champs changés partent ; une personne peut vider un champ, un agent non. |
| HN-E05S04-5 | Les langues de la fiche sont `fr` et `en`. |
| HN-E05S04-6 | Un Contexte s'édite sur son écran de nœud (`/n/<chemin>`), ses annexes à droite (qui le reçoit, ce que le modèle recevra) ; aucune route `/contexte`, aucun lien de navigation « Contexte ». |
| HN-E05S04-7 | « Ma fiche » vit dans les annexes du Contexte Perso de la personne, sur le sien seulement. |
| HN-E05S04-8 | Un bloc `call` s'écrit par deux champs, fonction et arguments JSON relus en objet, et part en bloc structuré `{ type: "call", data: { function, args } }` ; les espaces réservés `"<…>"` sont admis. |
| HN-E05S04-9 | Insérer un appel dans une liste numérotée la coupe, et la suite reprend son numéro (`start`) ; une liste numérotée ajoutée juste après un appel continue la numérotation. |
| HN-E05S04-10 | Publier un Contexte vide demande confirmation (« Publier quand même »), sans prendre le focus de qui écrit. |
| HN-E05S04-11 | « Appel de fonction » n'est offert que sur une procédure ; ailleurs, un bloc `call` se lit, se déplace et se supprime. |
| HN-E05S04-12 | `updateProfile` refuse avant sa requête un appelant sans ligne `members` (entré par un accès plateforme) : `forbidden` `Only members of <org> have a profile here.` |
| HN-E05S04-21 | Plus en vigueur : la page de liste `/procedures` a disparu (tout nœud s'ouvre à son adresse, ADR-008 § 7) ; un espace personnel se nomme « Privé », reconnu à son chemin `perso/…`. |
| HN-E05S04-22 | Le Contexte Perso d'une autre personne se dit reçu par « la personne de cet espace seulement » et « Personne d'autre ne le reçoit, vous non plus. » ; il se reconnaît à l'absence de « Ma fiche ». |

### E05-S05 — Journal : conversations par `ctx`, lecture par `read` et écran

| Id | Règle |
|---|---|
| HN-E05S05-1 | Une conversation regroupe les lignes de journal de la portée de l'appelant d'un même `ctx`, en TypeScript, sur les 2 000 lignes les plus récentes de la période ; 50 conversations par page ; curseur opaque à fenêtre gelée. |
| HN-E05S05-3 | `today` couvre les 24 dernières heures et `week` les 7 derniers jours, fenêtres glissantes ; les heures servies au modèle sont en UTC explicite, l'écran les affiche en Europe/Paris. |
| HN-E05S05-4 | La procédure servie d'une conversation est la cible de son appel `context` quand c'est une procédure que l'appelant lit ; sinon la conversation cite la demande. |
| HN-E05S05-6 | `journal.tool` porte le nom préfixé (`demo_context`), la forme nue est lue aussi ; une ligne `api` porte `<VERBE> <ressource>`, la cible du service et `error` `<code>: <message>`, hors de la vue par conversation. |
| HN-E05S05-7 | Les arguments d'un appel sont visibles, masqués, pour qui voit la ligne, à l'écran comme par `read`. |
| HN-E05S05-8 | Le chemin `journal` est réservé à la racine : `checkPath` (`server/nodes/write.ts`) refuse d'y écrire un nœud, et `read` y sert le journal. |
| HN-E05S05-10 | L'ordre d'écriture du journal est l'`id` : une conversation se lit par `id` croissant, les 2 000 lignes les plus récentes sont les plus grands `id` de la période, la fenêtre gelée est bornée par le plus grand `id` de la première page. |
| HN-E05S05-12 | Un curseur de `read journal` illisible ou d'une autre lecture est refusé en `invalid_arguments` `This cursor no longer matches journal <section>: read again without cursor.` ; l'écran repart du début. |
| HN-E05S05-20 | Les clés secrètes des arguments sont masquées à toute profondeur à la lecture ; au-delà de six niveaux, la valeur passe en texte après masquage, puis est coupée ; un argument stocké tronqué montre son `head`. |
| HN-E05S05-21 | `read journal` lit un code de conversation sans casse (espaces retirés, majuscules, `CTX_PATTERN`) ; toute autre section se lit en minuscules. |

### E05-S07 — Écrans d'authentification habillés comme oto-frontend

| Id | Règle |
|---|---|
| HN-E05S07-4 | Les écrans d'authentification attendent la marque de l'adresse au plus 1 000 ms avant le rendu ; au-delà, thème par défaut, sans ligne d'organisation, et `console.error`. |
| HN-E05S07-7 | Un seul bloc de marque porte le `h1` et la promesse à toute largeur : sous `lg`, il reste dans l'arbre d'accessibilité (`sr-only`) et la marque compacte est `aria-hidden`. |
| HN-E05S07-8 | Sur le panneau d'encre, mot-clé, grand mark et halo sont en `--rail-on-bg` (au moins 5,81:1 sur les huit thèmes), jamais en `--primary` (1,01:1 en Ardoise, le jour). |
| HN-E05S07-12 | `/login` porte la légende « Pas encore de compte ? On entre sur invitation : demandez-en une à l'administrateur de votre organisation. » ; `/forgot-password` le lien « Retour à la connexion » ; aucune ailleurs. |

### E05-S08 — Éditeur de blocs : champs toujours montés, comme oto-frontend

| Id | Règle |
|---|---|
| HN-E05S08-1 | Le texte d'un champ part par `replace_block` quand le focus le quitte, sur ⌘S et après 1 200 ms sans frappe dans ce champ ; les gestes de structure partent tout de suite ; un texte inchangé n'envoie rien. |
| HN-E05S08-3 | Le conflit reste au bloc : tant qu'il n'est pas réglé, les autres champs sont en lecture seule (`readOnly`), avec « Réglez d'abord… ». |
| HN-E05S08-4 | Le champ d'un bloc n'a ni fond ni bordure au repos ni au focus, seul le curseur se voit ; la gouttière (« + » et poignée) paraît au survol et au focus, reste dans l'ordre de tabulation, avec l'anneau du design system. |
| HN-E05S08-5 | Un bloc non écrivable (`reference`, `embed`, type inconnu, forme hors éditeur) se rend en lecture dans sa rangée, et se déplace, se duplique et se supprime par la poignée. |
| HN-E05S08-7 | Quand le focus quitte sa rangée, un bloc vidé part en `delete_block` (avec « Annuler ») ; un bloc neuf vide reste sans rien envoyer ; un bloc servi déjà vide reste. |
| HN-E05S08-10 | Scinder envoie aussitôt le texte d'avant en `replace_block` et celui d'après en `insert_after` s'il n'est pas vide ; le focus va au bloc d'après, sauf si le texte d'avant est refusé, qui garde le focus et son message. |
| HN-E05S08-16 | Une page quittée par une navigation du client (sans `blur` ni `beforeunload`) envoie au démontage de l'éditeur le texte encore en différé. |
| HN-E05S08-17 | Pendant un conflit, les gestes de structure (ajouter, déplacer, supprimer, changer de forme, insérer un appel) sont refusés avec « Réglez d'abord le bloc en conflit. », dit aussi au focus d'un champ en lecture seule. |

### E05-S09 — Reprise fidèle d'oto-frontend : design system, coque unique, accueil et écrans

| Id | Règle |
|---|---|
| HN-E05S09-1 | Les écrans de la plateforme sans équivalent dans oto-frontend se rangent sous les menus d'oto-frontend les plus proches (« Suivi de l'entreprise », « Réglages de l'entreprise », « Membres & équipes »). |
| HN-E05S09-2 | Les connecteurs n'ont ni entrée du rail ni bloc d'accueil ; leur écran d'administration reste joignable par le menu des réglages, pour qui administre. |
| HN-E05S09-3 | « Brancher un assistant » est un aparté de l'accueil (adresse du serveur copiable, état du branchement) ; `/connect` reste l'adresse directe des guides. |
| HN-E05S09-fus-1 | Une seule copie par composant du design system des parties c1 et d2 : `ObjectLink` de la partie b, `TwoColumns` et `Breadcrumb` de d2 ; le fil du nœud lit le type `Maillon`. |
| HN-E05S09-fus-5 | Une seule copie par composant du design system de la partie d1 : `RowList` de d1 (repli d'une ligne), `InputAffix`, `Select` et `SegmentedControl` de `main`. |
| HN-E05S09-fus-9 | Une seule copie par composant de la partie c2 : `Checkbox`, `InputAffix`, `Select`, `Textarea`, `ListTools`, `Table`, `Radio` et `Popover` de `main`, `RadioGroup` et `Tooltip` de c2, sur `Anchor` (`anchor.tsx`). |
| HN-E05S09a-1 | « Couleur », au pied du rail, choisit le thème de l'organisation (`PATCH brand`, le reste inchangé), pour qui administre ; un nom affiché égal au nom de l'organisation repart vide. |
| HN-E05S09a-2 | Le menu de l'entreprise ne liste que l'organisation de l'adresse : aucune bascule, aucun service ne lit les organisations d'une personne ; on change d'organisation en changeant d'adresse. |
| HN-E05S09a-3 | Menu du compte : « Profil » ouvre le Contexte Perso (`/n/perso/<handle>/contexte`), « Brancher un assistant » si l'hôte en sert l'adresse, « Apparence » l'écran de marque pour qui administre ; jour et nuit suivent le système. |
| HN-E05S09a-11 | L'anneau de focus du design system (`--focus-ring`) est un trait d'encre de 2 px (`--rail-fg` sur le rail), avec un écart d'îlot, au lieu du `--ring` d'oto-frontend. |
| HN-E05S09c2-1 | La grille d'un tableau n'offre pas « Ajouter une ligne » : aucun service n'écrit une ligne depuis l'écran ; un tableau vide dit que ses lignes viendront d'un assistant. |
| HN-E05S09d3-16 | Un champ focalisé et refusé (`aria-invalid`) garde le halo d'erreur du design system (`_interaction.css`, `--st-fail` à 24 %, 3 px) au lieu de l'anneau d'encre ; bordure `--st-fail` et message sous le champ disent le refus. |

### E05-S10 — Retours d'édition : pages, procédures et tableaux sans friction

| Id | Règle |
|---|---|
| HN-E05S10b-2 | Un nœud créé depuis le rail reçoit le résumé « À compléter. » (le service en exige un, 1 à 200 caractères), à réécrire en place. |
| HN-E05S10b-3 | Un nœud créé depuis le rail prend la première adresse libre parmi `sans_titre`, `sans_titre_2`, `_3`… ; un refus `conflict` ou `stale_revision` fait essayer la suivante, cinq au plus ; le premier titre, comme tout renommage, fait ensuite suivre le chemin, l'ancien restant un alias. |
| HN-E05S10b-4 | Le niveau d'accès d'une ligne de « Partager » se choisit dans un menu natif (`Select` du design system) : un `DropdownMenu`, monté hors du popover, le refermerait. |
| HN-E05S10b-5 | Une personne ou une équipe ajoutée dans « Partager » reçoit « Peut lire » ; son menu change ensuite le niveau. |
| HN-E05S10b-6 | « Cités » se lit par `readNode` (`links_out`, `links_in`, filtrés par le niveau du lecteur), appelé par la page après la lecture du nœud, sous `<Suspense>`. |
| HN-E05S10e-1 | `nodes.position` est nulle par défaut : les frères se rangent par position, les nœuds sans position ensuite, puis par chemin ; un parent reçoit des positions (1 024 × rang) au premier rangement d'un de ses enfants, un nœud neuf naît sans position ; une mise à jour qui ne change que `position` garde `updated_at`. |
| HN-E05S10e-2 | Un nœud à la corbeille vaut 0 pour tout service ; la purge (30 jours, le nœud et son sous-arbre) se fait sous le jeton de qui lit la corbeille ou y met un contenu ; l'export d'une organisation garde la corbeille avec sa date, l'import la restitue. |
| HN-E05S10e-3 | « Supprimer » exige la gestion et refuse un sous-arbre qui porte un contenu que la personne ne voit pas. |
| HN-E05S10e-4 | « Restaurer » remet le nœud sous son parent s'il est vivant, sinon sous son plus proche ancêtre vivant (jamais hors de son espace), au premier chemin libre de son segment, l'écriture exigée sur cet ancêtre ; ce qui était parti avec lui revient avec lui. |
| HN-E05S10e-5 | Le segment d'un chemin tiré d'un titre suit la règle du slug d'équipe (60 caractères, `sans_titre` sans lettre ni chiffre), premier libre parmi `<segment>`, `_2`… `_50` ; racine, espaces, Contextes et dossiers d'équipe gardent leur chemin ; un refus du déplacement après la publication part au log. |
| HN-E05S10e-6 | « Dupliquer » exige la lecture du nœud et l'écriture sous son parent ; la copie est publiée (révision 1), sans règle ni propriétaire explicite, sans descendant que la personne ne lit pas, sans brouillon, lignes sans bail ; titre « <titre> (copie) ». |
| HN-E05S10e-7 | L'aperçu d'un déplacement se lit au niveau 1 sur le nœud et sur le parent de destination ; il compte les membres de l'organisation, 20 par liste avec les totaux ; les règles propres du nœud le suivent. |
| HN-E05S10e-9 | Un lien public actif par nœud ; jeton de 32 octets tiré par le service, jamais recopié par l'import, qui pose le lien désactivé ; un nœud à la corbeille rend son lien inerte (404) ; l'administrateur liste les liens sans jeton ; la route publique est servie avant le jeton, sans journal. |
| HN-E05S10e-12 | Au nœud le plus proche qui porte une règle visant la personne, sa règle l'emporte, puis ses équipes ; quand seule une règle d'organisation y est, le niveau est le plus haut de cette règle et de ce que donne le propriétaire : une règle d'organisation ouvre, elle ne retire rien (ADR-014). |
| HN-E05S10e-13 | Une règle d'organisation ne compte pas dans un espace personnel, ni dans le calcul ni en SQL ; le service refuse de la poser. |
| HN-E05S10e-17 | L'adresse suit le titre à chaque publication d'un titre changé, quelle que soit la porte (écran, `write`, `admin_node publish`) ; le résultat dit « Renamed: now at <chemin> » ; l'ancien chemin reste un alias ; aucun outil ni argument ajouté (ADR-002). |
| HN-E05S10e-18 | `duplicate_subtree` ne calcule aucun niveau : le service décide avant l'appel ; la fonction borne l'organisation de l'appelant et la forme ; `execute` à `authenticated` seul. |
| HN-E05S10e-19 | Ne se partagent pas sur le web : la racine, `perso`, un espace personnel, un Contexte, le dossier d'une équipe (`invalid_arguments`), un contenu dont le propriétaire effectif est une autre personne (`forbidden`). |
| HN-E05S10e-20 | L'auteur d'un lien public est qui l'a créé ou réglé en dernier ; une désactivation ne change pas l'auteur. |
| HN-E05S10e-21 | La lecture publique garde chaque nœud (racine du lien, contenu lu, enfants, cibles des liens) dont `node_level_of(auteur, …)` rend au moins la lecture ; un auteur qui n'est plus membre ne lit plus rien (404) ; `node_level_of` n'est exécutable par aucun rôle de l'application. |
| HN-E05S10b-9 | Déposé dans le rail, un contenu demande confirmation (`ConfirmDialog`) seulement s'il change d'espace (Tout le monde, une équipe, Privé) ; un propriétaire propre ou des règles héritées dans un même espace ne sont pas jugés. |

### E06-S01 — Pilote V1 : qualification de prospects (tableau, procédure, revue humaine)

| Id | Règle |
|---|---|
| NH5 | La page `ventes/notes_salon_2026` de Démo, aux entreprises fictives, donne au scénario du pilote des valeurs vérifiables, un titre de section par entreprise, que `find` trouve au bloc près. |
| NH6 | La procédure du pilote s'intitule « Qualifier les prospects », titre et résumé sans « à traiter » ni « à » : « Relance les prospects à traiter » reste sous le seuil de service, « Qualifie les prospects à traiter » au-dessus. |
| NH7 | Seuils du test de routage du pilote : formulations du résumé et titre servies à 100 % ; négatives, demandes proches et questions de données jamais servies, marge d'au moins 0,06 ; paraphrases et limites mesurées, sans seuil. |
| NH8 | Le script Démo remet les dix lignes du tableau du pilote à leur état initial à chaque passage ; une ligne identique au module n'est pas réécrite, une ligne qui en diffère reprend ses valeurs et avance d'une révision. |
| NH11 | Le test de routage joue les anciennes déclencheuses en paraphrases, les anciennes voisines en négatives ou limites ; « Où en est la qualification de nos prospects ? » est QP-I4, « Prospects. » QP-I5 ; « leads » n'équivaut pas à « prospects ». |
| NH12 | Les liens de chaque document du pilote sont déclarés dans le module (format `links` de `publishBlocks`) et passés à `publish_node` en `p_links` ; un test statique les confronte aux `[[…]]` des blocs. |
| NH13 | Un document du pilote n'est republié sur Démo que s'il diffère du module (blocs dans l'ordre, titre, résumé) : un passage sans changement n'ajoute aucune version et ne fait pas monter `rules_version`. |
| NH14 | La source interne du scénario du pilote se trouve par `find`, qui cherche dans le contenu au bloc près, sans pointeur par sujet. |
| NH15 | État initial du tableau du pilote : P-003, P-006 et P-009 « à revoir », fiches complétées (provenance `agent`), les sept autres « à traiter », aucune décidée ; la page `ventes/prospects_valbrune` reste publiée. |
| NH23 | Le test de l'état initial de Démo rejoue en place les sections `identite`, `contenu`, `tableau` et `procedure`, dans l'ordre du script, sur l'organisation semée par le test de fumée, sans relancer le script. |

### E07-S01 — Tableaux : en-tête typé, `table.schema`, `table.rows`, `table.aggregate`, `read` d'un tableau

| Id | Règle |
|---|---|
| N1 | `key` nomme une colonne déclarée `text`, `email`, `url` ou `number`, implicitement requise ; sa valeur en texte est la clé de ligne (`blocks.key`, unique par tableau), aussi rangée dans `data`, servie typée dans `key` et dans `set`. |
| N2 | Une colonne texte sans `max_length` tient 2 000 caractères au plus ; `max_length` va jusqu'à 10 000. |
| N3 | Filtres : sans casse ni accent sur `text`, `email`, `url`, `enum`, exacts et typés ailleurs ; `gt` à `lte` sur `number`, `date`, `datetime` ; `contains` sur le texte ; `empty` et `not_empty` prennent `true` ; `in` de 1 à 100 valeurs. |
| N4 | Une valeur de filtre est typée par sa colonne : une chaîne pour un nombre, `"true"` pour un booléen sont refusées avec la forme attendue. |
| N5 | Tri : une clé `{ column, direction }`, typé, texte naturel sans casse ni accent, valeurs hors type puis vides en dernier ; par défaut, clé croissante en ordre naturel. |
| N6 | Filtre, `q`, tri et agrégats se calculent dans le service sur 5 000 lignes au plus, lues par pages de 1 000 ; au-delà, `too_large`, et les pages sans eux sont servies par la base dans l'ordre de `key`. |
| N7 | Le curseur de `table.rows` est opaque : position et empreinte de la requête (`filter`, `q`, `sort`) ; rejoué sur une autre requête, il est refusé. |
| N9 | `by` (provenance, bail) est servi comme le nom du membre, « former member » s'il n'est plus membre. |
| N10 | `table.aggregate` : `metrics` `[{ op, column? }]`, `count` par défaut ; un groupe sans valeur est `{ empty: true }` ; la moyenne a deux décimales. |
| N11 | Une page de lignes se coupe sur une frontière de ligne dès 16 000 caractères sérialisés, avec `next_cursor` ; une ligne seule trop grande rend `too_large`, qui propose la projection ; les agrégats se coupent de même. |
| N13 | Un tableau sans en-tête publié rend `conflict` ; un en-tête publié ou en attente invalide rend `internal`, le problème au log du serveur. |
| N15 | Le contrat d'un tableau (`read`, `table.schema`) ne cite `table.write`, `table.claim` ou `table.release` que s'ils sont au catalogue. |
| N16 | Une ligne lue est un bloc `row` publié du tableau ; ses cellules sont les colonnes déclarées de l'en-tête publié qui ont une valeur, jamais une clé de `data` hors en-tête ni un `null` rangé. |
| N23 | `count` d'une colonne compte ses cellules renseignées ; `sum` sans nombre vaut 0, `avg`, `min`, `max` sont absents ; à effectif égal, groupes en ordre naturel, sans valeur en dernier ; chaque valeur de groupe est citée en JSON. |
| N25 | En plus des 16 000 caractères de lignes, les lignes du texte d'une page tiennent en 22 000 caractères sérialisés ; la ligne d'un bail expiré porte « (lease expired) » après son JSON. |
| N30 | Bornes : `metrics` de 1 à 10, `columns` de 1 à 100, `cursor` de 4 000 caractères ; une valeur citée dans un refus est coupée à 50 caractères ; le contrat cite la longueur que `valueProblem` accepte (254 pour un email, 2 000 pour une URL). |

### E07-S02 — Tableaux : `table.write`, `table.claim`, `table.release`, provenance, garde de révision, contrôle des procédures

| Id | Règle |
|---|---|
| N1 | Une ligne de `table.write` est atomique : un seul problème, un `null` compris, la refuse entière et rien n'est écrit pour elle ; les autres lignes du lot passent. |
| N2 | Une écriture sans `revision` qui croise une autre est relue et réappliquée deux fois au plus ; avec `revision`, elle est gardée par la révision lue. |
| N3 | Deux créations concurrentes d'une même clé donnent un seul bloc `row` : la violation d'unicité `23505` est relue puis appliquée comme une mise à jour, jamais par upsert. |
| N4 | Une ligne sous le bail actif d'une autre personne refuse l'écriture ; `claimed_by_user` fait foi : la même personne écrit quel que soit son libellé de travailleur. |
| N8 | Le `comment` d'une cellule fait 1 000 caractères au plus ; son `link` est une URL `http(s)` de 2 000 caractères au plus. |
| N9 | Quand l'en-tête déclare `review`, les états de décision (`approve`, `reject`) ne se posent ni par `table.write` ni par `table.release`, seulement par la revue humaine de l'écran, sauf quand la revue déclare `agents_may_decide` (E11-S01). |
| N10 | Libérer une ligne sans bail n'est pas une erreur (`released: false`) ; une ligne réservée par un autre titulaire rend `conflict`. |
| N11 | 5 baux actifs au plus par personne, travailleur et tableau ; `table.claim` rend le reste du quota, et `conflict` quand il est atteint. |
| N12 | `table.claim` sert d'abord les lignes au bail expiré, puis l'attente la plus longue (`updated_at`), puis la clé. |
| N13 | Une libération vers le premier état d'une ligne restée inchangée depuis sa réservation porte une note de livelock. |
| N14 | Le `filter` de `table.claim` resserre les lignes éligibles, avec la grammaire de filtre de `table.rows`. |
| N15 | Le compte rendu de `table.write` nomme chaque valeur détruite : écrasée (avant → après), vidée (ancienne valeur), remplacée par `verified_empty` (ancienne valeur). |
| N16 | L'état d'une ligne sous bail ne change que par `table.release`. |
| N17 | Le libellé `worker` fait 1 à 40 caractères, espaces de bord retirés (la base en admet 100). |
| N19 | Une clé est normalisée avant tout : espaces de bord retirés, caractère de contrôle refusé, clé `number` rangée en texte canonique (`String(n)`) depuis un nombre fini ou son écriture décimale ; puis `blockKeySchema`, 200 caractères au plus. |
| N20 | Chaque fonction `table.*` rend dans son `FunctionOutput` le `teamId` de l'équipe propriétaire effective du tableau résolu, alias compris, que `call` journalise. |
| N21 | La provenance d'une cellule écrite par un assistant est `{ origin, by, ctx, at }`, `ctx` étant le code de la conversation (nul sans code). |
| N22 | Un commentaire trop long, un lien hors `http(s)` ou une raison de moins de 3 caractères sont refusés par le schéma de `table.write` pour tout l'appel, au chemin exact ; un `null` passe le schéma et ne refuse que sa ligne. |
| N24 | Une réservation range dans la provenance de l'état la révision qu'elle pose (`claim_revision`, jamais servie) ; une libération vers le premier état sur cette même révision porte la note de livelock. |
| N26 | Une ligne refusée porte `code` (`invalid_arguments`, `stale_revision`, `conflict`) ; une écriture avec `revision` sur une clé sans ligne, ou relue sur une autre révision, rend `stale_revision`, journalisée. |
| N39 | Les candidats de `table.claim` se lisent par l'index `idx_blocks_node_id_updated_at_key` (nœud, `updated_at`, clé, lignes `row` publiées) ; la colonne d'état, propre à chaque tableau, n'est pas indexée. |

### E07-S03 — Grille de tableau, vue dans une page, revue humaine

| Id | Règle |
|---|---|
| HN-E07S03-1 | La file de revue sert le nombre de lignes à l'état de revue et les 20 premières dans l'ordre croissant des clés, provenance comprise. |
| HN-E07S03-2 | Une décision de revue, approbation comme refus, prend une raison facultative de 500 caractères au plus, rangée en `comment` de la provenance de la colonne d'état. |
| HN-E07S03-3 | La décision de revue passe par une route dédiée, `POST /api/platform/tables/review`, pas par `table.write` : la garde porte sur la révision lue et sur l'état attendu de la ligne. |
| HN-E07S03-4 | La grille lit ses réglages dans l'adresse : `q`, `tri` (`-` pour décroissant), `f` répété `<colonne>:<opération>:<valeur>` (`contient`, `egal`, `min`, `max`, `vide`, `rempli`), `n` de 20 à 200 par 20. |
| HN-E07S03-5 | Les blocs `reference` d'un nœud sont résolus côté serveur, désignés par leur `id` de bloc, 10 au plus rendus en place ; les suivants gardent leur lien. |
| HN-E07S03-6 | Le résumé d'une revue, en français, se calcule dans l'îlot à partir des décisions de la session ; il n'est pas stocké. |
| HN-E07S03-7 | Le script Démo remet à chaque passage P-003, P-006 et P-009 « à revoir » avec une provenance `agent` fictive, et publie `ventes/prospects_valbrune` (une vue, une carte) ; ce qui est déjà dans l'état voulu n'est pas réécrit. |
| HN-E07S03-10 | L'E2E du tableau Démo n'en suppose que la forme (clé `ref`, colonne d'état `statut` et ses cinq états, `ville`, `montant_estime`, au moins deux lignes « à revoir ») ; ses nombres se calculent sur les lignes lues. |
| HN-E07S03-11 | Un bloc `reference` sans `view` rend la carte du nœud cité, quel que soit son genre ; une `view` sur un chemin qui n'est pas un tableau est une vue illisible. |
| HN-E07S03-12 | Vues et cartes sont rendues par la page serveur et passées à l'écran et à l'éditeur en un `ReactNode` par `id` de bloc (`referencesRendues`) ; une référence non résolue garde le lien par défaut. |

### E07-S04 — Créer un tableau et faire évoluer son schéma par `write`

| Id | Règle |
|---|---|
| N1 | Un attribut, une clé ou un type inconnus dans un patch d'en-tête sont refusés par sa forme stricte (clés citées 20 au plus) ; à la création, le refus porte le cadre « Invalid table header: … Contract: … ». |
| N6 | Une ligne que la purge des colonnes retirées ne peut écrire (changée trois fois, panne) ne fait pas échouer la publication, déjà faite : journalisée, dite en avertissement `not_purged`, purgée si la colonne revient. |

### E08-S02 — MCP admin (1/2) : route, `admin_context`, `admin_org`, `admin_team`, journal à part

| Id | Règle |
|---|---|
| N1 | Les outils du MCP admin s'appellent `admin_<objet>`, sans préfixe d'organisation : un connecteur admin sert une cellule, pas une organisation. |
| N2 | `/api/mcp-admin` : sans jeton ou jeton invalide, 401 avec `resource_metadata` vers `…/oauth-protected-resource/api/mcp-admin` ; jeton valide hors équipe plateforme, 401 `invalid_token` sans métadonnées, corps « Unauthorized », rien servi. |
| N4 | `org` n'est requis que par les opérations qui visent une organisation : ni pour `help`, `admin_context`, `admin_org list` et `admin_cell`, et facultatif (filtre) pour `admin_journal admin_log`. |
| N5 | Tout appel d'`admin_context` émet un nouveau code ; sa ligne `admin_journal`, ancrage du code, est écrite et attendue avant la réponse : si elle échoue, aucun code n'est servi. |
| N7 | Premier temps admin : résultat normal (pas `isError`) qui finit par « Nothing was <verbe>. Show this to the user and ask for explicit approval, then call again with confirm: true. » ; `confirm: true` exécute ; jamais `needs_confirmation`. |
| N8 | `admin_org create` est en deux temps : le préfixe nomme les outils pour toujours, et aucune opération ne supprime une organisation. |
| N9 | Le staff ne voit et n'administre que les organisations où il est membre ou a un accès en cours, décidé par le service (`listOrgs`, `resolveAdminOrg`) ; une organisation sans accès rend le même `not_found` qu'un slug inconnu. |
| N10 | `orgs.settings.domains` est une chaîne libre en anglais (domaines de travail cités par `<prefix>_context`, 200 caractères au plus, vide = retirer) ; les adresses sont la table `org_domains` (`host`, `add_host`, `remove_host`). |
| N12 | `orgs.settings.routing {threshold, gap}` (0 à 1, défauts 0,65 et 0,1) se règle par `updateOrg`, que servent `admin_org update` et la page Organisation du tableau de bord. |
| N13 | `grant_access` : l'appelant administre l'organisation comme membre de l'équipe plateforme (`isStaff` et `isOrgAdmin`), le destinataire est du staff, un seul accès en cours par couple, décidé avant l'insertion ; `revoke_access` en deux temps. |
| N14 | Les `next_actions` du MCP admin sont des chaînes `"<outil> <op>"` et ne proposent jamais une opération en deux temps. |
| N15 | Ligne `admin_journal` : `target` = `org:<slug>` pour une opération qui nomme une organisation, `team:<slug>` pour une équipe, sinon chemin, ticket ou connecteur ; `host` sur la ligne `initialize` seule ; un refus 401 : un `console.warn` sans donnée. |
| N17 | Un outil admin déclaré sans table d'opérations rend `unavailable_in_v1` « Not available yet in this version. » après la garde ; les huit outils ont aujourd'hui leur table, et leurs schémas n'évoluent que par ajout. |
| N18 | Slug d'organisation `^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$` (étiquette DNS de 2 à 40 caractères, pour `<slug>.<base>`) ; nom de 1 à 80 caractères. |
| N19 | `admin_org update` écrit nom et `settings` en une écriture sous garde `updated_at`, puis la marque par `updateBrand`, seul écrivain d'`orgs.brand` (dernière écriture gagnante sur la marque). |
| N20 | L'annuaire de l'équipe plateforme se lit par `staff_directory()` (identifiant, email, nom, date d'ajout), réservée au staff ; email et nom sont nuls pour une ligne écrite sans email. |
| N21 | `platform_staff` ne s'écrit que par l'outillage `scripts/platform-staff.mjs` (`add`, `remove`, `list`, connexion d'administration) : aucune porte du paquet ne l'écrit. |
| N22 | `admin_team` suit les services d'équipes : `create` rend le slug de `teamSlug` ; `set_lead` avec `email` vide laisse l'équipe sans responsable ; `add_member` d'un membre présent ne change rien ; retirer le responsable est refusé (`is_lead`). |
| N23 | Avant toute écriture : `updateOrg` sans `isOrgAdmin` → `forbidden` « Changing the settings of <org> is reserved to … » ; `add_host`, `remove_host`, `grant_access` sans `isStaff` et `isOrgAdmin` → `forbidden` « op <op> of admin_org is reserved… ». |
| N24 | La contrainte d'un `23505` de `create_org` (slug, préfixe, adresse) se reconnaît par `uniqueConstraint` de `server/errors.ts`, seul lieu d'une hypothèse sur la forme d'une erreur PostgREST. |
| N35 | Le récapitulatif de `revoke_access` nomme par son nom qui a accordé l'accès ; le `reason` d'une révocation est gardé par la ligne du journal admin, `platform_grants` n'ayant pas de motif de révocation. |
| N40 | Le schéma plat de chaque outil admin est servi (`tools/list`), jamais analysé : la validation est celle de l'opération (opération connue, champ en trop cherché dans les arguments bruts, schéma strict) ; ses bornes viennent des schémas partagés. |

### E08-S03 — Tableau de bord : organisation, connecteurs, drapeaux, accès plateforme

| Id | Règle |
|---|---|
| N1 | Les pages `/admin/*` sont réservées à qui administre l'organisation de l'adresse (`isOrgAdmin`), décidé par la page avant tout appel ; les autres lisent « Cette page est réservée aux administrateurs de <nom>. » |
| N5 | Désactiver un connecteur ou un compte se confirme en ligne par `ActionPlateforme` (question, « Garder », confirmation ; pas de modale), l'API exécutant directement ; activer et basculer un drapeau partent sans question. |
| N6 | Un libellé de compte est unique dans l'organisation, sans casse (index `accounts (org_id, lower(label))`) ; la création s'appuie sur le refus `23505` rendu en `conflict`, jamais sur une lecture préalable, à l'écran comme au MCP admin. |
| N9 | Les entrées d'administration du rail (`RailApplication`) ne se montrent qu'à qui administre l'organisation (`administre`, calculé par `isOrgAdmin` dans le layout) : confort seulement, chaque page `/admin/*` revérifie l'accès. |
| N11 | Les comptes créés depuis l'écran appartiennent à l'organisation ou à une équipe : la route `POST admin/accounts` refuse `owner_kind: user` en `invalid_arguments` ; un compte personnel ne se crée que par son propriétaire. |
| N18 | Textes de l'écran Connecteurs accordés au nombre (« 1 connecteur activable », « 1 fonction », « 1 procédure publiée le cite… ») ; au-delà de 10 chemins, « , … » ; sans nom d'annuaire, « Actif depuis le <date> » sans parenthèse. |

### E08-S04 — Drapeaux par organisation et état de la cellule

| Id | Règle |
|---|---|
| NH1 | Registre des drapeaux en code (`FLAGS` : nom et description), vide en V1 ; `setFlag` refuse un nom non déclaré, `listFlags` ne rend que les déclarés ; une clé stockée non déclarée n'est ni listée ni modifiée. |
| NH2 | `isEnabled` ne rend vrai que pour la valeur stockée `true` exacte ; drapeau absent, toute autre valeur (`"true"`, `1`) et drapeaux mal formés valent `false`, sans erreur. |
| NH3 | Un drapeau s'écrit sous garde optimiste sur `orgs.updated_at` ; 0 ligne → `conflict`. |
| NH4 | L'état de la cellule ne dépend d'aucune organisation : jeton, puis `is_staff()`, sans appartenance ni identité par l'adresse. |
| NH5 | Santé = base joignable (durée d'`applied_migrations()`) et présence, jamais la valeur, des variables requises du mode de l'hôte : Supabase (URL, clé anon, `NEXT_PUBLIC_SITE_URL`) ou OIDC (émetteur, audience, SMTP, expéditeur, `NEXT_PUBLIC_SITE_URL`). |
| NH9 | Plus en vigueur : `setFlag` décide par `isOrgAdmin` (administrateur, ou staff avec un accès en cours, membre simple compris), plus par `member.role`. |
| NH11 | `GET /api/platform/cell` est reconnu par `isCellRoute`, hors de `RESOURCES`, après le jeton et avant l'identité par l'adresse ; `GET` sans paramètre seulement (sinon `404 not_found`) ; aucune ligne de journal. |

### E08-S05 — Fonctions métier d'un ERP au catalogue

| Id | Règle |
|---|---|
| NH1 | `registerFunctions` remplace à chaque appel toute la source ERP (une seule liste, déclarée dans `src/lib/fonctions-metier.ts`) : un rechargement à chaud ne crée pas de doublon. |
| NH2 | `src/lib/fonctions-metier.ts` est importé pour son effet par chaque route de l'hôte qui monte une porte du paquet (`/api/mcp`, `/api/platform/[...route]`, `/api/mcp-admin`) ; un test le vérifie. |
| NH3 | Une inscription ERP invalide lève `CatalogRegistrationError` au chargement de la route et n'inscrit rien : une erreur de développeur casse la route au lieu de servir un contrat faux. |
| NH4 | Une fonction ERP reçoit `{ db, identity, accessToken }` : elle construit son client de l'ERP sur le jeton vérifié de l'appelant, donc sous la RLS de l'ERP ; sans jeton, rien ne court. |
| NH6 | La description de `call` ne cite jamais une fonction ERP (exemples : connecteurs activés, puis `table.rows`) ; une fonction ERP se trouve par `find` et par les étapes des procédures. |
| NH8 | Le contrat servi par `read` et le contrôle de schéma strict à l'inscription se lisent sur le JSON Schema d'entrée, `z.toJSONSchema(schema, { io: "input" })` : un champ à `.default()` y est facultatif. |
| NH12 | La liste ERP vit dans `server/catalog/erp-source.ts`, sans import à l'exécution : le registre la lit, `erp.ts` lit le registre pour valider ; ni cycle d'import ni état dans le registre. |
| NH16 | Un schéma que JSON Schema ne sait pas écrire côté entrée (`z.date()`, `z.bigint()`, `z.map()`, `z.custom()`) est refusé à l'inscription, « <nom>: schema must be representable in JSON Schema (…) » ; une `transform` s'inscrit. |
| NH17 | Chaque objet du schéma d'une fonction ERP est fermé, imbriqué compris : un objet aux propriétés déclarées sans `additionalProperties: false` en entrée est refusé à l'inscription ; un `z.record` garde ses clés libres. |
| NH18 | Une `PlatformError` `internal` levée par `run` ou `summarize` de l'ERP est servie comme une panne, sa cause écrite au log par l'enveloppe (`[platform] call: ERP function <nom> failed`) ; toute autre erreur, la porte la journalise. |
| NH19 | Le jeton de l'appelant ne va qu'au contexte d'une fonction d'origine `erp` (`runCall`) : une fonction native ou de connecteur ne le reçoit pas. |

### E08-S06 — MCP admin (2/2) : `admin_node`, `admin_connector`, `admin_journal`, `admin_feedback`, `admin_cell`

| Id | Règle |
|---|---|
| N1 | Propriétaire et sujet s'écrivent en une chaîne plate, bornée à 300 caractères : `team:<slug>`, `user:<email>`, `org`, `inherit` (propriétaire seulement), résolue par `resolveRef`. |
| N2 | `transfer_owner` est toujours en deux temps ; le premier nomme la gestion avant et après, compte les descendants lisibles qui héritent, et prévient quand le nouveau propriétaire est une personne (administrateurs et staff perdent l'accès). |
| N3 | La racine `guide` ne change pas de propriétaire : elle appartient toujours à l'organisation. |
| N4 | `admin_connector deactivate` et `disable_account` sont en deux temps ; `activate` et les règles se font en un temps (réversibles). |
| N6 | Un compte s'adresse par son libellé, unique dans l'organisation sans casse (index `accounts (org_id, lower(label))`) : `findAccount` compare comme l'index, parmi les comptes visibles, sans champ `connector` pour désambiguïser. |
| N7 | `admin_journal` : 7 jours par défaut ; `conversations` et `conversation` par la lecture du journal web (fenêtre gelée, masquage) ; `admin_log` : 50 lignes par page, curseur `(ts, id)`, toute l'équipe plateforme, arguments avec `code` seulement. |
| N8 | `admin_feedback list` : tous les états, comptes par état en tête, 30 jours par défaut ; `set_state` : toute transition, `declined` exige une résolution de 3 caractères au moins, le retour à `open` efface la décision, le même état ne réécrit rien. |
| N10 | Les règles d'un compte vivent dans `server/rules.ts` sur le modèle de celles d'un nœud : `listAccountRules`, `setAccountRule` et `removeAccountRule` (`removeRule` ne retire que la règle d'un nœud). |
| N13 | `create_account` du MCP admin ne crée que des comptes d'organisation ou d'équipe (`owner` = `org` ou `team:<slug>`) : un compte personnel ne se crée que par son propriétaire. |
| N15 | `catalogue` rend les connecteurs activables de `listConnectorsForOrg`, puis les fonctions toujours actives lues au registre du catalogue (`table.*`, fonctions de l'application). |
| N16 | `admin_cell migrations` reconnaît les migrations du paquet à leur nom (`<horodatage>_platform_<sujet>`) sans les comparer à une liste embarquée : l'écart aux migrations attendues est V2. |
| N17 | `admin_node` n'écrit que `nodes`, jamais un bloc (les blocs suivent leur nœud) ; une publication passe par le seul service de publication (contrôle, liens, `publish_node`), jamais par un appel direct à `publish_node`. |
| N19 | `transferOwner` décide avant d'écrire : la gestion du nœud (`requireNodeLevel`, action `transfer`, refus « Changing the owner of <path> is reserved to <qui>. Ask them to change it. ») suffit, rendre personnel compris ; `nodes_guard` en second. |
| HN-E08S06-9 | `catalogue` : tout connecteur activable est dit « (simulated) », `kind: "simulated"` ; les fonctions natives se groupent par connecteur, « (built in) », celles de l'application sur une ligne ; `state` vaut `active`, `inactive` ou `always_active`. |
| HN-E08S06-17 | `transfer_owner` refuse `perso` et un espace `perso/<handle>` (`invalid_arguments`) après la recherche du nœud ; en base, `nodes_guard` refuse de donner `perso/<handle>` à une autre personne que celle du handle. |

### E08-S09 — Tableau de bord : usage et retours des assistants

| Id | Règle |
|---|---|
| N2 | L'usage lit au plus les 20 000 appels les plus récents de la fenêtre, en une requête bornée, puis un calcul pur (aucune fonction SQL) ; au-delà, l'écran le dit et donne la date couverte. |
| N3 | Fenêtre de 30 jours par défaut (usage et retours), au choix 7, 30 ou 90 ; toute valeur inconnue vaut 30. |
| N4 | Le filtre d'équipe de l'usage retient les lignes des personnes membres de l'équipe aujourd'hui (le journal ne porte l'équipe que pour les appels de connecteur). |
| N5 | Retours : « à traiter » (ouverts et pris en compte) par défaut ; quatre états, toute transition permise ; décliner exige un motif de 3 à 2 000 caractères ; le retour à `open` efface la décision ; « Traité par » est montré. |
| N6 | Usage et retours sont réservés à qui administre l'organisation : pas de vue du responsable pour son équipe en V1. |
| N7 | Paramètres d'URL de l'usage et des retours en anglais, comme ceux de `/journal` (`period`, `team`, `state`, `type`, `cursor`) ; un ancien nom est ignoré comme tout paramètre inconnu (E11-S07, ADR-020). |
| N9 | `usageSummary`, `listFeedback` et `setFeedbackState` exigent `isOrgAdmin` avant toute lecture ou écriture ; sinon `forbidden` « Reading the usage of <org> is reserved to <qui>. Ask them. » ou « Handling the feedback of <org> … ». |
| N10 | Un `call` sans cible compte dans les totaux de l'usage, pas dans « Erreurs par fonction » : il ne nomme aucune fonction. |
| N27 | La demande et le host d'une conversation sans procédure se lisent sur sa première demande (ligne `<préfixe>_context` sans erreur et à cible), pas sur sa première ligne `context`. |

### E09-S02 — Sous-domaines de la cellule et consentement habillé

| Id | Règle |
|---|---|
| HN-E09S02-1 | Le domaine de base se lit dans `CELL_BASE_DOMAIN` (une valeur que `hostSchema` refuse vaut absente) ; le point de la cellule n'est branché qu'avec `CELL_BASE_DOMAIN`, `VERCEL_TOKEN` et `VERCEL_PROJECT_ID` (`VERCEL_TEAM_ID` facultatif). |
| HN-E09S02-2 | Sous-domaines jamais servis à une organisation : `app`, `www`, `api`, `mcp`, `manage`, `admin`, `docs`, `status`, `auth`, `mail`, `oto`, `share`, `dashboard` ; un seul niveau sous la base ; une étiquette avec `--` est refusée. |
| HN-E09S02-3 | La base d'abord (`create_org`), Vercel ensuite : un échec chez Vercel laisse l'organisation et son adresse en place, à finir à la main dans Vercel par JB ; aucune opération de reprise. |
| HN-E09S02-9 | Une exception du point de création de l'hôte n'est jamais servie : `internal` sans message avant la création, ligne constante après ; ni son message ni sa pile ne vont au log. |

### E09-S03 — Google et Microsoft sur invitation

| Id | Règle |
|---|---|
| HN-E09S03-1 | La page de connexion n'affiche que les boutons des fournisseurs activés, lus dans `GET /auth/v1/settings` (relu au plus toutes les 300 s) ; une panne de lecture masque les deux. |
| HN-E09S03-4 | Boutons des fournisseurs en texte seul (« Continuer avec Google », « Continuer avec Microsoft »), sans logo de marque. |
| HN-E09S03-5 | Les boutons des fournisseurs arrivent en streaming : `fournisseursActives()` est lancée sans être attendue et rendue sous un `<Suspense fallback={null}>` ; titre et formulaire n'attendent pas `GET /auth/v1/settings`. |
| HN-E09S03-7 | Au rappel `/auth/callback`, `error_code=otp_expired` (lien email expiré, réinitialisation comprise) mène à `/login?error=auth_callback_error` ; toute autre erreur à `error=oauth`. |

### E09-S04 — Export-import d'une organisation

| Id | Règle |
|---|---|
| HN-E09S04-2 | À l'import, toute valeur d'une ligne (clé propre, clés étrangères, `jsonb` à toute profondeur) égale, chaîne pour chaîne, à un ancien identifiant prend le nouveau ; les clés d'objet restent, les colonnes de personne suivent leur politique. |
| HN-E09S04-10 | L'import insère les équipes sans responsable et pose `lead_user_id` après `team_members` : `teams_lead_sync` y retrouve la ligne du responsable, qui sinon ferait doublon (`23505`) et perdrait sa date. |
| HN-E09S04-11 | Dans l'empreinte, un bloc se désigne par le chemin de son nœud, son état (publié s'il l'est), puis `#<clé>`, ou `@<position>` quand il n'a pas de clé. |
| HN-E09S04-12 | Une table du fichier absente de la carte `TABLES` (`rows`, `vocabulary` ou autre) est refusée avant toute écriture : aucune ligne ignorée en silence, aucun ancien format converti. |
| HN-E09S04-13 | Une invitation en attente pour l'adresse d'un membre importé n'est pas importée (comptée avec les invitations closes) : `invitations_guard` la refuserait et annulerait l'import. |
| HN-E09S04-14 | Refusés avant écriture : une référence (vers `orgs`, `teams`, `nodes`, `accounts`) à une ligne absente du fichier, un `org_id` nul ou absent, un `id` d'organisation non uuid, une colonne hors carte ; seules les clés chaînes désignent une ligne. |
| HN-E09S04-15 | `nodes.owner_user_id` suit la politique `membre` : un espace personnel dont le propriétaire n'est pas un membre importé est sauté avec ses descendants et ce qui en dépend (`nodes_guard` refuserait ce propriétaire). |
| HN-E09S04-22 | Délai de la suite d'intégration de l'export-import : 600 s (lecture de la spécification OpenAPI et semis Démo lents sous charge). |
| HN-E09S04-23 | Un lien dont `source_block_id` n'est pas un bloc publié de son `source_node_id` dans le fichier est sauté (compté dans « Lignes sautées »), pas refusé : la clé unique des liens vaut pour toute la base. |
| HN-E09S04-24 | Seuls les comptes de la cible à l'email confirmé sont rapprochés ; les autres comptent comme absents (appartenances et accès sautés) et le résumé les nomme ; l'auteur par défaut doit être confirmé. |
| HN-E09S04-25 | Vers un autre projet (hôte cible différent de `source.host`), les accès plateforme en cours sont importés révoqués et comptés au résumé ; dans le même projet, recopiés tels quels ; `granted_by` prend la politique `null`. |

### E09-S05 — Isolation de deux organisations, de bout en bout

| Id | Règle |
|---|---|
| HN-E09S05-2 | Une table sans ligne chez B fait échouer la suite d'isolation : une preuve sur une table vide ne prouve rien. |
| HN-E09S05-3 | Le cas critique de l'isolation est la personne membre des deux organisations (`c`, administratrice d'A et de B) : services et porte MCP sont testés sous son identité, seule l'adresse séparant A de B. |
| HN-E09S05-6 | Le clone d'une ligne de B omet ce qu'`authenticated` ne peut pas insérer (colonnes générées, identités, `blocks.id`…) : le refus doit venir de l'isolation, pas du privilège de colonne. |
| HN-E09S05-7 | L'absence d'un marqueur de B dans une recherche sur A ne compte que si le même terme rend la ligne de B sur B ; l'assertion porte sur les nœuds de B, le repli en OU de `search_content` pouvant rendre des lignes d'A. |
| HN-E09S05-9 | Portée plateforme : `p` lit les lignes de B dans `platform_grants` et `admin_journal`, et écrit à son nom dans le journal admin de B (policy d'insertion sans appartenance) ; la suite l'attend, puis retire la ligne. |
| HN-E09S05-12 | Sur un clone de B, une erreur de contrainte (check, clé étrangère, unicité, non-nul) est une fuite ; 42501, 23503 d'un parent invisible et 23514 d'un Contexte à l'équipe invisible sont des refus ; toute autre erreur fait échouer. |
| HN-E09S05-20 | Le clone d'une insertion porte l'appelant dans les colonnes comparées à `auth.uid()` (`user_id`, `created_by`, `invited_by`, `granted_by`, `activated_by`) et l'état d'une création (`feedback` ouvert, `sim_outbox` brouillon). |

### E10-S04 — Compatibilité markdown des pages : tableau simple, séparateur, repli, listes imbriquées, titres, texte en ligne

| Id | Règle |
|---|---|
| HN-E10S04-6 | La conversion au premier `write` d'une section relue est admise, sans migration des données : un paragraphe fait d'un tableau, un « --- » seul, un paragraphe `<details>` ou un élément qui porte une sous-liste deviennent des blocs neufs ; de même, un élément de liste dont une ligne suivante commence par une marque (`"c\n1. x"`, écrit seulement par l'API des blocs) est relu en sous-liste aux niveaux 1 et 2, et sa section refusée au niveau 3 (`line N: lists go three levels deep at most.`). |
| HN-E10S04-9 | « Précédée d'une ligne vide ou en tête du texte » se lit « au début d'un bloc, jamais dans un paragraphe » : un tableau ou un séparateur qui suit un titre, une liste ou un encart sans ligne vide est reconnu ; une ligne `<details>` interrompt un paragraphe, comme une clôture ou un titre. |
| HN-E10S04-10 | La marque qui ouvre une sous-liste est admise de 0 à 3 espaces, ou jusqu'à la largeur de la marque de l'élément moins un quand elle est plus grande (un élément numéroté à partir de 1000 relit sa sous-liste). |
| HN-E10S04-11 | Dans une sous-liste, des lignes vides entre deux sous-éléments sont admises et se relisent en liste serrée ; au premier niveau, une ligne vide suivie d'une marque ouvre toujours une seconde liste. |
| HN-E10S04-12 | Le résumé d'un repli est lu sans ses blancs de bord et compté comme un titre (`btrim`, 1 à 200 caractères) ; un résumé vide reçoit le refus « a toggle starts with <summary>…</summary> on one line. ». |
| HN-E10S04-13 | Un accent grave échappé ne s'affiche sans sa barre oblique que hors d'un span de code (`codeSpans` inchangé) ; un `\<` devant `<https://…>` empêche l'adresse entre chevrons, l'adresse nue qu'il contient restant un lien. |
| HN-E10S04-14 | Dans l'éditeur, un élément de liste sur plusieurs lignes se relit en autant d'éléments, et les enfants d'un élément racine sur plusieurs lignes suivent sa dernière ligne ; un sous-élément sur plusieurs lignes montre chacune à sa profondeur, avec sa marque, et se relit en autant de sous-éléments frères, ses enfants après sa dernière ligne : aucun enfant ne change de niveau ni de parent ; une ligne de deux espaces ou plus d'un Texte changé en liste devient un sous-élément. Numéros de gouttière d'une liste numérotée (corrigés par E10-S06) : seuls les éléments du premier niveau se comptent, à partir de `start` (`numerosDeGouttiere`). |
| HN-E10S04-15 | Les clôtures d'un corps de repli (accents graves ou tildes, 0 à 3 espaces avant ; une clôture jamais fermée court jusqu'à la fin) se lisent par `fencedParts` (`schemas/link-syntax.ts`), que partagent la publication (`links`), l'écran (`cheminsCites`) et le rendu. |
| HN-E10S04-16 | Dans l'éditeur, un tableau et un repli se nomment par leurs colonnes ou leur résumé, sinon « bloc vide » (`premiersMots`), un séparateur « Séparateur » (E10-S06) ; `h6` se distingue de `h5` par la mono capitales des intitulés (`content.css`). |

### E10-S01 — Markdown et CSV : coller, importer, exporter ; `table.import`

| Id | Règle |
|---|---|
| HN-E10S01-11 | Le `.md` d'une page (`pageMarkdown`) et son inverse (`readPageMarkdown` : titre, résumé, morceaux d'un import) vivent dans `schemas/blocks-render.ts`, exportés par `./schemas` ; `server/nodes/export.ts` les importe. |
| HN-E10S01-12 | `slugOf`, `OP_TEXT_MAX`, `PAGE_MAX` (`schemas/nodes.ts`), `instantOf`, `maxLengthOf`, `COLUMN_TEXT_MAX` et `ROW_KEY_MAX` (`schemas/tables.ts`) passent dans `schemas/`, réexportés à leur ancienne place (`segments.ts`, `limits.ts`, `meta.ts`) : l'écran et le service appliquent la même règle ; `segmentOf` et `columnNameOf` reposent sur `slugOf`. |
| HN-E10S01-13 | `kept_as_text` compte les constructions gardées en texte (bloc `code` ou paragraphe) : `call` ou `reference` mal formés, clôture jamais fermée, titre de plus de 200 caractères, source d'image trop longue, tableau hors bornes, résumé de repli refusé, bloc que le schéma refuse encore ; les formes ramenées (`#` en titre de niveau 1, liste coupée ou ramenée au troisième niveau, repli dans un repli, `---` en séparateur, `mermaid` vide retiré) ne comptent pas. |
| HN-E10S01-14 | En mode tolérant, hors du tableau d'AC-a2 : un texte sans marque dans une sous-liste devient un élément ; puces et numéros mêlés gardent la forme du premier élément ; un repli jamais fermé court jusqu'à la fin ; un résumé trop long est coupé à 200 caractères ; un résumé refusé laisse la ligne `<details>` en texte (compté) ; un bloc de plus de 100 000 caractères reste refusé. |
| HN-E10S01-15 | En mode tolérant, un `call` ou une `reference` mal formés deviennent un `code` sans mot de tête ; une clôture jamais fermée garde son mot de tête, sauf `call`, `reference` et `mermaid`. |
| HN-E10S01-16 | Les morceaux d'un `.md` importé partent en `insert_after` sans bloc, du dernier au premier, dans une seule requête : `append` exige une section, qu'une page neuve n'a pas (écart d'AC-a3). |
| HN-E10S01-17 | L'encart « N éléments conservés en texte » d'un `.md` importé vit dans le retour du rail : le message s'écrit dans sa région `role="status"`, montée vide, quand la page importée devient l'adresse ouverte, et l'encart visible (`role="note"`) part avec son état quand une autre adresse s'ouvre ; après un collage ou un dépôt dans l'éditeur, le compte va dans son annonce (`role="status"`). |
| HN-E10S01-18 | `GET nodes/export` et `GET tables/export` ne sont pas journalisés, comme toute lecture : leurs routes ne rendent aucune ligne de journal, `exportNode` et `exportTable` ne calculent ni cible ni équipe ; l'export reste borné à 5 000 lignes et décidé par la lecture. Confirmée par JB le 2026-09-29 (D138). |
| HN-E10S01-19 | `table.import` sur un tableau existant : `key`, s'il est donné, doit nommer sa clé, sinon refus ; les colonnes inconnues, nommées deux fois ou l'état d'une file sont ignorées et listées dans la réponse (texte et champs), comme à l'écran. |
| HN-E10S01-20 | La borne de 40 000 caractères de `table.import` est une constante à côté du schéma (`IMPORT_CSV_MAX`), dite par sa description et contrôlée par l'adaptateur en `too_large` (un `.max` Zod rendrait `invalid_arguments`). |
| HN-E10S01-21 | Une création (écran, `table.import`, conversion) décide les droits (écriture sur le parent, D150), contrôle tout le lot, crée et publie le tableau par le service de `write`, puis écrit les lignes en une transaction ; toute erreur levée après la création (relecture du tableau, lecture de son équipe, refus ou panne du lot) porte `details.created` et le dit (« The table <chemin> was created and published, but none of these rows was written… »), une erreur sans code devenant `internal` ; « Reprendre » remplit ce tableau sans `create`, un refus portant `details.created` n'essaie pas l'adresse suivante, et la conversion garde par rangée le tableau d'un premier lot refusé (`convertis`, `use-envois.ts`). Reste ouvert : M77. |
| HN-E10S01-22 | La provenance `import` passe par `RowActor.origin` : toute cellule écrite par un import, clé et état d'entrée d'une file compris, porte `origin: "import"` ; le commentaire va aux valeurs posées. |
| HN-E10S01-23 | Le dépôt d'un `.csv` sur un tableau existant enveloppe son corps (`ui/tableau/tableau-du-noeud.tsx`), vide compris, avec « Importer un fichier… » pour le clavier ; `grille.tsx` n'est pas touché (D140). |
| HN-E10S01-24 | Le « ⋯ » d'un Contexte offre « Télécharger en .md », son seul geste ; remplace E05-S10 AC-b8 (« aucun ⋯ sur un Contexte »). Confirmée par JB le 2026-09-29 (D139). |
| HN-E10S01-25 | « Convertir en tableau de données » : adresse `<page>/<segment du titre>`, puis `_2`… (cinq essais) ; les cellules du tableau simple sont prises telles quelles (barres échappées et `<br>` gardés). |
| HN-E10S01-26 | `server/tables/import.ts` lit `nodes/write` par un import dynamique : sans lui, le registre du catalogue, qui importe `table.import`, forme un cycle (registre, `write`, publication, contrôle des procédures, registre). |
| HN-E10S01-27 | La phrase d'AC-c2 sur le markdown est écrite telle que l'AC la cite (« with write »), sans le préfixe de l'organisation. |
| HN-E10S01-28 | Un nombre qui commence par un zéro suivi d'un chiffre (`01000`) n'est pas un nombre : une colonne de codes postaux reste un texte ; l'apostrophe d'un export se retire aussi devant une tabulation ou un retour chariot. |
| HN-E10S01-29 | Une colonne `date` peut porter la clé d'un tableau (décision de JB, FB-0014, 1.1.3) : `KEY_COLUMN_TYPES` (`schemas/tables.ts`) est la seule liste, lue par l'en-tête, la clé proposée et l'écran d'import. La clé proposée est la première colonne `text`, `number` entière, `email` ou `date` dont les valeurs sont présentes et distinctes une fois lues (`29/09/2026` et `2026-09-29` sont la même clé, rangée `YYYY-MM-DD`) ; une colonne où un nombre porte une virgule ou un point décimal n'est jamais proposée, `url` se nomme par `key` seulement ; `datetime` ne porte pas la clé. |

### E10-S06 — Éditeur des blocs de page : choix du « + » et de `/`, tableau simple, séparateur, repli, niveaux de liste, préfixes de titre

| Id | Règle |
|---|---|
| HN-E10S06-6 | Le « + » d'une page vide n'est pas codé : message, bouton de la page vide et `insererEnTete` restent ceux d'avant ; AC-a1 vaut pour le « + » d'un bloc, AC-a2 pour tout Texte vide (décision de JB du 2026-09-29 : la page vide sera remplacée par un premier Texte créé et focalisé). |
| HN-E10S06-7 | Les bornes d'un ajout (« 20 colonnes au plus. », « 200 rangées au plus. ») et les refus d'un niveau de liste se disent dans la ligne d'annonce de l'éditeur (`LigneDAnnonce`, `role="status"`) : rien n'a changé, rien n'est refusé à l'envoi ; le message sous le champ reste celui du contrôle qui retient un envoi (D142). |
| HN-E10S06-8 | `Tab` et `Maj+Tab` agissent sur la ligne du curseur, les suivantes gardant leur indentation (`elementsLus`) ; `Maj+Tab` sur une ligne du premier niveau ne change rien et annonce « Cette ligne est déjà au premier niveau. » ; `Tab` qui descendrait de deux niveaux sous la ligne d'avant annonce « Rien au-dessus de cette ligne. » (D143). |
| HN-E10S06-9 | Un repli ne se fond pas plus qu'un tableau (Retour arrière au début d'un bloc, Suppr à la fin du précédent) : le focus va à sa rangée. |
| HN-E10S06-10 | Tant que la liste de « / » est ouverte, le Texte attend le choix d'un bloc : le différé de 1 200 ms ne l'écrit pas, et la frappe qui ouvre la liste désarme celui d'une frappe d'avant ; la sortie du champ et ⌘S l'écrivent ; liste fermée (Échap, ou un texte qui ne commence plus par `/`), un texte comme « /etc » part au différé dès la frappe suivante (`useChoixParBarre`) (D144). |
| HN-E10S06-11 | La liste de « / » garde l'ordre du menu tant que rien ne suit `/`, puis met les meilleures entrées d'abord (`fuzzyScore`) ; casse et accents retirés par `normalizeTitle`. |
| HN-E10S06-12 | « Séparateur » choisi par « / » met le focus à sa poignée (AC-a1) ; le Texte neuf d'AC-a4 ne suit que `---` tapé. |
| HN-E10S06-13 | Dans un tableau, `Entrée` sur la dernière rangée ne fait rien ; `Maj+Tab` dans la première cellule sort du tableau ; la cellule courante du menu est la dernière qui a eu le focus, la première cellule d'en-tête avant tout focus. |
| HN-E10S06-14 | Une cellule montre son markdown tel qu'il est gardé (barre verticale échappée) ; à l'envoi, seule une barre verticale qui n'est pas déjà précédée d'une barre oblique inverse est échappée. |
| HN-E10S06-15 | Un Texte devenu repli perd les lignes blanches de bord de son corps ; à l'envoi, le résumé perd ses blancs de bord et le corps ses lignes blanches de bord. |
| HN-E10S06-16 | Un tableau aux cellules vides est un bloc vide (`estVide`) : neuf, il ne part qu'avec sa première frappe ; servi puis vidé, il part en `delete_block` avec « Annuler » quand le focus quitte sa rangée ; un geste du menu d'un tableau part comme une frappe ; en conflit, un tableau se compose en texte, une rangée par ligne, une tabulation par cellule. |
| HN-E10S06-17 | Le collage d'un tableur ignore sa fin de ligne finale et lit les fins de ligne CRLF. |
| HN-E10S06-18 | Le menu d'un séparateur n'a ni groupe « Style » ni « Ce bloc se modifie par votre assistant. ». |
| HN-E10S06-19 | `Tab` sans Maj sur la poignée d'une liste à puces, d'une liste numérotée ou d'un tableau simple porte le focus au premier élément de la tabulation après la rangée (`tabIndex` positif ou nul, ni désactivé, ni sous `[hidden]` ou `[inert]`, ni non rendu : contenu d'un `<details>` fermé, ou `checkVisibility()` là où le navigateur l'a) ; rien après la rangée : la touche reste au navigateur, et les éléments de la tabulation de la rangée qui suivent la poignée passent à `tabIndex = -1` jusqu'au `setTimeout(0)` suivant, qui rend à chacun son attribut ; les autres blocs gardent l'ordre du DOM ; `Maj+Tab` et l'ouverture du menu sont inchangés. |
| HN-E10S06-20 | `---`, `***` ou `___` ne fait un séparateur que si le Texte valait juste avant un début de la marque (vide, `-`, `--`…) : « ---x » raccourci en `---` reste un Texte. |
| HN-E10S06-21 | `simpleTableOf` (`schemas/blocks.ts`) est le seul lecteur du `data` d'un tableau simple : ce qui n'est pas un tableau se lit vide, une cellule qui n'est pas une chaîne `""`, un alignement inconnu `null` ; « Convertir en tableau de données » n'est au menu que d'un tableau simple qui a au moins une colonne, et ne fait rien pour un autre bloc. |
| HN-E10S06-22 | Dans l'éditeur, un repli s'ouvre déplié (insertion, conversion, ouverture de la page) ; son chevron le replie et le déplie à l'écran seul : l'état n'est ni envoyé ni gardé (ni `blocks.ts` ni le markdown ne changent) et se perd quand la rangée se remonte. Seul le chevron replie : la pastille porte le champ du résumé. Au repos, une clôture de code du corps se lit en texte, comme dans un Texte au repos, et non en bloc préformaté comme à la lecture. |

### E10-S02 — Fichiers : dépôt, images, « Voir », dépôt par lien à usage unique

Les hypothèses HN-E10S02-1 à 23, prises au cadrage, se lisent dans la story.

| Id | Règle |
|---|---|
| HN-E10S02-24 | `node` de `fileRequestSchema` est le chemin du nœud (`nodePathSchema`), lu par `findNode`, ancien chemin compris. |
| HN-E10S02-25 | Le type d'un fichier vient de l'extension de `name` (`FILE_TYPES`) : le `mime` du corps est reçu (255 caractères au plus, vide admis) mais jamais cru ; la ligne porte le type de l'extension, signé dans l'URL d'envoi et rendu dans `upload.headers` (D148). |
| HN-E10S02-26 | Sans stockage, `GET files/<id>` et `POST files/<id>/complete` refusent aussi par `not_enabled`, avant de lire la ligne. |
| HN-E10S02-27 | La demande d'envoi ne contrôle pas le genre du nœud : un fichier se joint à tout nœud que la personne écrit, et `writeNode` décide quels blocs le citent (HN-E10S02-74). |
| HN-E10S02-28 | Le bloc `file` et la forme de l'image interne (`file_id` ou `src`, jamais les deux ; `width`) entrent dans une seule redéfinition de `blocks_shape_check`, à la parité de `schemas/blocks.ts`. |
| HN-E10S02-29 | Privilèges de `files` à `authenticated` seul, sans `service_role` : insertion attribuée à l'appelant sur un nœud de l'organisation, mise à jour de `status` seule. |
| HN-E10S02-30 | Le quota se lit sous le verrou consultatif de classe 7501, clé `org_id` (`database-patterns.md § Transactions`). |
| HN-E10S02-31 | Adresses S3 en chemin (`<endpoint>/<bucket>/<clé>`), servies par MinIO, Scaleway et le point d'accès S3 de Supabase ; un fournisseur qui n'admet que l'adresse en sous-domaine demanderait une option, non livrée (D148). |
| HN-E10S02-32 | Une panne du bucket (réseau, délai, 5xx) rend `internal` « File storage unreachable. Retry later. », le détail au log sans l'adresse signée ; `readFileText` au-delà de 4 Mo lus rend `too_large` ; un objet que le bucket rend en 403 ou 404 vaut absent : `not_found` à la lecture du texte, `head()` nul (`conflict` à la confirmation, `available: false` pour une carte). |
| HN-E10S02-33 | `POST files` répond 201 ; `POST files/<id>/complete` prend le corps JSON de tout `POST` de la porte (`{}`), sans le lire. |
| HN-E10S02-34 | `PLATFORM_STORAGE_ENDPOINT` qui n'est pas une adresse `http(s)` lève `PlatformConfigError` ; `null` reste réservé à une variable absente. |
| HN-E10S02-35 | `files` est dans `TABLES` (`scripts/lib/org-transfer.mjs`), `created_by` nul pour une personne absente, `node_id` remplacé ; une ligne `files` dans A et dans B, dans l'organisation source d'`org-transfer.test.ts`, et l'état de création `pending` dans `isolation/tables.test.ts`. |
| HN-E10S02-36 | Le genre d'un fichier joint vient de son extension : une image (`png`, `jpeg`, `jpg`, `gif`, `webp`, `svg`) devient un bloc `image`, même choisie par « Fichier » ; tout autre type admis, un bloc `file`. |
| HN-E10S02-37 | L'écran apprend l'état du stockage par `GET files` au premier geste qui en a besoin (« + » survolé ou atteint au clavier, collage, dépôt), jamais au montage ; un échec n'est pas retenu ; tant qu'il ne le sait pas, « Image » et « Fichier » n'apparaissent pas. |
| HN-E10S02-38 | « Image » et « Fichier » sont au « + » seul (groupe « Insérer »), pas dans « / ». |
| HN-E10S02-39 | « Image » et « Fichier » ouvrent un `Dialog` (zone de dépôt d'E10-S01, `accepte`) qui dit types et limites avant la sélection. |
| HN-E10S02-40 | Un dépôt ou un collage joint le premier fichier seul. |
| HN-E10S02-41 | Un fichier lâché sur une rangée est reçu par la rangée (`rangee-de-bloc.tsx`) ; stockage désactivé, le comportement d'E10-S01 ; extension non admise, le refus nomme les formats admis, sous le bloc. |
| HN-E10S02-42 | Texte alternatif et largeur s'écrivent par `modifierLeBloc` (différé de 1 200 ms, envoi à la sortie du champ) ; `image` et `file` sont dans `SANS_TEXTE` (`operations.ts`) : jamais vides. |
| HN-E10S02-43 | La carte d'un fichier demande une fois montée, par un `useEffect`, `GET files/<id>?check`, qui rend `{ data: { available } }` sans redirection (`fileAvailability` : ligne `ready` sous la lecture du nœud, puis `head()`) ; « Fichier indisponible » sur `available: false`, `not_found` ou `not_enabled`, rien sur une panne ; exception écrite de `state-management.md § Règle d'or`. |
| HN-E10S02-44 | « Voir » d'un `html` ou d'un `md` mène à `?view=<id>`, relatif à l'adresse où l'on est (`/n/…` comme `/p/<jeton>/…`). |
| HN-E10S02-45 | Hors de `read`, le markdown d'un fichier cite la route relative (`filePath`, `schemas/files.ts`) ; seul `read` la rend absolue (HN-E10S02-68). |
| HN-E10S02-46 | L'envoi en cours est une rangée locale `depot-local`, jamais envoyée (sans forme, hors de `SANS_TEXTE`), sans « + » ni poignée ; elle retient la reprise des blocs servis jusqu'à sa confirmation ou son retrait. |
| HN-E10S02-47 | Un `PUT` au stockage hors 2xx se lit `internal` (« Le stockage des fichiers ne répond pas »), une coupure du réseau `reseau`. |
| HN-E10S02-48 | Un CSV importé en tableau depuis une page (AC-b5, AC-b6) prend la première adresse libre `<page>/<segment du nom>` (`adressesAEssayer`). |
| HN-E10S02-49 | Largeurs d'une image : `small` un tiers, `medium` deux tiers, `full` toute la colonne de lecture. |
| HN-E10S02-50 | L'écran propose les fichiers dans tout nœud qu'il écrit (page, procédure, Contexte) ; tranchée par HN-E10S02-74. |
| HN-E10S02-51 | `20260929200000_platform_files.sql` est la migration unique de la story, complétée lot par lot et appliquée aux seules bases locales avant la fusion ; elle est figée dès son application au projet partagé (D124). |
| HN-E10S02-52 | La policy d'insertion de `files` exige `status = 'pending'` : seule la mise à jour rend une ligne `ready`, duplication et dépôt par lien compris. |
| HN-E10S02-53 | L'URL de lecture sert le type de l'extension du nom (`FILE_TYPES`), jamais le `mime` de la ligne ; `application/octet-stream` pour un nom sans type admis. |
| HN-E10S02-54 | L'écran traduit un refus par sa cause, retrouvée par le fichier envoyé (`invalid_arguments` sur une extension admise : nom refusé ; `too_large` d'un fichier de 0 octet : fichier vide) ; le service ne change ni ses codes ni ses messages. |
| HN-E10S02-55 | `GET public/<jeton>/files/<id>` (302, `PUBLIC_HEADERS`) et les routes d'un lien sur la page publique (`routeDesFichiers` : image, « Voir », « Télécharger ») sont livrés avec « Voir » (lot c). |
| HN-E10S02-56 | `public_file_by_token` rend `id`, `name`, `mime`, `size` et `node_path`, jamais la clé (composée par `objectKey`) ; un fichier est servi s'il est cité par un bloc publié `file` ou `image` de son nœud. |
| HN-E10S02-57 | Un `.md` que l'analyse tolérante ne sait pas garder en blocs se montre entier en un bloc de code, sans phrase de plus. |
| HN-E10S02-58 | La visionneuse d'un `html` ne lit pas l'objet : un `html` qui n'est pas de l'UTF-8 se dit dans l'iframe, en texte brut de la route ; « Ce fichier n'est pas en UTF-8 : téléchargez-le. » vaut pour un `.md` (raison `not_utf8` d'`objectText`). |
| HN-E10S02-59 | `?view` vaut sur tout nœud qu'on lit sauf un tableau ; illisible ou répété, il vaut un identifiant vide : « Fichier introuvable », jamais l'écran du nœud (`fileViewParamSchema`). |
| HN-E10S02-60 | La route HTML d'une personne connectée vérifie le jeton de session, l'identité, puis `Sec-Fetch-Dest` et le fichier (`fileHtml`) ; sans session, 401 même hors iframe ; toute erreur se sert `<code>: <message>` en `text/plain; charset=utf-8` aux autres en-têtes d'ADR-017 ; tout refus de lecture est `not_found: Unknown file.` (`not_found: Not found.` par un lien public). |
| HN-E10S02-61 | L'iframe ne se monte qu'après l'hydratation (`useSyncExternalStore`) : un second chargement est une navigation de son contenu (O1) ; « Recharger » monte une iframe neuve. |
| HN-E10S02-62 | Sur la page publique, la carte d'un fichier ne relit pas sa disponibilité (`?check` exige une session) ; seule l'`onError` d'une image y dit « Fichier indisponible ». |
| HN-E10S02-63 | La bannière est une `Alert` en `role="note"` ; en public elle nomme la marque de l'adresse (`nomAffiche`), sinon « l'organisation » ; la visionneuse en échec se titre « Fichier », introuvable « Fichier introuvable ». |
| HN-E10S02-64 | L'hôte de référence pose `nosniff` et `Permissions-Policy` partout, `X-Frame-Options` et sa `Referrer-Policy` partout sauf les deux routes HTML (source à lecture anticipée négative de `next.config.ts`). |
| HN-E10S02-65 | Les liens internes d'un `.md` vu par un lien public se lisent en texte : aucun n'est dans `links` du lien. |
| HN-E10S02-66 | La spec e2e d'AC-c6 (`e10s02-voir`) dépose ses fichiers par les routes du paquet et se saute quand le serveur n'a pas de stockage (`GET files` → `enabled: false`). |
| HN-E10S02-67 | Un fichier se rend `[<nom> (<taille>, <type>)](<route>/<id>)` : nom tel quel, taille en octets exacts (`fileSizeText` : « 1,200 bytes », « 1 byte »), type par l'extension (le `mime` de la ligne sans extension admise) ; `parseMarkdown` relit la ligne de droite à gauche (dernière `](`, dernière ` (`). |
| HN-E10S02-68 | `<origine>` est celle de la porte MCP (`McpDeps.origin`, lue par `webUrl`), sinon la route relative ; seul `read` la reçoit : `context`, `staleState`, le `.md` d'une page et la visionneuse servent la route relative, que `parseMarkdown` relit aussi. |
| HN-E10S02-69 | Une ligne seule `[<étiquette>](<origine facultative>/api/platform/files/<uuid>)` est un bloc `file`, en strict comme en tolérant, uuid en minuscules ; une étiquette hors forme donne nom = étiquette, taille 1, `application/octet-stream`, que la ligne relue remplace ; un lien public ou d'une sous-route reste un paragraphe. |
| HN-E10S02-70 | `writeNode` ne relit que les fichiers que le document (brouillon, sinon publié) ne citait pas encore (`ready`, joint au nœud) ; un fichier déjà cité par un bloc `file` passe avec ses métadonnées (restreinte par HN-E10S02-82). |
| HN-E10S02-71 | Une création qui cite un fichier est refusée avant l'insertion du nœud (phrase d'AC-d3) ; le dépôt par lien crée la page, puis joint le fichier par une seconde écriture. |
| HN-E10S02-72 | En mode tolérant, un fichier non joint à la page devient un bloc `code` qui porte son markdown, compté dans `kept_as_text`. |
| HN-E10S02-73 | Une image jointe réécrite sans largeur garde la largeur du bloc qui citait le même fichier. |
| HN-E10S02-74 | `writeNode` admet un bloc `file` ou une image jointe dans tout nœud à blocs (page, procédure, Contexte), jamais dans un tableau ; l'écran les propose partout où il écrit des blocs. |
| HN-E10S02-75 | `read {file}` avec `section`, `outline`, `since_revision` ou `draft` : « Give only one of section, outline, since_revision or file; file reads the text of a file, without draft. » ; `refs` ignoré ; en-tête `<nom> (<taille>)`, données `{ path, file: { id, name, size, type } }`, sans `next_actions` ; tout nœud visible, publié ou non ; `file` n'entre dans la clé du curseur que donné. |
| HN-E10S02-76 | La description de `read` finit par « To read an attached html, md, txt or csv file, give file = the id from its link /api/platform/files/<id>. » |
| HN-E10S02-77 | `readFileText` dit « only html, md, txt and csv files are read as text. » ; le refus de taille garde « a text file (html, md, txt, csv) ». |
| HN-E10S02-78 | Créer un tableau par import (AC-b5, AC-b6, `upload.link` `csv create`) n'exige que l'écriture sur le parent (D150) ; le bloc écrit après `complete` et celui du dépôt par lien sont publiés aussitôt, sauf `publish: false` (D135). |
| HN-E10S02-79 | Un fichier lâché ou collé sur le Texte local d'une page vide se joint après ce Texte, qui reste. |
| HN-E10S02-80 | La rangée `depot-local` reste dans les blocs que l'éditeur rend à la publication ; seul le Texte local d'une page vide en est exclu (`portage-ecrans.md § 6`). |
| HN-E10S02-81 | Le `.md` téléchargé d'une page publique (`pageMarkdown`) cite ses fichiers par la route relative d'une session. |
| HN-E10S02-82 | Un bloc `file` dont les métadonnées ne viennent ni d'une ligne relue `ready` jointe au nœud ni d'un bloc `file` déjà dans le document est refusé (phrase d'AC-d3), ou gardé en `code` en mode tolérant. |
| HN-E10S02-83 | Après « Recharger », le focus va à l'iframe neuve ; l'avis vit dans une région `role="alert"` montée vide avec l'iframe, l'`Alert` en `role="presentation"`. |
| HN-E10S02-84 | La porte vérifie la session en deux temps, `verifiedSession` (jeton, `verifyToken`, `verifiedCaller`, `createPlatformDb`) puis `sessionIdentity`, dans `api/session.ts` : dans `handlePlateforme`, l'origine d'une mutation, `cell` et le 404 d'une route inconnue passent entre les deux. |
| HN-E10S02-85 | `read {file}` contrôle le curseur avant de lire l'objet, dans sa seule branche. |
| HN-E10S02-86 | Canal ouvert O7 : le script d'un HTML vu par un lien public lit le jeton dans `location` et peut l'envoyer (O1) ; ce jeton ne donne que ce que le lien sert déjà, et seul un rédacteur de la page y joint un tel script, sous la bannière (ADR-017 § 2). |
| HN-E10S02-87 | Sans les cinq variables de stockage, `org:export` d'une organisation qui a des fichiers `ready` échoue après sa lecture, avant le JSON et `<fichier>.files/`, et `org:import` d'un document qui porte des fichiers juste après la lecture des variables, avant toute connexion : message qui nomme les cinq (`requireTransferStore`), code 1 ; sans fichier, le transfert passe sans elles. Un objet absent est nommé, jamais une erreur ; une panne du stockage à l'export lève avant le JSON ; à l'import, les objets partent après le commit des lignes, un envoi en échec est nommé, code 1. |
| HN-E10S02-88 | La duplication copie les fichiers qu'un bloc publié d'un nœud copié cite (`file`, image jointe), eux seuls, `pending` compris. |
| HN-E10S02-89 | Les fichiers copiés comptent au quota : `requireQuota` relit la somme sous le verrou 7501 dans la transaction de la duplication ; au-delà de 10 Go, `too_large` (raison `quota`), et rien n'est écrit, la copie de page comprise (D149). |
| HN-E10S02-90 | `duplicate_subtree` rend, par nœud copié, `copied_files` (ancien identifiant → nouveau) ; retirée puis recréée, son type rendu changeant. |
| HN-E10S02-91 | Après le commit, les copies d'objets partent ensemble, puis une seule mise à jour sous la session passe les lignes copiées à `ready` ; sans stockage, elles restent `pending`, nommées au log (`[platform] files: copy left pending <clé>`). |
| HN-E10S02-92 | La purge supprime les lignes `files` dans la même instruction que les nœuds (deux `delete` en `with`), limitée aux nœuds vraiment emportés ; les objets partent après le commit (`removeObjects`). |
| HN-E10S02-93 | Le filtre `ready` de l'export s'écrit dans la carte (`TableSpec.only`, lu par `orgRowsSql`) ; l'empreinte d'E09-S04 désigne un fichier par `file:<chemin de son nœud>/<nom>` ; `transferEnv` lit les cinq variables en facultatives, masquées. |
| HN-E10S02-94 | Le lien public d'une copie sert le fichier copié, jamais celui de l'original. |
| HN-E10S02-95 | Le formulaire de dépôt est une page de l'hôte, `/upload/<token>` sous `(dashboard)`, qui monte `EcranDeDepot`, et une route à session, `POST /api/platform/uploads/<jeton>/form`, servie avant la table de dispatch, sous le contrôle d'origine des mutations (D146). |
| HN-E10S02-96 | `form_url` est rendu par chaque `upload.link`, pas seulement quand `source_url` échoue. |
| HN-E10S02-97 | L'identité d'un envoi se reconstruit par `identityInOrg(db, org, { userId, email })` sur l'organisation lue à l'adresse ; un e-mail absent vaut `""` ; `not_member` : « The person who asked for this link is no longer a member of <organisation>: nothing was written. » |
| HN-E10S02-98 | `WriteOrigin` (agent) gagne `file?: { replace }`, posé par le seul service du dépôt : un `.md` déposé se lit en tolérant sous la provenance `agent` ; `replace` applique les opérations à une page vide ; `wholeFile` d'`applyOps` saute `SECTION_MAX`, `OP_TEXT_MAX` tenu par des morceaux de 40 000 caractères ; `PAGE_MAX` et `BLOCKS_MAX` restent. |
| HN-E10S02-99 | Le premier titre `#` d'un `.md` déposé est retiré de son corps (`readPageMarkdown`) ; le titre de la page vient du ticket en `create` et ne change pas en `replace` ; un `.md` vide sous son titre est refusé (`invalid_arguments`). |
| HN-E10S02-100 | Fichier en `create` : page créée en brouillon, puis ligne et objet (`storeFile`), puis bloc `file` écrit sous la révision 0 et publié selon `publish` ; un échec après la création retire la page (HN-E10S02-117, qui remplace « laisse la page en brouillon »). En `attach`, le bloc s'écrit sous la `base_revision` du ticket, après le dernier bloc du document (`insert_after`, bloc structuré). |
| HN-E10S02-101 | `name` est facultatif pour `md` et `csv` : il nomme le fichier dans la provenance d'un CSV (« Importé de <nom> », défaut `upload.link`) et dans les commandes rendues (sinon `<file>`). |
| HN-E10S02-102 | La ligne de journal d'un envoi s'écrit sous la session de la personne du ticket, après la réponse (`defer`) à la porte de `curl` ; une personne retirée : aucune ligne tentée, `console.error("[platform] uploads: …")`. |
| HN-E10S02-103 | `source_url` est masquée au journal par son nom normalisé exact (`MASKED_NAMES`, `server/journal.ts`), ses voisines restant lisibles ; un téléchargement en échec est un résultat, pas `isError` : la cause sans l'adresse, et `form_url`. |
| HN-E10S02-104 | Toute adresse IPv6 qui porte une IPv4 (mappée, NAT64, `::/96`, 6to4, Teredo) est refusée entière ; la résolution contrôlée est celle de la connexion (`lookup`), toutes les adresses rendues doivent être publiques ; une adresse IP écrite dans l'URL se contrôle avant la requête. |
| HN-E10S02-105 | RLS d'`upload_tickets` : lecture par un membre de ses tickets et des tickets expirés, insertion attribuée à l'appelant, suppression des seuls tickets expirés, aucune mise à jour, aucune clé vers `members`. |
| HN-E10S02-106 | Textes de la porte sans session : refus 1 « Requests from a browser are refused: send the file with curl, or use the form link. » ; une seule `not_found` « Unknown upload link: it may have expired (15 minutes) or already been used. Ask for a new link. » (jeton mal formé, ticket inconnu, expiré, servi ou d'une autre organisation, adresse sans organisation) ; 200 pour un envoi écrit. |
| HN-E10S02-107 | `storeFile` partage avec la demande d'envoi l'insertion `pending` sous quota (`insertPending`) et avec la confirmation `markReady` ; `admittedType` et `checkSize` décident type et taille au lien et à l'envoi. |
| HN-E10S02-108 | Le ticket porte deux jetons, gardés en empreinte : celui de `curl` (`token_hash`) et celui du formulaire (`form_token_hash`) ; chaque porte n'accepte que le sien (`consume_upload_ticket(p_org, p_hash, p_form)`), `used_at` commun : le premier consommé rend l'autre `not_found` (ADR-018 § 8, D147). |
| HN-E10S02-109 | Après un refus qui a servi le lien, la zone de dépôt est retirée et une phrase dit que le lien ne sert plus (`DEPOT.clos`), focus à l'alerte ; elle reste pour un refus du réseau, un 401, un `internal` ou un fichier de plus de 1 Mo. |
| HN-E10S02-110 | La ligne d'un `.md` gardé en mode tolérant se lit « N elements kept as text. » (« 1 element kept as text. »). |
| HN-E10S02-111 | `errorResponse`, `asPlatformError`, `addressOrigin` et `requireSameOrigin` vivent dans `api/session.ts`, lus par `handler.ts` et `api/uploads.ts` ; un refus de la route du formulaire ne porte plus `Cache-Control: private, no-store`, et une panne inattendue des deux routes du dépôt se journalise `[platform] api: unexpected error`. |
| HN-E10S02-112 | À l'import, un ancien identifiant de fichier qui n'est pas un uuid est refusé avant de bâtir son chemin (nommé, code 1) ; à l'export, un dossier `<fichier>.files/` déjà là arrête le script comme le JSON (« relancez avec --force »), et `--force` le vide avant l'écriture. |
| HN-E10S02-113 | `copyFileObjects` copie les objets par lots de 8 (`COPIES_AT_ONCE`) ; un échec dans un lot n'arrête pas les suivants. |
| HN-E10S02-114 | La confirmation (`completeFileUpload`) et l'envoi par le serveur (`storeFile`) ne comparent que la taille de l'objet relu (`HEAD`) à celle de la ligne, jamais son type : Supabase Storage relit un objet `text/html` en `text/plain` (garde contre l'hébergement de pages), et AC-a4 refusait tout fichier HTML. Sûr : le type est signé dans l'URL d'envoi, et aucune lecture ne sert celui de l'objet (`readResponse`, route isolée d'ADR-017, `objectText`). Le bucket en mémoire des tests relit `text/html` en `text/plain` comme Supabase (ADR-016 § 4 : « vérifie sa taille »). |
| HN-E10S02-115 | Le bucket en mémoire perd aussi les paramètres d'un type (`; charset=…`) au `HEAD`. La documentation de Supabase Storage n'en dit rien ; sources publiques : le rendu de supabase/storage ne réécrit que `text/html` (`normalizeContentType`), et le `charset` se perd par la normalisation du `HeadObject` S3 (supabase/storage#816, correctif #975 fermé sans fusion). `FILE_TYPES` ne porte aucun paramètre : ni l'un ni l'autre n'explique l'échec de `.md`, `.txt` et `.svg` sur oto-steel en 1.1.2 (FB-0012). Vérifié : sur ce bucket, les sept types (md, txt, html, svg, png, pdf, csv) passent avec bcb7784 et, avec la comparaison de type de la 1.1.2, seul `html` échoue. Cause des trois autres non établie sans le bucket réel (hypothèse : types MIME admis du bucket, ou refus du `PUT`) : les messages d'HN-E10S02-116 la diront au prochain essai, le log serveur la nomme déjà. |
| HN-E10S02-116 | Un envoi par le serveur en échec dit ce qui a manqué, jamais « unreachable » quand le stockage a répondu : « <nom> could not be stored: » puis « the file storage could not be reached » (signature, réseau, délai), « the file storage refused it (HTTP <statut>) », « the file storage did not keep it » (`HEAD` sans objet) ou « the file storage kept <n> bytes instead of <m> », puis « Nothing was attached. » ; code `conflict` inchangé ; la consigne est posée par l'appelant (`writeFile`) : « Ask for a new upload link and send it again. » sur une page existante. |
| HN-E10S02-117 | Un échec après la création de la page d'un fichier (stockage, bloc) la retire : sous le verrou de l'arbre (7301), une suppression bornée au nœud créé par l'envoi, jamais publié (révision 0), créé par la personne du ticket, sans bloc, sans sous-page ni fichier `ready` autre que celui que l'envoi vient de stocker ; ses lignes `files` (`pending`, et celle de ce fichier) partent dans la même instruction, leurs objets après le commit ; le message finit par « The page <chemin> it created was removed: ask for a new upload link and send it again. ». Une page qui a reçu autre chose, ou un retrait en panne (log serveur), reste : « … stays, as an unpublished draft: ask for an upload link with mode attach and base_revision 0 to send the file there. ». Le journal garde la ligne de l'envoi en erreur. |
| HN-E10S02-118 | Un `.md` ou un CSV par `source_url` n'est téléchargé que servi en `text/*` autre que `text/html`, en `application/octet-stream` ou sans type (`textSourceFailure`, paramètres ignorés) : sinon un résultat d'échec, comme un téléchargement manqué (HN-E10S02-103), qui nomme le type servi, le ticket libre pour le formulaire. Un `.md` dont le texte commence par `<!doctype html` ou `<html` (blancs de tête ignorés, sans casse) est refusé par toute porte (`invalid_arguments`, rien d'écrit). Le rendu échappait déjà ce HTML (`tests/unit/nodes-parse-tolerant.test.ts`, « should render the HTML of an imported markdown as escaped text ») : le refus évite une page remplie du source d'un site, pas une faille. |
| HN-E10S02-119 | Le repli quand `curl` n'atteint pas la plateforme (un proxy répond 403, shell de claude.ai) ou sans shell : un `.md` par `write`, un CSV par `table.import`, un autre fichier par le formulaire (`form_url`) donné à la personne ; dit par une phrase ajoutée à la description d'`upload.link` (ADR-002 : allongée seulement, golden queries à rejouer), par la dernière ligne du lien et par le texte d'un téléchargement en échec. Aucun argument nouveau (base64 refusé par JB). |
| HN-E10S02-120 | La porte sans session sert toute méthode sur `uploads/<jeton>` : hors `POST`, `forbidden` (403, texte brut « Only POST is accepted here: send the file with curl --data-binary, or use the form link. »), avant le jeton, sans base, sans consommer le ticket ; pas 405, absent de la liste fermée des codes (`PLATFORM_ERROR_CODES`), et le contrat annonçait `forbidden`. Un `GET` rendait le 401 JSON des routes à session. |
| HN-E10S02-121 | Un chemin pris rend déjà `conflict` (`notAvailable`) : la porte MCP ne sert que le message (« Path … is not available: choose another path. »), le code va au journal (« conflict: … ») et à `curl` ; le contrat d'`upload.link` cite désormais ce message avec son code. |
| HN-E10S02-122 | Journal (FB-0014) : « N with errors » compte les conversations qui ont au moins une erreur, pas les appels (`withErrors`, `journal-read.ts`) ; `last_at` est la dernière ligne du même code `ctx`, en UTC ; un appel sous un autre code (contexte rouvert) ouvre une autre conversation ; les refus d'avant la consommation (méthode, `Origin`, jeton, taille, lien inconnu) ne s'écrivent pas (aucune personne connue, AC-f9) ; un envoi par `source_url` refusé après la consommation écrit deux lignes en erreur (l'appel `call` et l'envoi `uploads`). Aucun défaut trouvé dans le calcul. |
| HN-E10S02-123 | Le type d'un fichier déposé reste celui de son extension, sans contrôle de ses octets (décision de JB, FB-0014) : sans risque, le fichier est servi au type de son extension, jamais à celui des octets (`readResponse` le signe dans l'URL de lecture, `attachment` hors images matricielles, PDF, `txt` et `csv`), et la route isolée d'un HTML (ADR-017) pose `X-Content-Type-Options: nosniff`. Un en-tête `nosniff` du bucket lui-même n'est pas garanti par le port (hypothèse : sans effet, le type et la disposition signés suffisent). |
| HN-E10S02-124 | La taille d'un objet (`head()` de l'adaptateur S3) se lit par un `HEAD` qui envoie `accept-encoding: identity`, posé après la signature et hors d'elle (un CDN réécrit cet en-tête vers l'origine) : `fetch` annonce gzip par défaut, et le CDN devant Supabase Storage compresse un objet relu `text/plain` (tout `.html`), sans `content-length` ; la confirmation lisait `NaN` et refusait tout HTML (vérifié sur le bucket : même objet, 156 octets, `content-length` exact en `identity`). Un `content-length` absent, non numérique ou sous un `content-encoding` autre qu'`identity` se rabat sur `content-range` d'un `GET range: bytes=0-0` (`bytes 0-0/<taille>`, 416 : objet vide, 0) ; sinon la taille est `null` (jamais `NaN`), les en-têtes lus vont au log serveur (`storage gave no size`), et la confirmation rend `internal` en gardant la ligne `pending` et l'objet (une confirmation plus tard les passe à `ready`, la purge d'une heure sinon) ; l'envoi par le serveur dit « the file storage gave no size ». Une taille différente se journalise (`size mismatch`, identifiant, tailles annoncée et stockée) avant la suppression de la ligne et de l'objet, et le refus dit les deux tailles. Le type envoyé ne change pas : stocker un HTML en `application/octet-stream` n'empêche pas Supabase de le relire `text/plain`. Le bucket en mémoire ne joue pas le CDN (son `head()` n'est pas une requête) : l'adaptateur S3 se teste sur un `fetch` qui le simule. |
| HN-E10S02-125 | Après un dépôt réussi, le formulaire ouvre l'adresse `url` que rend le dépôt (même origine que le navigateur, la route du formulaire l'exige ; `/n/<chemin>` imposé par le paquet, D146), sans prop de préfixe posée par l'hôte, après 1,5 s de lecture, par `useHote().naviguer` ; « Ouvrir la page » reste offert ; pas de `window.close()`, qui n'agit que sur un onglet ouvert par un script. |
| HN-E10S02-126 | Un fichier joint `html` ou `md` déposé mène à sa visionneuse (`?view=<id>`, ce que fait « Voir », `adresseDeVue`) ; un `txt`, un `csv` ou un `pdf` joint, que « Voir » ouvre depuis le stockage hors de la page, un `.md` importé en page et un CSV importé en tableau mènent à la page. Le message cite le chemin, pas le titre, que `UploadDone` ne porte pas. |

### E11-S04 — Routage des procédures : questions « comment », égalités, formulations du résumé, fautes de frappe

| Id | Règle |
|---|---|
| HN-E11S04-1 | Les résumés du jeu « todo » (`tests/integration/fixtures/todo-routing.cases.ts`) sont reconstitués : ils reproduisent les égalités et les scores bas du rapport de tests sur le code d'avant. |
| HN-E11S04-2 | Seuil 0,65 et écart 0,1 inchangés ; seuls les poids du mélange se recalibrent, sans ADR (`docs/architecture.md`, « Flexible sans ADR »). |
| HN-E11S04-3 | Le routage tente toujours la correction, en plus de la demande telle quelle (pas en dernier recours comme `find`) ; mots de 5 à 40 lettres, seuil 0,3, sans l'exception du dernier mot. |
| HN-E11S04-4 | La correction par le lexique s'écrit une fois, dans `platform.lexicon_fix` (forme du mot, absence du lexique, mot le plus proche) ; `search_content` l'appelle et garde en ligne son exception du dernier mot, cherché par préfixe. |
| HN-E11S04-5 | Les poids des mots rares se comptent sur les candidates lisibles de l'appel, jamais sur toute l'organisation : un nœud illisible ne change aucun score. |
| HN-E11S04-6 | Remplacée par E11-S16 : plus de consigne par genre de phrase sans étapes servies ; les candidates (`CANDIDATES_SHOWN`, 3) viennent par titre et résumé, et le modèle juge si la phrase demande d'agir, d'expliquer ou de répondre. Seule une procédure servie sur une demande « comment » garde « explain these steps, and run them only if the user asks ». |
| HN-E11S04-7 | Une question « comment » servie reçoit les étapes et « explain these steps, and run them only if the user asks » (ADR-003 § 4). |
| HN-E11S04-8 | Aucun champ nouveau dans `structuredContent` : `data_question` vaut `false` pour `how` et `request`. |
| HN-E11S04-9 | `route_candidates` et `search_content` excluent la corbeille (`deleted_at is null`) avant leur coupe ; le service garde `nodeLevels` après la fonction. |
| HN-E11S04-10 | Aucune branche de présélection pour une formulation contenue dans la demande : ses mots sont des lexèmes de la demande, que la branche plein texte trouve. |
| HN-E11S04-11 | La story livre son propre fichier de migration ; le pilote le réunit dans la migration unique de 1.1.0 (fiches D131, D145, D124). |
| HN-E11S04-12 | Les formules de demande (`REQUEST_FORMULAS` de `server/routing.ts`) forment une liste fermée écrite dans le code, comme les interrogatifs. |
| HN-E11S04-13 | Le seuil de la correction est la clause `set pg_trgm.similarity_threshold = '0.3'` de `lexicon_fix`, sans paramètre : ses deux appelants corrigent à 0,3. |
| HN-E11S04-14 | Quand des étapes sont servies, la ligne du routage ne change pas, sauf la phrase `how` ; les autres candidates y sont déjà listées. |
| HN-E11S04-15 | Une seule candidate de score ≥ 0,30 : la consigne n'en propose qu'une ; aucune procédure sous `SHOW_THRESHOLD` n'est ajoutée pour atteindre trois. |
| HN-E11S04-16 | `WEIGHTS` = texte 0,25, formulation 0,30, lexèmes 0,45 (dans les lexèmes, 0,75 titre et résumé, 0,25 titre seul) : le seul point d'une grille au pas de 0,05 qui tient le jeu « todo » sans baisser Acme ni le pilote. |
| HN-E11S04-17 | Le seuil de présélection sans lexème commun reste 0,43 (HN-E01S13-5), recalculé sur les poids nouveaux. |
| HN-E11S04-18 | `lexical_title` lit `to_tsvector('platform.fr', norm_words(title))`, la normalisation qu'emploient déjà les lexèmes du nœud. |
| HN-E11S04-19 | Rareté et correction : `df` compte un lexème porté tel quel ou par sa correction ; la demande corrigée entre par des branches `union`, qui gardent les index de la présélection. |
| HN-E11S04-20 | La migration redit les privilèges de `search_content` recréée (`revoke … from public`, `grant … to authenticated`) : `check:migrations` exige la révocation de toute fonction créée. |
| HN-E11S04-21 | Le retour arrière de la migration est écrit en commentaire, jamais exécuté depuis le paquet (précédent E05-S13). |
| HN-E11S04-22 | Les doublures de `route_candidates` de `tests/unit/routing.test.ts` dérivent `s_phrase` du texte et `lexical_title` des lexèmes : le mélange y vaut l'ancien, et les tests de filtres, bonus et coupes gardent leurs scores. |
| HN-E11S04-23 | `isDataQuestion` reste exporté (`requestKind(phrase) === "data"`), sans appelant de production : ses tests gardent leur verdict. |

### E11-S09 — Brancher mon Claude, ChatGPT ou Mistral : un guide par onglet, dans une grande fenêtre et sur /connect

| Id | Règle |
|---|---|
| HN-E11S09-1 | Le nom est « Brancher mon Claude, ChatGPT ou Mistral » : le produit s'appelle ChatGPT, « GPT » est le modèle. |
| HN-E11S09-2 | Quatre onglets, Claude Code en dernier ; le guide s'ouvre sur la famille de la connexion la plus récente, sinon claude.ai. |
| HN-E11S09-3 | L'étape 1 de claude.ai garde « Paramètres → Connecteurs », que le lien direct atteint de toute façon ; les libellés de menu de ChatGPT et de Le Chat se relisent au banc, le dev corrige un libellé, pas la structure des étapes. |
| HN-E11S09-4 | « Rechargez la page » est une note de la dernière étape de claude.ai ; les notes « Une adresse par organisation » et « compte principal » de ChatGPT sont retirées ; Mistral n'a pas de phrase de préférences (non mesurée). |
| HN-E11S09-5 | Les demandes à essayer viennent de `usefulProcedures` sur les deux écrans, trois au plus, complétées par les exemples génériques. |
| HN-E11S09-6 | La famille « Mistral » au journal n'existe qu'après le relevé de la signature `initialize` de Le Chat au banc ; d'ici là, `hostFamily` ne la connaît pas. |
| HN-E11S09-7 | La fenêtre de l'accueil n'a plus de lien « Guides d'installation » ; `/connect` reste au menu du compte et dans les métadonnées OAuth. |
| HN-E11S09-8 | Le lien direct de ChatGPT reste `https://chatgpt.com/#settings/Connectors`, non vérifié : l'aide d'OpenAI nomme d'autres chemins (« Settings → Security and login », `chatgpt.com/plugins`) ; relu au banc. |

### E11-S10 — Rail : espace Privé dès la première connexion, équipes où l'on est membre, créateur inscrit, vue Contexte dans le menu

| Id | Règle |
|---|---|
| HN-E11S10-5 | Validée par le responsable d'Oto : l'arbre des écrans d'un admin est celui d'un membre, calculé par le service (`visibleTree` sur l'identité de membre) ; il y voit aussi une page partagée avec lui, son équipe ou toute l'organisation ; ses droits ne changent pas. |
| HN-E11S10-9 | `admin_team create` avec `email` : la personne nommée devient la seule responsable, le créateur reste membre ; la description de l'outil ne change pas. |
| HN-E11S10-10 | Validée par le responsable d'Oto : rien ne relit le rail sans geste ; une personne ajoutée à une équipe par un autre la voit au prochain chargement ou après son prochain geste. |
| HN-E11S10-13 | Tranchée par le responsable d'Oto : le Contexte reste dans le rail (ligne « Contexte · <section> », son « + », glisser-déposer) ; ni bouton info ni ligne retirée ; la fiche D110 ne change pas. |
| HN-E11S10-14 | Tranchée par le responsable d'Oto : les lignes techniques sous chaque titre de la vue « Contexte » (organisation, personne, équipe, connecteurs) sont cachées à l'écran ; l'assistant les reçoit toujours. |
| HN-E11S10-15 | Le code rendu mort part avec la story (`REGLES_OTO`, morceau `regles`, les deux `Regles`, `teteSansEnTete`) ; `SERVED_RULES` reste, servi par `blocks/code.ts`. |
| HN-E11S10-18 | « Contexte » en tête du menu du compte, glyphe `Info`, clé `contexte` ; sans `adresses.contexte`, ni entrée ni commande de la palette. |
| HN-E11S10-22 | « Nouveautés » manquait quand `newsBlock` rend `null` : la vue rend sa section de repli dans les trois cas d'absence. |
| HN-E11S10-A | `ensure_private_space` n'écrit rien sous un `private/<handle>` tenu par une autre personne : ni Contexte, ni changement de propriétaire. |
| HN-E11S10-B | La renumérotation `<handle>_<n>` (handle ancien chemin d'un autre nœud) est sautée quand l'espace de la personne est déjà à `private/<handle>` : un second appel n'écrit rien. |
| HN-E11S10-C | Horodatage de la migration : `20260929160000`, après `20260929140000` d'E11-S04 ; le pilote la réunit dans la migration unique de 1.1.0 (fiches D131, D145, D124). |
| HN-E11S10-D | La section « Nouveautés » de repli se place avant les blocs `procedures` et `recent content`, après toutes les autres parties. |
| HN-E11S10-E | `VersLaPartie` ne défile au montage que si l'adresse porte une ancre ; une ancre sans partie amène le haut de la vue (`#haut-de-la-vue`). |
| HN-E11S10-F | Dans l'îlot « Activités » de l'accueil (`h2`), les titres de journée sont des `h3`. |

Limites connues : deux insertions concurrentes sans handle dont l'email a le même radical peuvent
recevoir le même handle, et la seconde échoue (`23505`) ; `unique_handle` est quadratique pour une
organisation qui compte beaucoup de membres sans email.

### E11-S03 — Contexte et conversations : invalidation ciblée des ctx, plafond seul et coupe dite, déplacer et compléter une liste

| Id | Règle |
|---|---|
| HN-E11S03-1 | `feedback` accepte un code `ctx` connu, de la personne et de l'organisation, mais périmé ; un code absent ou inconnu reste `ctx_missing`. Validée par le responsable d'Oto (2026-09-29). |
| HN-E11S03-3 | Le déclencheur `bump_rules_version` et `rules_version` restent, comptés, plus lus par la garde. |
| HN-E11S03-4 | Un code sans `contexts` (émis avant 1.1.0) est périmé, sans reprise. |
| HN-E11S03-5 | Les révisions se lisent dans la transaction d'`issueCtx`, en parallèle des corps : une publication entre les deux lectures peut périmer le code une fois de trop, ou le laisser valide sur un corps plus ancien de quelques millisecondes. |
| HN-E11S03-6 | Le contenu comparé est celui des blocs publiés (type, texte, données, clé) ; titre et résumé exclus. |
| HN-E11S03-7 | La révision d'un Contexte se lit sans filtre de niveaux, à l'émission comme à la garde ; un droit ou une équipe changés sans révision n'invalident rien. |
| HN-E11S03-8 | `append` au-delà de 500 éléments (sous-éléments compris) ne prolonge pas la liste : un bloc neuf, dit. |
| HN-E11S03-9 | Une liste numérotée prolongée garde son `start` ; celui du texte ajouté est ignoré. |
| HN-E11S03-10 | La ligne « - (start of page, N characters) » n'est que dans le texte du plan et de `staleState` : compte de sections, `data.outline` et plan de l'écran inchangés. |
| HN-E11S03-11 | `context` n'a pas de champ `cut` dans `data` : le texte dit la coupe. |
| HN-E11S03-13 | Au-delà du plafond, l'ordre est l'ordre servi, sans priorité propre ; l'avis de fin « Context budget reached. Omitted: … » est inchangé. |
| HN-E11S03-14 | Une partie de Contexte coupée par le plafond recule avant un bloc clôturé resté ouvert et finit par le pointeur « This context is cut… » ; la procédure reconnue qui ne tient pas cède la place à son pointeur (N2) ; l'écran reprend ses lignes existantes, sans phrase neuve. |
| HN-E11S03-15 | Les bornes en lignes restent : listes d'un Contexte 20, procédures utiles 60, nouveautés 10, contenus récents 20. Validée par le responsable d'Oto (2026-09-29). |
| HN-E11S03-16 | À la garde, un chemin gardé par le code mais plus attendu (équipe quittée), ou attendu mais pas gardé (équipe rejointe), est ignoré. |
| HN-E11S03-17 | Le refus nomme les chemins changés dans l'ordre des parties (`expectedContextPaths`), bornés par `boundedList`. |
| HN-E11S03-18 | Le nombre du pointeur d'une partie coupée est tiré du plafond (`formatCount(CONTEXT_BUDGET)`, « 35,000 »), jamais écrit en dur. |
| HN-E11S03-19 | Une partie dont même la tête ne tient pas n'est omise que si son corps est servi (`path` posé) ; les autres blocs se coupent à la dernière ligne entière. |
| HN-E11S03-20 | Un instantané de `node_versions` absent pour l'une des deux révisions comparées vaut un changement : le code est périmé. |
| HN-E11S03-21 | Nouveautés et contenus récents, arrêtés à 10 et 20 lignes, n'ajoutent pas de ligne « … and k more » ; les listes d'un Contexte et les procédures utiles disent leur arrêt. |
| HN-E11S03-22 | Dans le résultat d'`append` qui prolonge une liste, « +N » est la croissance de la section en caractères. |
| HN-E11S03-23 | « the list continues with N more items » compte les éléments ajoutés, sous-éléments compris. |
| HN-E11S03-24 | `staleState` d'une page sans titre : la ligne de début de page, puis « - (no section) ». |
| HN-E11S03-25 | Le résultat de `move_block` vers une section cite son titre tel que rangé, non tel que demandé. |
| HN-E11S03-26 | Un titre déplacé vers une sous-section de la section qu'il ouvre n'est pas refusé ; seul `section` égal à la section qu'il ouvre l'est (« a heading cannot move into the section it heads. »). |

### E11-S14 — Harnais de test sans Supabase : les suites du paquet tournent sur un Postgres nu, seules celles de l'adaptateur Supabase gardent le projet

| Id | Règle |
|---|---|
| HN-E11S14-1 | L'identité d'une suite portable est un jeton de la forme « supabase » du port (`sub` = identifiant interne), signé par une clé locale (`testIssuer`) et vérifié par `makeVerifyToken({ jwks, issuer })` injecté ; les personnes viennent de `createSqlFixtures` ; aucun service joint. |
| HN-E11S14-2 | La suite d'isolation se sème par un mode OIDC du script Démo, sur le motif de `platform:staff` (fiche D77 A), `--user` exigé. Confirmée par le pilote (2026-09-30). |
| HN-E11S14-3 | `api-invitations` pose `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_ANON_KEY` par `vi.stubEnv` (adresse en `.invalid`), `signInWithOtp` restant espionné : le client se construit, rien n'est joint. |
| HN-E11S14-4 | La vérification d'un vrai jeton par la JWKS du projet est un `it` explicite de `mcp-http`, gardé par le projet (session par `createFixtures().sessionFor`). |
| HN-E11S14-5 | AC1 et AC2 de `portabilite-schema` (lecture d'`auth.users` et `auth.oauth_*`) restent sur le projet, entiers. |
| HN-E11S14-6 | `tests/unit/gardes-supabase.test.ts` lit les noms importés par `import {…} from`, `export {…} from` et un import dynamique déstructuré (`const {…} = await import(…)`), alias et `type` retirés. |
| HN-E11S14-7 | La liste de `gardes-supabase.test.ts` est fermée dans les deux sens : un fichier qui importe une garde sans y être échoue, une ligne dont le fichier n'en importe plus échoue aussi ; les lignes « pending » des lots b et c en sont sorties avec leur lot. |
| HN-E11S14-8 | Les noms de `describe` passés en A au lot b qui disaient « on the cloud project » disent « on a real database » ; rien d'autre de leur nom ne change. |
| HN-E11S14-9 | Le `describe` principal d'`org-transfer` (export et import par les emails des comptes Auth) reste sur le projet, inchangé ; seul le `describe` AC14 passe en A. |
| HN-E11S14-10 | `--user` du script Démo n'admet qu'un `uuid`, contrôlé par `parseArgs` avant toute connexion (code 1, « Identifiant invalide ») : la base le refuserait après la création de l'organisation. |
| HN-E11S14-11 | Le mode OIDC du script Démo ne vérifie pas que l'identifiant de `--user` est lié à un sujet dans `identities` (contrairement à `platform:staff add --user`) : un jeton de test de la forme « supabase » ne pose sa ligne qu'au premier passage par une porte. |
| HN-E11S14-12 | En mode OIDC, `members.name` et `profile.name` de la personne E2E valent « Compte E2E ». |
| HN-E11S14-13 | Les deux refus de la ligne de commande du mode OIDC se jouent dans `demo-seed-oidc.test.ts`, hors garde ; leurs messages sont exportés par le script (`USER_WITHOUT_OIDC`, `OIDC_WITHOUT_USER`) et comparés à la sortie entière. |

### E11-S01 — Tableaux : créer sans écraser, colonne obligatoire stricte, recherche par mots, révision et auteur, décision de revue par l'agent, preuve par tableau, réglages à l'écran

| Id | Règle |
|---|---|
| HN-E11S01-1 | `create_only` est un indicateur par appel, pas par ligne. |
| HN-E11S01-2 | `create_only` avec `revision` sur une ligne est refusé au schéma ; une valeur nue d'un appel `create_only` suit la règle de l'appel entier (`withoutBareValues`), jugée avant tout. |
| HN-E11S01-3 | L'attribut de colonne `allow_verified_empty` (défaut `true`) vaut pour toute colonne ; « obligatoire strict » = `required: true` et `allow_verified_empty: false`. |
| HN-E11S01-4 | Un mot de `q` se découpe sur ce qui n'est ni lettre ni chiffre, après `normalizeTitle`, et se cherche en sous-chaîne ; aucune borne du nombre de mots au-delà des 200 caractères de `q`. |
| HN-E11S01-5 | `host` et `worker` se rangent à l'écriture dans la provenance ; `host` est la signature de `ctx.host` telle que rangée. |
| HN-E11S01-6 | `table.write` n'a pas d'argument `worker` : il range celui du bail actif de la même personne. |
| HN-E11S01-7 | Un assistant au niveau écriture peut publier `agents_may_decide` et `proof` par `write`, comme tout attribut d'en-tête ; canal ouvert voulu, tracé par la ligne de publication, le journal et la provenance `agent`. Tranchée par le responsable d'Oto (2026-09-29). |
| HN-E11S01-8 | Une décision d'un assistant garde `origin: "agent"`, sans origine nouvelle ni commentaire exigé ; la colonne d'état s'écrit nue. |
| HN-E11S01-9 | La révision servie par `table.schema` est celle du nœud publié, celle que `write` attend en `base_revision`. |
| HN-E11S01-10 | L'attribut d'en-tête s'appelle `proof`, booléen, comme `closed`. |
| HN-E11S01-11 | Un tableau créé sans `proof`, ou rangé avant 1.1.0, se lit `proof: false`. |
| HN-E11S01-12 | Changer `proof` n'avertit de rien et ne réécrit ni ne compte aucune ligne ; une procédure publiée n'est pas recontrôlée au changement de `proof` ou de `closed`. |
| HN-E11S01-13 | La fixture `PROSPECTS_HEADER` (`tests/factories/table-fixture.ts`) porte `proof: true`, pour que les tests de M53 et d'HN-M53-10 gardent leurs assertions ; un en-tête dérivé sans `proof` sert les cas du lot f. |
| HN-E11S01-14 | Textes du changement de `proof` : « require proof » et « stop requiring proof » en attente, « proof required » et « proof optional » à la publication. |
| HN-E11S01-15 | Sans `proof`, `withoutBareValues` retire encore une valeur nue égale à la valeur rangée : un renvoi tel quel ne remplace pas une provenance prouvée ou importée. |
| HN-E11S01-16 | Dans le créneau `access` de l'en-tête d'un tableau : « Télécharger en .csv », « Réglages », puis « Partager · <espace> », toujours le dernier. Validée (2026-09-29). |
| HN-E11S01-17 | Sans `lifecycle.review`, l'interrupteur « L'assistant peut décider la revue » est absent, pas désactivé. |
| HN-E11S01-18 | Un geste du panneau « Réglages du tableau » part par la file d'opérations de la page, qui pose la révision et le tampon courants ; un appel direct avec la révision lue serait périmé. |
| HN-E11S01-19 | Au succès, une annonce nomme l'interrupteur et son nouvel état, puis la page se relit (`useRafraichir`). |
| HN-E11S01-20 | Un en-tête en attente dans le brouillon bloque le panneau, plutôt que publier le brouillon entier avec le réglage ou écrire sur l'en-tête publié par une porte nouvelle. Validée (2026-09-29). |
| HN-E11S01-21 | Le panneau s'ouvre dès le niveau écriture (`vue.level >= 2`), comme la publication d'un en-tête (HN-E11S02-17). Tranchée par le responsable d'Oto (2026-09-29). |
| HN-E11S01-22 | `agents_may_decide` est `.optional()` dans `tableReviewSchema`, sans défaut écrit : absent, il se lit faux, et un en-tête lu ne gagne pas la clé. |
| HN-E11S01-23 | La description de `required` du patch d'en-tête (`tableColumnPatchSchema`) reprend celle du schéma de colonne, avec son exemple et son défaut (« e.g. true (default: unchanged; false for a new column) »). |
| HN-E11S01-24 | Dans `table.schema`, la clé et la colonne d'état se disent `required` seul : `verified_empty` y est toujours refusé. |
| HN-E11S01-25 | Publier `allow_verified_empty: false` sur une colonne déjà requise avertit (`missing_required`) des seules lignes qui n'y ont qu'un `verified_empty` ; une colonne rendue requise et stricte d'un coup avertit de toute ligne sans vraie valeur. |
| HN-E11S01-26 | `table.release` range toujours le `worker` de l'appel dans la provenance de l'état ; sa description et sa ligne de refus disent l'exception d'un tableau qui laisse l'assistant décider. |
| HN-E11S01-27 | Une bascule du panneau part avec le tampon courant du brouillon (`draft_stamp` posé seulement si un brouillon existe), comme la publication de la page. |
| HN-E11S01-28 | Un refus ne relit pas la page : l'interrupteur revient à l'état publié lu, l'arrêt de la file est levé pour qu'un geste suivant reparte, la relecture reste à la personne (« Rechargez la page »). |
| HN-E11S01-29 | Décocher « L'assistant peut décider la revue » publie `agents_may_decide: false` explicite, plutôt que retirer la clé. |
| HN-E11S01-30 | Un nœud `table` dont `vue.meta` ne passe pas `tableHeaderSchema` n'a pas de bouton « Réglages ». |
| HN-E11S01-31 | L'annonce s'accorde à l'option, au féminin pour les trois : « Fermé : activée. ». |
| HN-E11S01-32 | L'intitulé et l'aide d'un interrupteur prennent leurs couleurs d'`oto-choice` (`--ink`) et `oto-choice-desc` (`--mute`), même rendu que `text-ink` et `text-mute` dans les deux thèmes. |

### E11-S02 — Publication directe, brouillons refusés, corbeille et suppression de lignes depuis un assistant

| Id | Règle |
|---|---|
| HN-E11S02-1 | Noms `node.discard_draft`, `node.trash`, `table.delete_rows` ; connecteur natif `node`. |
| HN-E11S02-2 | Abandonner un brouillon exige le niveau écriture (action `write`). |
| HN-E11S02-3 | On abandonne le brouillon entier, titre et résumé en attente compris ; le récapitulatif les nomme. |
| HN-E11S02-4 | L'abandon d'un nœud jamais publié est refusé, avec un renvoi à `node.trash`. |
| HN-E11S02-5 | Le brouillon s'abandonne par une fonction SQL (`platform.discard_draft`, verrou 7401), jamais par un privilège ni une policy `DELETE` sur `node_drafts`. |
| HN-E11S02-6 | Les trois fonctions sont `sensitive` : deux temps. |
| HN-E11S02-7 | Un tableau fermé n'empêche pas la suppression de lignes : `closed` n'interdit que la création. Tranchée par le responsable d'Oto (2026-09-29). |
| HN-E11S02-8 | Une ligne à l'état de revue se supprime comme les autres, quel que soit `review.agents_may_decide` ; le récapitulatif et le résultat le disent ; P10 n'est pas touchée. Tranchée par le responsable d'Oto (2026-09-29). |
| HN-E11S02-9 | Une ligne réservée par autrui, bail actif, est refusée à la suppression ; bail expiré ou propre, supprimée. |
| HN-E11S02-10 | Une ligne supprimée l'est pour de bon, sans corbeille de lignes. |
| HN-E11S02-11 | Fil d'activité : `trashed` réutilisé, `deleted_rows` ajouté (« a supprimé des lignes dans »), l'abandon d'un brouillon absent. |
| HN-E11S02-12 | Aucun bouton « Abandonner le brouillon » ni route à l'écran : seul un assistant abandonne un brouillon. Tranchée par le responsable d'Oto (2026-09-29). |
| HN-E11S02-13 | L'assistant ne passe pas de tampon à `node.discard_draft` : le service passe celui qu'il lit. |
| HN-E11S02-14 | Ni `checkArgs` ni refus dans un bloc `call` de procédure pour les trois fonctions : elles y restent en deux temps. |
| HN-E11S02-15 | L'écran reconnaît le refus d'un en-tête à `details.reason = "header_refused"`, posée par le service ; il le dit dans la zone de publication, sans « Réessayer ». Tranchée par le responsable d'Oto (2026-09-29). |
| HN-E11S02-16 | Le nombre de lignes supprimées et à revoir voyage de la fonction au journal par `FunctionOutput.outcome` et `ToolOutput.outcome`, écrit en clé réservée `args._outcome`, sans migration. Tranchée par le responsable d'Oto (2026-09-29). |
| HN-E11S02-17 | Qui peut écrire publie aussi l'en-tête changé d'un tableau publié (colonnes, clé, `proof`, `agents_may_decide`, `closed`) ; canal ouvert voulu, tracé. Tranchée par le responsable d'Oto (2026-09-29). |
| HN-E11S02-18 | Le chemin suit le titre au niveau écriture (action `rename`) ; l'ancien chemin reste un alias de `node_aliases`, lu par `findNode` et `writeNode`. Validée (2026-09-29). |
| HN-E11S02-19 | Aucun avis à l'ouverture d'un nœud qui a un brouillon : la frappe suivante le publie entier. Tranchée par le responsable d'Oto (2026-09-29). |
| HN-E11S02-20 | Cadence de 3 s gardée, aucune fusion de révisions. |
| HN-E11S02-21 | Le défaut de `publish` se lit dans le service (`publish !== false`) ; l'écran passe `publish: false` par la file d'opérations. |
| HN-E11S02-22 | Refus de publication : brouillon gardé, `isError` avec son code (N28). |
| HN-E11S02-23 | Contextes et espaces créés par la base restent à la révision 0 jusqu'à leur première écriture. |
| HN-E11S02-24 | Fil d'accueil inchangé pour l'écriture : `publish: true` explicite donne « publié », sinon « créé » ou « modifié ». |
| HN-E11S02-25 | `?version=published`, `read draft: true` et `node.discard_draft` restent pour les brouillons rares ; le lien « Voir la version publiée » part avec le bandeau. |
| HN-E11S02-26 | Aucun filtre des contenus « Sans titre » vides. |
| HN-E11S02-27 | La ligne de publication de `write` donne la révision de la prochaine écriture (« Next write: base_revision N. »). |
| HN-E11S02-28 | Le Contexte suit la règle : écrire le publie. |
| HN-E11S02-29 | « Sans titre » s'ouvre titre sélectionné quelle que soit la révision. |

### E11-S05 — Écrans d'un contenu : encarts repliables à droite, cellules, lignes à revoir, télécharger, résumé, page et tableau vides

| Id | Règle |
|---|---|
| HN-E11S05-1 | Le repère du repli d'une cellule est un chevron `CaretDown` dans le `summary`, ses règles dans `table.css`. |
| HN-E11S05-2 | Le détail d'une cellule ouverte est en `text-mute` : aucun token ajouté. |
| HN-E11S05-3 | Seul l'état de revue marque une ligne de la grille (`data-state="review"`) ; `running` et `failed` restent inutilisés. |
| HN-E11S05-4 | L'aide du cycle de revue est une phrase visible dans l'îlot « À revoir », composée des états déclarés. Validée (2026-09-29). |
| HN-E11S05-8 | « Télécharger en .csv » exporte tout le tableau, comme le rail, même sous un filtre ou une recherche. Validée (2026-09-29). |
| HN-E11S05-9 | Le bouton « Télécharger » est offert à qui lit un nœud publié, version publiée seule ; il ne manque qu'à un nœud gardé en brouillon par un assistant. |
| HN-E11S05-10 | Le fichier d'une page publique se compose de la vue déjà chargée (500 lignes au plus, dit par le libellé), au rendu serveur, et part sans requête au clic. Validée (2026-09-29). |
| HN-E11S05-11 | Le séparateur du CSV public suit la langue de l'organisation, servie par `readPublicNode`. |
| HN-E11S05-12 | Ordre des encarts : « Cité dans », « Cite », « Sous-pages » ; glyphes `ArrowSquareIn`, `ArrowSquareOut`, `TreeStructure` ; total seul. |
| HN-E11S05-13 | La colonne de droite d'une page, d'une procédure ou d'un Contexte a toujours sa piste ; sans lien ni sous-page, elle reste vide, sans phrase. |
| HN-E11S05-14 | Pour un tableau, « Lecture des liens… » tient la ligne des encarts pendant la lecture. |
| HN-E11S05-15 | Le résumé ne se montre ni ne s'écrit à l'écran hors d'une procédure (Contexte et tableau compris) ; l'assistant l'écrit par `write`. Validée (2026-09-29). |
| HN-E11S05-16 | Le résumé par défaut d'une procédure est une vraie valeur stockée, sans exemple métier. |
| HN-E11S05-17 | L'assistant nommé dans un tableau vide est la famille la plus récente de `lastConnections`. Validée (2026-09-29). |
| HN-E11S05-18 | Famille inconnue ou « Client non identifié » : « votre assistant ». |
| HN-E11S05-19 | Le Texte d'une page vide n'existe que sur le poste ; il ne part jamais vide. |
| HN-E11S05-20 | « Nœud neuf » = titre « Sans titre » et aucun bloc, sans condition de révision. |
| HN-E11S05-21 | Au niveau lecture et sur la page publique, « Cette page n'a pas encore de contenu. » reste. Validée (2026-09-29). |
| HN-E11S05-22 | L'invite d'une page vide vaut exactement `Commencer à écrire... Utilisez '@' pour citer un autre contenu (page, tableau, procédure)`, sans mention de `/`. Tranchée par le responsable d'Oto (2026-09-29). |
| HN-E11S05-23 | La borne des lignes d'un tableau public est `PUBLIC_TABLE_ROWS_MAX = 500`, dans `schemas/node-gestures.ts`, lue par la page publique et son libellé. |
| HN-E11S05-24 | `PublicNodeView.language` est typé `Language`. |
| HN-E11S05-25 | Un refus de téléchargement se dit par `messageDErreur(erreur, EXPORTS.refus)`. |
| HN-E11S05-26 | L'invite ne se pose que sur le Texte seul, local et vide, d'une page vide. |
| HN-E11S05-27 | Entrée dans le titre mène au premier bloc ; à l'ouverture, le focus va au Texte d'une page vide seulement si le titre n'est pas « Sans titre ». |
| HN-E11S05-28 | L'aperçu d'un Contexte se place entre « À quoi sert cette page » et les encarts. |
| HN-E11S05-29 | La ligne d'encarts d'un tableau est masquée quand elle est vide (`empty:hidden`). |

### E11-S06 — Éditeur : une puce par élément de liste, modifier un lien dans un panneau

| Id | Règle |
|---|---|
| HN-E11S06-1 | Le champ garde la source `[[…]]` pendant la frappe : le curseur dans un lien ouvre le panneau, source visible ; un clic sur un lien au repos ouvre le panneau, focus dedans, source cachée ; à la fermeture, le curseur revient au champ. Validée (2026-09-29). Le clic au repos : remplacé par D151 (le menu contextuel ouvre le panneau). |
| HN-E11S06-2 | Un clic simple sur un lien au repos ouvre le panneau et ne suit plus le lien ; Ctrl, ⌘ ou le bouton du milieu le suivent, et « Ouvrir » aussi. Validée (2026-09-29). Remplacée par D151 (E11-S15, AC-b9). |
| HN-E11S06-8 | La copie des éléments d'une liste précède le champ dans le DOM : au clavier, les cases viennent avant le texte. |
| HN-E11S06-9 | Un lien qui ne se relirait pas tel quel à sa place est refusé par le panneau : « Ce lien ne se relirait pas tel quel à sa place : changez son libellé ou son adresse. ». |
| HN-E11S06-10 | « Ouvrir » ouvre la destination saisie dans le panneau. |
| HN-E11S06-11 | Maj+clic sur un lien le suit, comme Ctrl ou ⌘. |
| HN-E11S06-12 | En couleurs forcées, le champ est muet au repos et la copie reste lisible. |
| HN-E11S06-13 | Le panneau du lien n'emploie pas React Hook Form. |
| HN-E11S06-14 | Un lien écrit sans libellé : le champ du panneau montre le titre de la page choisie, et l'écriture garde `[[chemin]]`. |
| HN-E11S06-15 | Dans une liste, le curseur, la relecture et le clic lisent la ligne de l'élément. |

### E11-S07 — Adresses en anglais : routes, paramètres, ancres, préfixe d'API

| Id | Règle |
|---|---|
| HN-E11S07-1 | Une adresse est ce qui s'écrit dans la barre d'adresse ou dans un lien ; un `id` qu'aucun lien ne vise, un identifiant de code et un nom de dossier entre crochets n'en sont pas (ADR-020 § 1). |
| HN-E11S07-2 | `/journal` reste : « journal » est un mot anglais, déjà chemin MCP (`JOURNAL_PATH`) et table `platform.journal` ; `/log` écarté. Validée (2026-09-29). |
| HN-E11S07-3 | Les adresses suivent l'orthographe américaine : `/admin/organization`, `/no-organization`, et `organization` pour toute adresse future ; les textes servis en anglais gardent `organisation`, incohérence assumée ; britannique écarté. Tranchée par le responsable d'Oto (2026-09-29). |
| HN-E11S07-4 | Un nom nouveau reprend celui que l'API ou le service donne déjà (`trash`, `feedback`, `connectors`, `profile`, `teams`, `sort` de H96, opérateurs de H95) ; `sens` devient `order`. |
| HN-E11S07-5 | Les anciennes adresses répondent 404, sans alias ni redirection ; les trois pages de redirection d'`/admin` et la redirection de `/plateforme/invitations` sont retirées ; la redirection de `seo-patterns.md § Règles SEO` ne vaut que pour une page publique indexée. |
| HN-E11S07-6 | Un ancien nom de paramètre est ignoré comme tout paramètre inconnu, sans refus. |
| HN-E11S07-7 | La garde des routes est une liste de segments admis (`SEGMENTS_ADMIS`), celle des paramètres une liste d'anciens noms refusés, dans `scripts/check-framework-invariants.mjs`. |
| HN-E11S07-8 | `/plateforme` (`PlateformeHome`) se renomme `/platform` ; son retrait serait une décision produit. |
| HN-E11S07-9 | Un nouvel ADR (ADR-020) plutôt qu'un amendement d'ADR-015, qui reste « Proposé » pour la version qui traduira les écrans. |
| HN-E11S07-10 | Préfixe d'API en une constante, `PLATFORM_API_PREFIX` dans `schemas/api.ts`, réexportée par `./schemas` ; renommer les littéraux en place écarté. Validée (2026-09-29, refacto accepté). |
| HN-E11S07-11 | Ancre `recent-content` pour le bloc servi « recent content » ; aucune ancre pour le bloc `code`, que la vue n'affiche plus ; `procedures` inchangée. |
| HN-E11S07-12 | Les écrans retirés (Marque, Drapeaux, Accès plateforme) restent exportés par le paquet (M65) ; leurs tests les montent sous des adresses fictives en anglais (`/admin/brand`, `/admin/flags`, `/admin/access`), qu'aucune route ne sert. |
| HN-E11S07-13 | Les ancres fixes des Contextes sont `everyone-context` et `private-context` : elles ne commencent pas par `context-`, qu'aucun slug d'équipe (`context-<slug>`) ne peut donc produire. |
| HN-E11S07-14 | La garde des anciens noms refuse aussi les routes retirées (`/admin/acces`, `/admin/marque`, `/admin/drapeaux`) ; elle ne contrôle pas les opérations écrites dans la valeur de `f=` (`f=nom:contient:x`), que `reglagesDepuisLAdresse` écarte à la lecture. |

### E11-S15 — Retours sur la 1.1.1 : écrans d'un contenu, éditeur et blocs

| Id | Règle |
|---|---|
| HN-E11S15-a1 | « Rangés sous ce contexte » et « Pages citées » passent dans l'encart repliable partout où la vue « Contexte » les rend (`ListesServies` : carte d'une partie, sous l'éditeur ou en lecture, encart « Contexte · Tout le monde » d'Organisation), même glyphe que « Sous-pages » et « Cite », sans total. |
| HN-E11S15-a2 | Dans un encart d'une page, la nature d'un nœud (« Page », « Procédure »), « déplacé vers … » et « sans cible » restent en méta : un qualificatif ou un état, pas un résumé. |
| HN-E11S15-a3 | « Centré » sous 1 410 px de contenu : le document (borné à sa mesure) et la colonne d'annexes forment une paire centrée, l'en-tête posé au bord gauche du document ; au-dessus, rien ne change. |
| HN-E11S15-a4 | La borne de 70 % de la fenêtre vaut pour les deux panneaux larges (`data-size="lg"` : « Partager », « Réglages » d'un tableau) ; « Partager » s'aligne sur le bord droit de son bouton. |
| HN-E11S15-a5 | Le filet entre les étapes du guide de branchement vaut aussi dans la fenêtre « Brancher » de l'accueil (même guide), en `--island-bd`. |
| HN-E11S15-a6 | « Ce que votre Claude/ChatGPT/Mistral, comme celui de chaque membre de l'organisation (de l'équipe X), lit à chaque conversation. » ; le Privé et le Privé d'autrui sont inchangés ; le résumé que la base pose sur un Contexte d'équipe ou de Tout le monde garde l'ancien texte : le changer demande une migration, hors 1.1.2 (M94). |
| HN-E11S15-a7 | « Importer un fichier… » d'un tableau suit la condition de « Réglages » (niveau écriture, hors `?version=published`), après « Télécharger… », en `secondary` ; le dépôt d'un `.csv` garde la sienne (niveau écriture). |
| HN-E11S15-a8 | L'explication de la vue « Contexte » est l'encart « À quoi sert cette page », ouvert sous le titre, sans borne chiffrée (elles vivent dans `server/`) ; « Règles Oto » et la procédure servie sont dites « non montrées ici » ; l'outil est nommé « son outil « context » », la procédure servie « quand Oto en reconnaît clairement une » (routage d'Oto, seuil et écart, `decide`). |
| HN-E11S15-a9 | Un Contexte cité se nomme par `titreDuContexte` (« Contexte · SAV ») dans un lien au repos, quand son libellé est le titre enregistré ou absent, et dans les lignes d'encart ; le genre vient de l'arbre visible que le service sert déjà (aucun champ ajouté au service) ; arbre illisible ou coupé sans le Contexte, ou Contexte déplacé : son titre enregistré. Le nom vaut aussi pour ce que le panneau « Lien » montre d'un lien (page choisie, description, texte laissé par « Retirer le lien »). |
| HN-E11S15-b1 | Le correcteur du navigateur est coupé (`spellCheck={false}`) sur le champ d'un bloc dont le texte porte un lien et sur « Libellé » et « Chercher une page » du panneau « Lien » ; il reste actif sur un texte sans lien. |
| HN-E11S15-b2 | L'en-tête teinté d'un tableau simple vaut à la lecture comme dans l'éditeur, sur le jeton `--oto-bg`, opaque (l'en-tête colle en défilant) ; aucun jeton ajouté. |
| HN-E11S15-b3 | La hauteur libérée du menu de la poignée vaut pour tout bloc (même menu), bornée à la fenêtre. |
| HN-E11S15-b4 | « etc. » d'AC-b2 se lit : tableau, fichier, image ; le bloc local d'un envoi et les autres blocs restent tels quels. |
| HN-E11S15-b5 | Le rendu au repos d'un texte marqué vaut pour tout bloc à texte en ligne (Texte, titre, liste, cases, citation) ; un code et un appel restent lus tels quels (M59). |
| HN-E11S15-b6 | Un clic sur une page citée navigue par un `<a href>` dans l'onglet (Ctrl, ⌘ ou le bouton du milieu : nouvel onglet) ; une adresse web s'ouvre dans un nouvel onglet (`noopener noreferrer nofollow`). |
| HN-E11S15-b7 | Les contenus récents de « @ » sont ceux du bloc « Recent content » de `context` (`recentDocuments`) : pages et tableaux lus, écrits ou publiés par la personne sur 90 jours, 20 au plus, hors de la page éditée (`GET /api/platform/search/recent?exclude=`) ; affichés tant que rien n'est tapé après « @ » ; le panneau « Lien » reste sans récents ; `search` sans `q` écarté (une requête vide resterait une erreur de saisie). |
| HN-E11S15-b8 | Une adresse nue s'affiche entière jusqu'à 40 caractères ; au-delà, schéma, hôte et les 12 derniers caractères du chemin, requête et fragment tombés ; l'hôte montré, l'infobulle et le nom accessible viennent de `new URL` (l'hôte que le navigateur ouvre, punycode d'un domaine international), jamais d'un hôte lu à la main qu'une barre oblique inverse déguiserait ; jamais l'identifiant ni le mot de passe ; un libellé écrit reste le nom du lien. |

### E11-S17 — Sélection de blocs dans l'éditeur (lot a)

HN-E11S16-5 à -8 et -12 de la story tiennent pour le lot a ; l'écriture de l'écran porte autant d'opérations qu'une page a de blocs, `write` 50 (D153).

| Id | Règle |
|---|---|
| HN-E11S17-a1 | Le rectangle prend les blocs qu'il couvre en hauteur, où qu'il soit en largeur ; il se tire depuis la marge : la zone des blocs, une rangée ou sa gouttière hors de leurs contrôles, jamais le rendu d'un bloc lu. |
| HN-E11S17-a2 | Un bloc sélectionné porte le fond `--oto-bg` et un contour (`outline`) en `--oto-ink` ; `Highlight` en couleurs forcées ; aucun jeton ajouté ; contraste à mesurer à la campagne. |
| HN-E11S17-a3 | Après une suppression groupée, le focus va à la poignée du bloc qui précédait le premier retiré, du premier restant sinon ; toute la page retirée, au champ du Texte vide. ⌘Z y annule le geste annoncé ; dans un champ, ⌘Z reste l'annulation de sa frappe. |
| HN-E11S17-a4 | ⌘Z sur la zone des blocs ou une poignée annule toute annonce qui porte « Annuler », celle d'un bloc seul comprise ; sans annonce, la touche reste au navigateur. |
| HN-E11S17-a5 | Les touches d'une sélection se lisent sur la zone ou une poignée, jamais dans un champ. Sur la poignée d'un bloc sélectionné, ↑, ↓ et Entrée servent la sélection et n'ouvrent pas son menu ; sur la poignée d'un bloc hors de la sélection, ils restent au bouton (↓ et Entrée ouvrent son menu) ; Espace et le clic l'ouvrent toujours. Échap dans un champ sélectionne son bloc : « Échap puis Entrée » rend le champ au lieu d'ouvrir le menu. ⌘A sur la zone ou une poignée prend toute la page. |
| HN-E11S17-a6 | Un bloc neuf jamais envoyé, supprimé dans un groupe, part sans écriture et ne revient pas par « Annuler » ; l'annonce le compte. |
| HN-E11S17-a7 | Maj+clic étend depuis l'ancre (le dernier bloc pris seul, par Échap, ↑↓ ou Ctrl+clic) ; sans sélection, il prend le bloc seul. Un clic simple sur la poignée d'un bloc hors de la sélection la vide et ouvre le menu ; sur un bloc sélectionné, il ouvre le menu et garde la sélection. |
| HN-E11S17-a8 | Au menu d'un bloc sélectionné parmi d'autres, « Supprimer », « Monter » et « Descendre » agissent sur le groupe ; « Dupliquer » et « Style » restent au bloc. |
| HN-E11S17-a9 | Une écriture groupée refusée (révision périmée d'un des blocs) se lit sans bloc visé : la page relue dit le conflit de page ou le message, avec « Réessayer » ; refusée pour elle-même (`invalid_arguments`), elle quitte la file et l'alerte dit de recharger la page, sans « Réessayer ». Les blocs restent retirés ou déplacés à l'écran jusque-là ; un conflit déjà ouvert refuse le geste avant tout envoi et le dit. |
| HN-E11S17-a10 | Un glissé sorti de son bloc garde la sélection du texte sous le navigateur, masquée tant que des blocs sont pris ; revenu au bloc de départ, elle reparaît ; lâché ailleurs, elle se replie et le focus passe à la zone des blocs. Au pointeur sans touche de modification. |
| HN-E11S17-a11 | La copie annonce « N blocs copiés en markdown. » ; un presse-papiers refusé le dit, et ⌘X ne supprime alors rien. |
| HN-E11S17-a12 | Le second ⌘A se lit dans le champ d'un Texte, titre, citation, liste ou code ; les cellules d'un tableau simple et les champs d'un repli gardent le ⌘A du navigateur (Échap y sélectionne le bloc). |

### E11-S18 — L'écriture côté assistants : rien d'écrit sur un refus, déplacer, importer une page entière

| Id | Règle |
|---|---|
| HN-E11S18-1 | « Assistant » = toute écriture de porte `agent` : `write` du MCP, `upload.link`, la création du tableau de `table.import`, `node.write_many`. Toute l'écriture (création du nœud, brouillon, publication, adresse qui suit le titre, ligne du `ctx` de l'auteur) tient dans une transaction ; tout refus l'annule (décision de JB, amende ADR-011 § 3). L'écran garde son brouillon (il sauve la frappe d'une personne) ; `admin_node publish` publie un brouillon qui existe déjà : inchangé. |
| HN-E11S18-2 | Les transactions des services appelés reprennent celle de l'écriture (`db.tx` sous la même session), sans point de sauvegarde : une erreur de la base (une course) interrompt la transaction, et le refus qui la relirait y devient une panne (`internal`) ; l'écriture, annulée entière, se rejoue alors une fois et dit l'état d'après la course (`stale_revision` avec l'état courant). Écartés : des points de sauvegarde par `sql.savepoint`, dont les requêtes échappent aux espions des tests (`spyDb`, `watchDb`), ou posés à la main (deux allers-retours de plus par transaction de service) ; les poser dans `server/sql.ts` pour tout le paquet (hors du lot). Rejouée après une course sur le tampon du brouillon (un autre l'a enregistré entre la lecture et `publish_node`), une publication sans opérations publie le brouillon partagé tel que l'autre l'a laissé (ADR-011 § 3 : le brouillon est partagé). Un service qui, pour l'écran, rattrape une erreur de base (purge d'après publication, `followTitle`) perd sous elle toute l'écriture : exception écrite de `supabase-patterns.md § Couplage à Supabase (ADR-012)` ; la purge n'est pas déplacée après la transaction (`finishTablePublication` est dans `publishNode`, partagé avec l'écran : la rendre différée changerait les deux portes). |
| HN-E11S18-3 | Les textes de refus des services (« The draft is kept; nothing was published. » et le renvoi à `node.discard_draft`) sont réécrits par `write-atomic.ts`, seul point : « Nothing was written. » ; quand un brouillon écrit avant l'appel (par `publish: false` ou l'écran) reste, relu après l'annulation, « Nothing was written; the draft saved before this call stays. » et le renvoi gardé. `needs_confirmation` y reçoit l'appel à refaire (le même appel, `header` augmenté de `"confirm_remove": true`). Écarté : un indicateur passé aux constructeurs de refus, dans des fichiers hors du lot (`procedures-check.ts`, `tables/evolution-publish.ts`). |
| HN-E11S18-4 | Ce qu'a fait l'écriture suit « Published … (<n> sections, <m> blocks) » après deux-points ; pour un tableau, ses fragments précèdent le résumé de l'en-tête publié. La réponse de `publish: false` est inchangée. |
| HN-E11S18-5 | Amende P12 (texte en vigueur plus haut). `node.move` est de classe `write`, pas `sensitive` : un déplacement se défait (l'ancien chemin redirige, on redéplace), rien n'est effacé. |
| HN-E11S18-6 | Les arguments de `node.move` sont `moveNodeSchema`, décrit (une source pour l'API, l'écran et le catalogue). Un `new_path` pris va au premier chemin libre, comme à l'écran (fiche D125). |
| HN-E11S18-7 | La coupe au mot vaut dans `slugOf`, sa seule définition : segment d'un titre, slug d'équipe, nom de colonne et segment d'un import ; et dans `cutAtWord`, qu'elle partage avec un nom de colonne préfixé (`c_`) ou numéroté (`_2`). Un premier mot plus long que la borne reste coupé à la borne. Aucune compatibilité due (stade R&D, aucun client) : un nom tiré avant sous l'ancienne coupe n'est pas repris ; les slugs d'équipe stockés font foi (`checkName` les compare, jamais un slug recalculé d'un nom). |
| HN-E11S18-8 | FB-0015 : `insertBlocks` retrouvait chaque bloc inséré par l'égalité de sa position flottante relue ; une session où `extra_float_digits` est sous 1 relit un `double precision` à 15 chiffres, d'où « Internal error » sur `add_section` avec `after`. Les lignes rendues par `insert … returning` se lisent dans l'ordre des valeurs insérées ; un nombre ou un type qui ne correspond pas est un `conflict` journalisé (un `internal` est masqué par la porte MCP). |
| HN-E11S18-9 | Un frontmatter est une première ligne `---`, des lignes YAML simples (`clé: valeur`, élément de liste, ligne indentée, ligne vide ; une ligne de commentaire `#` en tête de ligne n'en est pas), puis `---` ou `...`, dans les 100 premières lignes ; sinon rien n'est retiré (un séparateur en tête reste un séparateur). Clés lues sans casse : `title`, `titre` ; `summary`, `resume`, `résumé`, `description` ; une valeur entre guillemets est ce qu'ils entourent, une valeur nue s'arrête à un commentaire (` #`) ; un bloc littéral ou replié (`title: |`, `>`) n'est pas lu : le titre vient alors du premier `#` ou du nom du fichier, le résumé du premier paragraphe. Avec un titre de frontmatter, un premier titre `#` identique (sans casse ni accent) est retiré du corps ; différent, il reste. |
| HN-E11S18-10 | Sans `section` ni `block`, `replace_text` cherche dans le rendu de toute la page ; une occurrence à cheval sur deux blocs n'y est remplacée que dans une section (réécriture de son corps, comme avant), sinon refusée en nommant `set_markdown`. `count` : 1 à 1 000. Un remplacement dans un titre doit laisser un titre du même niveau ; dans un autre bloc, aucun titre au niveau de sa section ou au-dessus ; un bloc avant le premier titre, aucune borne de titre. La taille qu'aurait la portée (taille + `count` × (texte − `find`)) est refusée en `too_large` au-delà de sa borne (section ou bloc : `SECTION_MAX` ; page : `PAGE_MAX`) avant toute construction, et le texte neuf s'assemble en une passe. |
| HN-E11S18-11 | `set_markdown` écrit le corps seul (titre et résumé restent des champs de `write`) ; un premier titre `#` du texte reste un titre de section. Les blocs identiques gardent leur id. Le lot passe par une fonction du catalogue, `node.write_many`, et non par un champ `pages` de `write` : `path` est requis dans le JSON Schema de `write`, et le rendre facultatif serait une rupture (ADR-002 § 1). Classe `write` ; les pages s'écrivent dans l'ordre (un parent avant ses enfants) ; chaque ligne de résultat, et le refus d'une page dans les données, est coupée à 400 caractères, sauf le refus `needs_confirmation`, dont l'appel à refaire se garde entier. Une panne hors refus (un bogue) arrête le lot : la réponse dit les pages déjà écrites et que les suivantes ne le sont pas (`stopped`). |
| HN-E11S18-12 | `acceptOwnContextWrite(db, identity, { ctx, path, revision })` (E11-S19) suit une écriture d'assistant qui a changé un Contexte (`rules_changed`), après sa transaction : une panne (migration de la 1.1.3 absente, course) ne défait jamais l'écriture ; elle est journalisée, et la réponse garde alors la consigne de rappeler `context`. Sans `ctx` (écran, ticket sans `ctx`), rien. |
| HN-E11S18-13 | `functions` est un chemin réservé comme `journal` (P22, E11-S19 : `read` y liste les fonctions) : `write` le refuse, et une équipe ne peut pas prendre ce slug : `RESERVED_SLUGS` du service, et la contrainte `teams_slug_reserved` recréée par la partie 2 de `20260930150000_v1_1_3.sql` (une équipe déjà au slug `functions` la fait échouer : l'hôte lui donne un autre slug avant). |
| HN-E11S18-14 | Activités de l'accueil : un `node.move` paraît « déplacé », sans confirmation, à son ancien chemin (celui des arguments), que la relecture suit par l'alias jusqu'au nœud déplacé ; le chemin demandé ne sert pas (pris, le nœud va au premier chemin libre). Un `node.write_many` ne paraît pas : ses arguments, au-delà de 2 048 caractères, sont coupés au journal, et le résultat d'une fonction n'y inscrit que des nombres ; le faire paraître demande que `call` journalise les chemins écrits (hors du lot). |

### E11-S19 — `ctx`, `context`, lecture et recherche : l'auteur d'un Contexte continue, le refus porte le changement, `context` léger, routage expliqué, `read`, `find` et `table.rows` plus économes

| Id | Règle |
|---|---|
| HN-E11S19-1 | La ligne `ctx` de l'auteur d'un Contexte n'avance (`acceptOwnContextWrite`) que si le code est à la personne dans l'organisation, garde ce Contexte à la révision précédente, que le chemin est attendu pour elle et que le Contexte est publié à la révision dite : un changement d'un autre auteur entre-temps reste à lire, par le refus qui le porte. Policy `ctx_update_own` plutôt qu'une fonction `security definer` (`database-patterns.md § Règles`) ; la personne ne peut qu'avancer ou reculer ses propres codes. |
| HN-E11S19-2 | Le refus `ctx_stale` émet un nouveau code (même host, même agent) plutôt que de réécrire l'ancien : un code partagé par des sous-agents qui n'ont pas lu l'écart ne passe pas. Le nouveau code garde les révisions lues par la garde (`ctxState`, passées à `issueCtx` par `request.contexts`), jamais relues à l'émission ; les corps sont lus après. Un Contexte republié entre les deux est servi plus récent que la révision gardée : le code est refusé une fois de plus, jamais gardé au-delà de ce qui a été servi. Même règle pour le `context` léger (AC-b1). |
| HN-E11S19-3 | L'écart servi est la partie entière de chaque Contexte changé, telle que `context` la sert (en-tête et corps, sans les lignes de faits, qui ne périment pas le code), pas un diff de blocs ; un Contexte retiré, vidé ou dépublié a son en-tête et la ligne `CONTEXT_GONE`. |
| HN-E11S19-4 | `since_ctx` de `context` sert aussi à tester le routage d'une phrase : pas de fonction `route.test`. Sans changement, le même code, aucune ligne `ctx` écrite, la borne des nouveautés immobile ; règles, parties inchangées, nouveautés, procédures utiles et contenus récents retirés du mode léger, sans filtre sémantique (D132). Un code inconnu, d'une autre personne, d'une autre organisation, mal formé ou émis avant 1.1.0 : `context` complet. |
| HN-E11S19-5 | P37 gardée : pas de champ `triggers`. Les « words in common » d'une candidate (`wordsInCommon`) approchent les lexèmes du score : mots de quatre lettres au moins, sans casse ni accents, égaux ou de mêmes cinq premières lettres ; ils disent quoi ajouter au résumé, pas le calcul (trigrammes et correction par le lexique non montrés). Sans procédure servie, la ligne dit le seuil et l'écart de l'organisation. |
| HN-E11S19-6 | Genre `edit` : liste fermée de verbes qui modifient un texte (`modifie`, `corrige`, `change`, `remplace`, `mets à jour`, `réécris`, `reformule`, `renomme`, et leurs infinitifs après une formule de demande). Ni « ajoute » (une création), ni `supprime`, `retire`, `efface` : une suppression passe par `node.trash`, `table.delete_rows` ou l'en-tête d'un tableau par `write` (golden TDN1, PD2, TB3) (AC-d3). |
| HN-E11S19-7 | Une question dont la personne est le sujet et un tiers (`lui`, `leur`) l'objet, avant le verbe, est une action (« Qu'est-ce que je lui réponds ? ») ; « Qu'est-ce que j'ai à faire ? » reste une question de données (golden TD4) ; « Qu'est-ce que je leur dois ? » passe en action : accepté. |
| HN-E11S19-8 | `functions` est un chemin réservé de `read`, comme `journal` (P22) : un nœud à ce chemin n'est plus lisible par `read` (l'écran le lit) ; `write` refuse ce chemin et le slug d'équipe `functions` est réservé (`server/teams.ts`) ; aucune contrainte de base : une équipe existante au slug `functions` ferait échouer la migration. |
| HN-E11S19-9 | Le plan (`outline`) quitte les données de `read` quand une section est demandée ou que le texte le porte (page servie par son plan, `outline: true` compris) ; `sections_total` reste (`mcp-patterns.md § 4` : `structuredContent` compact, pas deux fois la même chose). |
| HN-E11S19-10 | `find` rend la révision dans la ligne « To edit: <p>_write {"path": …, "base_revision": <révision>, "ops": [...]} » : sans elle, `write` exige de relire pour `base_revision` ; seulement pour un nœud hors tableau dont des blocs sont montrés et que la personne écrit. |
| HN-E11S19-11 | Avec `match: "any"` de `table.rows`, le nombre de mots trouvés prime sur `sort`, qui départage ; `match: "any"` entre dans l'empreinte du curseur. |
| HN-E11S19-12 | Un code partagé par un orchestrateur et ses sous-agents avance par `acceptOwnContextWrite` quand l'un d'eux publie un Contexte : l'orchestrateur connaît l'écriture de son sous-agent, et un sous-agent frère n'est pas refusé (AC-a1, décision du pilote, option a). |

### 1.1.3 — Diagrammes mermaid dessinés, à la lecture et dans l'éditeur (sans story)

| Id | Règle |
|---|---|
| HN-M113-1 | mermaid en 11.17.2 exacte plutôt que la 12 (ES2024, Safari 17.4+, Node ≥ 22.12 à déclarer aux hôtes, ELK embarqué, rendu par défaut changé), chargé à la demande par `import()` dans l'effet d'un composant client (`DiagrammeMermaid`) : une page sans diagramme ne le télécharge pas, le serveur ne l'exécute jamais. |
| HN-M113-2 | Le nom accessible du dessin (`role="img"`) est la ligne `title:` ou `accTitle:`, sinon la première ligne qui n'est ni directive (`%%`) ni `---`, coupée à 120 caractères (« Diagramme : <ligne> », « Diagramme » sans ligne). |
| HN-M113-3 | Dans l'éditeur, un diagramme vide est traité comme tout bloc vide (neuf : jamais envoyé ; servi puis vidé : supprimé au départ de la rangée, avec « Annuler ») ; le dessin, sous le champ, ne se refait pas pendant la frappe (hors du focus seulement) ; une clôture `mermaid` dans un repli reste du code. |
| HN-M113-4 | Le SVG est inséré tel que mermaid le rend, assaini par lui (`securityLevel: "strict"`, DOMPurify ; une directive du texte ne change ni ce niveau ni `startOnLoad`) : `security-patterns.md § XSS Prevention` ; une `<img src="data:…">` est écartée (liens et sélection du texte perdus, `foreignObject` des étiquettes). |

### E11-S20 — Le rail à jour : son arbre relu à la navigation, au retour sur l'onglet et après chaque geste (1.1.5)

| Id | Règle |
|---|---|
| HN-E11S20-1 | Un geste demande la relecture du rail par `useRafraichir` (un seul point, que tous les gestes appellent déjà) plutôt que par un appel ajouté à chaque geste : une requête `GET nodes/tree` de plus après un geste qui ne change pas l'arbre, bornée. Dans Next, `router.refresh()` rejoue aussi le layout, qui sert un nouvel arbre, adopté (AC-8) ; le rail montre le dernier arbre arrivé. |
| HN-E11S20-2 | Délai minimal de 5 s entre deux relectures, compté depuis le départ de la précédente, quel qu'en soit le déclencheur, ou depuis le montage ; il ne vaut que pour le retour sur l'onglet (`visibilitychange` → `visible`) ou la fenêtre (`focus`) : une navigation ou un geste relit toujours. |
| HN-E11S20-3 | Une relecture en échec (réseau, refus, réponse sans tableau `tree` ni booléen `truncated`) garde l'arbre montré sans rien dire ; trois échecs d'affilée affichent « L'arbre n'a pas pu être actualisé. » sous les sections, dans une région de statut montée vide (annonce polie, jamais d'alerte), retiré au premier succès. Un arbre servi en échec par le layout est remplacé par la première relecture réussie. |
| HN-E11S20-4 | Une relecture demandée pendant qu'une autre est en vol n'en lance pas une seconde : les demandes se fondent en une seule relecture, après elle. La requête en vol n'est pas annulée : elle peut porter l'arbre d'avant un geste, la suivante le corrige. |
| HN-E11S20-5 | Équipes et nom de l'organisation restent ceux du layout, relus avec la page (`router.refresh()`, qui suit la création d'une équipe) : les relire avec l'arbre demanderait une seconde route (`GET teams` rend l'annuaire, que le layout ne passe pas au rail). |
| HN-E11S20-6 | Route `GET /api/platform/nodes/tree` dans la ressource `nodes`, à côté de `nodes/links`, `nodes/impact` et `nodes/export` : aucun paramètre, le service du layout (`visibleTree`) sous la session, lecture sans journal (D138). |

### E11-S21 — L'image de partage d'une adresse : aperçu Open Graph aux couleurs de l'organisation (1.1.5)

| Id | Règle |
|---|---|
| HN-E11S21-1 | L'image d'un lien public est une route de l'hôte, `/p/[jeton]/share-image/[[...chemin]]`, et non la convention `opengraph-image` : Next ne peut la monter sous l'attrape-tout optionnel `[[...chemin]]`, et posée à `/p/[jeton]/` elle ignorerait le chemin d'un contenu dessous. L'image générique garde la convention (`src/app/opengraph-image.tsx`). Segment anglais (ADR-020), hors de `NODE_PATH_PATTERN` (tiret) : aucun chemin de nœud ne le porte. |
| HN-E11S21-2 | Un robot d'aperçu n'est pas la personne : toute adresse autre qu'un lien public ne montre que l'organisation (nom, couleur, logo), jamais le titre ni le contenu d'une page privée, même collée par une personne connectée ; `/n/<chemin>` ne pose aucune métadonnée de partage, son titre privé ne sort que dans `<title>`. |
| HN-E11S21-3 | Clé de cache par révision : l'image d'un lien porte `?v=<révision>` du contenu servi, qui change avec un titre ou un résumé publié. Réponse en `private, max-age=300` (aucun cache partagé, comme toute réponse publique d'ADR-013 : une révocation vaut aussitôt côté serveur) ; l'image générique en `public, max-age=3600` (une marque changée se voit dans l'heure). |
| HN-E11S21-4 | Le logo se lit côté serveur par `fetchSource` (https, 443, adresses privées refusées, 1 Mo, 3 redirections) en 3 s au plus, et entre dans l'image en `data:` : PNG ou JPEG seulement (Satori ne décode ni WebP ni AVIF ; un SVG mal formé casserait l'image après l'envoi du statut 200) ; sinon l'initiale sur la couleur du thème. |
| HN-E11S21-5 | Aucune police Inter n'existe en fichier local (celle de `next/font` est compilée) : l'image garde la police par défaut d'`ImageResponse`, Noto Sans (latin, accents français), sans appel réseau ; graisse unique, le titre se distingue par sa taille et sa teinte (`--title`). |
| HN-E11S21-6 | Le paquet ne dépend pas de `next/og` : il rend l'arbre JSX (`ImageDePartage`) et les données (`shareImageData`) ; l'hôte appelle `new ImageResponse(…)`. Un import de `next/og` par le paquet chargerait le moteur d'image (WASM) dans la face qui l'importe. |
| HN-E11S21-7 | Textes : `og:description` générique « Les pages, procédures et tableaux de <organisation>. » (aucune sans organisation) ; d'un lien sans résumé, « Partagé par <organisation>. » ; dans l'image, nom coupé à 60 caractères, titre à 90, résumé à 160 ; `og:description` à 200 ; au dernier mot entier, suivis de « … ». `og:url` générique : `/` (l'adresse demandée n'est pas connue du layout). Aucune mention d'Oto quand l'organisation est connue, comme la page publique ; sans organisation, « Oto » et sa marque. |
| HN-E11S21-8 | Le layout racine compose ses métadonnées à chaque page : l'origine (`getRequestOrigin`, passée par `webUrl`) et la marque de l'adresse (lecture `anon` bornée à 1 s, une fois par requête par `cache`) ; Next 15 diffuse les métadonnées après le premier octet pour un navigateur, seul un robot les attend. |
| HN-E11S21-9 | L'image d'un lien ne porte que ce que le lien donne déjà (titre, résumé, organisation) : ADR-013 § 3 inchangé ; § 6 (« l'hôte monte une route de plus ») s'étend à la route de l'image, écrit dans l'architecture. |
| HN-E11S21-10 | 1.1.6 : l'image et les métadonnées de partage ont leur entrée, `@otomata_tech/oto_platform/share`, qui pointe le module existant (`ui/public/image-de-partage.tsx`, sans module client) plutôt qu'un nouveau dossier ; `/ui` les exporte encore (le paquet ne fait qu'ajouter, ADR-006). Cause mesurée : `app/opengraph-image.tsx` importait le barrel `/ui`, dont Next collecte tous les modules client dans les morceaux du segment racine (JS partagé par toutes les pages : 314 kB, 104 kB avec `/share`) ; le layout racine seul n'en était pas la cause. |
| HN-E11S21-11 | `/_not-found` passe de statique à dynamique depuis la 1.1.5 : le `generateMetadata` du layout racine lit l'origine et la marque de l'adresse (HN-E11S21-8), propres à chaque organisation ; toutes les autres pages étaient déjà dynamiques. Accepté : un 404 statique porterait les métadonnées d'une seule organisation. |
| HN-E11S21-12 | 1.1.7 (M104) : une route ne charge que le code client des écrans qu'elle monte par `optimizePackageImports: ["@otomata_tech/oto_platform/ui"]` dans la configuration de l'hôte, sans entrée nouvelle du paquet ni import changé. Mesuré par builds (JS de la page et de ses layouts, compressé) : `/login` 337 → 151 kB (le zod de son formulaire seul), `/admin` 322 → 219, `/n/<chemin>` 323 → 303 (avec l'éditeur). Écartées : des entrées par écran (`./ui/auth`, `./ui/theme`…), une surface d'exports à maintenir et des imports à changer chez chaque hôte pour le même résultat ; `"sideEffects"`, déjà `false` et sans effet sur la collecte des modules client par Next, qui précède l'élagage. Le nom du paquet seul, essayé en 1.1.6, ne couvre pas le sous-chemin `/ui`. Un hôte sans la ligne reste correct, plus lourd. Condition gardée par test : le barrel ne fait que réexporter. |

### Tâches de suite

| Id | Règle |
|---|---|
| HN-M08-5 | Sous une session, une ligne `members` qui change de `user_id` perd l'email, le nom et la dernière connexion de la précédente ; si la personne nouvelle est l'appelante, elle reçoit les copies de ses claims. |
| HN-M37b-3 | Le résumé en échec du pied du tableau s'affiche en alerte : « Le résumé n'a pas pu être calculé. » en titre, le message dessous, un lien « Réessayer », la grille intacte. |
| HN-M38-1 | L'espace personnel `perso/<handle>` naît titré « Privé » ; un espace encore titré « Perso » par la base le devient, un titre changé par sa personne reste. |
| HN-M53-10 | Sur un tableau `proof: true`, à la publication d'une procédure, un bloc `call` de `table.write` qui écrit une colonne de valeur sans `comment` ni `link` est refusé, valeur réservée comprise ; la colonne d'état et la clé s'écrivent nues ; une cellule entière réservée (`"<notes>"`) reste admise ; ce refus s'ajoute à un refus de type (fiches D100, D133). |
| HN-M53-5 | Dans `table.write`, une valeur nue d'une colonne de valeur est jugée sur les lignes lues avant toute écriture : égale à la valeur rangée, ignorée ; différente, ou sur une ligne à créer, elle refuse l'appel entier sur un tableau `proof: true`, et s'écrit nue sans lui (fiche D133). |
| HN-M54-5 | La file de revue lit 20 fiches : au-delà, elle dit « 20 premières sur N », et « Passer » depuis la dernière dit le retour à la première et que les suivantes paraissent après les décisions. |
| HN-M59-1 | À l'écran, un bloc `call` déjà écrit se lit comme un texte (« Appel de <fonction> : { … } »), jamais exécuté par l'écran ; un appel dont le texte ne change pas reste un appel, et rien ne part pour lui. |
| HN-M59-3 | Le service refuse encore la publication d'une procédure trop longue ou d'un bloc `call` déjà écrit ; l'écran de refus de publication en dit l'emplacement et le genre. |
| H-M67 | `replace_block` d'un bloc inconnu est refusé aussi ; un bloc que la base admet mais que le schéma refuse reçoit la même ligne et les mêmes refus ; le type n'est pas assaini dans la ligne (liste fermée en base) ; un titre de niveau 4 ou 5 n'ouvre pas de section. |
| H-M68 | La redirection d'une création « Sans titre » se limite aux alias et aux genres incompatibles (un nœud compatible garde `stale_revision`) ; une course reste `conflict` ; le premier chemin libre égal au chemin du nœud est refusé (« nothing to move ») ; l'aperçu d'impact reste calculé sur le chemin demandé ; le formulaire annonce le chemin demandé, le chemin réel se dit après. |
| H-cellule-saas | Le test des sous-domaines de la cellule (oto-saas : `tests/unit/cellule-sous-domaines.test.ts`) passe par la porte publique `handleAdminMcp`, avec un vérificateur injecté et une graine en ligne par le pilote `postgres`, sans `tests/helpers/` : il se résout contre le paquet publié dans le dépôt du SaaS, qui garde `postgres` en `devDependencies`. |
| HN-E05S13 | E05-S13 (story, sections des lots) : A1 à A11 (lignes servies traduites à l'écran, repli sur le texte servi), B1 à B7 (Retours réservés à l'équipe plateforme par `handlesFeedback`, Usage réduit à `notFound()`), E1 à E9 (organisation jetable par campagne), M-1 à M-14 (rôle de membre source des responsables, retrait d'un responsable réservé à l'administrateur, appel sans équipe nommée : la seule équipe qui a un compte, sinon `ambiguous_team`), I1 (avis de budget sans chiffre) |
