begin;

set local role postgres;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
select extensions.plan(6);

insert into auth.users(id, email)
values ('91000000-0000-4000-8000-000000000001', 'follow-up-owner@example.test');

update public.outreach_drafts
set sending_provider = 'GMAIL', sending_mailbox_id = 'follow-up-test-mailbox'
where id = '70000000-0000-4000-8000-000000000001';

update public.outreach_drafts
set status = 'SENT'
where id = '70000000-0000-4000-8000-000000000001';

insert into public.approvals(
  id, organization_id, user_id, prospect_id, draft_id, recipient_email,
  sending_mailbox_id, subject_hash, body_hash, approved_at, expires_at,
  nonce_hash, consumed_at
) values (
  '92000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000001',
  'maya@acme.example', 'follow-up-test-mailbox', repeat('a', 64), repeat('b', 64),
  timezone('utc', now()) - interval '8 days', timezone('utc', now()) + interval '1 day',
  repeat('c', 64), timezone('utc', now()) - interval '8 days'
);

insert into public.email_sends(
  id, organization_id, campaign_id, prospect_id, draft_id, approval_id,
  sending_mailbox_id, recipient_email, subject, body, idempotency_key,
  status, sent_at, sending_provider, sender_email, sender_name
) values (
  '93000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000001',
  'follow-up-test-mailbox', 'maya@acme.example', 'Scaling operations', 'Initial body',
  'follow-up-initial-send', 'SENT', timezone('utc', now()) - interval '8 days',
  'GMAIL', 'alex@northstar.example', 'Alex Morgan'
);

select extensions.is(
  (select count(*)::integer from public.email_follow_up_monitors where original_send_id = '93000000-0000-4000-8000-000000000001'),
  1,
  'a confirmed direct initial send creates one reply monitor'
);

select extensions.is(
  (
    select due_at
    from public.email_follow_up_monitors
    where original_send_id = '93000000-0000-4000-8000-000000000001'
  ),
  (
    select sent_at + interval '7 days'
    from public.email_sends
    where id = '93000000-0000-4000-8000-000000000001'
  ),
  'the first reply check is due seven days after the send'
);

update public.email_follow_up_monitors
set due_at = timezone('utc', now()) - interval '1 minute'
where original_send_id = '93000000-0000-4000-8000-000000000001';

select extensions.is(
  (select count(*)::integer from public.claim_due_follow_up_monitors(10, 'follow-up-test-worker')),
  1,
  'the worker claims a due monitor once'
);

select extensions.is(
  (
    select locked_by
    from public.email_follow_up_monitors
    where original_send_id = '93000000-0000-4000-8000-000000000001'
  ),
  'follow-up-test-worker',
  'the due monitor records its worker lease'
);

insert into public.outreach_drafts(
  id, organization_id, campaign_id, prospect_id, recipient_email, sending_mailbox_id,
  sending_provider, sender_email, sender_name, subject, body, personalization_summary,
  selected_angle, qualification_summary, confidence, status, draft_kind,
  parent_email_send_id, follow_up_number
) values (
  '94000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  'maya@acme.example', 'follow-up-test-mailbox', 'GMAIL',
  'alex@northstar.example', 'Alex Morgan', 'Re: Scaling operations',
  'Maya, following up with one useful question. Would a short conversation next week help?',
  'Follow-up test', 'Operations reporting', 'Qualified operations leader', 91,
  'PENDING_USER_APPROVAL', 'FOLLOW_UP', '93000000-0000-4000-8000-000000000001', 1
);

update public.email_follow_up_monitors
set status = 'FOLLOW_UP_NEEDED', follow_up_draft_id = '94000000-0000-4000-8000-000000000001',
  locked_at = null, locked_by = null
where original_send_id = '93000000-0000-4000-8000-000000000001';

insert into public.approvals(
  id, organization_id, user_id, prospect_id, draft_id, recipient_email,
  sending_mailbox_id, subject_hash, body_hash, approved_at, expires_at,
  nonce_hash, consumed_at
) values (
  '92000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '94000000-0000-4000-8000-000000000001',
  'maya@acme.example', 'follow-up-test-mailbox', repeat('d', 64), repeat('e', 64),
  timezone('utc', now()), timezone('utc', now()) + interval '1 day',
  repeat('f', 64), timezone('utc', now())
);

insert into public.email_sends(
  id, organization_id, campaign_id, prospect_id, draft_id, approval_id,
  sending_mailbox_id, recipient_email, subject, body, idempotency_key,
  status, sent_at, sending_provider, sender_email, sender_name
) values (
  '93000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '94000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000002',
  'follow-up-test-mailbox', 'maya@acme.example', 'Re: Scaling operations', 'Follow-up body',
  'follow-up-approved-send', 'SENT', timezone('utc', now()),
  'GMAIL', 'alex@northstar.example', 'Alex Morgan'
);

select extensions.is(
  (
    select status
    from public.email_follow_up_monitors
    where original_send_id = '93000000-0000-4000-8000-000000000001'
  ),
  'FOLLOW_UP_SENT',
  'a confirmed follow-up send closes its reply monitor'
);

update public.outreach_drafts
set status = 'SENT'
where id = '94000000-0000-4000-8000-000000000001';

select extensions.is(
  (select status from public.campaigns where id = '20000000-0000-4000-8000-000000000001'),
  'SENT',
  'a finished follow-up clears the campaign review state'
);

select * from extensions.finish();
rollback;
