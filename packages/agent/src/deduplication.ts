export type ProspectIdentity = {
  apolloPersonId?: string;
  apolloContactId?: string;
  email?: string;
  linkedinUrl?: string;
  fullName: string;
  companyDomain: string;
};

function normalize(value?: string): string | undefined {
  return value?.trim().toLowerCase() || undefined;
}

export function prospectFingerprint(identity: ProspectIdentity): string[] {
  return [
    identity.apolloPersonId && `apollo-person:${normalize(identity.apolloPersonId)}`,
    identity.apolloContactId && `apollo-contact:${normalize(identity.apolloContactId)}`,
    identity.email && `email:${normalize(identity.email)}`,
    identity.linkedinUrl && `linkedin:${normalize(identity.linkedinUrl)?.replace(/\/$/, "")}`,
    `name-domain:${normalize(identity.fullName)}@${normalize(identity.companyDomain)}`,
  ].filter((value): value is string => Boolean(value));
}

export function findDuplicate(
  candidate: ProspectIdentity,
  existing: ProspectIdentity[],
): ProspectIdentity | undefined {
  const fingerprints = new Set(prospectFingerprint(candidate));
  return existing.find((identity) =>
    prospectFingerprint(identity).some((value) => fingerprints.has(value)),
  );
}
