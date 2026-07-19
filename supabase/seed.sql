-- Safe deterministic demo records. No credentials and no send-capable integration are seeded.
insert into public.organizations (id, name, slug, plan)
values ('10000000-0000-4000-8000-000000000001', 'Northstar Demo', 'northstar-demo', 'demo')
on conflict do nothing;

insert into public.campaigns (id, organization_id, name, objective, status, minimum_lead_score)
values ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Q3 Operations Leaders', 'Book qualified discovery calls with operations leaders', 'PENDING_USER_APPROVAL', 70)
on conflict do nothing;

insert into public.campaign_limits (organization_id, campaign_id, requested_prospects, daily_send_limit, apollo_credit_budget)
values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 25, 25, 100)
on conflict do nothing;

insert into public.companies (id, organization_id, apollo_id, name, domain, website_url, industry, employee_count, location)
values ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'demo-company', 'Acme Automation', 'acme.example', 'https://acme.example', 'Industrial automation', 420, 'Detroit, MI')
on conflict do nothing;

insert into public.prospects (id, organization_id, campaign_id, company_id, first_name, last_name, title, normalized_email, email_status, location, status, selection_reason)
values ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'Maya', 'Chen', 'VP of Operations', 'maya@acme.example', 'verified', 'Detroit, MI', 'DRAFTED', 'Strong persona, industry, and hiring-signal match')
on conflict do nothing;

insert into public.prospect_research (id, organization_id, campaign_id, prospect_id, company_summary, signals)
values ('50000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'Demo manufacturer expanding its operations team.', '["Hiring operations analysts", "Expanding Midwest facilities"]')
on conflict do nothing;

insert into public.research_claims (id, organization_id, prospect_research_id, claim, source_url, source_title, retrieved_at, confidence, source_type)
values ('60000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 'Demo data: Acme is hiring operations analysts.', 'https://acme.example/careers', 'Acme Careers (demo)', timezone('utc', now()), 'high', 'job_posting')
on conflict do nothing;

insert into public.lead_scores (organization_id, campaign_id, prospect_id, total_score, components, explanation)
values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 92, '{"industryMatch":15,"companySizeMatch":10,"geographyMatch":5,"personaMatch":15,"seniorityMatch":10,"technologyMatch":4,"painPointRelevance":12,"buyingSignal":8,"researchConfidence":7,"contactability":6,"disqualifierPenalty":0}', 'Demo prospect closely matches the campaign profile.')
on conflict do nothing;

insert into public.outreach_drafts (id, organization_id, campaign_id, prospect_id, recipient_email, sending_mailbox_id, subject, body, personalization_summary, selected_angle, qualification_summary, supporting_claim_ids, confidence, status)
values ('70000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'maya@acme.example', 'demo-mailbox', 'Scaling operations', E'Maya, I saw Acme is expanding the operations team as its Midwest footprint grows. That often makes it harder to keep handoffs and reporting consistent across facilities.\n\nMarlow helps operations teams turn scattered workflow data into a clear daily view, without replacing the tools they already use.\n\nWould comparing notes for 15 minutes next week be useful?\n\nAlex', 'References a clearly labeled demo hiring signal.', 'Growing the operations function without adding reporting friction.', 'Excellent role, account, and timing fit.', array['60000000-0000-4000-8000-000000000001']::uuid[], 91, 'PENDING_USER_APPROVAL')
on conflict do nothing;
