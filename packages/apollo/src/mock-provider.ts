import type {
  ApolloCompany,
  ApolloMailbox,
  ApolloPage,
  ApolloPerson,
  ApolloProvider,
  ApolloSendInput,
  ApolloSendResult,
  CompanySearchInput,
  PeopleSearchInput,
} from "./types";

const companies: ApolloCompany[] = [
  {
    id: "apollo-company-1",
    name: "Acme Automation",
    domain: "acme.example",
    websiteUrl: "https://acme.example",
    industry: "Industrial automation",
    employeeCount: 420,
    location: "Detroit, MI",
    technologies: ["Salesforce", "Snowflake"],
    keywords: ["manufacturing", "operations"],
  },
  {
    id: "apollo-company-2",
    name: "Brightline Logistics",
    domain: "brightline.example",
    websiteUrl: "https://brightline.example",
    industry: "Logistics",
    employeeCount: 780,
    location: "Chicago, IL",
    technologies: ["HubSpot"],
    keywords: ["logistics", "warehouse"],
  },
];

const people: ApolloPerson[] = [
  {
    personId: "apollo-person-1",
    companyId: "apollo-company-1",
    firstName: "Maya",
    lastName: "Chen",
    title: "VP of Operations",
    email: "maya@acme.example",
    emailStatus: "verified",
    location: "Detroit, MI",
  },
  {
    personId: "apollo-person-2",
    companyId: "apollo-company-2",
    firstName: "Jon",
    lastName: "Bell",
    title: "Chief Operating Officer",
    email: "jon@brightline.example",
    emailStatus: "verified",
    location: "Chicago, IL",
  },
];

export class MockApolloProvider implements ApolloProvider {
  readonly sends = new Map<string, ApolloSendResult>();
  sendInvocationCount = 0;

  async listMailboxes(): Promise<ApolloMailbox[]> {
    return [
      {
        id: "demo-mailbox",
        email: "alex@northstar.example",
        displayName: "Alex Morgan",
        status: "available",
        dailyLimit: 25,
      },
    ];
  }

  async searchCompanies(input: CompanySearchInput): Promise<ApolloPage<ApolloCompany>> {
    const offset = input.cursor ? Number(input.cursor) : 0;
    const items = companies.slice(offset, offset + Math.max(1, input.pageSize));
    const next = offset + items.length;
    return {
      items,
      ...(next < companies.length ? { nextCursor: String(next) } : {}),
      estimatedCredits: 0,
      actualCredits: 0,
    };
  }

  async searchPeople(input: PeopleSearchInput): Promise<ApolloPage<ApolloPerson>> {
    const matching = people.filter((person) => input.companyIds.includes(person.companyId));
    const offset = input.cursor ? Number(input.cursor) : 0;
    const items = matching.slice(offset, offset + Math.max(1, input.pageSize));
    const next = offset + items.length;
    return {
      items,
      ...(next < matching.length ? { nextCursor: String(next) } : {}),
      estimatedCredits: 0,
      actualCredits: 0,
    };
  }

  async enrichCompany(companyId: string): Promise<{ company: ApolloCompany; creditsUsed: number }> {
    const company = companies.find((item) => item.id === companyId);
    if (!company) throw new Error("Unknown demo company.");
    return { company, creditsUsed: 1 };
  }

  async enrichPerson(personId: string): Promise<{ person: ApolloPerson; creditsUsed: number }> {
    const person = people.find((item) => item.personId === personId);
    if (!person) throw new Error("Unknown demo person.");
    return { person, creditsUsed: 1 };
  }

  async findContact(person: ApolloPerson): Promise<{ contactId?: string }> {
    return person.contactId ? { contactId: person.contactId } : {};
  }

  async createContact(person: ApolloPerson): Promise<{ contactId: string }> {
    return { contactId: `contact-${person.personId}` };
  }

  async createList(name: string): Promise<{ listId: string }> {
    return { listId: `list-${name.toLowerCase().replace(/\W+/g, "-")}` };
  }

  async addContactToList(): Promise<void> {}

  async sendOneOffEmail(input: ApolloSendInput): Promise<ApolloSendResult> {
    const existing = this.sends.get(input.idempotencyKey);
    if (existing) return existing;
    this.sendInvocationCount += 1;
    const result = {
      externalMessageId: `mock-message-${this.sendInvocationCount}`,
      acceptedAt: new Date().toISOString(),
    };
    this.sends.set(input.idempotencyKey, result);
    return result;
  }

  async getUsage(): Promise<{ creditsUsed: number; creditsRemaining?: number }> {
    return { creditsUsed: 12, creditsRemaining: 88 };
  }

  async disconnect(): Promise<void> {}
}
