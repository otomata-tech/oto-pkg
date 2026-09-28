# Décisions de JB

> Les décisions de JB encore citées par le code, les conventions ou la méthode, chacune en une
> ligne dans son état en vigueur, et les questions ouvertes. Une décision qui gouverne un
> invariant s'écrit aussi dans son ADR ; les choix du projet sans décision de JB sont dans
> [`hypotheses.md`](hypotheses.md).

## Questions ouvertes

Relevées par E05-S12 ; la story avance sous l'option en gras (`docs/stories/E05-S12-contexte-et-accueil.md`, « Hypothèses »).

| Id | Question | Options | Ce qui tranche |
|---|---|---|---|
| Q1 | Ordre des parties servies par `context` (HN-E05S12-2) | **A.** Tout le monde, Privé, équipes (défaut d'abord). **B.** Privé d'abord, la ligne de langue en tête. | JB : change ce que lit l'assistant de chaque organisation |
| Q2 | Texte des « Règles Oto » servi à tous les assistants (HN-E05S12-7) | **A.** Anglais, sans le mot « Oto », chemins d'exemple neutres. **B.** Un autre texte relu par JB. | Relecture du texte par JB |
| Q3 | Portée des activités de l'accueil (HN-E05S12-14) | **A.** Celle du journal : qui administre voit l'organisation, un membre ses gestes et ceux des équipes qu'il mène. **B.** Tout geste sur un contenu que la personne lit, auteur nommé. | JB |
| Q4 | Mise en page de l'accueil (HN-E05S12-20) | **A.** 2fr / 1fr, « Procédures utiles » à droite, « Contenus récents » retiré. **B.** « Contenus récents » à la place des procédures. | JB |

## Décisions en vigueur

| Id | Décision |
|---|---|
| D1 | Une personne sans compte entre sur invitation : en mode Supabase, inscription ouverte filtrée par le hook « Before User Created », l'email étant le lien magique ; aucune clé de service dans le paquet. |
| D2 | L'équipe plateforme reçoit un accès à l'organisation qu'elle crée, puis invite le client ; l'administrateur du client voit ces accès, nommés et datés, et peut les révoquer. |
| D3 | Les jetons OAuth des assistants durent 3 600 s (`jwt_exp`), rafraîchis en silence par les hosts ; retirer le membre coupe l'accès tout de suite. |
| D4 | Qui gère un nœud pose des règles pour une autre équipe, une personne ou toute l'organisation, en lecture ou en écriture ; une règle de gestion reste réservée à l'administrateur ; une règle ne vise jamais quelqu'un du dehors (le lien public est à part, ADR-013). |
| D5 | L'administrateur d'une organisation a la gestion sur tout, sauf les espaces personnels ; un nœud qu'un gestionnaire rend personnel sort donc aussi de sa vue. |
| D7 | Le pilote V1 est la qualification de prospects dans un tableau, par une procédure avec revue humaine, sans connecteur externe ; la relance des devis est le pilote V2. |
| D8 | Le contrat MCP des six outils (noms, titres, descriptions, schémas) part tel qu'écrit, sans relecture préalable ; il ne change plus que par ajout (ADR-002), et un test le fige. |
| D9 | Une demande d'un seul mot sert une procédure dès qu'elle passe le seuil du routage, comme toute autre demande ; ces cas sont mesurés, pas refusés. |
| D10 | Le paquet lit le schéma `auth` de Supabase par deux fonctions seulement : `oauth_pending_resource` (l'organisation visée par la demande en attente de l'appelant) et `oauth_clients_activity` (activité des clients OAuth, outillage seul). |
| D11 | Un lien d'invitation ou de connexion s'ouvre sur `/auth/confirmer` sans rien consommer ; le jeton n'est vérifié qu'au clic sur « Continuer », pour qu'une passerelle de messagerie qui ouvre le lien ne l'use pas. |
| D13 | L'inscription ouverte laisse l'API publique de Supabase distinguer une adresse invitée d'une autre ; c'est accepté, sans CAPTCHA, `/login` répondant pareil pour toute adresse. |
| D14 | Seule l'équipe plateforme qui administre une organisation rattache ou retire ses adresses (`org_domains`). |
| D15 | Le logo des écrans d'authentification fait un tour à l'arrivée, en 5 s au plus, puis reste immobile (WCAG 2.2.2). |
| D16 | Les écrans d'authentification portent la mention « Données hébergées en France ». |
| D17 | Un membre de l'équipe plateforme avec un accès en cours peut devenir membre de l'organisation ; l'écran Équipes et droits liste, à côté des accès plateforme, les membres ajoutés par l'équipe plateforme. |
| D18 | Tout gestionnaire d'un nœud d'équipe (responsable, ou règle de gestion) peut le rendre personnel, par son propriétaire ou en le déplaçant dans un espace personnel ; l'administrateur ne le voit plus. |
| D19 | À l'oubli d'une personne (`forget_user`), son espace personnel part avec elle, ses mots du lexique de recherche aussi ; ce que d'autres possèdent dessous reste. |
| D20 | Une règle d'équipe posée au-dessus du dossier d'une équipe devient sa règle la plus proche et peut baisser son niveau ; le responsable garde la gestion ; pour garder l'écriture, poser aussi une règle d'écriture sur le dossier. |
| D21 | L'éditeur garde chaque bloc écrivable en champ toujours monté ; le texte part à la sortie du champ, sur ⌘S ou après 1 200 ms sans frappe ; un conflit se traite au bloc, les autres champs passant en lecture seule. |
| D24 | Les sous-domaines et l'appel à l'hébergeur sont hors du paquet, qui n'expose qu'un point d'extension à la création d'une organisation ; le domaine de base est une variable de l'hôte. |
| D27 | `members.email` et `members.name` sont des copies tenues par l'outillage et par la session ; l'annuaire (`member_directory`) les lit là, jamais dans `auth.users`. |
| D28 | Les droits se décident et se filtrent dans les services ; la RLS ne garde que l'isolation par organisation et les invariants, et `platform` n'est plus servi par le Data API de Supabase. |
| D33 | La suite de tests est tenue au minimum vital : un test par règle, sa frontière si elle est le risque ; restent toujours testés le gate de commit, le contrat MCP figé, l'isolation et les droits, les secrets, les fonctions `definer`, les verrous. |
| D38 | La ligne de journal d'un `call` ne porte l'équipe (porteuse, ou rendue par la fonction) que si la personne en est membre, sinon aucune : un responsable ne lit pas les arguments d'une personne hors de son équipe. |
| D42 | `accounts.owner_team_id` est une clé différée sans action, comme `nodes.owner_team_id` : une équipe qui possède un compte de connecteur ne se supprime pas, la base le refuse au `commit`. |
| D43 | L'extrait d'un bloc trouvé par `find` va jusqu'à la fin du bloc quand il en reste au plus huit mots. |
| D44 | Pour tout lecteur autre que son auteur, un appel sur l'espace personnel d'autrui ne livre au journal, à l'usage et à `admin_journal` que son outil, son heure, son issue et son code d'erreur, sa cible coupée à `private/<handle>` (`perso/<handle>` pour une ligne écrite avant D107). |
| D49 | Un `null` dans un lot `table.write` refuse sa seule ligne, avec la consigne de la corriger ; les autres lignes du lot s'écrivent. |
| D52 | Pour tout lecteur autre que son auteur, un message d'erreur servi au journal, à l'usage ou à `admin_journal` coupe chaque chemin `private/<handle>/…` (ou `perso/<handle>/…`, d'avant D107) à son espace. |
| D54 | En mode OIDC, la plateforme envoie elle-même l'email d'invitation, par le relais SMTP de l'hôte (`PLATFORM_SMTP_URL`), sur un modèle en français à la marque de l'organisation. |
| D66 | Le schéma `platform` part d'une seule migration de ligne de base, portable sur un Postgres managé (extensions `pg_trgm`, `unaccent`, `ltree` seulement, sans superutilisateur ni `moddatetime`) ; les migrations suivantes s'y ajoutent. |
| D69 | Un client ou une personne réels s'écrivent par un libellé neutre : « le premier client », « l'ERP Python », « l'ERP d'un partenaire », « le responsable d'Oto ». |
| D76 | Un service écrit en SQL se teste sur une vraie base qui rend des lignes interdites : le projet Supabase en local, un Postgres nu en CI (`bare-postgres`), sans Supabase Auth, par `asCaller` et la connexion d'administration. |
| D77 | En mode OIDC, `identity_for_caller()` relie à l'équipe plateforme l'email vérifié présent dans `platform_staff.email` ; `pnpm platform:staff add` crée la ligne par email, sans compte Supabase. |
| D79 | En mode OIDC, la page de connexion est celle de l'émetteur (Logto ou Keycloak), habillée aux couleurs d'Oto par sa propre configuration, sans code dans le paquet. |
| D80 | `platform` est retiré des schémas exposés par le Data API d'un projet Supabase, par `pnpm data-api:close` (API de gestion, différentiel puis `--apply`, relecture), après le déploiement du paquet qui n'y passe plus. |
| D89 | L'espace personnel s'appelle « Privé » dans le rail et dans son titre ; son dossier est `private/<handle>` (D107). |
| D90 | Sous 768 px, un bouton « Menu » ouvre le rail en tiroir, sans piège du focus. |
| D93 | `pnpm platform:staff add <email> --user <identifiant>` rajoute en mode OIDC une personne retirée de l'équipe plateforme sous l'identifiant que son sujet garde dans `identities`. |
| D94 | Retirer une personne d'une équipe demande confirmation, par un dialogue « Retirer X de l'équipe ? ». |
| D96 | Pas de purge d'historique : paquet et SaaS partent chacun d'un dépôt neuf, en un commit initial de l'arbre nettoyé ; le dépôt actuel reste privé ; le pilote exécute ces gestes de fin de V1 avec l'accord de JB. |
| D97 | Dans une fenêtre étroite, la grille d'un tableau défile en largeur dans son îlot, jamais en cartes : tri et filtres par colonne restent. |
| D99 | `table.write` exige la preuve d'une valeur nouvelle ; l'accord ne vaut que pour un envoi ou ce qui dépasse la procédure demandée ; « What's new » vide du jour est omis ; une procédure d'un espace Privé n'est candidate que pour son propriétaire. |
| D100 | Dans `table.write`, une valeur nue égale à la valeur rangée est ignorée sans erreur ; toute valeur nouvelle d'une colonne de valeur exige `{value, comment \| link}`, sinon l'appel entier est refusé ; la colonne d'état s'écrit nue, dans ses transitions permises ; un état interdit ou une clé qui change est refusé avec son vrai motif. |
| D101 | « Accès général » ouvre un contenu à toute l'organisation en lecture ou en modification (ADR-014) ; l'adresse d'un contenu suit son titre partout, assistants compris, l'ancienne restant un alias ; l'export d'une organisation emporte la corbeille ; un contenu restauré revient sous son plus proche ancêtre encore là. |
| D102 | Le schéma sort propre en 1.0.0 : une migration de retraits (ADR-006 § 2), puis une seule ligne de base V1 ; seule la licence nomme une personne, avec le nom, le domaine et la société du responsable du projet ; les tests du dépôt du paquet tournent en CI sur un Postgres nu, les suites propres à Supabase Auth vont au dépôt du SaaS. |
| D103 | La page publique d'un tableau montre ses lignes : grille en lecture seule, valeurs publiées seulement (ni preuve, ni provenance, ni réservation), 500 lignes au plus, dans la limite de ce que l'auteur du lien lit (ADR-013). |
| D104 | À l'écran, une procédure est une page comme les autres tant que les connecteurs ne sont pas là : même éditeur et même lecture, texte seul, un bloc d'appel déjà écrit lu en texte ; côté assistants, rien ne change (`context`, prompts, vérification à la publication). |
| D105 | Les retours produit d'E05-S11 passent avant la 1.0.0. La langue du profil change la langue de réponse de l'assistant ; défaut : la langue de l'organisation, puis le français. La traduction des écrans n'est pas en V1 (story à part, ADR-015 proposé). |
| D106 | La couleur de l'organisation est le défaut de tout compte sans choix ; `context` dit toujours la langue de réponse, français compris ; la traduction des écrans, quand elle viendra, passe par des tables typées par écran, sans `next-intl` dans le paquet (ADR-015). |
| D107 | Hors édition, un lien ou une citation se lit en lien hypertexte dans la phrase (titre d'une page, texte ou domaine d'une adresse web, jamais `https://…` ni `[[chemin]]`) ; au focus, le texte brut. `perso` devient `private` partout (chemins, fonctions SQL, journal, assistants, adresses), les anciens chemins restant des alias ; l'espace de toute l'entreprise a pour identifiant `all` (« Tout le monde »), ses contenus restent à la racine. « Contenus liés » : « Sous-pages », « Mentionnés », « Mentionné dans ». |
| D108 | Les connecteurs (V2) repartent de zéro : le service connecteurs n'est pas construit sur `oto-core` et ne reprend pas les outils d'Oto ; langage et dépôt au choix de l'équipe qui l'écrit. Reste le contrat vu du paquet (ADR-007) : un serveur MCP, secret du compte en en-tête, sans état. |
| D109 | Dans le texte servi par `context` et dans l'onglet « Contexte » de l'accueil, les faits de la personne, de l'organisation et d'une équipe sont la première ligne de la partie du Contexte correspondant (Privé, Tout le monde, chaque équipe), servie même quand ce Contexte est vide ; « Code de la conversation » devient « Règles Oto », replié, non modifiable. |
| D110 | Sous un nœud Contexte se rangent d'autres contenus (page, tableau, procédure) : dans le rail, le « + » d'un Contexte et le glisser-déposer sur sa ligne créent ou rangent sous lui ; quand `context` sert ce Contexte, ses enfants sont listés en lignes d'index (jamais leur corps), avant ses pages liées. |
| D111 | Le markdown et le CSV ne sont pas des types de contenu : ils s'importent en page et en tableau, et s'exportent. Un tableau GFM devient un type de bloc, le « tableau simple », distinct du nœud tableau. Les fichiers vivent derrière un port de stockage S3 générique (ADR-016). Le HTML est un type de bloc `html`, pas un type de nœud (ADR-017). |
| D112 | Un bloc `html` se sert aussi par un lien public, sous la même isolation qu'à l'intérieur, avec une bannière hors de l'iframe (« N'y saisissez jamais de mot de passe ») ; la navigation de l'iframe reste un canal de sortie, écrit dans ADR-017 § 2 et testé. |
| D113 | 50 Mo par fichier et 10 Go par organisation, en valeurs fixes, sans écran de quota. |
| D114 | Les pages sont compatibles avec le markdown (E10-S04) : tableau simple, séparateur, listes imbriquées, repli (`<details>`), marques en ligne (barré, échappements, `<br>`, imbrication, `<https://…>`), titres à cinq niveaux. Écartés pour l'instant : dessin des diagrammes Mermaid, tons des encarts. |
| D115 | Le menu de l'éditeur garde un seul « Titre » ; un titre importé ou écrit par un assistant garde son niveau et s'affiche selon lui ; `# ` et `## ` donnent le niveau 1, puis `### ` à `###### ` les niveaux 2 à 5. |
| D116 | Dans l'éditeur, le « + » et `/` ouvrent un choix en deux groupes : « Texte » (formes de texte et Repli) et « Insérer » (Tableau simple, Séparateur, Image, Fichier). « HTML » n'y figure pas : un artefact est une page qui ne porte que son bloc `html`, créée depuis le rail, et le service refuse de mélanger un bloc `html` avec d'autres blocs. |
| D117 | Un assistant n'envoie pas dans un appel MCP un fichier qu'il a déjà : `upload.link` (derrière `call`) rend un lien à usage unique, où Claude Code envoie le fichier par `curl` (ADR-018) ; le dépôt à l'écran reste le chemin des assistants sans shell. |
| D118 | Dupliquer une page qui a des images ou des fichiers copie les objets, par une 5ᵉ opération du port de stockage, `copy`, faite côté bucket ; chaque page garde ses propres fichiers. |
| D119 | `read` gagne un champ facultatif `block` (la référence d'un bloc), qui lit la source complète d'un artefact HTML ; `read` d'une page n'en sert qu'un extrait. Ajout admis par ADR-002. |
| D120 | Importer un CSV dans un tableau nouveau exige la gestion du dossier : l'import crée et publie l'en-tête, puis écrit les lignes ; un rédacteur reçoit `forbidden` avec à qui s'adresser. Importer dans un tableau existant demande l'écriture. |
| D121 | Les nouveautés d'E10 arrivent sans drapeau par organisation ; en contrepartie, une version mineure du paquet ne fusionne pas seule chez un hôte, sa PR Renovate se relit à la main (ADR-006). |
| D122 | Le lecteur tolérant (`read` affiche une ligne à la place d'un bloc de type ou de forme inconnus, `write` refuse par `conflict` une opération sur une section qui en contient un) sort avant le tag `v1.0.0`. |
| D123 | Les six stories d'E10 sortent dans une seule version du paquet, 1.1.0 : une seule PR Renovate à relire chez l'hôte ; rien ne sort avant la fusion des six. |
| D124 | Un seul fichier de migration par version publiée du paquet : chaque story Ⓜ garde son fichier pendant le développement, puis le pilote les fusionne en `<horodatage>_vX_Y_0.sql` avant le tag et répare l'historique du projet de test. |
| D125 | Un chemin n'est jamais un motif de refus : création, renommage, déplacement, restauration et duplication prennent le premier chemin libre sous le parent (`<segment>_2`, `_3`…, anciens chemins et corbeille comptés), l'ancien chemin restant un alias ; pas d'identifiant dans l'URL. Le refus de changement de genre et les refus de droits restent. |
| D126 | oto-saas n'est pas rebranché sur Vercel : le responsable du déploiement le déploie chez Scaleway, base PostgreSQL managée et Keycloak (procédure : `docs/deploiement.md` d'oto-saas). Le projet Vercel actuel reste sur l'ancien dépôt tant que le déploiement Scaleway n'est pas fait (JB, 2026-09-28). |
| D127 | Les retours de JB du 28 au soir (story E05-S13) passent avant la publication 1.0.0. « Règles d'accès » et « Accès plateforme » quittent l'écran Équipes & accès (les droits se règlent dans « Partager » ; l'accès du support d'Oto par la console admin). L'espace Démo est vidé de ses contenus et de ses équipes à la fin ; les tests de bout en bout sèment leurs propres données (JB, 2026-09-28). |
| D128 | E05-S13 : une équipe a plusieurs responsables (`team_members.role` devient la source, « Lead: A, B. » dans le texte servi) ; l'équipe par défaut est supprimée du modèle en deux temps (ADR-006) : en 1.0.0 plus rien ne la lit ni ne l'écrit (écrans, service ; un connecteur sans équipe précisée demande laquelle, `ambiguous_team`), la colonne vidée part en 1.1 ; « Usage » caché ; textes par portée : Tout le monde « Ce que les assistants de tous les membres de l'organisation lisent à chaque conversation. », équipe « Ce que les assistants des membres de l'équipe X lisent à chaque conversation. », Privé « Ce que votre assistant lit à chaque conversation ; vous seul le recevez. » (JB, 2026-09-28). |
