begin;

alter table public.outreach_drafts
  add column draft_kind text not null default 'INITIAL'
    check (draft_kind in ('INITIAL','FOLLOW_UP')),
  add column parent_email_send_id uuid,
  add column follow_up_number integer not null default 0 check (follow_up_number between 0 and 10);

alter table public.outreach_drafts
  add constraint outreach_drafts_parent_email_send_fk
  foreign key (parent_email_send_id) references public.email_sends(id) on delete set null;

create unique index outreach_drafts_one_follow_up_per_send
  on public.outreach_drafts(parent_email_send_id, follow_up_number)
  where parent_email_send_id is not null and draft_kind = 'FOLLOW_UP';

create table public.email_follow_up_monitors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  original_send_id uuid not null unique references public.email_sends(id) on delete cascade,
  sending_mailbox_id text not null,
  recipient_email extensions.citext not null,
  due_at timestamptz not null,
  status text not null default 'WAITING'
    check (status in ('WAITING','FOLLOW_UP_NEEDED','REPLIED','FOLLOW_UP_SENT','DISMISSED')),
  follow_up_draft_id uuid unique references public.outreach_drafts(id) on delete set null,
  reply_message_id text,
  reply_detected_at timestamptz,
  last_checked_at timestamptz,
  check_attempts integer not null default 0,
  last_error text,
  locked_at timestamptz,
  locked_by text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index email_follow_up_monitors_due
  on public.email_follow_up_monitors(status, due_at, locked_at)
  where status in ('WAITING','FOLLOW_UP_NEEDED');
create index email_follow_up_monitors_campaign
  on public.email_follow_up_monitors(organization_id, campaign_id, status);
create trigger email_follow_up_monitors_updated_at
  before update on public.email_follow_up_monitors
  for each row execute function public.set_updated_at();

alter table public.email_follow_up_monitors enable row level security;
alter table public.email_follow_up_monitors force row level security;
revoke all on public.email_follow_up_monitors from public, anon, authenticated;
grant all privileges on public.email_follow_up_monitors to service_role;

create or replace function public.claim_due_follow_up_monitors(
  p_limit integer,
  p_worker_id text
)
returns setof public.email_follow_up_monitors
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select monitor.id
    from public.email_follow_up_monitors monitor
    where monitor.status in ('WAITING','FOLLOW_UP_NEEDED')
      and monitor.due_at <= timezone('utc', now())
      and (monitor.locked_at is null or monitor.locked_at < timezone('utc', now()) - interval '30 minutes')
    order by monitor.due_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 25), 100))
  )
  update public.email_follow_up_monitors monitor
  set locked_at = timezone('utc', now()), locked_by = p_worker_id
  from candidates
  where monitor.id = candidates.id
  returning monitor.*;
end;
$$;

revoke all on function public.claim_due_follow_up_monitors(integer, text) from public, anon, authenticated;
grant execute on function public.claim_due_follow_up_monitors(integer, text) to service_role;

create or replace function public.track_follow_up_after_send()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_kind text;
begin
  if new.status <> 'SENT' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'SENT' then
    return new;
  end if;

  select draft_kind into v_kind from public.outreach_drafts where id = new.draft_id;
  if v_kind = 'INITIAL' and new.sending_provider in ('GMAIL','MICROSOFT') then
    insert into public.email_follow_up_monitors(
      organization_id, campaign_id, prospect_id, original_send_id, sending_mailbox_id,
      recipient_email, due_at
    ) values (
      new.organization_id, new.campaign_id, new.prospect_id, new.id, new.sending_mailbox_id,
      new.recipient_email, coalesce(new.sent_at, timezone('utc', now())) + interval '7 days'
    ) on conflict (original_send_id) do nothing;
  elsif v_kind = 'FOLLOW_UP' then
    update public.email_follow_up_monitors
    set status = 'FOLLOW_UP_SENT', locked_at = null, locked_by = null, last_error = null
    where follow_up_draft_id = new.draft_id;
  end if;
  return new;
end;
$$;

create trigger email_sends_track_follow_up
after insert or update of status on public.email_sends
for each row execute function public.track_follow_up_after_send();

create or replace function public.dismiss_monitor_after_follow_up_skip()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.draft_kind = 'FOLLOW_UP' and old.status is distinct from new.status then
    if new.status = 'SKIPPED' then
      update public.email_follow_up_monitors
      set status = 'DISMISSED', locked_at = null, locked_by = null
      where follow_up_draft_id = new.id and status not in ('REPLIED','FOLLOW_UP_SENT');
    end if;
    if new.status in ('SENT','SKIPPED','FAILED') and not exists (
      select 1 from public.outreach_drafts draft
      where draft.campaign_id = new.campaign_id
        and draft.id <> new.id
        and draft.deleted_at is null
        and draft.status in ('DRAFT','PENDING_USER_APPROVAL','APPROVED','SENDING')
    ) then
      update public.campaigns
      set status = 'SENT'
      where id = new.campaign_id and status = 'PENDING_USER_APPROVAL';
    end if;
  end if;
  return new;
end;
$$;

create trigger outreach_drafts_dismiss_follow_up
after update of status on public.outreach_drafts
for each row execute function public.dismiss_monitor_after_follow_up_skip();

insert into public.email_follow_up_monitors(
  organization_id, campaign_id, prospect_id, original_send_id, sending_mailbox_id,
  recipient_email, due_at
)
select
  send.organization_id, send.campaign_id, send.prospect_id, send.id, send.sending_mailbox_id,
  send.recipient_email, coalesce(send.sent_at, send.created_at) + interval '7 days'
from public.email_sends send
join public.outreach_drafts draft on draft.id = send.draft_id
where send.status = 'SENT'
  and send.sending_provider in ('GMAIL','MICROSOFT')
  and draft.draft_kind = 'INITIAL'
on conflict (original_send_id) do nothing;

update public.integrations
set status = 'REAUTHORIZATION_REQUIRED', last_verified_at = null
where provider = 'GMAIL'
  and status = 'CONNECTED'
  and not (scopes @> array['https://www.googleapis.com/auth/gmail.readonly']::text[]);

update public.integrations
set status = 'REAUTHORIZATION_REQUIRED', last_verified_at = null
where provider = 'MICROSOFT'
  and status = 'CONNECTED'
  and not (scopes @> array['Mail.ReadBasic']::text[]);

update public.sending_mailboxes mailbox
set status = 'REAUTHORIZATION_REQUIRED'
from public.integrations integration
where mailbox.integration_id = integration.id
  and integration.status = 'REAUTHORIZATION_REQUIRED';

commit;
