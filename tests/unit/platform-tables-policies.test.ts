// @vitest-environment node
// `packagePolicies()` (E09-S05, `tests/helpers/platform-tables.ts`) sur des migrations écrites ici, sans
// base : ses frontières à risque. Une policy posée sur une autre table, ou un `drop policy` suivi du
// `create policy` du même nom, fausseraient la preuve d'AC1 ; un privilège de colonne mal lu ferait
// refuser les clones d'AC4 par le privilège au lieu de l'isolation (HN-E09S05-6).
import { describe, expect, it } from "vitest"
import { migrationOf, packagePolicies } from "../helpers/platform-tables"

const TABLES = `
create table platform.a (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references platform.orgs (id) on delete cascade,
  n bigint generated always as identity,
  t tsvector generated always as (to_tsvector('simple', 'x, y')) stored,
  constraint a_check check (org_id is not null)
);
create table platform.b (id uuid primary key);
create table platform.c (id uuid primary key);
`

describe("packagePolicies", () => {
  it("should keep each table's policies after every migration, once per name, a policy of another table never counting", () => {
    const tables = packagePolicies([
      migrationOf(
        "1_tables.sql",
        `${TABLES}
        alter table platform.a enable row level security;
        alter table platform.b enable row level security;
        create policy a_select on platform.a for select to authenticated using (true);
        create policy b_select on platform.b for select to authenticated using (true);`,
      ),
      migrationOf(
        "2_policies.sql",
        `-- create policy c_select on platform.c : commentée, elle n'existe pas.
        drop policy if exists a_select on platform.a;
        create policy a_select on platform.a for select to authenticated using (org_id is not null);`,
      ),
    ])

    expect(Object.fromEntries(Object.entries(tables).map(([name, table]) => [name, { rls: table.rls, policies: table.policies }]))).toEqual({
      a: { rls: true, policies: ["a_select"] },
      b: { rls: true, policies: ["b_select"] },
      c: { rls: false, policies: [] },
    })
    expect(tables.a.createdIn).toBe("1_tables.sql")
  })

  // Une identité que pg_dump pose à part, et une colonne qu'il cite (la ligne de base d'E01-S09) : la
  // première est fabriquée par la base, la seconde garde son nom.
  it("should read the columns, those the database makes, and the privileges of authenticated, a table revoke clearing its column grants", () => {
    const tables = packagePolicies([
      migrationOf(
        "1_tables.sql",
        `${TABLES}
        ALTER TABLE platform.c ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
            SEQUENCE NAME platform.c_id_seq
            START WITH 1
            INCREMENT BY 1
        );
        alter table platform.a add column extra text default 'x', add constraint a_extra check (extra <> '');
        grant select, insert, update, delete on platform.a to authenticated;
        revoke insert on platform.a from authenticated;
        grant insert (org_id, "extra") on platform.a to authenticated;
        grant update (extra) on platform.a to authenticated;
        revoke update on platform.a from authenticated;
        grant select on platform.b to anon;
        grant execute on function platform.f(uuid) to authenticated;
        grant usage, select on all sequences in schema platform to authenticated;`,
      ),
    ])

    expect(tables.a).toMatchObject({
      columns: ["id", "org_id", "n", "t", "extra"],
      generated: ["n", "t"],
      defaulted: ["id", "n", "extra"],
      privileges: {
        select: { table: true, columns: [] },
        insert: { table: false, columns: ["org_id", "extra"] },
        update: { table: false, columns: [] },
        delete: { table: true, columns: [] },
      },
    })
    expect({ generated: tables.c.generated, defaulted: tables.c.defaulted }).toEqual({ generated: ["id"], defaulted: ["id"] })
    const none = { table: false, columns: [] }
    expect(tables.b.privileges).toEqual({ select: none, insert: none, update: none, delete: none })
    expect(Object.keys(tables).sort()).toEqual(["a", "b", "c"])
  })
})
