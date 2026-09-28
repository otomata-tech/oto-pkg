-- Fumée du job `bare-postgres` (E01-S09, AC12 et AC13), sur un Postgres sans Supabase où
-- `oto-platform db prepare` puis la ligne de base viennent de passer. Toute erreur arrête le job
-- (`psql -v ON_ERROR_STOP=1`) ; rien n'est gardé (transaction annulée).

-- AC12 : ni `moddatetime` (refusée par le Postgres managé de Scaleway, disponible dans l'image
-- `postgres:16`) ni table `auth.users` : la ligne de base n'en demande aucune.
do $$
begin
  if exists (select 1 from pg_catalog.pg_extension where extname = 'moddatetime') then
    raise exception 'AC12 : l''extension moddatetime est installée';
  end if;
  if pg_catalog.to_regclass('auth.users') is not null then
    raise exception 'AC12 : la table auth.users existe';
  end if;
end
$$;

begin;

-- AC13 : deux organisations semées par le rôle d'administration, comme le ferait l'outillage ; Léa,
-- membre de A seulement, sans compte nulle part (aucune clé vers auth.users).
insert into platform.orgs (id, slug, name, prefix) values
  ('a0000000-0000-4000-8000-000000000001', 'acme', 'Acme', 'acme'),
  ('b0000000-0000-4000-8000-000000000001', 'delta', 'Delta', 'delta');
insert into platform.nodes (id, org_id, parent_id, path, title, summary, owner_kind) values
  ('a0000000-0000-4000-8000-000000000011', 'a0000000-0000-4000-8000-000000000001', null, 'guide', 'Guide A', 'Racine de A.', 'org'),
  ('b0000000-0000-4000-8000-000000000011', 'b0000000-0000-4000-8000-000000000001', null, 'guide', 'Guide B', 'Racine de B.', 'org');
insert into platform.nodes (org_id, parent_id, path, title, summary) values
  ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000011', 'ventes', 'Ventes', 'Pages de A.'),
  ('b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000011', 'achats', 'Achats', 'Pages de B.');
insert into platform.members (org_id, user_id, role, email, name) values
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-00000000011a', 'member', 'lea@acme.example', 'Léa');

set local role authenticated;
select pg_catalog.set_config('request.jwt.claims',
  '{"sub": "c0000000-0000-4000-8000-00000000011a", "role": "authenticated", "email": "lea@acme.example"}', true);

do $$
declare
  v_orgs uuid[];
  v_paths text[];
begin
  select pg_catalog.array_agg(distinct n.org_id), pg_catalog.array_agg(n.path order by n.path)
    into v_orgs, v_paths
    from platform.nodes n;
  if v_orgs is distinct from array['a0000000-0000-4000-8000-000000000001'::uuid] then
    raise exception 'AC13 : Léa, membre de A seulement, lit les nœuds de %', v_orgs;
  end if;
  if v_paths is distinct from array['guide', 'ventes'] then
    raise exception 'AC13 : Léa devait lire guide et ventes de A, elle lit %', v_paths;
  end if;
  raise notice 'AC13 : Léa ne lit que les nœuds de A (%)', v_paths;
end
$$;

rollback;
