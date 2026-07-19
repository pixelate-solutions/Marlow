import { AppError } from "@marlow/shared";

export type ToolPolicy = {
  readOnly: boolean;
  creditConsuming: boolean;
  externalSideEffect: boolean;
  sendCapable: boolean;
  requiresApproval: boolean;
};

export type ToolContext = {
  actor: "model" | "worker" | "approval-gate";
  campaignPaused: boolean;
  creditsRemaining: number;
  validApproval: boolean;
};

export class ToolPolicyRegistry {
  private readonly policies = new Map<string, ToolPolicy>();

  register(name: string, policy: ToolPolicy): void {
    if (this.policies.has(name)) throw new Error(`Tool ${name} is already registered.`);
    this.policies.set(name, policy);
  }

  get(name: string): ToolPolicy {
    const policy = this.policies.get(name);
    if (!policy)
      throw new AppError("INSUFFICIENT_PERMISSION", `Unknown tool ${name} is denied.`, 403);
    return policy;
  }

  authorize(name: string, context: ToolContext): ToolPolicy {
    const policy = this.get(name);
    if (context.campaignPaused && !policy.readOnly)
      throw new AppError("INSUFFICIENT_PERMISSION", "Campaign is paused.", 409);
    if (policy.creditConsuming && context.creditsRemaining <= 0)
      throw new AppError("APOLLO_CREDIT_BUDGET_REACHED", "Apollo credit budget is exhausted.", 409);
    if (policy.sendCapable && context.actor !== "approval-gate")
      throw new AppError(
        "INSUFFICIENT_PERMISSION",
        "The model and worker cannot invoke send-capable tools directly.",
        403,
      );
    if (policy.requiresApproval && !context.validApproval)
      throw new AppError("APPROVAL_MISMATCH", "A valid one-time approval is required.", 409);
    return policy;
  }
}

export function createDefaultToolRegistry(): ToolPolicyRegistry {
  const registry = new ToolPolicyRegistry();
  const readOnly = {
    readOnly: true,
    creditConsuming: false,
    externalSideEffect: false,
    sendCapable: false,
    requiresApproval: false,
  };
  registry.register("web.search", readOnly);
  registry.register("web.fetch", readOnly);
  registry.register("database.read_campaign", readOnly);
  registry.register("database.get_suppressions", readOnly);
  registry.register("calculator.calculate", readOnly);
  registry.register("apollo.search_companies", readOnly);
  registry.register("apollo.search_people", readOnly);
  registry.register("apollo.enrich_company", { ...readOnly, creditConsuming: true });
  registry.register("apollo.enrich_person", { ...readOnly, creditConsuming: true });
  registry.register("database.save_campaign_profile", { ...readOnly, readOnly: false });
  registry.register("database.save_prospect", { ...readOnly, readOnly: false });
  registry.register("database.save_research", { ...readOnly, readOnly: false });
  registry.register("database.save_draft", { ...readOnly, readOnly: false });
  registry.register("apollo.create_contact", {
    readOnly: false,
    creditConsuming: false,
    externalSideEffect: true,
    sendCapable: false,
    requiresApproval: false,
  });
  registry.register("apollo.send_one_off_email", {
    readOnly: false,
    creditConsuming: false,
    externalSideEffect: true,
    sendCapable: true,
    requiresApproval: true,
  });
  return registry;
}
