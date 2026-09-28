# Brancher votre assistant

> Guide des utilisateurs du pilote. `<Nom>` est le nom de connecteur que recommande la page
> `/connect` de votre organisation, `<adresse>` l'adresse du serveur qu'elle fait copier. Les écrans
> des assistants changent souvent : si un libellé diffère, cherchez son équivalent.

## Avant de commencer

1. Ouvrez le lien d'invitation reçu par email et connectez-vous une fois à l'application.
2. Ouvrez la page `/connect` de l'application (« Brancher un assistant ») : elle donne l'adresse du
   serveur, le nom du connecteur et les commandes de Claude Code, à copier. Une adresse par
   organisation : si vous travaillez pour plusieurs organisations, ajoutez un connecteur pour chacune.

## claude.ai et Claude Desktop

1. Paramètres → Connecteurs → « Ajouter un connecteur personnalisé ».
2. Nom : `<Nom>` ; adresse : `<adresse>`. Gardez ce nom : c'est lui que l'assistant voit.
3. « Se connecter » : connectez-vous avec votre compte de l'application, puis autorisez l'accès.
4. Sur la fiche du connecteur, menu ⋯ → « Actualiser la liste d'outils ».
5. Rechargez la page, attendez quelques secondes, puis ouvrez une nouvelle conversation.
6. Au premier appel de chaque outil qui la demande, claude.ai veut votre autorisation : choisissez
   « Toujours autoriser ».

## ChatGPT

1. Paramètres → Connecteurs : activez le mode développeur.
2. « Créer » un connecteur : nom `<Nom>`, adresse `<adresse>`, authentification OAuth.
3. Connectez-vous avec votre compte de l'application, puis autorisez l'accès.
4. Sur la fiche du connecteur, cliquez sur « Actualiser » : sans ce geste, aucun outil n'apparaît.
5. Dans une conversation, écrivez `@<Nom>` au premier usage.

Aucune phrase à ajouter dans ChatGPT. Si plusieurs comptes sont liés au même connecteur, ChatGPT
utilise le compte principal.

## Claude Code

```
claude mcp add --transport http <nom> <adresse>
claude mcp login <nom>
```

Lancez les deux commandes dans le dossier où vous ouvrirez Claude Code : sans `--scope`, le serveur
n'est enregistré que pour ce dossier. `<nom>` est le nom court que `/connect` donne pour Claude Code,
sans accent. La seconde commande, dans
un terminal interactif, ouvre le navigateur pour la connexion et l'autorisation. Ouvrez ensuite une
nouvelle session : la commande `/mcp` montre l'état du serveur.

## Phrase de préférences (claude.ai seulement)

Si `<Nom>` est votre seul connecteur d'organisation, ajoutez cette phrase, telle quelle, à vos
préférences personnelles de claude.ai (Paramètres → Profil → préférences) :

> Quand une demande concerne mon travail, commence par l'outil de contexte du connecteur « <Nom> ».

N'y ajoutez rien d'autre, en particulier pas « si rien ne correspond, dis-le au lieu de deviner » :
l'assistant ne répondrait plus aux questions sur vos données. Vous avez plusieurs connecteurs
d'organisation ? N'ajoutez pas la phrase : elle attirerait vers `<Nom>` les demandes destinées aux
autres. Aucune phrase dans ChatGPT ni dans Claude Code.

## Quand nous annonçons une mise à jour

Votre assistant garde l'ancienne description des outils tant que vous ne faites pas ce geste :

- claude.ai : fiche du connecteur, menu ⋯ → « Actualiser la liste d'outils », puis une nouvelle
  conversation, dont le premier message part quelques secondes après l'ouverture de la page ;
- ChatGPT : bouton « Actualiser » de la fiche du connecteur, puis une nouvelle conversation avec
  `@<Nom>` ;
- Claude Code : une nouvelle session.

Déconnecter puis reconnecter le connecteur ne suffit pas.

## Ce que fait l'assistant dans le pilote

Le pilote qualifie des prospects. Sur votre demande, par exemple « Qualifie les prospects à
traiter. », l'assistant :

- réserve des prospects « à traiter » du tableau de suivi des prospects ;
- cherche leurs coordonnées (contact, email, montant estimé), d'abord dans la plateforme ;
- les écrit avec leurs sources ;
- les rend « à revoir ».

Il ne contacte personne et ne décide pas. La décision reste humaine : dans l'écran du tableau,
section « À revoir », chaque fiche s'approuve ou se refuse. Pour que l'assistant en tienne compte,
cliquez sur « Copier pour la conversation » et collez le résumé dans la conversation. D'autres
demandes à essayer figurent sur `/connect`, section « À essayer ».

## Signaler un problème

Demandez à l'assistant de le signaler (« Signale ce problème : … ») : il appelle l'outil `feedback`
du connecteur, qui crée un ticket numéroté, `FB-0012` par exemple, que l'équipe de la plateforme lit.
Donnez ce numéro si vous nous écrivez.
