begin;

alter table public.integrations drop constraint if exists integrations_provider_check;
alter table public.integrations add constraint integrations_provider_check
  check (provider in ('APOLLO','META_MODEL','WEB_SEARCH','GMAIL','MICROSOFT'));

create table public.sending_mailboxes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  integration_id uuid not null references public.integrations(id) on delete cascade,
  provider text not null check (provider in ('GMAIL','MICROSOFT')),
  external_mailbox_id text not null,
  email extensions.citext not null,
  display_name text not null,
  reply_to extensions.citext,
  signature_html text not null default '',
  signature_text text not null default '',
  signature_source text not null default 'NONE' check (signature_source in ('PROVIDER','MANUAL','NONE')),
  is_default boolean not null default false,
  is_primary boolean not null default true,
  status text not null default 'AVAILABLE' check (status in ('AVAILABLE','UNAVAILABLE','REAUTHORIZATION_REQUIRED')),
  metadata jsonb not null default '{}',
  last_synced_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (integration_id, external_mailbox_id)
);

create unique index sending_mailboxes_one_default
  on public.sending_mailboxes(organization_id) where is_default;
create index sending_mailboxes_organization_status
  on public.sending_mailboxes(organization_id, status, is_default desc);
create trigger sending_mailboxes_updated_at
  before update on public.sending_mailboxes
  for each row execute function public.set_updated_at();

alter table public.sending_mailboxes enable row level security;
alter table public.sending_mailboxes force row level security;
create policy sending_mailboxes_select on public.sending_mailboxes for select to authenticated
  using (public.is_organization_member(organization_id));
grant select on public.sending_mailboxes to authenticated;
grant all privileges on public.sending_mailboxes to service_role;

alter table public.outreach_drafts
  add column sending_provider text not null default 'APOLLO'
    check (sending_provider in ('APOLLO','GMAIL','MICROSOFT')),
  add column sender_email extensions.citext not null default '',
  add column sender_name text not null default '',
  add column signature_html text not null default '',
  add column signature_text text not null default '',
  add column compliance_footer_text text not null default '';

alter table public.email_sends
  add column sending_provider text not null default 'APOLLO'
    check (sending_provider in ('APOLLO','GMAIL','MICROSOFT')),
  add column sender_email extensions.citext not null default '',
  add column sender_name text not null default '',
  add column signature_html text not null default '',
  add column signature_text text not null default '',
  add column compliance_footer_text text not null default '';

create or replace function public.approved_body_hash(
  p_body text,
  p_signature_text text,
  p_signature_html text,
  p_compliance_footer_text text
)
returns char(64)
language sql
immutable
set search_path = public, extensions
as $$
  select encode(
    extensions.digest(
      coalesce(p_body, '') || chr(30) || coalesce(p_signature_text, '') || chr(30)
        || coalesce(p_signature_html, '') || chr(30) || coalesce(p_compliance_footer_text, ''),
      'sha256'
    ),
    'hex'
  )::char(64);
$$;

create or replace function public.invalidate_approval_on_draft_edit()
returns trigger language plpgsql as $$
begin
  if old.subject is distinct from new.subject or old.body is distinct from new.body
    or old.recipient_email is distinct from new.recipient_email
    or old.sending_mailbox_id is distinct from new.sending_mailbox_id
    or old.sending_provider is distinct from new.sending_provider
    or old.sender_email is distinct from new.sender_email
    or old.sender_name is distinct from new.sender_name
    or old.signature_html is distinct from new.signature_html
    or old.signature_text is distinct from new.signature_text
    or old.compliance_footer_text is distinct from new.compliance_footer_text then
    new.revision = old.revision + 1;
    new.approval_invalidated_at = timezone('utc', now());
    new.status = 'PENDING_USER_APPROVAL';
    update public.approvals set expires_at = least(expires_at, timezone('utc', now()))
    where draft_id = old.id and consumed_at is null;
  end if;
  return new;
end;
$$;

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
    public.approved_body_hash(v_draft.body, v_draft.signature_text, v_draft.signature_html, v_draft.compliance_footer_text),
    timezone('utc', now()),
    timezone('utc', now()) + make_interval(secs => greatest(30, least(p_ttl_seconds, 900))),
    p_nonce_hash, timezone('utc', now())
  ) returning id into v_approval_id;

  insert into public.email_sends(
    organization_id, campaign_id, prospect_id, draft_id, approval_id, sending_mailbox_id,
    recipient_email, subject, body, idempotency_key, status, sending_provider, sender_email,
    sender_name, signature_html, signature_text, compliance_footer_text
  ) values (
    p_organization_id, v_draft.campaign_id, v_draft.prospect_id, v_draft.id, v_approval_id,
    p_mailbox_id, v_draft.recipient_email, v_draft.subject, v_draft.body, p_idempotency_key, 'QUEUED',
    v_draft.sending_provider, v_draft.sender_email, v_draft.sender_name, v_draft.signature_html,
    v_draft.signature_text, v_draft.compliance_footer_text
  ) returning id into v_send_id;

  update public.outreach_drafts set status = 'SENDING' where id = v_draft.id;
  insert into public.audit_events(organization_id, actor_user_id, actor_type, action, entity_type, entity_id, campaign_id, prospect_id, immutable_data)
  values (p_organization_id, p_user_id, 'USER', 'DRAFT_APPROVED', 'outreach_draft', v_draft.id, v_draft.campaign_id, v_draft.prospect_id,
    jsonb_build_object('approvalId', v_approval_id, 'sendId', v_send_id, 'recipient', v_draft.recipient_email, 'mailboxId', p_mailbox_id,
      'provider', v_draft.sending_provider, 'subjectHash', encode(extensions.digest(v_draft.subject, 'sha256'), 'hex'),
      'bodyHash', public.approved_body_hash(v_draft.body, v_draft.signature_text, v_draft.signature_html, v_draft.compliance_footer_text)));

  return jsonb_build_object('sendId', v_send_id, 'approvalId', v_approval_id, 'status', 'QUEUED', 'duplicate', false);
end;
$$;

revoke all on function public.approved_body_hash(text, text, text, text) from public, anon;
grant execute on function public.approved_body_hash(text, text, text, text) to authenticated, service_role;
grant execute on function public.prepare_approved_send(uuid, uuid, uuid, text, text, text, integer, integer) to authenticated, service_role;

commit;
