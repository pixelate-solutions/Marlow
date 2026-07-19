begin;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_name text;
  v_slug text;
begin
  v_name := coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), split_part(new.email, '@', 1));
  v_slug := lower(regexp_replace(v_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(new.id::text, 1, 6);
  insert into public.organizations(name, slug) values (v_name || '''s workspace', v_slug) returning id into v_org_id;
  insert into public.organization_members(organization_id, user_id, role) values (v_org_id, new.id, 'owner');
  insert into public.user_profiles(organization_id, user_id, full_name) values (v_org_id, new.id, v_name);
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

commit;
