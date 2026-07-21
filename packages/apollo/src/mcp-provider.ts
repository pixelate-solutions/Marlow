import { randomBytes } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { z } from "zod";
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
import { ApolloError } from "./types";

const toolAliases = {
  listMailboxes: [
    "apollo_email_accounts_index",
    "list_email_accounts",
    "email_accounts_list",
    "list_sending_accounts",
  ],
  searchCompanies: [
    "apollo_mixed_companies_search",
    "search_organizations",
    "organization_search",
    "search_companies",
  ],
  searchPeople: [
    "apollo_mixed_people_api_search",
    "search_people",
    "people_search",
    "search_contacts",
  ],
  enrichCompany: [
    "apollo_organizations_enrich",
    "enrich_organization",
    "organization_enrichment",
    "enrich_company",
  ],
  enrichPerson: ["apollo_people_match", "enrich_person", "people_enrichment", "person_enrichment"],
  findContact: ["apollo_contacts_search", "search_contacts", "find_contact", "contact_search"],
  createContact: ["apollo_contacts_create", "create_contact", "contact_create"],
  createList: ["apollo_labels_create", "create_list", "list_create"],
  addContactToList: ["add_contact_to_list", "list_add_contact"],
  sendOneOffEmail: ["send_email", "send_one_off_email", "email_send"],
  getUsage: ["apollo_usage_stats_credit_usage_stats", "get_usage", "usage", "credit_usage"],
} as const;

type Operation = keyof typeof toolAliases;

const contentSchema = z.object({
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })).default([]),
  structuredContent: z.unknown().optional(),
  isError: z.boolean().optional(),
});

function normalizeToolName(name: string): string {
  return name.toLowerCase().replace(/[.-]/g, "_");
}

export function parseToolPayload(result: unknown): unknown {
  const parsed = contentSchema.safeParse(result);
  if (!parsed.success)
    throw new ApolloError(
      "APOLLO_INVALID_RESPONSE",
      "Apollo returned an invalid MCP response.",
      false,
    );
  if (parsed.data.isError) {
    const text = parsed.data.content.map((item) => item.text ?? "").join(" ");
    throw classifyApolloError(text);
  }
  if (parsed.data.structuredContent !== undefined) {
    const payload = record(parsed.data.structuredContent);
    const errorCode = optionalString(payload.error_code);
    const message =
      optionalString(payload.error) ?? (errorCode ? optionalString(payload.message) : undefined);
    if (message) throw classifyApolloError(message, errorCode);
    return parsed.data.structuredContent;
  }
  const text = parsed.data.content.find((item) => item.type === "text")?.text;
  if (!text) return {};
  let payload: unknown;
  try {
    payload = JSON.parse(text) as unknown;
  } catch {
    return { text };
  }
  const data = record(payload);
  const errorCode = optionalString(data.error_code);
  const message =
    optionalString(data.error) ?? (errorCode ? optionalString(data.message) : undefined);
  if (message) throw classifyApolloError(message, errorCode);
  return payload;
}

function classifyApolloError(message: string, errorCode?: string): ApolloError {
  const lower = message.toLowerCase();
  if (
    errorCode === "API_INACCESSIBLE" ||
    (/free plan|paid plan|upgrade/.test(lower) && /api|search/.test(lower))
  ) {
    return new ApolloError(
      "APOLLO_PLAN_UPGRADE_REQUIRED",
      "APOLLO_PLAN_UPGRADE_REQUIRED: Apollo search requires a paid plan.",
      false,
    );
  }
  if (/oauth|unauthoriz|token|reauthor/.test(lower)) {
    return new ApolloError(
      "APOLLO_REAUTHORIZATION_REQUIRED",
      "Apollo authorization has expired.",
      false,
    );
  }
  if (/credit|quota|limit exceeded/.test(lower)) {
    return new ApolloError(
      "APOLLO_CREDIT_BUDGET_REACHED",
      "Apollo credit limit was reached.",
      false,
    );
  }
  if (/permission|forbidden|scope/.test(lower)) {
    return new ApolloError("APOLLO_PERMISSION_DENIED", "Apollo denied this operation.", false);
  }
  if (/429|rate limit/.test(lower)) {
    return new ApolloError("APOLLO_RATE_LIMITED", "Apollo rate limit was reached.", true);
  }
  return new ApolloError("APOLLO_UNAVAILABLE", "Apollo could not complete the operation.", true);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function pageFromCursor(cursor?: string): number {
  const parsed = Number.parseInt(cursor ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function employeeRange(value: { min?: number | undefined; max?: number | undefined }): string {
  return `${value.min ?? 1},${value.max ?? 1_000_000}`;
}

function nextPage(payload: Record<string, unknown>): string | undefined {
  const pagination = record(payload.pagination);
  const page = optionalNumber(pagination.page ?? payload.page);
  const totalPages = optionalNumber(pagination.total_pages ?? payload.total_pages);
  return page !== undefined && totalPages !== undefined && page < totalPages
    ? String(page + 1)
    : undefined;
}

function cursorFromPayload(payload: Record<string, unknown>): string | undefined {
  return (
    optionalString(payload.next_cursor ?? record(payload.pagination).next_cursor) ??
    nextPage(payload)
  );
}

export function companySearchArguments(input: CompanySearchInput): Record<string, unknown> {
  const revenue = input.revenueRanges[0];
  return {
    ...([...input.industries, ...input.keywords].length > 0
      ? { q_organization_keyword_tags: [...input.industries, ...input.keywords] }
      : {}),
    ...(input.locations.length > 0 ? { organization_locations: input.locations } : {}),
    ...(input.employeeRanges.length > 0
      ? { organization_num_employees_ranges: input.employeeRanges.map(employeeRange) }
      : {}),
    ...(input.technologies.length > 0
      ? {
          currently_using_any_of_technology_uids: input.technologies.map((technology) =>
            technology.toLowerCase().replace(/[ .]+/g, "_"),
          ),
        }
      : {}),
    ...(revenue
      ? {
          revenue_range: {
            ...(revenue.min !== undefined ? { min: revenue.min } : {}),
            ...(revenue.max !== undefined ? { max: revenue.max } : {}),
          },
        }
      : {}),
    per_page: input.pageSize,
    page: pageFromCursor(input.cursor),
    _rationale: "Find companies matching the approved campaign criteria.",
  };
}

export function peopleSearchArguments(input: PeopleSearchInput): Record<string, unknown> {
  return {
    organization_ids: input.companyIds,
    ...(input.jobFunctions.length > 0 ? { q_keywords: input.jobFunctions.join(" ") } : {}),
    ...(input.titles.length > 0 ? { person_titles: input.titles } : {}),
    include_similar_titles: true,
    ...(input.seniorities.length > 0
      ? {
          person_seniorities: input.seniorities.map((seniority) =>
            seniority.toLowerCase().replace(/[ -]+/g, "_"),
          ),
        }
      : {}),
    ...(input.locations.length > 0 ? { person_locations: input.locations } : {}),
    per_page: input.pageSize,
    page: pageFromCursor(input.cursor),
    _rationale: "Find people matching the approved campaign criteria.",
  };
}

function mapCompany(value: unknown): ApolloCompany {
  const row = record(value);
  const id = optionalString(row.id ?? row.organization_id);
  const name = optionalString(row.name);
  const domain = optionalString(row.domain ?? row.primary_domain);
  if (!id || !name || !domain)
    throw new ApolloError(
      "APOLLO_INVALID_RESPONSE",
      "Apollo company response omitted required fields.",
      false,
    );
  return {
    id,
    name,
    domain,
    ...(optionalString(row.website_url) ? { websiteUrl: String(row.website_url) } : {}),
    ...(optionalString(row.industry) ? { industry: String(row.industry) } : {}),
    ...(optionalNumber(row.estimated_num_employees ?? row.employee_count) !== undefined
      ? { employeeCount: Number(row.estimated_num_employees ?? row.employee_count) }
      : {}),
    ...(optionalNumber(row.estimated_annual_revenue ?? row.revenue) !== undefined
      ? { estimatedRevenue: Number(row.estimated_annual_revenue ?? row.revenue) }
      : {}),
    ...(optionalString(row.location) ? { location: String(row.location) } : {}),
    technologies: list(row.technologies).filter((item): item is string => typeof item === "string"),
    keywords: list(row.keywords).filter((item): item is string => typeof item === "string"),
  };
}

function mapPerson(value: unknown): ApolloPerson {
  const row = record(value);
  const personId = optionalString(row.person_id ?? row.id);
  const companyId = optionalString(
    row.organization_id ?? row.company_id ?? record(row.organization).id,
  );
  const firstName = optionalString(row.first_name);
  const lastName = optionalString(row.last_name);
  const title = optionalString(row.title);
  if (!personId || !companyId || !firstName || !lastName || !title) {
    throw new ApolloError(
      "APOLLO_INVALID_RESPONSE",
      "Apollo person response omitted required fields.",
      false,
    );
  }
  const emailStatus = optionalString(row.email_status);
  return {
    personId,
    companyId,
    firstName,
    lastName,
    title,
    ...(optionalString(row.contact_id) ? { contactId: String(row.contact_id) } : {}),
    ...(optionalString(row.email) ? { email: String(row.email).toLowerCase() } : {}),
    ...(emailStatus && ["verified", "likely", "unverified", "unavailable"].includes(emailStatus)
      ? { emailStatus: emailStatus as NonNullable<ApolloPerson["emailStatus"]> }
      : {}),
    ...(optionalString(row.linkedin_url) ? { linkedinUrl: String(row.linkedin_url) } : {}),
    ...(optionalString(row.location) ? { location: String(row.location) } : {}),
  };
}

export class ApolloMcpProvider implements ApolloProvider {
  private client: Client | undefined;
  private toolNames: Map<Operation, string> | undefined;
  private readonly conversationRef = randomBytes(8).toString("hex");

  constructor(
    private readonly options: {
      url: string;
      accessToken: string;
      clientName?: string;
      clientVersion?: string;
    },
  ) {}

  private async connect(): Promise<Client> {
    if (this.client) return this.client;
    const client = new Client({
      name: this.options.clientName ?? "marlow-agent",
      version: this.options.clientVersion ?? "0.1.0",
    });
    const transport = new StreamableHTTPClientTransport(new URL(this.options.url), {
      requestInit: { headers: { Authorization: `Bearer ${this.options.accessToken}` } },
    });
    try {
      await client.connect(transport as unknown as Parameters<Client["connect"]>[0]);
      const available = await client.listTools();
      const tools = new Map(
        available.tools.map((tool) => [normalizeToolName(tool.name), tool.name]),
      );
      this.toolNames = new Map();
      for (const [operation, aliases] of Object.entries(toolAliases) as Array<
        [Operation, readonly string[]]
      >) {
        const match = aliases.map(normalizeToolName).find((alias) => tools.has(alias));
        if (match) this.toolNames.set(operation, tools.get(match)!);
      }
      this.client = client;
      return client;
    } catch (error) {
      throw classifyApolloError(error instanceof Error ? error.message : String(error));
    }
  }

  private async call(operation: Operation, args: Record<string, unknown>): Promise<unknown> {
    const client = await this.connect();
    const toolName = this.toolNames?.get(operation);
    if (!toolName)
      throw new ApolloError(
        "APOLLO_TOOL_UNAVAILABLE",
        `Apollo does not expose the ${operation} capability.`,
        false,
      );
    try {
      return parseToolPayload(
        await client.callTool({
          name: toolName,
          arguments: { ...args, _conversation_ref: this.conversationRef },
        }),
      );
    } catch (error) {
      if (error instanceof ApolloError) throw error;
      throw classifyApolloError(error instanceof Error ? error.message : String(error));
    }
  }

  async listMailboxes(): Promise<ApolloMailbox[]> {
    const payload = record(await this.call("listMailboxes", {}));
    return list(payload.email_accounts ?? payload.mailboxes ?? payload.items).flatMap((item) => {
      const row = record(item);
      const id = optionalString(row.id);
      const email = optionalString(row.email);
      if (!id || !email) return [];
      const status = optionalString(row.status);
      return [
        {
          id,
          email,
          displayName: optionalString(row.name ?? row.display_name) ?? email,
          status: status === "paused" || status === "disconnected" ? status : "available",
          ...(optionalNumber(row.daily_limit) !== undefined
            ? { dailyLimit: Number(row.daily_limit) }
            : {}),
        } satisfies ApolloMailbox,
      ];
    });
  }

  async searchCompanies(input: CompanySearchInput): Promise<ApolloPage<ApolloCompany>> {
    const payload = record(await this.call("searchCompanies", companySearchArguments(input)));
    const items = list(payload.organizations ?? payload.companies ?? payload.items).map(mapCompany);
    const nextCursor = cursorFromPayload(payload);
    return {
      items,
      ...(nextCursor ? { nextCursor } : {}),
      ...(optionalNumber(payload.estimated_credits) !== undefined
        ? { estimatedCredits: Number(payload.estimated_credits) }
        : {}),
      ...(optionalNumber(payload.credits_used) !== undefined
        ? { actualCredits: Number(payload.credits_used) }
        : {}),
    };
  }

  async searchPeople(input: PeopleSearchInput): Promise<ApolloPage<ApolloPerson>> {
    const payload = record(await this.call("searchPeople", peopleSearchArguments(input)));
    const items = list(payload.people ?? payload.contacts ?? payload.items).map(mapPerson);
    const nextCursor = cursorFromPayload(payload);
    return {
      items,
      ...(nextCursor ? { nextCursor } : {}),
      ...(optionalNumber(payload.estimated_credits) !== undefined
        ? { estimatedCredits: Number(payload.estimated_credits) }
        : {}),
      ...(optionalNumber(payload.credits_used) !== undefined
        ? { actualCredits: Number(payload.credits_used) }
        : {}),
    };
  }

  async enrichCompany(companyId: string): Promise<{ company: ApolloCompany; creditsUsed: number }> {
    const payload = record(await this.call("enrichCompany", { organization_id: companyId }));
    return {
      company: mapCompany(payload.organization ?? payload.company ?? payload),
      creditsUsed: optionalNumber(payload.credits_used) ?? 0,
    };
  }

  async enrichPerson(personId: string): Promise<{ person: ApolloPerson; creditsUsed: number }> {
    const payload = record(
      await this.call("enrichPerson", {
        id: personId,
        _rationale: "Complete the approved prospect record with a work email.",
      }),
    );
    return {
      person: mapPerson(payload.person ?? payload),
      creditsUsed: optionalNumber(payload.credits_used) ?? 0,
    };
  }

  async findContact(person: ApolloPerson): Promise<{ contactId?: string }> {
    const payload = record(
      await this.call("findContact", { person_id: person.personId, email: person.email }),
    );
    const contactId = optionalString(payload.contact_id ?? record(payload.contact).id);
    return contactId ? { contactId } : {};
  }

  async createContact(person: ApolloPerson): Promise<{ contactId: string }> {
    const payload = record(
      await this.call("createContact", { person_id: person.personId, email: person.email }),
    );
    const contactId = optionalString(payload.contact_id ?? record(payload.contact).id);
    if (!contactId)
      throw new ApolloError(
        "APOLLO_INVALID_RESPONSE",
        "Apollo did not return a contact ID.",
        false,
      );
    return { contactId };
  }

  async createList(name: string): Promise<{ listId: string }> {
    const payload = record(await this.call("createList", { name }));
    const listId = optionalString(payload.list_id ?? record(payload.list).id);
    if (!listId)
      throw new ApolloError("APOLLO_INVALID_RESPONSE", "Apollo did not return a list ID.", false);
    return { listId };
  }

  async addContactToList(contactId: string, listId: string): Promise<void> {
    await this.call("addContactToList", { contact_id: contactId, list_id: listId });
  }

  async sendOneOffEmail(input: ApolloSendInput): Promise<ApolloSendResult> {
    const payload = record(
      await this.call("sendOneOffEmail", {
        email_account_id: input.mailboxId,
        to: input.recipientEmail,
        subject: input.subject,
        body: input.body,
        idempotency_key: input.idempotencyKey,
      }),
    );
    const externalMessageId = optionalString(
      payload.message_id ?? payload.id ?? record(payload.message).id,
    );
    if (!externalMessageId)
      throw new ApolloError(
        "APOLLO_INVALID_RESPONSE",
        "Apollo did not confirm the message ID.",
        false,
      );
    return { externalMessageId, acceptedAt: new Date().toISOString(), raw: payload };
  }

  async getUsage(): Promise<{ creditsUsed: number; creditsRemaining?: number }> {
    const payload = record(await this.call("getUsage", {}));
    return {
      creditsUsed: optionalNumber(payload.credits_used) ?? 0,
      ...(optionalNumber(payload.credits_remaining) !== undefined
        ? { creditsRemaining: Number(payload.credits_remaining) }
        : {}),
    };
  }

  async disconnect(): Promise<void> {
    await this.client?.close();
    this.client = undefined;
    this.toolNames = undefined;
  }
}
