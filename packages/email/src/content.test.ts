import { describe, expect, it } from "vitest";
import { composeEmailContent, htmlToPlainText } from "./content";

describe("email content", () => {
  it("preserves a provider HTML signature while building a text alternative", () => {
    const content = composeEmailContent({
      body: "Hello Maya,\n\nWould Tuesday work?",
      signatureHtml: "<div><strong>Joey</strong><br>Pixelate Solutions</div>",
      signatureText: "Joey\nPixelate Solutions",
      complianceFooter: "Detroit, MI\nReply to opt out.",
    });
    expect(content.text).toContain("Joey\nPixelate Solutions");
    expect(content.html).toContain("<strong>Joey</strong>");
    expect(content.html).toContain("Reply to opt out.");
  });

  it("converts common Gmail signature markup to readable text", () => {
    expect(htmlToPlainText("<div>Joey&nbsp;Morrison<br><b>Founder</b></div>")).toBe(
      "Joey Morrison\nFounder",
    );
  });

  it("leaves invalid numeric entities intact instead of failing signature sync", () => {
    expect(htmlToPlainText("Joey &#x110000; Morrison")).toBe("Joey &#x110000; Morrison");
  });
});
