-- E10-S02 (ADR-016 ; fiches D111, D113, D118, D137) : les fichiers joints à un nœud. Migration unique de la
-- story, complétée lot par lot jusqu'à la fusion de la story ; jamais appliquée au projet avant (bases locales
-- seules, HN-E10S02-51) ; le pilote la réunit dans celle de la version (fiche D124).
--
-- Lot a.
-- 1. `files` : les métadonnées d'un fichier joint à un nœud, jamais ses octets (ADR-016 § 3) ; la clé d'objet
--    vaut `<org_id>/<id>` et ne reprend jamais le nom d'origine. `pending` à la demande d'envoi, `ready` à la
--    confirmation (ADR-016 § 4) ; pas d'empreinte (HN-E10S02-7). `node_id` en cascade : filet de sécurité, la
--    purge de la corbeille lit les clés avant (lot e). Index `(org_id, status)` pour le quota et la purge des
--    envois abandonnés, `(node_id)` pour la corbeille et la duplication.
-- 2. RLS d'isolation par organisation (ADR-012 § 3) : les droits sur le nœud sont décidés par le service
--    (`server/files/service.ts`), avant sa requête. L'insertion est attribuée à l'appelant, vise un nœud de
--    l'organisation, comme `node_shares`, et pose une ligne `pending` : seule la confirmation la rend `ready`.
--    Privilèges d'`authenticated` seul, sur le modèle de la ligne de base V1 (aucun privilège à `service_role`) ;
--    la mise à jour ne touche que `status`.
-- 3. `blocks_type_check` et `blocks_shape_check` élargies en une instruction, reprises de 20260929170000 :
--    le bloc `file` (`{file_id, name, size, mime}`, `text` nul), et l'image interne (`image.data` porte `src`
--    en `https` ou `file_id`, jamais les deux ; `width` facultatif : `small`, `medium`, `full`). Toute ligne
--    existante reste valide.
-- 4. `block_search_text` re-versionnée à signature identique : le nom d'un fichier est cherchable ; même texte
--    qu'avant pour toute forme existante (`search_tsv` n'est pas recalculée). Privilèges redits.
-- 5. `forget_user` re-versionnée à signature identique : `files.created_by` mis à nul, comme les autres
--    auteurs (`database-patterns.md § Règles`) ; lot f : les tickets de dépôt de la personne supprimés (§ 8).
--    Privilèges redits (aucun `grant`).
--
-- Lot c.
-- 6. `public_file_by_token` : la lecture publique d'un fichier par le jeton d'un lien (ADR-016 § 7, ADR-017 § 5),
--    `security definer` exécutée sous `anon` seul, sur le modèle de `public_node_by_token` (ligne de base) : lien
--    actif, nœud du fichier publié, hors corbeille, dans le périmètre du lien et lisible par l'auteur du lien ;
--    fichier `ready` cité par un bloc **publié** (`file` ou `image`) de ce nœud. Rend l'identifiant, le nom, le
--    type, la taille et le chemin du nœud, ou rien, la même réponse pour tout refus. La clé d'objet se compose
--    dans le paquet (`objectKey`), sa seule source. Ouverte à `anon` par ADR-016 § 7 : aucun `auth.uid()` à
--    contrôler, le jeton et l'organisation de l'adresse bornent la lecture.
--
-- Lot e.
-- 7. `duplicate_subtree` remplacée (AC-e3, ADR-016 § 6, fiche D118), reprise de la ligne de base 20260928100000,
--    mêmes contrôles et mêmes droits. Le type rendu gagne une colonne, `copied_files` : la fonction est retirée
--    puis recréée aussitôt. Chaque fichier d'un nœud copié qu'un bloc publié de ce nœud cite (`file`, ou image
--    jointe) reçoit une ligne neuve `pending` sous la copie ; le `file_id` des blocs copiés est réécrit, donc
--    celui de l'instantané de la révision 1, pris sur eux. Par nœud, la fonction rend les paires (ancien, nouveau)
--    de ses fichiers ; le service copie les objets après le commit et passe chaque ligne copiée à `ready`
--    (`server/nodes/duplicate.ts`). Aucun fichier n'est ainsi cité par deux nœuds.
--
-- Lot f.
-- 8. `upload_tickets` : le ticket d'un dépôt par lien à usage unique (ADR-018 § 2 ; AC-f3) : les empreintes SHA-256
--    (hex) de ses deux jetons, jamais un jeton : celui de `curl` (`token_hash`, porte sans session) et celui du
--    formulaire (`form_token_hash`, route à session, ADR-018 § 8) ; la personne, l'organisation, le `ctx` de l'appel,
--    la destination, le type, le mode et leurs paramètres ; 15 minutes (posées par le service) et un envoi (`used_at`,
--    commun aux deux jetons). Aucune clé vers `members` : une personne retirée garde son ticket, que l'envoi refuse par
--    `not_member` (AC-f6). RLS d'isolation par organisation ; la lecture ne rend à un membre que ses tickets, et les
--    tickets expirés de l'organisation (le ménage d'`upload.link`, AC-f3) : jamais la destination prévue par un autre ;
--    l'insertion est attribuée à l'appelant ; la suppression ne vise qu'un ticket expiré ; aucune mise à jour sous la
--    session : seule `consume_upload_ticket` pose `used_at`. Index `(org_id, expires_at)` pour le ménage ; l'unicité
--    de chaque empreinte sert la consommation. `forget_user` (§ 5) supprime les tickets de la personne.
-- 9. `consume_upload_ticket` : la consommation atomique d'un ticket (ADR-018 § 3, AC-f5), `security definer`
--    exécutée sous `anon` seul, ouverte par ADR-018 (aucun `auth.uid()` : l'envoi n'a pas de session) : un seul
--    `update` conditionnel, borné à l'empreinte du jeton de la porte qui l'appelle (`p_form`) et à l'organisation de
--    l'adresse, validé dans la transaction de l'appel, avant toute écriture du service. Rend la personne, son e-mail
--    dans `members` (nul pour qui n'en est plus membre), le `ctx` et la destination, ou rien, la même réponse pour un
--    ticket inconnu, expiré, servi (par l'une ou l'autre porte), d'une autre organisation, ou le jeton de l'autre porte.

-- 1. La table.
CREATE TABLE platform.files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    node_id uuid NOT NULL,
    name text NOT NULL,
    mime text NOT NULL,
    size bigint NOT NULL,
    status text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT files_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 255))),
    CONSTRAINT files_mime_check CHECK (((char_length(mime) >= 1) AND (char_length(mime) <= 255))),
    CONSTRAINT files_size_check CHECK (((size >= 1) AND (size <= 52428800))),
    CONSTRAINT files_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'ready'::text])))
);

COMMENT ON TABLE platform.files IS 'Fichiers joints à un nœud (E10-S02, ADR-016) : métadonnées seulement ; objet sous la clé <org_id>/<id> du stockage S3 de l''hôte.';

ALTER TABLE ONLY platform.files
    ADD CONSTRAINT files_pkey PRIMARY KEY (id);

ALTER TABLE ONLY platform.files
    ADD CONSTRAINT files_org_id_fkey FOREIGN KEY (org_id) REFERENCES platform.orgs(id) ON DELETE CASCADE;

ALTER TABLE ONLY platform.files
    ADD CONSTRAINT files_node_id_fkey FOREIGN KEY (node_id) REFERENCES platform.nodes(id) ON DELETE CASCADE;

CREATE INDEX idx_files_org_id_status ON platform.files USING btree (org_id, status);

CREATE INDEX idx_files_node_id ON platform.files USING btree (node_id);

-- 2. RLS et privilèges.
ALTER TABLE platform.files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS files_select_member ON platform.files;
CREATE POLICY files_select_member ON platform.files FOR SELECT TO authenticated USING ((org_id IN ( SELECT platform.member_orgs() AS member_orgs)));

DROP POLICY IF EXISTS files_insert_member ON platform.files;
CREATE POLICY files_insert_member ON platform.files FOR INSERT TO authenticated WITH CHECK (((created_by = ( SELECT auth.uid() AS uid)) AND (status = 'pending'::text) AND (org_id IN ( SELECT platform.member_orgs() AS member_orgs)) AND (EXISTS ( SELECT 1
   FROM platform.nodes n
  WHERE ((n.id = files.node_id) AND (n.org_id = files.org_id))))));

DROP POLICY IF EXISTS files_update_member ON platform.files;
CREATE POLICY files_update_member ON platform.files FOR UPDATE TO authenticated USING ((org_id IN ( SELECT platform.member_orgs() AS member_orgs))) WITH CHECK ((org_id IN ( SELECT platform.member_orgs() AS member_orgs)));

DROP POLICY IF EXISTS files_delete_member ON platform.files;
CREATE POLICY files_delete_member ON platform.files FOR DELETE TO authenticated USING ((org_id IN ( SELECT platform.member_orgs() AS member_orgs)));

GRANT SELECT,DELETE ON TABLE platform.files TO authenticated;

GRANT INSERT(org_id) ON TABLE platform.files TO authenticated;

GRANT INSERT(node_id) ON TABLE platform.files TO authenticated;

GRANT INSERT(name) ON TABLE platform.files TO authenticated;

GRANT INSERT(mime) ON TABLE platform.files TO authenticated;

GRANT INSERT(size) ON TABLE platform.files TO authenticated;

GRANT INSERT(status),UPDATE(status) ON TABLE platform.files TO authenticated;

GRANT INSERT(created_by) ON TABLE platform.files TO authenticated;

-- 3. Les types et les formes.
alter table platform.blocks
  drop constraint blocks_type_check,
  add constraint blocks_type_check check (type = any (array['heading', 'paragraph', 'list', 'checklist', 'code', 'call', 'mermaid', 'image', 'callout', 'reference', 'row', 'simple_table', 'divider', 'toggle', 'file'])),
  drop constraint blocks_shape_check,
  add constraint blocks_shape_check check (coalesce(
    case type
      when 'heading' then text is not null and char_length(btrim(text)) between 1 and 200 and text !~ '[\r\n]'
        and jsonb_path_exists(data, '$."level" ? (@ == 1 || @ == 2 || @ == 3 || @ == 4 || @ == 5)')
      when 'paragraph' then text is not null
      when 'list' then text is null
        and coalesce(jsonb_typeof(data -> 'items'), '') = 'array'
        and jsonb_array_length(data -> 'items') between 1 and 500
        -- premier niveau : des chaînes ou des objets
        and not jsonb_path_exists(data, 'strict $.items[*] ? (@.type() != "string" && @.type() != "object")')
        -- un élément objet : `text` et `children` seuls ; `children` : `items` non vide, `ordered` et `start` facultatifs
        and not jsonb_path_exists(data, 'lax $.items[*] ? (@.type() == "object" && !(@.text.type() == "string" && @.children.type() == "object" && !exists(@.keyvalue() ? (@.key != "text" && @.key != "children")) && @.children.items.type() == "array" && @.children.items.size() > 0 && !exists(@.children.keyvalue() ? (@.key != "items" && @.key != "ordered" && @.key != "start")) && (!exists(@.children.ordered) || @.children.ordered.type() == "boolean") && (!exists(@.children.start) || (@.children.start.type() == "number" && @.children.start >= 1))))')
        -- deuxième niveau : même forme ; une erreur de parcours (`null`) vaut un refus
        and not coalesce(jsonb_path_exists(data, 'strict $.items[*] ? (@.type() == "object").children.items[*] ? (@.type() != "string" && @.type() != "object")', '{}', true), true)
        and not jsonb_path_exists(data, 'lax $.items[*].children.items[*] ? (@.type() == "object" && !(@.text.type() == "string" && @.children.type() == "object" && !exists(@.keyvalue() ? (@.key != "text" && @.key != "children")) && @.children.items.type() == "array" && @.children.items.size() > 0 && !exists(@.children.keyvalue() ? (@.key != "items" && @.key != "ordered" && @.key != "start")) && (!exists(@.children.ordered) || @.children.ordered.type() == "boolean") && (!exists(@.children.start) || (@.children.start.type() == "number" && @.children.start >= 1))))')
        -- troisième niveau : des chaînes seules, aucun quatrième niveau
        and not coalesce(jsonb_path_exists(data, 'strict $.items[*] ? (@.type() == "object").children.items[*] ? (@.type() == "object").children.items[*] ? (@.type() != "string")', '{}', true), true)
        -- 500 éléments en tout : un élément porte une seule chaîne, son texte
        and jsonb_array_length(jsonb_path_query_array(data, 'strict $.items.** ? (@.type() == "string")')) <= 500
        and ((data -> 'ordered') is null or jsonb_typeof(data -> 'ordered') = 'boolean')
        and ((data -> 'start') is null or jsonb_path_exists(data, '$."start" ? (@.type() == "number" && @ >= 1)'))
      when 'checklist' then text is null
        and jsonb_typeof(data -> 'items') = 'array'
        and jsonb_array_length(data -> 'items') between 1 and 500
        and not jsonb_path_exists(data, '$."items"[*] ? (!(exists (@."text" ? (@.type() == "string"))) || !(exists (@."checked" ? (@.type() == "boolean"))))')
      when 'code' then text is not null and ((data -> 'language') is null or jsonb_typeof(data -> 'language') = 'string')
      when 'call' then text is null
        and jsonb_typeof(data -> 'function') = 'string'
        and char_length(data ->> 'function') between 1 and 100
        and jsonb_typeof(data -> 'args') = 'object'
      when 'mermaid' then text is not null and char_length(btrim(text)) >= 1
      -- une adresse `https` externe, ou un fichier joint (E10-S02), jamais les deux
      when 'image' then ((jsonb_typeof(data -> 'src') = 'string'
          and char_length(data ->> 'src') between 1 and 2000
          and (data -> 'file_id') is null)
        or (jsonb_typeof(data -> 'file_id') = 'string'
          and (data ->> 'file_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          and (data -> 'src') is null))
        and ((data -> 'alt') is null or jsonb_typeof(data -> 'alt') = 'string')
        and ((data -> 'width') is null or (jsonb_typeof(data -> 'width') = 'string' and (data ->> 'width') in ('small', 'medium', 'full')))
      when 'callout' then text is not null and ((data -> 'tone') is null or jsonb_typeof(data -> 'tone') = 'string')
      when 'reference' then text is null
        and jsonb_typeof(data -> 'path') = 'string'
        and (data ->> 'path') ~ '^[a-z0-9_]+(/[a-z0-9_]+)*$'
        and char_length(data ->> 'path') <= 1000
        and ((data -> 'view') is null or jsonb_typeof(data -> 'view') = 'object')
      when 'row' then text is null and key is not null
      -- une cellule : une ligne, sans blanc de bord, chaque `|` précédé d'un nombre impair de `\`
      when 'simple_table' then text is null
        and coalesce(jsonb_typeof(data -> 'columns'), '') = 'array'
        and jsonb_array_length(data -> 'columns') between 1 and 20
        and coalesce(jsonb_typeof(data -> 'rows'), '') = 'array'
        and jsonb_array_length(data -> 'rows') <= 200
        and not jsonb_path_exists(data, 'strict $.rows[*] ? (@.type() != "array" || @.size() != $n)', jsonb_build_object('n', jsonb_array_length(data -> 'columns')))
        and not jsonb_path_exists(data, 'strict $.columns[*] ? (@.type() != "string" || @ like_regex "[\r\n]" || @ like_regex "^[ \t]" || @ like_regex "[ \t]$" || @ like_regex "(^|[^\\\\])(\\\\\\\\)*[|]")')
        and not jsonb_path_exists(data, 'strict $.rows[*][*] ? (@.type() != "string" || @ like_regex "[\r\n]" || @ like_regex "^[ \t]" || @ like_regex "[ \t]$" || @ like_regex "(^|[^\\\\])(\\\\\\\\)*[|]")')
        and ((data -> 'align') is null or (jsonb_typeof(data -> 'align') = 'array'
          and jsonb_array_length(data -> 'align') = jsonb_array_length(data -> 'columns')
          and not jsonb_path_exists(data, 'strict $.align[*] ? (!(@.type() == "null" || (@.type() == "string" && (@ == "left" || @ == "center" || @ == "right"))))')))
      when 'divider' then text is null
      -- le corps : sans ligne blanche de bord, sans ligne `<details…` ni `</details>`
      when 'toggle' then text is not null
        and (text = '' or (text !~ '^[ \t]*(\n|$)' and text !~ '(^|\n)[ \t]*$'))
        and text !~ '(^|\n)[ \t]*<details'
        and text !~ '(^|\n)[ \t]*</details>[ \t]*(\n|$)'
        and coalesce(jsonb_typeof(data -> 'summary'), '') = 'string'
        and char_length(btrim(data ->> 'summary')) between 1 and 200
        and (data ->> 'summary') !~ '[\r\n]'
      -- un fichier joint (E10-S02) : son identifiant, son nom, sa taille (1 octet à 50 Mo) et son type
      when 'file' then text is null
        and coalesce(jsonb_typeof(data -> 'file_id'), '') = 'string'
        and (data ->> 'file_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and coalesce(jsonb_typeof(data -> 'name'), '') = 'string'
        and char_length(data ->> 'name') between 1 and 255
        and coalesce(jsonb_path_exists(data, 'strict $.size ? (@.type() == "number" && @ >= 1 && @ <= 52428800 && @ == @.floor())', '{}', true), false)
        and coalesce(jsonb_typeof(data -> 'mime'), '') = 'string'
        and char_length(data ->> 'mime') between 1 and 255
      else null
    end, false));

-- 4. Le texte cherchable d'un bloc.
CREATE OR REPLACE FUNCTION platform.block_search_text(p_type text, p_text text, p_data jsonb, p_key text) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    SET search_path TO ''
    AS $_$
  select concat_ws(' ', p_key, p_text,
    case p_type
      when 'row' then (select string_agg(v #>> '{}', ' ')
                         from jsonb_path_query(p_data, 'lax $.* ? (@.type() == "string" || @.type() == "number")') v)
      when 'list' then (select string_agg(v #>> '{}', ' ')
                          from jsonb_path_query(p_data, 'strict $.items.** ? (@.type() == "string")', '{}', true) v)
      when 'checklist' then (select string_agg(v #>> '{}', ' ')
                               from jsonb_path_query(p_data, 'lax $.items[*].text ? (@.type() == "string")') v)
      when 'call' then concat_ws(' ', p_data ->> 'function',
                         (select string_agg(v #>> '{}', ' ')
                            from jsonb_path_query(p_data -> 'args', 'strict $.** ? (@.type() == "string")') v))
      when 'reference' then p_data ->> 'path'
      when 'image' then p_data ->> 'alt'
      when 'file' then p_data ->> 'name'
      when 'simple_table' then concat_ws(' ',
                                 (select string_agg(v #>> '{}', ' ')
                                    from jsonb_path_query(p_data, 'strict $.columns[*] ? (@.type() == "string")', '{}', true) v),
                                 (select string_agg(v #>> '{}', ' ')
                                    from jsonb_path_query(p_data, 'strict $.rows[*][*] ? (@.type() == "string")', '{}', true) v))
      when 'toggle' then p_data ->> 'summary'
    end)
$_$;

REVOKE ALL ON FUNCTION platform.block_search_text(p_type text, p_text text, p_data jsonb, p_key text) FROM PUBLIC;
GRANT ALL ON FUNCTION platform.block_search_text(p_type text, p_text text, p_data jsonb, p_key text) TO authenticated;

-- 5. L'oubli d'une personne.
CREATE OR REPLACE FUNCTION platform.forget_user(p_user uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_others text;
  -- les organisations où partent des nœuds de la personne : leur lexique se reconstruit (E01-S13)
  v_orgs uuid[];
begin
  if p_user is null then
    raise exception 'forget_user needs the id of a person' using errcode = '22023';
  end if;
  -- Le verrou d'abord : les nœuds que la personne possède ne changent ni de propriétaire ni de place
  -- avant la fin de la transaction. Un nœud rangé dessous entre-temps reste possible : la suppression
  -- l'épargne, et la clé refuse.
  perform 1 from platform.nodes s where s.owner_user_id = p_user order by s.id for no key update;
  -- Fiche D19, option A : le privé part avec la personne, pas ce que d'autres possèdent dessous. Un
  -- nœud d'équipe déplacé dans un espace personnel garde son propriétaire (H71) : il le reste ici.
  -- Cette lecture ne sert qu'à nommer les chemins : le refus tient à la clé.
  select string_agg(distinct o.slug || ':' || n.path, ', ' order by o.slug || ':' || n.path)
    into v_others
    from platform.nodes s
    join platform.nodes n on n.org_id = s.org_id and n.lpath operator(extensions.<@) s.lpath
    join platform.orgs o on o.id = n.org_id
   where s.owner_user_id = p_user
     and n.owner_kind is not null
     and n.owner_user_id is distinct from p_user;
  if v_others is not null then
    raise exception 'forget_user: nodes of other owners lie under the nodes of this person, move them first: %', v_others
      using errcode = '23503';
  end if;
  -- Ne partent que les nœuds dont la personne est la propriétaire effective : ni un nœud d'un autre
  -- propriétaire explicite, ni ce qui est dessous. Un tel nœud présent à la fin de l'instruction, même
  -- rangé après la lecture, garde son parent : `nodes_parent_id_fkey` refuse (23503). La condition sur
  -- `n` lui-même se relit sur sa dernière version quand une autre transaction l'a changé entre-temps.
  -- Les organisations des nœuds supprimés, rendues par la suppression même (E01-S13).
  with gone as (
    delete from platform.nodes n
     using platform.nodes s
     where s.owner_user_id = p_user
       and n.org_id = s.org_id
       and n.lpath operator(extensions.<@) s.lpath
       and (n.owner_kind is null or n.owner_user_id is not distinct from p_user)
       and not exists (select 1 from platform.nodes x
                        where x.org_id = s.org_id
                          and x.lpath operator(extensions.<@) s.lpath
                          and n.lpath operator(extensions.<@) x.lpath
                          and x.owner_kind is not null
                          and x.owner_user_id is distinct from p_user)
    returning n.org_id
  )
  select array_agg(distinct gone.org_id) into v_orgs from gone;
  -- ses mots aussi : le lexique de ces organisations, reconstruit depuis ce qui reste (E01-S13)
  perform platform.lexicon_rebuild(o.id) from unnest(v_orgs) as o(id);
  -- autrefois en cascade
  delete from platform.members where user_id = p_user;
  delete from platform.team_members where user_id = p_user;
  delete from platform.access_rules where subject_user_id = p_user;
  delete from platform.accounts where owner_user_id = p_user;
  delete from platform.ctx where user_id = p_user;
  delete from platform.platform_grants where user_id = p_user;
  delete from platform.platform_staff where user_id = p_user;
  -- ses correspondances chez les émetteurs (E01-S11)
  delete from platform.identities where user_id = p_user;
  -- autrefois `set null`
  update platform.teams set lead_user_id = null where lead_user_id = p_user;
  update platform.journal set user_id = null where user_id = p_user;
  update platform.invitations set invited_by = null where invited_by = p_user;
  update platform.invitations set accepted_by = null where accepted_by = p_user;
  update platform.nodes set created_by = null where created_by = p_user;
  update platform.nodes set updated_by = null where updated_by = p_user;
  update platform.access_rules set created_by = null where created_by = p_user;
  update platform.platform_staff set added_by = null where added_by = p_user;
  update platform.platform_grants set granted_by = null where granted_by = p_user;
  update platform.platform_grants set revoked_by = null where revoked_by = p_user;
  update platform.admin_journal set user_id = null where user_id = p_user;
  update platform.node_drafts set created_by = null where created_by = p_user;
  update platform.node_drafts set updated_by = null where updated_by = p_user;
  update platform.blocks set claimed_by_user = null where claimed_by_user = p_user;
  update platform.blocks set created_by = null where created_by = p_user;
  update platform.blocks set updated_by = null where updated_by = p_user;
  update platform.node_versions set author = null where author = p_user;
  update platform.node_aliases set created_by = null where created_by = p_user;
  update platform.feedback set user_id = null where user_id = p_user;
  update platform.feedback set handled_by = null where handled_by = p_user;
  update platform.connector_activations set activated_by = null where activated_by = p_user;
  update platform.sim_outbox set created_by = null where created_by = p_user;
  update platform.sim_outbox set sent_by = null where sent_by = p_user;
  -- l'auteur d'un lien public (E05-S10, ADR-013)
  update platform.node_shares set created_by = null where created_by = p_user;
  -- l'auteur d'un fichier joint (E10-S02)
  update platform.files set created_by = null where created_by = p_user;
  -- ses tickets de dépôt par lien (E10-S02 lot f, ADR-018)
  delete from platform.upload_tickets where user_id = p_user;
end;
$$;

REVOKE ALL ON FUNCTION platform.forget_user(p_user uuid) FROM PUBLIC;

-- 6. La lecture publique d'un fichier (lot c).
CREATE FUNCTION platform.public_file_by_token(p_org uuid, p_token text, p_file uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_share platform.node_shares%rowtype;
  v_root platform.nodes%rowtype;
  v_result jsonb;
begin
  if p_org is null or p_token is null or p_file is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    return null;
  end if;
  select * into v_share from platform.node_shares s
   where s.token = p_token and s.org_id = p_org and s.revoked_at is null;
  if v_share.id is null or v_share.created_by is null then
    return null;
  end if;
  select * into v_root from platform.nodes n
   where n.id = v_share.node_id and n.org_id = p_org and n.deleted_at is null and n.status = 'published'
     and platform.node_level_of(v_share.created_by, n.org_id, n.lpath, n.owner_kind, n.owner_team_id, n.owner_user_id) >= 1;
  if v_root.id is null then
    return null;
  end if;
  -- Le nœud du fichier : la racine partagée, ou un nœud dessous que le lien couvre et que l'auteur lit, sans nœud
  -- à la corbeille entre la racine et lui ; le fichier, cité par un bloc publié de ce nœud.
  select jsonb_build_object('id', f.id, 'name', f.name, 'mime', f.mime, 'size', f.size, 'node_path', n.path)
    into v_result
    from platform.files f
    join platform.nodes n on n.id = f.node_id and n.org_id = p_org
   where f.org_id = p_org and f.id = p_file and f.status = 'ready'
     and n.deleted_at is null and n.status = 'published'
     and (n.id = v_root.id
          or (v_share.include_children
              and n.lpath operator(extensions.<@) v_root.lpath
              and platform.node_level_of(v_share.created_by, n.org_id, n.lpath, n.owner_kind, n.owner_team_id, n.owner_user_id) >= 1
              and not exists (select 1 from platform.nodes a
                               where a.org_id = p_org and a.deleted_at is not null
                                 and a.lpath operator(extensions.@>) n.lpath
                                 and a.lpath operator(extensions.<@) v_root.lpath)))
     and exists (select 1 from platform.blocks b
                  where b.node_id = n.id and b.state = 'published' and b.type in ('file', 'image')
                    and b.data ->> 'file_id' = f.id::text);
  return v_result;
end;
$_$;

REVOKE ALL ON FUNCTION platform.public_file_by_token(p_org uuid, p_token text, p_file uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION platform.public_file_by_token(p_org uuid, p_token text, p_file uuid) TO anon;

-- 7. La duplication d'un sous-arbre (lot e). Le type rendu change : la fonction est retirée puis recréée aussitôt.
DROP FUNCTION IF EXISTS platform.duplicate_subtree(uuid, uuid[], text, text, double precision);
CREATE FUNCTION platform.duplicate_subtree(p_source uuid, p_nodes uuid[], p_segment text, p_title text, p_position double precision) RETURNS TABLE(source_id uuid, copy_id uuid, copy_path text, copied_files jsonb)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_uid uuid := (select auth.uid());
  v_source platform.nodes%rowtype;
  v_parent platform.nodes%rowtype;
  v_ids uuid[];
  v_path text;
  v_map jsonb := '{}'::jsonb;
  -- E10-S02 (AC-e3) : ancien identifiant de fichier → nouveau
  v_files jsonb;
  v_new uuid;
  r record;
begin
  if v_uid is null then
    raise exception 'duplicate_subtree needs a caller' using errcode = '42501';
  end if;
  select * into v_source from platform.nodes n where n.id = p_source and n.deleted_at is null;
  if v_source.id is null or v_source.parent_id is null
     or v_source.org_id not in (select platform.member_orgs()) then
    raise exception 'node not found' using errcode = 'P0002';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(7301, pg_catalog.hashtext(v_source.org_id::text));
  select * into v_parent from platform.nodes n where n.id = v_source.parent_id;
  if p_title is null or char_length(btrim(p_title)) not between 1 and 200 then
    raise exception 'the title of the copy holds 1 to 200 characters' using errcode = '22023';
  end if;
  if p_segment is null or p_segment !~ '^[a-z0-9_]+$' then
    raise exception 'the segment of the copy is made of [a-z0-9_]' using errcode = '22023';
  end if;
  v_path := case when v_parent.parent_id is null then p_segment else v_parent.path || '/' || p_segment end;
  if exists (select 1 from platform.nodes n where n.org_id = v_source.org_id and n.path = v_path)
     or exists (select 1 from platform.node_aliases a where a.org_id = v_source.org_id and a.old_path = v_path) then
    raise exception 'path % is not available', v_path using errcode = '23505';
  end if;
  v_ids := array[p_source] || coalesce(p_nodes, '{}'::uuid[]);
  if exists (select 1 from unnest(coalesce(p_nodes, '{}'::uuid[])) as w(id)
               left join platform.nodes n on n.id = w.id
              where n.id is null or n.id = p_source or n.org_id <> v_source.org_id or n.deleted_at is not null
                 or not (n.lpath operator(extensions.<@) v_source.lpath)
                 or not (n.parent_id = any (v_ids))) then
    raise exception 'each node to copy is a live descendant of the node, under a copied parent'
      using errcode = '22023';
  end if;

  -- E10-S02 (AC-e3) : un identifiant neuf pour chaque fichier d'un nœud copié qu'un bloc publié de ce nœud cite ;
  -- un fichier que seul un brouillon ou une version ancienne cite ne se lit pas dans la copie, il ne se copie pas.
  select coalesce(jsonb_object_agg(f.id::text, gen_random_uuid()), '{}'::jsonb) into v_files
    from platform.files f
   where f.org_id = v_source.org_id and f.node_id = any (v_ids)
     and exists (select 1 from platform.blocks b
                  where b.node_id = f.node_id and b.state = 'published' and b.type in ('file', 'image')
                    and b.data ->> 'file_id' = f.id::text);

  for r in select n.* from platform.nodes n where n.id = any (v_ids)
            order by extensions.nlevel(n.lpath), n.path loop
    v_new := gen_random_uuid();
    source_id := r.id;
    copy_id := v_new;
    copy_path := v_path || substr(r.path, char_length(v_source.path) + 1);
    -- E10-S02 (AC-e3) : les paires (ancien, nouveau) des fichiers de ce nœud
    copied_files := coalesce((select jsonb_object_agg(f.id::text, v_files -> f.id::text)
                                from platform.files f where f.node_id = r.id and v_files ? f.id::text), '{}'::jsonb);
    insert into platform.nodes (id, org_id, parent_id, path, kind, title, summary, status, revision, meta,
                                position, created_by, updated_by)
    values (v_new, r.org_id,
            case when r.id = p_source then r.parent_id else (v_map ->> r.parent_id::text)::uuid end,
            copy_path, r.kind, case when r.id = p_source then btrim(p_title) else r.title end, r.summary,
            case when r.revision > 0 then 'published' else 'draft' end,
            case when r.revision > 0 then 1 else 0 end,
            r.meta, case when r.id = p_source then p_position else r.position end, v_uid, v_uid);
    v_map := v_map || jsonb_build_object(r.id::text, v_new);
    return next;
  end loop;

  -- E10-S02 (AC-e3) : les fichiers copiés, `pending` sous la copie, jusqu'à la copie de leur objet par le service.
  insert into platform.files (id, org_id, node_id, name, mime, size, status, created_by)
  select (v_files ->> f.id::text)::uuid, f.org_id, (v_map ->> f.node_id::text)::uuid, f.name, f.mime, f.size, 'pending', v_uid
    from platform.files f
   where f.org_id = v_source.org_id and v_files ? f.id::text;

  -- Blocs publiés et liens de ces blocs : un identifiant neuf par bloc, lu deux fois dans la même
  -- instruction (le `with` est calculé une fois ; l'insertion qu'il porte part même sans être lue).
  -- E10-S02 (AC-e3) : le `file_id` d'un bloc `file` ou d'une image jointe devient celui de la copie du fichier.
  with src as (
    select b.id, b.org_id, b.node_id, b.position, b.type, b.text,
           case when b.type in ('file', 'image') and v_files ? (b.data ->> 'file_id')
                then pg_catalog.jsonb_set(b.data, '{file_id}', v_files -> (b.data ->> 'file_id'))
                else b.data end as data,
           b.key, b.provenance, b.revision,
           gen_random_uuid() as new_id
      from platform.blocks b
     where b.node_id = any (v_ids) and b.state = 'published'
  ), copied as (
    insert into platform.blocks (id, state, org_id, node_id, position, type, text, data, key, provenance, revision,
                                 created_by, updated_by)
    select src.new_id, 'published', src.org_id, (v_map ->> src.node_id::text)::uuid, src.position, src.type, src.text,
           src.data, src.key, src.provenance, src.revision, v_uid, v_uid
      from src
  )
  insert into platform.links (org_id, source_node_id, source_block_id, target_path, target_key, target_node_id)
  select l.org_id, (v_map ->> l.source_node_id::text)::uuid, src.new_id, l.target_path, l.target_key, l.target_node_id
    from platform.links l
    join src on src.id = l.source_block_id
   where l.source_node_id = any (v_ids);

  -- L'instantané de la révision 1 d'une copie publiée, comme `publish_node` le prend.
  insert into platform.node_versions (node_id, revision, title, summary, kind, meta, blocks, author)
  select n.id, n.revision, n.title, n.summary, n.kind, n.meta,
         coalesce((select jsonb_agg(jsonb_build_object(
                             'id', b.id, 'type', b.type, 'position', b.position, 'key', b.key,
                             'text', b.text, 'data', b.data, 'provenance', b.provenance,
                             'revision', b.revision) order by b.position, b.id)
                     from platform.blocks b
                    where b.node_id = n.id and b.state = 'published' and b.type <> 'row'), '[]'::jsonb),
         v_uid
    from platform.nodes n
   where n.id in (select (e.value #>> '{}')::uuid from jsonb_each(v_map) e) and n.revision = 1;
end;
$_$;

REVOKE ALL ON FUNCTION platform.duplicate_subtree(p_source uuid, p_nodes uuid[], p_segment text, p_title text, p_position double precision) FROM PUBLIC;
GRANT ALL ON FUNCTION platform.duplicate_subtree(p_source uuid, p_nodes uuid[], p_segment text, p_title text, p_position double precision) TO authenticated;

-- 8. Les tickets de dépôt par lien (lot f).
CREATE TABLE platform.upload_tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    user_id uuid NOT NULL,
    ctx text,
    token_hash text NOT NULL,
    form_token_hash text NOT NULL,
    kind text NOT NULL,
    mode text NOT NULL,
    target_path text NOT NULL,
    name text,
    title text,
    summary text,
    key text,
    base_revision integer,
    publish boolean,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT upload_tickets_token_hash_check CHECK ((token_hash ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT upload_tickets_form_token_hash_check CHECK ((form_token_hash ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT upload_tickets_kind_check CHECK ((kind = ANY (ARRAY['file'::text, 'md'::text, 'csv'::text]))),
    CONSTRAINT upload_tickets_mode_check CHECK ((((kind = 'file'::text) AND (mode = ANY (ARRAY['create'::text, 'attach'::text]))) OR ((kind = 'md'::text) AND (mode = ANY (ARRAY['create'::text, 'replace'::text]))) OR ((kind = 'csv'::text) AND (mode = ANY (ARRAY['create'::text, 'merge'::text])))))
);

COMMENT ON TABLE platform.upload_tickets IS 'Tickets de dépôt par lien à usage unique (E10-S02 lot f, ADR-018) : empreintes SHA-256 du jeton de curl et de celui du formulaire, jamais un jeton ; 15 minutes, un envoi par l''un ou l''autre.';

ALTER TABLE ONLY platform.upload_tickets
    ADD CONSTRAINT upload_tickets_pkey PRIMARY KEY (id);

ALTER TABLE ONLY platform.upload_tickets
    ADD CONSTRAINT upload_tickets_token_hash_key UNIQUE (token_hash);

ALTER TABLE ONLY platform.upload_tickets
    ADD CONSTRAINT upload_tickets_form_token_hash_key UNIQUE (form_token_hash);

ALTER TABLE ONLY platform.upload_tickets
    ADD CONSTRAINT upload_tickets_org_id_fkey FOREIGN KEY (org_id) REFERENCES platform.orgs(id) ON DELETE CASCADE;

CREATE INDEX idx_upload_tickets_org_id_expires_at ON platform.upload_tickets USING btree (org_id, expires_at);

ALTER TABLE platform.upload_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS upload_tickets_select_member ON platform.upload_tickets;
CREATE POLICY upload_tickets_select_member ON platform.upload_tickets FOR SELECT TO authenticated USING (((org_id IN ( SELECT platform.member_orgs() AS member_orgs)) AND ((user_id = ( SELECT auth.uid() AS uid)) OR (expires_at < now()))));

DROP POLICY IF EXISTS upload_tickets_insert_own ON platform.upload_tickets;
CREATE POLICY upload_tickets_insert_own ON platform.upload_tickets FOR INSERT TO authenticated WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (org_id IN ( SELECT platform.member_orgs() AS member_orgs))));

DROP POLICY IF EXISTS upload_tickets_delete_expired ON platform.upload_tickets;
CREATE POLICY upload_tickets_delete_expired ON platform.upload_tickets FOR DELETE TO authenticated USING (((org_id IN ( SELECT platform.member_orgs() AS member_orgs)) AND (expires_at < now())));

GRANT SELECT,DELETE ON TABLE platform.upload_tickets TO authenticated;

GRANT INSERT(org_id),INSERT(user_id),INSERT(ctx),INSERT(token_hash),INSERT(form_token_hash),INSERT(kind),INSERT(mode),INSERT(target_path),INSERT(name),INSERT(title),INSERT(summary),INSERT(key),INSERT(base_revision),INSERT(publish),INSERT(expires_at) ON TABLE platform.upload_tickets TO authenticated;

-- 9. La consommation d'un ticket (lot f), sous `anon` seul.
CREATE FUNCTION platform.consume_upload_ticket(p_org uuid, p_hash text, p_form boolean) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_ticket platform.upload_tickets%rowtype;
  v_email text;
begin
  if p_org is null or p_hash is null or p_form is null or p_hash !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  -- Un seul `update` conditionnel, sur l'empreinte du jeton de la porte appelante : deux envois simultanés, par le même
  -- jeton ou par les deux, un seul voit encore le ticket libre (`used_at` est commun aux deux jetons).
  if p_form then
    update platform.upload_tickets t set used_at = now()
     where t.form_token_hash = p_hash and t.org_id = p_org and t.used_at is null and t.expires_at > now()
    returning t.* into v_ticket;
  else
    update platform.upload_tickets t set used_at = now()
     where t.token_hash = p_hash and t.org_id = p_org and t.used_at is null and t.expires_at > now()
    returning t.* into v_ticket;
  end if;
  if v_ticket.id is null then
    return null;
  end if;
  select m.email into v_email from platform.members m where m.org_id = p_org and m.user_id = v_ticket.user_id;
  return jsonb_build_object(
    'user_id', v_ticket.user_id, 'email', v_email, 'ctx', v_ticket.ctx, 'kind', v_ticket.kind, 'mode', v_ticket.mode,
    'target_path', v_ticket.target_path, 'name', v_ticket.name, 'title', v_ticket.title, 'summary', v_ticket.summary,
    'key', v_ticket.key, 'base_revision', v_ticket.base_revision, 'publish', v_ticket.publish);
end;
$$;

REVOKE ALL ON FUNCTION platform.consume_upload_ticket(p_org uuid, p_hash text, p_form boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION platform.consume_upload_ticket(p_org uuid, p_hash text, p_form boolean) TO anon;

-- ROLLBACK: (jamais exécuté depuis le paquet)
--   1. drop function platform.consume_upload_ticket(uuid, text, boolean) ; drop table platform.upload_tickets ;
--   2. drop function platform.public_file_by_token(uuid, text, uuid) ;
--   3. drop function platform.duplicate_subtree(uuid, uuid[], text, text, double precision), puis sa recréation, ses
--      privilèges compris, telle que l'écrit 20260928100000 (type rendu sans `copied_files`) ;
--   4. forget_user recréée (`create or replace`) telle que l'écrit 20260928100000, privilèges redits ;
--   5. block_search_text recréée (`create or replace`) telle que l'écrit 20260929170000, privilèges redits ;
--   6. après la suppression des blocs `file` et des images jointes (`data.file_id`), qu'elles refuseraient :
--      `blocks_type_check` et `blocks_shape_check` retirées puis reposées telles que les écrit 20260929170000 ;
--   7. drop table platform.files (ses policies et index partent avec elle). Les objets du bucket ne sont pas
--      touchés : ils restent, orphelins, sous `<org_id>/<id>`.
