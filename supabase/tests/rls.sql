begin;

create extension if not exists pgtap with schema extensions;
select plan(11);

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

select ok(public.marlow_signup_ready(), 'signup readiness reports the workspace trigger is installed');

select ok(
  not has_function_privilege('anon', 'public.marlow_signup_ready()', 'EXECUTE'),
  'anonymous browser clients cannot invoke the signup readiness marker'
);

select ok(
  not has_function_privilege('authenticated', 'public.marlow_signup_ready()', 'EXECUTE'),
  'authenticated browser clients cannot invoke the signup readiness marker'
);

select ok(
  has_function_privilege('service_role', 'public.marlow_signup_ready()', 'EXECUTE'),
  'server-side Supabase clients can invoke the signup readiness marker'
);

insert into auth.users(id, email)
values
  ('81000000-0000-4000-8000-000000000001', 'tenant-a@example.test'),
  ('81000000-0000-4000-8000-000000000002', 'tenant-b@example.test');

select is(
  (
    select count(distinct user_id)::integer
    from public.organization_members
    where user_id in (
      '81000000-0000-4000-8000-000000000001',
      '81000000-0000-4000-8000-000000000002'
    )
  ),
  2,
  'new auth users receive an organization membership automatically'
);

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
