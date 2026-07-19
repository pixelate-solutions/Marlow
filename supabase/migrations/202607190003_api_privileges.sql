begin;

grant usage on schema public to authenticated, service_role;

grant select, update on public.organizations to authenticated;
grant select, insert, update, delete on public.organization_members to authenticated;
grant select, insert, update on public.user_profiles to authenticated;
grant select, insert, update on public.integrations to authenticated;
grant select, insert, update on public.company_profiles to authenticated;
grant select, insert, update on public.campaigns to authenticated;
grant select, insert, update on public.campaign_conversations to authenticated;
grant select, insert, update on public.campaign_messages to authenticated;
grant select, insert, update on public.campaign_profiles to authenticated;
grant select, insert, update on public.campaign_limits to authenticated;
grant select on public.agent_runs to authenticated;
grant select on public.agent_run_events to authenticated;
grant select on public.agent_tool_calls to authenticated;
grant select, insert, update on public.companies to authenticated;
grant select, insert, update on public.prospects to authenticated;
grant select on public.prospect_identities to authenticated;
grant select on public.prospect_research to authenticated;
grant select on public.research_claims to authenticated;
grant select on public.lead_scores to authenticated;
grant select, update on public.outreach_drafts to authenticated;
grant select, insert on public.draft_revisions to authenticated;
grant select, insert, update on public.suppression_entries to authenticated;
grant select on public.apollo_credit_usage to authenticated;
grant select, insert on public.audit_events to authenticated;

-- Service-role operations are server-only and still constrained by application authorization.
grant all privileges on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Audit evidence is append-only for application users.
drop policy if exists audit_events_update on public.audit_events;
revoke update, delete, truncate on public.audit_events from authenticated;

-- Browser roles never receive direct privileges for credential, job, approval, send, or
-- distributed rate-limit tables. Access is through reviewed security-definer functions only.
revoke all on public.integration_credentials from anon, authenticated;
revoke all on public.agent_jobs from anon, authenticated;
revoke all on public.approvals from anon, authenticated;
revoke all on public.email_sends from anon, authenticated;
revoke all on public.rate_limits from anon, authenticated;

revoke all on function public.find_duplicate_prospect(uuid, text, text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.find_duplicate_prospect(uuid, text, text, text, text, text, uuid) to service_role;

revoke all on function public.is_recipient_suppressed(uuid, text, text, text, text) from public, anon;
grant execute on function public.is_recipient_suppressed(uuid, text, text, text, text) to authenticated, service_role;

grant execute on function public.claim_agent_jobs(text, integer) to service_role;
grant execute on function public.consume_rate_limit(uuid, text, integer, integer) to service_role;
grant execute on function public.prepare_approved_send(uuid, uuid, uuid, text, text, text, integer, integer) to service_role;

commit;
