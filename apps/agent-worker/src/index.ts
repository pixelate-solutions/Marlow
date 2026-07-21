import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  CampaignOrchestrator,
  MockModelProvider,
  MuseSparkProvider,
  createDefaultToolRegistry,
} from "@marlow/agent";
import {
  ApolloError,
  ApolloMcpProvider,
  MockApolloProvider,
  type ApolloProvider,
} from "@marlow/apollo";
import { getSupabaseSecretKey, parseEnvironment } from "@marlow/config";
import {
  SupabaseAgentRepository,
  claimAgentJobs,
  decryptSecret,
  type AgentJob,
  type EncryptedSecret,
} from "@marlow/database";
import { MetaSearchGroundingProvider, MockResearchProvider } from "@marlow/research";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { log } from "./logger";
import { processSendJob } from "./send";

const environment = parseEnvironment(process.env, {
  requireProductionSecrets: true,
  runtime: "worker",
});
const supabaseSecretKey = getSupabaseSecretKey(environment);
if (!environment.NEXT_PUBLIC_SUPABASE_URL || !supabaseSecretKey) {
  throw new Error("Worker requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.");
}
const client = createClient(environment.NEXT_PUBLIC_SUPABASE_URL, supabaseSecretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const repository = new SupabaseAgentRepository(client);
const workerId = `worker-${randomUUID()}`;
const systemPrompt = await readFile(
  new URL("../../../packages/agent/prompts/outbound-agent.md", import.meta.url),
  "utf8",
);

async function loadApollo(organizationId: string): Promise<ApolloProvider> {
  if (environment.MOCK_INTEGRATIONS) return new MockApolloProvider();
  if (environment.WORKER_API_SECRET) {
    const response = await fetch(
      new URL("/api/internal/worker/apollo-access", environment.NEXT_PUBLIC_APP_URL),
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${environment.WORKER_API_SECRET}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ organizationId }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    const payload = (await response.json()) as {
      data?: { accessToken?: unknown };
      error?: { code?: unknown };
    };
    if (!response.ok) throw new Error(String(payload.error?.code ?? "APOLLO_NOT_CONNECTED"));
    const accessToken = payload.data?.accessToken;
    if (typeof accessToken !== "string" || !accessToken)
      throw new Error("APOLLO_REAUTHORIZATION_REQUIRED");
    return new ApolloMcpProvider({ url: environment.APOLLO_MCP_URL, accessToken });
  }
  if (!environment.ENCRYPTION_KEY) throw new Error("ENCRYPTION_KEY is required.");
  const { data, error } = await client
    .from("integrations")
    .select("status,integration_credentials(encrypted_payload,iv,auth_tag,key_version)")
    .eq("organization_id", organizationId)
    .eq("provider", "APOLLO")
    .single();
  if (error || data.status !== "CONNECTED") throw new Error("APOLLO_NOT_CONNECTED");
  const raw = Array.isArray(data.integration_credentials)
    ? data.integration_credentials[0]
    : data.integration_credentials;
  if (!raw) throw new Error("APOLLO_NOT_CONNECTED");
  const secret: EncryptedSecret = {
    ciphertext: String(raw.encrypted_payload),
    iv: String(raw.iv),
    authTag: String(raw.auth_tag),
    keyVersion: Number(raw.key_version),
  };
  let tokens: { accessToken?: string };
  try {
    tokens = JSON.parse(decryptSecret(secret, environment.ENCRYPTION_KEY)) as {
      accessToken?: string;
    };
  } catch {
    throw new Error("APOLLO_REAUTHORIZATION_REQUIRED");
  }
  if (!tokens.accessToken) throw new Error("APOLLO_REAUTHORIZATION_REQUIRED");
  return new ApolloMcpProvider({
    url: environment.APOLLO_MCP_URL,
    accessToken: tokens.accessToken,
  });
}

function createMockModel(): MockModelProvider {
  return new MockModelProvider({
    apollo_search_plan: {
      industries: ["Industrial automation", "Logistics"],
      companySizes: [{ min: 100, max: 1000 }],
      revenueRanges: [],
      geographies: ["United States"],
      technologies: [],
      keywords: ["operations"],
      buyingSignals: ["hiring"],
      jobFunctions: ["Operations"],
      titles: ["VP of Operations", "Chief Operating Officer"],
      seniorities: ["VP", "C-Suite"],
      exclusions: [],
    },
    account_qualification: {
      decisions: [
        {
          id: "apollo-company-1",
          qualified: true,
          reason: "Industrial operations account in the requested size range.",
        },
        {
          id: "apollo-company-2",
          qualified: true,
          reason: "Logistics operations account in the requested size range.",
        },
      ],
    },
    person_qualification: {
      decisions: [
        {
          id: "apollo-person-1",
          qualified: true,
          reason: "Senior operations leader responsible for the relevant workflow.",
        },
        {
          id: "apollo-person-2",
          qualified: true,
          reason: "Executive operations owner aligned with the target persona.",
        },
      ],
    },
    lead_relevance_assessment: {
      painPointRelevant: true,
      buyingSignalRelevant: true,
      reason: "Verified expansion evidence supports an active operational consistency need.",
    },
    outreach_draft: {
      subject: "Scaling operations",
      body: "Maya, I saw Acme is expanding its operations team. Northstar helps growing teams keep reporting consistent without replacing the tools they already use. Would comparing notes for 15 minutes next week be useful?",
      personalizationSummary: "Uses a verified hiring signal.",
      selectedAngle: "Operational consistency during growth.",
      qualificationSummary: "Strong account and persona fit.",
      supportingClaimIds: [],
      confidence: 90,
      complianceWarnings: [],
    },
    outreach_quality_review: {
      approved: true,
      findings: [],
      publicSummary: "Grounded, concise, and ready for review.",
    },
  });
}

async function processCampaignJob(job: AgentJob): Promise<void> {
  const runId = job.runId ?? String(job.payload.runId ?? "");
  if (!runId) throw new Error("CAMPAIGN_RUN job omitted runId.");
  const startedAt = new Date().toISOString();
  await client
    .from("agent_runs")
    .update({
      status: "RUNNING",
      started_at: startedAt,
      completed_at: null,
      heartbeat_at: startedAt,
      error_code: null,
      error_message: null,
    })
    .eq("id", runId);
  await client.from("agent_run_events").insert({
    agent_run_id: runId,
    organization_id: job.organizationId,
    campaign_id: job.campaignId,
    event_type: "RUN_STATUS",
    public_message: "A worker picked up the campaign.",
    data: { progress: "Prospecting is starting." },
  });

  const apollo = await loadApollo(job.organizationId);
  const model = environment.MOCK_INTEGRATIONS
    ? createMockModel()
    : new MuseSparkProvider({
        apiKey: environment.MODEL_API_KEY!,
        baseUrl: environment.META_MODEL_API_BASE_URL,
      });
  const research = environment.MOCK_INTEGRATIONS
    ? new MockResearchProvider()
    : new MetaSearchGroundingProvider({
        apiKey: environment.MODEL_API_KEY!,
        baseUrl: environment.META_MODEL_API_BASE_URL,
        modelId: environment.META_MODEL_ID,
      });
  try {
    const orchestrator = new CampaignOrchestrator({
      model,
      apollo,
      research,
      repository,
      policies: createDefaultToolRegistry(),
      systemPrompt,
      maxToolCalls: environment.AGENT_MAX_TOOL_CALLS,
      maxRunMinutes: environment.AGENT_MAX_RUN_MINUTES,
    });
    await orchestrator.run({ campaignId: job.campaignId, runId });
    await client
      .from("agent_runs")
      .update({
        status: "SUCCEEDED",
        completed_at: new Date().toISOString(),
        heartbeat_at: new Date().toISOString(),
      })
      .eq("id", runId);
  } finally {
    await apollo.disconnect();
  }
}

function publicCampaignError(error: unknown): string {
  if (error instanceof ApolloError) {
    if (error.code === "APOLLO_PLAN_UPGRADE_REQUIRED")
      return "Apollo plan upgrade required. Upgrade Apollo to a paid plan, then retry this campaign.";
    if (error.code === "APOLLO_TOOL_UNAVAILABLE")
      return "Apollo does not provide a search capability required by this campaign.";
    if (error.code === "APOLLO_REAUTHORIZATION_REQUIRED")
      return "Apollo authorization needs to be renewed. Reconnect Apollo before retrying.";
    if (error.code === "APOLLO_PERMISSION_DENIED")
      return "Apollo did not grant a capability required by this campaign.";
    if (error.code === "APOLLO_RATE_LIMITED")
      return "Apollo is temporarily rate limited. Marlow will retry automatically.";
    if (error.code === "APOLLO_CREDIT_BUDGET_REACHED")
      return "Apollo credits are unavailable for the next campaign operation.";
  }
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("APOLLO_NOT_CONNECTED"))
    return "Apollo is not connected. Reconnect Apollo before retrying this campaign.";
  if (message.includes("APOLLO_REAUTHORIZATION_REQUIRED"))
    return "Apollo authorization needs to be renewed. Reconnect Apollo before retrying.";
  if (message.includes("APOLLO_PERMISSION_DENIED"))
    return "Apollo did not grant a capability required by this campaign.";
  if (message.includes("APOLLO_PLAN_UPGRADE_REQUIRED"))
    return "Apollo plan upgrade required. Upgrade Apollo to a paid plan, then retry this campaign.";
  if (/timeout|timed out/i.test(message))
    return "A required service timed out. Marlow will retry automatically.";
  return "Marlow could not complete this campaign attempt.";
}

async function recordCampaignFailure(
  job: AgentJob,
  error: unknown,
  retryable: boolean,
): Promise<void> {
  if (job.type !== "CAMPAIGN_RUN") return;
  const runId = job.runId ?? String(job.payload.runId ?? "");
  if (!runId) return;
  const now = new Date().toISOString();
  const publicMessage = publicCampaignError(error);
  const results = await Promise.all([
    client
      .from("agent_runs")
      .update({
        status: retryable ? "WAITING" : "FAILED",
        heartbeat_at: now,
        completed_at: retryable ? null : now,
        error_code: retryable ? "RETRY_SCHEDULED" : "CAMPAIGN_RUN_FAILED",
        error_message: publicMessage,
      })
      .eq("id", runId),
    client
      .from("campaigns")
      .update({
        status: retryable ? "QUEUED" : "FAILED",
        status_changed_at: now,
      })
      .eq("id", job.campaignId)
      .is("deleted_at", null),
    client.from("agent_run_events").insert({
      agent_run_id: runId,
      organization_id: job.organizationId,
      campaign_id: job.campaignId,
      event_type: "RUN_STATUS",
      public_message: retryable ? "This attempt failed. A retry is scheduled." : publicMessage,
      data: {
        progress: retryable
          ? publicMessage
          : "Complete the required action, then select Retry campaign.",
        retryScheduled: retryable,
      },
    }),
  ]);
  const failure = results.find((result) => result.error)?.error;
  if (failure) throw new Error(failure.message);
}

async function markJob(
  job: AgentJob,
  status: "SUCCEEDED" | "RETRY" | "FAILED",
  error?: unknown,
): Promise<void> {
  const retry = status === "RETRY";
  const backoffSeconds = Math.min(300, 2 ** Math.max(1, job.attempts));
  await client
    .from("agent_jobs")
    .update({
      status,
      locked_at: null,
      locked_by: null,
      heartbeat_at: null,
      ...(retry ? { run_after: new Date(Date.now() + backoffSeconds * 1_000).toISOString() } : {}),
      ...(error ? { last_error: error instanceof Error ? error.message : String(error) } : {}),
    })
    .eq("id", job.id)
    .eq("status", "RUNNING");
}

async function processJob(job: AgentJob): Promise<void> {
  const started = performance.now();
  log("info", "Claimed durable job.", {
    agentRunId: job.runId,
    organizationId: job.organizationId,
    campaignId: job.campaignId,
    jobId: job.id,
    jobType: job.type,
    retryCount: job.attempts - 1,
  });
  try {
    if (job.type === "CAMPAIGN_RUN") await processCampaignJob(job);
    else if (job.type === "SEND_EMAIL") {
      if (!environment.ENCRYPTION_KEY && !environment.MOCK_INTEGRATIONS)
        throw new Error("ENCRYPTION_KEY is required.");
      await processSendJob({
        client,
        sendId: String(job.payload.sendId),
        encryptionKey: environment.ENCRYPTION_KEY ?? Buffer.alloc(32).toString("base64"),
        mcpUrl: environment.APOLLO_MCP_URL,
        oauth: {
          ...(environment.GOOGLE_OAUTH_CLIENT_ID
            ? { googleClientId: environment.GOOGLE_OAUTH_CLIENT_ID }
            : {}),
          ...(environment.GOOGLE_OAUTH_CLIENT_SECRET
            ? { googleClientSecret: environment.GOOGLE_OAUTH_CLIENT_SECRET }
            : {}),
          ...(environment.MICROSOFT_OAUTH_CLIENT_ID
            ? { microsoftClientId: environment.MICROSOFT_OAUTH_CLIENT_ID }
            : {}),
          ...(environment.MICROSOFT_OAUTH_CLIENT_SECRET
            ? { microsoftClientSecret: environment.MICROSOFT_OAUTH_CLIENT_SECRET }
            : {}),
          ...(environment.MICROSOFT_OAUTH_TENANT
            ? { microsoftTenant: environment.MICROSOFT_OAUTH_TENANT }
            : {}),
        },
        ...(environment.MOCK_INTEGRATIONS ? { mockApollo: new MockApolloProvider() } : {}),
      });
    }
    await markJob(job, "SUCCEEDED");
    log("info", "Durable job completed.", {
      agentRunId: job.runId,
      organizationId: job.organizationId,
      campaignId: job.campaignId,
      jobId: job.id,
      durationMs: Math.round(performance.now() - started),
    });
  } catch (error) {
    const retryable =
      job.attempts < 5 &&
      (error instanceof ApolloError
        ? error.retryable
        : !/APPROVAL_|SUPPRESSED|PERMISSION|CREDIT|DELIVERY_UNKNOWN|APOLLO_NOT_CONNECTED|APOLLO_REAUTHORIZATION_REQUIRED|APOLLO_PERMISSION_DENIED|APOLLO_PLAN_UPGRADE_REQUIRED|MAILBOX_NOT_AVAILABLE/.test(
            error instanceof Error ? error.message : String(error),
          ));
    try {
      await recordCampaignFailure(job, error, retryable);
    } catch (recordError) {
      log("error", "Campaign failure state could not be recorded.", {
        agentRunId: job.runId,
        campaignId: job.campaignId,
        error: recordError instanceof Error ? recordError.message : String(recordError),
      });
    }
    await markJob(job, retryable ? "RETRY" : "FAILED", error);
    log("error", "Durable job failed.", {
      agentRunId: job.runId,
      organizationId: job.organizationId,
      campaignId: job.campaignId,
      jobId: job.id,
      retryCount: job.attempts,
      durationMs: Math.round(performance.now() - started),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function poll(): Promise<void> {
  const jobs = await claimAgentJobs(
    client as SupabaseClient,
    workerId,
    environment.WORKER_CONCURRENCY,
  );
  await Promise.all(jobs.map(processJob));
}

log("info", "Marlow agent worker started.", {
  workerId,
  concurrency: environment.WORKER_CONCURRENCY,
  modelId: environment.MOCK_INTEGRATIONS ? "mock-muse-spark-1.1" : environment.META_MODEL_ID,
});
let stopping = false;
const shutdown = () => {
  stopping = true;
  log("info", "Worker shutdown requested; no new jobs will be claimed.");
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

while (!stopping) {
  try {
    await poll();
  } catch (error) {
    log("error", "Worker poll failed.", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  await new Promise((resolve) => setTimeout(resolve, 1_500));
}
