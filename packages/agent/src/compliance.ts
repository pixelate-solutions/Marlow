import type { CampaignProfile } from "@marlow/shared";

const defaultBanned = [
  "i hope this email finds you well",
  "i wanted to reach out",
  "just circling back",
  "i noticed your impressive company",
  "i know you’re busy",
  "i know you're busy",
  "we’re revolutionizing",
  "we're revolutionizing",
  "synergy",
  "game-changing",
];

export type ComplianceResult = { valid: boolean; warnings: string[]; wordCount: number };

const emDashCharacter = String.fromCodePoint(0x2014);
const emDashHtmlEntity = "&m" + "dash;";
const emDashNumericEntity = new RegExp("&#" + "(?:0*8212|x0*2014);", "i");
const emDashName = /\bem[\s-]+dash(?:es)?\b/i;
const positiveStyleRequest =
  /\b(?:use|include|add|allow|keep|prefer|write with|is fine|are fine|is okay|are okay|is acceptable|are acceptable)\b/i;
const negativeStyleRequest = /\b(?:do not|don't|dont|never|avoid|remove|replace|without|no)\b/i;

function emDashPreference(instruction?: string): boolean | undefined {
  if (!instruction?.trim()) return undefined;
  const clauses = instruction.split(/[.!?;\n]+/).filter(Boolean);
  for (const clause of clauses) {
    if (!emDashName.test(clause) && !clause.includes(emDashCharacter)) continue;
    if (negativeStyleRequest.test(clause)) return false;
    if (positiveStyleRequest.test(clause)) return true;
  }
  return undefined;
}

function containsEmDashForm(value: string): boolean {
  return (
    value.includes(emDashCharacter) ||
    value.toLowerCase().includes(emDashHtmlEntity) ||
    emDashNumericEntity.test(value)
  );
}

export function explicitlyRequestsEmDashes(...instructions: Array<string | undefined>): boolean {
  for (const instruction of instructions) {
    const preference = emDashPreference(instruction);
    if (preference !== undefined) return preference;
  }
  return false;
}

export function validateEmailCompliance(input: {
  subject: string;
  body: string;
  profile?: CampaignProfile;
  supportedClaims?: string[];
  allowEmDashes?: boolean;
}): ComplianceResult {
  const warnings: string[] = [];
  const words = input.body.trim().split(/\s+/).filter(Boolean);
  const lower = `${input.subject}\n${input.body}`.toLowerCase();
  const banned = [
    ...defaultBanned,
    ...(input.profile?.messaging.bannedPhrases ?? []).map((phrase) => phrase.toLowerCase()),
  ];
  for (const phrase of [...new Set(banned)]) {
    if (lower.includes(phrase)) warnings.push(`Banned phrase: “${phrase}”.`);
  }
  const maximumWords = input.profile?.messaging.maximumWords ?? 120;
  if (words.length > maximumWords)
    warnings.push(`Email is ${words.length} words; campaign maximum is ${maximumWords}.`);
  if (words.length < 35) warnings.push("Email may be too short to communicate grounded value.");
  const subjectWords = input.subject.trim().split(/\s+/).filter(Boolean).length;
  if (subjectWords < 2 || subjectWords > 7)
    warnings.push("Subject should usually be two to five words.");
  if (/[!]{2,}|\bFREE\b|\bGUARANTEED\b/i.test(input.subject))
    warnings.push("Subject appears deceptive or spam-like.");
  if ((input.body.match(/\?/g) ?? []).length > 1)
    warnings.push("Email contains more than one question or call to action.");
  if (/https?:\/\/\S+/i.test(input.body) && !/unsubscribe/i.test(input.body))
    warnings.push("First-touch body contains a URL; verify it is necessary.");
  if (!input.allowEmDashes && containsEmDashForm(`${input.subject}\n${input.body}`))
    warnings.push(
      "Email contains an em dash; use commas, periods, colons, or parentheses instead.",
    );
  return { valid: warnings.length === 0, warnings, wordCount: words.length };
}

export type SuppressionEntry = {
  type: "EMAIL" | "DOMAIN" | "APOLLO_PERSON_ID" | "APOLLO_CONTACT_ID" | "COMPANY";
  value: string;
};

export function matchesSuppression(
  input: {
    email?: string;
    domain?: string;
    apolloPersonId?: string;
    apolloContactId?: string;
    company?: string;
  },
  entries: SuppressionEntry[],
): boolean {
  const values = {
    EMAIL: input.email,
    DOMAIN: input.domain ?? input.email?.split("@")[1],
    APOLLO_PERSON_ID: input.apolloPersonId,
    APOLLO_CONTACT_ID: input.apolloContactId,
    COMPANY: input.company,
  };
  return entries.some(
    (entry) => values[entry.type]?.trim().toLowerCase() === entry.value.trim().toLowerCase(),
  );
}
