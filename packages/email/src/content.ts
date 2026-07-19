const entities: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function textToHtml(value: string): string {
  return escapeHtml(value).replaceAll(/\r?\n/g, "<br>");
}

export function htmlToPlainText(value: string): string {
  return value
    .replaceAll(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6])\b[^>]*>/gi, "\n")
    .replaceAll(/<li\b[^>]*>/gi, "• ")
    .replaceAll(/<[^>]+>/g, "")
    .replaceAll(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
      if (entity.startsWith("#")) {
        const codePoint = Number.parseInt(
          entity.slice(entity.startsWith("#x") ? 2 : 1),
          entity.startsWith("#x") ? 16 : 10,
        );
        if (
          codePoint >= 0 &&
          codePoint <= 0x10ffff &&
          !(codePoint >= 0xd800 && codePoint <= 0xdfff)
        )
          return String.fromCodePoint(codePoint);
        return match;
      }
      return entities[entity.toLowerCase()] ?? match;
    })
    .replaceAll(/\u00a0/g, " ")
    .replaceAll(/[ \t]+\n/g, "\n")
    .replaceAll(/\n{3,}/g, "\n\n")
    .trim();
}

export function composeEmailContent(input: {
  body: string;
  signatureHtml?: string;
  signatureText?: string;
  complianceFooter?: string;
}): { text: string; html: string } {
  const textParts = [
    input.body.trim(),
    input.signatureText?.trim(),
    input.complianceFooter?.trim(),
  ].filter((part): part is string => Boolean(part));
  const htmlParts = [
    `<div>${textToHtml(input.body.trim())}</div>`,
    input.signatureHtml?.trim()
      ? `<div class="marlow-signature">${input.signatureHtml.trim()}</div>`
      : input.signatureText?.trim()
        ? `<div class="marlow-signature">${textToHtml(input.signatureText.trim())}</div>`
        : "",
    input.complianceFooter?.trim()
      ? `<div class="marlow-compliance-footer">${textToHtml(input.complianceFooter.trim())}</div>`
      : "",
  ].filter(Boolean);
  return { text: textParts.join("\n\n"), html: htmlParts.join("<br>") };
}
