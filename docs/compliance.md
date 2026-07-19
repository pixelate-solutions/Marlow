# Compliance and suppression

Marlow provides technical controls for responsible outbound operations; it does not determine whether a campaign is lawful in every jurisdiction. The organization remains responsible for legal review, lawful basis, truthful content, sender identification, opt-out handling, and provider policies.

## Deterministic controls

Suppression entries may target email, domain, Apollo person/contact ID, company, unsubscribe, negative reply, hard bounce, administrative block, or user block. Checks run before enrichment where identifiers are available, before draft creation, and immediately before send. A model request can never override a match.

Sending settings require a real sender identity, valid postal address, plain-language opt-out text and optional URL, mailbox and organization limits, quiet hours, timezone, and allowed days. The lowest applicable limit wins. Do not use Marlow to evade spam filtering, platform enforcement, access controls, or unsubscribe requests.

## Message standards

First-touch defaults are 50–120 words, a two-to-five-word subject, one grounded personalization point, one concise value proposition, and one simple CTA. Deterministic checks flag banned filler, exaggerated/spam-like subjects, multiple questions, unnecessary URLs, and campaign word limits. Muse separately reviews grounding, relevance, clarity, natural tone, CTA, duplicate phrasing, and unsupported claims.

Never claim an unverified technology, problem, metric, relationship, personal knowledge, or recent action. Approved social proof is versioned in the campaign profile. If an angle would require fabrication, skip the prospect.

## Event handling

- Unsubscribe or opt-out reply: create an organization-wide suppression immediately.
- Hard bounce: suppress the exact address and stop follow-up.
- Negative reply: classify conservatively, suppress when it requests no contact, and retain the audit reason.
- Bad research: flag the draft, preserve the source snapshot, and prevent reuse until reviewed.
- Block company: suppress the domain and mark the company blocked.

Audit records include the approver, exact content, recipient, mailbox, timestamps, sources, external message ID, and suppressions. Audit evidence is retained using soft deletion where required.
