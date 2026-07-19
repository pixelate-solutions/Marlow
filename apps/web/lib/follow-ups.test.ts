import { MockModelProvider } from "@marlow/agent";
import { describe, expect, it } from "vitest";
import { followUpSubject, generateFollowUpDraft } from "./follow-ups";

const input = {
  originalSubject: "Scaling operations across multiple facilities",
  originalBody:
    "Maya, Acme's expansion may make consistent operations reporting more important. Would a short conversation be useful?",
  prospectName: "Maya Chen",
  prospectTitle: "VP of Operations",
  companyName: "Acme Automation",
  campaignObjective: "Book qualified conversations with operations leaders",
  selectedAngle: "Consistent reporting during expansion",
};

describe("follow-up drafting", () => {
  it("keeps the subject concise and produces a compliant approval draft", async () => {
    const model = new MockModelProvider({
      follow_up_draft: {
        body: "Maya, following up on my note about keeping operations reporting consistent as Acme grows. If improving that daily view is still relevant, I would be glad to share a practical approach. Would a brief conversation next week be useful?",
      },
    });

    const draft = await generateFollowUpDraft(model, input);

    expect(draft.subject).toBe("Re: Scaling operations across multiple facilities");
    expect(draft.body).toContain("Would a brief conversation");
    expect(draft.body).not.toContain(String.fromCodePoint(0x2014));
    expect(model.calls).toEqual(["follow_up_draft"]);
  });

  it("removes repeated reply prefixes and limits long subjects", () => {
    expect(followUpSubject("Re: RE: A very long subject line about workflow reporting")).toBe(
      "Re: A very long subject line",
    );
  });

  it("rejects a model response that fails deterministic checks", async () => {
    const model = new MockModelProvider({ follow_up_draft: { body: "Too short?" } });

    await expect(generateFollowUpDraft(model, input)).rejects.toThrow(
      "Follow-up draft failed compliance",
    );
  });
});
