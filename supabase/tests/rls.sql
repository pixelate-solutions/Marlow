begin;

create extension if not exists pgtap with schema extensions;
select plan(6);

select is(
  (select count(*)::integer from information_schema.tables where table_schema = 'public'),
  29,
  'all normalized public tables exist'
);

select is(
  (select count(*)::integer from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and relrowsecurity),
  29,
  'RLS is enabled on every public table'
);

insert into auth.users(id, email)
values
  ('81000000-0000-4000-8000-000000000001', 'tenant-a@example.test'),
  ('81000000-0000-4000-8000-000000000002', 'tenant-b@example.test');

insert into public.organizations(id, name, slug)
values
  ('82000000-0000-4000-8000-000000000001', 'Tenant A', 'tenant-a-test'),
  ('82000000-0000-4000-8000-000000000002', 'Tenant B', 'tenant-b-test');

insert into public.organization_members(organization_id, user_id, role)
values
  ('82000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', 'owner'),
  ('82000000-0000-4000-8000-000000000002', '81000000-0000-4000-8000-000000000002', 'owner');

insert into public.campaigns(id, organization_id, name, objective)
values
  ('83000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001', 'Tenant A campaign', 'Test isolation'),
  ('83000000-0000-4000-8000-000000000002', '82000000-0000-4000-8000-000000000002', 'Tenant B campaign', 'Test isolation');

insert into public.integrations(id, organization_id, provider, status)
values ('84000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001', 'APOLLO', 'CONNECTED');

insert into public.integration_credentials(organization_id, integration_id, encrypted_payload, iv, auth_tag)
values ('82000000-0000-4000-8000-000000000001', '84000000-0000-4000-8000-000000000001', 'ciphertext', 'iv', 'tag');

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*)::integer from public.campaigns where id in ('83000000-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000002')),
  1,
  'a member sees only their organization campaign'
);

select ok(
  exists(select 1 from public.campaigns where id = '83000000-0000-4000-8000-000000000001'),
  'a member can read their organization campaign'
);

select ok(
  not exists(select 1 from public.campaigns where id = '83000000-0000-4000-8000-000000000002'),
  'a member cannot read another organization campaign'
);

select ok(
  not has_table_privilege(current_user, 'public.integration_credentials', 'SELECT'),
  'browser roles have no privilege to read encrypted integration credentials'
);

select * from finish();
rollback;
