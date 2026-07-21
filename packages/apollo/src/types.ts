export type ApolloPage<T> = {
  items: T[];
  nextCursor?: string;
  estimatedCredits?: number;
  actualCredits?: number;
};

export type ApolloCompany = {
  id: string;
  name: string;
  domain: string;
  websiteUrl?: string;
  industry?: string;
  employeeCount?: number;
  estimatedRevenue?: number;
  location?: string;
  technologies: string[];
  keywords: string[];
};

export type ApolloPerson = {
  personId: string;
  contactId?: string;
  companyId: string;
  firstName: string;
  lastName: string;
  title: string;
  email?: string;
  emailStatus?: "verified" | "likely" | "unverified" | "unavailable";
  linkedinUrl?: string;
  location?: string;
};

export type ApolloMailbox = {
  id: string;
  email: string;
  displayName: string;
  status: "available" | "paused" | "disconnected";
  dailyLimit?: number;
};

export type CompanySearchInput = {
  industries: string[];
  employeeRanges: Array<{ min?: number | undefined; max?: number | undefined }>;
  revenueRanges: Array<{ min?: number | undefined; max?: number | undefined; currency: string }>;
  locations: string[];
  technologies: string[];
  keywords: string[];
  exclusions: string[];
  cursor?: string;
  pageSize: number;
};

export type PeopleSearchInput = {
  companyIds: string[];
  jobFunctions: string[];
  titles: string[];
  seniorities: string[];
  locations: string[];
  cursor?: string;
  pageSize: number;
};

export type ApolloSendInput = {
  mailboxId: string;
  recipientEmail: string;
  subject: string;
  body: string;
  idempotencyKey: string;
};

export type ApolloSendResult = {
  externalMessageId: string;
  acceptedAt: string;
  raw?: Record<string, unknown>;
};

export interface ApolloProvider {
  listMailboxes(): Promise<ApolloMailbox[]>;
  searchCompanies(input: CompanySearchInput): Promise<ApolloPage<ApolloCompany>>;
  searchPeople(input: PeopleSearchInput): Promise<ApolloPage<ApolloPerson>>;
  enrichCompany(companyId: string): Promise<{ company: ApolloCompany; creditsUsed: number }>;
  enrichPerson(personId: string): Promise<{ person: ApolloPerson; creditsUsed: number }>;
  findContact(person: ApolloPerson): Promise<{ contactId?: string }>;
  createContact(person: ApolloPerson): Promise<{ contactId: string }>;
  createList(name: string): Promise<{ listId: string }>;
  addContactToList(contactId: string, listId: string): Promise<void>;
  sendOneOffEmail(input: ApolloSendInput): Promise<ApolloSendResult>;
  getUsage(): Promise<{ creditsUsed: number; creditsRemaining?: number }>;
  disconnect(): Promise<void>;
}

export type ApolloErrorCode =
  | "APOLLO_REAUTHORIZATION_REQUIRED"
  | "APOLLO_CREDIT_BUDGET_REACHED"
  | "APOLLO_PERMISSION_DENIED"
  | "APOLLO_RATE_LIMITED"
  | "APOLLO_PLAN_UPGRADE_REQUIRED"
  | "APOLLO_TOOL_UNAVAILABLE"
  | "APOLLO_INVALID_RESPONSE"
  | "APOLLO_UNAVAILABLE";

export class ApolloError extends Error {
  constructor(
    public readonly code: ApolloErrorCode,
    message: string,
    public readonly retryable: boolean,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApolloError";
  }
}
