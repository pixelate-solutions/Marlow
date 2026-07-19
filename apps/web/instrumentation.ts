import { parseEnvironment } from "@marlow/config";

export function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.NODE_ENV === "production" &&
    process.env.NEXT_PHASE !== "phase-production-build"
  ) {
    parseEnvironment(process.env, { requireProductionSecrets: true, runtime: "web" });
  }
}
