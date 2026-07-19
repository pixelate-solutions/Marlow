import { MODEL } from "@marlow/shared";
import { z } from "zod";

const booleanFromString = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);
const optionalString = z.preprocess(emptyToUndefined, z.string().min(1).optional());
const optionalUrl = z.preprocess(emptyToUndefined, z.url().optional());

const baseSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_URL: optionalUrl,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: optionalString,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalString,
  SUPABASE_SECRET_KEY: optionalString,
  SUPABASE_SERVICE_ROLE_KEY: optionalString,
  SUPABASE_JWKS_URL: optionalUrl,
  DATABASE_URL: optionalString,
  MODEL_API_KEY: optionalString,
  META_MODEL_API_BASE_URL: z.url().default(MODEL.baseUrl),
  META_MODEL_ID: z.literal(MODEL.id).default(MODEL.id),
  APOLLO_MCP_URL: z.url().default("https://mcp.apollo.io/mcp"),
  APOLLO_API_KEY: optionalString,
  APOLLO_OAUTH_CLIENT_ID: optionalString,
  APOLLO_OAUTH_CLIENT_SECRET: optionalString,
  APOLLO_OAUTH_REDIRECT_URI: optionalUrl,
  GOOGLE_OAUTH_CLIENT_ID: optionalString,
  GOOGLE_OAUTH_CLIENT_SECRET: optionalString,
  GOOGLE_OAUTH_REDIRECT_URI: optionalUrl,
  MICROSOFT_OAUTH_CLIENT_ID: optionalString,
  MICROSOFT_OAUTH_CLIENT_SECRET: optionalString,
  MICROSOFT_OAUTH_REDIRECT_URI: optionalUrl,
  MICROSOFT_OAUTH_TENANT: optionalString,
  ENCRYPTION_KEY: z.preprocess(emptyToUndefined, z.string().min(32).optional()),
  APPROVAL_SIGNING_SECRET: z.preprocess(emptyToUndefined, z.string().min(32).optional()),
  CRON_SECRET: z.preprocess(emptyToUndefined, z.string().min(16).optional()),
  WEB_SEARCH_PROVIDER: z.enum(["meta", "mock"]).default("meta"),
  WEB_SEARCH_API_KEY: optionalString,
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(3),
  AGENT_MAX_TOOL_CALLS: z.coerce.number().int().min(1).max(100).default(40),
  AGENT_MAX_RUN_MINUTES: z.coerce.number().int().min(1).max(120).default(20),
  DEFAULT_DAILY_SEND_LIMIT: z.coerce.number().int().min(1).max(500).default(25),
  DEFAULT_APOLLO_CREDIT_BUDGET: z.coerce.number().int().min(0).default(100),
  MOCK_INTEGRATIONS: booleanFromString,
  DEMO_MODE: booleanFromString,
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type AppEnvironment = z.infer<typeof baseSchema>;

export type AppRuntime = "web" | "worker" | "all";

export function getSupabasePublishableKey(
  environment: Pick<
    AppEnvironment,
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" | "NEXT_PUBLIC_SUPABASE_ANON_KEY"
  >,
): string | undefined {
  return (
    environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? environment.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export function getSupabaseSecretKey(
  environment: Pick<AppEnvironment, "SUPABASE_SECRET_KEY" | "SUPABASE_SERVICE_ROLE_KEY">,
): string | undefined {
  return environment.SUPABASE_SECRET_KEY ?? environment.SUPABASE_SERVICE_ROLE_KEY;
}

function missingProductionVariables(environment: AppEnvironment, runtime: AppRuntime): string[] {
  const missing: string[] = [];
  if (!environment.NEXT_PUBLIC_SUPABASE_URL) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!getSupabaseSecretKey(environment)) {
    missing.push("SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY)");
  }
  if (!environment.MODEL_API_KEY) missing.push("MODEL_API_KEY");
  if (!environment.ENCRYPTION_KEY) missing.push("ENCRYPTION_KEY");
  if ((runtime === "web" || runtime === "all") && !getSupabasePublishableKey(environment)) {
    missing.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or legacy NEXT_PUBLIC_SUPABASE_ANON_KEY)");
  }
  if ((runtime === "web" || runtime === "all") && !environment.APPROVAL_SIGNING_SECRET) {
    missing.push("APPROVAL_SIGNING_SECRET");
  }
  if ((runtime === "web" || runtime === "all") && !environment.CRON_SECRET) {
    missing.push("CRON_SECRET");
  }
  return missing;
}

export function parseEnvironment(
  input: Record<string, string | undefined> = process.env,
  options: { requireProductionSecrets?: boolean; runtime?: AppRuntime } = {},
): AppEnvironment {
  const parsed = baseSchema.parse(input);
  if (
    options.requireProductionSecrets &&
    parsed.NODE_ENV === "production" &&
    !parsed.MOCK_INTEGRATIONS
  ) {
    const missing = missingProductionVariables(parsed, options.runtime ?? "all");
    if (missing.length > 0) {
      throw new Error(`Missing required production environment variables: ${missing.join(", ")}`);
    }
  }
  if (parsed.NODE_ENV === "production" && (parsed.MOCK_INTEGRATIONS || parsed.DEMO_MODE)) {
    throw new Error("MOCK_INTEGRATIONS and DEMO_MODE may not be enabled in production.");
  }
  return parsed;
}
