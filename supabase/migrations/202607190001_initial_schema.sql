begin;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  plan text not null default 'starter',
  sending_settings jsonb not null default '{"dailyLimit":25,"organizationDailyLimit":100,"quietHoursStart":"18:00","quietHoursEnd":"08:00","timezone":"UTC","allowedDays":[1,2,3,4,5]}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member','viewer')),
  created_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, user_id)
);

create table public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null,
  job_title text,
  avatar_url text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, user_id)
);

create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('APOLLO','META_MODEL','WEB_SEARCH')),
  status text not null default 'DISCONNECTED' check (status in ('DISCONNECTED','CONNECTING','CONNECTED','REAUTHORIZATION_REQUIRED','ERROR')),
  external_account_id text,
  display_name text,
  scopes text[] not null default '{}',
  metadata jsonb not null default '{}',
  connected_by uuid references auth.users(id),
  connected_at timestamptz,
  last_verified_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, provider)
);

create table public.integration_credentials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  integration_id uuid not null unique references public.integrations(id) on delete cascade,
  encrypted_payload text not null,
  iv text not null,
  auth_tag text not null,
  key_version integer not null default 1,
  expires_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.company_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_name text not null,
  website_url text not null,
  industry text,
  description text,
  researched_facts jsonb not null default '[]',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid references auth.users(id),
  name text not null,
  objective text not null default '',
  status text not null default 'DRAFT' check (status in ('DRAFT','DISCOVERING','READY','QUEUED','SEARCHING_ACCOUNTS','QUALIFYING_ACCOUNTS','SEARCHING_PEOPLE','ENRICHING','RESEARCHING','SCORING','WRITING','QUALITY_REVIEW','PENDING_USER_APPROVAL','APPROVED','SENDING','SENT','SKIPPED','PAUSED','FAILED','COMPLETED')),
  minimum_lead_score integer not null default 70 check (minimum_lead_score between 0 and 100),
  status_changed_at timestamptz not null default timezone('utc', now()),
  started_at timestamptz,
  completed_at timestamptz,
  paused_at timestamptz,
  failure_code text,
  failure_message text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create table public.campaign_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null unique references public.campaigns(id) on delete cascade,
  status text not null default 'ACTIVE',
  model_id text not null default 'muse-spark-1.1',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.campaign_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.campaign_conversations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  role text not null check (role in ('user','assistant','system','tool')),
  content text not null,
  structured_data jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.campaign_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  version integer not null default 1,
  profile jsonb not null,
  readiness_score integer not null check (readiness_score between 0 and 100),
  missing_required_fields text[] not null default '{}',
  unresolved_questions text[] not null default '{}',
  is_current boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  unique (campaign_id, version)
);

create unique index campaign_profiles_one_current on public.campaign_profiles(campaign_id) where is_current;

create table public.campaign_limits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null unique references public.campaigns(id) on delete cascade,
  requested_prospects integer not null default 25 check (requested_prospects > 0),
  daily_send_limit integer not null default 25 check (daily_send_limit > 0),
  apollo_credit_budget integer not null default 100 check (apollo_credit_budget >= 0),
  minimum_lead_score integer not null default 70 check (minimum_lead_score between 0 and 100),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  status text not null default 'QUEUED' check (status in ('QUEUED','RUNNING','WAITING','SUCCEEDED','FAILED','CANCELLED')),
  model_id text not null default 'muse-spark-1.1',
  tool_call_count integer not null default 0,
  model_input_tokens integer not null default 0,
  model_output_tokens integer not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  heartbeat_at timestamptz,
  error_code text,
  error_message text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.agent_run_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  agent_run_id uuid not null references public.agent_runs(id) on delete cascade,
  sequence bigint generated always as identity,
  event_type text not null,
  public_message text not null,
  data jsonb not null default '{}',
  created_at timestamptz not null default timezone('utc', now())
);

create table public.agent_tool_calls (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  agent_run_id uuid not null references public.agent_runs(id) on delete cascade,
  prospect_id uuid,
  tool_name text not null,
  policy jsonb not null,
  redacted_input jsonb not null default '{}',
  redacted_output jsonb,
  status text not null check (status in ('STARTED','SUCCEEDED','FAILED','DENIED')),
  duration_ms integer,
  credit_cost numeric(12,2),
  error_code text,
  error_message text,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.agent_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  run_id uuid references public.agent_runs(id) on delete set null,
  job_type text not null check (job_type in ('CAMPAIGN_RUN','SEND_EMAIL')),
  status text not null default 'QUEUED' check (status in ('QUEUED','RUNNING','RETRY','SUCCEEDED','FAILED','CANCELLED')),
  payload jsonb not null default '{}',
  priority integer not null default 100,
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  run_after timestamptz not null default timezone('utc', now()),
  locked_at timestamptz,
  locked_by text,
  heartbeat_at timestamptz,
  last_error text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  apollo_id text,
  name text not null,
  domain extensions.citext not null,
  website_url text,
  industry text,
  employee_count integer,
  revenue numeric(18,2),
  location text,
  technologies text[] not null default '{}',
  source_data jsonb not null default '{}',
  blocked_at timestamptz,
  blocked_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  unique (organization_id, domain)
);

create unique index companies_apollo_unique on public.companies(organization_id, apollo_id) where apollo_id is not null;

create table public.prospects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  title text not null,
  normalized_email extensions.citext,
  email_status text,
  linkedin_url text,
  location text,
  source_data jsonb not null default '{}',
  status text not null default 'NEW' check (status in ('NEW','QUALIFIED','RESEARCHED','DRAFTED','SKIPPED','SENT','SUPPRESSED','FAILED')),
  selection_reason text,
  blocked_at timestamptz,
  blocked_by uuid references auth.users(id),
  previously_contacted_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create unique index prospects_campaign_email_unique on public.prospects(campaign_id, normalized_email) where normalized_email is not null and deleted_at is null;
create index prospects_org_email_idx on public.prospects(organization_id, normalized_email);

create table public.prospect_identities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  identity_type text not null check (identity_type in ('APOLLO_PERSON_ID','APOLLO_CONTACT_ID','EMAIL','LINKEDIN_URL','NAME_DOMAIN')),
  identity_value extensions.citext not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, identity_type, identity_value)
);

create table public.prospect_research (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  company_summary text not null,
  prospect_summary text,
  signals jsonb not null default '[]',
  uncertainty text[] not null default '{}',
  completed_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

create table public.research_claims (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  prospect_research_id uuid not null references public.prospect_research(id) on delete cascade,
  claim text not null,
  source_url text not null,
  source_title text,
  retrieved_at timestamptz not null,
  confidence text not null check (confidence in ('high','medium','low')),
  source_type text not null check (source_type in ('official_company','apollo','official_press_release','job_posting','news','other')),
  created_at timestamptz not null default timezone('utc', now())
);

create table public.lead_scores (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  total_score integer not null check (total_score between 0 and 100),
  components jsonb not null,
  explanation text not null,
  model_id text not null default 'muse-spark-1.1',
  created_at timestamptz not null default timezone('utc', now())
);

create table public.outreach_drafts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  recipient_email extensions.citext not null,
  sending_mailbox_id text not null,
  subject text not null,
  body text not null,
  personalization_summary text not null,
  selected_angle text not null,
  qualification_summary text not null,
  supporting_claim_ids uuid[] not null default '{}',
  confidence integer not null check (confidence between 0 and 100),
  compliance_warnings text[] not null default '{}',
  status text not null default 'PENDING_USER_APPROVAL' check (status in ('DRAFT','PENDING_USER_APPROVAL','APPROVED','SENDING','SENT','SKIPPED','FAILED')),
  revision integer not null default 1,
  approval_invalidated_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create unique index outreach_drafts_active_prospect on public.outreach_drafts(organization_id, prospect_id) where status in ('DRAFT','PENDING_USER_APPROVAL','APPROVED','SENDING') and deleted_at is null;

create table public.draft_revisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  draft_id uuid not null references public.outreach_drafts(id) on delete cascade,
  revision integer not null,
  subject text not null,
  body text not null,
  edit_source text not null check (edit_source in ('AGENT','USER','REGENERATION')),
  edited_by uuid references auth.users(id),
  feedback text,
  created_at timestamptz not null default timezone('utc', now()),
  unique (draft_id, revision)
);

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  prospect_id uuid not null references public.prospects(id),
  draft_id uuid not null references public.outreach_drafts(id),
  recipient_email extensions.citext not null,
  sending_mailbox_id text not null,
  subject_hash char(64) not null,
  body_hash char(64) not null,
  approved_at timestamptz not null,
  expires_at timestamptz not null,
  nonce_hash char(64) not null unique,
  consumed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.email_sends (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id),
  prospect_id uuid not null references public.prospects(id),
  draft_id uuid not null references public.outreach_drafts(id),
  approval_id uuid not null unique references public.approvals(id),
  sending_mailbox_id text not null,
  recipient_email extensions.citext not null,
  subject text not null,
  body text not null,
  idempotency_key text not null,
  status text not null default 'QUEUED' check (status in ('QUEUED','SENDING','SENT','FAILED','DELIVERY_UNKNOWN')),
  external_message_id text,
  external_response jsonb,
  attempts integer not null default 0,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, idempotency_key)
);

create table public.suppression_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  suppression_type text not null check (suppression_type in ('EMAIL','DOMAIN','APOLLO_PERSON_ID','APOLLO_CONTACT_ID','COMPANY','UNSUBSCRIBE','NEGATIVE_REPLY','HARD_BOUNCE','ADMIN_BLOCK','USER_BLOCK')),
  normalized_value extensions.citext not null,
  reason text,
  source text not null default 'USER',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  revoked_at timestamptz,
  unique (organization_id, suppression_type, normalized_value)
);

create table public.apollo_credit_usage (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  agent_run_id uuid references public.agent_runs(id),
  prospect_id uuid references public.prospects(id),
  tool_name text not null,
  expected_credits numeric(12,2),
  actual_credits numeric(12,2) not null default 0,
  reason text not null,
  budget_remaining numeric(12,2) not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid references auth.users(id),
  actor_type text not null check (actor_type in ('USER','AGENT','WORKER','SYSTEM')),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  campaign_id uuid references public.campaigns(id),
  prospect_id uuid references public.prospects(id),
  immutable_data jsonb not null default '{}',
  ip_hash text,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.rate_limits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key text not null,
  window_started_at timestamptz not null,
  count integer not null default 1,
  unique (organization_id, key, window_started_at)
);

create index campaigns_org_status_idx on public.campaigns(organization_id, status, updated_at desc) where deleted_at is null;
create index agent_runs_status_idx on public.agent_runs(status, heartbeat_at);
create index agent_events_run_sequence_idx on public.agent_run_events(agent_run_id, sequence);
create index agent_jobs_claim_idx on public.agent_jobs(status, run_after, priority, created_at) where status in ('QUEUED','RETRY');
create index companies_org_domain_idx on public.companies(organization_id, domain);
create index prospect_identity_lookup_idx on public.prospect_identities(organization_id, identity_type, identity_value);
create index research_claims_research_idx on public.research_claims(prospect_research_id);
create index drafts_review_queue_idx on public.outreach_drafts(organization_id, status, created_at) where deleted_at is null;
create index sends_daily_limit_idx on public.email_sends(organization_id, sent_at) where status = 'SENT';
create index suppressions_lookup_idx on public.suppression_entries(organization_id, normalized_value) where revoked_at is null;
create index credits_campaign_idx on public.apollo_credit_usage(campaign_id, created_at);
create index audit_org_created_idx on public.audit_events(organization_id, created_at desc);

create trigger organizations_updated_at before update on public.organizations for each row execute function public.set_updated_at();
create trigger user_profiles_updated_at before update on public.user_profiles for each row execute function public.set_updated_at();
create trigger integrations_updated_at before update on public.integrations for each row execute function public.set_updated_at();
create trigger integration_credentials_updated_at before update on public.integration_credentials for each row execute function public.set_updated_at();
create trigger company_profiles_updated_at before update on public.company_profiles for each row execute function public.set_updated_at();
create trigger campaigns_updated_at before update on public.campaigns for each row execute function public.set_updated_at();
create trigger campaign_conversations_updated_at before update on public.campaign_conversations for each row execute function public.set_updated_at();
create trigger campaign_limits_updated_at before update on public.campaign_limits for each row execute function public.set_updated_at();
create trigger agent_runs_updated_at before update on public.agent_runs for each row execute function public.set_updated_at();
create trigger agent_jobs_updated_at before update on public.agent_jobs for each row execute function public.set_updated_at();
create trigger companies_updated_at before update on public.companies for each row execute function public.set_updated_at();
create trigger prospects_updated_at before update on public.prospects for each row execute function public.set_updated_at();
create trigger outreach_drafts_updated_at before update on public.outreach_drafts for each row execute function public.set_updated_at();
create trigger email_sends_updated_at before update on public.email_sends for each row execute function public.set_updated_at();

create or replace function public.is_organization_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = p_organization_id and user_id = auth.uid()
  );
$$;

create or replace function public.has_organization_role(p_organization_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = p_organization_id and user_id = auth.uid() and role = any(p_roles)
  );
$$;

revoke all on function public.is_organization_member(uuid) from public;
grant execute on function public.is_organization_member(uuid) to authenticated;
revoke all on function public.has_organization_role(uuid, text[]) from public;
grant execute on function public.has_organization_role(uuid, text[]) to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'organizations','organization_members','user_profiles','integrations','integration_credentials',
    'company_profiles','campaigns','campaign_conversations','campaign_messages','campaign_profiles',
    'campaign_limits','agent_runs','agent_run_events','agent_tool_calls','agent_jobs','companies',
    'prospects','prospect_identities','prospect_research','research_claims','lead_scores',
    'outreach_drafts','draft_revisions','approvals','email_sends','suppression_entries',
    'apollo_credit_usage','audit_events','rate_limits'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
  end loop;
end $$;

create policy organizations_select on public.organizations for select to authenticated
using (public.is_organization_member(id));
create policy organizations_update on public.organizations for update to authenticated
using (public.has_organization_role(id, array['owner','admin']))
with check (public.has_organization_role(id, array['owner','admin']));

create policy organization_members_select on public.organization_members for select to authenticated
using (public.is_organization_member(organization_id));
create policy organization_members_manage on public.organization_members for all to authenticated
using (public.has_organization_role(organization_id, array['owner','admin']))
with check (public.has_organization_role(organization_id, array['owner','admin']));

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'user_profiles','integrations','company_profiles','campaigns','campaign_conversations','campaign_messages',
    'campaign_profiles','campaign_limits','agent_runs','agent_run_events','agent_tool_calls','companies',
    'prospects','prospect_identities','prospect_research','research_claims','lead_scores','outreach_drafts',
    'draft_revisions','suppression_entries','apollo_credit_usage','audit_events'
  ] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.is_organization_member(organization_id))', table_name || '_select', table_name);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_organization_member(organization_id))', table_name || '_insert', table_name);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_organization_member(organization_id)) with check (public.is_organization_member(organization_id))', table_name || '_update', table_name);
  end loop;
end $$;

-- Credentials, durable jobs, approvals, sends, and rate-limit counters are service-role only.
-- RLS is enabled with no browser policies for integration_credentials, agent_jobs, approvals,
-- email_sends, and rate_limits. The service role bypasses RLS.

create or replace function public.find_duplicate_prospect(
  p_organization_id uuid,
  p_apollo_person_id text,
  p_apollo_contact_id text,
  p_email text,
  p_linkedin_url text,
  p_full_name text,
  p_company_id uuid
)
returns uuid
language sql
stable
security definer
set search_path = public, extensions
as $$
  select p.id
  from public.prospects p
  where p.organization_id = p_organization_id
    and p.deleted_at is null
    and (
      (p_email is not null and p.normalized_email = lower(p_email)::extensions.citext)
      or (p_linkedin_url is not null and lower(p.linkedin_url) = lower(p_linkedin_url))
      or exists (
        select 1 from public.prospect_identities i
        where i.prospect_id = p.id and (
          (p_apollo_person_id is not null and i.identity_type = 'APOLLO_PERSON_ID' and i.identity_value = p_apollo_person_id::extensions.citext)
          or (p_apollo_contact_id is not null and i.identity_type = 'APOLLO_CONTACT_ID' and i.identity_value = p_apollo_contact_id::extensions.citext)
        )
      )
      or (p.company_id = p_company_id and lower(p.first_name || ' ' || p.last_name) = lower(trim(p_full_name)))
    )
  limit 1;
$$;

create or replace function public.is_recipient_suppressed(
  p_organization_id uuid,
  p_email text,
  p_domain text,
  p_apollo_person_id text,
  p_apollo_contact_id text
)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from public.suppression_entries s
    where s.organization_id = p_organization_id and s.revoked_at is null
      and (
        (p_email is not null and s.suppression_type in ('EMAIL','UNSUBSCRIBE','NEGATIVE_REPLY','HARD_BOUNCE','USER_BLOCK','ADMIN_BLOCK') and s.normalized_value = lower(p_email)::extensions.citext)
        or (p_domain is not null and s.suppression_type = 'DOMAIN' and s.normalized_value = lower(p_domain)::extensions.citext)
        or (p_apollo_person_id is not null and s.suppression_type = 'APOLLO_PERSON_ID' and s.normalized_value = p_apollo_person_id::extensions.citext)
        or (p_apollo_contact_id is not null and s.suppression_type = 'APOLLO_CONTACT_ID' and s.normalized_value = p_apollo_contact_id::extensions.citext)
      )
  );
$$;

create or replace function public.claim_agent_jobs(p_worker_id text, p_limit integer)
returns setof public.agent_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.agent_jobs j
  set status = 'RUNNING', locked_at = timezone('utc', now()), locked_by = p_worker_id,
      heartbeat_at = timezone('utc', now()), attempts = attempts + 1
  where j.id in (
    select id from public.agent_jobs
    where status in ('QUEUED','RETRY') and run_after <= timezone('utc', now())
      and attempts < max_attempts
    order by priority asc, created_at asc
    for update skip locked
    limit greatest(1, least(p_limit, 20))
  )
  returning j.*;
end;
$$;

create or replace function public.consume_rate_limit(
  p_organization_id uuid,
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from timezone('utc', now())) / p_window_seconds) * p_window_seconds);
  v_count integer;
begin
  insert into public.rate_limits(organization_id, key, window_started_at, count)
  values (p_organization_id, p_key, v_window, 1)
  on conflict (organization_id, key, window_started_at)
  do update set count = public.rate_limits.count + 1
  returning count into v_count;
  return v_count <= p_limit;
end;
$$;

create or replace function public.invalidate_approval_on_draft_edit()
returns trigger language plpgsql as $$
begin
  if old.subject is distinct from new.subject or old.body is distinct from new.body
    or old.recipient_email is distinct from new.recipient_email
    or old.sending_mailbox_id is distinct from new.sending_mailbox_id then
    new.revision = old.revision + 1;
    new.approval_invalidated_at = timezone('utc', now());
    new.status = 'PENDING_USER_APPROVAL';
    update public.approvals set expires_at = least(expires_at, timezone('utc', now()))
    where draft_id = old.id and consumed_at is null;
  end if;
  return new;
end;
$$;

create trigger outreach_drafts_invalidate_approval
before update on public.outreach_drafts
for each row execute function public.invalidate_approval_on_draft_edit();

create or replace function public.prepare_approved_send(
  p_organization_id uuid,
  p_user_id uuid,
  p_draft_id uuid,
  p_mailbox_id text,
  p_idempotency_key text,
  p_nonce_hash text,
  p_ttl_seconds integer default 300,
  p_provider_mailbox_limit integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_draft public.outreach_drafts%rowtype;
  v_campaign public.campaigns%rowtype;
  v_company_domain text;
  v_approval_id uuid;
  v_send_id uuid;
  v_existing public.email_sends%rowtype;
  v_settings jsonb;
  v_org_limit integer;
  v_mailbox_limit integer;
  v_campaign_limit integer;
  v_org_count integer;
  v_campaign_count integer;
  v_mailbox_count integer;
  v_timezone text;
  v_local_now timestamp;
  v_quiet_start time;
  v_quiet_end time;
  v_allowed_days integer[];
  v_day_start timestamptz;
begin
  if auth.uid() is distinct from p_user_id then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = 'P0001';
  end if;
  if not public.has_organization_role(p_organization_id, array['owner','admin','member']) then
    raise exception 'INSUFFICIENT_PERMISSION' using errcode = 'P0001';
  end if;

  select * into v_existing from public.email_sends
  where organization_id = p_organization_id and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('sendId', v_existing.id, 'status', v_existing.status, 'duplicate', true);
  end if;

  -- Serialize reservations per organization so concurrent approvals cannot exceed a
  -- daily cap or race the same idempotency key from different drafts.
  select sending_settings into v_settings from public.organizations
  where id = p_organization_id and deleted_at is null
  for update;
  if not found then raise exception 'ORGANIZATION_NOT_FOUND' using errcode = 'P0001'; end if;
  select * into v_existing from public.email_sends
  where organization_id = p_organization_id and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('sendId', v_existing.id, 'status', v_existing.status, 'duplicate', true);
  end if;

  select * into v_draft from public.outreach_drafts
  where id = p_draft_id and organization_id = p_organization_id and deleted_at is null
  for update;
  if not found then raise exception 'DRAFT_NOT_FOUND' using errcode = 'P0001'; end if;
  if v_draft.status not in ('PENDING_USER_APPROVAL','APPROVED') then
    raise exception 'APPROVAL_MISMATCH' using errcode = 'P0001';
  end if;
  if v_draft.sending_mailbox_id <> p_mailbox_id then
    raise exception 'APPROVAL_MISMATCH' using errcode = 'P0001';
  end if;

  select * into v_campaign from public.campaigns where id = v_draft.campaign_id for update;
  if v_campaign.status in ('PAUSED','FAILED','COMPLETED') then
    raise exception 'CAMPAIGN_NOT_ACTIVE' using errcode = 'P0001';
  end if;

  select c.domain::text into v_company_domain
  from public.prospects p join public.companies c on c.id = p.company_id
  where p.id = v_draft.prospect_id;
  if public.is_recipient_suppressed(p_organization_id, v_draft.recipient_email::text, v_company_domain, null, null) then
    raise exception 'PROSPECT_SUPPRESSED' using errcode = 'P0001';
  end if;

  v_org_limit := coalesce((v_settings->>'organizationDailyLimit')::integer, 100);
  v_mailbox_limit := least(
    coalesce((v_settings->>'dailyLimit')::integer, 25),
    greatest(1, coalesce(p_provider_mailbox_limit, coalesce((v_settings->>'dailyLimit')::integer, 25)))
  );
  v_timezone := coalesce(nullif(v_settings->>'timezone', ''), 'UTC');
  begin
    v_local_now := timezone(v_timezone, now());
  exception when invalid_parameter_value then
    raise exception 'OUTSIDE_SENDING_WINDOW' using errcode = 'P0001';
  end;
  select coalesce(array_agg(value::integer), array[1,2,3,4,5]) into v_allowed_days
  from jsonb_array_elements_text(coalesce(v_settings->'allowedDays', '[1,2,3,4,5]'::jsonb));
  if not (extract(dow from v_local_now)::integer = any(v_allowed_days)) then
    raise exception 'OUTSIDE_SENDING_WINDOW' using errcode = 'P0001';
  end if;
  v_quiet_start := coalesce(nullif(v_settings->>'quietHoursStart', ''), '18:00')::time;
  v_quiet_end := coalesce(nullif(v_settings->>'quietHoursEnd', ''), '08:00')::time;
  if v_quiet_start <> v_quiet_end and (
    (v_quiet_start < v_quiet_end and v_local_now::time >= v_quiet_start and v_local_now::time < v_quiet_end)
    or (v_quiet_start > v_quiet_end and (v_local_now::time >= v_quiet_start or v_local_now::time < v_quiet_end))
  ) then
    raise exception 'OUTSIDE_SENDING_WINDOW' using errcode = 'P0001';
  end if;

  select daily_send_limit into v_campaign_limit from public.campaign_limits where campaign_id = v_draft.campaign_id;
  v_campaign_limit := coalesce(v_campaign_limit, 25);
  v_day_start := date_trunc('day', v_local_now) at time zone v_timezone;
  select
    count(*)::integer,
    count(*) filter (where campaign_id = v_draft.campaign_id)::integer,
    count(*) filter (where sending_mailbox_id = p_mailbox_id)::integer
  into v_org_count, v_campaign_count, v_mailbox_count
  from public.email_sends
  where organization_id = p_organization_id
    and status in ('QUEUED','SENDING','SENT','DELIVERY_UNKNOWN')
    and created_at >= v_day_start;
  if v_org_count >= v_org_limit or v_campaign_count >= v_campaign_limit or v_mailbox_count >= v_mailbox_limit then
    raise exception 'DAILY_LIMIT_REACHED' using errcode = 'P0001';
  end if;

  insert into public.approvals(
    organization_id, user_id, prospect_id, draft_id, recipient_email, sending_mailbox_id,
    subject_hash, body_hash, approved_at, expires_at, nonce_hash, consumed_at
  ) values (
    p_organization_id, p_user_id, v_draft.prospect_id, v_draft.id, v_draft.recipient_email,
    p_mailbox_id, encode(extensions.digest(v_draft.subject, 'sha256'), 'hex'),
    encode(extensions.digest(v_draft.body, 'sha256'), 'hex'), timezone('utc', now()),
    timezone('utc', now()) + make_interval(secs => greatest(30, least(p_ttl_seconds, 900))),
    p_nonce_hash, timezone('utc', now())
  ) returning id into v_approval_id;

  insert into public.email_sends(
    organization_id, campaign_id, prospect_id, draft_id, approval_id, sending_mailbox_id,
    recipient_email, subject, body, idempotency_key, status
  ) values (
    p_organization_id, v_draft.campaign_id, v_draft.prospect_id, v_draft.id, v_approval_id,
    p_mailbox_id, v_draft.recipient_email, v_draft.subject, v_draft.body, p_idempotency_key, 'QUEUED'
  ) returning id into v_send_id;

  update public.outreach_drafts set status = 'SENDING' where id = v_draft.id;
  insert into public.audit_events(organization_id, actor_user_id, actor_type, action, entity_type, entity_id, campaign_id, prospect_id, immutable_data)
  values (p_organization_id, p_user_id, 'USER', 'DRAFT_APPROVED', 'outreach_draft', v_draft.id, v_draft.campaign_id, v_draft.prospect_id,
    jsonb_build_object('approvalId', v_approval_id, 'sendId', v_send_id, 'recipient', v_draft.recipient_email, 'mailboxId', p_mailbox_id,
      'subjectHash', encode(extensions.digest(v_draft.subject, 'sha256'), 'hex'), 'bodyHash', encode(extensions.digest(v_draft.body, 'sha256'), 'hex')));

  return jsonb_build_object('sendId', v_send_id, 'approvalId', v_approval_id, 'status', 'QUEUED', 'duplicate', false);
end;
$$;

revoke all on function public.claim_agent_jobs(text, integer) from public, anon, authenticated;
revoke all on function public.consume_rate_limit(uuid, text, integer, integer) from public, anon;
revoke all on function public.prepare_approved_send(uuid, uuid, uuid, text, text, text, integer, integer) from public, anon;
grant execute on function public.prepare_approved_send(uuid, uuid, uuid, text, text, text, integer, integer) to authenticated;

commit;
